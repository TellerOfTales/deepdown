// Bundles the game into a single self-contained HTML file with no external requests
// (bar one webfont for the page chrome — the game itself ships every pixel it needs).
//   dist/deeper.html    — a complete standalone page; open it from disk and it works
//   dist/artifact.html  — the same game as a body fragment, for hosts that supply the shell
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const out = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true, format: 'iife', target: 'es2020',
  minify: true, write: false, legalComments: 'none',
});
const js = out.outputFiles[0].text;

// The page chrome borrows the game's own palette so the frame and the game read as one object.
// It commits to a single dark theme on purpose: the subject is a mine.
const FONT = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&display=swap">';

const STYLE = `
:root{
  --void:#06060b; --ink:#0d0c13; --panel:#14121b; --rim:#241f33;
  --dim:#6b6478; --text:#8a8496; --bone:#d8d2c4; --gold:#ffd867;
  --label:"Barlow Condensed","Oswald","Arial Narrow",system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--void);color:var(--text);overflow:hidden;
  font-family:var(--label);-webkit-font-smoothing:antialiased;
  -webkit-user-select:none;user-select:none;touch-action:none;overscroll-behavior:none;}
#wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:14px;background:
  radial-gradient(120% 90% at 50% 0%,#0e0c16 0%,var(--void) 62%);}
canvas{image-rendering:pixelated;image-rendering:crisp-edges;display:block;background:var(--void);
  border:1px solid var(--rim);box-shadow:0 0 0 1px #000,0 30px 90px -20px rgba(0,0,0,.95),
  0 0 120px -40px rgba(255,207,138,.20);}
#keys{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px 10px;
  max-width:min(92vw,860px);font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  transition:opacity .8s ease;}
#keys b{font-weight:500;color:var(--dim)}
#keys kbd{font-family:var(--label);font-weight:700;font-size:11px;letter-spacing:.10em;
  color:var(--bone);background:var(--panel);border:1px solid var(--rim);
  border-bottom-color:#0a0910;border-radius:2px;padding:2px 6px 1px;}
#keys .hot kbd{color:var(--gold);border-color:#4a3a14;background:#1a1408}
#keys .sep{color:#2b2735}
body.playing #keys{opacity:.22}
#boot{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--dim);font-size:13px;letter-spacing:.5em;pointer-events:none;}
@media (prefers-reduced-motion:reduce){#keys{transition:none}}
@media (max-height:560px){#keys{display:none}}
`;

const KEYS = `<div id="keys">
<span class="hot"><kbd>Space</kbd> <b>Dig — tap on the beat, hold for heavy</b></span>
<span class="sep">/</span><span><kbd>A</kbd><kbd>D</kbd> <b>Move</b></span>
<span class="sep">/</span><span><kbd>W</kbd><kbd>S</kbd> <b>Aim &amp; climb</b></span>
<span class="sep">/</span><span><kbd>K</kbd> <b>Jump</b></span>
<span class="sep">/</span><span><kbd>E</kbd> <b>The shaft</b></span>
<span class="sep">/</span><span><kbd>L</kbd> <b>Blast</b></span>
<span class="sep">/</span><span><kbd>V</kbd> <b>Sonar</b></span>
<span class="sep">/</span><span><kbd>F</kbd> <b>Dim lantern</b></span>
<span class="sep">/</span><span><kbd>R</kbd> <b>Dig again</b></span>
</div>`;

const BODY = `<div id="wrap"><canvas id="game"></canvas>${KEYS}</div>
<div id="boot">DESCENDING</div>
<script>${js}
document.getElementById('boot').remove();
var mark=function(){document.body.classList.add('playing');
  window.removeEventListener('keydown',mark);window.removeEventListener('pointerdown',mark);};
window.addEventListener('keydown',mark);window.addEventListener('pointerdown',mark);
</script>`;

writeFileSync('dist/deeper.html',
`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>DEEPER</title>${FONT}<style>${STYLE}</style></head><body>${BODY}</body></html>`);

writeFileSync('dist/artifact.html', `<title>DEEPER</title>\n${FONT}\n<style>${STYLE}</style>\n${BODY}`);

const kb = (f) => (readFileSync(f, 'utf8').length / 1024).toFixed(1) + ' kB';
console.log('dist/deeper.html   ', kb('dist/deeper.html'));
console.log('dist/artifact.html ', kb('dist/artifact.html'));
