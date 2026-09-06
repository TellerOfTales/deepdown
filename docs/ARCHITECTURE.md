# DEEPER — module contracts (First Playable)

Plain ES modules, no framework, no build step required to run (`index.html` loads `src/main.js`
as `type="module"`). `npm run build` bundles a single self-contained HTML file with esbuild.

Read these files before writing anything — they are the real contract:
`src/config.js`, `src/art/pal.js`, `src/art/spritesheet.js`, `src/world/tiles.js`.

Coordinates: **world pixels** unless a name ends in `X`/`Y` next to `tx`/`ty` (tile coords).
`TS = 16` px per tile, 1 tile = 1 metre. Internal resolution `VW×VH = 480×270`.
Rendering is nearest-neighbour; **never draw at fractional pixel coordinates** — round first.

---

## `src/world/world.js`  (owned by core)

```js
class World {
  constructor(stratumIndex, seed)
  w, h                    // tiles
  stratum                 // STRATA[stratumIndex]
  mat  : Uint8Array(w*h)  // tile id
  dmg  : Float32Array     // accumulated fracture damage
  deco : Uint8Array       // D.* clue decoration
  light: Float32Array     // 0..1, recomputed each frame for the visible window
  entryTX, entryTY        // surface elevator (spawn + safe extract)
  shaftTX, shaftTY        // descent shaft (EXTRACT / DESCEND decision point)
  spawns : [{type, tx, ty}]   // enemies requested by generation
  props  : [{type, tx, ty}]   // 'elevator' | 'shaft' | 'crate' | 'sign' | 'skull' | 'lantern'
  hint   : string             // one-line stratum hint shown on entry

  get(tx,ty)  set(tx,ty,id)  solid(tx,ty)  air(tx,ty)  stage(tx,ty)  // stage: 0..3 fracture
  strike(tx, ty, power, damage, opts) -> StrikeResult
  breakAt(tx, ty, cause) -> [{tx,ty,tile,cause}]
  settle(tx,ty)           // queue loose-tile gravity around a point
  update(dt)              // runs the loose/liquid settle queue; returns [] of fall events
}
```

`StrikeResult = { hit:bool, tooHard:bool, tile:id, broke:bool, broken:[{tx,ty,tile,cause}],
                  stage:0..3, revealed:bool }`
`cause` ∈ `'direct' | 'chain' | 'shear' | 'collapse'`.

## `src/world/gen.js`  (AGENT)

```js
export function generate(world, rand /* Rand */, meta)
// meta = { index, depthTop, valueMul, threat, w, h }
```
Fills `world.mat` + `world.deco`, sets `entryTX/TY`, `shaftTX/TY`, pushes into `spawns` / `props`,
sets `world.hint`. Must not import anything from `entities/` or `fx/`.

## `src/world/light.js`  (owned by core)
Tile-propagated light with occlusion. `computeLight(world, sources, x0,y0,x1,y1, ambient)`.

---

## `src/fx/particles.js`  (AGENT)

```js
export class FX {
  update(dt)
  draw(g, camX, camY)      // normal blend, behind entities? no — called after tiles, before HUD
  drawGlow(g, camX, camY)  // additive pass, called after lighting
  clear()
  count()                  // for debug

  // generic
  burst(x, y, opts)   // opts: {color|colors[], n, speed[min,max], angle, spread, life[min,max],
                      //        gravity, drag, size[min,max], glow, bounce, fade, shape}
  // named emitters (all take world-pixel coords)
  debris(x,y,color,n,dirX,dirY)   // chunky bouncing rock fragments, gravity, short life
  dust(x,y,color,n)               // soft drifting puff, no gravity, fades big
  sparks(x,y,color,n,dirX,dirY)   // fast bright streaks, additive, very short
  shards(x,y,color,n)             // crystal splinters, additive, spin
  ring(x,y,color,opts)            // expanding hollow ring (shockwave / resonance)
  glint(x,y,color)                // single twinkling star, additive
  motes(x,y,dirX,dirY,n)          // slow airflow motes (cavern clue)
  drip(x,y)                       // water droplet that falls and splashes
  ember(x,y)                      // rising magma ember, additive
  smoke(x,y,n)
  popup(x,y,text,color,opts)      // rising pixel text; opts {vy, life, scale, shadow}
  trail(x,y,color)                // one-frame afterimage dot
}
```
Pooled. Never allocate per particle in `update`. Cap ~1400 live particles, oldest recycled.
Draw with `g.fillRect` on rounded coords; additive pass uses `g.globalCompositeOperation='lighter'`.

## `src/fx/camera.js`  (owned by core)

---

## `src/art/font.js`  (AGENT)
5×7 pixel bitmap font, uppercase-primary.
```js
export function text(g, str, x, y, opts)  // opts {color, scale=1, align:'left'|'center'|'right',
                                          //       shadow:bool|color, alpha, wave, spacing}
export function measure(str, scale=1, spacing=1) -> width px
export const FONT_H  // 7
```
Charset required: `A-Z a-z 0-9` and `` .,:;!?'"-+/\%()[]<>=#*@$&_|^~` `` and space,
plus `₲` (currency, map it to `$` if simpler — pick one and document it), `↑ ↓ ← →`, `•`, `♥`.
Lowercase may render as small-caps. Glyphs are variable width (trim empty columns), 1px gap.

## `src/art/tiletex.js`  (AGENT)
Procedural, deterministic tile textures baked ONCE at boot into an atlas canvas.
GDD §20: "Materials are identified by shape first, texture second, colour third."

```js
export function buildAtlas()  -> { canvas, uv(tileId, variant) -> {sx, sy},
                                   crackUV(stage) -> {sx,sy},          // stage 1..3
                                   decoUV(decoId, variant) -> {sx,sy}|null,
                                   edgeUV(mask) -> {sx,sy},            // 16 top/rim-light masks
                                   TS }
export const VARIANTS = 4
```
Each material gets its own generator so the *shape language* differs, not just the hue:
dirt = clumped organic blobs; gravel = discrete pebbles with dark gaps; stone = irregular
angular fracture facets; slate = strong horizontal striations; granite = dense speckle with
bright crystal flecks; crystal/gem = faceted polygons with a bright core; gold ore = branching
dendritic veins inside dark host rock; bone = smooth pale curves; ruin = cut masonry with a
mortar grid; magma = flowing bands; water = horizontal ripples; mimic = *almost* gold, but the
flecks are too evenly spaced and the hue is 8° greener (that inconsistency is the tell).
Crack overlays: 3 stages of dark branching fissures + a lighter highlight edge, drawn on top.
Deco overlays for every `D.*` in `tiles.js`.

## `src/art/sprites_player.js`  (AGENT)
## `src/art/sprites_enemies.js`  (AGENT)
## `src/art/sprites_props.js`  (AGENT)
Export sprite objects in the `spritesheet.js` format. Exact export names are listed in each task.

---

## `src/entities/enemies.js`  (AGENT)

```js
export function spawn(type, x, y, threat) -> Enemy
export function update(e, dt, ctx)
export function draw(g, e, camX, camY)
export function drawGlow(g, e, camX, camY)   // additive; emissive parts only
export function hurt(e, dmg, dirX, dirY, ctx) -> boolean /* killed */

// Enemy = { type, x, y, vx, vy, w, h, hp, maxHp, dead, hitFlash, facing, state, t,
//           contactDmg, armorSide, emissive, aggro }
// ctx  = { world, player, fx, audio, rand, dt, hitPlayer(dmg, kx, ky), shake(a),
//          breakTile(tx,ty), tsolid(tx,ty), loot(x,y,kind,value) }
```
Enemies must create *mining* decisions (GDD §12), not damage races. 2–4 hits to kill.

## `src/ui/hud.js`  (AGENT)
```js
export function drawHUD(g, G, dt)
export function drawShaftPrompt(g, G)
```
## `src/ui/screens.js`  (AGENT)
```js
export function drawTitle(g,G), drawDepot(g,G), drawDeath(g,G), drawJournal(g,G), drawPause(g,G)
```

---

## The `G` (game) object — the contract every UI module draws from

```js
G = {
  mode: 'title'|'depot'|'run'|'shaft'|'death'|'journal'|'pause',
  t: 0,                       // seconds since boot
  runT: 0,                    // seconds this expedition
  world, player, cam, fx, audio, enemies:[], loot:[],
  strataIdx: 0,
  depth: 0,                   // metres, = stratum.top + player tile y
  maxDepth: 0,
  haul: 0,                    // ₲ carried, unbanked  ← THE tension number
  haulItems: { nugget:n, gem:n, shard:n, bone:n, relic:n },
  weight: 0,                  // grams carried
  bank: 0,                    // ₲ banked across runs
  seed: 0,
  msgs: [ {text, color, t, life} ],       // transient HUD lines, newest last
  callout: { title, sub, color, t, life } | null,
  journal: [ {id, name, blurb, depth, found:bool} ],
  discoveries: Set<string>,   // learned geological rules
  upgrades: { id: level },
  stats: { strikes, crits, bestCombo, tilesBroken, deepest, runs, banked },
  shaft: { open:bool, choice:0 },
  flash: { color, a },        // full-screen flash
  vignette: 0,
  cfg: CFG,
}

player = { x, y, vx, vy, w, h, onGround, facing:1|-1, hp, maxHp,
           light, lightMax, tool, toolMax, combo, comboT, perfectT,
           digDir:[dx,dy], digging, charge, chargeT, invuln, dead,
           charges: { bomb, sonar }, climbing }
```

Modules may READ `G` freely. Only `game.js` mutates it.
