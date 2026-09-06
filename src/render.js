// World rendering.
//
// Order matters and is deliberate:
//   parallax -> tiles -> props -> loot -> enemies -> player -> particles
//   -> LIGHT (a darkness multiply built from the tile light field)
//   -> additive glow (lantern, crystals, magma, sparks) -> vignette -> HUD
// Lighting is applied AFTER everything in the world so a nugget lying in the dark is dark, and the
// moment your lantern reaches it, it is not.

import { VW, VH, TS } from './config.js';
import { T, TILES, D } from './world/tiles.js';
import { getAtlas } from './art/tiletex.js';
import { drawSprite, frameAt, makeCanvas } from './art/spritesheet.js';
import { P, hexRGB } from './art/pal.js';
import { hashf, clamp, lerp } from './core/rng.js';
import { PROP_ART, ITEM_ART, CURSOR, VEIN_ARROW } from './art/sprites_props.js';
import * as PA from './art/sprites_player.js';
import { ANIM } from './entities/player.js';
import * as Enemies from './entities/enemies.js';
import { isGone } from './game.js';

const ANIM_SPRITE = {
  IDLE: 'MINER_IDLE', WALK: 'MINER_WALK', JUMP: 'MINER_JUMP', FALL: 'MINER_FALL',
  LAND: 'MINER_LAND', DIG_SIDE: 'MINER_DIG_SIDE', DIG_DOWN: 'MINER_DIG_DOWN',
  DIG_UP: 'MINER_DIG_UP', CHARGE: 'MINER_CHARGE', CLIMB: 'MINER_CLIMB',
  HURT: 'MINER_HURT', DEAD: 'MINER_DEAD',
};

// Allocated ONCE at the largest window the camera can ever ask for. The light window's tile
// height alternates between 16 and 17 as the camera moves (VH is not a multiple of TS), so
// sizing the canvas to the window meant a createElement + createImageData inside the render
// path dozens of times a second — GC pressure during exactly the frames a rhythm game must
// not stutter on.
const LMAXW = Math.ceil(VW / TS) + 20, LMAXH = Math.ceil(VH / TS) + 20;
let lightCanvas = null, lightCtx = null, lightImg = null;

function ensureLight() {
  if (lightCanvas) return;
  lightCanvas = makeCanvas(LMAXW, LMAXH);
  lightCtx = lightCanvas.getContext('2d');
  lightImg = lightCtx.createImageData(LMAXW, LMAXH);
}

/** A cheap, dark parallax backdrop so a mined-out chamber still has depth behind it. */
function drawParallax(g, G) {
  const s = G.world.stratum;
  g.fillStyle = s.tint;
  g.fillRect(0, 0, VW, VH);
  const cx = G.cam.ix * 0.35, cy = G.cam.iy * 0.35;
  g.fillStyle = P.VOID;
  const step = 48;
  const x0 = Math.floor(cx / step) - 1, y0 = Math.floor(cy / step) - 1;
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 13; i++) {
      const gx = x0 + i, gy = y0 + j;
      const h = hashf(gx, gy, 991);
      if (h < 0.42) continue;
      const px = Math.round(gx * step - cx + (hashf(gx, gy, 17) - 0.5) * 22);
      const py = Math.round(gy * step - cy + (hashf(gx, gy, 29) - 0.5) * 22);
      const w = 14 + Math.round(h * 30), hh = 10 + Math.round(hashf(gx, gy, 41) * 22);
      g.fillRect(px, py, w, hh);
    }
  }
}

export function drawTiles(g, G) {
  const world = G.world, lf = G.lf;
  const camX = G.cam.ix, camY = G.cam.iy;
  const atlas = getAtlas();
  if (!atlas) return;
  const x0 = Math.max(0, Math.floor(camX / TS) - 1);
  const y0 = Math.max(0, Math.floor(camY / TS) - 1);
  const x1 = Math.min(world.w - 1, Math.floor((camX + VW) / TS) + 1);
  const y1 = Math.min(world.h - 1, Math.floor((camY + VH) / TS) + 1);
  const mat = world.mat, ww = world.w, deco = world.deco, seen = world.seen;
  const can = atlas.canvas;

  for (let ty = y0; ty <= y1; ty++) {
    const row = ty * ww;
    const py = ty * TS - camY;
    for (let tx = x0; tx <= x1; tx++) {
      const id = mat[row + tx];
      if (id === T.AIR) continue;
      const b = lf.sample(tx, ty);
      if (b <= 0.02 && !seen[row + tx]) continue;
      const px = tx * TS - camX;
      const v = (hashf(tx, ty, 5) * 4) | 0;
      const u = atlas.uv(id, v);
      g.drawImage(can, u.sx, u.sy, TS, TS, px, py, TS, TS);

      // rim light on faces that touch open space — this is what makes a tunnel look carved
      let mask = 0;
      if (!TILES[world.get(tx, ty - 1)].solid) mask |= 1;
      if (!TILES[world.get(tx + 1, ty)].solid) mask |= 2;
      if (!TILES[world.get(tx, ty + 1)].solid) mask |= 4;
      if (!TILES[world.get(tx - 1, ty)].solid) mask |= 8;
      if (mask) {
        const e = atlas.edge(mask);
        if (e) g.drawImage(can, e.sx, e.sy, TS, TS, px, py, TS, TS);
      }

      const dc = deco[row + tx];
      if (dc) {
        const dv = atlas.deco(dc, (hashf(tx, ty, 13) * 4) | 0);
        if (dv) g.drawImage(can, dv.sx, dv.sy, TS, TS, px, py, TS, TS);
      }

      const st = world.stage(tx, ty);
      if (st > 0) {
        const c = atlas.crack(st);
        if (c) g.drawImage(can, c.sx, c.sy, TS, TS, px, py, TS, TS);
      }
    }
  }

  // tiles mid-fall
  for (const f of world.falling) {
    const u = atlas.uv(f.tile, 0);
    g.drawImage(can, u.sx, u.sy, TS, TS, Math.round(f.tx * TS - camX), Math.round(f.y - camY), TS, TS);
  }
}

export function drawProps(g, G) {
  const camX = G.cam.ix, camY = G.cam.iy;
  for (const p of G.world.props) {
    const spr = PROP_ART[p.type];
    if (!spr) continue;
    drawSprite(g, spr, frameAt(spr, G.t), p.tx * TS + TS / 2 - camX, (p.ty + 1) * TS - camY, null);
  }
}

export function drawLoot(g, G) {
  const camX = G.cam.ix, camY = G.cam.iy;
  for (const o of G.loot.list) {
    const spr = ITEM_ART[o.kind];
    if (!spr) continue;
    const bob = o.rest ? Math.sin((G.t + o.spin) * 3.4) * 1.2 : 0;
    drawSprite(g, spr, frameAt(spr, G.t + o.spin), o.x - camX, o.y - camY + bob, null);
  }
}

export function drawPlayer(g, G) {
  const p = G.player;
  const camX = G.cam.ix, camY = G.cam.iy;
  const name = ANIM_SPRITE[p.anim] || 'MINER_IDLE';
  const spr = PA[name] || PA.MINER_IDLE;
  let frame;
  if (p.anim === ANIM.DIG_SIDE || p.anim === ANIM.DIG_DOWN || p.anim === ANIM.DIG_UP) frame = p.digFrame();
  else frame = frameAt(spr, p.animT);
  const blink = p.invuln > 0 && ((G.t * 22) | 0) % 2 === 0 ? 0.45 : 1;
  const sq = p.landT > 0 ? 1 + p.landT * 0.9 : 1;
  drawSprite(g, spr, frame,
    p.x - camX + p.recoilX, p.y - camY + (p.landT > 0 ? 1 : 0),
    { flip: p.facing < 0, alpha: blink, flash: p.flash, scale: p.landT > 0 ? sq : 1, scaleY: p.landT > 0 ? 2 - sq : 1 });
}

export function drawAimCursor(g, G) {
  const p = G.player;
  if (!p.aim.valid || p.dead) return;
  const camX = G.cam.ix, camY = G.cam.iy;
  const x = p.aim.tx * TS + TS / 2 - camX, y = p.aim.ty * TS + TS / 2 - camY;
  const open = p.perfectOpen;
  g.save();
  g.globalAlpha = open ? 1 : 0.42;
  drawSprite(g, CURSOR, open ? 1 : 0, x, y, null);
  g.restore();
}

/** The "AGAIN" signpost: when a vein continues past the tile you just opened, point at it. */
export function drawVeinArrows(g, G) {
  const camX = G.cam.ix, camY = G.cam.iy;
  for (let i = 0; i < G.veinHints.length; i++) {
    const h = G.veinHints[i];
    const a = 1 - h.t / h.life;
    if (a <= 0) continue;
    const push = Math.sin(h.t * 12) * 1.5 + 4;
    g.save(); g.globalAlpha = a;
    drawSprite(g, VEIN_ARROW, frameAt(VEIN_ARROW, h.t),
      h.x - camX + h.dx * push, h.y - camY + h.dy * push,
      { rot: Math.atan2(h.dy, h.dx) });
    g.restore();
  }
}

/**
 * Darkness pass. The tile light field is rendered at one pixel per tile and scaled up with
 * bilinear smoothing — chunky pixels for the world, soft falloff for the light. That contrast
 * is the "16-bit art, modern lighting" brief from GDD §20.
 */
export function drawLighting(g, G) {
  const lf = G.lf, world = G.world;
  const lw = lf.w, lh = lf.h;
  if (lw <= 0 || lh <= 0) return;
  ensureLight();
  const data = lightImg.data;
  const [str, stg, stb] = hexRGB(world.stratum.tint);
  // Push the veil most of the way to black. The stratum's colour survives only as a whisper,
  // which is what keeps an unlit chamber genuinely unknown instead of merely dim.
  const tr = (str * 0.34) | 0, tg = (stg * 0.34) | 0, tb = (stb * 0.34) | 0;
  const seen = world.seen, ww = world.w;
  for (let y = 0; y < lh; y++) {
    const wrow = (y + lf.y0) * ww;
    let i = y * LMAXW * 4;
    for (let x = 0; x < lw; x++) {
      let b = clamp(lf.buf[y * lw + x] / 8, 0, 1);
      b = Math.pow(b, 1.15);
      if (seen[wrow + x + lf.x0]) b = Math.max(b, 0.115);
      const a = 1 - b;
      data[i] = tr; data[i + 1] = tg; data[i + 2] = tb;
      data[i + 3] = (a * 252) | 0;
      i += 4;
    }
  }
  lightCtx.putImageData(lightImg, 0, 0, 0, 0, lw, lh);
  g.save();
  g.imageSmoothingEnabled = true;
  const dx = lf.x0 * TS - G.cam.ix;
  const dy = lf.y0 * TS - G.cam.iy;
  g.drawImage(lightCanvas, 0, 0, lw, lh, dx, dy, lw * TS, lh * TS);
  g.restore();
  g.imageSmoothingEnabled = false;
}

/** Warm additive bloom for the lantern and every emissive tile in view. */
export function drawGlow(g, G) {
  const camX = G.cam.ix, camY = G.cam.iy;
  const p = G.player;
  g.save();
  g.globalCompositeOperation = 'lighter';

  if (!p.dead) {
    // Exactly the expression game.js seeds the light field with, so the halo can never claim
    // a bigger circle of certainty than the lantern is actually casting.
    const reach = Math.max(2.4, p.lanternR * (0.35 + 0.65 * (p.light / p.lightMax)) * (p.dim ? 0.55 : 1));
    const r = reach * TS;
    const lx = p.x - camX + p.facing * 3, ly = p.y - p.h * 0.86 - camY;
    const grad = g.createRadialGradient(lx, ly, 0, lx, ly, r);
    const flick = 0.86 + Math.sin(G.t * 9.3) * 0.05 + Math.sin(G.t * 23.7) * 0.03;
    grad.addColorStop(0, `rgba(255,207,138,${0.30 * flick})`);
    grad.addColorStop(0.45, `rgba(255,180,110,${0.10 * flick})`);
    grad.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = grad;
    g.fillRect(lx - r, ly - r, r * 2, r * 2);
  }

  const world = G.world, lf = G.lf;
  const x0 = Math.max(0, Math.floor(camX / TS) - 1), y0 = Math.max(0, Math.floor(camY / TS) - 1);
  const x1 = Math.min(world.w - 1, Math.floor((camX + VW) / TS) + 1);
  const y1 = Math.min(world.h - 1, Math.floor((camY + VH) / TS) + 1);
  for (let ty = y0; ty <= y1; ty++) {
    const row = ty * world.w;
    for (let tx = x0; tx <= x1; tx++) {
      const id = world.mat[row + tx];
      const e = TILES[id].emit;
      if (e < 0.12) continue;
      const pulse = 0.82 + Math.sin(G.t * 2.4 + tx * 0.7 + ty * 1.3) * 0.18;
      const r = (7 + e * 26) * pulse;
      const lx = tx * TS + TS / 2 - camX, ly = ty * TS + TS / 2 - camY;
      const sprite = glowSprite(TILES[id].dust);
      g.globalAlpha = 0.34 * e + 0.10;
      g.drawImage(sprite, Math.round(lx - r), Math.round(ly - r), Math.round(r * 2), Math.round(r * 2));
      g.globalAlpha = 1;
    }
  }
  g.restore();
}

/** One baked radial glow per colour, reused every frame. */
const glowCache = new Map();
function glowSprite(hex) {
  let c = glowCache.get(hex);
  if (c) return c;
  const S = 64;
  c = makeCanvas(S, S);
  const gg = c.getContext('2d');
  const grad = gg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const [r, gr, b] = hexRGB(hex);
  grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
  grad.addColorStop(0.45, `rgba(${r},${gr},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  gg.fillStyle = grad;
  gg.fillRect(0, 0, S, S);
  glowCache.set(hex, c);
  return c;
}

export function drawVignette(g, G) {
  const v = G.vignette;
  if (v <= 0.01) return;
  g.save();
  const grad = g.createRadialGradient(VW / 2, VH / 2, VH * 0.28, VW / 2, VH / 2, VH * 0.85);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(4,2,6,${clamp(v, 0, 0.92)})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, VW, VH);
  g.restore();
}

export function drawFlash(g, G) {
  if (G.flash.a <= 0.01) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = clamp(G.flash.a, 0, 1) * 0.6;
  g.fillStyle = G.flash.color;
  g.fillRect(0, 0, VW, VH);
  g.restore();
}

export function drawEnemies(g, G) {
  const camX = G.cam.ix, camY = G.cam.iy;
  for (const e of G.enemies) if (!isGone(e)) Enemies.draw(g, e, camX, camY);
}
export function drawEnemyGlow(g, G) {
  const camX = G.cam.ix, camY = G.cam.iy;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const e of G.enemies) if (!isGone(e)) Enemies.drawGlow(g, e, camX, camY);
  g.restore();
}

export { drawParallax };
