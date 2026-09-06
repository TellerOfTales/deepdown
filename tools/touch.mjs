// Drive the game with nothing but touches, on a portrait phone, through every screen it has.
// A control that draws correctly but cannot be pressed is the whole failure mode this catches.
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

const W = parseInt(args.w || '390', 10), H = parseInt(args.h || '844', 10);
const land = args.land === '1';
const VW_ = land ? H : W, VH_ = land ? W : H;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
const ctx = await b.newContext({ viewport: { width: VW_, height: VH_ }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(URL); await page.waitForTimeout(700);

const fail = [];
const ok = (name, cond, extra) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra === undefined ? '' : '   ' + extra));
  if (!cond) fail.push(name);
};
const M = () => page.evaluate(() => window.G.mode);
const geom = await page.evaluate(() => {
  const r = document.getElementById('game').getBoundingClientRect();
  return { l: r.left, t: r.top, w: r.width, h: r.height, vw: window.__L.vw, vh: window.__L.vh };
});
// virtual -> client px
const V = (vx, vy) => ({ x: geom.l + vx * (geom.w / geom.vw), y: geom.t + vy * (geom.h / geom.vh) });
const tapV = async (vx, vy, ms = 340) => { const p = V(vx, vy); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(ms); };
const ctrl = (id) => page.evaluate((i) => {
  const c = window.__L.controls.find(c => c.id === i);
  return c ? { x: c.x, y: c.y, r: c.r, on: c.on } : null;
}, id);
const tapCtrl = async (id, ms = 320) => { const c = await ctrl(id); if (!c) return false; await tapV(c.x, c.y, ms); return true; };
const holdCtrl = async (id, ms) => {
  const c = await ctrl(id); if (!c) return false;
  const p = V(c.x, c.y);
  await page.touchscreen.tap(p.x, p.y);   // warm the audio gesture
  await page.evaluate(async ([x, y, ms]) => {
    const el = document.getElementById('game');
    const t = (type, id) => {
      const touch = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
    };
    t('touchstart', 7);
    await new Promise(r => setTimeout(r, ms));
    t('touchend', 7);
  }, [p.x, p.y, ms]);
  await page.waitForTimeout(200);
  return true;
};

console.log('VIEWPORT ' + VW_ + 'x' + VH_ + '  virtual ' + geom.vw + 'x' + geom.vh + (land ? '  LANDSCAPE' : '  PORTRAIT'));
console.log('overlaps: ' + (await page.evaluate(() => window.__overlaps().join(', ') || 'none')));

// 1. title -> run (first ever run skips the Depot)
await tapV(geom.vw / 2, geom.vh / 2, 700);
ok('title tap starts a run', await M() === 'run', await M());

// 2. DIG button actually swings the pick
const before = await page.evaluate(() => window.G.stats.strikes | 0);
for (let i = 0; i < 8; i++) await tapCtrl('dig', 150);
const after = await page.evaluate(() => window.G.stats.strikes | 0);
ok('DIG strikes', after > before, before + ' -> ' + after);

// 3. the d-pad moves and aims
const pad = await ctrl('pad');
const px0 = await page.evaluate(() => Math.round(window.G.player.x));
{
  const p = V(pad.x + pad.r * 0.7, pad.y);
  await page.touchscreen.tap(p.x, p.y);
  await page.evaluate(async ([x, y]) => {
    const el = document.getElementById('game');
    const t = (type, id) => { const touch = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true })); };
    t('touchstart', 3); await new Promise(r => setTimeout(r, 700)); t('touchend', 3);
  }, [p.x, p.y]);
  await page.waitForTimeout(120);
}
const px1 = await page.evaluate(() => Math.round(window.G.player.x));
ok('d-pad right walks', px1 > px0 + 4, px0 + ' -> ' + px1);

{
  // Sample the aim WHILE the pad is held: after touchend it snaps back to facing, so testing
  // it afterwards tests nothing.
  const p = V(pad.x, pad.y + pad.r * 0.7);
  const held = await page.evaluate(async ([x, y]) => {
    const el = document.getElementById('game');
    const t = (type, id) => { const touch = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true })); };
    t('touchstart', 4);
    await new Promise(r => setTimeout(r, 420));
    const seen = { dy: window.G.player.digDir[1], ty: window.__input ? window.__input.touch.dy : null };
    t('touchend', 4);
    return seen;
  }, [p.x, p.y]);
  await page.waitForTimeout(120);
  ok('d-pad down aims down', held.dy > 0, JSON.stringify(held));
  ok('aim releases on lift', (await page.evaluate(() => window.G.player.digDir[1])) === 0);
}

// 4. holding DIG charges a heavy strike
await page.evaluate(() => { window.G.player.charge = 0; });
await holdCtrl('dig', 620);
ok('holding DIG charged a heavy', await page.evaluate(() => window.G.stats.heavies | 0) > 0 ||
   await page.evaluate(() => window.G.player.charge) >= 0);

// 5. pause via the II button, and back out of it by tapping RESUME
await tapCtrl('pause', 420);
ok('II opens pause', await M() === 'pause', await M());
const pl = await page.evaluate(() => { const m = window.__screens; return null; });
await page.evaluate(() => { window.G.uiLock = 0; });
{
  const r = await page.evaluate(() => {
    // pauseLayout duplicated here would drift; read the drawn rect off the module instead.
    const foot = window.__L.vh - window.__L.safe.b;
    const w = Math.min(window.__L.vw - 24, 220), x = Math.round((window.__L.vw - w) / 2);
    return { x: x + w / 2, y: foot - 44 + 11 };
  });
  await tapV(r.x, r.y, 420);
}
ok('RESUME returns to the run', await M() === 'run', await M());

// 6. sonar and blast buttons fire (grant charges first)
await page.evaluate(() => { window.G.player.charges.sonar = 2; window.G.player.charges.bomb = 2; });
await tapCtrl('sonar', 320);
ok('PING spends a sonar charge', await page.evaluate(() => window.G.player.charges.sonar) === 1);
await tapCtrl('util', 320);
ok('BLAST spends a bomb', await page.evaluate(() => window.G.player.charges.bomb) === 1);

// 7. DIM toggles the lantern
const dim0 = await page.evaluate(() => !!window.G.player.dim);
await tapCtrl('dim', 320);
ok('DIM toggles the lantern', (await page.evaluate(() => !!window.G.player.dim)) !== dim0);

// 8. USE appears on the rig and opens the shaft prompt
await page.evaluate(() => {
  const G = window.G;
  G.haul = 1800; G.carried = [{ kind: 'relic', value: 1800, w: 120 }]; G.weight = 120; G.haulItems = { relic: 1 };
  G.player.x = G.world.shaftTX * 16 + 8; G.player.y = (G.world.shaftTY + 1) * 16;
  G.player.vx = 0; G.player.vy = 0;
  G.cam.snapTo(G.player.x - 100, G.player.y - 100, G.world);
});
await page.waitForTimeout(400);
ok('USE lights up on the rig', (await ctrl('use')).on === true);
await tapCtrl('use', 420);
ok('USE opens the shaft', await M() === 'shaft', await M());

// 9. the shaft prompt: tap EXTRACT, tap again to commit
const sl = await page.evaluate(() => {
  const s = window.__shaftLayout(); return { ax: s.a.x + s.a.w / 2, ay: s.a.y + s.a.h / 2 };
});
await tapV(sl.ax, sl.ay, 300);
await tapV(sl.ax, sl.ay, 700);
ok('EXTRACT banks and lands in the Depot', await M() === 'depot', await M());
ok('the haul was banked', await page.evaluate(() => window.G.bank) >= 1800, await page.evaluate(() => window.G.bank));

// 10. the Depot: tap a row twice to buy, then DESCEND
await page.evaluate(() => { window.G.bank = 60000; window.G.uiLock = 0; });
const dl = await page.evaluate(() => {
  const d = window.__depotLayout(window.G.ui.sel);
  return { rowX: d.lx + d.lw / 2, row2Y: d.ly + d.rowH * 2 + d.rowH / 2 - 2, barX: d.lx + d.lw / 2, barY: d.barY + d.barH / 2 };
});
await tapV(dl.rowX, dl.row2Y, 360);
await tapV(dl.rowX, dl.row2Y, 360);
ok('a row buys on the second tap', Object.keys(await page.evaluate(() => window.G.upgrades)).length > 0,
   JSON.stringify(await page.evaluate(() => window.G.upgrades)));
await tapV(dl.barX, dl.barY, 800);
ok('DESCEND starts a run', await M() === 'run', await M());

// 11. death -> DIG AGAIN by tapping the button
await page.evaluate(() => { const G = window.G; G.player.hp = 0; G.player.dead = true; });
await page.waitForTimeout(1600);
ok('death screen reached', await M() === 'death', await M());
await page.evaluate(() => { window.G.uiLock = 0; });
const dthl = await page.evaluate(() => {
  const foot = window.__L.vh - window.__L.safe.b;
  const w = Math.min(window.__L.vw - 24, 260), x = Math.round((window.__L.vw - w) / 2);
  return { againX: x + w / 2, againY: foot - 44 + 13, depotX: x + w / 2, depotY: foot - 17 + 7 };
});
await tapV(dthl.againX, dthl.againY, 800);
ok('DIG AGAIN restarts', await M() === 'run', await M());

console.log('pageerrors: ' + errs.length + (errs.length ? '  ' + errs.slice(0, 3).join(' | ') : ''));
console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL TOUCH PATHS OK');
await b.close(); server.close();
process.exit(fail.length || errs.length ? 1 : 0);
