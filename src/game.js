// game.js — run lifecycle and the composition of feel.
//
// Every function that reacts to a strike is doing one job: turning a rule into a sensation, then
// turning that sensation into the next question. GDD §26: "Every reveal creates another question."

import { CFG, TS, VW, VH, WEIGHT } from './config.js';
import { T, TILES, D, STRATA } from './world/tiles.js';
import { World } from './world/world.js';
import { LightField } from './world/light.js';
import { generate } from './world/gen.js';
import { Player, ANIM } from './entities/player.js';
import { Loot } from './entities/items.js';
import * as Enemies from './entities/enemies.js';
import { Camera } from './fx/camera.js';
import { FX, fxStrike, fxBreak, fxShear, fxCollapse, fxValue, fxDiscovery, fxHollowPuff } from './fx/particles.js';
import { audio } from './core/audio.js';
import { Rand, clamp, damp, hashf } from './core/rng.js';
import { UPGRADES, upgradeCost } from './ui/screens.js';
import * as SaveMod from './core/save.js';
import { MAP } from './core/input.js';

export const RULES = {
  flecks:    { title: 'GOLD FLECKS', rule: 'Flecks thicken toward the seam. Dig where they crowd.' },
  hollow:    { title: 'HAIRLINE CRACKS', rule: 'A hairline in the face means open space behind it.' },
  echo:      { title: 'THE HOLLOW NOTE', rule: 'A wall with a cavity behind it answers low and long.' },
  roots:     { title: 'BLUE ROOTS', rule: 'Roots reach for water. Water sits above the geodes.' },
  shear:     { title: 'SLATE SHEARS', rule: 'Slate lets go along its bed. One clean strike opens a corridor.' },
  granite:   { title: 'GRANITE', rule: 'Granite refuses a light swing. Charge it, or land the beat.' },
  chain:     { title: 'FRACTURE CHAINS', rule: 'Break a cracked neighbour and the whole cluster goes.' },
  mimic:     { title: 'MIMIC VEIN', rule: 'Real gold branches. If the flecks sit on a grid, it is teeth.' },
  crawler:   { title: 'CRAWLERS', rule: 'They hang above open ground. Take the ceiling out from under them.' },
  stoneback: { title: 'STONEBACK', rule: 'Armour in front, meat behind. Let it commit, then take the back.' },
  burrower:  { title: 'BURROWERS', rule: 'They come to the sound of your pick, not to you.' },
  glowmoth:  { title: 'GLOWMOTHS', rule: 'Your lantern is bait. So is what you are carrying.' },
  ruin:      { title: 'STRAIGHT EDGES', rule: 'Stone does not lie flat by accident. Someone cut that.' },
  fossil:    { title: 'ANATOMY', rule: 'Follow the vertebrae the way they curve. The skull is at the end.' },
  magma:     { title: 'DISCOLOURED STONE', rule: 'Rock stained orange has heat behind it.' },
  depth:     { title: 'DEPTH', rule: 'Everything below is worth more, and everything below wants it back.' },
};

const RELICS = [
  ['lamp',    'MINERS LAMP, UNLIT',    'Brass, cold, and full of oil. Nobody puts a full lamp down.'],
  ['token',   'COMPANY TOKEN',         'Redeemable at a store that has not existed for ninety years.'],
  ['idol',    'SQUAT STONE IDOL',      'Carved facing down. Whatever it watches, it is not us.'],
  ['gear',    'TOOTHED GEAR',          'Machined to a tolerance the surface has not managed since.'],
  ['ring',    'WEDDING BAND',          'Sized for a hand smaller than yours. No name inside.'],
  ['plate',   'ETCHED PLATE',          'A map. The shafts on it go down past where the paper ends.'],
  ['bell',    'HAND BELL',             'It still rings. Down here, that is a poor idea.'],
  ['spine',   'ARTICULATED SPINE',     'Too many vertebrae. Assembled with care by someone.'],
  ['key',     'IRON KEY',              'Heavy enough to be a weapon. There is a door somewhere.'],
  ['seed',    'GLASS SEED',            'Warm. It has been warm the entire time you have held it.'],
  ['ledger',  'PAGE FROM A LEDGER',    'Columns of names. The last third are crossed out in one stroke.'],
  ['crown',   'CIRCLET OF WIRE',       'Not decorative. It was made to be worn while working.'],
];

export function newGame() {
  const s = SaveMod.load();
  const G = {
    mode: 'title', t: 0, runT: 0, dtLast: 0,
    world: null, lf: null, player: new Player(), cam: new Camera(),
    fx: new FX(), loot: new Loot(), audio,
    enemies: [], bombs: [], veinHints: [],
    strataIdx: 0, depth: 0, maxDepth: 0, runMaxDepth: 0,
    haul: 0, haulItems: {}, weight: 0, carried: [],
    bank: s.bank, seed: 1,
    msgs: [], callout: null,
    journal: RELICS.map(r => {
      const saved = s.journal.find(j => j.id === r[0]);
      return { id: r[0], name: r[1], blurb: r[2], depth: saved ? saved.depth : 0, found: !!saved };
    }),
    discoveries: new Set(s.discoveries),
    runLearned: [],
    upgrades: s.upgrades, stats: s.stats, muted: s.muted,
    ui: { sel: 0, tab: 0, scroll: 0 },
    shaft: { open: false, choice: 1, near: null },
    flash: { color: '#ffffff', a: 0 },
    vignette: 0, hitstop: 0, danger: 0, abandonHold: 0, uiLock: 0,
    aim: null, deathCause: '', deathRecorded: false, lastRun: null,
    runStart: { tiles: 0, strikes: 0, crits: 0 },
    sonar: { t: 0, x: 0, y: 0, r: 0 },
    rand: new Rand(1),
    cfg: CFG,
    tutorialShown: {},
    bagWarned: 0,
    coachT: 0,
    ruleTable: RULES,
    slowmo: 0,
  };
  audio.setMuted(s.muted);
  return G;
}

// ── messages & callouts ───────────────────────────────────────────────────────
export function msg(G, text, color) {
  // A sideways swing resolves two tiles, so a shear or a chain can raise the same line twice in
  // one frame. Refresh the existing line rather than stacking it.
  const last = G.msgs[G.msgs.length - 1];
  if (last && last.text === text && last.t < 0.9) { last.t = 0; return; }
  G.msgs.push({ text, color: color || '#d8d2c4', t: 0, life: 2.7 });
  if (G.msgs.length > 4) G.msgs.shift();
}
export function callout(G, title, sub, color, tier) {
  G.callout = { title, sub: sub || '', color: color || '#ffd867', t: 0, life: tier >= 3 ? 3.4 : 2.5, tier: tier || 1 };
  audio.discovery(tier || 1);
}
export function learn(G, id) {
  if (G.discoveries.has(id)) return false;
  const r = RULES[id];
  if (!r) return false;
  G.discoveries.add(id);
  G.runLearned.push(r.rule);
  callout(G, 'FIELD NOTE', r.title + ' - ' + r.rule, '#7fd0f0', 2);
  return true;
}

// ── upgrades ──────────────────────────────────────────────────────────────────
export function lvl(G, id) { return G.upgrades[id] | 0; }

export function applyUpgrades(G) {
  const p = G.player;
  p.pickPower = 1 + lvl(G, 'pick');
  p.dmgMul = 1 + lvl(G, 'carbide') * 0.14;
  p.heavyTime = CFG.heavyChargeTime * (1 - lvl(G, 'carbide') * 0.15);
  p.lanternR = CFG.lanternRadius + lvl(G, 'mantle') * 1.7;
  p.lightMax = Math.round(CFG.lightMax * (1 + lvl(G, 'oil') * 0.35));
  p.carryMax = Math.round(CFG.carryMax * (1 + lvl(G, 'pack') * 0.42));
  p.fleckRange = 1 + lvl(G, 'eye');
  p.resonance = lvl(G, 'resonance') > 0;
  p.spikes = lvl(G, 'spikes') > 0;
  p.fallSafe = CFG.fallSafe + lvl(G, 'boots') * 3.2;
  p.chargesMax = { bomb: lvl(G, 'charges') * 2, sonar: lvl(G, 'sonar') };
  p.beacon = lvl(G, 'beacon') > 0;
}

// ── run lifecycle ─────────────────────────────────────────────────────────────
export function startRun(G, seed) {
  G.seed = seed || ((G.t * 1000) | 0) ^ (G.stats.runs * 2654435761) ^ 0x9e3779b9;
  G.rand = new Rand(G.seed);
  G.haul = 0; G.haulItems = {}; G.weight = 0; G.carried.length = 0;
  G.runT = 0; G.runMaxDepth = 0; G.runLearned = [];
  G.strataIdx = 0;
  G.stats.runs++;
  // Snapshot the lifetime counters so the death screen can report THIS run. It was printing
  // TILES 192 after a 22-tile run, on the screen whose whole job is to report what just happened.
  G.runStart = { tiles: G.stats.tilesBroken | 0, strikes: G.stats.strikes | 0, crits: G.stats.crits | 0 };
  G.deathCause = '';
  G.deathRecorded = false;
  G.tutorialShown = {};
  // The whole feel layer, not just the simulation: dying inside a discovery hitstop and
  // hammering R used to start the next run at 3.5% speed under the last run's callout.
  G.hitstop = 0; G.flash.a = 0; G.callout = null; G.msgs.length = 0;
  G.danger = 0; G.vignette = 0; G.bagWarned = 0; G.abandonHold = 0;
  G.sonar.t = 0; G.sonarMapped = false;
  const p = G.player;
  p.reset(0, 0);
  applyUpgrades(G);
  p.hp = p.maxHp; p.light = p.lightMax; p.tool = p.toolMax;
  p.charges = { bomb: p.chargesMax.bomb, sonar: p.chargesMax.sonar };
  p.beaconUsed = false;
  enterStratum(G, 0);
  G.mode = 'run';
  audio.ambient(0);
  if (G.stats.runs <= 1) {
    msg(G, 'SPACE  DIG      A D  MOVE      K  JUMP', '#d8d2c4');
    G.coachT = 0;
  }
  if (G.world.hint) msg(G, G.world.hint, '#8a8496');
}

export function enterStratum(G, idx) {
  G.strataIdx = idx;
  const s = STRATA[idx];
  const world = new World(idx, G.seed + idx * 7919);
  const rand = new Rand((G.seed + idx * 104729) >>> 0);
  generate(world, rand, { index: idx, depthTop: s.top, valueMul: s.valueMul, threat: s.threat, w: world.w, h: world.h });
  G.world = world;
  G.lf = new LightField(world);
  G.enemies.length = 0;
  G.bombs.length = 0;
  G.veinHints.length = 0;
  G.sonar.t = 0;
  G.loot.clear();
  G.fx.clear();
  for (const sp of world.spawns) {
    const e = Enemies.spawn(sp.type, sp.tx * TS + TS / 2, (sp.ty + 1) * TS, s.threat);
    if (e) G.enemies.push(e);
  }
  const p = G.player;
  p.x = world.entryTX * TS + TS / 2;
  p.y = (world.entryTY + 1) * TS;
  p.vx = 0; p.vy = 0; p.dead = false;
  p.readyAt = G.t; p.combo = 0;
  G.cam.snapTo(p.x - VW / 2, p.y - p.h * 0.5 - VH / 2, world);
  G.shaft.open = false;
  G.uiLock = 0.3;
  audio.ambient(idx);
}

function bigHaulRef(G) { return 900 * STRATA[Math.min(2, G.strataIdx + 1)].valueMul; }

export function bankRun(G, reason) {
  const amount = Math.round(G.haul);
  G.bank += amount;
  G.stats.banked += amount;
  G.stats.deepest = Math.max(G.stats.deepest, G.runMaxDepth);
  G.lastRun = {
    depth: G.runMaxDepth, value: amount, items: Object.assign({}, G.haulItems),
    learned: G.runLearned.slice(), time: G.runT, extracted: true, reason,
    tiles: (G.stats.tilesBroken | 0) - G.runStart.tiles,
    strikes: (G.stats.strikes | 0) - G.runStart.strikes,
    crits: (G.stats.crits | 0) - G.runStart.crits,
    combo: G.player.bestCombo | 0,
    deep: G.runMaxDepth >= STRATA[STRATA.length - 1].top,
  };
  G.stats.bestCombo = Math.max(G.stats.bestCombo | 0, G.player.bestCombo | 0);
  audio.bank(amount);
  G.haul = 0; G.haulItems = {}; G.weight = 0; G.carried.length = 0;
  G.mode = 'depot';
  G.uiLock = 0.3;
  // Land the cursor on something the player could not afford before this run. The Depot should
  // open on a new possibility, not on row one.
  G.ui.sel = 0;
  for (let i = 0; i < UPGRADES.length; i++) {
    const u = UPGRADES[i], l = lvl(G, u.id);
    if (l >= u.max) continue;
    const c = upgradeCost(u, l);
    if (c <= G.bank && c > G.bank - amount) { G.ui.sel = i; break; }
  }
  SaveMod.save(G);
}

export function die(G, cause) {
  G.deathCause = cause || 'the dark';
  G.stats.deaths = (G.stats.deaths | 0) + 1;
  G.stats.deepest = Math.max(G.stats.deepest, G.runMaxDepth);
  G.lastRun = {
    depth: G.runMaxDepth, value: Math.round(G.haul), items: Object.assign({}, G.haulItems),
    learned: G.runLearned.slice(), time: G.runT, extracted: false, reason: cause,
    tiles: (G.stats.tilesBroken | 0) - G.runStart.tiles,
    strikes: (G.stats.strikes | 0) - G.runStart.strikes,
    crits: (G.stats.crits | 0) - G.runStart.crits,
    combo: G.player.bestCombo | 0,
  };
  G.stats.bestCombo = Math.max(G.stats.bestCombo | 0, G.player.bestCombo | 0);
  audio.die();
  SaveMod.save(G);
}

// ── strike resolution: the composition layer ──────────────────────────────────
function tileCentre(tx, ty) { return [tx * TS + TS / 2, ty * TS + TS / 2]; }

/** Top of the first solid tile below (tx,ty), in world px — or null if there is none nearby. */
function floorUnder(world, tx, ty) {
  for (let k = 0; k <= 5; k++) {
    if (world.solid(tx, ty + k)) return (ty + k) * TS - 1;
  }
  return null;
}

/** Enemy modules differ on how they mark a corpse; accept any of the usual spellings. */
export function isGone(e) {
  return !!(e.gone || e.removed || e.despawn || e.remove ||
            (e.dead && (e.deadT === undefined ? true : e.deadT > 0.55)));
}

/**
 * How big is the space BEHIND this face?
 *
 * This has to be measured before the pick opens it and from the far side, or it measures the
 * player's own tunnel instead: flooded after the break it either runs back to the entry alcove
 * (and returns 0, killing the discovery entirely) or hits the cap once the excavation joins any
 * natural cavern (and then fires HIDDEN CHAMBER on literally every subsequent tile).
 *
 * Returns 0 if the space reaches daylight or the map edge — breaking through to the sky is not
 * a discovery, and rewarding it would teach exactly the wrong lesson.
 */
function cavitySize(world, tx, ty, cap, ptx, pty) {
  if (world.get(tx, ty) !== T.AIR) return 0;
  const seen = new Set();
  const stack = [tx, ty];
  let n = 0;
  while (stack.length && n < cap) {
    const y = stack.pop(), x = stack.pop();
    if (x < 1 || y < 0 || x >= world.w - 1 || y >= world.h - 1) continue;
    const k = y * world.w + x;
    if (seen.has(k)) continue;
    if (world.get(x, y) !== T.AIR) continue;
    if (y <= 4) return 0;                       // daylight, not a discovery
    // ...and neither is the hole you are standing in. Relying on the flood reaching daylight
    // was not enough: once your own excavation exceeds the cap, the flood runs out before it
    // can climb back to the alcove and every pillar you break reports a chamber.
    if (x === ptx && y === pty) return 0;
    seen.add(k); n++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  // Truncated means "I could not tell", not "enormous". Returning the cap made an unresolved
  // space the loudest possible answer; silence is a far cheaper failure than a lie.
  return stack.length ? 0 : n;
}

function addHaul(G, kind, value) {
  const w = WEIGHT[kind] || 0;
  G.carried.push({ kind, value, w });
  G.haul += value;
  G.haulItems[kind] = (G.haulItems[kind] | 0) + 1;
  G.weight += w;
}

/**
 * The bag is the tension (GDD §8: "Success gradually creates the central tension"). Once it is
 * full, a better find does not bounce off you — it costs you the worst thing you are carrying.
 * That keeps descending meaningful at capacity and turns every late pickup into a small trade.
 */
function tryTake(G, kind, value, x, y) {
  const p = G.player;
  const w = WEIGHT[kind] || 0;
  if (G.weight + w <= p.carryMax) { addHaul(G, kind, value); return true; }
  const incoming = w <= 0 ? Infinity : value / w;

  // Work out the whole trade before committing to any of it. Testing only the single worst item
  // and then evicting as many as it takes can throw away a gem to make space for a nugget.
  const order = G.carried.map((c, i) => ({ i, c, r: c.w <= 0 ? Infinity : c.value / c.w }))
                         .sort((a, b) => a.r - b.r);
  let freed = 0, lost = 0, take = 0;
  const need = G.weight + w - p.carryMax;
  while (freed < need && take < order.length) {
    if (order[take].r >= incoming) break;      // never evict something denser than what arrived
    freed += order[take].c.w;
    lost += order[take].c.value;
    take++;
  }
  if (freed < need || lost >= value) return false;   // the trade is not worth making

  const drop = new Set(order.slice(0, take).map(o => o.i));
  const dropped = G.carried.filter((_, i) => drop.has(i));
  G.carried = G.carried.filter((_, i) => !drop.has(i));
  for (const d of dropped) {
    G.haul -= d.value; G.weight -= d.w;
    G.haulItems[d.kind] = Math.max(0, (G.haulItems[d.kind] | 0) - 1);
  }
  addHaul(G, kind, value);
  for (const d of dropped) G.loot.spawn(x, y, d.kind, d.value, G.rand, 0, 0).reject = 2.2;
  msg(G, 'MADE ROOM - DROPPED ' + dropped.map(d => d.kind.toUpperCase()).join(' '), '#ff9b2e');
  audio.ui('deny');
  return true;
}

function veinHint(G, tx, ty) {
  const world = G.world;
  const here = world.get(tx, ty);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const t = world.get(tx + dx, ty + dy);
    if (t === T.ORE_GOLD || t === T.ORE_GEM || t === T.CRYSTAL || t === T.RELIC) {
      const [cx, cy] = tileCentre(tx, ty);
      G.veinHints.push({ x: cx + dx * 5, y: cy + dy * 5, dx, dy, t: 0, life: 1.8 });
    }
  }
}

/**
 * The pick is the primary weapon (GDD §11) — the same swing that opens rock opens creatures.
 * The swing sweeps the whole face in front of the miner, which is why a sideways strike can
 * catch a crawler that just landed next to you without any separate attack input.
 */
function strikeEnemies(G, info) {
  const dmg = info.damage * 1.6;
  const rects = [[info.tx * TS - 3, info.ty * TS - 3, TS + 6, TS + 6]];
  if (info.second >= 0) rects.push([info.tx * TS - 3, info.second * TS - 3, TS + 6, TS + 6]);
  let hitAny = false;
  const ectx = enemyCtx(G);
  for (const e of G.enemies) {
    if (e.dead || isGone(e)) continue;
    const ex = e.x - e.w / 2, ey = e.y - e.h;
    for (const r of rects) {
      if (ex < r[0] + r[2] && ex + e.w > r[0] && ey < r[1] + r[3] && ey + e.h > r[1]) {
        Enemies.hurt(e, dmg, info.dx, info.dy, ectx);
        hitAny = true;
        break;
      }
    }
  }
  if (hitAny) {
    G.hitstop = Math.max(G.hitstop, info.crit ? 0.07 : 0.04);
    G.cam.addShake(info.crit ? 2.4 : 1.4);
    G.cam.punch(info.dx, info.dy, CFG.camPunch);
  }
  return hitAny;
}

export function resolveStrike(G, info) {
  const world = G.world, p = G.player, fx = G.fx;
  G.stats.strikes++;
  if (info.crit) G.stats.crits++;
  const hitCreature = strikeEnemies(G, info);

  const target = world.get(info.tx, info.ty);
  const tinfo = TILES[target];

  // Is there open space directly behind this face? That answer becomes a SOUND, and the sound is
  // the mechanic (GDD §21) — hollow walls ring differently and experienced players hear cavities.
  const bx = info.tx + (info.dy === 0 ? info.dx : 0);
  const by = info.ty + (info.dy !== 0 ? info.dy : 0);
  const hollow = tinfo.solid && world.get(bx, by) === T.AIR;

  const [cx, cy] = tileCentre(info.tx, info.ty);
  const hx = info.handX, hy = info.handY;

  // Read the clue off the face BEFORE the pick removes it.
  const seedDeco = world.getDeco(info.tx, info.ty);
  const seedDeco2 = info.second >= 0 ? world.getDeco(info.tx, info.second) : 0;
  const ptx = Math.floor(p.x / TS), pty = Math.floor((p.y - p.h * 0.5) / TS);
  const seedCavity = hollow ? cavitySize(world, bx, by, 240, ptx, pty) : 0;
  // A sideways swing can break through on its LOWER row; that opening deserves the same payoff.
  let hollow2 = false, seedCavity2 = 0;
  if (info.second >= 0 && info.dy === 0) {
    const t2 = world.get(info.tx, info.second);
    hollow2 = TILES[t2].solid && world.get(bx, info.second) === T.AIR;
    // Only when the aimed row is NOT already a breakthrough. A swing that opens both rows onto
    // the same chamber used to fire the discovery twice, and the second callout destroyed the
    // first — on the one beat where the game states the rule it just taught you.
    if (hollow2 && !hollow) seedCavity2 = cavitySize(world, bx, info.second, 240, ptx, pty);
  }

  const res = world.strike(info.tx, info.ty, info.power, info.damage, { crit: info.crit });

  // A sideways swing goes through the WHOLE face in front of you, not one tile of it: the second
  // row the body occupies takes a share of the same blow. That is why tunnelling feels powerful
  // instead of like chipping a wall with a teaspoon.
  if (info.second >= 0 && info.dy === 0) {
    const r2 = world.strike(info.tx, info.second, info.power, info.damage * CFG.sideSpill, { crit: info.crit });
    if (r2.broke && r2.broken && r2.broken.length) {
      handleBreaks(G, r2.broken, { tx: info.tx, ty: info.second, dx: info.dx, dy: 0, crit: info.crit, combo: info.combo }, seedDeco2, seedCavity2);
    }
  }

  if (!res.hit) {
    if (res.tooHard) {
      audio.strike(tinfo.voice, { tooHard: true, crit: info.crit, heavy: info.heavy });
      fx.sparks(hx, hy, '#c8c5d4', 7, -info.dx, -info.dy);
      G.cam.addShake(0.9);
      G.hitstop = Math.max(G.hitstop, 0.03);
      p.recoilX = info.dx * -3.2; p.recoilY = info.dy * -3.2;
      if (target === T.GRANITE) {
        if (!G.tutorialShown.granite) {
          G.tutorialShown.granite = 1;
          msg(G, 'TOO HARD - HOLD DIG FOR A HEAVY STRIKE', '#ff9b2e');
        }
        learn(G, 'granite');
      }
    } else if (target === T.AIR && !hitCreature) {
      audio.strike('dirt', { power: 0 });
      fx.dust(hx, hy, '#4f4759', 2);
    }
    return;
  }

  // --- a hit that did not break: the THUNK ---
  audio.strike(tinfo.voice, {
    crit: info.crit, heavy: info.heavy, combo: info.combo,
    stage: res.stage, hollow, power: info.power,
  });
  // Onboarding without a tutorial: name the thing the player just did, once, the first time
  // they do it. GDD §25 asks whether players can learn the rules without being told them —
  // so we confirm discoveries, we never pre-explain them.
  if (info.crit) {
    if (!G.tutorialShown.crit) { G.tutorialShown.crit = 1; msg(G, 'CRITICAL FRACTURE - YOU HIT IT ON THE BEAT', '#ffd867'); }
    if (info.combo === 5 && !G.tutorialShown.combo5) { G.tutorialShown.combo5 = 1; msg(G, 'COMBO x5 - ORE IS WORTH MORE WHILE THIS HOLDS', '#ffd867'); }
    if (info.combo === 12 && !G.tutorialShown.combo12) { G.tutorialShown.combo12 = 1; msg(G, 'x12 - THE ROCK IS SINGING', '#7ff0dd'); }
  }
  G.cam.addShake(info.heavy ? CFG.shakeHeavy : info.crit ? CFG.shakeCrit : CFG.shakeTap);
  G.cam.punch(info.dx, info.dy, CFG.camPunch * (info.heavy ? 1.5 : info.crit ? 1.1 : 0.6));
  G.hitstop = Math.max(G.hitstop, info.crit ? CFG.hitstopCrit : CFG.hitstopTap);
  fxStrike(fx, hx, hy, tinfo, info.dx, info.dy, info.crit, floorUnder(world, info.tx, info.ty));

  if (hollow) {
    // The Resonance Kit turns the audio tell into a visible one. An information upgrade, not a stat.
    if (p.resonance) fx.ring(cx + info.dx * 6, cy + info.dy * 6, '#7fd0f0', { r: 13, life: 0.34 });
    if (world.getDeco(info.tx, info.ty) === D.HAIRLINE) learn(G, 'echo');
  }

  if (!res.broke) return;

  // --- the POP ---
  handleBreaks(G, res.broken, info, seedDeco, seedCavity);
}

function handleBreaks(G, broken, info, seedDeco, seedCavity) {
  const world = G.world, p = G.player, fx = G.fx;
  let valueGained = 0, best = null, shear = 0, chain = 0;
  seedDeco = seedDeco || 0;
  seedCavity = seedCavity || 0;

  for (const b of broken) {
    const bi = TILES[b.tile];
    const [bx, by] = tileCentre(b.tx, b.ty);
    if (b.cause === 'shear') shear++;
    if (b.cause === 'chain') chain++;
    fxBreak(fx, bx, by, bi, { big: bi.hp >= 6, shear: b.cause === 'shear', chain: b.cause === 'chain', floorY: floorUnder(world, b.tx, b.ty) });
    G.stats.tilesBroken++;

    if (bi.item && bi.value > 0) {
      const mul = G.world.stratum.valueMul * (1 + Math.min(p.combo, 20) * 0.03);
      const value = Math.max(1, Math.round(bi.value * mul * (0.85 + G.rand.f() * 0.3)));
      G.loot.spawn(bx, by, bi.item, value, G.rand, info.dx, info.dy);
      valueGained += value;
      if (!best || value > best.v) best = { v: value, x: bx, y: by, kind: bi.item };
    } else if (bi.item) {
      G.loot.spawn(bx, by, bi.item, 0, G.rand, info.dx, info.dy);
    }

    if (b.tile === T.RELIC) foundRelic(G, bx, by);
    if (b.tile === T.MIMIC && !G.tutorialShown.mimicMsg) {
      G.tutorialShown.mimicMsg = 1; learn(G, 'mimic'); msg(G, 'IT WAS NEVER GOLD', '#ff5a4a');
    }
    veinHint(G, b.tx, b.ty);
    world.queueSettle(b.tx, b.ty);
  }

  if (!broken.length) return;
  const big = broken.length >= 4;
  audio.breakTile(TILES[broken[0].tile].voice, {
    big, chain, shear: shear > 0, value: clamp(valueGained / 300, 0, 1),
  });
  G.hitstop = Math.max(G.hitstop, big ? CFG.hitstopBigBreak : CFG.hitstopBreak);
  G.cam.addShake(CFG.shakeBreak + Math.min(4, broken.length * 0.35));

  if (shear > 0) {
    fxShear(fx, info.tx * TS + TS / 2, info.ty * TS + TS / 2, info.dx, TILES[T.SLATE].dust);
    learn(G, 'shear');
    if (shear >= 3) msg(G, 'THE BED LET GO', '#657f9b');
  }
  if (chain >= 2) learn(G, 'chain');

  // --- prediction pays better than luck (GDD §13) ---
  //
  // The moment this exists for: the player read a fleck halo, committed to a direction, and the
  // face they broke opened onto the seam it promised. Ore tiles carry no flecks themselves, so
  // the test has to be "did this break EXPOSE ore", not "did this break yield ore" — otherwise
  // the flagship rule of the whole game is unlearnable.
  const fleckSeed = seedDeco === D.FLECK_RICH || seedDeco === D.FLECK_FAINT || seedDeco === D.GEMGLINT;
  if (fleckSeed) {
    let exposed = 0, sawMimic = false;
    for (const b of broken) {
      for (const dxy of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = world.get(b.tx + dxy[0], b.ty + dxy[1]);
        if (t === T.ORE_GOLD || t === T.ORE_GEM || t === T.CRYSTAL || t === T.RELIC) exposed++;
        else if (t === T.MIMIC) sawMimic = true;
      }
    }
    if (exposed > 0 || valueGained > 0) {
      const first = !G.discoveries.has('flecks');
      learn(G, 'flecks');
      const cx = info.tx * TS + TS / 2, cy = info.ty * TS + TS / 2;
      fx.ring(cx, cy, '#ffd867', { r: 26, life: 0.4 });
      fx.ring(cx, cy, '#fff3c0', { r: 14, life: 0.26 });
      fx.glint(cx, cy, '#fff3c0');
      G.cam.addShake(2.2);
      G.hitstop = Math.max(G.hitstop, 0.07);
      audio.discovery(1);
      if (!first) fx.popup(cx, cy - 12, 'CALLED IT', '#ffd867', { scale: 1, life: 1.0 });
    } else if (sawMimic) {
      learn(G, 'mimic');
    }
  }

  // --- did we open something? ---
  if (seedCavity > 0) {
    const cx2 = info.tx * TS + TS / 2, cy2 = info.ty * TS + TS / 2;
    const predicted = seedDeco === D.HAIRLINE || seedDeco === D.AIRFLOW;
    if (seedCavity >= 26) {
      fxDiscovery(fx, cx2, cy2, predicted ? '#ffd867' : '#7fd0f0');
      G.hitstop = Math.max(G.hitstop, CFG.hitstopDiscovery);
      G.cam.addShake(4.2);
      G.flash.color = '#d5fff6'; G.flash.a = predicted ? 0.42 : 0.24;
      audio.duck(1.4, 0.35);
      if (predicted) {
        // Say the rule ONCE, inside the reward, rather than posting a field note that the
        // very next line overwrites.
        const fresh = !G.discoveries.has('hollow');
        if (fresh) { G.discoveries.add('hollow'); G.runLearned.push(RULES.hollow.rule); }
        callout(G, 'YOU CALLED IT', fresh ? RULES.hollow.rule : 'A CHAMBER, EXACTLY WHERE THE CRACK SAID', '#ffd867', 3);
      } else {
        callout(G, 'HIDDEN CHAMBER', seedCavity >= 240 ? 'IT KEEPS GOING' : seedCavity + ' CUBIC METRES OF NOTHING', '#7fd0f0', 2);
      }
    } else if (seedCavity >= 5) {
      fxHollowPuff(fx, cx2, cy2, info.dx, info.dy);
      if (predicted) learn(G, 'hollow');
    }
  }

  // water / magma exposure
  for (const dxy of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = world.get(info.tx + dxy[0], info.ty + dxy[1]);
    if (t === T.WATER) {
      if (seedDeco === D.ROOTLET || seedDeco === D.DAMP) learn(G, 'roots');
      if (!G.tutorialShown.water) { G.tutorialShown.water = 1; msg(G, 'WATER - IT WILL FIND THE LOW GROUND', '#63cbe8'); }
      audio.danger('water');
    } else if (t === T.MAGMA) {
      // Credit the rule only if they read the stain. Handing someone the note for blundering
      // a pick into magma teaches them that the game will tell them things anyway.
      if (seedDeco === D.HEAT) learn(G, 'magma');
      audio.danger('magma');
      msg(G, 'HEAT', '#ff9b2e');
    } else if (t === T.RUIN) {
      if (seedDeco === D.EDGE) learn(G, 'ruin');
    } else if (t === T.BONE) {
      if (seedDeco === D.BONEHINT) learn(G, 'fossil');
    }
  }
}

function foundRelic(G, x, y) {
  const undiscovered = G.journal.filter(j => !j.found);
  const entry = undiscovered.length ? undiscovered[G.rand.i(undiscovered.length)] : G.journal[G.rand.i(G.journal.length)];
  entry.found = true; entry.depth = Math.round(G.depth);
  G.flash.color = '#ffd867'; G.flash.a = 0.62;
  G.hitstop = Math.max(G.hitstop, CFG.hitstopDiscovery);
  G.cam.addShake(5.5);
  callout(G, entry.name, entry.blurb, '#e8b878', 3);
  G.fx.ring(x, y, '#ffd867', { r: 40, life: 0.7 });
  G.fx.ring(x, y, '#e6ccff', { r: 26, life: 0.5 });
  G.runLearned.push('RECOVERED: ' + entry.name);
  const gap = G.journal.filter(j => !j.found).length;
  if (gap > 0) msg(G, 'THE ARCHIVE HAS ' + gap + ' EMPTY SHELVES LEFT', '#8a8496');
}

// ── utilities (bombs / sonar) ─────────────────────────────────────────────────
/** Blast charge. Bound to its own key so owning one never locks the other out. */
export function useBomb(G) {
  const p = G.player;
  if (p.charges.bomb <= 0) { audio.ui('deny'); return; }
  p.charges.bomb--;
  const a = p.aim;
  G.bombs.push({ x: a.tx * TS + TS / 2, y: a.ty * TS + TS / 2, t: 0, fuse: 0.85 });
  audio.ui('confirm');
  msg(G, 'CHARGE SET', '#ff9b2e');
}

/** Sonar pulse. */
export function useSonar(G) {
  const p = G.player;
  if (p.charges.sonar <= 0) { audio.ui('deny'); return; }
  p.charges.sonar--;
  G.sonar.t = 3.2; G.sonar.x = p.x; G.sonar.y = p.cy; G.sonar.r = 0; G.sonarMapped = false;
  audio.discovery(1);
  msg(G, 'SONAR', '#7fd0f0');
}

/** The single touch button: whichever charge the player actually has. */
export function useUtility(G) {
  const p = G.player;
  if (p.charges.bomb > 0) useBomb(G);
  else if (p.charges.sonar > 0) useSonar(G);
  else audio.ui('deny');
}

function updateBombs(G, dt) {
  for (let i = G.bombs.length - 1; i >= 0; i--) {
    const b = G.bombs[i];
    b.t += dt;
    if (b.t < b.fuse) {
      if (((b.t * 14) | 0) % 2 === 0) G.fx.sparks(b.x, b.y - 4, '#ff9b2e', 1, 0, -1);
      continue;
    }
    G.bombs.splice(i, 1);
    const R = 2.9;
    const ctx = { tx: Math.floor(b.x / TS), ty: Math.floor(b.y / TS) };
    const broken = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const tx = ctx.tx + dx, ty = ctx.ty + dy;
      if (!TILES[G.world.get(tx, ty)].diggable) continue;
      G.world.breakAt(tx, ty, 'collapse', 2, false, broken, 0);
    }
    handleBreaks(G, broken, { tx: ctx.tx, ty: ctx.ty, dx: 0, dy: 0, crit: false, combo: 0 }, 0, 0);
    fxCollapse(G.fx, b.x, b.y, 30);
    G.cam.addShake(CFG.shakeCollapse);
    G.hitstop = Math.max(G.hitstop, 0.09);
    G.flash.color = '#ff9b2e'; G.flash.a = 0.35;
    audio.danger('collapse');
    for (const e of G.enemies) {
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < R * TS + 10) Enemies.hurt(e, 4, Math.sign(e.x - b.x), -1, enemyCtx(G));
    }
    const pd = Math.hypot(G.player.x - b.x, G.player.y - G.player.h / 2 - b.y);
    if (pd < R * TS) G.player.hurt(1, Math.sign(G.player.x - b.x) || 1, -1, playerCtx(G), 'your own charge');
  }
}

// ── contexts handed to subsystems ─────────────────────────────────────────────
function enemyCtx(G) {
  return {
    world: G.world, player: G.player, fx: G.fx, audio, rand: G.rand, t: G.t,
    hitPlayer: (dmg, kx, ky) => { if (G.player.hurt(dmg, kx || 0, ky || 0, playerCtx(G), 'a creature')) { G.cam.addShake(CFG.shakeDamage); G.hitstop = Math.max(G.hitstop, 0.09); } },
    shake: (a) => G.cam.addShake(a),
    hitstop: (s) => { G.hitstop = Math.max(G.hitstop, s); },
    breakTile: (tx, ty) => {
      const out = [];
      G.world.breakAt(tx, ty, 'collapse', 0.4, false, out, 0);
      for (const b of out) {
        const [x, y] = tileCentre(b.tx, b.ty);
        fxBreak(G.fx, x, y, TILES[b.tile], { floorY: floorUnder(G.world, b.tx, b.ty) });
        if (TILES[b.tile].item && TILES[b.tile].value > 0) {
          G.loot.spawn(x, y, TILES[b.tile].item, Math.round(TILES[b.tile].value * G.world.stratum.valueMul), G.rand, 0, 0);
        }
      }
    },
    loot: (x, y, kind, value) => G.loot.spawn(x, y, kind, value, G.rand, 0, 0),
    msg: (t, c) => msg(G, t, c),
    learn: (id) => learn(G, id),
  };
}
function playerCtx(G) {
  return {
    t: G.t, audio, fx: G.fx, weight: G.weight,
    mouseWorld: G.mouseWorld,
    onStrike: (info) => resolveStrike(G, info),
    onEarly: () => { audio.strike('stone', { tooHard: true }); G.fx.dust(G.player.x, G.player.cy, '#4f4759', 2); },
    onLand: (force, drop) => { audio.land(force); if (drop > 2.5) G.fx.dust(G.player.x, G.player.y, '#4f4759', Math.min(9, 2 + drop | 0)); if (force > 0.5) G.cam.addShake(force * 2.2); },
    onHurt: (dmg, cause) => {
      audio.hurt();
      G.flash.color = '#ff5a4a'; G.flash.a = 0.42;
      G.cam.addShake(CFG.shakeDamage);
      G.hitstop = Math.max(G.hitstop, 0.10);
      G.fx.burst(G.player.x, G.player.cy, { color: '#a44a63', n: 10, speed: [40, 150], life: [0.25, 0.6], gravity: 320, size: [1, 2] });
      G.deathCause = cause || G.deathCause;
    },
  };
}

// ── the frame ─────────────────────────────────────────────────────────────────
export function update(G, dt, input) {
  G.t += dt;
  G.dtLast = dt;
  // A key held across a screen change must not act twice. Without this, ENTER on the title
  // took you to the Depot and spent your bank on whatever the cursor was parked on.
  if (G.uiLock > 0) G.uiLock -= dt;

  // Hitstop is near-freeze, not freeze. The world stops; the input queue does not. Swallowing a
  // press inside a 300ms discovery stop would be felt immediately in a game built on rhythm.
  if (G.hitstop > 0) {
    G.hitstop -= dt;
    dt *= 0.035;
  }

  switch (G.mode) {
    case 'title': updateTitle(G, dt, input); break;
    case 'depot': updateDepot(G, dt, input); break;
    case 'journal': if (input.pressed('cancel') || input.pressed('journal') || input.pressed('confirm')) { G.mode = 'depot'; audio.ui('close'); } break;
    case 'pause': updatePause(G, dt, input); break;
    case 'death': updateDeath(G, dt, input); break;
    case 'run': case 'shaft': updateRun(G, dt, input); break;
  }
  updateCosmetic(G, dt);
}

function updateCosmetic(G, dt) {
  G.flash.a = Math.max(0, G.flash.a - dt * 9);
  for (let i = G.msgs.length - 1; i >= 0; i--) {
    G.msgs[i].t += dt;
    if (G.msgs[i].t > G.msgs[i].life) G.msgs.splice(i, 1);
  }
  if (G.callout) { G.callout.t += dt; if (G.callout.t > G.callout.life) G.callout = null; }
  if (G.sonar.t > 0) { G.sonar.t -= dt; G.sonar.r += dt * 260; }
  // Vein chevrons are simulation state, not a draw-time effect: aged here they stop ticking
  // during a pause and slow correctly through hitstop, like everything else.
  if (G.mode !== 'pause') {
    for (let i = G.veinHints.length - 1; i >= 0; i--) {
      const h = G.veinHints[i];
      h.t += dt;
      if (h.t > h.life) G.veinHints.splice(i, 1);
    }
  }
  G.fx.update(dt);
  G.cam.update(dt);
}

function updateTitle(G, dt, input) {
  if (input.pressed('confirm') || input.pressed('dig') || input.anyPressed) {
    audio.init(); audio.ui('confirm');
    if (G.stats.runs === 0) startRun(G);      // never open a shop before the verb
    else { G.mode = 'depot'; G.ui.sel = 0; G.uiLock = 0.3; }
  }
}

function updatePause(G, dt, input) {
  if (input.pressed('pause') || input.pressed('cancel')) { G.mode = 'run'; G.abandonHold = 0; audio.ui('close'); return; }
  // Q fires the Extraction Beacon in-run (banks everything) and abandons the run here (loses
  // everything). A single tap must never be able to mean both, so abandoning is a HOLD.
  if (input.held('abandon')) {
    G.abandonHold = (G.abandonHold || 0) + dt;
    if (G.abandonHold > 1.15) {
      G.abandonHold = 0;
      if (!G.deathRecorded) { G.deathRecorded = true; die(G, 'you turned back'); }
      G.mode = 'death';
    }
  } else G.abandonHold = 0;
}

function updateDeath(G, dt, input) {
  if (input.pressed('restart') || input.pressed('dig')) { audio.ui('confirm'); startRun(G); }
  else if (input.pressed('confirm')) { audio.ui('open'); G.mode = 'depot'; G.ui.sel = 0; G.uiLock = 0.3; }
}

function updateDepot(G, dt, input) {
  if (G.uiLock > 0) return;
  const n = UPGRADES.length;
  if (input.pressed('up')) { G.ui.sel = (G.ui.sel + n - 1) % n; audio.ui('move'); }
  if (input.pressed('down')) { G.ui.sel = (G.ui.sel + 1) % n; audio.ui('move'); }
  if (input.pressed('journal') && !input.held('dig')) { G.mode = 'journal'; audio.ui('open'); return; }

  const buy = () => {
    const u = UPGRADES[G.ui.sel];
    const l = lvl(G, u.id);
    if (l >= u.max) { audio.ui('deny'); return; }
    const cost = upgradeCost(u, l);
    if (G.bank >= cost) {
      G.bank -= cost; G.upgrades[u.id] = l + 1;
      applyUpgrades(G); audio.ui('buy'); SaveMod.save(G);
      msg(G, u.name + ' ' + (l + 1), '#7ff0a0');
    } else audio.ui('deny');
  };

  // A pointer needs a target, not an alias. 'dig' and 'confirm' BOTH report a click and a touch
  // tap, so routing the Depot through them made every tap mean whichever branch came first.
  // Hit-test instead: the descend bar plays, an upgrade row selects and buys.
  if (input.mpressed || input.touch._pdig || input.touch._ptap) {
    const mx = input.mx, my = input.my;
    if (my >= VH - 36 && my <= VH - 10) { audio.ui('confirm'); startRun(G); return; }
    const row = Math.floor((my - 42) / 13);
    if (mx >= 8 && mx <= 280 && row >= 0 && row < UPGRADES.length) {
      if (row !== G.ui.sel) { G.ui.sel = row; audio.ui('move'); }
      else buy();
    }
    return;
  }
  // Keyboard: SPACE/K descend, ENTER buys. Tested on the raw codes so a click cannot alias in.
  if (input.pressedKey(MAP.dig.concat(MAP.jump))) { audio.ui('confirm'); startRun(G); return; }
  if (input.pressedKey(MAP.confirm)) buy();
}

function updateRun(G, dt, input) {
  const p = G.player, world = G.world;
  G.runT += dt;
  G.mouseWorld = { x: input.mx + G.cam.ix, y: input.my + G.cam.iy };

  if (G.stats.runs <= 1 && !G.tutorialShown.crit && G.stats.strikes >= 8) {
    G.coachT = (G.coachT || 0) + dt;
    if (G.coachT > 1.2 && !G.tutorialShown.beat) {
      G.tutorialShown.beat = 1;
      msg(G, 'TAP AGAIN THE MOMENT THE PICK IS READY - LISTEN FOR THE CLICK', '#ffd867');
    }
  }
  if (p.tool <= 0 && !G.tutorialShown.blunt) {
    G.tutorialShown.blunt = 1;
    msg(G, 'THE PICK IS BLUNT - THE SHAFT HOUSE HAS A GRINDING WHEEL', '#ff9b2e');
  }
  if (p.light <= 0 && !G.tutorialShown.dark) {
    G.tutorialShown.dark = 1;
    msg(G, 'THE LANTERN IS OUT', '#ff5a4a');
    audio.danger('lowlight');
  } else if (p.light < p.lightMax * 0.2 && !G.tutorialShown.lowlight) {
    G.tutorialShown.lowlight = 1;
    msg(G, 'THE LANTERN IS GOING - GLOWCAPS BURN CLEAN', '#ffcf8a');
  }

  // Air moves toward the shaft. Rather than draw an arrow on the HUD, we let the player feel a
  // draft: motes drift in the direction of the way down. GDD §7 lists airflow as a real clue, so
  // this is the same grammar being used for navigation instead of for treasure.
  G.draftT = (G.draftT || 0) - dt;
  if (G.draftT <= 0) {
    G.draftT = 0.16 + G.rand.f() * 0.2;
    const sx = world.shaftTX * TS + TS / 2, sy = (world.shaftTY + 1) * TS;
    const dx = sx - p.x, dy = sy - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 60 && d < 900) {
      const ox = p.x + (G.rand.f() - 0.5) * 200, oy = p.y - 20 + (G.rand.f() - 0.5) * 130;
      if (world.get(Math.floor(ox / TS), Math.floor(oy / TS)) === T.AIR) {
        G.fx.motes(ox, oy, dx / d, dy / d, 1);
      }
    }
  }

  if (input.pressed('pause') && G.mode === 'run') { G.mode = 'pause'; audio.ui('open'); return; }
  if (input.pressed('mute')) { G.muted = !G.muted; audio.setMuted(G.muted); SaveMod.save(G); }
  if (input.pressed('dim')) { p.dim = !p.dim; audio.ui('tick'); msg(G, p.dim ? 'LANTERN DIMMED' : 'LANTERN UP', '#ffcf8a'); }

  // shaft prompt owns the input while it is open
  if (G.mode === 'shaft') { updateShaft(G, dt, input); return; }

  if (input.touch && input.touch._putil) useUtility(G);      // the single touch button
  else if (input.pressed('util')) useBomb(G);
  if (input.pressed('sonar')) useSonar(G);

  const pctx = playerCtx(G);
  if (!p.dead) p.update(dt, input, world, pctx);
  else {
    if (!G.deathRecorded) { G.deathRecorded = true; die(G, G.deathCause); }
    p.update(dt, input, world, pctx);
    if (p.deadT > 1.1) { G.mode = 'death'; return; }
  }

  const worldEvents = [];
  world.update(dt, worldEvents);
  for (const ev of worldEvents) {
    const [x, y] = tileCentre(ev.tx, ev.ty);
    if (ev.type === 'land') {
      G.fx.dust(x, y, TILES[ev.tile].dust, 5);
      audio.breakTile(TILES[ev.tile].voice, { big: false });
      G.cam.addShake(0.7);
      if (Math.abs(G.player.x - x) < 12 && Math.abs(G.player.y - G.player.h / 2 - y) < 16) {
        G.player.hurt(1, 0, -1, pctx, 'falling rock');
      }
      for (const e of G.enemies) if (Math.abs(e.x - x) < 14 && Math.abs(e.y - y) < 18) Enemies.hurt(e, 3, 0, 1, enemyCtx(G));
    } else if (ev.type === 'fall') {
      // The moment the ceiling lets go, not just the moment it lands.
      G.fx.dust(x, y + 6, TILES[ev.tile].dust, 3);
      audio.strike(TILES[ev.tile].voice, { stage: 3 });
    } else if (ev.type === 'flow') {
      if (TILES[ev.tile].liquid && G.rand.f() < 0.35) {
        if (ev.tile === T.MAGMA) G.fx.ember(x, y); else G.fx.drip(x, y - 6);
      }
    }
  }

  const ectx = enemyCtx(G);
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy > 460 * 460) continue;           // sleep far-away creatures
    Enemies.update(e, dt, ectx);
    if (isGone(e)) G.enemies.splice(i, 1);
  }

  updateBombs(G, dt);

  G.loot.update(dt, world, p, {
    weight: G.weight,
    collect: (o) => {
      if (o.kind === 'oil') {
        p.refillLight(28); audio.pickup('oil', 0);
        G.fx.popup(o.x, o.y, '+LIGHT', '#ffcf8a', {});
        return true;
      }
      if (!tryTake(G, o.kind, o.value, o.x, o.y)) {
        if (G.t - G.bagWarned > 3) {
          G.bagWarned = G.t;
          msg(G, 'BAG FULL - THAT IS NOT WORTH WHAT YOU ARE CARRYING', '#ff5a4a');
          audio.danger('bagfull');
        }
        return false;
      }
      if (!G.tutorialShown.firstOre) {
        G.tutorialShown.firstOre = 1;
        msg(G, 'E AT THE LIFT TO BANK IT - NOTHING COUNTS UNTIL YOU SURFACE', '#7ff0a0');
      }
      p.pickupStreak = Math.min(24, p.pickupStreak + 1);
      p.pickupStreakT = 1.2;
      audio.pickup(o.kind, p.pickupStreak);
      fxValue(G.fx, o.x, o.y, o.value, o.kind === 'relic' ? '#e8b878' : o.kind === 'gem' ? '#b07ff0' : '#ffd867');
      if (o.kind === 'relic') G.cam.addShake(2);
      return true;
    },
  });

  // depth + lighting window
  const ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);
  G.depth = world.stratum.top + pty;
  G.runMaxDepth = Math.max(G.runMaxDepth, G.depth);
  G.maxDepth = Math.max(G.maxDepth, G.depth);

  // A sonar ping permanently reveals what it swept. Doing this here rather than in the draw
  // pass makes it depend on time rather than on how many frames happened to be rendered.
  if (G.sonar.t > 0 && !G.sonarMapped) {
    G.sonarMapped = true;
    const tx0 = Math.floor(G.sonar.x / TS), ty0 = Math.floor(G.sonar.y / TS);
    for (let dy = -15; dy <= 15; dy++) for (let dx = -15; dx <= 15; dx++) {
      if (dx * dx + dy * dy > 225) continue;
      const sx = tx0 + dx, sy = ty0 + dy;
      if (sx < 0 || sy < 0 || sx >= world.w || sy >= world.h) continue;
      // Only the seams and cavities the pulse actually draws. Marking all 700 tiles seen would
      // turn one charge into a permanent minimap, and darkness is the compositional tool.
      const id = world.mat[sy * world.w + sx];
      if (id === T.ORE_GOLD || id === T.ORE_GEM || id === T.CRYSTAL || id === T.RELIC) {
        world.seen[sy * world.w + sx] = 255;
      }
    }
  }
  if (G.sonar.t <= 0) G.sonarMapped = false;

  const lanternReach = (p.lanternR) * (0.35 + 0.65 * (p.light / p.lightMax)) * (p.dim ? 0.55 : 1);
  const sources = [ptx, Math.floor((p.y - p.h * 0.8) / TS), Math.max(2.4, lanternReach)];
  for (const b of G.bombs) sources.push(Math.floor(b.x / TS), Math.floor(b.y / TS), 4);
  const margin = 6;
  const x0 = Math.floor(G.cam.ix / TS) - margin, y0 = Math.floor(G.cam.iy / TS) - margin;
  const x1 = Math.floor((G.cam.ix + VW) / TS) + margin, y1 = Math.floor((G.cam.iy + VH) / TS) + margin;
  const amb = G.strataIdx === 0 ? world.stratum.ambient * clamp(1 - pty / 9, 0, 1) : world.stratum.ambient;
  G.lf.compute(x0, y0, x1, y1, sources, amb);

  // danger + tension
  let nearest = 999;
  for (const e of G.enemies) nearest = Math.min(nearest, Math.hypot(e.x - p.x, e.y - p.y));
  const haulRatio = clamp(G.haul / bigHaulRef(G), 0, 1);
  G.danger = damp(G.danger, clamp((1 - nearest / 200) * 0.8 + (p.hp <= 2 ? 0.4 : 0), 0, 1), 3, dt);
  G.vignette = damp(G.vignette, clamp(0.18 + (1 - p.light / p.lightMax) * 0.5 + (p.hp <= 2 ? 0.22 : 0), 0, 0.85), 2.5, dt);
  audio.update(dt, {
    depth: G.depth, danger: G.danger, haulRatio, lightRatio: p.light / p.lightMax,
    stratum: G.strataIdx, alive: !p.dead,
  });

  G.aim = p.aim;
  G.cam.follow(p, dt, world);

  // proximity to the shaft / elevator
  // Generous: the rig is a place, not a pixel. Standing anywhere on the platform counts.
  G.shaft.near = null;
  const shaftPx = world.shaftTX * TS + TS / 2, shaftPy = (world.shaftTY + 1) * TS;
  if (Math.abs(p.x - shaftPx) < 34 && Math.abs(p.y - shaftPy) < 34) G.shaft.near = 'shaft';
  const entPx = world.entryTX * TS + TS / 2, entPy = (world.entryTY + 1) * TS;
  if (Math.abs(p.x - entPx) < 34 && Math.abs(p.y - entPy) < 34) G.shaft.near = 'entry';

  if (G.shaft.near && input.pressed('interact') && !p.dead && G.uiLock <= 0) {
    if (G.shaft.near === 'entry') {
      // Enter is the key that just started the run. Riding the lift up with nothing in the bag
      // is not a thing anyone means to do, and there is no prompt offering it.
      if (G.haul <= 0) return;
      bankRun(G, 'walked out');
      msg(G, 'EXTRACTED', '#7ff0a0');
    } else {
      G.mode = 'shaft';
      G.shaft.open = true;
      G.shaft.choice = G.strataIdx < STRATA.length - 1 ? 1 : 0;
      audio.ui('open');
    }
  }
  if (p.beacon && !p.beaconUsed && input.pressed('abandon') && !p.dead) {
    p.beaconUsed = true;
    bankRun(G, 'beacon');
    msg(G, 'BEACON FIRED', '#7ff0a0');
  }
}

function updateShaft(G, dt, input) {
  const last = STRATA.length - 1;
  if (input.pressed('up')) { G.shaft.choice = 0; audio.ui('move'); }
  if (input.pressed('down') && G.strataIdx < last) { G.shaft.choice = 1; audio.ui('move'); }
  // Pointer: the two option panels drawn by hud.drawShaftPrompt. Tap to pick, tap again to
  // commit — a touch player otherwise has no way to end a run at all.
  if (input.mpressed || input.touch._ptap) {
    const mx = input.mx, my = input.my;
    const oy = 24 + 74;
    if (my >= oy && my <= oy + 54) {
      const pick = mx < VW / 2 ? 0 : 1;
      if (pick === 1 && G.strataIdx >= last) { audio.ui('deny'); return; }
      if (pick !== G.shaft.choice) { G.shaft.choice = pick; audio.ui('move'); return; }
      confirmShaft(G);
      return;
    }
  }
  if (input.pressed('cancel')) { G.mode = 'run'; G.shaft.open = false; audio.ui('close'); }
  if (input.pressed('interact') || input.pressed('confirm')) confirmShaft(G);
}

function confirmShaft(G) {
  {
    G.shaft.open = false;
    if (G.shaft.choice === 0) {
      bankRun(G, 'took the lift');
      msg(G, 'EXTRACTED', '#7ff0a0');
    } else {
      G.mode = 'run';
      const next = G.strataIdx + 1;
      // The winch house keeps a grinding wheel, but it is not a new pick. A deep run still
      // arrives at the bottom with a blunt tool, which is the point.
      G.player.tool = Math.min(G.player.toolMax, G.player.tool + G.player.toolMax * 0.45);
      enterStratum(G, next);
      const s = STRATA[next];
      learn(G, 'depth');       // before the banner: G.callout is a single slot
      callout(G, 'STRATUM ' + s.roman, s.name + ' - ' + s.tagline, '#ff9b2e', 2);
      msg(G, G.world.hint, '#8a8496');
    }
  }
}
