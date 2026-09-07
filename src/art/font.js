// DEEPER — the ONE text renderer.
//
// A hand-authored 5x7 bitmap font. Glyph box is 5 wide x 7 tall:
//   rows 0..5  = the cap-height band (baseline is row 5)
//   row  6     = descender row ONLY (g j p q y, and the tails of , ; _ |)
// Lowercase has real lowercase shapes on an x-height of rows 2..5 — small-caps read as
// SHOUTING, and DEEPER's HUD whispers most of the time.
//
// Glyphs are variable width: fully-empty leading/trailing columns are trimmed at bake time
// and a 1px advance gap is added between glyphs. That is why '.', ',', ':', 'i', 'l' and '!'
// come out 1-2px wide — proportional spacing is the single biggest thing that makes pixel
// text look typeset rather than like a spreadsheet.
//
// CURRENCY: DEEPER writes gold as a leading capital G ("G1,240"), exactly like the HUD reads
// it aloud in the designer's head. There is therefore NO dedicated currency glyph — one less
// ambiguous 5px shape to squint at, and 'G' is already the most legible letter in the set.
//
// Rendering: glyph masks are baked ONCE into a white-on-transparent atlas strip (lazily, on
// the first draw — nothing touches the DOM at module scope). Coloured text is drawn from a
// per-colour tinted copy of that strip, so a glyph costs exactly one drawImage. We never
// fillRect per pixel at draw time.

import { P } from './pal.js';

export const FONT_H = 7;

const GLYPH_W = 5;          // authoring box width
const SPACE_W = 2;          // + the 1px advance gap == the 3px space advance in the spec
const LINE_GAP = 2;         // extra px between baselines when a string contains '\n'
const TINT_CAP = 24;        // colours kept as pre-tinted atlases before we evict the oldest
const EMPTY = {};          // shared no-opts object; keeps the draw path allocation-free

// ---------------------------------------------------------------------------------------
// The glyphs. Every entry is exactly 7 strings of exactly 5 characters. 'X' is ink.
// ---------------------------------------------------------------------------------------

const GLYPHS = {
  // ---- uppercase: 5 wide, 6 tall (rows 0..5) ----
  'A': ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', '.....'],
  'B': ['XXXX.', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.', '.....'],
  'C': ['.XXX.', 'X...X', 'X....', 'X....', 'X...X', '.XXX.', '.....'],
  'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.', '.....'],
  'E': ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX', '.....'],
  'F': ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....', 'X....', '.....'],
  // G keeps its spur (row 3) so it can never be misread as 6, which has an open top-left.
  'G': ['.XXX.', 'X...X', 'X....', 'X..XX', 'X...X', '.XXX.', '.....'],
  'H': ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X', '.....'],
  'I': ['.XXX.', '..X..', '..X..', '..X..', '..X..', '.XXX.', '.....'],
  'J': ['...XX', '....X', '....X', '....X', 'X...X', '.XXX.', '.....'],
  'K': ['X...X', 'X..X.', 'X.X..', 'XXX..', 'X..X.', 'X...X', '.....'],
  'L': ['X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX', '.....'],
  // M's inner vee drops TWO rows; N's diagonal crosses the whole box. That is the only
  // reliable way to keep M/N/W apart at 1x.
  'M': ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', '.....'],
  'N': ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', '.....'],
  'O': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.', '.....'],
  'P': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', '.....'],
  'Q': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X..X.', '.XX.X', '.....'],
  'R': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X..X.', 'X...X', '.....'],
  // S is rounded at BOTH ends; 5 has a square full-width top bar and a flat shoulder.
  'S': ['.XXXX', 'X....', '.XXX.', '....X', 'X...X', '.XXX.', '.....'],
  'T': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '.....'],
  'U': ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.', '.....'],
  'V': ['X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..', '.....'],
  'W': ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', '.X.X.', '.....'],
  'X': ['X...X', '.X.X.', '..X..', '..X..', '.X.X.', 'X...X', '.....'],
  'Y': ['X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..', '.....'],
  'Z': ['XXXXX', '....X', '...X.', '..X..', '.X...', 'XXXXX', '.....'],

  // ---- lowercase: x-height rows 2..5, ascenders from row 0, descenders into row 6 ----
  // 'a' carries a straight right stem and a foot that spurs past the bowl, so it cannot
  // collapse into 'o'.
  'a': ['.....', '.....', '.XXX.', 'X..X.', 'X..X.', '.XXXX', '.....'],
  'b': ['X....', 'X....', 'XXXX.', 'X...X', 'X...X', 'XXXX.', '.....'],
  'c': ['.....', '.....', '.XXXX', 'X....', 'X....', '.XXXX', '.....'],
  'd': ['....X', '....X', '.XXXX', 'X...X', 'X...X', '.XXXX', '.....'],
  // 'e' gets a full crossbar and an open bottom-right terminal — the two things 'c' lacks.
  'e': ['.....', '.....', '.XXX.', 'X...X', 'XXXX.', '.XXXX', '.....'],
  'f': ['..XX.', '.X...', 'XXX..', '.X...', '.X...', '.X...', '.....'],
  'g': ['.....', '.....', '.XXX.', 'X...X', '.XXXX', '....X', 'XXXX.'],
  'h': ['X....', 'X....', 'XXXX.', 'X...X', 'X...X', 'X...X', '.....'],
  'i': ['.X...', '.....', '.X...', '.X...', '.X...', '.XX..', '.....'],
  'j': ['..X..', '.....', '..X..', '..X..', '..X..', '..X..', 'XX...'],
  'k': ['X....', 'X....', 'X..X.', 'XXX..', 'X.X..', 'X..X.', '.....'],
  'l': ['.X...', '.X...', '.X...', '.X...', '.X...', '.XX..', '.....'],
  'm': ['.....', '.....', 'XXXXX', 'X.X.X', 'X.X.X', 'X.X.X', '.....'],
  'n': ['.....', '.....', 'XXXX.', 'X...X', 'X...X', 'X...X', '.....'],
  'o': ['.....', '.....', '.XXX.', 'X...X', 'X...X', '.XXX.', '.....'],
  'p': ['.....', '.....', 'XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....'],
  'q': ['.....', '.....', '.XXXX', 'X...X', 'X...X', '.XXXX', '....X'],
  'r': ['.....', '.....', 'X.XX.', 'XX...', 'X....', 'X....', '.....'],
  's': ['.....', '.....', '.XXXX', 'XX...', '...XX', 'XXXX.', '.....'],
  't': ['.X...', '.X...', 'XXXX.', '.X...', '.X...', '..XX.', '.....'],
  'u': ['.....', '.....', 'X...X', 'X...X', 'X...X', '.XXXX', '.....'],
  'v': ['.....', '.....', 'X...X', 'X...X', '.X.X.', '..X..', '.....'],
  'w': ['.....', '.....', 'X...X', 'X.X.X', 'X.X.X', '.X.X.', '.....'],
  // With only four rows a thin 'x' reads as ")(" — the 2x2 crossing block is the fix.
  'x': ['.....', '.....', 'X..X.', '.XX..', '.XX..', 'X..X.', '.....'],
  'y': ['.....', '.....', 'X...X', 'X...X', '.XXXX', '....X', 'XXXX.'],
  'z': ['.....', '.....', 'XXXXX', '...X.', '.X...', 'XXXXX', '.....'],

  // ---- digits ----
  // 0 is slashed so it can never be read as O in a depth or gold readout.
  '0': ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', '.XXX.', '.....'],
  '1': ['..X..', '.XX..', '..X..', '..X..', '..X..', '.XXX.', '.....'],
  '2': ['.XXX.', 'X...X', '....X', '..XX.', '.X...', 'XXXXX', '.....'],
  '3': ['XXXX.', '....X', '.XXX.', '....X', 'X...X', '.XXX.', '.....'],
  '4': ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '.....'],
  '5': ['XXXXX', 'X....', 'XXXX.', '....X', 'X...X', '.XXX.', '.....'],
  '6': ['..XX.', '.X...', 'XXXX.', 'X...X', 'X...X', '.XXX.', '.....'],
  '7': ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.....'],
  // 8 closes on the LEFT at every row; B keeps a flat stem. That is the whole difference.
  '8': ['.XXX.', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.', '.....'],
  '9': ['.XXX.', 'X...X', 'X...X', '.XXXX', '...X.', '.XX..', '.....'],

  // ---- punctuation ----
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '!': ['.X...', '.X...', '.X...', '.X...', '.....', '.X...', '.....'],
  '"': ['X.X..', 'X.X..', '.....', '.....', '.....', '.....', '.....'],
  '#': ['.....', '.X.X.', 'XXXXX', '.X.X.', 'XXXXX', '.X.X.', '.....'],
  '$': ['..X..', '.XXXX', 'X.X..', '.XXX.', '..X.X', 'XXXX.', '.....'],
  '%': ['XX..X', 'XX.X.', '...X.', '..X..', '.X.XX', 'X..XX', '.....'],
  '&': ['.XX..', 'X..X.', '.XX..', 'X..X.', 'X..X.', '.XX.X', '.....'],
  "'": ['.X...', '.X...', '.....', '.....', '.....', '.....', '.....'],
  '(': ['..X..', '.X...', '.X...', '.X...', '.X...', '..X..', '.....'],
  ')': ['.X...', '..X..', '..X..', '..X..', '..X..', '.X...', '.....'],
  '*': ['..X..', 'X.X.X', '.XXX.', 'X.X.X', '..X..', '.....', '.....'],
  '+': ['.....', '.....', '..X..', 'XXXXX', '..X..', '.....', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.X...', 'X....'],
  '-': ['.....', '.....', '.....', '.XXX.', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', 'X....', '.....'],
  '/': ['....X', '...X.', '...X.', '..X..', '.X...', 'X....', '.....'],
  '\\': ['X....', '.X...', '.X...', '..X..', '...X.', '....X', '.....'],
  // Colon dots sit at rows 3 and 5, not 2 and 5: two blank rows between them read as two
  // separate periods rather than one mark.
  ':': ['.....', '.....', '.....', 'X....', '.....', 'X....', '.....'],
  ';': ['.....', '.....', '.....', '.X...', '.....', '.X...', 'X....'],
  '<': ['.....', '...X.', '..X..', '.X...', '..X..', '...X.', '.....'],
  '=': ['.....', '.....', 'XXXXX', '.....', 'XXXXX', '.....', '.....'],
  '>': ['.....', '.X...', '..X..', '...X.', '..X..', '.X...', '.....'],
  '?': ['.XXX.', 'X...X', '...X.', '..X..', '.....', '..X..', '.....'],
  '@': ['.XXX.', 'X...X', 'X.XXX', 'X.X.X', 'X.XX.', '.XXX.', '.....'],
  '[': ['.XXX.', '.X...', '.X...', '.X...', '.X...', '.XXX.', '.....'],
  ']': ['.XXX.', '...X.', '...X.', '...X.', '...X.', '.XXX.', '.....'],
  '^': ['..X..', '.X.X.', 'X...X', '.....', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', 'XXXXX'],
  '`': ['X....', '.X...', '.....', '.....', '.....', '.....', '.....'],
  '{': ['..XX.', '..X..', '.X...', '..X..', '..X..', '..XX.', '.....'],
  // The pipe runs the FULL 7 rows on purpose: it is the HUD's field separator and wants to
  // out-reach the letters on either side of it.
  '|': ['..X..', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  '}': ['.XX..', '..X..', '...X.', '..X..', '..X..', '.XX..', '.....'],
  '~': ['.....', '.....', '.XX..', 'X..XX', '.....', '.....', '.....'],

  // ---- symbols the UI actually speaks in: direction, list, life ----
  '↑': ['..X..', '.XXX.', 'XXXXX', '..X..', '..X..', '..X..', '.....'], // up
  '↓': ['..X..', '..X..', '..X..', 'XXXXX', '.XXX.', '..X..', '.....'], // down
  '←': ['.....', '..X..', '.XX..', 'XXXXX', '.XX..', '..X..', '.....'], // left
  '→': ['.....', '..X..', '..XX.', 'XXXXX', '..XX.', '..X..', '.....'], // right
  '•': ['.....', '.....', '.....', '.XX..', '.XX..', '.....', '.....'], // bullet
  '♥': ['.....', 'XX.XX', 'XXXXX', 'XXXXX', '.XXX.', '..X..', '.....'], // heart
};

// Anything we do not know renders as a hollow box. Never crash, always visibly wrong.
const TOFU = ['XXXXX', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXXX', '.....'];

// ---------------------------------------------------------------------------------------
// Metrics (pure arithmetic — safe in Node, no canvas required for measure/wrap)
// ---------------------------------------------------------------------------------------

/** char -> { rows, w, x0, sx, blank } */
const METRICS = new Map();
let TOFU_METRIC = null;
let metricsReady = false;
let atlasW = 0;

function trimBounds(rows) {
  let x0 = GLYPH_W, x1 = -1;
  for (let y = 0; y < FONT_H; y++) {
    const r = rows[y];
    for (let x = 0; x < GLYPH_W; x++) {
      if (r.charCodeAt(x) === 88 /* 'X' */) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  return x1 < x0 ? [0, 0] : [x0, x1 - x0 + 1];
}

function buildMetrics() {
  if (metricsReady) return;
  let cursor = 0;
  const add = (ch, rows) => {
    const b = trimBounds(rows);
    let w = b[1];
    let blank = w === 0;
    // A blank glyph has no ink to trim, so the space advance is declared, not measured.
    if (blank) w = ch === ' ' ? SPACE_W : SPACE_W;
    const m = { rows, w, x0: b[0], sx: cursor, blank };
    if (!blank) cursor += w + 1;   // 1px guard column so neighbours cannot bleed on upscale
    return m;
  };
  for (const ch in GLYPHS) METRICS.set(ch, add(ch, GLYPHS[ch]));
  TOFU_METRIC = add(' ', TOFU);
  // A tab is a wide space, not a box — pasting text with tabs should not look broken.
  METRICS.set('\t', { rows: GLYPHS[' '], w: SPACE_W * 3, x0: 0, sx: 0, blank: true });
  atlasW = cursor;
  metricsReady = true;
}

function metricOf(ch) {
  if (!metricsReady) buildMetrics();
  const m = METRICS.get(ch);
  return m === undefined ? TOFU_METRIC : m;
}

// ---------------------------------------------------------------------------------------
// Atlas (lazy — first draw only; nothing here runs at import time)
// ---------------------------------------------------------------------------------------

let atlas = null;
const tintCache = new Map();   // colour -> tinted canvas, insertion-ordered so the first
                               // key is always the oldest

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

function blitGlyph(g, m) {
  if (m.blank) return;
  for (let y = 0; y < FONT_H; y++) {
    const row = m.rows[y];
    let run = -1;
    // Coalesce horizontal runs so a solid row is one fillRect instead of five. This is a
    // one-time bake cost, but the atlas is rebuilt whenever the page reloads while tuning.
    for (let x = 0; x <= m.w; x++) {
      const on = x < m.w && row.charCodeAt(m.x0 + x) === 88;
      if (on && run < 0) run = x;
      else if (!on && run >= 0) { g.fillRect(m.sx + run, y, x - run, 1); run = -1; }
    }
  }
}

function ensureAtlas() {
  if (atlas) return atlas;
  buildMetrics();
  atlas = makeCanvas(Math.max(1, atlasW), FONT_H);
  const g = atlas.getContext('2d');
  g.fillStyle = '#ffffff';
  for (const m of METRICS.values()) blitGlyph(g, m);
  blitGlyph(g, TOFU_METRIC);
  return atlas;
}

function tinted(color) {
  const hit = tintCache.get(color);
  if (hit) return hit;
  const src = ensureAtlas();
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  if (tintCache.size >= TINT_CAP) tintCache.delete(tintCache.keys().next().value);
  tintCache.set(color, c);
  return c;
}

// ---------------------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------------------

/** Unscaled width of str[from..to) — no allocation, used per line by the draw path. */
function runWidth(str, from, to, spacing) {
  let w = 0, n = 0;
  for (let i = from; i < to; i++) {
    if (n > 0) w += spacing;
    w += metricOf(str[i]).w;
    n++;
  }
  return w;
}

/** Width in px of `str` at `scale`. Honours '\n' by returning the widest line. */
export function measure(str, scale = 1, spacing = 1) {
  if (str === null || str === undefined) return 0;
  const s = typeof str === 'string' ? str : String(str);
  buildMetrics();
  let best = 0, i = 0;
  while (i <= s.length) {
    let j = i;
    while (j < s.length && s[j] !== '\n') j++;
    const w = runWidth(s, i, j, spacing);
    if (w > best) best = w;
    if (j >= s.length) break;
    i = j + 1;
  }
  return best * scale;
}

/**
 * Greedy word wrap. Splits on spaces and honours existing '\n'.
 * A single word wider than maxWidth is hard-broken rather than allowed to overflow —
 * a HUD line that runs off the edge is worse than an ugly break.
 */
export function wrap(str, maxWidth, scale = 1, spacing = 1) {
  const s = str === null || str === undefined ? '' : String(str);
  const out = [];
  const paras = s.split('\n');
  for (let p = 0; p < paras.length; p++) {
    const words = paras[p].split(' ');
    let line = '';
    for (let wi = 0; wi < words.length; wi++) {
      let word = words[wi];
      // Hard-break an over-long word first, emitting whole lines as we go.
      while (measure(word, scale, spacing) > maxWidth && word.length > 1) {
        let cut = 1;
        while (cut < word.length && measure(word.slice(0, cut + 1), scale, spacing) <= maxWidth) cut++;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const cand = line ? line + ' ' + word : word;
      if (line && measure(cand, scale, spacing) > maxWidth) { out.push(line); line = word; }
      else line = cand;
    }
    out.push(line);
  }
  return out;
}

/** Truncate with a trailing ellipsis so the result fits maxWidth. Allocates only on overflow. */
function fit(str, maxWidth, scale, spacing) {
  if (!maxWidth || maxWidth <= 0) return str;
  if (measure(str, scale, spacing) <= maxWidth) return str;
  const ell = '...';
  const ellW = runWidth(ell, 0, 3, spacing) * scale;
  const gap = spacing * scale;
  let w = 0, n = 0, keep = 0;
  for (let i = 0; i < str.length; i++) {
    const adv = (n > 0 ? spacing : 0) + metricOf(str[i]).w;
    if ((w + adv) * scale + gap + ellW > maxWidth) break;
    w += adv; n++; keep = i + 1;
  }
  return str.slice(0, keep) + ell;
}

// ---------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------

/**
 * The single draw path. Kept parameterised (not opts-object) so `text` and `textShadowed`
 * can both call it without allocating a temporary options object every frame.
 */
function drawRun(g, s, x, y, color, scale, align, alpha, spacing, wave, waveSpeed, t) {
  const img = tinted(color);
  const oldAlpha = g.globalAlpha;
  if (alpha !== 1) g.globalAlpha = oldAlpha * alpha;

  const lineH = (FONT_H + LINE_GAP) * scale;
  let widest = 0, i = 0, lineTop = y;

  while (i <= s.length) {
    let j = i;
    while (j < s.length && s[j] !== '\n') j++;

    const lw = runWidth(s, i, j, spacing) * scale;
    if (lw > widest) widest = lw;

    let px = x;
    if (align === 'center') px = x - lw * 0.5;
    else if (align === 'right') px = x - lw;

    let gi = 0;
    for (let k = i; k < j; k++) {
      const m = metricOf(s[k]);
      if (!m.blank) {
        let dy = lineTop;
        // Per-glyph sine offset: the discovery banner "breathes" instead of sitting inert.
        if (wave) dy += Math.round(Math.sin(t * waveSpeed + gi) * wave * scale);
        g.drawImage(img, m.sx, 0, m.w, FONT_H,
                    Math.round(px), Math.round(dy), m.w * scale, FONT_H * scale);
      }
      px += (m.w + spacing) * scale;
      gi++;
    }

    if (j >= s.length) break;
    i = j + 1;
    lineTop += lineH;
  }

  if (alpha !== 1) g.globalAlpha = oldAlpha;
  return widest;
}

/**
 * Draw text. (x, y) is the TOP-LEFT of the text box — y is the top of the cap band —
 * unless `align` moves the horizontal anchor to the centre or the right edge.
 *
 * opts = { color, scale, align:'left'|'center'|'right', shadow:false|true|'#hex',
 *          alpha, spacing, maxWidth, wave, waveSpeed, t }
 * Returns the width actually drawn, in px.
 */
export function text(g, str, x, y, opts) {
  if (str === null || str === undefined) return 0;
  let s = typeof str === 'string' ? str : String(str);
  if (s.length === 0) return 0;
  buildMetrics();

  const o = opts || EMPTY;
  const color = o.color || P.UI_WHITE;
  const scale = o.scale || 1;
  const align = o.align || 'left';
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const spacing = o.spacing === undefined ? 1 : o.spacing;
  const wave = o.wave || 0;
  const waveSpeed = o.waveSpeed === undefined ? 6 : o.waveSpeed;
  const t = o.t || 0;

  if (o.maxWidth) s = fit(s, o.maxWidth, scale, spacing);

  const shadow = o.shadow;
  if (shadow) {
    // 1px scale-aware drop shadow. P.INK rather than pure black: the world is never pure
    // black either, and a slightly violet shadow keeps the HUD in the game's colour space.
    const sc = typeof shadow === 'string' ? shadow : P.INK;
    drawRun(g, s, x + scale, y + scale, sc, scale, align, alpha, spacing, wave, waveSpeed, t);
  }
  return drawRun(g, s, x, y, color, scale, align, alpha, spacing, wave, waveSpeed, t);
}

/** Convenience: text with a drop shadow already on. `opts` may still override anything. */
export function textShadowed(g, str, x, y, color, opts) {
  if (str === null || str === undefined) return 0;
  let s = typeof str === 'string' ? str : String(str);
  if (s.length === 0) return 0;
  buildMetrics();

  const o = opts || EMPTY;
  const col = color || o.color || P.UI_WHITE;
  const scale = o.scale || 1;
  const align = o.align || 'left';
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const spacing = o.spacing === undefined ? 1 : o.spacing;
  const wave = o.wave || 0;
  const waveSpeed = o.waveSpeed === undefined ? 6 : o.waveSpeed;
  const t = o.t || 0;
  const sc = typeof o.shadow === 'string' ? o.shadow : P.INK;

  if (o.maxWidth) s = fit(s, o.maxWidth, scale, spacing);

  drawRun(g, s, x + scale, y + scale, sc, scale, align, alpha, spacing, wave, waveSpeed, t);
  return drawRun(g, s, x, y, col, scale, align, alpha, spacing, wave, waveSpeed, t);
}
