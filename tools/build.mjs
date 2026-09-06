// Bundles the game into a single self-contained HTML file with no external requests.
// Produces two outputs:
//   dist/deeper.html    — a complete standalone page (open it from disk, it works)
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

const STYLE = `
  html,body{margin:0;height:100%;background:#06060b;overflow:hidden;
    font-family:ui-monospace,Menlo,Consolas,monospace;color:#8a8496;
    -webkit-user-select:none;user-select:none;touch-action:none;overscroll-behavior:none;}
  #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#06060b;}
  canvas{image-rendering:pixelated;image-rendering:crisp-edges;display:block;background:#06060b;
    box-shadow:0 0 0 1px #1a1620,0 24px 80px rgba(0,0,0,.85);}
  #boot{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    color:#8a8496;font-size:12px;letter-spacing:.3em;pointer-events:none;}
`;
const BODY = `<div id="wrap"><canvas id="game"></canvas></div>
<div id="boot">DESCENDING</div>
<script>${js}\ndocument.getElementById('boot').remove();</script>`;

writeFileSync('dist/deeper.html',
`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>DEEPER</title><style>${STYLE}</style></head><body>${BODY}</body></html>`);

writeFileSync('dist/artifact.html', `<title>DEEPER</title><style>${STYLE}</style>\n${BODY}`);

const kb = (s) => (s.length / 1024).toFixed(1) + ' kB';
console.log('dist/deeper.html   ', kb(readFileSync('dist/deeper.html', 'utf8')));
console.log('dist/artifact.html ', kb(readFileSync('dist/artifact.html', 'utf8')));
