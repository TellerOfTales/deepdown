import { VW, VH, TS } from './config.js';
import { newGame, update as gameUpdate } from './game.js';
import { Input } from './core/input.js';
import { buildAtlas } from './art/tiletex.js';
import { audio } from './core/audio.js';
import { drawHUD, drawShaftPrompt, hudUpdate } from './ui/hud.js';
import { drawTitle, drawDepot, drawDeath, drawJournal, drawPause, screensUpdate } from './ui/screens.js';
import {
  drawParallax, drawTiles, drawProps, drawLoot, drawPlayer, drawEnemies, drawEnemyGlow,
  drawAimCursor, drawVeinArrows, drawLighting, drawGlow, drawVignette, drawFlash,
} from './render.js';
import { P } from './art/pal.js';
import { text } from './art/font.js';
import { clamp } from './core/rng.js';

const canvas = document.getElementById('game');
const g = canvas.getContext('2d', { alpha: false });
canvas.width = VW; canvas.height = VH;
g.imageSmoothingEnabled = false;

let scale = 1, offX = 0, offY = 0;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  scale = Math.max(1, Math.min(Math.floor(w / VW), Math.floor(h / VH)));
  if (VW * scale < w * 0.72 || VH * scale < h * 0.72) scale = Math.min(w / VW, h / VH);
  const cw = Math.round(VW * scale), ch = Math.round(VH * scale);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  const r = canvas.getBoundingClientRect();
  offX = r.left; offY = r.top;
}
window.addEventListener('resize', resize);

const input = new Input();
input.attach(canvas, (cx, cy) => {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left) / (r.width / VW), y: (cy - r.top) / (r.height / VH) };
});

const G = newGame();
buildAtlas();

// Touch controls: a big DIG button under the right thumb, jump and utility beside it.
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
input.touchButtons = [
  { id: 'dig', x: VW - 46, y: VH - 44, r: 34 },
  { id: 'jump', x: VW - 100, y: VH - 30, r: 22 },
  { id: 'util', x: VW - 96, y: VH - 84, r: 20 },
];

function drawTouchUI() {
  if (!isTouch) return;
  g.save();
  g.globalAlpha = 0.28;
  for (const b of input.touchButtons) {
    g.fillStyle = input.touch[b.id] ? P.UI_GOLD : P.UI_WHITE;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 0.75;
  text(g, 'DIG', VW - 46, VH - 48, { color: P.INK, align: 'center', scale: 1 });
  text(g, 'JMP', VW - 100, VH - 34, { color: P.INK, align: 'center' });
  text(g, 'ITEM', VW - 96, VH - 88, { color: P.INK, align: 'center' });
  if (input.touch.active) {
    g.globalAlpha = 0.2; g.fillStyle = P.UI_WHITE;
    g.beginPath(); g.arc(70, VH - 56, 34, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function drawRun() {
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
  G.fx.drawGlow(g, G.cam.ix, G.cam.iy);
  drawSonar();
  drawVeinArrows(g, G);
  drawVignette(g, G);
  drawFlash(g, G);
  drawHUD(g, G, G.dtLast);
  if (G.mode === 'shaft') drawShaftPrompt(g, G);
  else if (G.shaft.near) drawInteractHint();
  drawTouchUI();
}

function drawInteractHint() {
  const y = 200;
  const label = G.shaft.near === 'entry' ? 'E  EXTRACT - BANK YOUR HAUL' : 'E  THE SHAFT';
  const pulse = 0.65 + Math.sin(G.t * 5) * 0.35;
  g.save(); g.globalAlpha = pulse;
  text(g, label, VW / 2, y, { color: P.UI_GOLD, align: 'center', shadow: true });
  g.restore();
}

function drawSonar() {
  if (G.sonar.t <= 0) return;
  const camX = G.cam.ix, camY = G.cam.iy;
  const world = G.world;
  const r = G.sonar.r;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(127,208,240,0.5)';
  g.lineWidth = 1;
  g.beginPath(); g.arc(G.sonar.x - camX, G.sonar.y - camY, r, 0, Math.PI * 2); g.stroke();
  const R = 15;
  const tx0 = Math.floor(G.sonar.x / TS), ty0 = Math.floor(G.sonar.y / TS);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > R) continue;
    const id = world.get(tx0 + dx, ty0 + dy);
    if (id !== 7 && id !== 8 && id !== 9 && id !== 12) continue;
    const a = clamp(G.sonar.t / 3.2, 0, 1) * 0.8;
    g.fillStyle = `rgba(255,216,103,${a})`;
    g.fillRect((tx0 + dx) * TS + 6 - camX, (ty0 + dy) * TS + 6 - camY, 4, 4);
    world.seen[(ty0 + dy) * world.w + (tx0 + dx)] = 255;
  }
  g.restore();
}

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 12) {
    gameUpdate(G, STEP, input);
    input.endFrame();
    acc -= STEP;
  }
  hudUpdate(G, dt);
  screensUpdate(G, dt);

  g.fillStyle = P.VOID;
  g.fillRect(0, 0, VW, VH);
  switch (G.mode) {
    case 'title': drawTitle(g, G, dt); break;
    case 'depot': drawDepot(g, G, dt); break;
    case 'journal': drawJournal(g, G, dt); break;
    case 'death': drawRun(); drawDeath(g, G, dt); break;
    case 'pause': drawRun(); drawPause(g, G, dt); break;
    default: drawRun(); break;
  }
}

resize();
requestAnimationFrame(frame);

// Audio needs a gesture. Wire every plausible first interaction.
const kick = () => { audio.init(); };
window.addEventListener('pointerdown', kick, { once: false });
window.addEventListener('keydown', kick, { once: false });
window.addEventListener('touchstart', kick, { once: false });

window.G = G;   // handy in the console; harmless in a shipped build
