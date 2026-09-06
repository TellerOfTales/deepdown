import { VW, VH, TS, CFG } from '../config.js';
import { clamp, damp } from '../core/rng.js';

/**
 * The camera is a feel system, not a transform. Shake, punch and lead are how a strike
 * reaches past the screen and hits the player in the chest. GDD §20: "Never obscure
 * spatial readability" — so every impulse is short, damped, and pixel-snapped on output.
 */
export class Camera {
  constructor() {
    this.x = 0; this.y = 0;         // top-left of the view, world px
    this.tx = 0; this.ty = 0;
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    this.punchX = 0; this.punchY = 0;
    this.leadX = 0; this.leadY = 0;
    this.seed = 1337;
  }

  snapTo(px, py, world) { this.tx = px; this.ty = py; this.x = px; this.y = py; this.clampTo(world); this.x = this.tx; this.y = this.ty; }

  /** Aim at the player, biased slightly toward where they are looking and moving. */
  follow(player, dt, world) {
    const lookX = player.digDir[0] * 22 + clamp(player.vx * 0.22, -26, 26);
    const lookY = player.digDir[1] * 20 + clamp(player.vy * 0.10, -20, 34);
    this.leadX = damp(this.leadX, lookX, 3.4, dt);
    this.leadY = damp(this.leadY, lookY, 3.0, dt);
    const targetX = player.x + this.leadX - VW / 2;
    const targetY = player.y - player.h * 0.5 + this.leadY - VH / 2;
    this.tx = damp(this.tx, targetX, 9.5, dt);
    this.ty = damp(this.ty, targetY, 8.0, dt);
    this.clampTo(world);
    this.update(dt);
  }

  clampTo(world) {
    const maxX = world.w * TS - VW, maxY = world.h * TS - VH;
    this.tx = maxX <= 0 ? maxX / 2 : clamp(this.tx, 0, maxX);
    this.ty = maxY <= 0 ? maxY / 2 : clamp(this.ty, 0, maxY);
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * (10 + this.shake * 5.5));
    this.punchX = damp(this.punchX, 0, 13, dt);
    this.punchY = damp(this.punchY, 0, 13, dt);
    // Deterministic-ish noise so shake never looks like random jitter — it looks like a hit.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    const a = ((this.seed >>> 16) & 255) / 255 * Math.PI * 2;
    const amp = this.shake;
    this.shakeX = Math.cos(a) * amp;
    this.shakeY = Math.sin(a * 1.7) * amp * 0.8;
    this.x = this.tx + this.shakeX + this.punchX;
    this.y = this.ty + this.shakeY + this.punchY;
  }

  addShake(a) { this.shake = Math.min(11, this.shake + a); }
  punch(dx, dy, amount) {
    this.punchX = clamp(this.punchX + dx * amount, -9, 9);
    this.punchY = clamp(this.punchY + dy * amount, -9, 9);
  }
  get ix() { return Math.round(this.x); }
  get iy() { return Math.round(this.y); }
}
