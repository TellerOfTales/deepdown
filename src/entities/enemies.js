// Creatures.
//
// GDD §12: "Enemies must create MINING decisions." Not one of these is a damage race. Every one
// has an answer written in terrain, and every one shows you a TELL before it commits, because
// GDD Pillar 4 says failure has to produce "I shouldn't have done that", never "the RNG got me".

import { ENEMY_ART, HITBOX } from '../art/sprites_enemies.js';
import { drawSprite, frameAt } from '../art/spritesheet.js';
import { T, TILES } from '../world/tiles.js';
import { CFG, TS } from '../config.js';
import { clamp, hashf } from '../core/rng.js';
import { P } from '../art/pal.js';

export const TYPES = ['burrower', 'crawler', 'stoneback', 'glowmoth', 'mimic'];

const SOFT = new Set([T.DIRT, T.GRAVEL, T.ROOT, T.GLOWCAP, T.BONE]);

const DEF = {
  burrower:  { hp: 3, w: 18, h: 11, dmg: 1, gravity: true,  emissive: true },
  crawler:   { hp: 2, w: 14, h: 10, dmg: 1, gravity: true,  emissive: true },
  stoneback: { hp: 5, w: 22, h: 14, dmg: 1, gravity: true,  emissive: false },
  glowmoth:  { hp: 1, w: 10, h: 8,  dmg: 0, gravity: false, emissive: true },
  mimic:     { hp: 4, w: 13, h: 13, dmg: 2, gravity: false, emissive: true },
};

export function spawn(type, x, y, threat) {
  const d = DEF[type];
  if (!d) return null;
  const hb = (HITBOX && HITBOX[type]) || [d.w, d.h];
  const e = {
    type, x, y, vx: 0, vy: 0,
    w: hb[0], h: hb[1],
    hp: d.hp + (threat > 1.4 ? 1 : 0), maxHp: d.hp + (threat > 1.4 ? 1 : 0),
    dead: false, deadT: 0, gone: false,
    hitFlash: 0, facing: 1, state: 'idle', t: 0, stateT: 0,
    stun: 0, aggro: 0, cool: 0, contactDmg: d.dmg,
    emissive: d.emissive, gravity: d.gravity,
    anchorTX: Math.floor(x / TS), anchorTY: Math.floor(y / TS) - 1,
    homeX: x, homeY: y, seed: (hashf(x | 0, y | 0, 77) * 1000) | 0,
    threat: threat || 1, touchT: 0,
  };
  switch (type) {
    case 'burrower': e.state = 'swim'; break;
    // y arrives as the BOTTOM of the anchor tile, so floor() lands one row below it.
    case 'crawler': e.state = 'cling'; e.anchorTY = Math.floor(y / TS) - 1; break;
    case 'stoneback': e.state = 'walk'; e.facing = (e.seed & 1) ? 1 : -1; break;
    case 'glowmoth': e.state = 'fly'; break;
    case 'mimic': e.state = 'dormant'; break;
  }
  return e;
}

// ── shared physics ────────────────────────────────────────────────────────────
function solidBox(world, x, y, w, h) {
  const x0 = Math.floor((x - w / 2) / TS), x1 = Math.floor((x + w / 2 - 0.01) / TS);
  const y0 = Math.floor((y - h) / TS), y1 = Math.floor((y - 0.01) / TS);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (world.solid(tx, ty)) return true;
  return false;
}

function move(e, world, dt) {
  let onGround = false;
  const steps = Math.max(1, Math.ceil((Math.abs(e.vx) + Math.abs(e.vy)) * dt / 3));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = e.x + e.vx * sdt;
    if (solidBox(world, nx, e.y, e.w, e.h)) { e.vx = 0; } else e.x = nx;
    const ny = e.y + e.vy * sdt;
    if (solidBox(world, e.x, ny, e.w, e.h)) {
      if (e.vy > 0) onGround = true;
      e.vy = 0;
    } else e.y = ny;
  }
  return onGround;
}

/** Nothing may end up entombed. If it is, walk it out of the rock rather than let it vanish. */
function unstick(e, world) {
  if (!solidBox(world, e.x, e.y, e.w, e.h)) return;
  for (let r = 1; r <= 4; r++) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = e.x + dx * r * TS, ny = e.y + dy * r * TS;
      if (!solidBox(world, nx, ny, e.w, e.h)) { e.x = nx; e.y = ny; e.vx = 0; e.vy = 0; return; }
    }
  }
}

function touching(e, p) {
  return Math.abs(e.x - p.x) < (e.w + p.w) / 2 &&
         Math.abs((e.y - e.h / 2) - (p.y - p.h / 2)) < (e.h + p.h) / 2;
}

function art(type, state) {
  const set = ENEMY_ART && ENEMY_ART[type];
  if (!set) return null;
  return set[state] || set.move || set.walk || set.fly || set.cling || set.dormant || null;
}

// ── update ────────────────────────────────────────────────────────────────────
export function update(e, dt, ctx) {
  e.t += dt; e.stateT += dt;
  e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
  e.cool = Math.max(0, e.cool - dt);
  e.stun = Math.max(0, e.stun - dt);
  e.touchT = Math.max(0, e.touchT - dt);

  if (e.dead) {
    e.deadT += dt;
    if (e.deadT > 0.55) e.gone = true;
    return;
  }
  const world = ctx.world, p = ctx.player;
  if (!world || !p) return;

  if (e.stun > 0) {
    if (e.gravity) { e.vy = Math.min(e.vy + CFG.gravity * dt, 320); move(e, world, dt); }
    return;
  }

  switch (e.type) {
    case 'burrower': burrower(e, dt, ctx, world, p); break;
    case 'crawler': crawler(e, dt, ctx, world, p); break;
    case 'stoneback': stoneback(e, dt, ctx, world, p); break;
    case 'glowmoth': glowmoth(e, dt, ctx, world, p); break;
    case 'mimic': mimic(e, dt, ctx, world, p); break;
  }
  unstick(e, world);

  // contact
  if (e.contactDmg > 0 && e.cool <= 0 && !p.dead && touching(e, p)) {
    const dmg = (e.type === 'stoneback' && e.state === 'charge') ? 2 : e.contactDmg;
    e.cool = 0.6;
    if (ctx.hitPlayer) ctx.hitPlayer(dmg, Math.sign(p.x - e.x) || 1, -0.4);
  }
}

function setState(e, s) { if (e.state !== s) { e.state = s; e.stateT = 0; } }

/**
 * BURROWER — comes to the SOUND of your pick, not to you. That is the lesson: digging is loud,
 * and being loud has a cost. It eats soft rock on the way, which means it can also destroy a vein
 * you were halfway through.
 */
function burrower(e, dt, ctx, world, p) {
  const tx = Math.floor(e.x / TS), ty = Math.floor(e.y / TS);
  const inRock = world.solid(tx, ty);
  const targetX = p.lastStrikeX !== undefined && p.lastStrikeT > 0 ? p.lastStrikeX : p.x;
  const targetY = p.lastStrikeY !== undefined && p.lastStrikeT > 0 ? p.lastStrikeY : p.y;
  const dx = targetX - e.x, dy = targetY - e.y;
  const dist = Math.hypot(dx, dy);
  const near = Math.hypot(p.x - e.x, p.y - e.y);

  if (e.state === 'lunge') {
    e.vy = Math.min(e.vy + CFG.gravity * dt, 320);
    move(e, world, dt);
    if (e.stateT > 0.55) setState(e, 'move');
    return;
  }
  if (e.state === 'rear') {
    e.vx *= 0.82;
    e.vy = Math.min(e.vy + CFG.gravity * dt, 320);
    move(e, world, dt);
    if (e.stateT > 0.45) {
      setState(e, 'lunge');
      const a = Math.atan2((p.y - p.h * 0.4) - e.y, p.x - e.x);
      e.vx = Math.cos(a) * 210; e.vy = Math.sin(a) * 150 - 40;
      e.facing = Math.sign(e.vx) || e.facing;
      if (ctx.audio) ctx.audio.danger('enemy_alert');
    }
    return;
  }

  if (inRock) {
    setState(e, 'swim');
    if (dist > 4) { e.vx = dx / dist * 42; e.vy = dy / dist * 42; }
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.facing = Math.sign(e.vx) || e.facing;
    // chew through soft ground, leave a tunnel and a dust trail so it is trackable
    if (e.cool <= 0) {
      const t = world.get(tx, ty);
      if (SOFT.has(t) || t === T.STONE) {
        e.cool = 0.16;
        if (ctx.breakTile) ctx.breakTile(tx, ty);
      } else if (!TILES[t].diggable) {
        e.vx = -e.vx; e.vy = -e.vy;   // bedrock: turn around rather than grind
      }
    }
    if (ctx.fx && Math.floor(e.t * 12) % 3 === 0) ctx.fx.dust(e.x, e.y, P.DIRT2, 1);
  } else {
    setState(e, 'move');
    e.vy = Math.min(e.vy + CFG.gravity * dt, 320);
    if (near < 130) {
      e.vx += Math.sign(p.x - e.x) * 190 * dt;
      e.vx = clamp(e.vx, -70, 70);
      e.facing = Math.sign(e.vx) || e.facing;
      if (near < 58 && e.stateT > 0.4) setState(e, 'rear');
    } else e.vx *= 0.9;
    move(e, world, dt);
  }
}

/**
 * CRAWLER — hangs over open ground. The counter-play is to take the ceiling out from under it
 * before it drops, which turns "an enemy" into "a tile you should have looked at".
 */
function crawler(e, dt, ctx, world, p) {
  if (e.state === 'cling' || e.state === 'tense') {
    // anchor gone? then so is it.
    if (!world.solid(e.anchorTX, e.anchorTY)) {
      setState(e, 'drop');
      e.stun = 1.2;
      e.vy = 30;
      if (ctx.msg && !e.taught) { e.taught = 1; ctx.msg('IT FELL', '#7fd0f0'); }
      if (ctx.learn) ctx.learn('crawler');
      return;
    }
    e.x = e.anchorTX * TS + TS / 2;
    e.y = (e.anchorTY + 1) * TS + e.h;
    e.vx = 0; e.vy = 0;
    const below = p.y - e.y;
    const near = Math.abs(p.x - e.x) < TS * 3.2 && below > -8 && below < TS * 6;
    if (e.state === 'cling') { if (near) setState(e, 'tense'); }
    else {
      if (!near && e.stateT > 0.7) setState(e, 'cling');
      else if (e.stateT > 0.5) { setState(e, 'drop'); e.vy = 40; if (ctx.audio) ctx.audio.danger('enemy_alert'); }
    }
    return;
  }

  e.vy = Math.min(e.vy + CFG.gravity * dt, 340);
  if (e.state === 'scuttle') {
    const wander = Math.sin(e.t * 7 + e.seed) * 24;
    e.vx = clamp(Math.sign(p.x - e.x) * 96 + wander, -110, 110);
    e.facing = Math.sign(e.vx) || e.facing;
  }
  const grounded = move(e, world, dt);
  if (grounded && e.state === 'drop') {
    setState(e, 'scuttle');
    if (ctx.fx) ctx.fx.dust(e.x, e.y, P.ROCK3, 5);
    if (ctx.shake) ctx.shake(0.8);
  }
}

/**
 * STONEBACK — armour in front, meat behind. It BRACES before it charges, which is the window to
 * step out of the corridor. The only enemy in the build that punishes standing your ground.
 */
function stoneback(e, dt, ctx, world, p) {
  e.vy = Math.min(e.vy + CFG.gravity * dt, 340);
  const dx = p.x - e.x;
  const sameLevel = Math.abs(p.y - e.y) < TS * 2.2;

  if (e.state === 'charge') {
    e.vx = e.facing * 168;
    const aheadTX = Math.floor((e.x + e.facing * (e.w / 2 + 4)) / TS);
    const ty0 = Math.floor((e.y - e.h + 2) / TS), ty1 = Math.floor((e.y - 2) / TS);
    for (let ty = ty0; ty <= ty1; ty++) {
      const t = world.get(aheadTX, ty);
      if (!TILES[t].solid) continue;
      if (SOFT.has(t)) { if (ctx.breakTile) ctx.breakTile(aheadTX, ty); }
      else { setState(e, 'walk'); e.vx = 0; if (ctx.shake) ctx.shake(2.6); if (ctx.fx) ctx.fx.dust(e.x + e.facing * 12, e.y - 6, P.ROCK4, 8); break; }
    }
    if (e.stateT > 1.7) setState(e, 'walk');
    move(e, world, dt);
    if (ctx.fx && Math.floor(e.t * 20) % 2 === 0) ctx.fx.dust(e.x - e.facing * 8, e.y, P.ROCK3, 1);
    return;
  }
  if (e.state === 'brace') {
    e.vx *= 0.7;
    move(e, world, dt);
    if (e.stateT > 0.4) { setState(e, 'charge'); if (ctx.audio) ctx.audio.danger('enemy_alert'); }
    return;
  }

  setState(e, 'walk');
  e.vx = e.facing * 26;
  // turn at a wall or a ledge — it will not walk into a pit, which is why you can dig one
  const aheadX = e.x + e.facing * (e.w / 2 + 3);
  const atx = Math.floor(aheadX / TS);
  if (world.solid(atx, Math.floor((e.y - 4) / TS)) || !world.solid(atx, Math.floor((e.y + 3) / TS))) {
    e.facing = -e.facing;
  }
  move(e, world, dt);
  if (sameLevel && Math.sign(dx) === e.facing && Math.abs(dx) < 110 && Math.abs(dx) > 18) setState(e, 'brace');
}

/**
 * GLOWMOTH — your lantern is bait, and so is what you are carrying. This is the enemy that makes
 * the light resource a genuine trade rather than a timer.
 */
function glowmoth(e, dt, ctx, world, p) {
  const bright = (p.light / p.lightMax) * (p.dim ? 0.35 : 1);
  const lure = 40 + bright * 150;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  const wander = Math.sin(e.t * 3.1 + e.seed) * 26;
  const wander2 = Math.cos(e.t * 2.3 + e.seed * 1.7) * 20;

  if (d < lure) {
    const a = Math.atan2(p.y - p.h * 0.7 - e.y, p.x - e.x);
    e.vx += (Math.cos(a) * 58 - e.vx) * dt * 2.4;
    e.vy += (Math.sin(a) * 58 - e.vy) * dt * 2.4;
  } else {
    e.vx += (Math.sin(e.t * 0.9 + e.seed) * 22 - e.vx) * dt * 1.4;
    e.vy += (Math.cos(e.t * 0.7 + e.seed) * 16 - e.vy) * dt * 1.4;
  }
  e.x += (e.vx + wander) * dt;
  e.y += (e.vy + wander2) * dt;
  e.facing = e.vx >= 0 ? 1 : -1;
  if (solidBox(world, e.x, e.y, e.w, e.h)) { e.vx = -e.vx; e.vy = -e.vy; unstick(e, world); }

  if (d < 12 && e.cool <= 0 && !p.dead) {
    e.cool = 0.9;
    p.light = Math.max(0, p.light - 7);
    if (ctx.fx) ctx.fx.sparks(e.x, e.y, P.CYAN4, 5, 0, 0);
    if (ctx.audio) ctx.audio.danger('lowlight');
    if (ctx.learn) ctx.learn('glowmoth');
    if (ctx.msg && !e.taught) { e.taught = 1; ctx.msg('IT IS DRINKING YOUR LIGHT', '#7ff0dd'); }
  }
}

/**
 * MIMIC — the joke pays out. Killing it drops real ore, so getting bitten teaches the lesson
 * without gutting the run. The tell is in the rock, not in the creature.
 */
function mimic(e, dt, ctx, world, p) {
  const d = Math.hypot(p.x - e.x, (p.y - p.h * 0.5) - (e.y - e.h * 0.5));
  e.facing = p.x >= e.x ? 1 : -1;
  if (e.state === 'dormant') {
    e.contactDmg = 0;
    if (d < TS * 1.6) e.aggro += dt; else e.aggro = 0;
    if (e.aggro > 0.35) {
      setState(e, 'wake');
      if (ctx.audio) ctx.audio.danger('enemy_alert');
      if (ctx.shake) ctx.shake(2.2);
      if (ctx.learn) ctx.learn('mimic');
      if (ctx.msg) ctx.msg('THOSE WERE NOT FLECKS', '#ff5a4a');
    }
    return;
  }
  if (e.state === 'wake') {
    e.contactDmg = 0;
    if (e.stateT > 0.35) setState(e, 'bite');
    return;
  }
  e.contactDmg = d < TS * 1.7 ? 2 : 0;
}

// ── damage ────────────────────────────────────────────────────────────────────
export function hurt(e, dmg, dirX, dirY, ctx) {
  if (e.dead) return false;
  let real = dmg;
  let blocked = false;

  if (e.type === 'stoneback') {
    // Damage arriving from the armoured hemisphere is refused, loudly.
    const fromFront = Math.sign(dirX || 0) === -e.facing || (dirX === 0 && dirY === 0);
    if (fromFront && Math.abs(dirY) < 0.9) { real = dmg * 0.15; blocked = true; }
  }
  if (e.type === 'burrower' && (e.state === 'rear' || e.state === 'lunge')) real = dmg * 1.6;

  if (blocked) {
    if (ctx && ctx.fx) ctx.fx.sparks(e.x + e.facing * 8, e.y - e.h * 0.6, P.STEEL4, 8, -dirX, -dirY);
    if (ctx && ctx.audio) ctx.audio.strike('granite', { tooHard: true });
    if (ctx && ctx.shake) ctx.shake(1.2);
    if (ctx && ctx.msg && !e.taughtArmor) { e.taughtArmor = 1; ctx.msg('THE FRONT IS STONE - GET BEHIND IT', '#ff9b2e'); }
    if (ctx && ctx.learn) ctx.learn('stoneback');
    e.hitFlash = 0.35;
    e.hp -= real;
    return false;
  }

  e.hp -= real;
  e.hitFlash = 1;
  e.stun = Math.max(e.stun, 0.14);
  e.vx += (dirX || 0) * 130;
  e.vy = Math.min(e.vy, -40) + (dirY || 0) * 40;
  if (e.type === 'crawler' && (e.state === 'cling' || e.state === 'tense')) { e.state = 'drop'; e.vy = 20; }
  if (e.type === 'mimic' && e.state === 'dormant') { e.state = 'wake'; e.stateT = 0; if (ctx && ctx.learn) ctx.learn('mimic'); }

  if (ctx && ctx.fx) {
    ctx.fx.burst(e.x, e.y - e.h * 0.5, {
      color: e.type === 'mimic' ? P.GOLD3 : P.FLSH2, n: 7,
      speed: [50, 160], life: [0.2, 0.5], gravity: 420, size: [1, 2], spread: Math.PI * 2,
    });
  }
  if (ctx && ctx.audio) ctx.audio.breakTile(e.type === 'stoneback' ? 'granite' : 'bone', { big: false });

  if (e.hp <= 0) {
    e.dead = true; e.deadT = 0; e.contactDmg = 0;
    if (ctx) {
      if (ctx.fx) {
        ctx.fx.burst(e.x, e.y - e.h * 0.5, {
          color: e.type === 'glowmoth' ? P.CYAN4 : P.FLSH3, n: 16,
          speed: [60, 220], life: [0.3, 0.8], gravity: 520, size: [1, 3], spread: Math.PI * 2, glow: e.type === 'glowmoth',
        });
        ctx.fx.ring(e.x, e.y - e.h * 0.5, e.type === 'glowmoth' ? P.CYAN4 : P.FLSH3, { r: 16, life: 0.3 });
      }
      if (ctx.hitstop) ctx.hitstop(0.05);
      if (ctx.shake) ctx.shake(2.0);
      if (e.type === 'mimic' && ctx.loot) {
        const n = 2 + (e.seed % 3);
        for (let i = 0; i < n; i++) ctx.loot(e.x, e.y - 8, 'nugget', 40 + (i * 17 + e.seed % 23));
        if (ctx.msg) ctx.msg('IT HAD EATEN WELL', '#ffd867');
      }
    }
    return true;
  }
  return false;
}

// ── drawing ───────────────────────────────────────────────────────────────────
export function draw(g, e, camX, camY) {
  const spr = art(e.type, e.state === 'idle' ? 'move' : e.state);
  if (!spr) return;
  const x = Math.round(e.x - camX);
  // Flying creatures are authored centre-anchored; ground creatures anchor at the feet.
  const y = Math.round(e.y - camY - (e.type === 'glowmoth' ? e.h / 2 : 0));
  const dying = e.dead ? clamp(1 - e.deadT / 0.55, 0, 1) : 1;
  drawSprite(g, spr, frameAt(spr, e.t), x, y, {
    flip: e.facing < 0, flash: e.hitFlash, alpha: dying,
    scale: e.dead ? 1 + (1 - dying) * 0.4 : 1,
  });
}

export function drawGlow(g, e, camX, camY) {
  if (!e.emissive || e.dead) return;
  const x = Math.round(e.x - camX), y = Math.round(e.y - camY - e.h * 0.6);
  let col = null, r = 0;
  if (e.type === 'glowmoth') { col = P.CYAN4; r = 7; }
  else if (e.type === 'mimic') { col = e.state === 'dormant' ? P.GOLD3 : P.EYE; r = e.state === 'dormant' ? 5 : 8; }
  else if (e.type === 'crawler') { col = P.EYE; r = e.state === 'tense' ? 6 : 3; }
  else if (e.type === 'burrower') { col = P.EYE_DIM; r = e.state === 'rear' ? 6 : 3; }
  if (!col) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, col); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalAlpha = 0.35; g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
