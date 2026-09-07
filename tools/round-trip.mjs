// Can a thumb make the round trip?
//
// The whole game is descend-and-return, and the player reported that the return leg was
// impossible on a phone: too fiddly to build stairs, no way to cash out. This plays the loop
// with nothing but touches — dig down, get a haul, come back up — and reports how far it got.
// It is not a unit test of a function; it is a test of whether the game is playable at all.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const root = process.cwd();
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const b = await readFile(join(root, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URL = 'http://localhost:' + PORT + (args.url || '/index.html');

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(URL); await page.waitForTimeout(700);

const geo = await page.evaluate(() => {
  const r = document.getElementById('game').getBoundingClientRect();
  return { l: r.left, t: r.top, w: r.width, h: r.height, vw: window.__L.vw, vh: window.__L.vh };
});
const V = (vx, vy) => ({ x: geo.l + vx * (geo.w / geo.vw), y: geo.t + vy * (geo.h / geo.vh) });
const ctrl = (id) => page.evaluate((i) => {
  const c = window.__L.controls.find(c => c.id === i);
  return c ? { x: c.x, y: c.y, r: c.r } : null;
}, id);

// Multi-touch: a real player holds the pad with one thumb and works DIG with the other.
let nextId = 20;
async function down(vx, vy) {
  const p = V(vx, vy), id = nextId++;
  await page.evaluate(([x, y, id]) => {
    const el = document.getElementById('game');
    window.__live = window.__live || new Map();
    window.__live.set(id, new Touch({ identifier: id, target: el, clientX: x, clientY: y }));
    const all = Array.from(window.__live.values());
    el.dispatchEvent(new TouchEvent('touchstart', { touches: all, targetTouches: all,
      changedTouches: [window.__live.get(id)], bubbles: true, cancelable: true }));
  }, [p.x, p.y, id]);
  return id;
}
async function up(id) {
  await page.evaluate((id) => {
    const el = document.getElementById('game');
    const t = window.__live.get(id);
    if (!t) return;
    window.__live.delete(id);
    const all = Array.from(window.__live.values());
    el.dispatchEvent(new TouchEvent('touchend', { touches: all, targetTouches: all,
      changedTouches: [t], bubbles: true, cancelable: true }));
  }, id);
}
const tap = async (vx, vy, ms = 90) => { const id = await down(vx, vy); await page.waitForTimeout(40); await up(id); await page.waitForTimeout(ms); };
const state = () => page.evaluate(() => {
  const G = window.G, p = G.player, a = G.aim;
  return {
    mode: G.mode, depth: Math.round(G.depth), haul: Math.round(G.haul),
    hp: p ? p.hp : 0, tiles: G.stats.tilesBroken, strikes: G.stats.strikes | 0,
    y: p ? Math.round(p.y / 16) : 0,
    chim: p && G.world ? p.inChimney(G.world) : false,
    tool: p ? +(p.tool / p.toolMax).toFixed(2) : 0,
    dir: p ? p.digDir.join(',') : '', climbing: p ? !!p.climbing : false,
    aim: a ? { t: a.tile, v: !!a.valid, tx: a.tx, ty: a.ty } : null,
    dy: window.__input ? window.__input.touch.dy : null,
    digDown: window.__input ? !!window.__input.touch.dig : null,
  };
});

const fail = [];
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (extra === undefined ? '' : '   ' + extra)); if (!c) fail.push(n); };

await tap(geo.vw / 2, geo.vh / 2, 900);
ok('a tap starts the run', (await state()).mode === 'run');

const pad = await ctrl('pad'), dig = await ctrl('dig');
const start = await state();
console.log('surface: ' + JSON.stringify(start));

// ── the descent: hold DOWN on the pad, work DIG with the other thumb ────────────────────────
// Tapped ON THE BEAT, not mashed: the pick has a 255ms recovery and pressing inside it is a
// lockout, by design. A test that mashes is testing the punishment, not the game.
const BEAT = 268;
const padDown = await down(pad.x, pad.y + pad.r * 0.72);
for (let i = 0; i < 70; i++) {
  await tap(dig.x, dig.y, BEAT - 40);
  if (i % 25 === 24) console.log('  digging... ' + JSON.stringify(await state()));
}
await up(padDown);
await page.waitForTimeout(400);
const bottom = await state();
console.log('bottom:  ' + JSON.stringify(bottom));
ok('a thumb can dig down', bottom.depth - start.depth >= 8, (bottom.depth - start.depth) + ' m');
ok('the shaft it dug is climbable', bottom.chim === true, 'inChimney=' + bottom.chim);

// ── the return: hold UP and nothing else ────────────────────────────────────────────────────
// Coming up is hold UP and cut through whatever roofed you in on the way down — the same two
// thumbs, the other way round.
const y0 = bottom.y;
const padUp = await down(pad.x, pad.y - pad.r * 0.72);
for (let i = 0; i < 45; i++) {
  await tap(dig.x, dig.y, BEAT - 40);
  if (i % 15 === 14) console.log('  climbing... ' + JSON.stringify(await state()));
}
const mid = await state();
await up(padUp);
await page.waitForTimeout(300);
console.log('after the climb: ' + JSON.stringify(mid));
ok('a thumb can climb back out', mid.y < y0 - 6, 'rose ' + (y0 - mid.y) + ' tiles of the ' + (y0 - start.y) + ' it fell');
ok('survived the round trip', mid.hp > 0, 'hp ' + mid.hp);

// ── and the winch, from wherever it ended up ────────────────────────────────────────────────
await page.evaluate(() => {
  const G = window.G;
  G.haul = 1600; G.haulItems = { nugget: 6 }; G.weight = 300;
  G.carried = [{ kind: 'nugget', value: 1600, w: 300 }];
});
const bank0 = await page.evaluate(() => window.G.bank);
const exit = await ctrl('exit');
const holdExit = await down(exit.x, exit.y);
await page.waitForTimeout(1700);
await up(holdExit);
await page.waitForTimeout(400);
const out = await page.evaluate(() => ({ mode: window.G.mode, bank: window.G.bank, fee: window.G.lastRun && window.G.lastRun.fee }));
ok('OUT still lifts you from wherever you are', out.mode === 'depot', out.mode);
ok('and the haul lands in the bank', out.bank > bank0, 'G' + (out.bank - bank0) + ' banked, fee G' + out.fee);

console.log('pageerrors: ' + errs.length + (errs.length ? '  ' + errs.slice(0, 2).join(' | ') : ''));
await b.close(); server.close();
console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'THE ROUND TRIP WORKS ON A THUMB');
process.exit(fail.length || errs.length ? 1 : 0);
