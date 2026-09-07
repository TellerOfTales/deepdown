// Can the player READ the game on a phone?
//
// Every geological rule in DEEPER is one line of text in the message stack or the discovery
// banner. Those lines are 300-380 virtual pixels wide; a phone gives them 179. They were once
// passed a maxWidth, which TRUNCATES — so the game taught "Flecks thicken toward the sea..."
// and threw away the half that says what to do about it. They wrap now, and this asserts they
// still fit. The regression is invisible to every other test: nothing crashes, nothing errors,
// the player simply never learns the game.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const MIME={'.html':'text/html','.js':'text/javascript'};
const root=process.cwd();
const server=createServer(async(req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 try{const b=await readFile(join(root,normalize(p).replace(/^(\.\.[/\\])+/,'')));res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});res.end(b);}catch{res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--disable-gpu','--use-gl=swiftshader']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('http://localhost:'+PORT+'/index.html'); await page.waitForTimeout(700);
await page.touchscreen.tap(195,420); await page.waitForTimeout(900);

// Every rule, wrapped at the width the phone actually gives it.
const r = await page.evaluate(()=>{
  const wrap = window.__wrap, measure = window.__measure;
  const VIEWw = window.__L.vw;
  const out=[];
  for (const [id, r] of Object.entries(window.G.ruleTable)) {
    const lines = wrap(r.rule, VIEWw - 16, 1);
    out.push({ id, lines: lines.length, widest: Math.max(...lines.map(l=>measure(l,1))),
      lost: lines.length > 3, text: lines.join(' / ') });
  }
  return { avail: VIEWw - 16, rules: out };
});
console.log('phone line width:', r.avail, 'virtual px');
let bad=0;
for (const x of r.rules) {
  const over = x.widest > r.avail;
  if (over || x.lost) bad++;
  console.log((over||x.lost?'FAIL ':'ok   ') + x.id.padEnd(10) + x.lines + ' lines, widest ' + x.widest + '  ' + x.text.slice(0,72));
}
console.log(bad? bad+' RULES STILL DO NOT FIT' : 'EVERY RULE FITS THE PHONE');
if (bad) process.exitCode = 1;

// And render one for real.
await page.evaluate(()=>{
  const G=window.G;
  G.callout = { title:'FIELD NOTE', sub:'SLATE SHEARS - Slate lets go along its bed. One clean strike opens a corridor.',
    color:'#7fd0f0', t:0.6, life:2.5, tier:2 };
  G.msgs.push({ text:'THE LANTERN IS GOING - GLOWCAPS BURN CLEAN', color:'#ffcf8a', t:0.3, life:3 });
});
await page.waitForTimeout(120);
await page.screenshot({path:process.argv[2]||'/tmp/readable.png'});
await b.close(); server.close();
process.exit(process.exitCode || 0);
