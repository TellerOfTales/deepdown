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
import { VW, VH } from '../config.js';
import { STRATA } from '../world/tiles.js';
import { clamp, hashf } from '../core/rng.js';
import { money, moneyBig } from './hud.js';

export const UPGRADES = [
  { id: 'pick',      name: 'REINFORCED PICK',   desc: 'Break granite and masonry with a normal strike.', icon: 'ICON_PICK',   max: 2, cost: 420,  step: 2.4 },
  { id: 'carbide',   name: 'CARBIDE TIP',       desc: 'Heavy strikes charge faster and hit harder.',     icon: 'ICON_PICK',   max: 3, cost: 300,  step: 2.0 },
  { id: 'mantle',    name: 'LANTERN MANTLE',    desc: 'A wider circle of certainty.',                    icon: 'ICON_LANTERN',max: 3, cost: 260,  step: 2.0 },
  { id: 'oil',       name: 'OIL RESERVE',       desc: 'The dark comes for you later.',                   icon: 'ICON_LANTERN',max: 3, cost: 220,  step: 1.9 },
  { id: 'pack',      name: 'RUCKSACK',          desc: 'Carry more before greed becomes weight.',         icon: 'ICON_BAG',    max: 3, cost: 340,  step: 2.1 },
  { id: 'eye',       name: 'PROSPECTORS EYE',   desc: 'Faint gold flecks read at twice the distance.',   icon: 'ICON_DEPTH',  max: 2, cost: 500,  step: 2.6 },
  { id: 'resonance', name: 'RESONANCE KIT',     desc: 'A struck wall shows you the hollow behind it.',   icon: 'ICON_SONAR',  max: 1, cost: 640,  step: 1 },
  { id: 'charges',   name: 'BLAST CHARGES',     desc: 'Two charges. Rock does not argue with them.',     icon: 'ICON_BOMB',   max: 3, cost: 380,  step: 1.8 },
  { id: 'sonar',     name: 'SONAR PULSE',       desc: 'One ping. Every seam and cavity, for a moment.',  icon: 'ICON_SONAR',  max: 2, cost: 720,  step: 2.2 },
  { id: 'spikes',    name: 'CLIMBING SPIKES',   desc: 'Climb any wall you can reach.',                   icon: 'ICON_PICK',   max: 1, cost: 560,  step: 1 },
  { id: 'boots',     name: 'PADDED BOOTS',      desc: 'Fall further than you should.',                   icon: 'ICON_DEPTH',  max: 2, cost: 300,  step: 2.2 },
  { id: 'beacon',    name: 'EXTRACTION BEACON', desc: 'Leave from anywhere. Once.',                      icon: 'ICON_COMBO',  max: 1, cost: 900,  step: 1 },
];

export function upgradeCost(u, level) {
  const raw = u.cost * Math.pow(u.step, level);
  return Math.round(raw / 10) * 10;
}

const S = { t: 0, dust: null, sel: 0 };

export function screensUpdate(G, dt) {
  S.t += dt;
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
  for (let i = 11; i >= 0; i--) {
    const k = i / 11;
    const w = 40 + k * 520, h = 24 + k * 300;
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
  const lights = [[cx - 62, cy + 12, P.GOLD4], [cx + 74, cy - 26, P.CYAN4], [cx + 18, cy + 44, P.MAG4]];
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
  const y = 58;
  const bob = Math.round(Math.sin(S.t * 1.1) * 1);
  text(g, 'DEEPER', VW / 2 + 1, y + 1 + bob, { color: P.INK, align: 'center', scale: 5 });
  text(g, 'DEEPER', VW / 2, y + bob, { color: P.UI_GOLD, align: 'center', scale: 5 });
  text(g, 'DEEPER', VW / 2 - 1, y - 1 + bob, { color: P.GOLD5, align: 'center', scale: 5, alpha: 0.25 });
  text(g, 'READ THE ROCK.  TAKE WHAT YOU CAN CARRY.  KNOW WHEN TO STOP.',
    VW / 2, y + 46, { color: P.UI_DIM, align: 'center' });

  if (G.stats.runs > 0) {
    text(g, 'DEEPEST ' + G.stats.deepest + ' M      BANKED ' + money(G.stats.banked) + '      RUNS ' + G.stats.runs,
      VW / 2, VH - 46, { color: P.UI_DARK, align: 'center' });
  }
  const a = 0.5 + Math.sin(S.t * 3.4) * 0.5;
  text(g, 'PRESS ENTER', VW / 2, VH - 30, { color: P.UI_BONE, align: 'center', scale: 2, alpha: 0.45 + a * 0.55, shadow: true });
}

export function drawDepot(g, G, dt) {
  fill(g, P.INK);
  g.save(); g.globalAlpha = 0.5; shaftBackdropSoft(g); g.restore();

  text(g, 'THE DEPOT', 12, 8, { color: P.UI_DIM });
  text(g, money(G.bank), 12, 17, { color: P.UI_GOLD, scale: 3, shadow: true });
  text(g, 'BANKED', 12 + measure(money(G.bank), 3) + 6, 30, { color: P.UI_DARK });

  // ── upgrades ──────────────────────────────────────────────────────────────
  const lx = 10, ly = 44, lw = 268, rowH = 13;
  const sel = clamp(G.ui.sel, 0, UPGRADES.length - 1);
  const view = 12;
  const first = clamp(sel - 5, 0, Math.max(0, UPGRADES.length - view));
  for (let i = 0; i < Math.min(view, UPGRADES.length); i++) {
    const idx = first + i;
    const u = UPGRADES[idx];
    if (!u) break;
    const lvl = (G.upgrades[u.id] | 0);
    const maxed = lvl >= u.max;
    const cost = upgradeCost(u, lvl);
    const afford = !maxed && G.bank >= cost;
    const on = idx === sel;
    const y = ly + i * rowH;

    if (on) {
      g.fillStyle = P.UI_PANEL_HI; g.fillRect(lx, y - 2, lw, rowH);
      g.strokeStyle = P.UI_GOLD; g.strokeRect(lx + 0.5, y - 1.5, lw - 1, rowH - 1);
      text(g, '>', lx - 6, y + 2, { color: P.UI_GOLD });
    }
    const nameCol = maxed ? P.UI_GOOD : afford ? P.UI_BONE : P.UI_DARK;
    const spr = SP[u.icon];
    if (spr) {
      g.save(); g.globalAlpha = afford || maxed ? 1 : 0.35;
      drawSprite(g, spr, 0, lx + 3, y, null);
      g.restore();
    }
    text(g, u.name, lx + 17, y + 2, { color: nameCol });
    // level pips
    for (let k = 0; k < u.max; k++) {
      g.fillStyle = k < lvl ? P.UI_GOLD : P.UI_DARK;
      g.fillRect(lx + 172 + k * 5, y + 3, 3, 3);
    }
    text(g, maxed ? 'MAX' : money(cost), lx + lw - 4, y + 2,
      { color: maxed ? P.UI_GOOD : afford ? P.UI_GOLD : P.UI_DARK, align: 'right' });
  }
  // The description of the highlighted row lives on its own line under the list, so a long
  // sentence can never collide with the row beneath it.
  const cur = UPGRADES[sel];
  if (cur) {
    const curLvl = G.upgrades[cur.id] | 0;
    g.fillStyle = P.UI_DARK;
    g.fillRect(lx, ly + Math.min(view, UPGRADES.length) * rowH + 2, lw, 1);
    // The pips on the row already say the level; the line under the list is for the WHY.
    text(g, curLvl >= cur.max ? 'FITTED. ' + cur.desc : cur.desc,
      lx + 2, ly + Math.min(view, UPGRADES.length) * rowH + 7,
      { color: curLvl >= cur.max ? P.UI_GOOD : P.UI_COOL, maxWidth: lw - 6 });
  }

  // ── right column ──────────────────────────────────────────────────────────
  const rx = 288, rw = VW - rx - 10;
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

  // ── the button that matters ───────────────────────────────────────────────
  const by = VH - 34, bh = 22;
  const pulse = 0.62 + Math.sin(S.t * 3.2) * 0.38;
  g.save();
  g.globalAlpha = 0.25 + pulse * 0.35;
  g.fillStyle = P.GOLD1; g.fillRect(10, by, VW - 20, bh);
  g.restore();
  g.strokeStyle = P.UI_GOLD; g.strokeRect(10.5, by + 0.5, VW - 21, bh - 1);
  text(g, 'SPACE   DESCEND', VW / 2, by + 6, { color: P.GOLD5, align: 'center', scale: 2, shadow: true });
  text(g, 'UP/DOWN SELECT    ENTER BUY', VW / 2, VH - 8, { color: P.UI_DARK, align: 'center' });
}

function shaftBackdropSoft(g) {
  const cx = VW / 2, cy = VH * 0.5;
  for (let i = 9; i >= 0; i--) {
    const k = i / 9;
    const w = 60 + k * 560, h = 30 + k * 320;
    g.globalAlpha = 0.05;
    g.fillStyle = i % 2 ? P.ROCK1 : P.ROCK0;
    g.fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
  }
}

export function drawDeath(g, G, dt) {
  fill(g, P.VOID, 0.86);
  const lr = G.lastRun || { depth: G.runMaxDepth, value: 0, items: {}, learned: [], time: 0 };

  text(g, 'BURIED AT', VW / 2, 22, { color: P.UI_DIM, align: 'center' });
  text(g, lr.depth + ' M', VW / 2, 32, { color: P.UI_BONE, align: 'center', scale: 4, shadow: true });

  // 1. what you learned — the largest block on the screen, on purpose
  const learned = (lr.learned || []);
  text(g, 'WHAT YOU LEARNED', 30, 74, { color: P.UI_COOL });
  g.fillStyle = P.UI_DARK; g.fillRect(30, 83, VW - 60, 1);
  if (!learned.length) {
    text(g, 'NOTHING. ' + String(G.deathCause || 'THE DARK').toUpperCase() + ' TOOK YOU FIRST.',
      30, 90, { color: P.UI_DIM });
    text(g, 'GO BACK AND PAY ATTENTION.', 30, 100, { color: P.UI_DARK });
  } else {
    let y = 90;
    for (let i = 0; i < Math.min(4, learned.length); i++) {
      const lines = wrap(learned[i], VW - 76, 1).slice(0, 2);
      text(g, '-', 30, y, { color: P.UI_COOL });
      for (let k = 0; k < lines.length; k++) text(g, lines[k], 40, y + k * 9, { color: k ? P.UI_DIM : P.UI_BONE });
      y += lines.length * 9 + 4;
    }
    if (learned.length > 4) text(g, '+' + (learned.length - 4) + ' MORE IN THE JOURNAL', 40, y, { color: P.UI_DARK });
  }

  // 2. what it cost
  const ly = 150;
  text(g, 'LOST', 30, ly, { color: P.UI_DANGER });
  g.fillStyle = P.UI_DARK; g.fillRect(30, ly + 9, VW - 60, 1);
  moneyBig(g, lr.value, 30 + measure(String(Math.round(lr.value)), 2) + 10, ly + 15, 2, P.UI_DANGER, 1);
  let ix = 30 + measure(money(lr.value), 2) + 14;
  for (const k of ['nugget', 'gem', 'shard', 'bone', 'relic']) {
    const n = lr.items[k] | 0;
    if (!n) continue;
    const spr = SP.ITEM_ART[k];
    g.save(); g.globalAlpha = 0.6;
    if (spr) drawSprite(g, spr, 0, ix + 5, ly + 26, null);
    g.restore();
    text(g, 'x' + n, ix + 12, ly + 18, { color: P.UI_DARK });
    ix += 30;
  }

  // 3. the dry facts
  const st = G.stats;
  const acc = st.strikes ? Math.round(st.crits / st.strikes * 100) : 0;
  text(g, 'TILES ' + G.stats.tilesBroken + '     BEST COMBO x' + G.player.bestCombo +
        '     ON THE BEAT ' + acc + '%     ' + Math.round(lr.time) + 'S',
    VW / 2, VH - 46, { color: P.UI_DARK, align: 'center' });

  const pulse = 0.55 + Math.sin(S.t * 4) * 0.45;
  text(g, 'R    DIG AGAIN', VW / 2, VH - 34, { color: P.UI_GOLD, align: 'center', scale: 3, alpha: 0.5 + pulse * 0.5, shadow: true });
  text(g, 'ENTER  THE DEPOT', VW / 2, VH - 10, { color: P.UI_DARK, align: 'center' });
}

export function drawJournal(g, G, dt) {
  fill(g, P.INK);
  text(g, 'FIELD JOURNAL', VW / 2, 8, { color: P.UI_BONE, align: 'center', scale: 2 });

  const lx = 10, lw = VW / 2 - 16;
  panel(g, lx, 28, lw, VH - 48, 0.85);
  text(g, 'ARCHIVE', lx + 6, 34, { color: P.UI_DIM });
  let y = 46;
  for (const j of G.journal) {
    if (y > VH - 34) break;
    if (j.found) {
      drawSprite(g, SP.ITEM_RELIC, 0, lx + 12, y + 10, null);
      text(g, j.name, lx + 24, y, { color: P.UI_GOLD });
      const lines = wrap(j.blurb, lw - 34, 1).slice(0, 2);
      for (let k = 0; k < lines.length; k++) text(g, lines[k], lx + 24, y + 8 + k * 8, { color: P.UI_DIM });
      text(g, j.depth + ' M', lx + lw - 6, y, { color: P.UI_DARK, align: 'right' });
      y += 8 + lines.length * 8 + 5;
    } else {
      g.save(); g.globalAlpha = 0.25;
      drawSprite(g, SP.ITEM_RELIC, 0, lx + 12, y + 8, null);
      g.restore();
      text(g, '???', lx + 24, y, { color: P.UI_DARK });
      y += 13;
    }
  }

  const rx = VW / 2 + 6, rw = VW / 2 - 16;
  panel(g, rx, 28, rw, VH - 48, 0.85);
  text(g, 'FIELD NOTES', rx + 6, 34, { color: P.UI_DIM });
  let ry = 46;
  const RULES = G.ruleTable || {};
  const ids = Array.from(G.discoveries);
  if (!ids.length) text(g, 'YOU HAVE PROVED NOTHING YET.', rx + 6, ry, { color: P.UI_DARK });
  for (const id of ids) {
    if (ry > VH - 44) break;
    const r = RULES[id];
    if (!r) continue;
    text(g, r.title, rx + 6, ry, { color: P.UI_COOL });
    const lines = wrap(r.rule, rw - 14, 1).slice(0, 2);
    for (let k = 0; k < lines.length; k++) text(g, lines[k], rx + 6, ry + 8 + k * 8, { color: P.UI_BONE });
    ry += 8 + lines.length * 8 + 5;
  }
  const total = Object.keys(RULES).length || 16;
  text(g, Math.max(0, total - G.discoveries.size) + ' RULES UNCONFIRMED', rx + 6, VH - 38, { color: P.UI_DARK });

  text(g, 'TAB  BACK', VW / 2, VH - 12, { color: P.UI_DIM, align: 'center' });
}

export function drawPause(g, G, dt) {
  fill(g, P.VOID, 0.78);
  text(g, 'PAUSED', VW / 2, 46, { color: P.UI_BONE, align: 'center', scale: 4 });
  const lines = [
    'A D / ARROWS      MOVE',
    'W S               AIM   CLIMB',
    'SPACE  J          DIG   HOLD FOR HEAVY',
    'K  SHIFT          JUMP',
    'L                 BLAST CHARGE',
    'V                 SONAR PULSE',
    'E                 THE SHAFT   THE LIFT',
    'F                 DIM THE LANTERN (LASTS LONGER)',
    'TAB               FIELD JOURNAL (IN THE DEPOT)',
    'M                 MUTE',
  ];
  let y = 96;
  for (const l of lines) { text(g, l, VW / 2 - 110, y, { color: P.UI_DIM }); y += 11; }
  text(g, 'ESC  RESUME', VW / 2, VH - 34, { color: P.UI_GOOD, align: 'center', scale: 2 });
  text(g, 'Q  ABANDON RUN  (LOSE THE HAUL)', VW / 2, VH - 14, { color: P.UI_DANGER, align: 'center' });
}
