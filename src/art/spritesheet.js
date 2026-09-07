// Sprite format + baker.
//
// A sprite is authored as ASCII art so it is diffable, reviewable, and honestly hand-placed:
//
//   export const MINER_IDLE = {
//     pal: { '#': P.INK, 'a': P.SKIN1, 'b': P.CLOTH1 },
//     ox: 6, oy: 15, fps: 6,
//     frames: [
//       [ "..###..",
//         ".#aaa#.",
//         ".#bbb#." ],
//     ],
//   };
//
// '.' and ' ' are transparent. Every frame in a sprite must be the same size.
// ox/oy is the anchor in pixels measured from the top-left of the frame — for characters
// that is (horizontal centre, feet). Flipping mirrors around ox.

const cache = new WeakMap();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

/** Bake a sprite definition into canvases (plus a white silhouette set for hit flashes). */
export function bake(spr) {
  let baked = cache.get(spr);
  if (baked) return baked;

  const h = spr.frames[0].length;
  const w = spr.frames[0][0].length;
  const frames = [];
  const flashes = [];

  for (const rows of spr.frames) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const fc = makeCanvas(w, h);
    const fg = fc.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = spr.pal[ch];
        if (!col) continue;
        g.fillStyle = col; g.fillRect(x, y, 1, 1);
        fg.fillStyle = '#ffffff'; fg.fillRect(x, y, 1, 1);
      }
    }
    frames.push(c); flashes.push(fc);
  }

  baked = {
    w, h,
    ox: spr.ox ?? Math.floor(w / 2),
    oy: spr.oy ?? h,
    fps: spr.fps ?? 8,
    loop: spr.loop !== false,
    frames, flashes,
    count: frames.length,
  };
  cache.set(spr, baked);
  return baked;
}

/**
 * Draw a sprite anchored at (x, y) in world/screen pixels.
 * opts: { flip, alpha, flash (0..1), rot, scale }
 */
export function drawSprite(g, spr, frame, x, y, opts) {
  const b = bake(spr);
  const i = ((frame | 0) % b.count + b.count) % b.count;
  const flip = opts && opts.flip;
  const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
  const flash = opts && opts.flash ? opts.flash : 0;
  const rot = opts && opts.rot ? opts.rot : 0;
  const sc = opts && opts.scale ? opts.scale : 1;
  const sy = opts && opts.scaleY ? opts.scaleY : sc;

  const px = Math.round(x), py = Math.round(y);
  const needsTransform = flip || rot !== 0 || sc !== 1 || sy !== 1;

  if (alpha !== 1) { g.save(); g.globalAlpha = alpha; }
  if (needsTransform) {
    if (alpha === 1) g.save();
    g.translate(px, py);
    if (rot) g.rotate(rot);
    g.scale(flip ? -sc : sc, sy);
    g.drawImage(b.frames[i], -b.ox, -b.oy);
    if (flash > 0) { g.globalAlpha = (alpha) * flash; g.drawImage(b.flashes[i], -b.ox, -b.oy); }
    g.restore();
  } else {
    g.drawImage(b.frames[i], px - b.ox, py - b.oy);
    if (flash > 0) {
      g.save(); g.globalAlpha = alpha * flash;
      g.drawImage(b.flashes[i], px - b.ox, py - b.oy);
      g.restore();
    }
    if (alpha !== 1) g.restore();
  }
}

/** Pick a frame index from elapsed time. */
export function frameAt(spr, t, fpsOverride) {
  const b = bake(spr);
  const fps = fpsOverride || b.fps;
  const i = Math.floor(t * fps);
  return b.loop ? i % b.count : Math.min(i, b.count - 1);
}

export { makeCanvas };
