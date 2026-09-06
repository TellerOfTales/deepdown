// Device-matrix screenshot harness. Renders the game at real phone/tablet/desktop viewports
// so mobile framing can be judged by looking at it rather than by guessing at arithmetic.
//   node tools/shots.mjs                    -> every device, title + a live run
//   node tools/shots.mjs --only iphone14    -> one device
//   node tools/shots.mjs --url /dist/deeper.html
import { chromium, devices } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const root = process.cwd();
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const buf = await readFile(join(root, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URL = 'http://localhost:' + PORT + (args.url || '/index.html');
const OUT = args.out || 'shots';
mkdirSync(OUT, { recursive: true });

// Real viewports, in CSS px, with the device pixel ratio that ships with them.
const DEVICES = [
  { id: 'iphone-se',      w: 375, h: 667,  dpr: 2, touch: true  },
  { id: 'iphone14',       w: 390, h: 844,  dpr: 3, touch: true  },
  { id: 'iphone14-max',   w: 430, h: 932,  dpr: 3, touch: true  },
  { id: 'pixel7',         w: 412, h: 915,  dpr: 2.6, touch: true },
  { id: 'iphone14-land',  w: 844, h: 390,  dpr: 3, touch: true  },
  { id: 'ipad-portrait',  w: 820, h: 1180, dpr: 2, touch: true  },
  { id: 'ipad-land',      w: 1180, h: 820, dpr: 2, touch: true  },
  // The artifact iframe on a phone: full width, but only part of the height.
  { id: 'iframe-phone',   w: 390, h: 600,  dpr: 3, touch: true  },
  { id: 'desktop',        w: 1440, h: 900, dpr: 2, touch: false },
];

const only = args.only ? String(args.only).split(',') : null;
const list = only ? DEVICES.filter(d => only.includes(d.id)) : DEVICES;

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});

const rows = [];
for (const d of list) {
  const ctx = await b.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr,
    hasTouch: d.touch, isMobile: d.touch,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(700);

  const geo = await page.evaluate(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return {
      css: [Math.round(r.width), Math.round(r.height)],
      backing: [c.width, c.height],
      at: [Math.round(r.left), Math.round(r.top)],
      win: [window.innerWidth, window.innerHeight],
      vv: window.visualViewport ? [Math.round(window.visualViewport.width), Math.round(window.visualViewport.height)] : null,
      touch: !!(window.G && window.G.touch),
      k: window.__L ? window.__L.k : 0,
      deck: window.__L ? window.__L.deck : 0,
      bad: window.__overlaps ? window.__overlaps().join(' ') : '',
    };
  });
  await page.screenshot({ path: join(OUT, d.id + '-1-title.png') });

  // Into a run, then a few seconds of digging so the HUD and controls are all on screen.
  await page.evaluate(() => { const G = window.G; G.stats.runs = 0; });
  if (d.touch) await page.touchscreen.tap(d.w / 2, d.h / 2);
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, d.id + '-2-run.png') });

  await page.evaluate(() => { const G = window.G; if (G.mode === 'run') { G.haul = 2400; G.weight = 700; G.carried = [{ kind: 'relic', value: 2400, w: 700 }]; } });
  for (let i = 0; i < 26; i++) {
    if (d.touch) { await page.touchscreen.tap(d.w * 0.8, d.h * 0.8); } else { await page.keyboard.press('Space'); }
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: join(OUT, d.id + '-3-dig.png') });

  // The Depot, which is the densest screen in the game.
  await page.evaluate(() => { const G = window.G; G.bank = 42000; G.mode = 'depot'; G.ui.sel = 0; G.uiLock = 0; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, d.id + '-4-depot.png') });

  const mode = await page.evaluate(() => window.G.mode);
  rows.push({ id: d.id, ...geo, mode, errs: errs.length });
  await ctx.close();
}
await b.close(); server.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('device', 15), pad('window', 11), pad('canvas css', 12), pad('backing', 11), pad('k', 4), pad('deck', 8), pad('touch', 6), 'err');
for (const r of rows) {
  console.log(pad(r.id, 15), pad(r.win.join('x'), 11), pad(r.css.join('x'), 12),
    pad(r.backing.join('x'), 11), pad('k' + r.k, 4), pad('deck' + r.deck, 8),
    pad(r.touch, 6), r.errs, r.bad ? 'OVERLAP ' + r.bad : '');
}
