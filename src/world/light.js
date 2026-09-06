// Tile-propagated lighting with occlusion.
//
// GDD §20: "Darkness is a central compositional tool. The player's lantern creates a readable
// local radius while distant crystals, ruins, vents, eyes, or unknown formations create isolated
// points of attraction."
//
// Light is stored as REACH (how many more tile-units this light can travel), not as brightness.
// That gives exact control of the lantern radius and makes occlusion trivial: each tile subtracts
// its own attenuation cost from whatever passes through it. Rock costs a lot, air costs one.
// The payoff is the moment you crack a chamber open and light floods in — for free.

import { T, TILES } from './tiles.js';
import { clamp } from '../core/rng.js';

const ATT = new Float32Array(64);
for (let i = 0; i < TILES.length; i++) {
  const t = TILES[i];
  ATT[i] = t.solid ? (i === T.BEDROCK ? 7.0 : 3.1 + t.opacity * 2.2)
                   : (t.liquid ? 1.35 : 1.0);
}
ATT[T.CRYSTAL] = 1.5; ATT[T.GLOWCAP] = 1.2; ATT[T.ROOT] = 1.5; ATT[T.ORE_GEM] = 2.0;

const REF = 8.0;   // reach that reads as "fully lit"

export class LightField {
  constructor(world) {
    this.world = world;
    this.x0 = 0; this.y0 = 0; this.w = 0; this.h = 0;
    this.buf = new Float32Array(0);
    this.tmp = [];
  }

  ensure(w, h) {
    if (this.buf.length < w * h) this.buf = new Float32Array(w * h);
  }

  /**
   * sources: flat array [x, y, reach, x, y, reach, ...] in TILE coords.
   * Returns nothing; read with sample(tx,ty).
   */
  compute(x0, y0, x1, y1, sources, ambient) {
    const world = this.world;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(world.w - 1, x1); y1 = Math.min(world.h - 1, y1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    this.ensure(w, h);
    this.x0 = x0; this.y0 = y0; this.w = w; this.h = h;
    const buf = this.buf;
    buf.fill(0, 0, w * h);

    // Ambient daylight bleeds down from the top of the first stratum only.
    const amb = ambient * REF;

    // Seed emissive tiles.
    const mat = world.mat, ww = world.w;
    for (let ty = y0; ty <= y1; ty++) {
      const row = ty * ww, brow = (ty - y0) * w;
      for (let tx = x0; tx <= x1; tx++) {
        const e = TILES[mat[row + tx]].emit;
        if (e > 0) {
          const v = 2.2 + e * 7.5;
          const bi = brow + (tx - x0);
          if (v > buf[bi]) buf[bi] = v;
        }
      }
    }
    // Seed explicit sources (lantern, explosions, glowmoth bursts).
    for (let i = 0; i < sources.length; i += 3) {
      const sx = sources[i] | 0, sy = sources[i + 1] | 0;
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
      const bi = (sy - y0) * w + (sx - x0);
      if (sources[i + 2] > buf[bi]) buf[bi] = sources[i + 2];
    }

    // Sweep. Three forward + backward passes converge well for a window this size.
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {
        const wrow = (y + y0) * ww, brow = y * w;
        for (let x = 0; x < w; x++) {
          const bi = brow + x;
          let v = buf[bi];
          const cost = ATT[mat[wrow + x + x0]];
          if (x > 0) { const n = buf[bi - 1] - cost; if (n > v) v = n; }
          if (y > 0) { const n = buf[bi - w] - cost; if (n > v) v = n; }
          buf[bi] = v;
        }
      }
      for (let y = h - 1; y >= 0; y--) {
        const wrow = (y + y0) * ww, brow = y * w;
        for (let x = w - 1; x >= 0; x--) {
          const bi = brow + x;
          let v = buf[bi];
          const cost = ATT[mat[wrow + x + x0]];
          if (x < w - 1) { const n = buf[bi + 1] - cost; if (n > v) v = n; }
          if (y < h - 1) { const n = buf[bi + w] - cost; if (n > v) v = n; }
          buf[bi] = v;
        }
      }
    }

    if (amb > 0) {
      for (let i = 0, n = w * h; i < n; i++) if (buf[i] < amb) buf[i] = amb;
    }

    // Remember what the player has seen. Explored-but-dark rock renders as a faint ghost,
    // which is what stops a deep mine from becoming a navigation puzzle.
    const seen = world.seen;
    for (let y = 0; y < h; y++) {
      const wrow = (y + y0) * ww, brow = y * w;
      for (let x = 0; x < w; x++) {
        if (buf[brow + x] > 1.2) {
          const i = wrow + x + x0;
          if (seen[i] < 255) seen[i] = 255;
        }
      }
    }
  }

  /** Brightness 0..1 at a tile. */
  sample(tx, ty) {
    const x = tx - this.x0, y = ty - this.y0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return clamp(this.buf[y * this.w + x] / REF, 0, 1);
  }
  raw(tx, ty) {
    const x = tx - this.x0, y = ty - this.y0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.buf[y * this.w + x];
  }
}
