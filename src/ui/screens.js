// Every full-screen state outside the run.
//
// The Depot is not a shop, it is the room where a player decides what question to test next.
// The death screen is not a punishment, it is a field report. Both are written to point at the
// shovel (GDD §15: "A run can be economically lost while informationally successful").

import { text, measure, wrap, FONT_H } from '../art/font.js';
import { drawSprite, frameAt } from '../art/spritesheet.js';
import * as SP from '../art/sprites_props.js';
import * as PA from '../art/sprites_player.js';
import { P } from '../art/pal.js';
import { VW, VH, SAFE } from '../config.js';
import { STRATA } from '../world/tiles.js';
import { clamp, hashf } from '../core/rng.js';
import { money, moneyBig } from './hud.js';

export const UPGRADES = [
  { id: 'pick',      name: 'REINFORCED PICK',   desc: 'Break granite and masonry with a normal strike.', icon: 'ICON_PICK',   max: 1, cost: 420,  step: 2.4 },
  { id: 'carbide',   name: 'CARBIDE TIP',       desc: 'Heavy strikes charge faster and hit harder.',     icon: 'ICON_PICK',   max: 3, cost: 300,  step: 2.0 },
  { id: 'mantle',    name: 'LANTERN MANTLE',    desc: 'A wider circle of certainty.',                    icon: 'ICON_LANTERN',max: 3, cost: 260,  step: 2.0 },
  { id: 'oil',       name: 'OIL RESERVE',       desc: 'The dark comes for you later.',                   icon: 'ICON_LANTERN',max: 3, cost: 220,  step: 1.9 },
  { id: 'pack',      name: 'RUCKSACK',          desc: 'Carry more before greed becomes weight.',         icon: 'ICON_BAG',    max: 3, cost: 340,  step: 2.1 },
  { id: 'eye',       name: 'PROSPECTORS EYE',   desc: 'Faint gold flecks read at twice the distance.',   icon: 'ICON_DEPTH',  max: 2, cost: 500,  step: 2.6 },
  { id: 'resonance', name: 'RESONANCE KIT',     desc: 'A struck wall shows you the hollow behind it.',   icon: 'ICON_SONAR',  max: 1, cost: 640,  step: 1 },
  { id: 'charges',   name: 'BLAST CHARGES',     desc: 'Two charges. Rock does not argue with them.',     icon: 'ICON_BOMB',   max: 3, cost: 380,  step: 1.8 },
  { id: 'sonar',     name: 'SONAR PULSE',       desc: 'One ping. Every seam and cavity, for a moment.',  icon: 'ICON_SONAR',  max: 2, cost: 720,  step: 2.2 },
  { id: 'spikes',    name: 'CLIMBING SPIKES',   desc: 'One wall is enough. Climb a cliff, not just a shaft.', icon: 'ICON_PICK',   max: 1, cost: 560,  step: 1 },
  { id: 'boots',     name: 'PADDED BOOTS',      desc: 'Fall further than you should.',                   icon: 'ICON_DEPTH',  max: 2, cost: 300,  step: 2.2 },
  { id: 'beacon',    name: 'EXTRACTION BEACON', desc: 'One call a run is instant, and the winch waives its fee.', icon: 'ICON_COMBO',  max: 1, cost: 900,  step: 1 },
];

export function upgradeCost(u, level) {
  const raw = u.cost * Math.pow(u.step, level);
  return Math.round(raw / 10) * 10;
}

const S = { t: 0, dust: null, sel: 0 };

/**
 * One description of the Depot, used by the drawing code and by the pointer hit-test in
 * game.js. They disagreed once — a tap bought whatever row happened to be under the old
 * hard-coded arithmetic — and the only durable fix is to have one of them.
 *
 * Narrow screens drop the second column entirely. A phone held upright is the best shape this
 * screen has ever had: twelve upgrades in one unbroken list, no scrolling, no columns.
 */
export function depotLayout(sel) {
  // Three shapes, because a phone is three different screens depending on how it is held.
  //   wide  — the desktop layout: a list on the left, a column of context on the right.
  //   tall  — a phone upright: one column, thumb-height rows, all twelve upgrades at once.
  //   short — a phone on its side: the list keeps the left, everything else moves right.
  const pad = Math.max(6, Math.round(VW * 0.028));
  const roomy = VW >= 380 && VH >= 250;
  const shape = roomy ? 'wide' : (VW >= 380 ? 'short' : 'tall');
  const narrow = shape !== 'wide';
  const lx = SAFE.l + pad;
  const headH = shape === 'wide' ? 44 : shape === 'short' ? 34 : 40;
  const ly = SAFE.t + headH;
  const barH = 22;
  const barY = VH - SAFE.b - barH - 14;

  let lw, barX, barW, listBottom, info;
  if (shape === 'wide') {
    lw = 268; barX = lx; barW = lw;
    listBottom = barY - 24;
    info = { x: 288, y: 44, w: VW - 288 - 10, h: barY - 50 };
  } else if (shape === 'short') {
    lw = Math.round((VW - SAFE.l - SAFE.r - pad * 3) * 0.56);
    barX = lx + lw + pad; barW = VW - SAFE.r - pad - barX;
    listBottom = barY + barH;                      // the list may run the full height
    info = { x: barX, y: ly, w: barW, h: barY - ly - 8 };
  } else {
    lw = VW - SAFE.l - SAFE.r - pad * 2;
    barX = lx; barW = lw;
    listBottom = barY - 62;
    info = { x: lx, y: barY - 34, w: lw, h: 30 };
  }

  // On a phone the rows grow to fill the column. A 13px row is a 7mm target; letting the list
  // breathe into the space a portrait screen actually has makes every row a thumb-sized one.
  const rowH = shape === 'tall'
    ? Math.max(13, Math.min(26, Math.floor((listBottom - ly) / UPGRADES.length)))
    : 13;
  const view = Math.max(4, Math.min(UPGRADES.length, Math.floor((listBottom - ly) / rowH)));
  const cur = sel === undefined ? S.sel : sel;
  const first = clamp(cur - Math.floor(view / 2), 0, Math.max(0, UPGRADES.length - view));
  // On a phone the archive line is the only way into the journal: there is no TAB key.
  const journal = shape === 'wide'
    ? { x: info.x + 4, y: 196, w: info.w - 8, h: 12 }
    : { x: info.x, y: info.y + info.h - 12, w: info.w, h: 12 };
  return { shape, narrow, pad, lx, lw, ly, rowH, view, first, barX, barY, barW, barH,
           rx: info.x, rw: info.w, info, listBottom, journal };
}

export function screensUpdate(G, dt) {
  S.t += dt;
  S.sel = G.ui ? (G.ui.sel | 0) : 0;
  if (!S.dust) {
    S.dust = [];
    for (let i = 0; i < 90; i++) {
      S.dust.push({ x: hashf(i, 1, 3) * VW, y: hashf(i, 2, 3) * VH, s: 4 + hashf(i, 3, 3) * 22, r: hashf(i, 4, 3) });
    }
  }
  for (const d of S.dust) {
    d.y += d.s * dt * 0.35;
    d.x += Math.sin((S.t + d.r * 9) * 0.5) * dt * 5;
    if (d.y > VH) { d.y = -2; d.x = hashf((d.r * 9871) | 0, (S.t * 60) | 0, 11) * VW; }
  }
}

function fill(g, col, a) {
  g.save(); if (a !== undefined) g.globalAlpha = a;
  g.fillStyle = col; g.fillRect(0, 0, VW, VH); g.restore();
}
function panel(g, x, y, w, h, a) {
  g.save();
  g.globalAlpha = a === undefined ? 0.9 : a;
  g.fillStyle = P.UI_PANEL; g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
  g.fillStyle = P.UI_PANEL_HI; g.fillRect(x, y, w, 1);
  g.strokeStyle = P.UI_DARK; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.restore();
}

/** A shaft receding into the dark. Nothing on the title screen is heroic. */
function shaftBackdrop(g, depth) {
  fill(g, P.VOID);
  const cx = VW / 2, cy = VH * 0.52;
  // The shaft recedes to the middle of whatever screen it is on. Sized in absolutes it was a
  // faint rectangle floating in the corner of a phone.
  const fw = VW * 1.1, fh = VH * 1.15;
  for (let i = 11; i >= 0; i--) {
    const k = i / 11;
    const w = fw * 0.08 + k * fw, h = fh * 0.09 + k * fh;
    g.save();
    g.globalAlpha = 0.055 + (1 - k) * 0.055;
    g.fillStyle = i % 2 ? P.ROCK1 : P.ROCK0;
    g.fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
    g.restore();
  }
  g.save();
  for (const d of S.dust || []) {
    g.globalAlpha = 0.05 + d.r * 0.16;
    g.fillStyle = P.ROCK6;
    g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
  }
  g.restore();
  // three far lights: something is down there and it is lit
  const lights = [
    [cx - VW * 0.13, cy + VH * 0.045, P.GOLD4],
    [cx + VW * 0.155, cy - VH * 0.10, P.CYAN4],
    [cx + VW * 0.038, cy + VH * 0.163, P.MAG4]];
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lights.length; i++) {
    const [lx, ly, col] = lights[i];
    const r = 16 + Math.sin(S.t * 1.3 + i * 2) * 4;
    const grad = g.createRadialGradient(lx, ly, 0, lx, ly, r);
    grad.addColorStop(0, col); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.20;
    g.fillStyle = grad; g.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  g.restore();
}

export function drawTitle(g, G, dt) {
  shaftBackdrop(g, 0);
  const cx = VW / 2;
  // The wordmark is set from the width it has: five-scale letters are 6 px per stroke and
  // 'DEEPER' at scale 5 is 209 px, which does not fit a phone.
  const sc = VW >= 400 ? 5 : VW >= 300 ? 4 : 3;
  const y = Math.round(SAFE.t + VH * 0.20);
  const bob = Math.round(Math.sin(S.t * 1.1) * 1);
  text(g, 'DEEPER', cx + 1, y + 1 + bob, { color: P.INK, align: 'center', scale: sc });
  text(g, 'DEEPER', cx, y + bob, { color: P.UI_GOLD, align: 'center', scale: sc });
  text(g, 'DEEPER', cx - 1, y - 1 + bob, { color: P.GOLD5, align: 'center', scale: sc, alpha: 0.25 });

  const tagY = y + FONT_H * sc + 12;
  const tag = VW < 320
    ? ['READ THE ROCK.', 'TAKE WHAT YOU CAN CARRY.', 'KNOW WHEN TO STOP.']
    : ['READ THE ROCK.  TAKE WHAT YOU CAN CARRY.  KNOW WHEN TO STOP.'];
  for (let i = 0; i < tag.length; i++) {
    text(g, tag[i], cx, tagY + i * 10, { color: P.UI_DIM, align: 'center', maxWidth: VW - 12 });
  }

  const foot = VH - SAFE.b;
  if (G.stats.runs > 0) {
    const line = VW < 320
      ? G.stats.deepest + ' M   ' + money(G.stats.banked) + '   ' + G.stats.runs + ' RUNS'
      : 'DEEPEST ' + G.stats.deepest + ' M      BANKED ' + money(G.stats.banked) + '      RUNS ' + G.stats.runs;
    text(g, line, cx, foot - 46, { color: P.UI_DARK, align: 'center', maxWidth: VW - 12 });
  }
  const a = 0.5 + Math.sin(S.t * 3.4) * 0.5;
  text(g, G.touch ? 'TAP TO BEGIN' : 'PRESS ENTER', cx, foot - 30,
    { color: P.UI_BONE, align: 'center', scale: 2, alpha: 0.45 + a * 0.55, shadow: true });
}

export function drawDepot(g, G, dt) {
  fill(g, P.INK);
  g.save(); g.globalAlpha = 0.5; shaftBackdropSoft(g); g.restore();

  const D = depotLayout(G.ui.sel);
  const sel = clamp(G.ui.sel, 0, UPGRADES.length - 1);
  const hx = D.lx + 2, hy = SAFE.t + 6;

  text(g, 'THE DEPOT', hx, hy, { color: P.UI_DIM });
  const bankSc = D.narrow ? 2 : 3;
  text(g, money(G.bank), hx, hy + 9, { color: P.UI_GOLD, scale: bankSc, shadow: true });
  text(g, 'BANKED', hx + measure(money(G.bank), bankSc) + 6, hy + 9 + (bankSc - 1) * 6,
    { color: P.UI_DARK });

  // ── upgrades ──────────────────────────────────────────────────────────────
  const { lx, ly, lw, rowH, view, first } = D;
  for (let i = 0; i < view; i++) {
    const idx = first + i;
    const u = UPGRADES[idx];
    if (!u) break;
    const lvl = (G.upgrades[u.id] | 0);
    const maxed = lvl >= u.max;
    const cost = upgradeCost(u, lvl);
    const afford = !maxed && G.bank >= cost;
    const on = idx === sel;
    const rowTop = ly + i * rowH;
    const y = rowTop + Math.floor((rowH - 13) / 2);   // content centred in a taller row

    if (on) {
      g.fillStyle = P.UI_PANEL_HI; g.fillRect(lx, rowTop - 2, lw, rowH);
      g.strokeStyle = P.UI_GOLD; g.strokeRect(lx + 0.5, rowTop - 1.5, lw - 1, rowH - 1);
    }
    const nameCol = maxed ? P.UI_GOOD : afford ? P.UI_BONE : P.UI_DARK;
    const spr = SP[u.icon];
    if (spr) {
      g.save(); g.globalAlpha = afford || maxed ? 1 : 0.35;
      drawSprite(g, spr, 0, lx + 3, y, null);
      g.restore();
    }
    // Price first, then pips, then whatever width is left for the name: on a phone the name
    // is the part that can be truncated without costing the player a decision.
    const priceW = measure(maxed ? 'MAX' : money(cost), 1);
    const pipsW = u.max * 5 + 4;
    const nameX = lx + 17;
    const nameW = lw - 6 - priceW - pipsW - (nameX - lx);
    text(g, u.name, nameX, y + 2, { color: nameCol, maxWidth: Math.max(24, nameW) });
    for (let k = 0; k < u.max; k++) {
      g.fillStyle = k < lvl ? P.UI_GOLD : P.UI_DARK;
      g.fillRect(lx + lw - 6 - priceW - pipsW + k * 5, y + 3, 3, 3);
    }
    text(g, maxed ? 'MAX' : money(cost), lx + lw - 4, y + 2,
      { color: maxed ? P.UI_GOOD : afford ? P.UI_GOLD : P.UI_DARK, align: 'right' });
  }
  // The description of the highlighted row lives on its own line under the list, so a long
  // sentence can never collide with the row beneath it.
  const cur = UPGRADES[sel];
  const listEnd = ly + view * rowH;
  if (cur) {
    const curLvl = G.upgrades[cur.id] | 0;
    g.fillStyle = P.UI_DARK;
    g.fillRect(lx, listEnd + 2, lw, 1);
    const desc = curLvl >= cur.max ? 'FITTED. ' + cur.desc : cur.desc;
    const lines = wrap(desc, lw - 6, 1).slice(0, 2);
    for (let k = 0; k < lines.length; k++) {
      text(g, lines[k], lx + 2, listEnd + 7 + k * 8,
        { color: curLvl >= cur.max ? P.UI_GOOD : P.UI_COOL });
    }
  }

  if (!D.narrow) {
    // ── right column ────────────────────────────────────────────────────────
    const rx = D.rx, rw = D.rw;
    panel(g, rx, 44, rw, 96, 0.82);
    text(g, 'LAST EXPEDITION', rx + 6, 50, { color: P.UI_DIM });
    const lr = G.lastRun;
    if (!lr) {
      text(g, 'NONE YET.', rx + 6, 62, { color: P.UI_DARK });
      text(g, 'THE LIFT IS WAITING.', rx + 6, 71, { color: P.UI_DARK });
    } else {
      text(g, lr.extracted ? 'EXTRACTED' : 'LOST', rx + 6, 60, { color: lr.extracted ? P.UI_GOOD : P.UI_DANGER, scale: 2 });
      if (lr.deep && lr.extracted) text(g, 'BACK FROM THE EMBERDEEP', rx + 6, 88, { color: P.UI_GOLD });
      text(g, lr.depth + ' M', rx + rw - 6, 62, { color: P.UI_BONE, align: 'right' });
      text(g, (lr.extracted ? 'BANKED ' : 'AT ') + money(lr.value), rx + 6, 78, { color: lr.extracted ? P.UI_GOLD : P.UI_DARK });
      if (lr.fee > 0) text(g, 'WINCH TOOK ' + money(lr.fee), rx + rw - 6, 78, { color: P.UI_DANGER, align: 'right' });
      const notes = (lr.learned || []).slice(-3);
      text(g, 'FIELD NOTES', rx + 6, lr.deep && lr.extracted ? 98 : 92, { color: P.UI_DIM });
      if (!notes.length) text(g, 'NOTHING NEW.', rx + 6, 102, { color: P.UI_DARK });
      for (let i = 0; i < notes.length; i++) {
        const lines = wrap(notes[i], rw - 12, 1).slice(0, 2);
        for (let k = 0; k < lines.length; k++) {
          text(g, lines[k], rx + 6, 102 + i * 12 + k * 8, { color: k ? P.UI_DARK : P.UI_COOL });
        }
      }
    }

    panel(g, rx, 146, rw, 62, 0.82);
    text(g, 'ARCHIVE', rx + 6, 152, { color: P.UI_DIM });
    const found = G.journal.filter(j => j.found).length;
    text(g, found + ' / ' + G.journal.length, rx + 6, 162, { color: P.UI_BONE, scale: 2 });
    text(g, 'RELICS RECOVERED', rx + 6, 178, { color: P.UI_DARK });
    text(g, G.discoveries.size + ' RULES CONFIRMED', rx + 6, 190, { color: P.UI_COOL });
    text(g, 'TAB  FIELD JOURNAL', rx + 6, 199, { color: P.UI_DARK });
  } else {
    // ── narrow / short: the same facts, compressed into whatever block is left ─
    const I = D.info, lr = G.lastRun;
    const stacked = D.shape === 'short';
    let iy = I.y;
    g.fillStyle = P.UI_DARK; g.fillRect(I.x, iy - 4, I.w, 1);
    if (!lr) {
      text(g, 'THE LIFT IS WAITING.', I.x + 2, iy + 1, { color: P.UI_DARK, maxWidth: I.w - 4 });
      iy += 11;
    } else {
      text(g, lr.extracted ? 'EXTRACTED' : 'LOST', I.x + 2, iy + 1,
        { color: lr.extracted ? P.UI_GOOD : P.UI_DANGER });
      text(g, lr.depth + ' M   ' + (lr.extracted ? 'BANKED ' : 'AT ') + money(lr.value),
        I.x + I.w - 2, iy + 1, { color: P.UI_BONE, align: 'right' });
      if (lr.fee > 0) { iy += 10; text(g, 'THE WINCH TOOK ' + money(lr.fee), I.x + 2, iy, { color: P.UI_DANGER }); }
      iy += 11;
      const notes = (lr.learned || []).slice(stacked ? -3 : -1);
      for (const n of notes) {
        if (iy > I.y + I.h - 22) break;
        const lines = wrap(n, I.w - 4, 1).slice(0, stacked ? 2 : 1);
        for (let k = 0; k < lines.length; k++) text(g, lines[k], I.x + 2, iy + k * 8, { color: k ? P.UI_DIM : P.UI_COOL });
        iy += lines.length * 8 + 3;
      }
    }
    const found = G.journal.filter(j => j.found).length;
    text(g, found + '/' + G.journal.length + ' RELICS   ' + G.discoveries.size + ' RULES',
      D.journal.x + 2, D.journal.y + 3, { color: P.UI_DARK });
    text(g, 'JOURNAL >', D.journal.x + D.journal.w - 2, D.journal.y + 3,
      { color: P.UI_COOL, align: 'right' });
  }

  // ── the button that matters ───────────────────────────────────────────────
  const by = D.barY, bh = D.barH, bx = D.barX, bw = D.barW;
  const pulse = 0.62 + Math.sin(S.t * 3.2) * 0.38;
  g.save();
  g.globalAlpha = 0.25 + pulse * 0.35;
  g.fillStyle = P.GOLD1; g.fillRect(bx, by, bw, bh);
  g.restore();
  g.strokeStyle = P.UI_GOLD; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  text(g, G.touch ? 'DESCEND' : 'SPACE   DESCEND', bx + bw / 2, by + 6,
    { color: P.GOLD5, align: 'center', scale: 2, shadow: true, maxWidth: bw - 6 });
  text(g, G.touch ? 'TAP A ROW, TAP AGAIN TO BUY' : 'UP/DOWN SELECT    ENTER BUY    OR CLICK',
    bx + bw / 2, by + bh + 5, { color: P.UI_DARK, align: 'center', maxWidth: bw });
}

function shaftBackdropSoft(g) {
  const cx = VW / 2, cy = VH * 0.5;
  const fw = VW * 1.17, fh = VH * 1.19;
  for (let i = 9; i >= 0; i--) {
    const k = i / 9;
    const w = fw * 0.11 + k * fw, h = fh * 0.11 + k * fh;
    g.globalAlpha = 0.05;
    g.fillStyle = i % 2 ? P.ROCK1 : P.ROCK0;
    g.fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
  }
}

/** The two things a dead player can do, as rects, so a tap means what the screen says. */
export function deathLayout() {
  const foot = VH - SAFE.b;
  const w = Math.min(VW - 24, 260), x = Math.round((VW - w) / 2);
  return {
    again: { x, y: foot - 44, w, h: 26 },
    depot: { x, y: foot - 17, w, h: 15 },
  };
}

/** The pause screen: a RESUME target, and the line under it that says how to leave. */
export function pauseLayout() {
  const foot = VH - SAFE.b;
  const w = Math.min(VW - 24, 220), x = Math.round((VW - w) / 2);
  return {
    resume: { x, y: foot - 44, w, h: 22 },
    hint: { x, y: foot - 20, w, h: 18 },
  };
}

export function drawDeath(g, G, dt) {
  fill(g, P.VOID, 0.86);
  const lr = G.lastRun || { depth: G.runMaxDepth, value: 0, items: {}, learned: [], time: 0 };

  const M = Math.max(10, Math.round(VW * 0.07));   // side margin
  const cx = VW / 2;
  const dSc = VW < 300 ? 3 : 4;
  const top = SAFE.t;
  text(g, 'BURIED AT', cx, top + 14, { color: P.UI_DIM, align: 'center' });
  text(g, lr.depth + ' M', cx, top + 24, { color: P.UI_BONE, align: 'center', scale: dSc, shadow: true });

  // 1. what you learned — the largest block on the screen, on purpose
  const learned = (lr.learned || []);
  const l0 = top + 30 + FONT_H * dSc + 12;
  const maxNotes = VH > 380 ? 5 : 4;
  text(g, 'WHAT YOU LEARNED', M, l0, { color: P.UI_COOL });
  g.fillStyle = P.UI_DARK; g.fillRect(M, l0 + 9, VW - M * 2, 1);
  let yEnd = l0 + 16;
  if (!learned.length) {
    text(g, 'NOTHING. ' + String(G.deathCause || 'THE DARK').toUpperCase() + ' TOOK YOU FIRST.',
      M, l0 + 16, { color: P.UI_DIM, maxWidth: VW - M * 2 });
    text(g, 'GO BACK AND PAY ATTENTION.', M, l0 + 26, { color: P.UI_DARK, maxWidth: VW - M * 2 });
    yEnd = l0 + 36;
  } else {
    let y = l0 + 16;
    for (let i = 0; i < Math.min(maxNotes, learned.length); i++) {
      const lines = wrap(learned[i], VW - M * 2 - 10, 1).slice(0, 2);
      text(g, '-', M, y, { color: P.UI_COOL });
      for (let k = 0; k < lines.length; k++) text(g, lines[k], M + 10, y + k * 9, { color: k ? P.UI_DIM : P.UI_BONE });
      y += lines.length * 9 + 4;
    }
    if (learned.length > maxNotes) { text(g, '+' + (learned.length - maxNotes) + ' MORE IN THE JOURNAL', M + 10, y, { color: P.UI_DARK }); y += 10; }
    yEnd = y;
  }

  // 2. what it cost
  const foot = VH - SAFE.b;
  const ly = Math.max(yEnd + 8, foot - 92);
  text(g, 'LOST', M, ly, { color: P.UI_DANGER });
  g.fillStyle = P.UI_DARK; g.fillRect(M, ly + 9, VW - M * 2, 1);
  moneyBig(g, lr.value, M + measure(String(Math.round(lr.value)), 2) + 10, ly + 15, 2, P.UI_DANGER, 1);
  let ix = M + measure(money(lr.value), 2) + 14;
  for (const k of ['nugget', 'gem', 'shard', 'bone', 'relic']) {
    const n = lr.items[k] | 0;
    if (!n) continue;
    const spr = SP.ITEM_ART[k];
    g.save(); g.globalAlpha = 0.6;
    if (spr) drawSprite(g, spr, 0, ix + 5, ly + 26, null);
    g.restore();
    text(g, 'x' + n, ix + 12, ly + 18, { color: P.UI_DARK });
    ix += 30;
    if (ix > VW - M - 24) break;
  }

  // 3. the dry facts
  // This run's numbers, not a lifetime total dressed up as one.
  const acc = lr.strikes ? Math.round(lr.crits / lr.strikes * 100) : 0;
  const facts = VW < 340
    ? (lr.tiles | 0) + ' TILES   x' + (lr.combo | 0) + '   ' + acc + '% ON BEAT   ' + Math.round(lr.time) + 'S'
    : 'TILES ' + (lr.tiles | 0) + '     BEST COMBO x' + (lr.combo | 0) +
      '     ON THE BEAT ' + acc + '%     ' + Math.round(lr.time) + 'S';
  text(g, facts, cx, foot - 46, { color: P.UI_DARK, align: 'center', maxWidth: VW - 8 });

  const pulse = 0.55 + Math.sin(S.t * 4) * 0.45;
  const DL = deathLayout();
  if (G.touch) {
    // Draw the button, because on a phone the only thing that reads as pressable is a button.
    g.save();
    g.globalAlpha = 0.22 + pulse * 0.28; g.fillStyle = P.GOLD1;
    g.fillRect(DL.again.x, DL.again.y, DL.again.w, DL.again.h);
    g.restore();
    g.strokeStyle = P.UI_GOLD;
    g.strokeRect(DL.again.x + 0.5, DL.again.y + 0.5, DL.again.w - 1, DL.again.h - 1);
  }
  const again = G.touch ? 'DIG AGAIN' : 'R    DIG AGAIN';
  text(g, again, cx, DL.again.y + 6, { color: G.touch ? P.GOLD5 : P.UI_GOLD, align: 'center',
    scale: VW < 300 ? 2 : 3, alpha: G.touch ? 1 : 0.5 + pulse * 0.5, shadow: true });
  text(g, G.touch ? 'THE DEPOT' : 'ENTER  THE DEPOT', cx, DL.depot.y + 4,
    { color: P.UI_DARK, align: 'center' });
}

export function journalLayout() {
  const narrow = VW < 380;
  const pad = Math.max(6, Math.round(VW * 0.028));
  const top = SAFE.t + 22, bot = VH - SAFE.b - 18;
  if (narrow) {
    const h = Math.floor((bot - top - 6) / 2);
    return { narrow, a: { x: pad, y: top, w: VW - pad * 2, h },
                     b: { x: pad, y: top + h + 6, w: VW - pad * 2, h } };
  }
  const w = VW / 2 - 16;
  return { narrow, a: { x: 10, y: 28, w, h: bot - 28 },
                   b: { x: VW / 2 + 6, y: 28, w, h: bot - 28 } };
}

export function drawJournal(g, G, dt) {
  fill(g, P.INK);
  const J = journalLayout();
  text(g, 'FIELD JOURNAL', VW / 2, SAFE.t + 8, { color: P.UI_BONE, align: 'center', scale: 2 });

  // ── what you have brought up ────────────────────────────────────────────
  panel(g, J.a.x, J.a.y, J.a.w, J.a.h, 0.85);
  text(g, 'ARCHIVE', J.a.x + 6, J.a.y + 6, { color: P.UI_DIM });
  const aEnd = J.a.y + J.a.h - 6;
  let y = J.a.y + 18;
  let hidden = 0;
  const maxBlurb = J.narrow ? 3 : 2;
  for (const j of G.journal) {
    if (j.found) {
      const lines = wrap(j.blurb, J.a.w - 34, 1).slice(0, maxBlurb);
      const need = 8 + lines.length * 8 + 5;
      // Measure BEFORE drawing. Checking afterwards let the last entry run past the panel and
      // land on the line underneath it.
      if (y + need > aEnd) { hidden++; continue; }
      drawSprite(g, SP.ITEM_RELIC, 0, J.a.x + 12, y + 10, null);
      text(g, j.name, J.a.x + 24, y, { color: P.UI_GOLD, maxWidth: J.a.w - 60 });
      for (let k = 0; k < lines.length; k++) text(g, lines[k], J.a.x + 24, y + 8 + k * 8, { color: P.UI_DIM });
      text(g, j.depth + ' M', J.a.x + J.a.w - 6, y, { color: P.UI_DARK, align: 'right' });
      y += need;
    } else if (y + 13 > aEnd) { hidden++; } else {
      g.save(); g.globalAlpha = 0.25;
      drawSprite(g, SP.ITEM_RELIC, 0, J.a.x + 12, y + 8, null);
      g.restore();
      text(g, '???', J.a.x + 24, y, { color: P.UI_DARK });
      y += 13;
    }
  }
  if (hidden) text(g, '+' + hidden + ' MORE', J.a.x + J.a.w - 6, aEnd - 6, { color: P.UI_DARK, align: 'right' });

  // ── what you have proved ────────────────────────────────────────────────
  panel(g, J.b.x, J.b.y, J.b.w, J.b.h, 0.85);
  text(g, 'FIELD NOTES', J.b.x + 6, J.b.y + 6, { color: P.UI_DIM });
  const bEnd = J.b.y + J.b.h - 6;
  let ry = J.b.y + 18;
  const RULES = G.ruleTable || {};
  const ids = Array.from(G.discoveries);
  if (!ids.length) text(g, 'YOU HAVE PROVED NOTHING YET.', J.b.x + 6, ry, { color: P.UI_DARK, maxWidth: J.b.w - 12 });
  let moreRules = 0;
  for (const id of ids) {
    const r = RULES[id];
    if (!r) continue;
    const lines = wrap(r.rule, J.b.w - 14, 1).slice(0, J.narrow ? 3 : 2);
    const need = 8 + lines.length * 8 + 5;
    if (ry + need > bEnd - 10) { moreRules++; continue; }
    text(g, r.title, J.b.x + 6, ry, { color: P.UI_COOL, maxWidth: J.b.w - 12 });
    for (let k = 0; k < lines.length; k++) text(g, lines[k], J.b.x + 6, ry + 8 + k * 8, { color: P.UI_BONE });
    ry += need;
  }
  const total = Object.keys(RULES).length || 16;
  text(g, (moreRules ? '+' + moreRules + ' MORE   ' : '') +
    Math.max(0, total - G.discoveries.size) + ' UNCONFIRMED',
    J.b.x + 6, bEnd - 6, { color: P.UI_DARK, maxWidth: J.b.w - 12 });

  text(g, G.touch ? 'TAP TO GO BACK' : 'TAB  BACK', VW / 2, VH - SAFE.b - 12,
    { color: P.UI_DIM, align: 'center' });
}

export function drawPause(g, G, dt) {
  fill(g, P.VOID, 0.78);
  const cx = VW / 2;
  const top = SAFE.t, foot = VH - SAFE.b;
  text(g, 'PAUSED', cx, top + 24, { color: P.UI_BONE, align: 'center', scale: VW < 300 ? 3 : 4 });

  // Tell the player about the controls they actually have.
  const lines = G.touch ? [
    'PAD          MOVE   AIM   HOLD UP TO CLIMB',
    'DIG          HOLD FOR A HEAVY STRIKE',
    'JUMP         JUMP',
    'OUT          HOLD - CALL THE WINCH, FOR A CUT',
    'BLAST        BLAST CHARGE',
    'PING         SONAR PULSE',
    'USE          THE SHAFT   THE LIFT',
    'DIM          DIM THE LANTERN',
  ] : [
    'A D / ARROWS      MOVE',
    'W S               AIM   CLIMB',
    'SPACE  J          DIG   HOLD FOR HEAVY',
    'K  SHIFT          JUMP',
    'L                 BLAST CHARGE',
    'V                 SONAR PULSE',
    'E                 THE SHAFT   THE LIFT',
    'Q  (HOLD)         CALL THE WINCH - IT TAKES A CUT',
    'F                 DIM THE LANTERN (LASTS LONGER)',
    'TAB               FIELD JOURNAL (IN THE DEPOT)',
    'M                 MUTE',
  ];
  const lh = 11;
  const lx = Math.max(8, Math.round(cx - Math.min(220, VW - 24) / 2));
  let y = Math.max(top + 56, Math.round((VH - lines.length * lh) / 2) - 10);
  for (const l of lines) { text(g, l, lx, y, { color: P.UI_DIM, maxWidth: VW - 16 }); y += lh; }

  const PL = pauseLayout();
  if (G.touch) {
    g.save(); g.globalAlpha = 0.24; g.fillStyle = P.UI_GOOD;
    g.fillRect(PL.resume.x, PL.resume.y, PL.resume.w, PL.resume.h); g.restore();
    g.strokeStyle = P.UI_GOOD;
    g.strokeRect(PL.resume.x + 0.5, PL.resume.y + 0.5, PL.resume.w - 1, PL.resume.h - 1);
  }
  text(g, G.touch ? 'RESUME' : 'ESC  RESUME', cx, PL.resume.y + 6,
    { color: P.UI_GOOD, align: 'center', scale: 2 });

  // The way out belongs on the screen a stuck player opens.
  text(g, G.touch ? 'IN THE MINE, HOLD OUT TO CALL THE WINCH UP'
                  : 'IN THE MINE, HOLD Q TO CALL THE WINCH UP',
    cx, PL.hint.y + 2, { color: P.UI_GOLD, align: 'center', maxWidth: VW - 12 });
  text(g, 'IT TAKES A CUT OF THE HAUL - LESS NEAR THE RIG',
    cx, PL.hint.y + 12, { color: P.UI_DARK, align: 'center', maxWidth: VW - 12 });
}
