// Where everything is, on any screen.
//
// DEEPER was built at a fixed 480x270. A phone held upright is 2.16:1, and letterboxing a
// 16:9 strip into the middle of that throws away three quarters of the display and shrinks
// the DIG button to four millimetres. So the render resolution is now derived from the box
// the page was actually given, and this module is the single source of truth for it:
//   - the virtual resolution (config.VW / config.VH)
//   - the sub-rect of the canvas that shows the world (config.VIEW)
//   - the control deck, and every touch control inside it
//
// Three rules keep this honest:
//   1. Sizes a THUMB has to hit are declared in CSS pixels and converted, so a button is the
//      same number of millimetres on every device. Sizes an EYE has to read are declared in
//      virtual pixels, so the art keeps its proportions.
//   2. The scale is an integer number of DEVICE pixels per virtual pixel. Pixel art upscaled
//      by 2.6 has some rows two device pixels tall and some three, and the shimmer that
//      produces is the single most common way a pixel game looks cheap on a phone.
//   3. Drawing and hit-testing read the same table. A control that moves, moves in both.

import { TS, setViewport } from '../config.js';

// Physical sizes, in CSS px. A CSS px is about 0.26mm, so DIG is a 28mm disc and the small
// buttons are 13mm — comfortably above the 9mm floor for a thumb.
const PHYS = {
  digR: 54,
  jumpR: 32,
  smallR: 25,
  padR: 66,
  padDead: 14,
  gap: 12,
  edge: 8,
};

const WANT = {
  // How much world to show. Portrait is measured across because that is the axis a phone is
  // short in; landscape is measured down because 270 is what the game was tuned at.
  portraitVW: 13 * TS,      // 208 virtual px, about 13 tiles
  landscapeVH: 270,
  landscapeVHTouch: 240,   // a thumb screen wants the world nearer, not wider
  minVW: 176, maxVW: 680,
  minVH: 220, maxVH: 640,
  minCssScale: 1.0,         // never smaller than one CSS px per virtual px
  maxCssScale: 2.9,         // and never so zoomed that a tablet shows less than a phone
  deckMaxFrac: 0.33,        // the deck may not eat more than a third of a short screen
};

export const L = {
  cssW: 0, cssH: 0,          // the canvas box, CSS px
  cssX: 0, cssY: 0,          // its offset inside the wrap
  scale: 1,                  // CSS px per virtual px
  k: 1,                      // DEVICE px per virtual px — an integer, on purpose
  dpr: 1,
  portrait: false,
  coarse: false,             // a touch device: controls are drawn, the HUD dodges thumbs
  framed: false,             // desktop presentation: centred 16:9 with a shadow
  vw: 480, vh: 270,
  deck: 0,                   // virtual px of control deck along the bottom (0 = overlay)
  view: { x: 0, y: 0, w: 480, h: 270 },
  safe: { t: 0, r: 0, b: 0, l: 0 },
  controls: [],              // hit-testable, in virtual coords
  pad: null,
};

/** CSS px -> virtual px. Use for anything a finger touches. */
export function vpx(css) { return css / L.scale; }

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * Recompute everything from the box the page was given.
 *   boxW, boxH  CSS px available
 *   safeCss     {t,r,b,l} safe-area insets in CSS px
 *   coarse      true when the primary pointer is a finger
 *   framed      true to keep the desktop 16:9 presentation
 *   dprIn       window.devicePixelRatio
 */
export function computeLayout(boxW, boxH, safeCss, coarse, framed, dprIn) {
  boxW = Math.max(200, Math.round(boxW));
  boxH = Math.max(160, Math.round(boxH));
  const dpr = clamp(dprIn || 1, 1, 4);
  const portrait = boxH > boxW * 1.06;

  let vw, vh, k, cssW = boxW, cssH = boxH, cssX = 0, cssY = 0;

  if (framed) {
    // Desktop: the game keeps the shape it was designed in, centred, at the biggest scale
    // that fits. Nothing about a mouse and a 27-inch monitor needs a responsive viewport.
    vw = 480; vh = 270;
    let s = Math.min(boxW / vw, boxH / vh);
    const istep = Math.floor(s);
    if (istep >= 1 && vh * istep >= boxH * 0.8) s = istep;
    cssW = Math.round(vw * s); cssH = Math.round(vh * s);
    cssX = Math.round((boxW - cssW) / 2); cssY = Math.round((boxH - cssH) / 2);
    k = Math.max(1, Math.round(s * dpr));
  } else {
    // Pick an INTEGER number of device pixels per virtual pixel, from whichever axis carries
    // the zoom, then let both virtual dimensions fall out of it. Every virtual pixel is then
    // exactly k device pixels square, on any screen.
    const devW = boxW * dpr, devH = boxH * dpr;
    const landH = coarse ? WANT.landscapeVHTouch : WANT.landscapeVH;
    const want = portrait ? devW / WANT.portraitVW : devH / landH;
    const kMin = Math.max(1, Math.ceil(WANT.minCssScale * dpr));
    const kMax = Math.max(kMin, Math.floor(WANT.maxCssScale * dpr));
    k = clamp(Math.round(want), kMin, kMax);
    vw = Math.round(devW / k);
    vh = Math.round(devH / k);
    // Guard rails, in case a very odd box makes the derived size unusable.
    if (vw > WANT.maxVW || vh > WANT.maxVH) {
      k = Math.min(kMax, Math.max(k + 1, Math.ceil(Math.max(devW / WANT.maxVW, devH / WANT.maxVH))));
      vw = Math.round(devW / k); vh = Math.round(devH / k);
    }
    vw = clamp(vw, WANT.minVW, WANT.maxVW);
    vh = clamp(vh, WANT.minVH, WANT.maxVH);
  }

  const scale = cssW / vw;
  const safe = {
    t: Math.round(safeCss.t / scale), r: Math.round(safeCss.r / scale),
    b: Math.round(safeCss.b / scale), l: Math.round(safeCss.l / scale),
  };

  // Portrait phones get a real control deck: thumbs never cover the rock they are breaking,
  // which matters more here than in most games because you are aiming at a specific tile and
  // reading its texture for a clue. Landscape has no height to spare, so controls overlay.
  const deckMode = coarse && portrait;
  const controls = coarse ? buildControls(vw, vh, safe, scale, deckMode) : [];
  const deck = deckMode ? controls.deck : 0;

  L.cssW = cssW; L.cssH = cssH; L.cssX = cssX; L.cssY = cssY;
  L.scale = scale; L.k = k; L.dpr = dpr;
  L.portrait = portrait; L.coarse = coarse; L.framed = framed;
  L.vw = vw; L.vh = vh; L.deck = deck; L.safe = safe;
  L.view = { x: 0, y: 0, w: vw, h: vh - deck };
  L.controls = controls.length ? Array.from(controls) : [];
  L.pad = L.controls.find(c => c.id === 'pad') || null;

  setViewport(vw, vh, L.view, safe);
  return L;
}

/**
 * Every touch control, in virtual coords, sized from PHYS so it stays the same physical size.
 * Returns an array carrying a .deck property: the deck's height in virtual px.
 *
 * The deck is measured from its contents rather than from a fraction of the screen, because a
 * button that does not fit is a button that cannot be pressed. If the contents will not fit in
 * a third of a short screen, everything shrinks together instead of overlapping.
 */
function buildControls(vw, vh, safe, scale, deckMode) {
  const R = (css) => Math.max(8, Math.round(css / scale));
  let digR = R(PHYS.digR), jumpR = R(PHYS.jumpR), smR = R(PHYS.smallR);
  let padR = R(PHYS.padR), gap = R(PHYS.gap), edge = R(PHYS.edge);

  const rowR = () => Math.max(padR, digR);
  const needed = () => smR * 2 + gap + rowR() * 2 + edge * 2;

  let deck = 0;
  if (deckMode) {
    const cap = Math.floor(vh * WANT.deckMaxFrac) - safe.b;
    if (needed() > cap) {
      const f = Math.max(0.55, cap / needed());
      digR = Math.max(20, Math.round(digR * f)); jumpR = Math.max(13, Math.round(jumpR * f));
      smR = Math.max(10, Math.round(smR * f));   padR = Math.max(20, Math.round(padR * f));
      gap = Math.max(3, Math.round(gap * f));    edge = Math.max(3, Math.round(edge * f));
    }
    deck = needed() + safe.b;
  }

  const c = [];
  const L_ = safe.l + edge, Rt = vw - safe.r - edge;

  if (deckMode) {
    // ── portrait: a real control deck under the world ─────────────────────
    // A strip of small verbs along the top of the deck, then the main row: the pad under the
    // left thumb, DIG under the right, JUMP where the right thumb rolls inward to reach it.
    const top = vh - deck;
    const stripY = top + edge + smR;
    const rowY = top + edge + smR * 2 + gap + rowR();

    c.push({ id: 'dim', kind: 'btn', action: 'dim', label: 'DIM', x: L_ + smR, y: stripY, r: smR, ghost: true });
    c.push({ id: 'pause', kind: 'btn', action: 'pause', label: 'II', x: L_ + smR * 3 + gap, y: stripY, r: smR, ghost: true });
    c.push({ id: 'use', kind: 'btn', action: 'interact', label: 'USE', x: Rt - smR, y: stripY, r: smR, on: false });
    c.push({ id: 'util', kind: 'btn', action: 'util', label: 'BLAST', x: Rt - smR * 3 - gap, y: stripY, r: smR });
    c.push({ id: 'sonar', kind: 'btn', action: 'sonar', label: 'PING', x: Rt - smR * 5 - gap * 2, y: stripY, r: smR });

    c.push({ id: 'pad', kind: 'pad', x: L_ + padR, y: rowY, r: padR, dead: R(PHYS.padDead) });
    c.push({ id: 'jump', kind: 'btn', action: 'jump', label: 'JUMP', x: Rt - digR * 2 - jumpR - gap, y: rowY, r: jumpR });
    c.push({ id: 'dig', kind: 'btn', action: 'dig', label: 'DIG', x: Rt - digR, y: rowY, r: digR, big: true });
  } else {
    // ── landscape: translucent controls over the world ────────────────────
    const bot = vh - safe.b - edge;
    const padCY = bot - padR, digCY = bot - digR;
    const digCX = Rt - digR;
    c.push({ id: 'pad', kind: 'pad', x: L_ + padR, y: padCY, r: padR, dead: R(PHYS.padDead) });
    c.push({ id: 'jump', kind: 'btn', action: 'jump', label: 'JUMP', x: digCX - digR - jumpR - gap, y: digCY, r: jumpR });
    c.push({ id: 'use', kind: 'btn', action: 'interact', label: 'USE', x: digCX, y: digCY - digR - smR - gap, r: smR, on: false });
    c.push({ id: 'util', kind: 'btn', action: 'util', label: 'BLAST', x: digCX - digR - jumpR - gap, y: digCY - jumpR - smR - gap, r: smR });
    c.push({ id: 'sonar', kind: 'btn', action: 'sonar', label: 'PING', x: digCX - digR - jumpR - smR * 3 - gap * 2, y: digCY - jumpR - smR - gap, r: smR });
    c.push({ id: 'dig', kind: 'btn', action: 'dig', label: 'DIG', x: digCX, y: digCY, r: digR, big: true });
    // Both top corners belong to the HUD — health and lantern on the left, depth and the haul
    // on the right — so the two utility buttons stack above the pad instead, where the left
    // thumb already is and nothing is drawn.
    const utilY = Math.max(safe.t + edge + smR, padCY - padR - smR - gap);
    c.push({ id: 'dim', kind: 'btn', action: 'dim', label: 'DIM', x: L_ + smR, y: utilY, r: smR, ghost: true });
    c.push({ id: 'pause', kind: 'btn', action: 'pause', label: 'II', x: L_ + smR * 3 + gap, y: utilY, r: smR, ghost: true });
  }
  c.deck = deck;
  return c;
}

/** The control under a point, or null. Contextual buttons with on === false are invisible. */
export function hitControl(x, y) {
  for (const b of L.controls) {
    if (b.on === false) continue;
    const dx = x - b.x, dy = y - b.y;
    // A little forgiveness on the round buttons: a thumb lands where it looks, not where it is.
    const r = b.r + (b.kind === 'btn' ? 3 : 0);
    if (dx * dx + dy * dy <= r * r) return b;
  }
  return null;
}

export function control(id) {
  for (const b of L.controls) if (b.id === id) return b;
  return null;
}

/** Debug aid: any two controls that overlap is a bug you cannot see in a screenshot. */
export function overlaps() {
  const bad = [];
  for (let i = 0; i < L.controls.length; i++) {
    for (let j = i + 1; j < L.controls.length; j++) {
      const a = L.controls[i], b = L.controls[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < a.r + b.r - 1) bad.push(a.id + '/' + b.id + ' by ' + Math.round(a.r + b.r - d));
    }
  }
  return bad;
}
