import { VW, VH, VIEW, SAFE, TS, CFG } from './config.js';
import { newGame, update as gameUpdate, winchFee } from './game.js';
import { Input } from './core/input.js';
import { buildAtlas } from './art/tiletex.js';
import { audio } from './core/audio.js';
import { drawHUD, drawShaftPrompt, hudUpdate, shaftLayout } from './ui/hud.js';
import { drawTitle, drawDepot, drawDeath, drawJournal, drawPause, screensUpdate, depotLayout } from './ui/screens.js';
import {
  drawParallax, drawTiles, drawProps, drawLoot, drawPlayer, drawEnemies, drawEnemyGlow,
  drawAimCursor, drawVeinArrows, drawLighting, drawGlow, drawVignette, drawFlash, drawFleckGlints,
} from './render.js';
import { P } from './art/pal.js';
import { pixelRing } from './fx/particles.js';
import { text } from './art/font.js';
import { clamp } from './core/rng.js';
import { L, computeLayout, control, overlaps } from './ui/layout.js';

const canvas = document.getElementById('game');
const g = canvas.getContext('2d', { alpha: false });
g.imageSmoothingEnabled = false;

let gameReady = false;
const wrap = document.getElementById('wrap');
const safeProbe = document.getElementById('safe');

// A phone reports three different heights depending on who you ask, and the one that matters is
// visualViewport: it shrinks when the URL bar is showing and grows when it hides, and both
// happen mid-run. innerHeight lags it, and 100vh lies about it outright.
function measureBox() {
  const r = wrap.getBoundingClientRect();
  let w = r.width, h = r.height;
  const vv = window.visualViewport;
  // Inside an iframe the wrap is already the right size; standalone on a phone it is the
  // visual viewport that moves. Take the smaller so the deck is never pushed off-screen.
  if (vv && !inFrame) { w = Math.min(w, vv.width); h = Math.min(h, vv.height); }
  return { w: w || window.innerWidth, h: h || window.innerHeight };
}

let inFrame = false;
try { inFrame = window.self !== window.top; } catch { inFrame = true; }

function readSafeInsets() {
  if (!safeProbe) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(safeProbe);
  const n = (v) => Math.max(0, Math.round(parseFloat(v) || 0));
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}

// A touch device is one that has actually been touched, or that says its pointer is coarse.
// Both halves matter: a laptop with a touchscreen should not lose its keyboard legend, and a
// phone must not have to wait for its first tap before it gets buttons.
let coarse = false;
try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch { coarse = false; }
if (!coarse && (('ontouchstart' in window) || navigator.maxTouchPoints > 2)) coarse = true;

function resize() {
  const box = measureBox();
  // The desktop presentation — a centred, framed 16:9 window — is kept for mouse users on a
  // screen with room for it. Everything else fills the box it was given.
  const framed = !coarse && box.w >= 760 && box.h >= 460;
  computeLayout(box.w, box.h, readSafeInsets(), coarse, framed, window.devicePixelRatio || 1);

  canvas.width = L.vw; canvas.height = L.vh;
  canvas.style.left = L.cssX + 'px';
  canvas.style.top = L.cssY + 'px';
  canvas.style.width = L.cssW + 'px';
  canvas.style.height = L.cssH + 'px';
  document.body.classList.toggle('framed', framed);
  document.body.classList.toggle('touch', coarse);
  g.imageSmoothingEnabled = false;      // a new backing store resets this
  if (gameReady) { G.touch = coarse; G.deck = L.deck; }
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 260); });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}

const input = new Input();
input.attach(canvas, (cx, cy) => {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left) / (r.width / VW), y: (cy - r.top) / (r.height / VH) };
});

const G = newGame();
buildAtlas();

// Every touch control lives in src/ui/layout.js so that drawing it and hitting it can never
// disagree. input just needs the list.
G.touch = coarse;   // the HUD moves out of the way of thumbs

// ── the control surface ─────────────────────────────────────────────────────────────────────
// Drawn from the same table input hit-tests, so a button can never move under the thumb.
//
// The one piece of real design here is the ring on DIG. On a keyboard the perfect window is
// heard, and the ear is enough. On a phone the thumb is already sitting on the button, so the
// window is drawn there too: the rim goes white the moment the pick is ready and flares on a
// critical fracture. The rhythm becomes something you can watch your own thumb hit.

function ctrlEnabled(b) {
  const p = G.player;
  if (!p) return true;
  if (b.id === 'util') return p.charges.bomb > 0 || p.charges.sonar > 0;
  if (b.id === 'sonar') return p.charges.sonar > 0;
  return true;
}

function ctrlLabel(b) {
  const p = G.player;
  if (b.id === 'util' && p && p.charges.bomb <= 0 && p.charges.sonar > 0) return 'PING';
  return b.label;
}

function padDir(b) {
  // Echo what input resolved, so the lit arrow is always the direction actually being sent.
  return { x: input.touch.dx, y: input.touch.dy };
}

function drawDeck() {
  if (!L.coarse || L.deck <= 0) return;
  const y = VH - L.deck;
  g.save();
  g.fillStyle = P.INK; g.fillRect(0, y, VW, L.deck);
  g.globalAlpha = 0.5; g.fillStyle = P.UI_PANEL; g.fillRect(0, y + 1, VW, L.deck - 1);
  g.globalAlpha = 1;
  g.fillStyle = P.UI_PANEL_HI; g.fillRect(0, y, VW, 1);
  g.fillStyle = P.RIM || P.UI_DARK; g.fillRect(0, y + 1, VW, 1);
  g.restore();
}

function drawPad(b) {
  const d = padDir(b);
  const r = b.r, hub = Math.max(3, Math.round(r * 0.22));
  g.save();
  // base
  g.globalAlpha = L.deck > 0 ? 0.20 : 0.16;
  g.fillStyle = P.UI_WHITE;
  g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
  g.globalAlpha = L.deck > 0 ? 0.55 : 0.34;
  g.strokeStyle = P.UI_DIM; g.lineWidth = 1;
  g.beginPath(); g.arc(b.x + 0.5, b.y + 0.5, r - 1, 0, Math.PI * 2); g.stroke();
  // four arrows
  const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [ax, ay] of arms) {
    const on = (ax !== 0 && d.x === ax) || (ay !== 0 && d.y === ay);
    const cx = b.x + ax * r * 0.60, cy = b.y + ay * r * 0.60;
    const t = Math.max(4, Math.round(r * 0.30));
    g.globalAlpha = on ? 0.95 : 0.42;
    g.fillStyle = on ? P.UI_GOLD : P.UI_BONE;
    g.beginPath();
    g.moveTo(cx + ax * t, cy + ay * t);
    g.lineTo(cx - ax * t * 0.35 + ay * t * 0.85, cy - ay * t * 0.35 + ax * t * 0.85);
    g.lineTo(cx - ax * t * 0.35 - ay * t * 0.85, cy - ay * t * 0.35 - ax * t * 0.85);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 0.5; g.fillStyle = P.UI_DIM;
  g.fillRect(b.x - hub, b.y - hub, hub * 2, hub * 2);
  g.restore();
}

function drawButton(b) {
  const p = G.player;
  const down = !!input.touch[b.id];
  const live = ctrlEnabled(b);
  const dig = b.id === 'dig';
  const ready = dig && p && G.mode === 'run' && p.perfectOpen && !p.dead;
  const charging = dig && p && p.charge > 0.02;
  // OUT fills as the drum winds, the same language as a charging heavy strike: a ring that
  // completes is a thing you are committing to.
  const winding = b.id === 'exit' && (G.winch || 0) > 0;

  g.save();
  // body
  g.globalAlpha = b.ghost ? (L.deck > 0 ? 0.30 : 0.18) : (L.deck > 0 ? (live ? 0.42 : 0.16) : (live ? 0.30 : 0.12));
  g.fillStyle = down ? P.UI_GOLD : P.UI_WHITE;
  g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();

  // rim — the beat, under the thumb
  g.globalAlpha = 1;
  g.lineWidth = dig ? 2 : 1;
  g.strokeStyle = ready ? P.UI_WHITE : down ? P.UI_GOLD
    : b.exit ? P.UI_GOOD : live ? P.UI_DIM : P.UI_DARK;
  g.globalAlpha = ready ? 0.95 : b.exit ? 0.85 : b.ghost ? 0.35 : live ? 0.7 : 0.3;
  g.beginPath(); g.arc(b.x + 0.5, b.y + 0.5, b.r - 1, 0, Math.PI * 2); g.stroke();

  if (charging || winding) {
    // The heavy strike fills the rim as it charges, so a hold has a visible ceiling.
    const f = winding ? clamp(G.winch / CFG.winchHold, 0, 1) : clamp(p.charge, 0, 1);
    g.globalAlpha = 0.9;
    g.strokeStyle = winding ? P.UI_GOOD : f >= 1 ? P.UI_GOLD : P.MAG4;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(b.x + 0.5, b.y + 0.5, b.r - 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
    g.stroke();
  }

  g.globalAlpha = b.ghost ? 0.55 : live ? 0.92 : 0.35;
  const lab = ctrlLabel(b);
  const sc = dig ? 2 : 1;
  text(g, lab, b.x, b.y - (sc * 5) + 1, { color: P.INK, align: 'center', scale: sc });
  if (b.id === 'util' && p && p.charges.bomb > 0) {
    text(g, String(p.charges.bomb), b.x + b.r - 4, b.y - b.r + 2, { color: P.UI_BONE, align: 'right' });
  }
  if (b.id === 'sonar' && p && p.charges.sonar > 0) {
    text(g, String(p.charges.sonar), b.x + b.r - 4, b.y - b.r + 2, { color: P.UI_BONE, align: 'right' });
  }
  g.restore();
}

function drawTouchUI() {
  if (!L.coarse) return;
  // The shaft prompt is modal: uiPointer routes every touch to it, so the deck's buttons would
  // be drawn live and do nothing. Buttons that look pressable and are not are worse than none.
  if (G.mode === 'shaft') return;
  drawDeck();
  for (const b of L.controls) {
    if (b.on === false) continue;
    if (b.kind === 'pad') drawPad(b); else drawButton(b);
  }
}

function drawRun(withHud) {
  // The world is clipped to its own viewport so that particles, glow and the sonar ring cannot
  // spill over the control deck. Everything downstream can go on drawing in world space.
  g.save();
  g.beginPath(); g.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h); g.clip();
  drawParallax(g, G);
  drawTiles(g, G);
  drawProps(g, G);
  drawLoot(g, G);
  drawEnemies(g, G);
  drawPlayer(g, G);
  G.fx.draw(g, G.cam.ix, G.cam.iy);
  drawAimCursor(g, G);
  drawLighting(g, G);
  drawGlow(g, G);
  drawEnemyGlow(g, G);
  drawFleckGlints(g, G);
  G.fx.drawGlow(g, G.cam.ix, G.cam.iy);
  drawSonar();
  drawVeinArrows(g, G);
  drawVignette(g, G);
  drawFlash(g, G);
  g.restore();
  if (withHud === false) return;          // death and pause own the screen
  drawHUD(g, G, G.dtLast);
  if (G.mode === 'shaft') drawShaftPrompt(g, G);
  else if (G.shaft.near) drawInteractHint();
  drawTouchUI();
}

function drawInteractHint() {
  if (G.callout) return;
  // Standing on your own lift with an empty bag is not a decision, so do not dress it as one.
  if (G.shaft.near === 'entry' && G.haul <= 0) return;
  // Name the control the player actually has. Telling a phone to press E is how a prompt
  // teaches someone that the game is not for them.
  const key = L.coarse ? 'USE' : 'E';
  const label = G.shaft.near === 'entry'
    ? key + '  RIDE UP - BANK ' + moneyStr(G.haul)
    : key + '  THE SHAFT';
  const pulse = 0.65 + Math.sin(G.t * 5) * 0.35;
  g.save(); g.globalAlpha = pulse;
  text(g, label, VIEW.x + VIEW.w / 2, Math.round(VIEW.y + VIEW.h * 0.62),
    { color: P.UI_GOLD, align: 'center', shadow: true });
  g.restore();
}
const moneyStr = (n) => 'G' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function drawSonar() {
  if (G.sonar.t <= 0) return;
  const camX = G.cam.ix, camY = G.cam.iy;
  const world = G.world;
  const r = Math.round(G.sonar.r);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(127,208,240,0.5)';
  const sx = Math.round(G.sonar.x - camX), sy = Math.round(G.sonar.y - camY);
  // The wavefront outruns the viewport in about a second; past that every one of its ~4700
  // fillRects lands off-screen, and this is a game whose loop is a rhythm.
  // ...and reject once the whole circle has grown past every corner. The pulse is anchored to
  // where the player stood, and the camera follows the player, so its bounding box never leaves
  // the screen — the box test alone let ~400,000 off-screen fillRects through per pulse.
  const far = Math.hypot(Math.max(sx, VIEW.w - sx), Math.max(sy, VIEW.h - sy));
  if (r <= far && sx + r >= 0 && sy + r >= 0 && sx - r <= VIEW.w && sy - r <= VIEW.h) pixelRing(g, sx, sy, r, 1);
  const R = 15;
  const tx0 = Math.floor(G.sonar.x / TS), ty0 = Math.floor(G.sonar.y / TS);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > R) continue;
    const id = world.get(tx0 + dx, ty0 + dy);
    if (id !== 7 && id !== 8 && id !== 9 && id !== 12) continue;
    const a = clamp(G.sonar.t / 3.2, 0, 1) * 0.8;
    g.fillStyle = `rgba(255,216,103,${a})`;
    g.fillRect(Math.round((tx0 + dx) * TS + 6 - camX), Math.round((ty0 + dy) * TS + 6 - camY), 4, 4);
  }
  g.restore();
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  // One variable step per frame, hard-clamped. Collision resolution already advances a pixel at
  // a time, so a long frame degrades into slow motion rather than into tunnelling — and input is
  // consumed exactly once per frame, which is what keeps a rhythm game honest.
  if (dt > 1 / 20) dt = 1 / 20;
  if (dt < 0.0005) dt = 0.0005;
  gameUpdate(G, dt, input);
  input.endFrame();
  input.uiPointer = G.mode !== 'run';   // menus take taps; only a run takes the stick
  // The contextual USE button only exists while you are standing on the rig.
  const useBtn = control('use');
  if (useBtn) useBtn.on = G.mode === 'run' && !!G.shaft.near && !G.player.dead && !!G.player;
  hudUpdate(G, dt);
  screensUpdate(G, dt);

  g.fillStyle = P.VOID;
  g.fillRect(0, 0, VW, VH);
  switch (G.mode) {
    case 'title': drawTitle(g, G, dt); break;
    case 'depot': drawDepot(g, G, dt); break;
    case 'journal': drawJournal(g, G, dt); break;
    case 'death': drawRun(false); drawDeath(g, G, dt); break;
    case 'pause': drawRun(false); drawPause(g, G, dt); break;
    default: drawRun(true); break;
  }
}

gameReady = true;
resize();
requestAnimationFrame(frame);

// Audio needs a gesture. Wire every plausible first interaction.
const kick = () => { audio.init(); };
window.addEventListener('pointerdown', kick, { once: false });
window.addEventListener('keydown', kick, { once: false });
window.addEventListener('touchstart', kick, { once: false });

window.G = G;   // handy in the console; harmless in a shipped build
window.__L = L;
window.__overlaps = overlaps;
window.__input = input;
window.__shaftLayout = shaftLayout;
window.__depotLayout = depotLayout;
window.__winchFee = winchFee;
