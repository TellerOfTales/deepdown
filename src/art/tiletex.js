// Procedural tile textures, baked ONCE into a single atlas canvas at boot.
//
// GDD §20: "Materials are identified by SHAPE first, TEXTURE second, COLOUR third."
// So every material gets its OWN generator with its own shape language — a player squinting
// at a greyscale screenshot must still be able to name the rock. Hue is the last cue, not
// the first. That is why nothing here is "the same noise in a different colour".
//
// Everything is plotted by hand into a 16x16 ImageData scratch buffer and blitted with a
// single putImageData per cell. No canvas gradients, no paths, no arcs: those anti-alias,
// and a half-lit pixel is the fastest way to make a pixel game look like a mockup.
//
// Layers, drawn in this order by the tile renderer:
//   face(tileId, variant)  ->  edge(openMask)  ->  deco(clueId, variant)  ->  crack(stage)
// Faces are fully opaque. The other three are mostly transparent and use a handful of
// alpha levels only.

import { P, RAMPS, hexRGB } from './pal.js';
import { T, D } from '../world/tiles.js';
import { Rand, hashf, fbm2, clamp } from '../core/rng.js';
import { TS } from '../config.js';

export const VARIANTS = 4;

const CS = TS;                       // 16 — cell size == tile size
const TILE_COUNT = 19;               // T.AIR .. T.SUPPORT
const DECO_COUNT = 11;               // D.FLECK_FAINT .. D.HEAT
const COLS = 16;

const FACE_BASE  = 0;
const CRACK_BASE = FACE_BASE + TILE_COUNT * VARIANTS;    // 76
const DECO_BASE  = CRACK_BASE + 3;                       // 79
const EDGE_BASE  = DECO_BASE + DECO_COUNT * VARIANTS;    // 123
const CELL_COUNT = EDGE_BASE + 16;                       // 139 cells -> 256x144 canvas

// Per-material hash salt. Same tile id + same (x,y) must always pick the same variant,
// and two materials must never share a variant pattern.
const SALT = 0x51ce;

// ─────────────────────────────────────────────────────────────────────────────
// pixel plumbing
// ─────────────────────────────────────────────────────────────────────────────

let D8 = null;                       // Uint8ClampedArray of the 16x16 scratch ImageData

const _cc = new Map();
/** hex -> cached [r,g,b]. Colours come from pal.js; derived shades are computed, never typed. */
function C(hex) {
  let v = _cc.get(hex);
  if (!v) { v = hexRGB(hex); _cc.set(hex, v); }
  return v;
}
/** Blend two palette colours. Used instead of inventing a hex. */
function mix(a, b, t) {
  const A = C(a), B = C(b);
  return [Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t)];
}
/** Push a colour toward green. The MIMIC tell — too small to notice, big enough to learn. */
function greener(hex, amt) {
  const c = C(hex);
  return [clamp(Math.round(c[0] * (1 - 0.10 * amt)), 0, 255),
    clamp(Math.round(c[1] * (1 + 0.06 * amt)), 0, 255),
    clamp(Math.round(c[2] * (1 - 0.34 * amt)), 0, 255)];
}

function clearCell() { D8.fill(0); }

function px(x, y, c) {
  if (x < 0 || y < 0 || x > 15 || y > 15) return;
  const i = ((y << 4) + x) << 2;
  D8[i] = c[0]; D8[i + 1] = c[1]; D8[i + 2] = c[2]; D8[i + 3] = 255;
}
/** Source-over into the scratch buffer (non-premultiplied). Overlays only. */
function pxa(x, y, c, a) {
  if (x < 0 || y < 0 || x > 15 || y > 15 || a <= 0) return;
  if (a >= 1) { px(x, y, c); return; }
  const i = ((y << 4) + x) << 2;
  const da = D8[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0.0001) { D8[i + 3] = 0; return; }
  D8[i] = Math.round((c[0] * a + D8[i] * da * (1 - a)) / oa);
  D8[i + 1] = Math.round((c[1] * a + D8[i + 1] * da * (1 - a)) / oa);
  D8[i + 2] = Math.round((c[2] * a + D8[i + 2] * da * (1 - a)) / oa);
  D8[i + 3] = Math.round(oa * 255);
}
function getA(x, y) {
  if (x < 0 || y < 0 || x > 15 || y > 15) return 255;
  return D8[(((y << 4) + x) << 2) + 3];
}

function fillCell(c) { for (let i = 0; i < 256; i++) { const j = i << 2; D8[j] = c[0]; D8[j + 1] = c[1]; D8[j + 2] = c[2]; D8[j + 3] = 255; } }
function hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) px(x, y, c); }
function vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) px(x, y, c); }
function rectF(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); }

function lineP(x0, y0, x1, y1, c, a) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 64; guard++) {
    if (a === undefined) px(x0, y0, c); else pxa(x0, y0, c, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = err << 1;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function disc(cx, cy, r, c) {
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(15, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(15, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r2) px(x, y, c);
  }
}
function ellipse(cx, cy, rx, ry, c) {
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(15, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(15, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1) px(x, y, c);
  }
}
/** Soft-edged blob: interior solid, rim dithered. Reads organic without anti-aliasing. */
function blob(cx, cy, r, c, salt) {
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(15, Math.ceil(cy + r + 1));
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(15, Math.ceil(cx + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= r - 0.7) px(x, y, c);
    else if (d <= r + 0.7 && hashf(x, y, salt) < 0.55) px(x, y, c);
  }
}

// Overlays have to read on near-black bedrock AND on pale granite. INK is too close in
// value to most rock to survive, and ROCK6 is too close to be a highlight, so every
// fissure is authored as "void core + near-white lip" — a pairing that reads on both.
const LIP = mix(P.ROCK6, P.UI_WHITE, 0.55);

const DIRX = [1, 1, 0, -1, -1, -1, 0, 1];
const DIRY = [0, 1, 1, 1, 0, -1, -1, -1];

const OWN = new Int32Array(256);     // reusable voronoi ownership scratch
const MARK = new Uint8Array(256);    // reusable "is vein / is fissure" mask

// ─────────────────────────────────────────────────────────────────────────────
// FACE GENERATORS — one shape language each
// ─────────────────────────────────────────────────────────────────────────────

/** Dark host matrix shared by the ore-bearing rocks so their silhouettes stay comparable. */
function hostRock(r, ramp, salt) {
  fillCell(C(ramp[1]));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hashf(x, y, salt);
    if (n < 0.16) px(x, y, C(ramp[0]));
    else if (n > 0.90) px(x, y, C(ramp[2]));
  }
  for (let i = 0; i < 5; i++) blob(r.f(0, 15), r.f(0, 15), r.f(1.6, 3.2), C(ramp[0]), salt + i * 31);
}

/** DIRT — clumped organic blobs, soft edges, a few pebbles and root threads. */
function genDirt(v, r, salt) {
  const R = RAMPS.dirt;
  fillCell(C(R[2]));
  // Clumps sit on a jittered lattice and each one is lit top-left / shadowed bottom-right.
  // Without that rim they average out into brown noise and dirt stops reading as CLUMPED.
  const lat = [[4, 4], [12, 5], [5, 12], [12, 12]];
  for (let i = 0; i < 4; i++) {
    const p = lat[(i + v) & 3];
    const cx = p[0] + r.f(-2.4, 2.4), cy = p[1] + r.f(-2.4, 2.4);
    const rad = i === 0 ? r.f(4.0, 5.2) : r.f(2.6, 3.8);
    const dark = ((i + v) & 1) === 0;
    blob(cx, cy, rad, C(dark ? R[1] : R[3]), salt + i * 17);
    for (let a = 2.5; a < 5.4; a += 0.10) {   // lit rim
      px(Math.round(cx + Math.cos(a) * (rad - 0.6)), Math.round(cy + Math.sin(a) * (rad - 0.6)), C(dark ? R[2] : R[4]));
    }
    for (let a = -0.5; a < 2.1; a += 0.10) {  // shadowed rim
      px(Math.round(cx + Math.cos(a) * (rad - 0.4)), Math.round(cy + Math.sin(a) * (rad - 0.4)), C(R[0]));
    }
    if (rad > 4) blob(cx - 1, cy - 1, rad * 0.4, C(dark ? R[0] : R[4]), salt + 200 + i);
  }
  if (v === 3) { // one variant carries a lighter soil band — breaks vertical tiling
    const y = r.i(5, 10);
    for (let x = 0; x < 16; x++) {
      const h = 1 + (hashf(x, 0, salt + 5) < 0.4 ? 1 : 0);
      for (let k = 0; k < h; k++) px(x, y + k, C(R[3]));
    }
  }
  // grit, kept sparse: it is seasoning on the clumps, not a texture of its own
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hashf(x, y, salt + 909);
    if (n < 0.035) px(x, y, C(R[0]));
    else if (n > 0.978) px(x, y, C(R[4]));
  }
  // pebbles: small, hard, lit from upper-left — the only hard edges in the tile
  const np = 2 + (v & 1);
  for (let i = 0; i < np; i++) {
    const cx = r.i(2, 13), cy = r.i(2, 13);
    disc(cx, cy, 1.6, C(P.GRAV3));
    px(cx - 1, cy - 1, C(P.GRAV4)); px(cx, cy - 1, C(P.GRAV4));
    px(cx + 1, cy + 1, C(R[0])); px(cx, cy + 2, C(R[0]));
  }
  // root threads — thin, wandering, always darker than the soil
  const nr = 1 + (v >> 1);
  for (let i = 0; i < nr; i++) {
    let x = r.i(0, 15), y = r.i(0, 15), d = r.i(0, 7);
    for (let s = 0; s < 9; s++) {
      px(x, y, C(i === 0 ? P.ROOT1 : R[0]));
      const t = r.f();
      if (t < 0.3) d = (d + 1) & 7; else if (t < 0.6) d = (d + 7) & 7;
      x += DIRX[d]; y += DIRY[d];
      if (x < 0 || x > 15 || y < 0 || y > 15) break;
    }
  }
}

/** GRAVEL — discrete rounded pebbles in three sizes with dark voids. Must read LOOSE. */
function genGravel(v, r, salt) {
  const R = RAMPS.gravel;
  fillCell(C(R[0]));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hashf(x, y, salt) < 0.12) px(x, y, C(P.VOID));

  const target = [15, 11, 18, 13][v];
  const sizeMix = [[[1.3, 4], [2.2, 3], [3.1, 1.3]],
    [[1.3, 2], [2.2, 3], [3.3, 3]],
    [[1.2, 6], [1.9, 2], [2.8, 0.8]],
    [[1.4, 3], [2.4, 4], [3.0, 2]]][v];
  const cxs = [], cys = [], crs = [];
  for (let tries = 0; tries < 220 && cxs.length < target; tries++) {
    const rad = r.weighted(sizeMix);
    const cx = r.f(-1, 16), cy = r.f(-1, 16);
    let ok = true;
    for (let i = 0; i < cxs.length; i++) {
      const dx = cxs[i] - cx, dy = cys[i] - cy;
      if (Math.sqrt(dx * dx + dy * dy) < crs[i] + rad + 0.75) { ok = false; break; }
    }
    if (ok) { cxs.push(cx); cys.push(cy); crs.push(rad); }
  }
  for (let i = 0; i < cxs.length; i++) {
    const cx = cxs[i], cy = cys[i], rad = crs[i];
    const body = rad > 2.6 ? R[2] : rad > 1.7 ? R[3] : R[2];
    disc(cx, cy, rad, C(body));
    // rim: lit upper-left, shadowed lower-right — each pebble becomes a little sphere
    const rr = rad * rad, ri = (rad - 1) * (rad - 1);
    for (let y = Math.max(0, (cy - rad) | 0); y <= Math.min(15, Math.ceil(cy + rad)); y++)
      for (let x = Math.max(0, (cx - rad) | 0); x <= Math.min(15, Math.ceil(cx + rad)); x++) {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > rr || d2 < ri) continue;
        px(x, y, C(dx + dy < -rad * 0.25 ? R[4] : R[1]));
      }
    if (rad > 2.4) px(Math.round(cx - rad * 0.4), Math.round(cy - rad * 0.45), C(P.GRAV4));
  }
}

/** STONE — irregular angular fracture facets, hard edges, one dominant diagonal. */
function genStone(v, r, salt) {
  const R = RAMPS.stone;
  const ang = [-0.62, 0.68, -1.05, 0.38][v];
  const ax = Math.cos(ang), ay = Math.sin(ang);
  const n = [5, 6, 4, 7][v];
  const sxs = [], sys = [], sid = [];
  for (let i = 0; i < n; i++) { sxs.push(r.f(-1, 16)); sys.push(r.f(-1, 16)); sid.push(r.i(1, 4)); }

  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let b1 = 1e9, b2 = 1e9, who = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - sxs[i], dy = y - sys[i];
      // anisotropic metric: compress along the dominant axis so facets elongate that way
      const u = (dx * ax + dy * ay) * 0.46, w = -dx * ay + dy * ax;
      const d = Math.sqrt(u * u + w * w);
      if (d < b1) { b2 = b1; b1 = d; who = i; } else if (d < b2) b2 = d;
    }
    const i = (y << 4) + x;
    OWN[i] = who;
    px(x, y, C(b2 - b1 < 0.85 ? R[0] : R[sid[who]]));
  }
  // bevel: a facet's upper-left boundary catches the light, which is what makes the
  // facets read as tilted planes instead of flat colour regions
  for (let y = 15; y >= 0; y--) for (let x = 15; x >= 0; x--) {
    const i = (y << 4) + x;
    const up = y > 0 ? OWN[i - 16] : -1, lf = x > 0 ? OWN[i - 1] : -1;
    if ((up !== OWN[i] && up >= 0) || (lf !== OWN[i] && lf >= 0)) {
      if (getA(x, y) && hashf(x, y, salt) < 0.72) px(x, y, C(R[Math.min(5, sid[OWN[i]] + 2)]));
    }
  }
  // the dominant fracture: one long straight-ish break across the tile
  const mx = r.f(4, 12), my = r.f(4, 12), L = 13;
  lineP(mx - ax * L, my - ay * L, mx + ax * L, my + ay * L, C(R[0]));
  lineP(mx - ax * L - ay, my - ay * L + ax, mx + ax * L - ay, my + ay * L + ax, C(R[4]));
  for (let i = 0; i < 18; i++) px(r.i(0, 15), r.i(0, 15), C(R[r.i(1, 3)]));
}

/** SLATE — strong horizontal laminations. It must be OBVIOUS it will split sideways. */
function genSlate(v, r, salt) {
  const R = RAMPS.slate;
  // variant 1 is thin and dense, variant 3 is one massive plate: layout, not noise
  const hmin = [1, 1, 2, 3][v], hmax = [3, 2, 4, 6][v];
  fillCell(C(R[2]));
  let y = -r.i(0, 2);
  let band = 0;
  while (y < 16) {
    const h = r.i(hmin, hmax);
    const idx = r.weighted([[1, 2], [2, 4], [3, 3], [4, 1]]);
    for (let yy = Math.max(0, y); yy < Math.min(16, y + h); yy++)
      for (let x = 0; x < 16; x++) {
        const n = hashf(x, yy, salt + band * 13);
        px(x, yy, C(R[clamp(idx + (n < 0.14 ? -1 : n > 0.88 ? 1 : 0), 0, 5)]));
      }
    // the lamination itself: full-width dark line with a couple of 1px jogs, and a lit
    // pixel row beneath it. Full-width is the point — the eye reads a splitting plane.
    if (y >= 0 && y < 16) {
      const j1 = r.i(2, 7), j2 = r.i(8, 14), jd = r.bool() ? 1 : -1;
      for (let x = 0; x < 16; x++) {
        const yy = y + (x >= j1 && x < j2 ? jd : 0);
        px(x, yy, C(R[0]));
        if ((x & 1) === (band & 1) && hashf(x, yy, salt + 71) < 0.7) px(x, yy + 1, C(R[4]));
      }
    }
    y += h; band++;
  }
  // a few bright mica flecks sitting ON the bedding planes, never between them
  for (let i = 0; i < 4; i++) px(r.i(0, 15), r.i(0, 15), C(R[5]));
}

/** GRANITE — dense uniform speckle over a mid base plus scattered bright crystal flecks. */
function genGranite(v, r, salt) {
  const R = RAMPS.granite;
  const phase = v * 3 + 1;             // shifts the speckle lattice per variant
  fillCell(C(R[2]));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hashf(x + phase, y + phase * 2, salt);
    px(x, y, C(n < 0.30 ? R[1] : n < 0.62 ? R[2] : n < 0.86 ? R[3] : R[4]));
  }
  // a broad tonal patch keeps the density from reading as flat TV static
  blob([4, 11, 8, 13][v], [5, 11, 12, 4][v], 5.5, C(R[1]), salt + 3);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    if (hashf(x + phase, y, salt + 404) < 0.10) px(x, y, C(R[3]));
  // GRAN_SPECK is the whole identity of granite at a glance: hard white crystal flecks
  const nf = 5 + (v & 1) * 2;
  for (let i = 0; i < nf; i++) {
    const x = r.i(0, 15), y = r.i(0, 15);
    px(x, y, C(P.GRAN_SPECK));
    if (r.bool(0.4)) px(x + (r.bool() ? 1 : -1), y, C(R[5]));
    px(x, y + 1, C(R[0]));
  }
}

/** BEDROCK — near-black, coarse, oppressive. Almost no internal detail, on purpose:
 *  the player must read "do not bother" before they finish the first swing. */
function genBedrock(v, r, salt) {
  const ph = v & 1, pv = v >> 1;
  fillCell(C(P.ROCK0));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const gx = (x + ph) >> 1, gy = (y + pv) >> 1;   // 2x2 coarse grain
    const n = hashf(gx, gy, salt);
    px(x, y, C(n < 0.42 ? P.VOID : n < 0.82 ? P.INK : P.ROCK0));
  }
  for (let i = 0; i < 5; i++) px(r.i(0, 15), r.i(0, 15), C(P.ROCK1));
  // one faint pressure seam so it is not literally featureless
  if (v & 1) lineP(0, r.i(3, 12), 15, r.i(3, 12), C(P.VOID));
}

/** Grow a dendritic vein with a small random walk. Geology branches; it does not dot. */
function growVein(r, x, y, d, steps, depth, thick, plot) {
  for (let s = 0; s < steps; s++) {
    const t = r.f();
    if (t < 0.20) d = (d + 1) & 7; else if (t < 0.40) d = (d + 7) & 7;
    x += DIRX[d]; y += DIRY[d];
    if (x < -2 || x > 17 || y < -2 || y > 17) return;
    plot(x, y, s / steps);
    if (thick > 1 && r.bool(0.5)) plot(x + (DIRY[d] ? 1 : 0), y + (DIRY[d] ? 0 : 1), s / steps);
    if (depth > 0 && r.f() < 0.18) {
      growVein(r, x, y, (d + (r.bool() ? 2 : 6)) & 7, Math.max(3, (steps * 0.55) | 0), depth - 1, thick - 1, plot);
    }
  }
}

function veinPlot(colMid, colTip) {
  return (x, y, t) => {
    if (x < 0 || x > 15 || y < 0 || y > 15) return;
    MARK[(y << 4) + x] = 1;
    px(x, y, C(t < 0.6 ? colMid : colTip));
  };
}

/** Halo + specular pass shared by gold and mimic so their silhouettes match exactly. */
function veinFinish(r, halo, spec, hot, salt) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (MARK[(y << 4) + x]) continue;
    let near = 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DIRX[k], ny = y + DIRY[k];
      if (nx >= 0 && nx < 16 && ny >= 0 && ny < 16 && MARK[(ny << 4) + nx]) { near = 1; break; }
    }
    if (near && hashf(x, y, salt) < 0.6) px(x, y, halo);
  }
  const cand = [];
  for (let i = 0; i < 256; i++) if (MARK[i]) cand.push(i);
  if (!cand.length) return;
  const nspec = 2 + r.i(0, 1);
  for (let i = 0; i < nspec; i++) {
    const c = cand[r.i(0, cand.length - 1)];
    const x = c & 15, y = c >> 4;
    px(x, y, spec);
    px(x + 1, y, hot);
  }
}

/** ORE_GOLD — dark host rock with branching dendritic veins. Never dots. */
function genGold(v, r, salt) {
  hostRock(r, [P.ROCK0, P.ROCK1, P.STON1], salt);
  MARK.fill(0);
  const plot = veinPlot(P.GOLD2, P.GOLD1);
  // entry edge per variant: veins must arrive from a different side each time or a seam
  // of four tiles looks stamped rather than grown
  const starts = [[0, 8, 0], [15, 5, 4], [7, 0, 2], [3, 15, 6]][v];
  growVein(r, starts[0], starts[1], starts[2], 20, 2, 2, plot);
  growVein(r, r.i(3, 12), r.i(3, 12), r.i(0, 7), 12, 1, 1, plot);
  // core brightening: the middle of a thick vein is richer than its tips
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y << 4) + x;
    if (!MARK[i]) continue;
    if (x > 0 && x < 15 && MARK[i - 1] && MARK[i + 1] && hashf(x, y, salt + 8) < 0.45) px(x, y, C(P.GOLD3));
  }
  veinFinish(r, C(P.GOLD0), C(P.GOLD5), C(P.GOLD4), salt + 55);
}

/** MIMIC — ALMOST gold. The branch rhythm is metronomic and the flecks land on an exact
 *  4px lattice; the hue is nudged green. At a glance it is a gold seam — the silhouette is
 *  built by the same code path. The tell is that real gold never repeats itself, and that
 *  is something the player has to LEARN, not something the tile announces. */
function metroVein(x, y, d0, steps, depth, plot, side) {
  // A stair with a fixed 2-step period. Perfectly even, which no real dendrite ever is.
  for (let s = 0; s < steps; s++) {
    const d = ((s >> 1) & 1) ? d0 : (d0 + side + 8) & 7;
    x += DIRX[d]; y += DIRY[d];
    if (x < -2 || x > 17 || y < -2 || y > 17) return;
    plot(x, y, s / steps);
    if ((s & 1) === 0) plot(x + (DIRY[d] ? 1 : 0), y + (DIRY[d] ? 0 : 1), s / steps);
    if (depth > 0 && s % 6 === 5) metroVein(x, y, (d0 + side * 2 + 8) & 7, 6, depth - 1, plot, -side);
  }
}

function genMimic(v, r, salt) {
  hostRock(r, [P.ROCK0, P.ROCK1, P.STON1], salt);
  MARK.fill(0);
  const mid = greener(P.GOLD2, 1), tip = greener(P.GOLD1, 1), core = greener(P.GOLD3, 1);
  const plot = (x, y, t) => {
    if (x < 0 || x > 15 || y < 0 || y > 15) return;
    MARK[(y << 4) + x] = 1;
    px(x, y, t < 0.6 ? mid : tip);
  };
  const starts = [[0, 8, 0], [15, 5, 4], [7, 0, 2], [3, 15, 6]][v];
  metroVein(starts[0], starts[1], starts[2], 22, 2, plot, 1);
  metroVein(8, 8, (starts[2] + 3) & 7, 14, 1, plot, -1);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y << 4) + x;
    if (x > 0 && x < 15 && MARK[i] && MARK[i - 1] && MARK[i + 1] && hashf(x, y, salt + 8) < 0.45) px(x, y, core);
  }
  veinFinish(r, greener(P.GOLD0, 1), greener(P.GOLD5, 1), greener(P.GOLD4, 1), salt + 55);
  // the flecks: only ON the vein, but only where the exact 4px lattice says so
  const off = [1, 3, 2, 0][v];
  const bright = greener(P.GOLD4, 1.2), shade = greener(P.GOLD0, 1);
  for (let gy = off; gy < 16; gy += 4) for (let gx = off; gx < 16; gx += 4) {
    if (!MARK[(gy << 4) + gx]) continue;
    px(gx, gy, bright);
    px(gx, gy + 1, shade);
  }
}

/** Convex polygon fill via half-plane tests. Hard edges, no anti-aliasing. */
function poly(pts, c) {
  let minx = 99, maxx = -99, miny = 99, maxy = -99;
  for (const p of pts) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
  const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(15, Math.ceil(maxx));
  const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(15, Math.ceil(maxy));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let sign = 0, inside = true;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      const s = cr > 0.0001 ? 1 : cr < -0.0001 ? -1 : 0;
      if (s === 0) continue;
      if (sign === 0) sign = s; else if (s !== sign) { inside = false; break; }
    }
    if (inside) px(x, y, c);
  }
}
function polyPts(cx, cy, n, rad, rot, jag, r) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = rad * (1 + (r ? r.f(-jag, jag) : 0));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

/** ORE_GEM — faceted violet crystal cluster, bright core, hard facet edges. */
function genGem(v, r, salt) {
  hostRock(r, [P.VOID, P.GEM0, P.ROCK1], salt);
  const layouts = [
    [[8, 8, 5.6, 0.2], [4, 12, 3.0, 0.9], [12, 4, 2.6, 1.7]],
    [[6, 7, 4.8, 1.1], [11, 10, 4.2, 0.4]],
    [[8, 10, 6.2, 0.7], [5, 4, 2.4, 2.0], [12, 5, 2.2, 0.3], [13, 13, 2.0, 1.4]],
    [[10, 8, 5.2, 2.3], [4, 7, 3.6, 0.6]],
  ][v];
  let bx = 8, by = 8, br = 0;
  for (const L of layouts) {
    const n = 5 + r.i(0, 1);
    const pts = polyPts(L[0], L[1], n, L[2], L[3], 0.18, r);
    poly(pts, C(P.GEM2));
    // facet split: a chord through the body separates a lit face from a shadow face
    const inner = polyPts(L[0], L[1], n, L[2] * 0.62, L[3] + 0.4, 0.12, r);
    poly(inner, C(P.GEM3));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      lineP(a[0], a[1], b[0], b[1], C(P.GEM4));       // hard facet edge
      lineP(a[0], a[1], L[0], L[1], C(i & 1 ? P.GEM1 : P.GEM3));  // internal facet line
    }
    if (L[2] > br) { br = L[2]; bx = L[0]; by = L[1]; }
  }
  // the core is the "value" signal — it must survive being 3 pixels wide at a distance
  const cx = Math.round(bx), cy = Math.round(by);
  rectF(cx - 1, cy - 1, cx, cy, C(P.GEM5));
  px(cx + 1, cy - 1, C(P.GEM4)); px(cx - 2, cy, C(P.GEM4));
  px(cx + 1, cy + 1, C(P.GEM4)); px(cx, cy + 2, C(P.GEM4));
}

/** Filled prism: a capsule-ish quad around an axis, lit on one side. */
function prism(x0, y0, x1, y1, hw, body, lit, dark, edge) {
  const ax = x1 - x0, ay = y1 - y0;
  const L = Math.sqrt(ax * ax + ay * ay) || 1;
  const ux = ax / L, uy = ay / L;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - x0, dy = y - y0;
    const u = dx * ux + dy * uy;
    if (u < 0 || u > L) continue;
    const p = -dx * uy + dy * ux;
    const ap = Math.abs(p);
    if (ap > hw) continue;
    if (ap > hw - 0.9) px(x, y, edge);
    else px(x, y, p < -hw * 0.28 ? lit : p > hw * 0.30 ? dark : body);
  }
  lineP(x0, y0, x1, y1, edge);   // the internal facet line down the prism spine
}

/** CRYSTAL — cyan prisms, strong internal facets, luminous core, dark rock only at corners. */
function genCrystal(v, r, salt) {
  fillCell(C(P.ROCK0));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (hashf(x, y, salt) < 0.2) px(x, y, C(P.ROCK1));
  const sets = [
    [[8, 15, 8, 1, 4.2], [8, 14, 1, 4, 2.4], [8, 14, 15, 5, 2.4]],
    [[1, 13, 14, 3, 3.4], [13, 14, 3, 2, 3.0]],
    [[5, 15, 6, 2, 2.9], [5, 15, 14, 4, 2.3], [5, 15, 0, 5, 1.9]],
    [[7, 15, 7, 0, 5.0], [12, 15, 14, 5, 2.2], [3, 14, 1, 6, 2.0]],
  ][v];
  let ox = 8, oy = 8;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    prism(s[0], s[1], s[2], s[3], s[4], C(P.CYAN2), C(P.CYAN3), C(P.CYAN1), C(P.CYAN4));
    if (i === 0) { ox = (s[0] + s[2]) / 2; oy = (s[1] + s[3]) / 2; }
  }
  // luminous core — CRYSTAL emits 0.46, so the texture has to look like it is the source
  const cx = Math.round(ox), cy = Math.round(oy);
  rectF(cx, cy, cx + 1, cy + 1, C(P.CYAN5));
  px(cx - 1, cy, C(P.CYAN4)); px(cx + 2, cy + 1, C(P.CYAN4));
  px(cx, cy - 1, C(P.CYAN4)); px(cx + 1, cy + 2, C(P.CYAN4));
  for (let i = 0; i < 4; i++) px(r.i(1, 14), r.i(1, 14), C(P.CYAN4));
  // force the corners back to host rock so the cluster reads as embedded, not as a fill
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = Math.min(x + y, (15 - x) + y, x + (15 - y), (15 - x) + (15 - y));
    if (c < 3) px(x, y, C(c < 2 ? P.VOID : P.ROCK1));
  }
}

/** BONE — smooth pale curved forms on a dark matrix: a cross-section with a marrow void. */
function genBone(v, r, salt) {
  hostRock(r, [P.ROCK0, P.ROCK1, P.STON1], salt);
  function section(cx, cy, rx, ry) {
    ellipse(cx, cy, rx, ry, C(P.BONE2));
    ellipse(cx, cy, rx - 1, ry - 1, C(P.BONE3));
    // lit rim on the upper-left only — a bone is a smooth solid, so no dithering here
    for (let a = 2.2; a < 5.2; a += 0.09) {
      px(Math.round(cx + Math.cos(a) * (rx - 0.6)), Math.round(cy + Math.sin(a) * (ry - 0.6)), C(P.BONE4));
    }
    const mr = Math.max(1.2, rx * 0.38);
    ellipse(cx + 0.3, cy + 0.3, mr, mr * 0.9, C(P.BONE0));   // the marrow void
    ellipse(cx + 0.3, cy + 0.3, mr - 1, mr * 0.9 - 1, C(P.ROCK0));
  }
  if (v === 2) {
    // one variant is a curved shaft rather than a cut end — the skeleton has direction
    for (let x = -1; x < 17; x++) {
      const cy = 8 + Math.sin((x + 2) * 0.22) * 3.2;
      for (let k = -3; k <= 3; k++) {
        const y = Math.round(cy + k);
        px(x, y, C(Math.abs(k) === 3 ? P.BONE1 : Math.abs(k) === 2 ? P.BONE2 : P.BONE3));
      }
      px(x, Math.round(cy - 2), C(P.BONE4));
    }
  } else {
    const L = [[8, 8, 5.5, 5.0], [5, 6, 4.4, 4.0], [0, 0, 0, 0], [12, 10, 6.0, 5.2]][v];
    section(L[0], L[1], L[2], L[3]);
    if (v === 1) section(12, 12, 2.8, 2.6);
    if (v === 3) section(3, 3, 2.4, 2.2);
  }
}

/** RUIN — cut masonry. Mortar grid, chamfered blocks, half-course offset on odd variants. */
function genRuin(v, r, salt) {
  const R = RAMPS.ruin;
  fillCell(C(R[2]));
  const off = (v & 1) ? 8 : 0;   // running bond: odd variants shift the vertical joint
  const joints = off === 0 ? [0] : [0, 8];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hashf(x, y, salt);
    px(x, y, C(n < 0.18 ? R[1] : n > 0.9 ? R[3] : R[2]));
  }
  // block faces: bevel top+left bright, bottom+right dark, corners chamfered to mortar
  for (const jx of joints) {
    const x0 = jx + 1, x1 = (jx === 0 && joints.length === 1) ? 15 : (jx === 0 ? 7 : 15);
    hline(x0, x1, 1, C(R[4]));
    vline(x0, 1, 15, C(R[3]));
    hline(x0, x1, 15, C(R[1]));
    vline(x1, 1, 15, C(R[1]));
    px(x0, 1, C(R[0])); px(x1, 1, C(R[0])); px(x0, 15, C(R[0])); px(x1, 15, C(R[0]));
    px(x0 + 1, 2, C(R[5]));  // chamfer catch-light
  }
  hline(0, 15, 0, C(R[0]));                     // horizontal mortar course
  for (const jx of joints) vline(jx, 0, 15, C(R[0]));
  hline(0, 15, 1, C(R[1]));                     // mortar shadow under the course
  // weathering: chips and grime, or the whole thing looks like a UI panel
  for (let i = 0; i < 8; i++) px(r.i(1, 14), r.i(2, 15), C(r.bool() ? R[1] : R[0]));
  if (v === 2) { const cy = r.i(4, 11); rectF(13, cy, 15, cy + 2, C(R[0])); px(12, cy + 1, C(R[1])); }
  if (v === 3) {
    // exactly one variant carries copper fittings: a rare read, not decoration
    const fy = r.i(4, 10);
    for (const fx of [3, 11]) {
      rectF(fx, fy, fx + 1, fy + 2, C(P.COPP2));
      px(fx, fy, C(P.COPP3)); px(fx + 1, fy + 2, C(P.COPP1));
      px(fx, fy + 3, C(P.COPP0)); px(fx + 1, fy - 1, C(P.COPP4));
    }
  }
}

/** RELIC — dark rock with a partly exposed worked object: a machined ring, spokes and a
 *  copper hub. Perfect concentric curves are the point: nothing else in the mine makes them,
 *  so the shape alone says "someone was here" before the player knows what it is worth. */
function genRelic(v, r, salt) {
  hostRock(r, [P.VOID, P.ROCK1, P.ROCK2], salt);
  const L = [[8, 8, 5.4, -2.9, 3.6], [6, 9, 5.8, -2.2, 3.2], [10, 7, 5.0, -3.0, 4.2], [8, 9, 5.6, -1.2, 3.4]][v];
  const cx = L[0], cy = L[1], rad = L[2], a0 = L[3], a1 = L[3] + L[4];
  const inR = rad - 3;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    let a = Math.atan2(dy, dx);
    while (a < a0) a += Math.PI * 2;
    if (a > a1) continue;
    const lit = Math.cos(a + 2.4) > 0;          // one consistent light direction, upper-left
    if (Math.abs(d - rad) < 1.3) px(x, y, C(lit ? P.STEEL3 : P.STEEL1));
    else if (Math.abs(d - rad) < 2.1) px(x, y, C(lit ? P.STEEL2 : P.RUIN1));
    else if (Math.abs(d - inR) < 1.0) px(x, y, C(lit ? P.COPP3 : P.COPP1));
  }
  for (let k = 0; k < 4; k++) {                  // spokes: straight lines, exactly spaced
    const a = a0 + (a1 - a0) * (0.12 + k * 0.25);
    lineP(cx + Math.cos(a) * inR, cy + Math.sin(a) * inR, cx + Math.cos(a) * (rad - 1), cy + Math.sin(a) * (rad - 1), C(P.COPP2));
  }
  disc(cx, cy, 1.8, C(P.RUIN2));                 // hub
  disc(cx, cy, 1.0, C(P.COPP2));
  px(Math.round(cx) - 1, Math.round(cy) - 1, C(P.COPP4));
  px(Math.round(cx + Math.cos(a0 + 0.5) * rad), Math.round(cy + Math.sin(a0 + 0.5) * rad), C(P.STEEL4));
  // still half buried — the player has to dig to learn what it is
  const bx = [3, 14, 2, 13][v], by = [14, 13, 3, 14][v];
  blob(bx, by, 4.4, C(P.ROCK1), salt + 12);
  blob(bx + (bx < 8 ? 2 : -2), by + (by < 8 ? 2 : -2), 3.0, C(P.ROCK2), salt + 13);
}

/** ROOT — dark damp earth threaded with green roots. */
function genRoot(v, r, salt) {
  fillCell(C(P.DIRT1));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hashf(x, y, salt);
    px(x, y, C(n < 0.30 ? P.DIRT0 : n < 0.78 ? P.DIRT1 : P.DIRT2));
  }
  for (let i = 0; i < 3; i++) blob(r.f(0, 15), r.f(0, 15), r.f(2.5, 4.5), C(P.DIRT0), salt + i * 9);
  const cols = [P.ROOT1, P.ROOT2, P.ROOT3];
  const n = [3, 4, 2, 5][v];
  for (let i = 0; i < n; i++) {
    // roots descend: they answer the question "what is below me?", so bias downward
    let x = r.i(0, 15), y = v === 2 ? r.i(0, 15) : -1, d = v === 2 ? r.i(0, 7) : 2;
    for (let s = 0; s < 18; s++) {
      const t = r.f();
      if (t < 0.22) d = (d + 1) & 7; else if (t < 0.44) d = (d + 7) & 7;
      if (DIRY[d] < 0 && r.bool(0.6)) d = 2;
      x += DIRX[d]; y += DIRY[d];
      if (x < 0 || x > 15 || y > 15) break;
      px(x, y, C(cols[1]));
      px(x - 1, y, C(cols[0]));
      if ((s & 3) === 0) px(x + 1, y, C(cols[2]));
      if (s > 10 && r.bool(0.15)) { px(x, y, C(P.ROOT4)); }
    }
  }
  for (let i = 0; i < 3; i++) px(r.i(0, 15), r.i(0, 15), C(P.ROOT4));
}

/** WATER — horizontal ripple bands, translucency faked with a 2-level dither. */
function genWater(v, r, salt) {
  const R = RAMPS.water;
  const ph = v * 1.7, amp = [1.6, 2.4, 1.1, 2.0][v], per = [2.7, 3.6, 2.2, 3.1][v];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const u = y + Math.sin((x + ph) * 0.55) * amp;
    const f = u / per;
    const band = Math.floor(f);
    const frac = f - band;
    let idx = (band & 1) ? 1 : 2;
    // dither at the band boundary — two levels only, so it still reads as flat water
    if (frac < 0.28 || frac > 0.78) idx = ((x + y) & 1) ? 1 : 2;
    px(x, y, C(R[idx]));
  }
  // ripple highlights: the only bright thing, and they follow the same wave
  for (let k = 0; k < 2; k++) {
    const base = r.i(2, 13);
    for (let x = 0; x < 16; x++) {
      const y = Math.round(base + Math.sin((x + ph) * 0.55) * amp);
      if ((x & 1) === (k & 1)) px(x, y, C(R[4])); else px(x, y, C(R[3]));
    }
  }
  hline(0, 15, 15, C(R[0]));
  for (let x = 0; x < 16; x += 2) px(x, 14, C(R[0]));
  for (let i = 0; i < 4; i++) px(r.i(0, 15), r.i(0, 15), C(R[5]));
}

/** MAGMA — flowing bands MAG2..MAG5 under a cooling crust of MAG1. Brightest tile in the game. */
function genMagma(v, r, salt) {
  const ph = v * 2.3, amp = [2.4, 1.5, 3.0, 2.0][v];
  const seq = [P.MAG3, P.MAG4, P.MAG5, P.MAG4, P.MAG3, P.MAG2];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const u = y + Math.sin((x + ph) * 0.48) * amp + Math.sin((x + ph) * 0.17) * 1.2;
    const band = ((Math.floor(u / 1.6) % seq.length) + seq.length) % seq.length;
    px(x, y, C(seq[band]));
  }
  // crust: cooled plates floating on the flow. Their cracks are where the light gets out.
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = fbm2((x + v * 11) * 0.20, (y + v * 7) * 0.20, 3, 2, 0.5, salt);
    if (n > 0.585) px(x, y, C(n > 0.66 ? P.MAG0 : P.MAG1));
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    // rim the crust plates so they read as solid skin, not as dark noise
    const n = fbm2((x + v * 11) * 0.20, (y + v * 7) * 0.20, 3, 2, 0.5, salt);
    const nr = fbm2((x + 1 + v * 11) * 0.20, (y + v * 7) * 0.20, 3, 2, 0.5, salt);
    if (n > 0.585 && nr <= 0.585) px(x, y, C(P.MAG2));
  }
  for (let i = 0; i < 5; i++) { const x = r.i(0, 15), y = r.i(0, 15); px(x, y, C(P.MAG5)); px(x + 1, y, C(P.MAG4)); }
}

/** GLOWCAP — a cluster of luminous fungus caps on dark rock. */
function genGlowcap(v, r, salt) {
  fillCell(C(P.ROCK0));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = hashf(x, y, salt);
    px(x, y, C(n < 0.25 ? P.VOID : n < 0.85 ? P.ROCK0 : P.ROCK1));
  }
  const groups = [
    [[5, 11, 3], [10, 12, 2], [13, 9, 1]],
    [[8, 9, 3], [4, 13, 2], [12, 13, 2], [11, 6, 1]],
    [[4, 8, 2], [7, 12, 3], [12, 10, 2]],
    [[9, 13, 4], [4, 12, 2], [13, 12, 1]],
  ][v];
  for (const g of groups) {
    const cx = g[0], cy = g[1], w = g[2];
    vline(cx, cy, Math.min(15, cy + 3), C(P.FUNG1));      // stem
    px(cx - 1, cy + 2, C(P.FUNG0));
    for (let x = cx - w; x <= cx + w; x++) {              // cap: flat dome, hard edge
      const h = Math.round(Math.sqrt(Math.max(0, w * w - (x - cx) * (x - cx))) * 0.8);
      for (let y = cy - h; y <= cy; y++) px(x, y, C(y < cy - h + 1 ? P.FUNG3 : P.FUNG2));
      px(x, cy + 1, C(P.FUNG1));
    }
    px(cx, cy - Math.round(w * 0.8) - 1, C(P.FUNG3));
    px(cx - w - 1, cy, C(P.FUNG0)); px(cx + w + 1, cy, C(P.FUNG0));
  }
  for (let i = 0; i < 4; i++) px(r.i(0, 15), r.i(0, 15), C(P.FUNG1));   // spores
}

/** SUPPORT — weathered timber, vertical grain, iron banding. */
function genSupport(v, r, salt) {
  fillCell(C(P.LEATH1));
  for (let x = 0; x < 16; x++) {
    // grain: vertical streaks that wander by at most 1px so the post reads as one plank
    const base = hashf(x, v, salt);
    const col = base < 0.24 ? P.LEATH0 : base < 0.72 ? P.LEATH1 : P.LEATH2;
    for (let y = 0; y < 16; y++) {
      const jog = hashf(x, y >> 2, salt + 3) < 0.28 ? 1 : 0;
      px(x, y, C(col));
      if (jog) px(x, y, C(base < 0.5 ? P.LEATH0 : P.LEATH2));
    }
  }
  vline(0, 0, 15, C(P.LEATH0)); vline(15, 0, 15, C(P.DIRT0));   // beam edges, lit from the left
  vline(1, 0, 15, C(P.LEATH2));
  for (let i = 0; i < 10; i++) px(r.i(2, 14), r.i(0, 15), C(P.LEATH0));  // weathering
  if (v === 1 || v === 3) {   // knot
    const kx = r.i(4, 11), ky = r.i(3, 12);
    ellipse(kx, ky, 2.2, 1.6, C(P.LEATH0));
    ellipse(kx, ky, 1.2, 0.9, C(P.DIRT0));
    px(kx - 2, ky - 1, C(P.LEATH2));
  }
  if (v !== 2) {   // iron band — variant 2 is plain so vertical runs of posts vary
    const by = [4, 10, 0, 7][v];
    rectF(0, by, 15, by + 2, C(P.STEEL1));
    hline(0, 15, by, C(P.STEEL2));
    hline(0, 15, by + 2, C(P.STEEL0));
    px(3, by + 1, C(P.STEEL3)); px(12, by + 1, C(P.STEEL3));
    px(3, by + 2, C(P.STEEL0)); px(12, by + 2, C(P.STEEL0));
  }
}

const FACE_GEN = [];
FACE_GEN[T.DIRT] = genDirt;
FACE_GEN[T.GRAVEL] = genGravel;
FACE_GEN[T.STONE] = genStone;
FACE_GEN[T.SLATE] = genSlate;
FACE_GEN[T.GRANITE] = genGranite;
FACE_GEN[T.BEDROCK] = genBedrock;
FACE_GEN[T.ORE_GOLD] = genGold;
FACE_GEN[T.ORE_GEM] = genGem;
FACE_GEN[T.CRYSTAL] = genCrystal;
FACE_GEN[T.BONE] = genBone;
FACE_GEN[T.RUIN] = genRuin;
FACE_GEN[T.RELIC] = genRelic;
FACE_GEN[T.ROOT] = genRoot;
FACE_GEN[T.WATER] = genWater;
FACE_GEN[T.MAGMA] = genMagma;
FACE_GEN[T.MIMIC] = genMimic;
FACE_GEN[T.GLOWCAP] = genGlowcap;
FACE_GEN[T.SUPPORT] = genSupport;

// ─────────────────────────────────────────────────────────────────────────────
// CRACK OVERLAYS — three stages that GROW. Stage 2 contains stage 1.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full stage-3 fissure network once, recording pixels in the order they were
 * grown. Stage N is then simply a prefix of that list, which guarantees the damage
 * animation only ever ADDS lines — a crack that changed shape between hits would read
 * as a texture swap and kill the sense of accumulating damage.
 */
function fissureNetwork(r) {
  const out = [];
  const seen = new Uint8Array(256);
  const push = (x, y) => {
    if (x < 0 || x > 15 || y < 0 || y > 15) return;
    const i = (y << 4) + x;
    if (seen[i]) return;
    seen[i] = 1; out.push(i);
  };
  const walk = (x, y, d, steps, depth, branchP) => {
    for (let s = 0; s < steps; s++) {
      const t = r.f();
      if (t < 0.24) d = (d + 1) & 7; else if (t < 0.48) d = (d + 7) & 7;
      x += DIRX[d]; y += DIRY[d];
      if (x < 0 || x > 15 || y < 0 || y > 15) return;
      push(x, y);
      if (depth > 0 && r.f() < branchP) walk(x, y, (d + (r.bool() ? 2 : 6)) & 7, Math.max(3, steps >> 1), depth - 1, branchP * 0.6);
    }
  };
  push(8, 8);
  walk(8, 8, 1, 7, 1, 0.20);          // stage 1 material: a short central split
  walk(8, 8, 5, 8, 1, 0.24);
  walk(8, 8, 3, 9, 2, 0.30);          // stage 2 material
  walk(8, 8, 7, 9, 2, 0.30);
  walk(7, 9, 2, 10, 2, 0.36);         // stage 3 material: reaches the edges
  walk(9, 7, 6, 10, 2, 0.36);
  walk(4, 4, 0, 8, 1, 0.30);
  return out;
}

function genCrack(stage, r) {
  const net = fissureNetwork(r);
  const total = net.length;
  const frac = stage === 1 ? 0.24 : stage === 2 ? 0.56 : 1.0;
  const count = Math.max(4, Math.round(total * frac));
  const darkA = stage === 1 ? 0.80 : stage === 2 ? 0.88 : 0.95;
  MARK.fill(0);
  const ink = C(P.VOID), voidc = C(P.VOID), hi = LIP;
  for (let k = 0; k < count && k < total; k++) {
    const i = net[k];
    const x = i & 15, y = i >> 4;
    MARK[i] = 1;
    pxa(x, y, ink, darkA);
    // stage 3 widens the trunk: the tile should look like it is about to pop
    if (stage === 3 && (k & 1) === 0 && x < 15) { MARK[i + 1] = 1; pxa(x + 1, y, voidc, 0.72); }
  }
  // 1px light on the lower-right lip of every fissure so the crack reads as DEPTH,
  // not as a dark scribble painted on the surface
  for (let y = 15; y >= 0; y--) for (let x = 15; x >= 0; x--) {
    const i = (y << 4) + x;
    if (MARK[i]) continue;
    const up = y > 0 && MARK[i - 16], lf = x > 0 && MARK[i - 1];
    if (up || lf) pxa(x, y, hi, stage === 3 ? 0.46 : stage === 2 ? 0.38 : 0.30);
  }
  if (stage === 3) {
    // spall: chips already gone. The eye reads missing material as imminent failure.
    for (let k = 0; k < 3; k++) {
      const c = net[Math.min(total - 1, r.i(0, total - 1))];
      const x = c & 15, y = c >> 4;
      pxa(x, y, voidc, 0.95); pxa(x + 1, y, voidc, 0.9); pxa(x, y + 1, voidc, 0.9);
      pxa(x + 1, y + 1, hi, 0.40);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DECO OVERLAYS — the clue grammar. Learnable rules, never noise.
// ─────────────────────────────────────────────────────────────────────────────

const EDGE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left

function decoFleckFaint(v, r, salt) {
  // "a vein is somewhere near": barely there, hugging one edge, no direction implied
  const d = EDGE_DIRS[v];
  const n = 2 + r.i(0, 1);
  for (let i = 0; i < n; i++) {
    const t = r.f(3, 12);
    const x = Math.round(d[0] ? (d[0] > 0 ? 14 - r.i(0, 2) : 1 + r.i(0, 2)) : t);
    const y = Math.round(d[1] ? (d[1] > 0 ? 14 - r.i(0, 2) : 1 + r.i(0, 2)) : t);
    pxa(x, y, C(P.GOLD2), 0.9);
    if (r.bool(0.5)) pxa(x, y, C(P.GOLD3), 1);
    pxa(x, y + 1, C(P.GOLD0), 0.45);
  }
}

function decoFleckRich(v, r, salt) {
  // "the vein is adjacent": a directional gradient. The clue is WHICH WAY, not "gold here".
  const d = EDGE_DIRS[v];
  const n = 6 + r.i(0, 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;                       // 0 = tile centre, 1 = the loaded edge
    const jitter = r.f(-2.4, 2.4) * (1 - t * 0.5);
    const cx = 8 + d[0] * 7 * t + (d[0] ? jitter * 0.5 : jitter);
    const cy = 8 + d[1] * 7 * t + (d[1] ? jitter * 0.5 : jitter);
    const x = clamp(Math.round(cx), 0, 15), y = clamp(Math.round(cy), 0, 15);
    pxa(x, y, C(t > 0.7 ? P.GOLD4 : t > 0.4 ? P.GOLD3 : P.GOLD2), 1);
    pxa(x + 1, y + 1, C(P.GOLD0), 0.5);
    if (t > 0.75) pxa(x + 1, y, C(P.GOLD3), 0.85);
  }
}

function decoHairline(v, r, salt) {
  // "hollow behind": one thin line, off-centre, going nowhere. Nothing else.
  const vert = (v & 1) === 0;
  const off = [4, 5, 11, 10][v];
  const len = r.i(9, 14), start = r.i(0, 16 - len);
  let drift = 0;
  for (let k = 0; k < len; k++) {
    if (r.bool(0.18)) drift += r.bool() ? 1 : -1;
    const a = clamp(off + drift, 0, 15);
    const x = vert ? a : start + k, y = vert ? start + k : a;
    pxa(x, y, C(P.VOID), 0.82);
    if ((k & 1) === 0) pxa(x + (vert ? 1 : 0), y + (vert ? 0 : 1), LIP, 0.30);
  }
}

function decoAirflow(v, r, salt) {
  // "air is moving through": faint, parallel, tapered. Must never look like damage.
  const dirs = [[1, -0.25], [-1, -0.25], [0.3, -1], [1, 0.35]];
  const d = dirs[v];
  const L = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  const ux = d[0] / L, uy = d[1] / L;
  for (let s = 0; s < 3; s++) {
    const bx = r.f(3, 12), by = r.f(3, 12);
    const px0 = bx - uy * (s - 1) * 3.2, py0 = by + ux * (s - 1) * 3.2;
    const len = r.i(4, 6);
    for (let k = 0; k < len; k++) {
      const t = k / (len - 1);
      const a = 0.42 * Math.sin(t * Math.PI);     // tapered at both ends = motion, not a scratch
      pxa(Math.round(px0 + ux * k), Math.round(py0 + uy * k), LIP, a);
    }
  }
}

function decoDamp(v, r, salt) {
  // "water near": the rock is darkened wet, and it beads.
  const cx = [5, 11, 8, 4][v], cy = [5, 6, 11, 12][v];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 4.5) pxa(x, y, C(P.VOID), 0.42);
    else if (d < 6.2 && hashf(x, y, salt) < 0.45) pxa(x, y, C(P.VOID), 0.24);
    if (d < 4.0 && hashf(x, y, salt + 3) < 0.12) pxa(x, y, LIP, 0.18);   // sheen
  }
  for (let i = 0; i < 2; i++) {
    const bx = clamp(cx + r.i(-3, 3), 1, 14), by = clamp(cy + r.i(-3, 3), 1, 14);
    pxa(bx, by, C(P.WAT3), 0.9);
    pxa(bx, by + 1, C(P.WAT2), 0.8);
    pxa(bx - 1, by, C(P.WAT5), 0.85);
  }
}

function decoRootlet(v, r, salt) {
  // "water below": roots always reach DOWN toward it. Direction is the whole rule.
  const starts = [[4, 9], [3, 7, 12], [6, 11], [2, 8, 13]][v];
  for (const sx0 of starts) {
    let x = sx0, y = 0, d = 2;
    const len = r.i(7, 13);
    for (let s = 0; s < len; s++) {
      const t = r.f();
      if (t < 0.20) d = 1; else if (t < 0.40) d = 3; else d = 2;
      x += DIRX[d]; y += DIRY[d];
      if (x < 0 || x > 15 || y > 15) break;
      pxa(x, y, C(P.ROOT2), 0.95);
      pxa(x - 1, y, C(P.ROOT1), 0.5);
      if (s === len - 1) pxa(x, y, C(P.ROOT4), 1);
      if (s > 3 && r.bool(0.14)) { pxa(x + 1, y + 1, C(P.ROOT3), 0.8); pxa(x + 2, y + 2, C(P.ROOT2), 0.6); }
    }
  }
}

function decoEdge(v, r, salt) {
  // "ruins": a perfectly straight line. Nature does not make these, and the player knows it.
  const d = EDGE_DIRS[v];
  const bright = C(P.RUIN5), dark = C(P.RUIN0);
  if (d[1] === -1) for (let x = 0; x < 16; x++) { pxa(x, 0, bright, 0.85); pxa(x, 1, dark, 0.45); }
  else if (d[1] === 1) for (let x = 0; x < 16; x++) { pxa(x, 15, bright, 0.8); pxa(x, 14, dark, 0.45); }
  else if (d[0] === 1) for (let y = 0; y < 16; y++) { pxa(15, y, bright, 0.78); pxa(14, y, dark, 0.45); }
  else for (let y = 0; y < 16; y++) { pxa(0, y, bright, 0.85); pxa(1, y, dark, 0.45); }
}

function decoScratch(v, r, salt) {
  // "a creature has been through here": three parallel gouges. Parallel = claws, not cracks.
  const dirs = [[1, -0.4], [1, 0.4], [0.4, 1], [-1, 0.45]];
  const d = dirs[v];
  const L = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
  const ux = d[0] / L, uy = d[1] / L;
  const cx = r.f(5, 11), cy = r.f(5, 11);
  for (let s = -1; s <= 1; s++) {
    const ox = cx - uy * s * 3.4, oy = cy + ux * s * 3.4;
    const half = r.f(4, 6.5);
    for (let k = -half; k <= half; k += 0.9) {
      const x = Math.round(ox + ux * k), y = Math.round(oy + uy * k);
      pxa(x, y, C(P.VOID), 0.85);
      pxa(x - Math.round(uy), y + Math.round(ux), LIP, 0.34);
    }
  }
}

function decoBoneHint(v, r, salt) {
  // "the skeleton continues": one chip, pale, smooth. Small enough to reward looking.
  const cx = [5, 11, 8, 12][v], cy = [11, 5, 4, 12][v];
  const rx = r.f(1.8, 2.6), ry = r.f(1.1, 1.7);
  const rot = v * 0.8;
  const ca = Math.cos(rot), sa = Math.sin(rot);
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const u = (x * ca + y * sa) / rx, w = (-x * sa + y * ca) / ry;
    const d = u * u + w * w;
    if (d > 1) continue;
    pxa(cx + x, cy + y, C(d > 0.55 ? P.BONE2 : P.BONE3), 1);
    if (d < 0.3 && x + y < 0) pxa(cx + x, cy + y, C(P.BONE4), 1);
  }
  pxa(cx - Math.round(rx), cy + Math.round(ry), C(P.BONE1), 0.8);
  pxa(cx + Math.round(rx), cy + Math.round(ry) + 1, C(P.BONE0), 0.6);
}

function decoGemGlint(v, r, salt) {
  // "a gem pocket is behind this face": colour bleeding THROUGH stone, so it must be
  // soft and low-alpha — a hard violet shape would read as exposed gem, which is a lie.
  const cx = [6, 10, 8, 12][v], cy = [6, 11, 4, 9][v];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 2.2) pxa(x, y, C(P.GEM4), 0.42);
    else if (d < 4.0) pxa(x, y, C(P.GEM3), 0.26);
    else if (d < 5.6 && hashf(x, y, salt) < 0.5) pxa(x, y, C(P.GEM2), 0.18);
  }
  pxa(cx, cy, C(P.GEM5), 0.55);
  pxa(cx + r.i(-1, 1), cy + r.i(-1, 1), C(P.GEM5), 0.4);
}

function decoHeat(v, r, salt) {
  // "magma near": the stone itself is discoloured. Dithered so it stays pixel art, and
  // it never glows — glowing would mean magma is EXPOSED, a different and worse message.
  const d = EDGE_DIRS[v];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dist = d[1] === -1 ? y : d[1] === 1 ? 15 - y : d[0] === 1 ? 15 - x : x;
    if (dist > 5) continue;
    const t = 1 - dist / 6;
    if (hashf(x, y, salt) > t * 0.92) continue;
    pxa(x, y, C(dist < 2 ? P.MAG3 : P.MAG2), 0.34 * t + 0.08);
  }
  for (let i = 0; i < 2; i++) {
    const t = r.i(2, 13);
    const x = d[0] ? (d[0] > 0 ? 15 - r.i(0, 1) : r.i(0, 1)) : t;
    const y = d[1] ? (d[1] > 0 ? 15 - r.i(0, 1) : r.i(0, 1)) : t;
    pxa(x, y, C(P.MAG4), 0.7);
  }
}

const DECO_GEN = [];
DECO_GEN[D.FLECK_FAINT] = decoFleckFaint;
DECO_GEN[D.FLECK_RICH] = decoFleckRich;
DECO_GEN[D.HAIRLINE] = decoHairline;
DECO_GEN[D.AIRFLOW] = decoAirflow;
DECO_GEN[D.DAMP] = decoDamp;
DECO_GEN[D.ROOTLET] = decoRootlet;
DECO_GEN[D.EDGE] = decoEdge;
DECO_GEN[D.SCRATCH] = decoScratch;
DECO_GEN[D.BONEHINT] = decoBoneHint;
DECO_GEN[D.GEMGLINT] = decoGemGlint;
DECO_GEN[D.HEAT] = decoHeat;

// ─────────────────────────────────────────────────────────────────────────────
// EDGE OVERLAY — 1px rim light on faces touching open air.
// This single layer is what makes a dug tunnel read as CARVED rather than as a hole
// punched in a texture. Light is assumed to come from above and slightly left.
// ─────────────────────────────────────────────────────────────────────────────

function genEdge(mask) {
  // ROCK6 on its own disappears against pale rock (granite, gravel), and then a tunnel
  // stops reading as carved. Derive a warm-neutral highlight from it instead of typing a hex.
  const rim = mix(P.ROCK6, P.UI_WHITE, 0.32);
  const hot = mix(P.STON5, P.UI_WHITE, 0.45);
  const up = (mask & 1) !== 0, right = (mask & 2) !== 0, left = (mask & 8) !== 0;
  if (up) {
    for (let x = 0; x < 16; x++) {
      pxa(x, 0, rim, 0.40);
      if ((x & 1) === 0) pxa(x, 1, rim, 0.15);   // dithered falloff keeps it 1px-crisp
    }
  }
  if (left) for (let y = 0; y < 16; y++) { pxa(0, y, rim, 0.24); if ((y & 1) === 0) pxa(1, y, rim, 0.09); }
  if (right) for (let y = 0; y < 16; y++) { pxa(15, y, rim, 0.17); }
  // corner where two lit faces meet gets a single brighter pixel — sells the carve
  if (up && left) { pxa(0, 0, hot, 0.6); pxa(1, 0, hot, 0.3); pxa(0, 1, hot, 0.3); }
  if (up && right) { pxa(15, 0, hot, 0.45); pxa(14, 0, hot, 0.22); }
  // bottom (bit 4) deliberately gets nothing: an overhang lit from below looks wrong.
}

// ─────────────────────────────────────────────────────────────────────────────
// ATLAS
// ─────────────────────────────────────────────────────────────────────────────

let _atlas = null;

function cellSX(i) { return (i % COLS) * CS; }
function cellSY(i) { return Math.floor(i / COLS) * CS; }

const _uvCache = [];
function uvOf(i) {
  let u = _uvCache[i];
  if (!u) { u = { sx: cellSX(i), sy: cellSY(i) }; _uvCache[i] = u; }
  return u;
}

/** Build (once) and return the tile atlas. Idempotent and memoised. */
export function buildAtlas() {
  if (_atlas) return _atlas;

  const rows = Math.ceil(CELL_COUNT / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CS;            // 256
  canvas.height = rows * CS;           // 144
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  const img = g.createImageData(CS, CS);
  D8 = img.data;

  // faces
  for (let id = 0; id < TILE_COUNT; id++) {
    const gen = FACE_GEN[id];
    for (let v = 0; v < VARIANTS; v++) {
      clearCell();
      if (gen) gen(v, new Rand(((id * 7919 + v * 104729 + SALT) >>> 0) || 1), SALT + id * 131 + v * 17);
      const cell = FACE_BASE + id * VARIANTS + v;
      g.putImageData(img, cellSX(cell), cellSY(cell));
    }
  }

  // cracks — same Rand seed for all three stages so the network is identical and only grows
  for (let s = 1; s <= 3; s++) {
    clearCell();
    genCrack(s, new Rand(0x5eed17));
    const cell = CRACK_BASE + (s - 1);
    g.putImageData(img, cellSX(cell), cellSY(cell));
  }

  // deco clues
  for (let d = 1; d <= DECO_COUNT; d++) {
    const gen = DECO_GEN[d];
    for (let v = 0; v < VARIANTS; v++) {
      clearCell();
      if (gen) gen(v, new Rand(((d * 40503 + v * 2654435 + SALT) >>> 0) || 1), SALT + d * 977 + v * 41);
      const cell = DECO_BASE + (d - 1) * VARIANTS + v;
      g.putImageData(img, cellSX(cell), cellSY(cell));
    }
  }

  // edge rim lights
  for (let m = 0; m < 16; m++) {
    clearCell();
    genEdge(m);
    const cell = EDGE_BASE + m;
    g.putImageData(img, cellSX(cell), cellSY(cell));
  }

  D8 = null;

  _atlas = {
    canvas,
    TS: CS,
    width: canvas.width,
    height: canvas.height,
    VARIANTS,

    /** Face texture for a tile id + variant (0..VARIANTS-1). */
    uv(tileId, variant) {
      const id = tileId >= 0 && tileId < TILE_COUNT ? tileId | 0 : 0;
      const v = ((variant | 0) % VARIANTS + VARIANTS) % VARIANTS;
      return uvOf(FACE_BASE + id * VARIANTS + v);
    },

    /** Fracture overlay for stage 1..3, or null when the tile is pristine. */
    crack(stage) {
      const s = stage | 0;
      if (s < 1 || s > 3) return null;
      return uvOf(CRACK_BASE + s - 1);
    },

    /** Clue overlay for a D.* id, or null for D.NONE / unknown. */
    deco(decoId, variant) {
      const d = decoId | 0;
      if (d < 1 || d > DECO_COUNT) return null;
      const v = ((variant | 0) % VARIANTS + VARIANTS) % VARIANTS;
      return uvOf(DECO_BASE + (d - 1) * VARIANTS + v);
    },

    /** Rim light. mask bits: 1 = open above, 2 = right, 4 = below, 8 = left. */
    edge(mask) {
      const m = (mask | 0) & 15;
      if (m === 0) return null;
      return uvOf(EDGE_BASE + m);
    },

    /**
     * Deterministic variant for a tile at (tx,ty). Same tile id at the same place always
     * picks the same variant, so the world never shimmers when it is redrawn.
     */
    variantAt(tileId, tx, ty) {
      return (hashf(tx, ty, SALT + (tileId | 0) * 733) * VARIANTS) | 0;
    },
  };
  return _atlas;
}

/** The built atlas, or null if buildAtlas() has not run yet. */
export function getAtlas() { return _atlas; }
