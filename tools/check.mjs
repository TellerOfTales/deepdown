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
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

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

const url = 'http://localhost:' + PORT + (args.url || '/index.html');
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

  // Play in rhythm: press one beat after the pick is ready, which is what a competent player does.
  const BEAT = 262;
  let held = null;
  const hold = async (k) => { if (held !== k) { if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); } };
  const beats = parseInt(args.beats || '150', 10);
  for (let i = 0; i < beats; i++) {
    // sink a shaft first, then alternate between tunnelling sideways and going deeper
    const dir = i < 26 ? 'ArrowDown'
      : (Math.floor(i / 14) % 3 === 2 ? 'ArrowDown' : (Math.floor(i / 42) % 2 ? 'ArrowLeft' : 'ArrowRight'));
    await hold(dir);
    await page.keyboard.press('Space');
    await page.waitForTimeout(BEAT);
    if (i === 20) await shot('04-digging');
    if (i === 80) await shot('05-deep');
    if (i === 120) await shot('05b-deeper');
  }
  await hold(null);
  await page.waitForTimeout(400);
  await shot('06-after');
  const state = await page.evaluate(() => {
    const G = window.G;
    if (!G) return { err: 'no G' };
    return {
      mode: G.mode, depth: G.depth, haul: Math.round(G.haul), hp: G.player.hp,
      light: Math.round(G.player.light), tiles: G.stats.tilesBroken, strikes: G.stats.strikes,
      crits: G.stats.crits, combo: G.player.bestCombo, enemies: G.enemies.length,
      onBeatPct: G.stats.strikes ? Math.round(G.stats.crits / G.stats.strikes * 100) : 0,
      weight: Math.round(G.weight), carryMax: G.player.carryMax, msgs: G.msgs.map(m => m.text),
      loot: G.loot.list.length, fx: G.fx.count ? G.fx.count() : -1,
      px: Math.round(G.player.x), py: Math.round(G.player.y),
      learned: Array.from(G.discoveries),
    };
  });
  console.log('STATE', JSON.stringify(state, null, 1));
} else if (script === 'opening') {
  // The first thirty seconds, as a new player would actually meet them.
  await shot('o0-title');
  await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  await shot('o1-first-breath');
  const BEAT = 262;
  let held = null;
  const hold = async (k) => { if (held !== k) { if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); } };
  let shotN = 2;
  for (let i = 0; i < 115; i++) {
    await hold(i < 8 ? 'ArrowRight' : (Math.floor(i / 11) % 3 === 2 ? 'ArrowRight' : 'ArrowDown'));
    await page.keyboard.press('Space');
    await page.waitForTimeout(BEAT);
    if (i % 16 === 15 && shotN < 9) await shot('o' + (shotN++) + '-t' + Math.round(i * BEAT / 1000) + 's');
  }
  await hold(null);
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    t: Math.round(window.G.runT), depth: window.G.depth, haul: Math.round(window.G.haul),
    hp: window.G.player.hp, light: Math.round(window.G.player.light),
    lightPct: Math.round(window.G.player.light / window.G.player.lightMax * 100),
    tiles: window.G.stats.tilesBroken, bestCombo: window.G.player.bestCombo,
    onBeat: Math.round(window.G.stats.crits / Math.max(1, window.G.stats.strikes) * 100),
    learned: Array.from(window.G.discoveries), weightPct: Math.round(window.G.weight / window.G.player.carryMax * 100),
    relics: window.G.journal.filter(j => j.found).length,
    lootOnGround: window.G.loot.list.length,
    lootKinds: window.G.loot.list.map(o => o.kind),
    carried: window.G.carried.length,
  }));
  console.log('OPENING', JSON.stringify(st));
} else if (script === 'clues') {
  // Every learnable rule in the game, exercised in situ. If one of these stops firing, the
  // second design pillar ("the environment is information") has quietly broken.
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(600);

  const place = async (finder) => {
    const ok = await page.evaluate(finder);
    if (!ok) return false;
    await page.waitForTimeout(320);
    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(262); }
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(250);
    return true;
  };

  // stand two tiles left of a face carrying deco `d` whose right neighbour matches `want`
  const standAt = (d, want) => {
    const G = window.G, W = G.world;
    for (let ty = 6; ty < W.h - 6; ty++) for (let tx = 8; tx < W.w - 8; tx++) {
      if (W.getDeco(tx, ty) !== d) continue;
      const behind = W.get(tx + 1, ty);
      if (want.indexOf(behind) < 0) continue;
      if (!W.solid(tx, ty)) continue;
      for (let y = ty - 1; y <= ty; y++) for (let x = tx - 4; x < tx; x++) W.set(x, y, 0);
      for (let x = tx - 4; x < tx; x++) if (!W.solid(x, ty + 1)) W.set(x, ty + 1, 3);
      G.player.x = (tx - 2) * 16 + 8; G.player.y = (ty + 1) * 16;
      G.player.vx = 0; G.player.vy = 0; G.player.facing = 1; G.player.hp = 5;
      G.cam.snapTo(G.player.x - 240, G.player.y - 135, G.world);
      return true;
    }
    return false;
  };

  const results = {};
  results.flecks = await place(new Function('return (' + standAt.toString() + ')(2, [7])')); // FLECK_RICH -> gold
  results.hollow = await place(new Function('return (' + standAt.toString() + ')(3, [0])')); // HAIRLINE  -> air
  results.roots  = await place(new Function('return (' + standAt.toString() + ')(6, [13,14])')); // ROOTLET -> root/water
  await shot('c1-after-clues');

  // slate shear + granite refusal: hand-build the situation
  await page.evaluate(() => {
    const G = window.G, W = G.world;
    const tx = 30, ty = Math.floor(W.h / 2);
    for (let y = ty - 1; y <= ty; y++) for (let x = tx - 5; x < tx; x++) W.set(x, y, 0);
    for (let x = tx - 5; x < tx + 10; x++) W.set(x, ty + 1, 3);
    for (let x = tx; x < tx + 9; x++) { W.set(x, ty, 4); W.set(x, ty - 1, 4); }   // slate bed
    G.player.x = (tx - 2) * 16 + 8; G.player.y = (ty + 1) * 16;
    G.player.vx = 0; G.player.vy = 0; G.player.facing = 1; G.player.hp = 5;
    G.cam.snapTo(G.player.x - 240, G.player.y - 135, G.world);
  });
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(262); }
  await page.keyboard.up('ArrowRight');
  await shot('c2-slate-shear');

  await page.evaluate(() => {
    const G = window.G, W = G.world;
    const tx = 60, ty = Math.floor(W.h / 2);
    for (let y = ty - 1; y <= ty; y++) for (let x = tx - 5; x < tx; x++) W.set(x, y, 0);
    for (let x = tx - 5; x < tx + 6; x++) W.set(x, ty + 1, 3);
    for (let x = tx; x < tx + 5; x++) { W.set(x, ty, 5); W.set(x, ty - 1, 5); }   // granite face
    G.player.x = (tx - 2) * 16 + 8; G.player.y = (ty + 1) * 16;
    G.player.vx = 0; G.player.vy = 0; G.player.facing = 1; G.player.hp = 5;
    G.player.pickPower = 1;
    G.cam.snapTo(G.player.x - 240, G.player.y - 135, G.world);
  });
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  // deliberately press OFF the beat so no crit lands and the granite genuinely refuses
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(430); }
  await page.keyboard.up('ArrowRight');
  await shot('c3-granite');

  const st = await page.evaluate(() => ({
    learned: Array.from(window.G.discoveries), placed: null,
    msgs: window.G.msgs.map(m => m.text),
  }));
  console.log('PLACED', JSON.stringify(results));
  console.log('CLUES', JSON.stringify(st));
} else if (script === 'vein') {
  // Put the miner one tile from a real gold seam and photograph the payoff: the pop, the
  // value popup, the chevron pointing at where the vein keeps going.
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(700);
  const found = await page.evaluate(() => {
    const G = window.G, W = G.world;
    // Find a FLECK_RICH face that has ore directly behind it — the exact situation the whole
    // gold-clue grammar exists to create — and stand the miner two tiles back from it.
    for (let ty = 8; ty < W.h - 6; ty++) for (let tx = 8; tx < W.w - 8; tx++) {
      if (W.getDeco(tx, ty) !== 2) continue;       // D.FLECK_RICH
      if (W.get(tx + 1, ty) !== 7) continue;       // ore behind it, to the right
      if (!W.solid(tx, ty)) continue;
      // carve a standing pocket to the LEFT so the fleck face must be broken to reach the seam
      for (let y = ty - 1; y <= ty; y++) for (let x = tx - 4; x < tx; x++) W.set(x, y, 0);
      for (let x = tx - 4; x < tx; x++) if (!W.solid(x, ty + 1)) W.set(x, ty + 1, 3);
      G.player.x = (tx - 2) * 16 + 8; G.player.y = (ty + 1) * 16;
      G.player.vx = 0; G.player.vy = 0; G.player.facing = 1;
      G.cam.snapTo(G.player.x - 240, G.player.y - 135, G.world);
      return { tx, ty, deco: W.getDeco(tx, ty), behind: W.get(tx + 1, ty) };
    }
    return null;
  });
  console.log('SEAM', JSON.stringify(found));
  await page.waitForTimeout(400);
  await shot('v0-approach');
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(262); }
  await shot('v1-first-break');
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(262); }
  await shot('v2-vein');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(262); }
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
  await shot('v3-after');
  const st = await page.evaluate(() => ({
    haul: Math.round(window.G.haul), items: window.G.haulItems,
    hints: window.G.veinHints.length, loot: window.G.loot.list.length,
    learned: Array.from(window.G.discoveries), combo: window.G.player.bestCombo,
  }));
  console.log('VEIN', JSON.stringify(st));
} else if (script === 'descend') {
  // Prove the whole expedition arc: run -> shaft -> stratum II -> shaft -> stratum III
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.press('Space'); await page.waitForTimeout(700);
  for (let s = 0; s < 2; s++) {
    await page.evaluate((step) => {
      const G = window.G;
      G.haul += 900 + step * 1200;
      G.player.x = G.world.shaftTX * 16 + 8;
      G.player.y = (G.world.shaftTY + 1) * 16;
      G.player.vx = 0; G.player.vy = 0;
      G.cam.snapTo(G.player.x - 240, G.player.y - 135, G.world);
    }, s);
    await page.waitForTimeout(350);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(900);
    await shot('d' + (s + 1) + '-stratum' + (s + 2));
    // dig around a little so the new stratum's rock gets exercised
    for (let i = 0; i < 24; i++) {
      await page.keyboard.down(i % 3 === 2 ? 'ArrowDown' : 'ArrowRight');
      await page.keyboard.press('Space'); await page.waitForTimeout(262);
      await page.keyboard.up(i % 3 === 2 ? 'ArrowDown' : 'ArrowRight');
    }
    await shot('d' + (s + 1) + 'b-dug' + (s + 2));
  }
  const st = await page.evaluate(() => ({
    mode: window.G.mode, stratum: window.G.strataIdx, depth: window.G.depth,
    haul: Math.round(window.G.haul), tiles: window.G.stats.tilesBroken,
    hp: window.G.player.hp, light: Math.round(window.G.player.light),
    enemies: window.G.enemies.length, learned: Array.from(window.G.discoveries),
  }));
  console.log('DESCEND', JSON.stringify(st));
} else if (script === 'screens') {
  // Walk every full-screen state and the shaft decision, driving state directly through window.G
  await page.keyboard.press('Enter');  await page.waitForTimeout(300);
  await page.evaluate(() => { window.G.bank = 8400; window.G.stats.runs = 7; window.G.stats.deepest = 148; window.G.stats.banked = 41200; });
  await page.waitForTimeout(200); await shot('s1-depot');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
  await shot('s2-depot-sel');
  await page.keyboard.press('Tab'); await page.waitForTimeout(250); await shot('s3-journal');
  await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  await page.keyboard.press('Space'); await page.waitForTimeout(600);
  // teleport onto the shaft and open the decision
  await page.evaluate(() => {
    const G = window.G;
    G.haul = 2480; G.weight = 640;
    G.haulItems = { nugget: 14, gem: 3, shard: 9, relic: 1 };
    G.player.x = G.world.shaftTX * 16 + 8;
    G.player.y = (G.world.shaftTY + 1) * 16;
    G.player.vx = 0; G.player.vy = 0;
    G.cam.snapTo(G.player.x - 240, G.player.y - 135, G.world);
  });
  await page.waitForTimeout(400); await shot('s4-at-shaft');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400); await shot('s5-shaft-prompt');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(250); await shot('s6-shaft-extract');
  await page.keyboard.press('Backspace'); await page.waitForTimeout(250);
  await page.evaluate(() => { window.G.runLearned = ['Flecks thicken toward the seam. Dig where they crowd.','A hairline in the face means open space behind it.','RECOVERED: HAND BELL']; window.G.player.hurt(9, 0, 0, null, 'a crawler'); window.G.deathCause = 'a crawler you never looked up at'; });
  await page.waitForTimeout(1800); await shot('s7-death');
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ mode: window.G.mode, hp: window.G.player.hp, dead: window.G.player.dead, deadT: window.G.player.deadT, rec: window.G.deathRecorded, lastRun: !!window.G.lastRun }));
  console.log('SCREENS', JSON.stringify(st));
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
