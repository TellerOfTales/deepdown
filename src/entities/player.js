// The miner.
//
// Everything in this file exists to serve GDD Pillar 1: "Digging must feel good with no
// progression attached." Read the strike section first — it is the whole game.

import { CFG, TS, WEIGHT } from '../config.js';
import { T, TILES } from '../world/tiles.js';
import { clamp, damp } from '../core/rng.js';

export const ANIM = {
  IDLE: 'IDLE', WALK: 'WALK', JUMP: 'JUMP', FALL: 'FALL', LAND: 'LAND',
  DIG_SIDE: 'DIG_SIDE', DIG_DOWN: 'DIG_DOWN', DIG_UP: 'DIG_UP',
  CHARGE: 'CHARGE', CLIMB: 'CLIMB', HURT: 'HURT', DEAD: 'DEAD',
};

// Damage lands on press; the animation therefore starts at the CONTACT frame and winds back up
// during recovery, so the anticipation you see belongs to the NEXT strike. Zero latency, full arc.
const DIG_FRAME_ORDER = [1, 2, 3, 0];

export class Player {
  constructor() {
    this.w = CFG.playerW; this.h = CFG.playerH;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x; this.y = y;             // x = centre, y = feet
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.wasOnGround = false;
    this.facing = 1;
    this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = false;
    this.climbing = false; this.climbT = 0;
    this.fallFrom = y; this.falling = false;

    this.maxHp = CFG.maxHealth; this.hp = this.maxHp;
    this.lightMax = CFG.lightMax; this.light = this.lightMax;
    this.toolMax = CFG.toolMax; this.tool = this.toolMax;
    this.carryMax = CFG.carryMax;
    this.invuln = 0; this.dead = false; this.deadT = 0;
    this.hurtT = 0; this.flash = 0;
    this.dim = false;

    // --- strike state ---
    this.readyAt = 0;          // time (game seconds) at which the pick is usable again
    this.lastStrikeT = -9;
    this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.perfectOpen = false; this.perfectPhase = 0;
    this.windowAnnounced = false;
    this.digAnimT = 99; this.digAnim = ANIM.DIG_SIDE;
    this.digDir = [1, 0];
    this.charge = 0; this.charging = false; this.chargeReady = false;
    this.digHeldT = 0;
    this.lastStrikeX = 0; this.lastStrikeY = 0; this.lastStrikeT = 0;
    this.aim = { tx: 0, ty: 0, tile: 0, valid: false, second: -1 };
    this.recoilX = 0; this.recoilY = 0;

    // --- upgrades resolved into flat numbers by game.js ---
    this.pickPower = 1; this.dmgMul = 1; this.lanternR = CFG.lanternRadius;
    this.lightDrain = CFG.lightDrain; this.heavyTime = CFG.heavyChargeTime;
    this.fleckRange = 1; this.resonance = false; this.spikes = false;
    this.fallSafe = CFG.fallSafe; this.chargesMax = { bomb: 0, sonar: 0 };
    this.charges = { bomb: 0, sonar: 0 };
    this.beacon = false; this.beaconUsed = false;

    this.animT = 0; this.anim = ANIM.IDLE;
    this.stepT = 0; this.landT = 0;
    this.pickupStreak = 0; this.pickupStreakT = 0;
  }

  get cx() { return this.x; }
  get cy() { return this.y - this.h * 0.5; }

  // ── collision ───────────────────────────────────────────────────────────────
  solidAt(world, px, py) { return world.solid(Math.floor(px / TS), Math.floor(py / TS)); }

  boxSolid(world, x, y) {
    const hw = this.w / 2;
    const x0 = Math.floor((x - hw) / TS), x1 = Math.floor((x + hw - 0.01) / TS);
    const y0 = Math.floor((y - this.h) / TS), y1 = Math.floor((y - 0.01) / TS);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (world.solid(tx, ty)) return true;
    return false;
  }

  moveAxis(world, dx, dy) {
    const step = 1;
    if (dx !== 0) {
      const sgn = Math.sign(dx);
      let rem = Math.abs(dx);
      while (rem > 0) {
        const d = Math.min(step, rem); rem -= d;
        const nx = this.x + sgn * d;
        if (this.boxSolid(world, nx, this.y)) {
          // step up a single 1px lip so gravel and rubble do not snag the player
          if (!this.boxSolid(world, nx, this.y - 4) && this.onGround) { this.y -= 4; this.x = nx; }
          else { this.vx = 0; break; }
        } else this.x = nx;
      }
    }
    if (dy !== 0) {
      const sgn = Math.sign(dy);
      let rem = Math.abs(dy);
      while (rem > 0) {
        const d = Math.min(step, rem); rem -= d;
        const ny = this.y + sgn * d;
        if (this.boxSolid(world, this.x, ny)) {
          if (sgn > 0) this.onGround = true;
          this.vy = 0; break;
        } else this.y = ny;
      }
    }
  }

  /**
   * Can the player brace against the walls here and climb?
   *
   * Bare-handed this needs rock on BOTH sides — you are wedging yourself in a chimney, not
   * scaling a cliff — but it reaches two tiles out rather than one. That matters more than it
   * sounds: a shaft dug by hand wanders, and on a touchscreen it wanders a lot. A player who
   * drifts one tile sideways while digging down used to seal themselves in a hole they could
   * not climb, with no warning that a two-wide shaft was a different thing from a one-wide one.
   *
   * CLIMBING SPIKES still buy what they say on the tin: one wall is enough, anywhere.
   */
  inChimney(world) {
    const ty = Math.floor((this.y - this.h * 0.5) / TS);
    const cx = Math.floor(this.x / TS);
    // Standing inside rock is not standing in a shaft.
    if (world.solid(cx, ty)) return false;
    // Distances to the nearest wall each side, 0 for "no wall within reach".
    let dl = 0, dr = 0;
    for (let d = 1; d <= 2; d++) {
      if (!dl && world.solid(cx - d, ty)) dl = d;
      if (!dr && world.solid(cx + d, ty)) dr = d;
    }
    if (this.spikes) {
      // Spikes bite a wall you are ACTUALLY AGAINST. Reaching two tiles for them let the miner
      // climb open air alongside a cavern wall they were nowhere near.
      if (dl !== 1 && dr !== 1) return false;
    } else {
      // Bare-handed you are wedging yourself between two walls, so both have to be there and
      // the gap has to be narrow enough to brace: dl + dr of 2 or 3 is a shaft one or two tiles
      // wide. Four is three tiles wide, and nobody braces across that.
      if (!dl || !dr || dl + dr > 3) return false;
    }
    // There must be somewhere to go, or standing in a dug corridor and aiming up would make
    // the miner hover instead of stand.
    const headTY = Math.floor((this.y - this.h - 1) / TS);
    const footTY = Math.floor((this.y + 1) / TS);
    return !world.solid(Math.floor(this.x / TS), headTY) || !world.solid(Math.floor(this.x / TS), footTY);
  }

  // ── main update ─────────────────────────────────────────────────────────────
  update(dt, input, world, ctx) {
    const now = ctx.t;
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.pickupStreakT = Math.max(0, this.pickupStreakT - dt);
    this.lastStrikeT = Math.max(0, this.lastStrikeT - dt);
    if (this.pickupStreakT <= 0) this.pickupStreak = 0;
    this.recoilX = damp(this.recoilX, 0, 16, dt);
    this.recoilY = damp(this.recoilY, 0, 16, dt);

    if (this.dead) {
      this.deadT += dt;
      this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
      this.onGround = false;
      this.moveAxis(world, this.vx * dt, 0);
      this.moveAxis(world, 0, this.vy * dt);
      this.vx = damp(this.vx, 0, 6, dt);
      this.anim = ANIM.DEAD; this.animT += dt;
      return;
    }

    // ── resources ────────────────────────────────────────────────────────────
    const drain = this.lightDrain * (this.dim ? 0.45 : 1);
    this.light = Math.max(0, this.light - drain * dt);

    // ── input -> intent ──────────────────────────────────────────────────────
    let ix = 0;
    if (input.held('left')) ix -= 1;
    if (input.held('right')) ix += 1;
    const holdUp = input.held('up'), holdDown = input.held('down');
    if (ix !== 0) this.facing = ix;

    // Mouse aiming: if the player is using a mouse, the pointer picks the dig direction.
    let aimX = ix, aimY = 0;
    if (holdDown) { aimX = 0; aimY = 1; }
    else if (holdUp) { aimX = 0; aimY = -1; }
    else if (ix === 0) aimX = this.facing;

    if (input.lastDevice === 'mouse' && input.mouseInside && ctx.mouseWorld) {
      const mdx = ctx.mouseWorld.x - this.x;
      const mdy = ctx.mouseWorld.y - this.cy;
      if (Math.abs(mdx) > 6 || Math.abs(mdy) > 6) {
        if (Math.abs(mdx) >= Math.abs(mdy)) { aimX = Math.sign(mdx); aimY = 0; this.facing = aimX; }
        else { aimX = 0; aimY = Math.sign(mdy); }
      }
    }
    this.digDir[0] = aimX; this.digDir[1] = aimY;

    // ── horizontal movement (a full bag genuinely slows you down) ────────────
    const loadPenalty = 1 - 0.20 * clamp((ctx.weight || 0) / this.carryMax, 0, 1);
    const targetVX = ix * CFG.runSpeed * loadPenalty;
    const acc = this.onGround ? (ix !== 0 ? CFG.accel : CFG.friction) : CFG.airAccel;
    if (ix !== 0 || this.onGround) {
      const dv = targetVX - this.vx;
      const maxD = acc * dt;
      this.vx += clamp(dv, -maxD, maxD);
    }

    // ── climbing a chimney ───────────────────────────────────────────────────
    const chim = this.inChimney(world);
    this.climbing = false;
    if (chim && (holdUp || holdDown)) {
      this.climbing = true;
      this.vy = (holdUp ? -1 : 1) * CFG.climbSpeed;
      this.vx *= 0.4;
      this.climbT += dt;
      this.falling = false; this.fallFrom = this.y;
    }

    // ── jump ─────────────────────────────────────────────────────────────────
    this.coyote = this.onGround ? CFG.coyote : Math.max(0, this.coyote - dt);
    if (input.pressed('jump')) this.jumpBuf = CFG.jumpBuffer;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && (this.coyote > 0 || this.climbing)) {
      this.vy = -CFG.jumpVel;
      this.jumpBuf = 0; this.coyote = 0; this.onGround = false;
      this.jumpHeld = true;
      this.falling = false; this.fallFrom = this.y;
      if (ctx.audio) ctx.audio.jump();
    }
    if (this.jumpHeld && !input.held('jump') && this.vy < 0) { this.vy *= CFG.jumpCut; this.jumpHeld = false; }

    // ── gravity + fall tracking ──────────────────────────────────────────────
    if (!this.climbing) {
      this.vy = Math.min(this.vy + CFG.gravity * dt, CFG.maxFall);
      if (this.vy > 30 && !this.onGround) {
        if (!this.falling) { this.falling = true; this.fallFrom = this.y; }
      }
    }

    this.wasOnGround = this.onGround;
    this.onGround = false;
    this.moveAxis(world, this.vx * dt, 0);
    this.moveAxis(world, 0, this.vy * dt);

    // landing
    if (this.onGround && !this.wasOnGround) {
      const drop = (this.y - this.fallFrom) / TS;
      this.landT = 0.16;
      if (ctx.onLand) ctx.onLand(clamp(drop / 10, 0.1, 1.4), drop);
      if (this.falling && drop > this.fallSafe) {
        const dmg = Math.max(1, Math.round((drop - this.fallSafe) * CFG.fallDmgPerTile));
        this.hurt(dmg, 0, -1, ctx, 'the fall', true);   // no bounce: you hit the floor, you stay there
      }
      this.falling = false;
    }
    if (this.onGround) this.fallFrom = this.y;

    // footsteps
    if (this.onGround && Math.abs(this.vx) > 12) {
      this.stepT -= dt * Math.abs(this.vx) / 40;
      if (this.stepT <= 0) {
        this.stepT = 1;
        const under = world.get(Math.floor(this.x / TS), Math.floor((this.y + 2) / TS));
        if (ctx.audio) ctx.audio.step(TILES[under].voice);
      }
    }

    // ── hazards: standing in magma or drowning-lite ──────────────────────────
    const midT = world.get(Math.floor(this.x / TS), Math.floor((this.y - this.h * 0.5) / TS));
    if (TILES[midT].hazard > 0 && this.invuln <= 0) {
      this.hurt(TILES[midT].hazard, 0, -1, ctx, 'the heat');
    }

    // ── THE STRIKE ───────────────────────────────────────────────────────────
    this.updateStrike(dt, input, world, ctx, now);

    // ── animation selection ──────────────────────────────────────────────────
    this.animT += dt;
    let a;
    if (this.hurtT > 0) a = ANIM.HURT;
    else if (this.digAnimT < CFG.strikeCooldown * 0.95) a = this.digAnim;
    else if (this.charging) a = ANIM.CHARGE;
    else if (this.climbing) a = ANIM.CLIMB;
    else if (!this.onGround) a = this.vy < -8 ? ANIM.JUMP : ANIM.FALL;
    else if (this.landT > 0.06) a = ANIM.LAND;
    else if (Math.abs(this.vx) > 8) a = ANIM.WALK;
    else a = ANIM.IDLE;
    if (a !== this.anim) { this.anim = a; if (a !== ANIM.WALK) this.animT = 0; }
  }

  /**
   * The rhythm engine.
   *
   * The pick becomes READY at `readyAt`. Press inside [readyAt - grace, readyAt + window] and the
   * strike is a CRITICAL FRACTURE — double damage, a brighter voice a fifth up, and the combo
   * climbs (which raises the pitch again, and the ore value with it). Press earlier than that and
   * the pick stalls: mashing is strictly worse than listening. Press later and you simply dig.
   *
   * Holding DIG instead of tapping charges a HEAVY strike that fires on its own — slower, stronger,
   * no rhythm required. Two honest ways to play; one of them sings.
   */
  updateStrike(dt, input, world, ctx, now) {
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0 && this.combo > 0) {
        this.combo = 0;
        if (ctx.audio) ctx.audio.comboBreak();
      }
    }
    this.digAnimT += dt;

    const ready = now >= this.readyAt;
    const inWindow = now >= this.readyAt - CFG.perfectGrace && now <= this.readyAt + CFG.perfectWindow;
    const wasOpen = this.perfectOpen;
    this.perfectOpen = inWindow && this.combo >= 0;
    this.perfectPhase = clamp((now - (this.readyAt - CFG.perfectGrace)) /
                              (CFG.perfectGrace + CFG.perfectWindow), 0, 1);
    // The metronome: a click the moment the window opens. Players learn the beat by ear
    // long before they learn it by eye.
    // Never gated on already having a combo: the whole point is that a player who has never
    // landed a crit can hear when the window opens. comboTick scales its own volume.
    if (this.perfectOpen && !wasOpen && ctx.audio) ctx.audio.comboTick(this.combo);

    this.updateAim(world);

    // heavy charge
    if (input.held('dig')) {
      this.digHeldT += dt;
      if (this.digHeldT > 0.16 && ready) {
        this.charging = true;
        this.charge = clamp(this.charge + dt / this.heavyTime, 0, 1);
        if (this.charge >= 1) { this.doStrike(world, ctx, now, false, true); this.charge = 0; }
      }
    } else {
      this.digHeldT = 0; this.charging = false;
      this.charge = Math.max(0, this.charge - dt * 3);
    }

    if (input.pressed('dig')) {
      if (now < this.readyAt - CFG.perfectGrace) {
        // Too early. The swing stalls and the rhythm is lost.
        this.readyAt = Math.max(this.readyAt, now + CFG.earlyLockout);
        if (this.combo > 0 && ctx.audio) ctx.audio.comboBreak();
        this.combo = 0; this.comboT = 0;
        if (ctx.onEarly) ctx.onEarly();
      } else {
        const crit = inWindow;
        this.doStrike(world, ctx, Math.max(now, this.readyAt), crit, false);
      }
    }
  }

  /**
   * Which tile is the pick actually going to hit?
   *
   * The 0.5px bias matters: when the body is flush against a wall the edge lands exactly on a
   * tile boundary, and without the bias floor() rounds INTO the wall and the swing targets the
   * tile behind it. That bug reads as "the game ignored my input", which is unforgivable here.
   */
  updateAim(world) {
    const a = this.aim;
    const [dx, dy] = this.digDir;
    const cxT = Math.floor(this.x / TS);
    if (dy > 0) {
      // The feet do not sit exactly on a tile boundary. Collision resolution stops a fraction
      // of a pixel short, and inside a chimney there is no gravity to settle the miner onto the
      // edge — so after breaking the first tile and dropping into it, floor((y + 0.5) / TS)
      // named the tile the miner was standing IN, which is the air they had just made. Every
      // downward strike after the first one then hit nothing, which is exactly what "I dug
      // down and got stuck" looks like from the inside.
      //
      // So: aim at the floor, not at the arithmetic. If the tile under the feet is not
      // something a pick can bite, step one row down to the one that is.
      a.tx = cxT;
      let ty = Math.floor((this.y + 0.5) / TS);
      if (!TILES[world.get(cxT, ty)].diggable && TILES[world.get(cxT, ty + 1)].diggable) ty++;
      a.ty = ty; a.second = -1;
    } else if (dy < 0) {
      // The tile ABOVE the collision box. floor((y - h) / TS) is the tile the head is inside,
      // which must be air for the player to be standing there at all — aiming at it meant
      // digging upward simply did nothing, on every strike, in every corridor.
      a.tx = cxT; a.ty = Math.floor((this.y - this.h) / TS) - 1; a.second = -1;
    } else {
      const sgn = dx || this.facing;
      a.tx = Math.floor((this.x + sgn * (this.w / 2 - 0.5)) / TS) + sgn;
      const rowBot = Math.floor((this.y - 0.5) / TS);          // waist / leg height
      const rowTop = Math.floor((this.y - this.h + 0.5) / TS);  // head height
      a.ty = rowBot;
      a.second = rowTop !== rowBot ? rowTop : -1;
      // Aim at whichever of the two rows still has rock in it, so the last tile of a corridor
      // is never unreachable.
      if (!TILES[world.get(a.tx, a.ty)].diggable && a.second >= 0 && TILES[world.get(a.tx, a.second)].diggable) {
        const t = a.ty; a.ty = a.second; a.second = t;
      }
    }
    a.tile = world.get(a.tx, a.ty);
    a.valid = (TILES[a.tile].diggable && a.tile !== T.AIR) ||
              (a.second >= 0 && TILES[world.get(a.tx, a.second)].diggable);
    a.stage = world.stage(a.tx, a.ty);
  }

  doStrike(world, ctx, when, crit, heavy) {
    this.updateAim(world);
    const a = this.aim;
    const [dx, dy] = this.digDir;
    const sgn = dx || this.facing;

    const cooldown = heavy ? CFG.heavyCooldown : CFG.strikeCooldown;
    this.readyAt = when + cooldown;
    this.lastStrikeT = when;
    this.digAnimT = 0;
    this.digAnim = dy > 0 ? ANIM.DIG_DOWN : dy < 0 ? ANIM.DIG_UP : ANIM.DIG_SIDE;
    this.charging = false;

    // A combo is built against material, not against air — otherwise a player could hold x40
    // by swinging at nothing, and the number would stop meaning anything.
    if (crit && a.valid) {
      this.combo = Math.min(CFG.comboMax, this.combo + 1);
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }
    this.comboT = cooldown + CFG.comboDecay;

    // Recoil: the body is pushed back by its own swing. Small, but it is what makes the
    // pick feel like it has mass.
    const kick = heavy ? 3.4 : crit ? 2.2 : 1.3;
    this.recoilX = -sgn * (dy === 0 ? kick : 0);
    this.recoilY = dy !== 0 ? -dy * kick : 0;
    if (dy > 0 && !this.onGround) this.vy -= 26;

    const power = this.pickPower + (heavy ? 1 : 0) + (crit ? 1 : 0);
    let damage = CFG.dmgNormal * this.dmgMul;
    if (heavy) damage *= CFG.heavyMul;
    if (crit) damage *= CFG.critMul * (1 + Math.min(this.combo, 12) * 0.035);

    this.tool = Math.max(0, this.tool - (heavy ? CFG.toolWearHeavy : CFG.toolWearTap));
    if (this.tool <= 0) damage *= 0.55;   // a blunt pick still works, it just stops being fun

    // Burrowers home in on this, not on the player. Digging is loud.
    this.lastStrikeX = a.tx * TS + TS / 2;
    this.lastStrikeY = a.ty * TS + TS / 2;
    this.lastStrikeT = 3.0;

    if (ctx.onStrike) {
      ctx.onStrike({
        tx: a.tx, ty: a.ty, second: a.second, dx: sgn, dy,
        power, damage, crit, heavy, combo: this.combo,
        handX: this.x + sgn * (dy === 0 ? 13 : 2),
        handY: this.y - this.h * (dy > 0 ? 0.12 : dy < 0 ? 1.05 : 0.55),
      });
    }
  }

  hurt(dmg, kx, ky, ctx, cause, noKnock) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= dmg;
    this.invuln = CFG.invuln;
    this.hurtT = 0.30;
    this.flash = 1;
    this.combo = 0; this.comboT = 0;
    if (!noKnock) {
      this.vx += kx * CFG.knockback;
      this.vy = Math.min(this.vy, -80) + ky * 40;
    } else this.vy = 0;
    if (ctx && ctx.onHurt) ctx.onHurt(dmg, cause);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deadT = 0; this.anim = ANIM.DEAD; this.animT = 0; }
    return true;
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  refillLight(n) { this.light = Math.min(this.lightMax, this.light + n); }

  digFrame() {
    const f = clamp(Math.floor(this.digAnimT / CFG.strikeCooldown * 4), 0, 3);
    return DIG_FRAME_ORDER[f];
  }
}

export { WEIGHT };
