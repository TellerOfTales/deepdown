// Headless smoke test + screenshot harness.
//   node tools/check.mjs                     -> boot, play a scripted session, screenshot
//   node tools/check.mjs --shots 6           -> more screenshots along the way
//   node tools/check.mjs --url /tools/preview.html --frames 30 --shots 1
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const root = process.cwd();
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(8125, r));

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const errors = [], logs = [];
page.on('console', (m) => { const t = m.text(); logs.push(m.type() + ': ' + t); if (m.type() === 'error') errors.push(t); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));

const url = 'http://localhost:8125' + (args.url || '/index.html');
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(700);

const shots = parseInt(args.shots || '4', 10);
const script = (args.script || 'play');

async function shot(name) { await page.screenshot({ path: `shots/${name}.png` }); }

if (script === 'play') {
  await shot('01-title');
  await page.keyboard.press('Enter');           // title -> depot
  await page.waitForTimeout(350);
  await shot('02-depot');
  await page.keyboard.press('Space');           // depot -> run
  await page.waitForTimeout(700);
  await shot('03-run-start');

  // dig around: alternate direction + rhythm taps
  for (let i = 0; i < 44; i++) {
    await page.keyboard.down('ArrowDown');
    await page.keyboard.press('Space');
    await page.waitForTimeout(130);
    await page.keyboard.press('Space');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowDown');
    if (i % 6 === 5) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200); await page.keyboard.press('Space'); await page.waitForTimeout(180); await page.keyboard.up('ArrowRight'); }
    if (i === 12) await shot('04-digging');
    if (i === 30) await shot('05-deep');
  }
  await page.waitForTimeout(400);
  await shot('06-after');
  const state = await page.evaluate(() => {
    const G = window.G;
    if (!G) return { err: 'no G' };
    return {
      mode: G.mode, depth: G.depth, haul: Math.round(G.haul), hp: G.player.hp,
      light: Math.round(G.player.light), tiles: G.stats.tilesBroken, strikes: G.stats.strikes,
      crits: G.stats.crits, combo: G.player.bestCombo, enemies: G.enemies.length,
      loot: G.loot.list.length, fx: G.fx.count ? G.fx.count() : -1,
      px: Math.round(G.player.x), py: Math.round(G.player.y),
      learned: Array.from(G.discoveries),
    };
  });
  console.log('STATE', JSON.stringify(state, null, 1));
} else {
  const frames = parseInt(args.frames || '20', 10);
  await page.waitForTimeout(frames * 40);
  for (let i = 0; i < shots; i++) { await shot('p' + i); await page.waitForTimeout(300); }
}

console.log('--- console (last 40) ---');
console.log(logs.slice(-40).join('\n'));
if (errors.length) {
  console.log('--- ERRORS (' + errors.length + ') ---');
  console.log(errors.slice(0, 12).join('\n\n'));
}
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
