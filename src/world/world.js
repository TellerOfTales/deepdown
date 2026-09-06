import { T, TILES, D, STRATA } from './tiles.js';
import { CFG, TS } from '../config.js';
import { hashf } from '../core/rng.js';

const NX = [1, -1, 0, 0], NY = [0, 0, 1, -1];

export class World {
  constructor(stratumIndex, seed) {
    const s = STRATA[stratumIndex];
    this.stratum = s;
    this.strataIdx = stratumIndex;
    this.seed = seed;
    this.w = s.w;
    this.h = s.height;
    const n = this.w * this.h;
    this.mat = new Uint8Array(n);
    this.dmg = new Float32Array(n);
    this.deco = new Uint8Array(n);
    this.light = new Float32Array(n);
    this.lightPrev = new Float32Array(n);
    this.seen = new Uint8Array(n);      // has the player ever lit this tile? (fog memory)
    this.entryTX = 4; this.entryTY = 2;
    this.shaftTX = this.w - 6; this.shaftTY = this.h - 6;
    this.spawns = [];
    this.props = [];
    this.hint = '';
    this.falling = [];                  // visually falling tiles
    this.settleQ = [];
    this.settleSet = new Set();
    this.liquidQ = [];
    this.liquidSet = new Set();
    this.settleTimer = 0;
    this.liquidTimer = 0;
    this.emitters = [];                 // cached emissive tile list, rebuilt lazily
    this.emitterDirty = true;
  }

  idx(tx, ty) { return ty * this.w + tx; }
  inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }

  get(tx, ty) {
    if (tx < 0 || tx >= this.w || ty < 0) return T.BEDROCK;
    if (ty >= this.h) return T.BEDROCK;
    return this.mat[ty * this.w + tx];
  }
  set(tx, ty, id) {
    if (!this.inb(tx, ty)) return;
    const i = ty * this.w + tx;
    this.mat[i] = id;
    this.dmg[i] = 0;
    if (TILES[id].emit > 0 || TILES[id].emit === 0) this.emitterDirty = true;
  }
  setDeco(tx, ty, d) { if (this.inb(tx, ty)) this.deco[ty * this.w + tx] = d; }
  getDeco(tx, ty) { return this.inb(tx, ty) ? this.deco[ty * this.w + tx] : 0; }

  solid(tx, ty) { return TILES[this.get(tx, ty)].solid; }
  air(tx, ty) { return this.get(tx, ty) === T.AIR; }
  liquidAt(tx, ty) { return TILES[this.get(tx, ty)].liquid; }

  /** 0 = pristine, 3 = about to pop. Drives the crack overlay. */
  stage(tx, ty) {
    if (!this.inb(tx, ty)) return 0;
    const i = ty * this.w + tx;
    const hp = TILES[this.mat[i]].hp;
    if (hp <= 0) return 0;
    const f = this.dmg[i] / hp;
    return f <= 0.001 ? 0 : f < 0.4 ? 1 : f < 0.75 ? 2 : 3;
  }

  /**
   * Apply one strike. Returns what happened so the caller can punctuate it with
   * hitstop / shake / particles / audio. World never plays effects itself.
   */
  strike(tx, ty, power, damage, opts) {
    const o = opts || {};
    const t = this.get(tx, ty);
    const info = TILES[t];
    const res = { hit: false, tooHard: false, tile: t, broke: false, broken: null, stage: 0, overkill: 0 };
    if (t === T.AIR || !info.diggable) { res.tooHard = info.solid && t !== T.AIR; return res; }
    if (power < info.power) { res.tooHard = true; return res; }

    res.hit = true;
    const i = ty * this.w + tx;
    this.dmg[i] += damage;
    if (this.dmg[i] >= info.hp) {
      const over = this.dmg[i] - info.hp;
      res.overkill = over;
      res.broke = true;
      res.broken = [];
      this.breakAt(tx, ty, 'direct', over, !!o.crit, res.broken, 0);
    } else {
      res.stage = this.stage(tx, ty);
    }
    return res;
  }

  /** Break a tile and propagate chain / shear. Pushes {tx,ty,tile,cause} into `out`. */
  breakAt(tx, ty, cause, overkill, crit, out, depth) {
    if (!this.inb(tx, ty)) return out;
    const i = ty * this.w + tx;
    const t = this.mat[i];
    const info = TILES[t];
    if (t === T.AIR || !info.diggable) return out;

    this.mat[i] = T.AIR;
    this.dmg[i] = 0;
    this.deco[i] = D.NONE;
    this.emitterDirty = true;
    out.push({ tx, ty, tile: t, cause });

    if (depth > 24 || out.length > 90) return out;

    // --- SHEAR: slate lets go along the bed it was laid down in. A crit rips a corridor open. ---
    if (info.shear > 0 && (cause === 'direct' || cause === 'shear')) {
      const reach = Math.min(info.shear, 1 + Math.floor(overkill * 1.6) + (crit ? 2 : 0));
      if (cause === 'direct') {
        for (const dir of [-1, 1]) {
          for (let k = 1; k <= reach; k++) {
            const nx = tx + dir * k;
            if (this.get(nx, ty) !== t) break;
            this.breakAt(nx, ty, 'shear', overkill * 0.4, false, out, depth + 1);
          }
        }
      }
    }

    // --- CHAIN: an already-fractured neighbour of the same family goes with it. ---
    const spill = overkill * CFG.chainSpill + info.chain * 0.5;
    if (spill > 0.05) {
      for (let k = 0; k < 4; k++) {
        const nx = tx + NX[k], ny = ty + NY[k];
        if (!this.inb(nx, ny)) continue;
        const ni = ny * this.w + nx;
        const nt = this.mat[ni];
        if (nt === T.AIR) continue;
        const ninfo = TILES[nt];
        if (!ninfo.diggable) continue;
        const kin = ninfo.fam === info.fam;
        if (!kin && this.dmg[ni] <= 0) continue;       // strangers only chain if already cracked
        const amount = kin ? spill : spill * 0.5;
        this.dmg[ni] += amount;
        if (this.dmg[ni] >= ninfo.hp) {
          this.breakAt(nx, ny, 'chain', this.dmg[ni] - ninfo.hp, false, out, depth + 1);
        }
      }
    }

    this.queueSettle(tx, ty);
    return out;
  }

  /** Wake the loose/liquid simulation around a hole. */
  queueSettle(tx, ty) {
    for (let dy = -2; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (!this.inb(nx, ny)) continue;
        const t = this.mat[ny * this.w + nx];
        if (t === T.AIR) continue;
        const info = TILES[t];
        if (info.loose) this.pushSettle(nx, ny);
        else if (info.liquid) this.pushLiquid(nx, ny);
      }
    }
  }
  pushSettle(tx, ty) {
    const k = ty * this.w + tx;
    if (this.settleSet.has(k)) return;
    this.settleSet.add(k); this.settleQ.push(k);
  }
  pushLiquid(tx, ty) {
    const k = ty * this.w + tx;
    if (this.liquidSet.has(k)) return;
    this.liquidSet.add(k); this.liquidQ.push(k);
  }

  /**
   * Run loose-material gravity and liquid flow.
   * Returns events the game turns into sound and dust: [{type:'land'|'flow', tx,ty,tile}]
   */
  update(dt, events) {
    // falling tiles (visual)
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.vy = Math.min(f.vy + CFG.gravity * 1.15 * dt, 290);   // < TS / maxFrameDt, or it tunnels
      f.y += f.vy * dt;
      const ty = Math.floor((f.y + TS - 1) / TS);
      if (this.get(f.tx, ty) !== T.AIR || ty >= this.h) {
        const rest = ty - 1;
        if (this.get(f.tx, rest) === T.AIR) this.set(f.tx, rest, f.tile);
        events.push({ type: 'land', tx: f.tx, ty: rest, tile: f.tile, vy: f.vy });
        this.falling.splice(i, 1);
        this.queueSettle(f.tx, rest);
      }
    }

    this.settleTimer -= dt;
    if (this.settleTimer <= 0) {
      this.settleTimer = 0.075;
      let budget = 90;
      while (this.settleQ.length && budget-- > 0) {
        const k = this.settleQ.shift();
        this.settleSet.delete(k);
        const tx = k % this.w, ty = (k / this.w) | 0;
        const t = this.mat[k];
        if (t === T.AIR || !TILES[t].loose) continue;
        if (this.get(tx, ty + 1) === T.AIR) {
          this.mat[k] = T.AIR; this.dmg[k] = 0; this.deco[k] = 0;
          this.emitterDirty = true;
          this.falling.push({ tx, y: ty * TS, vy: 30, tile: t });
          events.push({ type: 'fall', tx, ty, tile: t });
          this.queueSettle(tx, ty);
        }
      }
    }

    this.liquidTimer -= dt;
    if (this.liquidTimer <= 0) {
      this.liquidTimer = 0.11;
      let budget = 160;
      const wave = this.liquidQ;
      this.liquidQ = []; this.liquidSet = new Set();
      for (let n = 0; n < wave.length && budget-- > 0; n++) {
        const k = wave[n];
        const tx = k % this.w, ty = (k / this.w) | 0;
        const t = this.mat[k];
        if (!TILES[t].liquid) continue;
        if (this.get(tx, ty + 1) === T.AIR) {
          this.mat[k] = T.AIR; this.set(tx, ty + 1, t);
          this.pushLiquid(tx, ty + 1); this.queueSettle(tx, ty);
          events.push({ type: 'flow', tx, ty: ty + 1, tile: t });
        } else {
          const order = hashf(tx, ty, 7) < 0.5 ? [-1, 1] : [1, -1];
          for (const d of order) {
            if (this.get(tx + d, ty) === T.AIR && this.get(tx + d, ty + 1) !== T.AIR) {
              this.mat[k] = T.AIR; this.set(tx + d, ty, t);
              this.pushLiquid(tx + d, ty); this.queueSettle(tx, ty);
              events.push({ type: 'flow', tx: tx + d, ty, tile: t });
              break;
            }
          }
        }
      }
    }
    return events;
  }

  /** Emissive tiles inside a window, for the lighting pass. */
  collectEmitters(x0, y0, x1, y1, out) {
    out.length = 0;
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= this.h) continue;
      const row = ty * this.w;
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || tx >= this.w) continue;
        const e = TILES[this.mat[row + tx]].emit;
        if (e > 0) out.push(tx, ty, e);
      }
    }
    return out;
  }
}
