// The in-run HUD.
//
// GDD §22: "The player should spend attention on the world, not menus." So there are exactly five
// permanent things on screen, and the largest of them is the number you stand to lose.

import { text, measure, wrap, FONT_H } from '../art/font.js';
import { drawSprite, frameAt } from '../art/spritesheet.js';
import * as SP from '../art/sprites_props.js';
import { P } from '../art/pal.js';
import { CFG, VW, VH, VIEW, SAFE, TS, COLORS_RISK } from '../config.js';
import { STRATA, TILES, T } from '../world/tiles.js';
import { clamp, damp } from '../core/rng.js';

// HUD-local animation state. game.js owns G; this module owns only how the HUD moves.
const H = {
  depth: 0, haul: 0, weight: 0, light: 1, tool: 1,
  bestFlash: 0, bagShake: 0, t: 0, lastBest: 0,
};

export function hudUpdate(G, dt) {
  H.t += dt;
  const p = G.player;
  if (!p) return;
  H.depth = damp(H.depth, G.depth, 7, dt);
  H.haul = damp(H.haul, G.haul, 9, dt);
  H.weight = damp(H.weight, G.weight, 10, dt);
  H.light = damp(H.light, p.light / p.lightMax, 12, dt);
  H.tool = damp(H.tool, p.tool / p.toolMax, 12, dt);
  H.bestFlash = Math.max(0, H.bestFlash - dt * 1.6);
  H.bagShake = Math.max(0, H.bagShake - dt * 3);
  if (G.stats && G.runMaxDepth > H.lastBest && G.runMaxDepth > (G.stats.deepest | 0)) {
    H.lastBest = G.runMaxDepth; H.bestFlash = 1;
  }
  if (G.weight >= p.carryMax) H.bagShake = 1;
}

function panel(g, x, y, w, h, a) {
  g.save();
  g.globalAlpha = a === undefined ? 0.82 : a;
  g.fillStyle = P.UI_PANEL; g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
  g.fillStyle = P.UI_PANEL_HI; g.fillRect(x, y, w, 1);
  g.strokeStyle = P.UI_DARK; g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.restore();
}

function bar(g, x, y, w, h, frac, col, bg) {
  g.fillStyle = bg || P.UI_DARK;
  g.fillRect(x, y, w, h);
  const fw = Math.round(clamp(frac, 0, 1) * (w - 2));
  g.fillStyle = col;
  g.fillRect(x + 1, y + 1, fw, h - 2);
}

/** Gold reads as "G1,240" — a currency glyph would cost a character everyone has to learn. */
export { moneyBig };

export function money(n) {
  const s = Math.round(n).toString();
  return 'G' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** The currency mark set dim and small next to a bright figure, so 'G0' cannot read as 'GO'. */
function moneyBig(g, n, x, y, scale, color, alpha) {
  const fig = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fw = measure(fig, scale);
  text(g, fig, x, y, { color, align: 'right', scale, shadow: true, alpha });
  text(g, 'G', x - fw - 3, y + (scale - 1) * 3, { color: P.UI_DIM, align: 'right', alpha });
  return fw + 9;
}

function riskColor(frac) {
  const i = clamp(Math.floor(frac * COLORS_RISK.length), 0, COLORS_RISK.length - 1);
  return COLORS_RISK[i];
}

/**
 * A soft corner scrim so a number never has to compete with a lit gem pocket behind it.
 * dx/dy point AWAY from the anchored corner, and the gradient starts there. Running it the
 * other way put the gradient's whole range outside the rect, and canvas clamps to the first
 * stop — so a right-hand scrim painted as a flat slab instead of a fade. Invisible at 480px
 * wide where the slab was only a quarter of the screen; unmissable on a phone.
 */
function scrim(g, x, y, w, h, dx, dy) {
  const sx = dx < 0 ? x + w : x, sy = dy < 0 ? y + h : y;
  const ex = dx === 0 ? sx : (dx < 0 ? x : x + w);
  const ey = dy === 0 ? sy : (dy < 0 ? y : y + h);
  const grad = g.createLinearGradient(sx, sy, ex, ey);
  grad.addColorStop(0, 'rgba(6,6,11,0.55)');
  grad.addColorStop(1, 'rgba(6,6,11,0)');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
}

export function drawHUD(g, G, dt) {
  const p = G.player;
  if (!p) return;
  const s = G.world ? G.world.stratum : STRATA[0];
  const tch = !!G.touch;
  // The HUD lives inside the WORLD viewport, not the canvas: in portrait the bottom of the
  // canvas is a control deck and a readout down there would be under a thumb. It also keeps
  // clear of the safe area, because a notch eats a heart and you never find out.
  const LX = VIEW.x + SAFE.l + 6;                 // left column
  const RX = VIEW.x + VIEW.w - SAFE.r - 6;        // right column
  const TY = VIEW.y + SAFE.t;                     // first baseline
  const BY = VIEW.y + VIEW.h - (tch ? 2 : SAFE.b);// floor of the HUD
  // Where the controls are decides where the HUD may go. With a deck (portrait) the bottom of
  // the world view is free, and the haul belongs down there next to the thumb that acts on it.
  // Overlaid controls (landscape) own both bottom corners, so everything stacks at the top.
  const deck = tch && (G.deck | 0) > 0;
  const colW = Math.min(130, Math.round(VIEW.w * 0.46));
  g.save();
  scrim(g, VIEW.x, TY, colW, 46, 1, 0);                                  // health + lantern
  scrim(g, RX + 6 - colW, TY, colW, tch && !deck ? 72 : 40, -1, 0);      // depth (+ haul)
  if (!tch) {
    scrim(g, VIEW.x, BY - 30, Math.min(120, colW), 30, 1, 0);            // tool + charges
    scrim(g, RX + 6 - colW, BY - 46, colW, 46, -1, 0);                   // AT RISK
  } else if (deck) {
    scrim(g, RX + 6 - colW, BY - 42, colW, 42, -1, 0);
  }
  g.restore();

  // ── health ────────────────────────────────────────────────────────────────
  let hx = LX;
  for (let i = 0; i < p.maxHp; i++) {
    const spr = p.hp >= i + 1 ? SP.ICON_HEART : (p.hp > i ? SP.ICON_HEART_HALF : SP.ICON_HEART_EMPTY);
    const wob = (p.hp <= 2 && p.hp >= i + 1) ? Math.round(Math.sin(H.t * 7 + i) * 0.6) : 0;
    drawSprite(g, spr, frameAt(spr, H.t), hx, TY + 6 + wob, null);
    hx += 10;
  }

  // ── lantern ───────────────────────────────────────────────────────────────
  const low = H.light < 0.25;
  const crit = H.light < 0.10;
  const flick = crit ? (Math.sin(H.t * 21) > 0.2 ? 1 : 0.35) : 1;
  g.save(); g.globalAlpha = flick;
  drawSprite(g, SP.ICON_LANTERN, frameAt(SP.ICON_LANTERN, H.t), LX, TY + 17, null);
  g.restore();
  const lc = crit ? P.UI_DANGER : low ? (Math.sin(H.t * 6) > 0 ? P.UI_DANGER : P.MAG4) : P.LANTERN;
  bar(g, LX + 11, TY + 20, 42, 5, H.light, lc);
  if (p.dim) text(g, 'DIM', LX + 56, TY + 20, { color: P.UI_DIM });

  // ── depth ─────────────────────────────────────────────────────────────────
  const dep = Math.round(H.depth);
  const depCol = H.bestFlash > 0 ? P.UI_COOL : P.UI_BONE;
  const dw = text(g, String(dep), RX - 12, TY + 5, { color: depCol, scale: 2, align: 'right', shadow: true });
  text(g, 'M', RX, TY + 10, { color: P.UI_DIM, align: 'right' });
  text(g, s.roman + '  ' + s.name, RX, TY + 22, { color: P.UI_DIM, align: 'right' });

  // ── tool + charges ────────────────────────────────────────────────────────
  // On a touch device both bottom corners belong to thumbs, so the whole readout moves up
  // under the health and depth blocks instead of fighting the DIG button.
  const touch = tch;
  const toolY = touch ? TY + 31 : BY - 17;
  drawSprite(g, SP.ICON_PICK, 0, LX, toolY, null);
  bar(g, LX + 12, toolY + 4, 34, 5, H.tool, H.tool < 0.2 ? P.UI_DANGER : P.STEEL3);
  let cx = LX + 52;
  if (p.charges.bomb > 0) {
    drawSprite(g, SP.ICON_BOMB, frameAt(SP.ICON_BOMB, H.t), cx, toolY, null);
    text(g, String(p.charges.bomb), cx + 10, toolY + 4, { color: P.UI_BONE }); cx += 20;
  }
  if (p.charges.sonar > 0) {
    drawSprite(g, SP.ICON_SONAR, frameAt(SP.ICON_SONAR, H.t), cx, toolY, null);
    text(g, String(p.charges.sonar), cx + 11, toolY + 4, { color: P.UI_BONE }); cx += 20;
  }
  if (p.beacon && !p.beaconUsed) text(g, touch ? 'BEACON' : 'Q BEACON', cx, toolY + 4, { color: P.UI_GOOD });

  // ── AT RISK — the emotional centre of the screen ──────────────────────────
  const ref = 900 * STRATA[Math.min(STRATA.length - 1, G.strataIdx + 1)].valueMul;
  const frac = clamp(G.haul / ref, 0, 1);
  const col = riskColor(frac);
  // A heartbeat, not a size jump: the number swells in brightness as the haul grows, so the
  // player feels the stake rising without the layout twitching.
  const beat = frac > 0.5 ? 0.78 + Math.abs(Math.sin(H.t * (1.6 + frac * 2.6))) * 0.22 * frac : 1;
  const riskY = deck ? BY - 36 : touch ? TY + 34 : BY - 34;
  text(g, 'AT RISK', RX, riskY, { color: P.UI_DIM, align: 'right' });
  moneyBig(g, G.haul, RX, riskY + 7, 2, col, beat);
  const wfrac = G.weight / p.carryMax;
  const full = wfrac >= 0.999;
  const shake = full ? Math.round(Math.sin(H.t * 30) * 1) : 0;
  bar(g, RX - 54 + shake, riskY + 22, 54, 4, wfrac, full ? P.UI_DANGER : wfrac > 0.8 ? P.MAG4 : P.UI_DIM);
  if (full) text(g, 'BAG FULL', RX - 56, riskY + 22, { color: P.UI_DANGER, align: 'right' });

  // ── combo ─────────────────────────────────────────────────────────────────
  if (p.combo >= 2) {
    const cxp = VIEW.x + VIEW.w / 2, cyp = deck ? BY - 62 : BY - 46;
    const sc = p.combo >= 12 ? 3 : p.combo >= 5 ? 2 : 1;
    const cc = p.combo >= 12 ? P.CYAN4 : p.combo >= 5 ? P.GOLD4 : P.UI_BONE;
    text(g, 'x' + p.combo, cxp, cyp, { color: cc, align: 'center', scale: sc, shadow: true });
    const decay = clamp(p.comboT / (CFG.strikeCooldown + CFG.comboDecay), 0, 1);
    const fw = measure('x' + p.combo, sc) + 12;
    bar(g, Math.round(cxp - fw / 2) + 2, cyp + FONT_H * sc + 2, fw - 4, 3, decay, cc, 'rgba(0,0,0,0.45)');
    if (p.perfectOpen) {
      g.strokeStyle = P.UI_WHITE; g.lineWidth = 1;
      g.strokeRect(Math.round(cxp - fw / 2) + 0.5, cyp - 4 + 0.5, fw, FONT_H * sc + 10);
    }
  } else if (p.perfectOpen && !p.dead) {
    // Before the first combo exists, the beat still needs a home on screen.
    g.save(); g.globalAlpha = 0.5;
    g.fillStyle = P.UI_WHITE;
    g.fillRect(VIEW.x + VIEW.w / 2 - 6, deck ? BY - 56 : BY - 40, 12, 1);
    g.restore();
  }

  // ── what am I about to hit? ───────────────────────────────────────────────
  const a = G.aim;
  if (a && a.valid && !p.dead && G.cam) {
    const sx = Math.round(a.tx * TS + TS / 2 - G.cam.ix);
    const sy = Math.round(a.ty * TS + TS + 4 - G.cam.iy);
    if (sx > VIEW.x + 20 && sx < VIEW.x + VIEW.w - 20 &&
        sy > VIEW.y + 10 && sy < VIEW.y + VIEW.h - 30) {
      g.save(); g.globalAlpha = 0.62;
      text(g, TILES[a.tile].name, sx, sy, { color: P.UI_DIM, align: 'center' });
      const st = a.stage | 0;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < st ? P.UI_DANGER : P.UI_DARK;
        g.fillRect(sx - 5 + i * 4, sy + 8, 3, 2);
      }
      g.restore();
    }
  }

  drawMessages(g, G);
  drawCallout(g, G);
  if (crit) darkEdges(g, 0.35 + Math.sin(H.t * 3) * 0.08);
}

function darkEdges(g, amt) {
  g.save();
  const cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h / 2, r = Math.min(VIEW.w, VIEW.h);
  const grad = g.createRadialGradient(cx, cy, r * 0.30, cx, cy, r * 0.8);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(2,1,4,${clamp(amt, 0, 0.9)})`);
  g.fillStyle = grad; g.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
  g.restore();
}

function drawMessages(g, G) {
  const list = G.msgs;
  // A discovery banner owns the screen while it is up; transient lines duck under it.
  const duck = G.mode === 'shaft' ? 0 : G.callout ? 0.35 : 1;
  const shown = list.slice(-3);
  for (let i = 0; i < shown.length; i++) {
    const m = shown[i];
    const age = m.t / m.life;
    const a = (age < 0.08 ? age / 0.08 : age > 0.8 ? (1 - age) / 0.2 : 1) * duck;
    const rise = (1 - Math.min(1, m.t * 7)) * 5;
    const y = VIEW.y + VIEW.h - 72 - (shown.length - 1 - i) * 10 + rise;
    text(g, m.text, VIEW.x + VIEW.w / 2, Math.round(y),
      { color: m.color, align: 'center', alpha: clamp(a, 0, 1), shadow: true, maxWidth: VIEW.w - 12 });
  }
}

/**
 * The discovery banner. GDD §13: a confirmed prediction must be punctuated harder than an
 * accident, so this slams in, wipes a rule outward, and holds before it lets go.
 */
function drawCallout(g, G) {
  const c = G.callout;
  if (!c) return;
  const t = c.t / c.life;
  const slam = clamp(c.t / 0.13, 0, 1);
  const out = t > 0.82 ? (1 - t) / 0.18 : 1;
  const a = clamp(Math.min(slam, out), 0, 1);
  const y = Math.round(VIEW.y + VIEW.h * 0.34);
  const cw = VIEW.w, cx = VIEW.x + cw / 2;
  // A three-scale headline is 3x wider than a one-scale one; on a phone that overruns the
  // screen. Step the banner down rather than let it run off both edges.
  const sc = c.tier >= 3 ? (cw < 300 ? 2 : 3) : (cw < 240 ? 1 : 2);
  const overshoot = 1 + (1 - slam) * 0.6;

  g.save();
  g.globalAlpha = a * 0.72;
  g.fillStyle = P.INK;
  g.fillRect(VIEW.x, y - 8, cw, FONT_H * sc + 24);
  g.globalAlpha = a;
  const ruleW = Math.round(cw * clamp(c.t / 0.28, 0, 1));
  g.fillStyle = c.color;
  g.fillRect(cx - ruleW / 2, y - 8, ruleW, 1);
  g.fillRect(cx - ruleW / 2, y + FONT_H * sc + 15, ruleW, 1);
  g.restore();

  text(g, c.title, cx, y, {
    color: c.color, align: 'center', scale: Math.max(1, Math.round(sc * overshoot)),
    shadow: true, alpha: a, wave: c.tier >= 3 ? 1 : 0, waveSpeed: 9, t: c.t, maxWidth: cw - 8,
  });
  if (c.sub) text(g, c.sub, cx, y + FONT_H * sc + 5,
    { color: P.UI_BONE, align: 'center', alpha: a * 0.9, shadow: true, maxWidth: cw - 12 });
}

/**
 * EXTRACT or DESCEND. GDD §10: "The choice must be legible." One second to read, and the risk
 * number is the star of the composition.
 */
export function shaftLayout() {
  // One source of truth for the panel and its two options, because game.js hit-tests exactly
  // what this draws. Below about 320 virtual px the two options cannot sit side by side and
  // still hold a sentence, so they stack — which also puts EXTRACT under the thumb that is
  // already near the bottom of a phone.
  const mx = Math.max(6, Math.round(VW * 0.055));
  const x = mx, w = VW - mx * 2;
  const stacked = VW < 330;
  const optH = 54;
  const headH = 74;
  // The panel is sized from what is in it. Stretching it to the screen left a stacked prompt
  // with a hand-span of empty panel under the last option, and pushed its bottom edge over
  // the control deck, where the buttons it covered could not be pressed anyway.
  const bodyH = stacked ? optH * 2 + 8 : optH;
  // 48 below the options: two lines of stratum tagline and the footer. The tagline is a clue,
  // not decoration — it is how you learn that slate breaks along its bed before you meet one.
  const h = Math.min(VH - 12, headH + bodyH + 57);
  // Centred in the WORLD view, not the canvas: with a control deck the canvas centre is under
  // the player's thumbs and the composition would sit low.
  const y = clamp(Math.round(VIEW.y + (VIEW.h - h) / 2), SAFE.t + 4, Math.max(SAFE.t + 4, VH - h - 4));
  const oy = y + headH;
  const a = stacked
    ? { x: x + 8, y: oy, w: w - 16, h: optH }
    : { x: x + 10, y: oy, w: w / 2 - 16, h: optH };
  const b = stacked
    ? { x: x + 8, y: oy + optH + 8, w: w - 16, h: optH }
    : { x: VW / 2 + 6, y: oy, w: w / 2 - 16, h: optH };
  return { x, y, w, h, stacked, a, b, headH };
}

export function drawShaftPrompt(g, G) {
  const last = STRATA.length - 1;
  const canDescend = G.strataIdx < last;
  const next = canDescend ? STRATA[G.strataIdx + 1] : null;
  const sel = G.shaft.choice;
  const Lo = shaftLayout();
  const { x, y, w, h } = Lo;
  const cx = x + w / 2;

  g.save(); g.globalAlpha = 0.72; g.fillStyle = P.VOID; g.fillRect(0, 0, VW, VH); g.restore();
  panel(g, x, y, w, h, 0.94);

  text(g, 'THE SHAFT', cx, y + 8, { color: P.UI_DIM, align: 'center' });
  const hs = w < 240 ? 2 : 3;
  moneyBig(g, G.haul, cx + measure(String(Math.round(G.haul)), hs) / 2, y + 18, hs,
    riskColor(clamp(G.haul / (900 * STRATA[Math.min(last, G.strataIdx + 1)].valueMul), 0, 1)), 1);
  text(g, 'IN THE BAG', cx, y + 20 + FONT_H * hs, { color: P.UI_DIM, align: 'center' });

  // itemised haul, centred on whatever actually fits
  const kinds = ['nugget', 'gem', 'shard', 'bone', 'relic'];
  const present = kinds.filter(k => (G.haulItems[k] | 0) > 0).slice(0, 5);
  const step = 30, iy = y + Lo.headH - 24;
  let ix = Math.round(cx - (present.length * step) / 2);
  for (const k of present) {
    const spr = SP.ITEM_ART[k];
    if (spr) drawSprite(g, spr, 0, ix + 5, iy + 10, null);
    text(g, 'x' + (G.haulItems[k] | 0), ix + 12, iy + 3, { color: P.UI_BONE });
    ix += step;
  }
  if (!present.length) text(g, 'NOTHING YET', cx, iy + 3, { color: P.UI_DARK, align: 'center' });

  option(g, Lo.a.x, Lo.a.y, Lo.a.w, sel === 0, true,
    SP.ARROW_UP, 'EXTRACT', 'BANK ' + money(G.haul), 'THE RUN ENDS HERE', P.UI_GOOD);
  option(g, Lo.b.x, Lo.b.y, Lo.b.w, sel === 1, canDescend,
    SP.ARROW_DOWN, 'DESCEND', canDescend ? next.roman + '  ' + next.name : 'BEDROCK',
    canDescend ? 'ALL ' + money(G.haul) + ' STAYS AT RISK' : 'THERE IS NOTHING BELOW',
    P.UI_DANGER);

  const footY = y + h - 12;
  const tagTop = Lo.b.y + Lo.b.h + 6;
  if (canDescend && footY - tagTop >= 16) {
    // Measured, not counted: a character-count wrap picked 35 characters for a 177px column
    // and the renderer then truncated every line with an ellipsis.
    const lines = wrap(next.tagline, w - 16, 1).slice(0, 3);
    for (let i = 0; i < lines.length; i++) {
      text(g, lines[i], cx, tagTop + i * 9, { color: P.UI_DIM, align: 'center' });
    }
  }
  text(g, G.touch ? 'TAP, THEN TAP AGAIN' : 'UP/DOWN CHOOSE     E CONFIRM',
    cx, footY, { color: P.UI_DARK, align: 'center', maxWidth: w - 8 });
}

function option(g, x, y, w, on, enabled, arrow, title, line1, line2, accent) {
  const h = 54;
  g.save();
  g.globalAlpha = enabled ? (on ? 1 : 0.45) : 0.22;
  g.fillStyle = on ? P.UI_PANEL_HI : P.UI_PANEL;
  g.fillRect(x, y, w, h);
  g.strokeStyle = on ? accent : P.UI_DARK;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (arrow) drawSprite(g, arrow, 0, x + w / 2, y + 10, null);
  text(g, title, x + w / 2, y + 15, { color: on ? accent : P.UI_BONE, align: 'center', scale: on ? 2 : 1, shadow: true });
  text(g, line1, x + w / 2, y + (on ? 32 : 26), { color: P.UI_BONE, align: 'center' });
  text(g, line2, x + w / 2, y + (on ? 42 : 36), { color: on ? accent : P.UI_DIM, align: 'center' });
  g.restore();
}
