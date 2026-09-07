// The artifact ships as a BODY FRAGMENT rendered inside an iframe on claude.ai, which is a
// different situation from opening dist/deeper.html: the page does not own the document, the
// host supplies its own reset, and the box may be smaller than the screen. This harness wraps
// dist/artifact.html the way the host does and checks it still frames and plays correctly.
//   node tools/iframe.mjs            -> phone, phone landscape, desktop
//   node tools/iframe.mjs --shots 1  -> also write /tmp screenshots
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));

const root = process.cwd();
const frag = await readFile(join(root, 'dist/artifact.html'), 'utf8');
// The shell the artifact host supplies: charset, viewport, and a small reset.
const FRAG_DOC = '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>body{margin:0;font:14px system-ui;background:#faf9f7}'
  + 'img{max-width:100%}[hidden]{display:none!important}</style>'
  + '</head><body>' + frag + '</body></html>';
const HOST_DOC = '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>html,body{margin:0;height:100%;background:#eee;overflow:hidden}'
  + 'iframe{border:0;display:block;width:100%;height:100%}</style>'
  + '</head><body><iframe src="/__frag"></iframe></body></html>';

const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const send = (body) => { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(body); };
  if (p === '/' || p === '/__host') return send(HOST_DOC);
  if (p === '/__frag') return send(FRAG_DOC);
  try {
    const b = await readFile(join(root, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const DEVICES = [
  { id: 'phone', w: 390, h: 844, dpr: 3, touch: true },
  { id: 'phone-land', w: 844, h: 390, dpr: 3, touch: true },
  { id: 'phone-short', w: 390, h: 560, dpr: 3, touch: true },   // a host panel, not the screen
  { id: 'desktop', w: 1280, h: 800, dpr: 2, touch: false },
];

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
let bad = 0;
for (const d of DEVICES) {
  const ctx = await b.newContext({
    viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr,
    hasTouch: d.touch, isMobile: d.touch,
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:' + PORT + '/__host');
  await page.waitForTimeout(1100);
  const f = page.frames().find(fr => fr.url().includes('__frag'));
  if (!f) { console.log(d.id, 'FRAME MISSING'); bad++; await ctx.close(); continue; }
  const info = await f.evaluate(() => {
    const c = document.getElementById('game'); const r = c.getBoundingClientRect();
    return {
      css: [Math.round(r.width), Math.round(r.height)],
      backing: [c.width, c.height], at: [Math.round(r.left), Math.round(r.top)],
      win: [window.innerWidth, window.innerHeight],
      touch: !!(window.G && window.G.touch), deck: window.__L ? window.__L.deck : -1,
      overlaps: window.__overlaps ? window.__overlaps().join(' ') : '',
    };
  });
  if (d.touch) await page.touchscreen.tap(d.w / 2, d.h / 2);
  else { await f.click('body', { position: { x: 20, y: 20 } }).catch(() => {}); await page.keyboard.press('Enter'); }
  await page.waitForTimeout(900);
  const mode = await f.evaluate(() => window.G.mode);
  if (args.shots) await page.screenshot({ path: '/tmp/iframe-' + d.id + '.png' });

  // The canvas must fill the frame it was given, edge to edge, on a touch device.
  const fills = !d.touch || (Math.abs(info.css[0] - info.win[0]) <= 1 && Math.abs(info.css[1] - info.win[1]) <= 1);
  const okAll = fills && !info.overlaps && !errs.length && (!d.touch || mode !== 'title');
  if (!okAll) bad++;
  console.log((okAll ? '  ok   ' : '  FAIL ') + d.id.padEnd(12),
    'frame ' + info.win.join('x'), 'canvas ' + info.css.join('x'),
    'virtual ' + info.backing.join('x'), 'deck ' + info.deck, '-> ' + mode,
    errs.length ? 'ERR ' + errs[0] : '', info.overlaps ? 'OVERLAP ' + info.overlaps : '');
  await ctx.close();
}
await b.close(); server.close();
console.log(bad ? bad + ' FAILED' : 'ARTIFACT FRAGMENT OK IN AN IFRAME');
process.exit(bad ? 1 : 0);
