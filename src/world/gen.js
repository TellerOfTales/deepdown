// Procedural generation.
//
// GDD §7: "Procedural generation must produce LEARNABLE RULES rather than arbitrary
// distributions." Every clue placed here is a promise. A fleck halo really does thicken toward
// the seam; a hairline really does have space behind it; roots really do hang over water.
// The Mimic is the single deliberate liar in the mine, and it lies in a way you can learn.

import { T, TILES, D, STRATA } from './tiles.js';
import { fbm2, hashf, clamp } from '../core/rng.js';

export const CLUE_RULES = [
  { id: 'flecks', title: 'GOLD FLECKS', rule: 'Flecks thicken toward the seam. Dig where they crowd.' },
  { id: 'hollow', title: 'HAIRLINE CRACKS', rule: 'A hairline in the face means open space behind it.' },
  { id: 'echo', title: 'THE HOLLOW NOTE', rule: 'A wall with a cavity behind it answers low and long.' },
  { id: 'roots', title: 'BLUE ROOTS', rule: 'Roots reach for water. Water sits above the geodes.' },
  { id: 'shear', title: 'SLATE SHEARS', rule: 'Slate lets go along its bed. One clean strike opens a corridor.' },
  { id: 'mimic', title: 'MIMIC VEIN', rule: 'Real gold branches. If the flecks sit on a grid, it is teeth.' },
  { id: 'ruin', title: 'STRAIGHT EDGES', rule: 'Stone does not lie flat by accident. Someone cut that.' },
  { id: 'fossil', title: 'ANATOMY', rule: 'Follow the vertebrae the way they curve. The skull is at the end.' },
  { id: 'magma', title: 'DISCOLOURED STONE', rule: 'Rock stained orange has heat behind it.' },
];

const HINTS = [
  'The ground here is loose. Gold does not travel far from where it settled.',
  'The rock lies in sheets. It breaks the way it was laid down.',
  'Heat in the stone, and something down here was built before it was abandoned.',
];

// Higher wins. A clue must never be overwritten by a weaker one, or the grammar starts lying.
const PRIO = {
  [D.NONE]: 0, [D.SCRATCH]: 1, [D.AIRFLOW]: 2, [D.FLECK_FAINT]: 3, [D.BONEHINT]: 4,
  [D.HEAT]: 5, [D.EDGE]: 6, [D.DAMP]: 6, [D.ROOTLET]: 7, [D.HAIRLINE]: 8,
  [D.GEMGLINT]: 9, [D.FLECK_RICH]: 10,
};

export function generate(world, rand, meta) {
  const W = world.w, H = world.h;
  const idx = meta.index;
  const G = {
    world, rand, W, H, idx,
    valueMul: meta.valueMul, threat: meta.threat,
    veins: [], caverns: [], water: [], hot: [],
  };

  baseFill(G);
  frame(G);
  caverns(G);
  goldVeins(G);
  gemPockets(G);
  crystalFormations(G);
  waterPockets(G);
  fossils(G);
  ruins(G);
  if (idx >= 1) magma(G);
  mimicVeins(G);
  hollowClues(G);
  glowcaps(G);
  entryAlcove(G);
  descentShaft(G);
  creatures(G);
  scatter(G);

  world.hint = HINTS[idx] || HINTS[0];
  return world;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const put = (G, x, y, id) => { if (x > 1 && y > 0 && x < G.W - 2 && y < G.H - 2) G.world.set(x, y, id); };
const at = (G, x, y) => G.world.get(x, y);
function deco(G, x, y, d) {
  if (x < 0 || y < 0 || x >= G.W || y >= G.H) return;
  if (!TILES[G.world.get(x, y)].solid) return;
  const cur = G.world.getDeco(x, y);
  if ((PRIO[d] || 0) <= (PRIO[cur] || 0) && cur !== D.NONE) return;
  G.world.setDeco(x, y, d);
}
function carve(G, x, y, r) {
  const r2 = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 2 || ny < 1 || nx >= G.W - 2 || ny >= G.H - 2) continue;
      G.world.set(nx, ny, T.AIR);
      G.world.setDeco(nx, ny, D.NONE);
    }
  }
}
function blob(G, x, y, r, id) {
  const r2 = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
      if (dx * dx + dy * dy <= r2) put(G, x + dx, y + dy, id);
}
const solidHere = (G, x, y) => TILES[at(G, x, y)].solid && at(G, x, y) !== T.BEDROCK;

// ── 1. base fill: the strata have to be VISIBLY banded ───────────────────────
function baseFill(G) {
  const { W, H, idx, rand } = G;
  const s = (rand.i(1, 1 << 28)) | 0;
  for (let y = 0; y < H; y++) {
    const k = y / H;
    for (let x = 0; x < W; x++) {
      const n = fbm2(x * 0.09, y * 0.09, 4, 2, 0.5, s);
      const m = fbm2(x * 0.05, y * 0.22, 3, 2, 0.55, s + 13);
      let id;
      if (idx === 0) {
        // Topsoil: dirt with gravel lenses, stone arriving from below
        if (k < 0.42) id = n < 0.30 ? T.GRAVEL : T.DIRT;
        else if (k < 0.72) id = n < 0.26 ? T.GRAVEL : (n > 0.62 ? T.STONE : T.DIRT);
        else id = n > 0.44 ? T.STONE : (n < 0.24 ? T.GRAVEL : T.DIRT);
      } else if (idx === 1) {
        // Slate beds: laid down in horizontal laminations. You can SEE why it shears.
        const band = Math.floor((y + m * 5) / 4) % 3;
        id = band === 0 ? T.SLATE : band === 1 ? (n > 0.55 ? T.SLATE : T.STONE) : T.STONE;
        if (n > 0.80) id = T.GRANITE;
        if (k < 0.10 && n < 0.4) id = T.DIRT;
      } else {
        // Emberdeep: granite the whole way down, stone only where it was intruded
        id = n > 0.42 ? T.GRANITE : T.STONE;
        if (n > 0.86) id = T.BEDROCK;
        if (m > 0.74 && n < 0.36) id = T.SLATE;
      }
      G.world.set(x, y, id);
    }
  }
}

function frame(G) {
  const { W, H, idx } = G;
  for (let y = 0; y < H; y++) { G.world.set(0, y, T.BEDROCK); G.world.set(1, y, T.BEDROCK); G.world.set(W - 1, y, T.BEDROCK); G.world.set(W - 2, y, T.BEDROCK); }
  for (let x = 0; x < W; x++) { G.world.set(x, H - 1, T.BEDROCK); G.world.set(x, H - 2, T.BEDROCK); }
  if (idx === 0) {
    // Open sky over the topsoil, so the first thing a new player sees is the way out.
    for (let x = 0; x < W; x++) { G.world.set(x, 0, T.AIR); G.world.set(x, 1, T.AIR); }
    for (let x = 2; x < W - 2; x++) if (hashf(x, 7, 3) < 0.30) G.world.set(x, 2, T.AIR);
  } else {
    for (let x = 0; x < W; x++) G.world.set(x, 0, T.BEDROCK);
  }
}

// ── 2. caverns: the reward for reading a hollow ───────────────────────────────
function caverns(G) {
  const { W, H, rand } = G;
  const n = 2 + rand.i(0, 2) + (G.idx > 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    let x = rand.i(8, W - 9), y = rand.i(Math.floor(H * 0.18), H - 8);
    let a = rand.f(0, Math.PI * 2);
    const len = 18 + rand.i(0, 44);
    let r = 1.2 + rand.f(0, 1.1);
    const cx = x, cy = y;
    for (let s = 0; s < len; s++) {
      a += rand.f(-0.42, 0.42);
      x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.1;
      x = clamp(x, 4, W - 5); y = clamp(y, 3, H - 5);
      r = clamp(r + rand.f(-0.22, 0.22), 1.0, 2.6);
      carve(G, Math.round(x), Math.round(y), r);
    }
    G.caverns.push({ x: Math.round(cx), y: Math.round(cy), r });
  }
  // one or two genuine rooms, not just tunnels
  const rooms = 1 + (G.idx > 0 ? 1 : 0);
  for (let i = 0; i < rooms; i++) {
    const rw = 9 + rand.i(0, 7), rh = 5 + rand.i(0, 4);
    const ox = rand.i(6, W - rw - 7), oy = rand.i(Math.floor(H * 0.25), H - rh - 7);
    const cells = [];
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) cells.push(rand.f() < 0.52 ? 1 : 0);
    const get = (x, y) => (x < 0 || y < 0 || x >= rw || y >= rh) ? 0 : cells[y * rw + x];
    for (let it = 0; it < 4; it++) {
      const next = cells.slice();
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += get(x + dx, y + dy);
        next[y * rw + x] = c >= 5 ? 1 : (c <= 2 ? 0 : get(x, y));
      }
      for (let k = 0; k < cells.length; k++) cells[k] = next[k];
    }
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      if (cells[y * rw + x]) { G.world.set(ox + x, oy + y, T.AIR); G.world.setDeco(ox + x, oy + y, D.NONE); }
    }
    G.caverns.push({ x: ox + (rw >> 1), y: oy + (rh >> 1), r: Math.max(rw, rh) / 2 });
  }
}

// ── 3. gold: the flagship clue ────────────────────────────────────────────────
function goldVeins(G) {
  const { W, H, rand, idx } = G;
  // Tile counts stay roughly FLAT across strata. Depth escalates value through STRATA.valueMul,
  // not through carpeting the map — otherwise reading the rock stops mattering the deeper you go.
  const count = 3 + rand.i(0, 1);
  for (let i = 0; i < count; i++) growVein(G, rand.i(8, W - 9), rand.i(Math.floor(H * 0.12), H - 6), 0);
}

function growVein(G, x, y, depth) {
  const { rand } = G;
  // Veins travel along READABLE structures: a persistent direction, mostly diagonal or axial,
  // so "the flecks are heading down-right" is a sentence a player can act on.
  const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]];
  let d = rand.pick(dirs);
  const len = 10 + rand.i(0, 12) - depth * 5;
  const tiles = [];
  // Exactly one place where the seam fattens into a pocket. Finding it should be an event,
  // not a certainty, and the bag should never be able to hold everything in the stratum.
  const pocketAt = [rand.i(3, Math.max(4, len - 2))];

  for (let s = 0; s < len; s++) {
    if (rand.f() < 0.18) {
      // a turn, but only ever 45 degrees — veins that jitter are unreadable
      const i = dirs.indexOf(dirs.find(v => v[0] === d[0] && v[1] === d[1]));
      d = dirs[(i + (rand.bool() ? 1 : dirs.length - 1)) % dirs.length];
    }
    x += d[0]; y += d[1];
    if (x < 4 || y < 3 || x >= G.W - 4 || y >= G.H - 4) break;
    if (!solidHere(G, x, y)) continue;
    G.world.set(x, y, T.ORE_GOLD);
    tiles.push([x, y, d[0], d[1]]);
    if (pocketAt.includes(s)) {
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
        if (solidHere(G, x + dx, y + dy)) { G.world.set(x + dx, y + dy, T.ORE_GOLD); tiles.push([x + dx, y + dy, d[0], d[1]]); }
      }
    }
    if (depth < 1 && rand.f() < 0.05) growVein(G, x, y, depth + 1);
  }
  if (tiles.length) { G.veins.push(tiles); haloVein(G, tiles); }
}

/**
 * The halo is the promise. Density falls off with distance AND leans toward the direction the
 * vein is still travelling, so "dig where the flecks crowd" is not a superstition — it is correct.
 */
function haloVein(G, tiles) {
  const { rand } = G;
  for (const [x, y, dx, dy] of tiles) {
    for (let oy = -3; oy <= 3; oy++) {
      for (let ox = -3; ox <= 3; ox++) {
        if (!ox && !oy) continue;
        const dist = Math.sqrt(ox * ox + oy * oy);
        if (dist > 3.2) continue;
        const nx = x + ox, ny = y + oy;
        if (at(G, nx, ny) === T.ORE_GOLD || !solidHere(G, nx, ny)) continue;
        const len = Math.max(0.001, dist);
        const align = (ox * dx + oy * dy) / len;            // -1 behind, +1 ahead of the seam
        const lean = 0.55 + 0.45 * align;
        const p = clamp((1.35 - dist * 0.32) * lean, 0, 1);
        if (rand.f() > p) continue;
        deco(G, nx, ny, dist <= 1.5 ? D.FLECK_RICH : D.FLECK_FAINT);
      }
    }
  }
}

// ── 4. gems: rarer, deeper, shelled in crystal ────────────────────────────────
function gemPockets(G) {
  const { W, H, rand, idx } = G;
  const n = idx === 0 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const x = rand.i(8, W - 9), y = rand.i(Math.floor(H * (0.3 + idx * 0.05)), H - 7);
    if (!solidHere(G, x, y)) continue;
    blob(G, x, y, 2.6, T.CRYSTAL);
    blob(G, x, y, 1.4, T.ORE_GEM);
    for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
      const d = Math.hypot(ox, oy);
      if (d < 2.8 || d > 4.4) continue;
      if (rand.f() < 0.42) deco(G, x + ox, y + oy, D.GEMGLINT);
    }
    G.gem = { x, y };
  }
}

/** Crystal on cavern walls lights itself, so a tunnel mouth glows from across the dark. A lure. */
function crystalFormations(G) {
  const { rand } = G;
  for (const c of G.caverns) {
    if (rand.f() < 0.62) continue;
    const n = 2 + rand.i(0, 2);
    for (let i = 0; i < n; i++) {
      const a = rand.f(0, Math.PI * 2);
      const rr = c.r + rand.f(0, 2.4);
      const x = Math.round(c.x + Math.cos(a) * rr), y = Math.round(c.y + Math.sin(a) * rr);
      if (!solidHere(G, x, y)) continue;
      blob(G, x, y, rand.f(0.7, 1.5), T.CRYSTAL);
    }
  }
}

// ── 5. water: roots point at it, and it will drown your tunnel ───────────────
function waterPockets(G) {
  const { W, H, rand, idx } = G;
  const n = idx === 1 ? 2 + rand.i(0, 2) : 1 + rand.i(0, 1);
  for (let i = 0; i < n; i++) {
    const x = rand.i(10, W - 11), y = rand.i(Math.floor(H * 0.35), H - 9);
    const rw = 2 + rand.i(0, 3), rh = 1 + rand.i(0, 2);
    for (let oy = -rh; oy <= rh; oy++)
      for (let ox = -rw; ox <= rw; ox++)
        if ((ox * ox) / (rw * rw) + (oy * oy) / (rh * rh) <= 1) put(G, x + ox, y + oy, T.WATER);
    // seal the roof so it is a discovery, not a puddle
    for (let ox = -rw - 1; ox <= rw + 1; ox++) {
      if (at(G, x + ox, y - rh - 1) === T.AIR) put(G, x + ox, y - rh - 1, T.STONE);
    }
    G.water.push({ x, y });

    // roots reach DOWN toward it — an unbroken chain of evidence from up to six tiles above
    let rx = x + rand.i(-1, 1);
    for (let k = 1; k <= 6; k++) {
      const ry = y - rh - k;
      if (ry < 2) break;
      if (solidHere(G, rx, ry)) {
        if (k <= 3 && rand.f() < 0.72) G.world.set(rx, ry, T.ROOT);
        else deco(G, rx, ry, k <= 4 ? D.ROOTLET : D.DAMP);
      }
      for (const ox of [-1, 1]) if (rand.f() < 0.55) deco(G, rx + ox, ry, D.DAMP);
      rx += rand.i(-1, 1);
    }
    // and a geode under it, because the rule has to be worth learning
    const gy = y + rh + 1 + rand.i(0, 1);
    if (solidHere(G, x, gy)) {
      blob(G, x, gy, 1.9, T.CRYSTAL);
      if (rand.f() < 0.6) blob(G, x, gy, 0.9, T.ORE_GEM);
    }
  }
}

// ── 6. fossils: anatomy predicts the skull ───────────────────────────────────
function fossils(G) {
  const { W, H, rand, idx } = G;
  const n = 1 + (idx > 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    let x = rand.i(10, W - 12), y = rand.i(Math.floor(H * 0.25), H - 8);
    let a = rand.f(0, Math.PI * 2);
    const curl = rand.f(-0.26, 0.26);
    const verts = 5 + rand.i(0, 6);
    let ok = 0;
    for (let v = 0; v < verts; v++) {
      a += curl;
      x += Math.cos(a) * 2.0; y += Math.sin(a) * 1.6;
      const px = Math.round(x), py = Math.round(y);
      if (px < 4 || py < 3 || px >= W - 4 || py >= H - 4) break;
      const r = 1.2 - v / verts * 0.5;
      blob(G, px, py, r, T.BONE);
      ok++;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++)
        if (rand.f() < 0.30) deco(G, px + ox, py + oy, D.BONEHINT);
    }
    if (ok < 3) continue;
    // the skull, at the end of the curve, exactly where the anatomy said it would be
    a += curl; x += Math.cos(a) * 2.4; y += Math.sin(a) * 2.0;
    const sx = Math.round(x), sy = Math.round(y);
    blob(G, sx, sy, 2.1, T.BONE);
    put(G, sx, sy, T.RELIC);
  }
}

// ── 7. ruins: straight edges do not occur in nature ──────────────────────────
function ruins(G) {
  const { W, H, rand, idx } = G;
  const n = idx === 2 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const rw = 7 + rand.i(0, 5), rh = 4 + rand.i(0, 3);
    const ox = rand.i(6, W - rw - 8), oy = rand.i(Math.floor(H * 0.3), H - rh - 8);
    for (let y = 0; y <= rh; y++) {
      for (let x = 0; x <= rw; x++) {
        const edge = x === 0 || y === 0 || x === rw || y === rh;
        put(G, ox + x, oy + y, edge ? T.RUIN : T.AIR);
        if (!edge) G.world.setDeco(ox + x, oy + y, D.NONE);
      }
    }
    // a doorway, so the room reads as architecture
    const dx = 1 + rand.i(0, rw - 2);
    put(G, ox + dx, oy + rh, T.AIR); put(G, ox + dx, oy + rh - 1, T.AIR);
    // beams
    for (let x = 2; x < rw; x += 3) { put(G, ox + x, oy + 1, T.SUPPORT); put(G, ox + x, oy + rh - 1, T.SUPPORT); }
    // and something worth the trip
    const px = ox + 1 + rand.i(0, rw - 2), py = oy + rh - 1;
    put(G, px, py, rand.bool() ? T.RELIC : T.ORE_GEM);
    if (rand.bool()) G.world.props.push({ type: 'crate', tx: ox + 2, ty: oy + rh - 1 });
    G.world.props.push({ type: 'skull', tx: ox + rw - 2, ty: oy + rh - 1 });

    // the clue: rock touching an unnaturally straight wall
    for (let y = -1; y <= rh + 1; y++) for (let x = -1; x <= rw + 1; x++) {
      const inside = x > 0 && y > 0 && x < rw && y < rh;
      const onEdge = x >= -1 && y >= -1 && x <= rw + 1 && y <= rh + 1;
      if (inside || !onEdge) continue;
      if (rand.f() < 0.5) deco(G, ox + x, oy + y, D.EDGE);
    }
  }
}

// ── 8. magma ─────────────────────────────────────────────────────────────────
function magma(G) {
  const { W, H, rand, idx } = G;
  const n = idx === 2 ? 3 + rand.i(0, 3) : 1;
  for (let i = 0; i < n; i++) {
    const x = rand.i(8, W - 9);
    const y = idx === 2 ? rand.i(Math.floor(H * 0.3), H - 6) : H - 7 - rand.i(0, 3);
    blob(G, x, y, 1.6 + rand.f(0, 1.6), T.MAGMA);
    for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
      const d = Math.hypot(ox, oy);
      if (d < 2 || d > 4.3) continue;
      if (rand.f() < 0.5) deco(G, x + ox, y + oy, D.HEAT);
    }
    G.hot.push({ x, y });
  }
}

// ── 9. mimics: the one liar, and it lies on a grid ───────────────────────────
function mimicVeins(G) {
  const { W, H, rand, idx } = G;
  const n = 2 + rand.i(0, 2) + (idx > 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const x = rand.i(8, W - 9), y = rand.i(Math.floor(H * 0.15), H - 7);
    if (!solidHere(G, x, y)) continue;
    blob(G, x, y, 1.5 + rand.f(0, 0.8), T.MIMIC);
    // Real halos fall off and lean. This one is a lattice: perfectly even, no direction.
    // That regularity is the whole tell, and it is learnable in one bite.
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
      if (Math.abs(ox) + Math.abs(oy) === 0) continue;
      if ((ox + oy) % 2 !== 0) continue;
      if (Math.hypot(ox, oy) > 3.1) continue;
      deco(G, x + ox, y + oy, Math.hypot(ox, oy) <= 2.1 ? D.FLECK_RICH : D.FLECK_FAINT);
    }
    G.world.spawns.push({ type: 'mimic', tx: x, ty: y });
  }
}

// ── 10. hollow clues, applied last so they sit on the real shells ────────────
function hollowClues(G) {
  const { W, H, rand } = G;
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (!solidHere(G, x, y)) continue;
      let adjAir = 0, nearAir = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        if (at(G, x + ox, y + oy) === T.AIR) adjAir++;
      }
      if (adjAir === 0) {
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++)
          if (at(G, x + ox, y + oy) === T.AIR) nearAir++;
      }
      if (adjAir > 0) { if (rand.f() < 0.45) deco(G, x, y, D.HAIRLINE); }
      else if (nearAir > 0 && rand.f() < 0.25) deco(G, x, y, D.AIRFLOW);
    }
  }
}

// ── 11. glowcaps: the light refill, and they grow where the damp is ─────────
function glowcaps(G) {
  const { rand } = G;
  const spots = G.caverns.concat(G.water.map(w => ({ x: w.x, y: w.y, r: 3 })));
  for (const c of spots) {
    const n = 2 + rand.i(0, 4);
    for (let i = 0; i < n; i++) {
      const x = c.x + rand.i(-Math.ceil(c.r) - 3, Math.ceil(c.r) + 3);
      const y = c.y + rand.i(-Math.ceil(c.r) - 3, Math.ceil(c.r) + 3);
      if (at(G, x, y) !== T.AIR) continue;
      if (!TILES[at(G, x, y + 1)].solid && !TILES[at(G, x, y - 1)].solid) continue;
      G.world.set(x, y, T.GLOWCAP);
    }
  }
}

// ── 12. entry and shaft: the two ends of every decision ─────────────────────
function entryAlcove(G) {
  const { W, H, idx } = G;
  const ex = 5 + (idx * 2) % 4;
  const ey = idx === 0 ? 4 : 4;
  for (let y = ey - 3; y <= ey; y++)
    for (let x = ex - 2; x <= ex + 2; x++) { G.world.set(x, y, T.AIR); G.world.setDeco(x, y, D.NONE); }
  for (let x = ex - 2; x <= ex + 2; x++) if (!TILES[at(G, x, ey + 1)].solid) G.world.set(x, ey + 1, T.STONE);
  G.world.entryTX = ex;
  G.world.entryTY = ey;                 // player's feet rest on the top of tile ey+1
  G.world.props.push({ type: 'elevator', tx: ex, ty: ey });
  G.world.props.push({ type: 'sign', tx: ex + 2, ty: ey });
}

function descentShaft(G) {
  const { W, H, rand, idx } = G;
  const minX = Math.floor(W * 0.45);
  const sx = clamp(minX + rand.i(0, Math.max(1, W - minX - 10)), minX, W - 8);
  const sy = clamp(Math.floor(H * 0.72) + rand.i(0, Math.floor(H * 0.18)), 8, H - 6);
  for (let y = sy - 3; y <= sy; y++)
    for (let x = sx - 3; x <= sx + 3; x++) { G.world.set(x, y, T.AIR); G.world.setDeco(x, y, D.NONE); }
  for (let x = sx - 3; x <= sx + 3; x++) if (!TILES[at(G, x, sy + 1)].solid) G.world.set(x, sy + 1, T.STONE);
  G.world.shaftTX = sx;
  G.world.shaftTY = sy;
  G.world.props.push({ type: 'shaft', tx: sx, ty: sy });
  G.world.props.push({ type: 'lantern', tx: sx - 3, ty: sy - 1 });
  if (rand.bool()) G.world.props.push({ type: 'skull', tx: sx + 2, ty: sy });
  G.world.props.push({ type: 'crate', tx: sx - 2, ty: sy });
  // a couple of glowcaps so the shaft glows faintly before you can see it
  for (const ox of [-3, 3]) if (at(G, sx + ox, sy) === T.AIR) G.world.set(sx + ox, sy, T.GLOWCAP);
}

// ── 13. creatures, placed where their behaviour makes sense ─────────────────
function creatures(G) {
  const { W, H, rand, threat, idx } = G;
  const tries = 400;

  const burrowers = Math.round(1 + threat * 1.6);
  for (let i = 0, n = 0; i < tries && n < burrowers; i++) {
    const x = rand.i(10, W - 11), y = rand.i(Math.floor(H * 0.2), H - 6);
    const t = at(G, x, y);
    if (t !== T.DIRT && t !== T.GRAVEL && t !== T.STONE) continue;
    if (Math.abs(x - G.world.entryTX) < 12 && Math.abs(y - G.world.entryTY) < 10) continue;
    G.world.spawns.push({ type: 'burrower', tx: x, ty: y });
    for (let k = 0; k < 6; k++) deco(G, x + rand.i(-3, 3), y + rand.i(-3, 3), D.SCRATCH);
    n++;
  }

  const crawlers = Math.round(1 + threat * 2.2);
  for (let i = 0, n = 0; i < tries && n < crawlers; i++) {
    const x = rand.i(6, W - 7), y = rand.i(6, H - 8);
    if (!TILES[at(G, x, y)].solid) continue;
    let open = 0;
    for (let k = 1; k <= 5; k++) if (at(G, x, y + k) === T.AIR) open++; else break;
    if (open < 3) continue;
    G.world.spawns.push({ type: 'crawler', tx: x, ty: y });
    n++;
  }

  const stonebacks = Math.round(threat * 1.8);
  for (let i = 0, n = 0; i < tries && n < stonebacks; i++) {
    const x = rand.i(8, W - 9), y = rand.i(8, H - 7);
    if (at(G, x, y) !== T.AIR || !TILES[at(G, x, y + 1)].solid) continue;
    if (at(G, x - 1, y) !== T.AIR || at(G, x + 1, y) !== T.AIR) continue;
    if (Math.abs(x - G.world.entryTX) < 14 && Math.abs(y - G.world.entryTY) < 10) continue;
    G.world.spawns.push({ type: 'stoneback', tx: x, ty: y - 1 });
    for (let k = 0; k < 5; k++) deco(G, x + rand.i(-4, 4), y + rand.i(-1, 1), D.SCRATCH);
    n++;
  }

  // moths cluster on the bright things
  if (idx > 0 || rand.bool()) {
    for (const c of G.caverns) {
      if (rand.f() < 0.55) continue;
      const n = 3 + rand.i(0, 3);
      for (let i = 0; i < n; i++) {
        const x = c.x + rand.i(-3, 3), y = c.y + rand.i(-2, 2);
        if (at(G, x, y) !== T.AIR) continue;
        G.world.spawns.push({ type: 'glowmoth', tx: x, ty: y });
      }
    }
  }
}

function scatter(G) {
  const { W, H, rand } = G;
  for (let i = 0; i < 8; i++) {
    const x = rand.i(4, W - 5), y = rand.i(4, H - 5);
    if (at(G, x, y) === T.AIR && TILES[at(G, x, y + 1)].solid && rand.f() < 0.5) {
      G.world.props.push({ type: rand.bool() ? 'skull' : 'crate', tx: x, ty: y });
    }
  }
}
