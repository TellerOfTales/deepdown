// Particles.
//
// This module is over half of how DEEPER feels. GDD §13: "Particles should reinforce material
// identity." A dirt puff and a crystal burst are not the same effect in a different colour —
// they have different masses, different lifetimes, and different ideas about gravity.
//
// One preallocated pool, zero allocation in update(), two draw passes (normal, then additive).

import { P } from '../art/pal.js';
import { text, measure } from '../art/font.js';
import { clamp } from '../core/rng.js';

const MAX = 1600;
const TEXT_RESERVE = 56;

const SHAPE = { PIXEL: 0, RECT: 1, STREAK: 2, RING: 3, TEXT: 4, SPARK: 5 };

// Deterministic per-FX jitter. Particles must never call Math.random (replays, and it is rude).
let rndState = 0x2545f491;
function rnd() {
  rndState ^= rndState << 13; rndState >>>= 0;
  rndState ^= rndState >> 17;
  rndState ^= rndState << 5; rndState >>>= 0;
  return rndState / 4294967296;
}
const rr = (a, b) => a + rnd() * (b - a);
const pick2 = (v, d) => (Array.isArray(v) ? rr(v[0], v[1]) : (v === undefined ? d : v));

function mk() {
  return {
    alive: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
    life: 0, maxLife: 1, size: 1, color: '#fff', ramp: null,
    drag: 0, bounce: 0, floorY: null, glow: false, shape: 0,
    rot: 0, vrot: 0, fade: 1, grow: 0, text: '', scale: 1, born: 0,
    r0: 0, r1: 0, thick: 1, pop: 0,
  };
}

export class FX {
  constructor() {
    this.pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) this.pool[i] = mk();
    this.head = 0;
    this.textHead = MAX - TEXT_RESERVE;
    this.live = 0;
  }

  clear() { for (const p of this.pool) p.alive = false; this.live = 0; }
  count() { let n = 0; for (const p of this.pool) if (p.alive) n++; return n; }

  /** Oldest-first recycling: a debris storm can never eat the value popups. */
  _get(isText) {
    if (isText) {
      for (let i = 0; i < TEXT_RESERVE; i++) {
        const p = this.pool[MAX - TEXT_RESERVE + ((this.textHead + i) % TEXT_RESERVE)];
        if (!p.alive) { this.textHead = (this.textHead + i + 1) % TEXT_RESERVE; return p; }
      }
      this.textHead = (this.textHead + 1) % TEXT_RESERVE;
      return this.pool[MAX - TEXT_RESERVE + this.textHead];
    }
    const limit = MAX - TEXT_RESERVE;
    for (let i = 0; i < limit; i++) {
      const p = this.pool[(this.head + i) % limit];
      if (!p.alive) { this.head = (this.head + i + 1) % limit; return p; }
    }
    this.head = (this.head + 1) % limit;
    return this.pool[this.head];
  }

  // ── generic emitter ────────────────────────────────────────────────────────
  burst(x, y, o) {
    const n = o.n === undefined ? 6 : o.n;
    const angle = o.angle === undefined ? -Math.PI / 2 : o.angle;
    const spread = o.spread === undefined ? Math.PI * 2 : o.spread;
    for (let i = 0; i < n; i++) {
      const p = this._get(false);
      p.alive = true;
      p.x = x + (o.jitter ? rr(-o.jitter, o.jitter) : 0);
      p.y = y + (o.jitter ? rr(-o.jitter, o.jitter) : 0);
      const a = angle + rr(-spread / 2, spread / 2);
      const s = pick2(o.speed, 60);
      p.vx = Math.cos(a) * s + (o.vx || 0);
      p.vy = Math.sin(a) * s + (o.vy || 0);
      p.ax = 0; p.ay = o.gravity || 0;
      p.maxLife = pick2(o.life, 0.5);
      p.life = p.maxLife;
      p.size = Math.max(1, Math.round(pick2(o.size, 1)));
      p.ramp = o.colors || null;
      p.color = o.colors ? o.colors[0] : (o.color || P.ROCK4);
      p.drag = o.drag || 0;
      p.bounce = o.bounce || 0;
      p.floorY = o.floorY === undefined ? null : o.floorY;
      p.glow = !!o.glow;
      p.shape = o.shape === undefined ? SHAPE.RECT : o.shape;
      p.rot = 0; p.vrot = o.spin ? rr(-o.spin, o.spin) : 0;
      p.fade = o.fade === undefined ? 1 : o.fade;
      p.grow = o.grow || 0;
      p.scale = 1; p.pop = 0;
    }
  }

  // ── named emitters ─────────────────────────────────────────────────────────

  /** Chunky fragments thrown AGAINST the swing. The bread and butter of every break. */
  debris(x, y, color, n, dirX, dirY, floorY) {
    // Default to the bottom of the tile the fragment came from. Without a floor the bounce and
    // settle branch is unreachable and every chip of rock in the game sinks through the ground.
    if (floorY === undefined || floorY === null) floorY = Math.floor(y / 16) * 16 + 15;
    const a = Math.atan2(-(dirY || 0), -(dirX || 0)) || -Math.PI / 2;
    this.burst(x, y, {
      color, n, angle: (dirX || dirY) ? a : -Math.PI / 2, spread: (dirX || dirY) ? 2.0 : Math.PI * 2,
      speed: [55, 185], life: [0.40, 1.05], gravity: 700, size: [1, 3],
      bounce: 0.35, drag: 0.6, floorY, spin: 7, jitter: 3,
    });
  }

  /** Soft, weightless, drifts up while it grows. The breath of the rock. */
  dust(x, y, color, n) {
    this.burst(x, y, {
      color, n, angle: -Math.PI / 2, spread: Math.PI * 1.6,
      speed: [6, 34], life: [0.45, 1.15], gravity: -16, size: [1, 2],
      drag: 1.9, grow: 2.2, jitter: 4, fade: 1.3,
    });
  }

  /** Fast, bright, gone. Granite, metal, refused strikes, crits. */
  sparks(x, y, color, n, dirX, dirY) {
    const a = Math.atan2(-(dirY || 0), -(dirX || 0)) || -Math.PI / 2;
    this.burst(x, y, {
      color, n, angle: (dirX || dirY) ? a : -Math.PI / 2, spread: 1.5,
      speed: [95, 265], life: [0.09, 0.27], gravity: 260, size: [1, 2],
      drag: 6, glow: true, shape: SHAPE.STREAK, jitter: 2,
    });
  }

  /** Crystal only. Splinters that spin and cool from white through cyan. */
  shards(x, y, color, n) {
    this.burst(x, y, {
      colors: [P.CYAN5, P.CYAN4, color || P.CYAN3, P.CYAN2], n,
      spread: Math.PI * 2, speed: [50, 175], life: [0.35, 0.8], gravity: 240,
      size: [1, 2], glow: true, spin: 12, drag: 1.2, shape: SHAPE.STREAK, jitter: 3,
    });
  }

  /** An expanding pixel ring. Never ctx.arc — it has to look drawn, not rendered. */
  ring(x, y, color, o) {
    o = o || {};
    const p = this._get(false);
    p.alive = true;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0;
    p.maxLife = o.life === undefined ? 0.28 : o.life;
    p.life = p.maxLife;
    p.r0 = o.r0 === undefined ? 2 : o.r0;
    p.r1 = o.r === undefined ? 22 : o.r;
    p.thick = o.thick || 1;
    p.color = color; p.ramp = o.colors || null;
    p.glow = o.glow === undefined ? true : o.glow;
    p.shape = SHAPE.RING; p.size = 1; p.drag = 0; p.bounce = 0; p.floorY = null;
    p.fade = o.fade === undefined ? 1 : o.fade;
  }

  /** A four-point twinkle. Used sparingly — it means "this is worth something". */
  glint(x, y, color) {
    const p = this._get(false);
    p.alive = true;
    p.x = x; p.y = y; p.vx = 0; p.vy = -6; p.ax = 0; p.ay = 0;
    p.maxLife = 0.42; p.life = p.maxLife;
    p.color = color; p.ramp = null; p.glow = true;
    p.shape = SHAPE.SPARK; p.size = 5; p.drag = 0; p.bounce = 0; p.floorY = null;
    p.fade = 1; p.rot = 0; p.vrot = 0;
  }

  /** Airflow. Slow enough that you notice it only if you are paying attention — which is the point. */
  motes(x, y, dirX, dirY, n) {
    for (let i = 0; i < (n || 3); i++) {
      const p = this._get(false);
      p.alive = true;
      p.x = x + rr(-6, 6); p.y = y + rr(-6, 6);
      p.vx = (dirX || 0) * rr(7, 19) + rr(-3, 3);
      p.vy = (dirY || 0) * rr(7, 19) + rr(-3, 3);
      p.ax = 0; p.ay = 0;
      p.maxLife = rr(1.5, 3.0); p.life = p.maxLife;
      p.color = P.ROCK6; p.ramp = null; p.glow = true;
      p.shape = SHAPE.PIXEL; p.size = 1; p.drag = 0.15; p.bounce = 0; p.floorY = null;
      p.fade = 3.2; p.rot = 0; p.vrot = 0; p.grow = 0;
    }
  }

  drip(x, y) {
    const p = this._get(false);
    p.alive = true;
    p.x = x; p.y = y; p.vx = rr(-4, 4); p.vy = 10;
    p.ax = 0; p.ay = 520;
    p.maxLife = rr(0.5, 1.1); p.life = p.maxLife;
    p.color = P.WAT4; p.ramp = null; p.glow = false;
    p.shape = SHAPE.STREAK; p.size = 1; p.drag = 0; p.bounce = 0; p.floorY = null; p.fade = 1;
  }

  ember(x, y) {
    this.burst(x, y, {
      colors: [P.MAG5, P.MAG4, P.MAG3, P.MAG1], n: 1,
      angle: -Math.PI / 2, spread: 0.9, speed: [12, 34], life: [0.8, 1.7],
      gravity: -22, size: [1, 1], glow: true, drag: 0.5, jitter: 4,
    });
  }

  smoke(x, y, n) {
    this.burst(x, y, {
      colors: [P.ROCK2, P.ROCK1, P.INK], n: n || 4,
      angle: -Math.PI / 2, spread: 1.1, speed: [8, 26], life: [0.9, 1.8],
      gravity: -26, size: [2, 4], drag: 1.4, grow: 3.4, jitter: 4, fade: 1.5,
    });
  }

  /** Rising pixel text with a 2-frame scale overshoot. The exclamation mark of the loop. */
  popup(x, y, str, color, o) {
    o = o || {};
    const p = this._get(true);
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = o.drift === undefined ? rr(-6, 6) : o.drift;
    p.vy = o.vy === undefined ? -42 : o.vy;
    p.ax = 0; p.ay = 46;
    p.maxLife = o.life === undefined ? 0.85 : o.life;
    p.life = p.maxLife;
    p.color = color || P.UI_GOLD; p.ramp = null;
    p.shape = SHAPE.TEXT; p.text = String(str);
    p.scale = o.scale === undefined ? 1 : o.scale;
    p.pop = o.pop === false ? 0 : 1;
    p.drag = 1.6; p.bounce = 0; p.floorY = null; p.glow = false; p.fade = 1;
    p.size = o.shadow === false ? 0 : 1;
  }

  trail(x, y, color) {
    const p = this._get(false);
    p.alive = true;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0;
    p.maxLife = 0.12; p.life = p.maxLife;
    p.color = color; p.ramp = null; p.glow = true;
    p.shape = SHAPE.PIXEL; p.size = 1; p.drag = 0; p.bounce = 0; p.floorY = null; p.fade = 1;
  }

  // ── simulation ─────────────────────────────────────────────────────────────
  update(dt) {
    const pool = this.pool;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      if (p.shape === SHAPE.RING) continue;
      if (p.drag) {
        const d = 1 - Math.min(0.98, p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.floorY !== null && p.y > p.floorY && p.vy > 0) {
        p.y = p.floorY;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.7;
        if (Math.abs(p.vy) < 22) { p.vy = 0; p.ay = 0; p.floorY = null; }
      }
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 9);
    }
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  _alpha(p) {
    const t = p.life / p.maxLife;
    return clamp(t * p.fade, 0, 1);
  }
  _color(p) {
    if (!p.ramp) return p.color;
    const t = 1 - p.life / p.maxLife;
    return p.ramp[Math.min(p.ramp.length - 1, (t * p.ramp.length) | 0)];
  }

  draw(g, camX, camY) { this._pass(g, camX, camY, false); }
  drawGlow(g, camX, camY) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    this._pass(g, camX, camY, true);
    g.restore();
  }

  _pass(g, camX, camY, glowPass) {
    const pool = this.pool;
    let curAlpha = -1, curColor = '';
    g.save();
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.alive || !!p.glow !== glowPass) continue;
      const a = this._alpha(p);
      if (a <= 0.02) continue;
      const x = Math.round(p.x - camX), y = Math.round(p.y - camY);

      if (p.shape === SHAPE.TEXT) {
        // 0.7, not 0.55: fx.update() runs in the same frame the popup is emitted, so by the
        // first draw pop is already ~0.85 and Math.round() flattened a scale-1 popup back to 1.
        const sc = p.scale * (1 + p.pop * 0.7);
        text(g, p.text, x, y, {
          color: p.color, scale: Math.max(1, Math.round(sc)), align: 'center',
          shadow: p.size > 0, alpha: a,
        });
        curAlpha = -1; curColor = '';
        continue;
      }

      if (a !== curAlpha) { g.globalAlpha = a; curAlpha = a; }
      const col = this._color(p);
      if (col !== curColor) { g.fillStyle = col; curColor = col; }

      switch (p.shape) {
        case SHAPE.RING: {
          const t = 1 - p.life / p.maxLife;
          const r = Math.round(p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - t, 2.2)));
          pixelRing(g, x, y, r, p.thick);
          break;
        }
        case SHAPE.STREAK: {
          const len = clamp(Math.hypot(p.vx, p.vy) * 0.022, 1, 5) | 0;
          const dx = Math.sign(p.vx) | 0, dy = Math.sign(p.vy) | 0;
          for (let k = 0; k < len; k++) g.fillRect(x - dx * k, y - dy * k, p.size, p.size);
          break;
        }
        case SHAPE.SPARK: {
          const s = Math.max(1, Math.round(p.size * (p.life / p.maxLife)));
          g.fillRect(x - s, y, s * 2 + 1, 1);
          g.fillRect(x, y - s, 1, s * 2 + 1);
          g.fillRect(x - 1, y - 1, 3, 3);
          break;
        }
        case SHAPE.PIXEL:
          g.fillRect(x, y, 1, 1);
          break;
        default: {
          const s = Math.max(1, Math.round(p.size + p.grow * (1 - p.life / p.maxLife)));
          g.fillRect(x - (s >> 1), y - (s >> 1), s, s);
        }
      }
    }
    g.restore();
  }
}

/** Bresenham-ish midpoint circle, drawn as pixels because it has to look drawn. */
export function pixelRing(g, cx, cy, r, thick) {
  if (r <= 0) return;
  let x = r, y = 0, err = 1 - r;
  const t = Math.max(1, thick | 0);
  while (x >= y) {
    g.fillRect(cx + x, cy + y, t, t); g.fillRect(cx + y, cy + x, t, t);
    g.fillRect(cx - y, cy + x, t, t); g.fillRect(cx - x, cy + y, t, t);
    g.fillRect(cx - x, cy - y, t, t); g.fillRect(cx - y, cy - x, t, t);
    g.fillRect(cx + y, cy - x, t, t); g.fillRect(cx + x, cy - y, t, t);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

// ── composed punctuation ─────────────────────────────────────────────────────
// These are the ones the game calls a hundred times a minute. They are deliberate
// compositions, not defaults with a colour swapped in.

export function fxStrike(fx, x, y, tinfo, dirX, dirY, crit) {
  const c = tinfo.dust;
  fx.debris(x, y, c, crit ? 6 : 3, dirX, dirY);
  fx.dust(x, y, c, 2);
  if (tinfo.spark) fx.sparks(x, y, P.STEEL4, crit ? 6 : 3, dirX, dirY);
  if (crit) {
    fx.sparks(x, y, tinfo.fam === 'cyan' ? P.CYAN5 : P.UI_BONE, 7, dirX, dirY);
    fx.ring(x, y, c, { r: 12, life: 0.20 });
    fx.glint(x, y, P.UI_WHITE);
  }
}

export function fxBreak(fx, x, y, tinfo, o) {
  o = o || {};
  const c = tinfo.dust;
  const n = o.big ? 14 : o.chain ? 7 : 10;
  fx.debris(x, y, c, n, 0, 0);
  fx.dust(x, y, c, o.big ? 7 : 4);
  if (tinfo.fam === 'cyan' || tinfo.fam === 'gem') { fx.shards(x, y, c, 9); fx.ring(x, y, c, { r: 17, life: 0.3 }); }
  if (tinfo.fam === 'gold' || tinfo.fam === 'relic') { fx.glint(x, y, P.GOLD5); fx.ring(x, y, P.GOLD4, { r: 15, life: 0.28 }); }
  if (tinfo.fam === 'magma') { for (let i = 0; i < 5; i++) fx.ember(x, y); }
  if (tinfo.fam === 'granite' || tinfo.fam === 'ruin') fx.sparks(x, y, P.STEEL4, 5, 0, 0);
  if (o.shear) fx.dust(x, y, c, 3);
}

export function fxShear(fx, x, y, dirX, color) {
  fx.burst(x, y, {
    color, n: 16, angle: dirX >= 0 ? 0 : Math.PI, spread: 0.55,
    speed: [110, 300], life: [0.25, 0.6], gravity: 420, size: [1, 2], drag: 1.4, spin: 6,
  });
  fx.dust(x, y, color, 6);
}

export function fxCollapse(fx, x, y, n) {
  fx.burst(x, y, {
    color: P.ROCK3, n: n || 24, spread: Math.PI * 2, speed: [60, 260],
    life: [0.4, 1.3], gravity: 760, size: [1, 3], bounce: 0.3, drag: 0.8, spin: 9,
  });
  fx.smoke(x, y, 10);
  fx.ring(x, y, P.MAG4, { r: 46, life: 0.42, thick: 2 });
  fx.sparks(x, y, P.MAG5, 18, 0, 0);
}

export function fxValue(fx, x, y, amount, color) {
  fx.popup(x, y - 4, '+' + amount, color, { scale: amount >= 300 ? 2 : 1, life: amount >= 300 ? 1.15 : 0.85 });
  fx.glint(x, y, color);
}

/** The big one. A correct prediction has to be louder than an accident. */
export function fxDiscovery(fx, x, y, color) {
  fx.ring(x, y, color, { r: 34, life: 0.55, thick: 2 });
  fx.ring(x, y, P.UI_WHITE, { r: 20, life: 0.34 });
  fx.ring(x, y, color, { r: 62, life: 0.85, fade: 0.45 });
  for (let i = 0; i < 7; i++) fx.glint(x + (rnd() - 0.5) * 54, y + (rnd() - 0.5) * 40, color);
  fx.dust(x, y, P.ROCK3, 16);
  fx.sparks(x, y, color, 16, 0, 0);
}

/** Air escaping a cavity you just opened. The room exhales. */
export function fxHollowPuff(fx, x, y, dirX, dirY) {
  fx.burst(x, y, {
    color: P.ROCK5, n: 9, angle: Math.atan2(-(dirY || 0), -(dirX || 0)) || -Math.PI / 2,
    spread: 1.1, speed: [30, 95], life: [0.5, 1.1], gravity: -14, size: [1, 2],
    drag: 1.6, grow: 2.6, fade: 1.4,
  });
  fx.motes(x, y, -(dirX || 0), -(dirY || 0), 5);
}

export { SHAPE };
