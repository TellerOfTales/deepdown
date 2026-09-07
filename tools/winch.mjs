// The way out. A player who cannot leave has no decision to make, so this checks the winch
// from every angle: the fee it quotes, the hold that commits, the release that cancels, the
// beacon that waives it, and the thumb that has to reach it.
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
const fail = [];
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (extra === undefined ? '' : '   ' + extra)); if (!c) fail.push(n); };

// ── keyboard ────────────────────────────────────────────────────────────────────────────────
{
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  const M = () => page.evaluate(() => window.G.mode);

  // Park the miner in a sealed pocket a long way from either rig, holding a fortune. This is
  // the situation the player reported: no stairs, no route, no way home.
  const setup = await page.evaluate(() => {
    const G = window.G, W = G.world;
    const tx = Math.min(W.w - 12, W.shaftTX + 60), ty = Math.floor(W.h * 0.6);
    for (let y = ty - 4; y <= ty + 4; y++) for (let x = tx - 4; x <= tx + 4; x++) W.set(x, y, 3);
    for (let y = ty - 1; y <= ty; y++) W.set(tx, y, 0);
    G.player.x = tx * 16 + 8; G.player.y = (ty + 1) * 16; G.player.vx = 0; G.player.vy = 0;
    G.haul = 2000; G.haulItems = { relic: 1 }; G.weight = 300;
    G.carried = [{ kind: 'relic', value: 2000, w: 300 }];
    G.cam.snapTo(G.player.x - 240, G.player.y - 135, W);
    return { fee: window.__winchFee(G), bank: G.bank, dist: Math.round(Math.hypot(W.shaftTX - tx, W.shaftTY - ty)) };
  });
  console.log('sealed in, ' + setup.dist + ' tiles from the rig, carrying G2,000');
  ok('the winch quotes a fee', setup.fee > 0 && setup.fee < 2000, 'G' + setup.fee);

  // A short hold must NOT extract: letting go is how you change your mind.
  await page.keyboard.down('KeyQ'); await page.waitForTimeout(500); await page.keyboard.up('KeyQ');
  await page.waitForTimeout(200);
  ok('a short hold cancels', await M() === 'run', await M());
  ok('the bar resets on release', await page.evaluate(() => window.G.winch) === 0);

  // A full hold lifts you out and charges the fee.
  const bank0 = await page.evaluate(() => window.G.bank);
  await page.keyboard.down('KeyQ'); await page.waitForTimeout(1700); await page.keyboard.up('KeyQ');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ mode: window.G.mode, bank: window.G.bank, lr: window.G.lastRun }));
  ok('a full hold extracts', after.mode === 'depot', after.mode);
  ok('the haul banks minus the fee', after.bank === bank0 + (2000 - setup.fee),
     'G' + (after.bank - bank0) + ' of G2000, fee G' + setup.fee);
  ok('the fee is recorded for the report', after.lr && after.lr.fee === setup.fee, JSON.stringify(after.lr && after.lr.fee));
  ok('the run counts as an extraction', !!(after.lr && after.lr.extracted));

  // Carrying nothing, leaving is free.
  await page.evaluate(() => { window.G.uiLock = 0; });
  await page.keyboard.press('Space'); await page.waitForTimeout(800);
  await page.evaluate(() => { window.G.haul = 0; window.G.haulItems = {}; window.G.carried.length = 0; });
  const bank1 = await page.evaluate(() => window.G.bank);
  await page.keyboard.down('KeyQ'); await page.waitForTimeout(1700); await page.keyboard.up('KeyQ');
  await page.waitForTimeout(400);
  ok('an empty bag rides free', await page.evaluate(() => window.G.bank) === bank1 && await M() === 'depot',
     await M());

  // The beacon: instant, and no fee at all.
  await page.evaluate(() => { window.G.uiLock = 0; window.G.upgrades.beacon = 1; });
  await page.keyboard.press('Space'); await page.waitForTimeout(800);
  const bank2 = await page.evaluate(() => {
    const G = window.G; G.haul = 3000; G.haulItems = { relic: 2 }; G.weight = 200;
    G.carried = [{ kind: 'relic', value: 3000, w: 200 }];
    const W = G.world, tx = Math.min(W.w - 12, W.shaftTX + 60), ty = Math.floor(W.h * 0.6);
    G.player.x = tx * 16 + 8; G.player.y = (ty + 1) * 16;
    return G.bank;
  });
  ok('the beacon is armed', await page.evaluate(() => !!window.G.player.beacon));
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(500);
  ok('the beacon fires on a tap', await M() === 'depot', await M());
  ok('the beacon waives the fee', await page.evaluate(() => window.G.bank) === bank2 + 3000,
     'G' + ((await page.evaluate(() => window.G.bank)) - bank2) + ' of G3000');

  // ...and only once a run.
  await page.evaluate(() => { window.G.uiLock = 0; });
  await page.keyboard.press('Space'); await page.waitForTimeout(800);
  await page.evaluate(() => { window.G.player.beaconUsed = true; window.G.haul = 1000;
    window.G.carried = [{ kind: 'relic', value: 1000, w: 100 }]; window.G.weight = 100; });
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(400);
  ok('a spent beacon does not fire on a tap', await M() === 'run', await M());

  // Three ways the winch used to fire on a frame that had already stopped being a run. Each of
  // them banked the haul twice, and the second bank found an emptied bag and wrote BANKED G0
  // over the report of a good run.
  {
    await page.evaluate(() => { window.G.uiLock = 0; });
    await page.keyboard.press('Space'); await page.waitForTimeout(800);
    await page.evaluate(() => {
      const G = window.G, W = G.world;
      G.upgrades.beacon = 1; G.player.beacon = true; G.player.beaconUsed = false;
      G.haul = 1000; G.haulItems = { relic: 1 }; G.weight = 100;
      G.carried = [{ kind: 'relic', value: 1000, w: 100 }];
      G.player.x = W.entryTX * 16 + 8; G.player.y = (W.entryTY + 1) * 16;
      G.player.vx = 0; G.player.vy = 0;
    });
    await page.waitForTimeout(400);
    const b0 = await page.evaluate(() => window.G.bank);
    // E and Q in the same frame: ride the lift AND press the beacon.
    await page.keyboard.down('KeyQ');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyQ');
    const r = await page.evaluate(() => ({ bank: window.G.bank, lr: window.G.lastRun, used: window.G.player.beaconUsed }));
    // Whichever of the two lands first is fine; what must never happen is BOTH banking, which
    // left the second one writing a G0 report over a real run and eating the beacon for it.
    ok('the lift and the beacon cannot both bank one run',
       r.bank === b0 + 1000 && r.lr.value === 1000 && r.lr.fee === 0,
       'banked G' + (r.bank - b0) + ', report says G' + r.lr.value + ' via ' + r.lr.reason);
    ok('the report agrees with what was spent',
       (r.lr.reason === 'beacon') === (r.used === true),
       'reason=' + r.lr.reason + ' beaconUsed=' + r.used);
  }
  {
    // The exact same frame, not merely the same moment: both keys injected into one input
    // frame, which is what a real controller or a fast pair of thumbs can produce.
    await page.evaluate(() => { window.G.uiLock = 0; });
    await page.keyboard.press('Space'); await page.waitForTimeout(800);
    const b0 = await page.evaluate(() => {
      const G = window.G, W = G.world;
      G.player.beacon = true; G.player.beaconUsed = false;
      G.haul = 1200; G.haulItems = { relic: 1 }; G.weight = 100;
      G.carried = [{ kind: 'relic', value: 1200, w: 100 }];
      G.player.x = W.entryTX * 16 + 8; G.player.y = (W.entryTY + 1) * 16;
      G.player.vx = 0; G.player.vy = 0;
      return G.bank;
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const i = window.__input;
      i.pressedSet.add('KeyE'); i.pressedSet.add('KeyQ');
      i.down.add('KeyE'); i.down.add('KeyQ');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const i = window.__input; i.down.delete('KeyE'); i.down.delete('KeyQ'); });
    const one = await page.evaluate(() => ({ bank: window.G.bank, lr: window.G.lastRun }));
    ok('one frame, two exits, one bank', one.bank === b0 + 1200 && one.lr.value === 1200,
       'banked G' + (one.bank - b0) + ', report G' + one.lr.value + ' via ' + one.lr.reason);
  }

  {
    // Opening the shaft prompt at the rig must not charge the winch fee for a free lift.
    await page.evaluate(() => { window.G.uiLock = 0; });
    await page.keyboard.press('Space'); await page.waitForTimeout(800);
    await page.evaluate(() => {
      const G = window.G, W = G.world;
      G.player.beacon = false;
      G.haul = 1500; G.haulItems = { relic: 1 }; G.weight = 100;
      G.carried = [{ kind: 'relic', value: 1500, w: 100 }];
      G.player.x = W.shaftTX * 16 + 8; G.player.y = (W.shaftTY + 1) * 16;
      G.player.vx = 0; G.player.vy = 0;
    });
    await page.waitForTimeout(400);
    await page.keyboard.down('KeyQ'); await page.waitForTimeout(900);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ mode: window.G.mode, winch: +(window.G.winch || 0).toFixed(2) }));
    await page.keyboard.up('KeyQ'); await page.waitForTimeout(300);
    ok('the shaft prompt is not a winch call', m.mode === 'shaft', m.mode + ' winch=' + m.winch);
    ok('and the drum stops when the prompt takes over', m.winch === 0, 'winch=' + m.winch);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }

  // The fee falls as you walk toward the rig — the whole point of the mechanic.
  const quotes = await page.evaluate(() => {
    const G = window.G, W = G.world, out = [];
    for (const d of [70, 40, 15, 2]) {
      G.player.x = (W.shaftTX + d) * 16 + 8; G.player.y = (W.shaftTY + 1) * 16;
      out.push({ d, fee: window.__winchFee(G) });
    }
    return out;
  });
  const falling = quotes.every((q, i) => i === 0 || q.fee <= quotes[i - 1].fee);
  ok('the fee falls as you near the rig', falling, JSON.stringify(quotes));
  console.log('  pageerrors ' + errs.length + (errs.length ? ' ' + errs[0] : ''));
  await page.close();
}

// ── touch ───────────────────────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(700);
  const geo = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height, vw: window.__L.vw, vh: window.__L.vh };
  });
  const V = (vx, vy) => ({ x: geo.l + vx * (geo.w / geo.vw), y: geo.t + vy * (geo.h / geo.vh) });
  await page.touchscreen.tap(geo.l + geo.w / 2, geo.t + geo.h / 2); await page.waitForTimeout(800);
  const M = () => page.evaluate(() => window.G.mode);
  ok('in a run', await M() === 'run', await M());

  const exit = await page.evaluate(() => {
    const c = window.__L.controls.find(c => c.id === 'exit');
    return c ? { x: c.x, y: c.y, r: c.r } : null;
  });
  ok('there is an OUT button', !!exit, JSON.stringify(exit));

  await page.evaluate(() => {
    const G = window.G, W = G.world;
    const tx = Math.min(W.w - 12, W.shaftTX + 60), ty = Math.floor(W.h * 0.6);
    for (let y = ty - 4; y <= ty + 4; y++) for (let x = tx - 4; x <= tx + 4; x++) W.set(x, y, 3);
    for (let y = ty - 1; y <= ty; y++) W.set(tx, y, 0);
    G.player.x = tx * 16 + 8; G.player.y = (ty + 1) * 16; G.player.vx = 0; G.player.vy = 0;
    G.haul = 2400; G.haulItems = { relic: 1 }; G.weight = 300;
    G.carried = [{ kind: 'relic', value: 2400, w: 300 }];
    G.cam.snapTo(G.player.x - 100, G.player.y - 100, W);
  });
  await page.waitForTimeout(300);

  const holdAt = async (vx, vy, ms) => {
    const p = V(vx, vy);
    await page.evaluate(async ([x, y, ms]) => {
      const el = document.getElementById('game');
      const t = (type, id) => { const touch = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
        el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true })); };
      t('touchstart', 11); await new Promise(r => setTimeout(r, ms)); t('touchend', 11);
    }, [p.x, p.y, ms]);
    await page.waitForTimeout(250);
  };

  // The beacon on a thumb. It was bought for nine hundred gold and, until this test existed,
  // could not be fired on the only platform it has a button on.
  await page.evaluate(() => {
    const G = window.G;
    G.upgrades.beacon = 1; G.player.beacon = true; G.player.beaconUsed = false;
    G.haul = 1500; G.haulItems = { relic: 1 }; G.weight = 200;
    G.carried = [{ kind: 'relic', value: 1500, w: 200 }];
  });
  const beaconBank = await page.evaluate(() => window.G.bank);
  await holdAt(exit.x, exit.y, 90);
  const bres = await page.evaluate(() => ({ mode: window.G.mode, bank: window.G.bank,
    used: window.G.player.beaconUsed, fee: window.G.lastRun && window.G.lastRun.fee }));
  ok('a TAP on OUT fires the beacon', bres.mode === 'depot' && bres.used === true, bres.mode + ' used=' + bres.used);
  ok('the thumb beacon pays no fee', bres.bank === beaconBank + 1500, 'G' + (bres.bank - beaconBank) + ' of G1500, fee ' + bres.fee);

  // A held OUT must not carry into the next run. Rather than fight the menu with two synthetic
  // fingers, this holds one down across the transition and puts the game back into a run
  // underneath it — which is exactly the state a thumb resting on OUT produces.
  await page.evaluate(() => { window.G.uiLock = 0; });
  {
    const p = V(exit.x, exit.y);
    await page.evaluate(([x, y]) => {
      const el = document.getElementById('game');
      window.__stick = new Touch({ identifier: 31, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [window.__stick], targetTouches: [window.__stick], changedTouches: [window.__stick], bubbles: true, cancelable: true }));
    }, [p.x, p.y]);
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.G.uiLock = 0; });
    await page.keyboard.press('Space');          // DESCEND
    await page.waitForTimeout(2400);
    const held = await page.evaluate(() => ({ mode: window.G.mode, armed: window.G.winchArmed, winch: +(window.G.winch || 0).toFixed(2) }));
    ok('a finger left on OUT does not end the next run', held.mode === 'run',
       held.mode + ' armed=' + held.armed + ' winch=' + held.winch);
    await page.evaluate(() => {
      const el = document.getElementById('game');
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [window.__stick], bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    ok('and it works again once the finger lifts and returns', await page.evaluate(() => window.G.winchArmed) === true);
  }

  const bank0 = await page.evaluate(() => window.G.bank);
  await page.evaluate(() => {
    const G = window.G, W = G.world;
    const tx = Math.min(W.w - 12, W.shaftTX + 60), ty = Math.floor(W.h * 0.6);
    for (let y = ty - 4; y <= ty + 4; y++) for (let x = tx - 4; x <= tx + 4; x++) W.set(x, y, 3);
    for (let y = ty - 1; y <= ty; y++) W.set(tx, y, 0);
    G.player.x = tx * 16 + 8; G.player.y = (ty + 1) * 16; G.player.vx = 0; G.player.vy = 0;
    G.haul = 2400; G.haulItems = { relic: 1 }; G.weight = 300;
    G.carried = [{ kind: 'relic', value: 2400, w: 300 }];
    G.player.beacon = false;                       // the ordinary winch, not the beacon
  });
  await page.waitForTimeout(300);
  await holdAt(exit.x, exit.y, 450);
  ok('a short thumb-hold cancels', await M() === 'run', await M());
  await holdAt(exit.x, exit.y, 1700);
  const t = await page.evaluate(() => ({ mode: window.G.mode, bank: window.G.bank, fee: window.G.lastRun && window.G.lastRun.fee }));
  ok('OUT extracts on a full hold', t.mode === 'depot', t.mode);
  ok('the thumb path charges the same fee', t.fee > 0 && t.bank === bank0 + (2400 - t.fee),
     'banked G' + (t.bank - bank0) + ', fee G' + t.fee);
  console.log('  pageerrors ' + errs.length + (errs.length ? ' ' + errs[0] : ''));
  await ctx.close();
}

await b.close(); server.close();
console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'THE WAY OUT WORKS');
process.exit(fail.length ? 1 : 0);
