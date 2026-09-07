// Numbers for a design review, not a pass/fail gate.
//
// Three things a GDD claims that only measurement can settle:
//   1. Does a reveal create another question? (GDD 26 — the core rule)
//   2. Does following a clue pay off, and does ignoring one cost you? (GDD 7)
//   3. Does the stake actually escalate with depth, and does a session fit 5-20 minutes? (GDD 1, 10)
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

const MAPS = parseInt(args.maps || '40', 10);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'],
});
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:' + PORT + '/index.html'); await page.waitForTimeout(700);

const out = await page.evaluate(async (MAPS) => {
  const G = window.G;
  const mod = window.__mod || {};
  const T = window.__T, D = window.__D, TILES = window.__TILES, STRATA = window.__STRATA;
  const gen = window.__generate, World = window.__World, Rand = window.__Rand;

  const R = {
    strata: [], clueChain: [], goldClue: [], hollowClue: [], density: [],
  };

  for (let s = 0; s < STRATA.length; s++) {
    const st = STRATA[s];
    let tiles = 0, ore = 0, gem = 0, relics = 0, caverns = 0, mimics = 0;
    let flecks = 0, fleckNearVein = 0, veins = 0, veinsWithFleck = 0;
    let hairlines = 0, hairlineOverHollow = 0, hollows = 0, hollowsWithHairline = 0;
    let payoffs = 0, payoffsWithNextClue = 0, valueTotal = 0;

    for (let m = 0; m < MAPS; m++) {
      const seed = (1000 + m * 97 + s * 7919) >>> 0;
      const w = new World(s, seed);
      gen(w, new Rand(seed), { index: s, depthTop: st.top, valueMul: st.valueMul,
        threat: st.threat, w: w.w, h: w.h });
      const W = w.w, H = w.h, mat = w.mat, deco = w.deco;
      tiles += W * H;

      const isOre = (id) => id === T.ORE_GOLD || id === T.ORE_GEM || id === T.CRYSTAL || id === T.RELIC;
      const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.BEDROCK : mat[y * W + x];
      const dat = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : deco[y * W + x];

      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const id = mat[y * W + x], dc = deco[y * W + x];
        if (id === T.ORE_GOLD) ore++;
        if (id === T.ORE_GEM) gem++;
        if (id === T.RELIC) relics++;
        if (id === T.MIMIC) mimics++;
        if (dc === D.FLECK_FAINT || dc === D.FLECK_RICH) {
          flecks++;
          // Is there gold within the distance the clue implies (about 4 tiles)?
          let found = false;
          for (let dy = -4; dy <= 4 && !found; dy++) for (let dx = -4; dx <= 4 && !found; dx++) {
            if (at(x + dx, y + dy) === T.ORE_GOLD) found = true;
          }
          if (found) fleckNearVein++;
        }
        if (dc === D.HAIRLINE) {
          hairlines++;
          let air = 0;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (at(x + dx, y + dy) === T.AIR) air++;
          if (air >= 6) hairlineOverHollow++;
        }

        // A PAYOFF is a tile whose breaking is the answer to a question: ore, a gem, a relic,
        // or the shell of a chamber. The core rule says the answer must show the next question.
        const payoff = isOre(id);
        if (payoff) {
          payoffs++;
          valueTotal += id === T.ORE_GOLD ? 1 : id === T.ORE_GEM ? 2.4 : id === T.RELIC ? 12 : 1.6;
          // Is another CLUE visible within a lantern radius of this payoff?
          let next = false;
          for (let dy = -9; dy <= 9 && !next; dy++) for (let dx = -9; dx <= 9 && !next; dx++) {
            if (dx === 0 && dy === 0) continue;
            const d2 = dat(x + dx, y + dy);
            if (d2 && d2 !== D.NONE) next = true;
          }
          if (next) payoffsWithNextClue++;
        }
      }
      // vein coverage: every gold tile that touches non-ore rock should have a fleck nearby
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (mat[y * W + x] !== T.ORE_GOLD) continue;
        const exposedish = at(x - 1, y) !== T.ORE_GOLD || at(x + 1, y) !== T.ORE_GOLD;
        if (!exposedish) continue;
        veins++;
        let f = false;
        for (let dy = -4; dy <= 4 && !f; dy++) for (let dx = -4; dx <= 4 && !f; dx++) {
          const d2 = dat(x + dx, y + dy);
          if (d2 === D.FLECK_FAINT || d2 === D.FLECK_RICH) f = true;
        }
        if (f) veinsWithFleck++;
      }
      // hollow coverage: a chamber shell should carry a hairline
      const seen = new Uint8Array(W * H);
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (mat[i] !== T.AIR || seen[i]) continue;
        // flood a pocket
        const stack = [i]; seen[i] = 1; let n = 0; const cells = [];
        while (stack.length && n < 400) {
          const k = stack.pop(); n++; cells.push(k);
          const kx = k % W, ky = (k / W) | 0;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = kx + dx, ny = ky + dy;
            if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
            const nk = ny * W + nx;
            if (!seen[nk] && mat[nk] === T.AIR) { seen[nk] = 1; stack.push(nk); }
          }
        }
        if (n < 12) continue;           // a corridor, not a chamber
        hollows++;
        let hair = false;
        for (const k of cells) {
          const kx = k % W, ky = (k / W) | 0;
          for (let dy = -2; dy <= 2 && !hair; dy++) for (let dx = -2; dx <= 2 && !hair; dx++) {
            if (dat(kx + dx, ky + dy) === D.HAIRLINE) hair = true;
          }
          if (hair) break;
        }
        if (hair) hollowsWithHairline++;
      }
    }

    R.strata.push({
      name: st.name, valueMul: st.valueMul, threat: st.threat,
      size: st.w + 'x' + st.height,
      orePer1k: +(ore / tiles * 1000).toFixed(2),
      gemPer1k: +(gem / tiles * 1000).toFixed(2),
      relicsPerMap: +(relics / MAPS).toFixed(2),
      mimicsPerMap: +(mimics / MAPS).toFixed(2),
      rawValuePerMap: Math.round(valueTotal / MAPS),
      chamberPerMap: +(hollows / MAPS).toFixed(1),
      // GDD 26
      payoffShowsNextClue: +(payoffsWithNextClue / Math.max(1, payoffs) * 100).toFixed(1),
      // GDD 7
      fleckIsTrue: +(fleckNearVein / Math.max(1, flecks) * 100).toFixed(1),
      veinIsSignposted: +(veinsWithFleck / Math.max(1, veins) * 100).toFixed(1),
      hairlineIsTrue: +(hairlineOverHollow / Math.max(1, hairlines) * 100).toFixed(1),
      chamberIsSignposted: +(hollowsWithHairline / Math.max(1, hollows) * 100).toFixed(1),
    });
  }
  return R;
}, MAPS);

console.log(JSON.stringify(out, null, 1));
console.log('pageerrors', errs.length, errs[0] || '');
await b.close(); server.close();
