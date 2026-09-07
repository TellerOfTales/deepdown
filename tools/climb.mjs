// What counts as climbable.
//
// Bare-handed, climbing means wedging yourself between two walls — a shaft you dug. With
// CLIMBING SPIKES it means one wall you are actually against. Both halves have failed before:
// the check was once so strict that a shaft two tiles wide sealed the player in, and then so
// loose that spikes let them climb open air alongside a cavern wall they were nowhere near.
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

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:' + PORT + (args.url || '/index.html')); await page.waitForTimeout(600);
await page.keyboard.press('Enter'); await page.waitForTimeout(700);

// gap: how many tiles of air, offset: which of those columns the miner stands in.
const probe = (gap, offset, spikes) => page.evaluate(([gap, offset, spikes]) => {
  const G = window.G, W = G.world;
  const tx = Math.floor(W.w * 0.3), top = Math.floor(W.h / 2) - 7, bot = top + 12;
  for (let y = top - 3; y <= bot + 3; y++) for (let x = tx - 6; x <= tx + 8; x++) W.set(x, y, 3);
  for (let y = top; y <= bot; y++) for (let k = 0; k < gap; k++) W.set(tx + k, y, 0);
  G.player.spikes = !!spikes;
  G.player.x = (tx + offset) * 16 + 8;
  G.player.y = (bot + 1) * 16;
  G.player.vx = 0; G.player.vy = 0;
  return G.player.inChimney(W);
}, [gap, offset, spikes]);

// A big open room: no wall within several tiles of the miner, or exactly one wall N tiles away.
const room = (fromWall, spikes) => page.evaluate(([fromWall, spikes]) => {
  const G = window.G, W = G.world;
  const tx = Math.floor(W.w * 0.55), top = Math.floor(W.h / 2) - 6, bot = top + 10;
  for (let y = top - 3; y <= bot + 3; y++) for (let x = tx - 4; x <= tx + 12; x++) W.set(x, y, 3);
  for (let y = top; y <= bot; y++) for (let x = tx; x <= tx + 10; x++) W.set(x, y, 0);
  G.player.spikes = !!spikes;
  G.player.x = (tx + fromWall) * 16 + 8;   // fromWall tiles right of the left wall at tx-1
  G.player.y = (bot + 1) * 16;
  G.player.vx = 0; G.player.vy = 0;
  return G.player.inChimney(W);
}, [fromWall, spikes]);

const fail = [];
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (extra === undefined ? '' : '   ' + extra)); if (!c) fail.push(n); };

console.log('bare-handed — a shaft you dug is a ladder:');
ok('1-wide shaft climbs', await probe(1, 0, false) === true);
ok('2-wide shaft climbs from the left column', await probe(2, 0, false) === true);
ok('2-wide shaft climbs from the right column', await probe(2, 1, false) === true);
ok('3-wide shaft does NOT climb', await probe(3, 1, false) === false, 'nobody braces across three tiles');
ok('open room does NOT climb', await room(6, false) === false);
ok('one tile from a wall does NOT climb', await room(1, false) === false, 'one wall is not a chimney');

console.log('with CLIMBING SPIKES — one wall is enough, but you have to be on it:');
ok('the tile beside the wall climbs', await room(0, true) === true);
ok('one clear tile out does NOT climb', await room(1, true) === false, 'a spike has to reach the rock');
ok('two tiles out does NOT climb', await room(2, true) === false, 'no climbing the sky');
ok('mid-room does NOT climb', await room(6, true) === false);
ok('spikes still climb a 2-wide shaft', await probe(2, 0, true) === true);
ok('spikes still climb a 3-wide shaft from its edge', await probe(3, 0, true) === true);

// And the climb has to actually move the miner, not just report that it could.
const rose = await page.evaluate(async () => {
  const G = window.G, W = G.world;
  const tx = Math.floor(W.w * 0.3), top = Math.floor(W.h / 2) - 7, bot = top + 12;
  for (let y = top - 3; y <= bot + 3; y++) for (let x = tx - 6; x <= tx + 8; x++) W.set(x, y, 3);
  for (let y = top; y <= bot; y++) { W.set(tx, y, 0); W.set(tx + 1, y, 0); }
  G.player.spikes = false;
  G.player.x = tx * 16 + 8; G.player.y = (bot + 1) * 16; G.player.vx = 0; G.player.vy = 0;
  return G.player.y;
});
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1800); await page.keyboard.up('ArrowUp');
const now = await page.evaluate(() => window.G.player.y);
ok('and holding UP actually lifts you', (rose - now) / 16 > 3, ((rose - now) / 16).toFixed(1) + ' tiles in 1.8s');

console.log('pageerrors: ' + errs.length + (errs.length ? '  ' + errs[0] : ''));
await b.close(); server.close();
console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'CLIMBING MEANS WHAT IT SAYS');
process.exit(fail.length || errs.length ? 1 : 0);
