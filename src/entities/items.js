// Loot. The physical payoff of every break.
//
// GDD §14: the 2-second YES is "a satisfying block breaks"; the pickup is its exclamation mark.
// Nuggets are thrown OUT of the rock, arc, bounce, and then magnetise — the magnet is what turns
// "collecting" into a small involuntary smile instead of a chore.

import { CFG, TS, WEIGHT } from '../config.js';
import { clamp } from '../core/rng.js';

export class Loot {
  constructor() { this.list = []; this.pool = []; }

  spawn(x, y, kind, value, rand, dirX, dirY) {
    const o = this.pool.pop() || {};
    o.kind = kind; o.value = value;
    o.x = x; o.y = y;
    const a = rand ? rand.f(-1, 1) : 0;
    const spd = 40 + (rand ? rand.f(0, 55) : 20);
    o.vx = (dirX || 0) * -22 + a * spd;
    o.vy = -50 - (rand ? rand.f(0, 60) : 30) + (dirY || 0) * -14;
    o.t = 0; o.mag = 0; o.dead = false; o.rest = 0; o.reject = 0;
    o.spin = rand ? rand.f(0, 6) : 0;
    this.list.push(o);
    return o;
  }

  clear() { for (const o of this.list) this.pool.push(o); this.list.length = 0; }

  update(dt, world, player, ctx) {
    const px = player.x, py = player.y - player.h * 0.55;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.t += dt;
      const dx = px - o.x, dy = py - o.y;
      const d2 = dx * dx + dy * dy;

      if (o.reject > 0) o.reject -= dt;
      if (o.t > 0.22 && o.reject <= 0 && d2 < CFG.magnetRadius * CFG.magnetRadius) {
        const d = Math.max(1, Math.sqrt(d2));
        const pull = CFG.magnetForce * (1 - d / CFG.magnetRadius) * dt;
        o.vx += dx / d * pull; o.vy += dy / d * pull;
        o.mag = clamp(o.mag + dt * 5, 0, 1);
      } else {
        o.mag = Math.max(0, o.mag - dt * 3);
        o.vy += CFG.gravity * 0.85 * dt;
        o.vx *= 1 - 2.2 * dt;
      }

      // cheap tile collision — loot must never fall through the floor it was born on
      let nx = o.x + o.vx * dt, ny = o.y + o.vy * dt;
      if (o.mag < 0.4) {
        if (world.solid(Math.floor(nx / TS), Math.floor(o.y / TS))) { o.vx *= -0.35; nx = o.x; }
        if (world.solid(Math.floor(nx / TS), Math.floor(ny / TS))) {
          if (o.vy > 0) { o.vy = -o.vy * 0.3; if (Math.abs(o.vy) < 26) { o.vy = 0; o.rest = 1; } }
          else o.vy = 0;
          ny = o.y;
        }
      }
      o.x = nx; o.y = ny;

      if (d2 < CFG.pickupRadius * CFG.pickupRadius && o.t > 0.14 && o.reject <= 0) {
        if (ctx.collect(o)) { this.pool.push(o); this.list.splice(i, 1); }
        else {
          // Refused. Push it clear and give it a cooling-off period so it does not nag.
          o.reject = 1.6;
          o.vx = -dx * 1.6; o.vy = -Math.abs(dy) * 1.2 - 60;
          o.mag = 0;
        }
      }
    }
  }
}
