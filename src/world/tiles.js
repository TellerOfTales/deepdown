// The tile table. This is the single source of truth for material identity —
// GDD §13: "Each material must have a distinct tactile identity."
//
// Every field below is a FEEL decision, not a balance number:
//   hp     — how many fracture units before it pops (how long the THUNK→CRACK→POP arc lasts)
//   power  — minimum strike power that can hurt it at all (teaches heavy/crit/upgrades)
//   voice  — which audio voice plays (GDD §21: sound IS the information system)
//   shear  — breaking one tile propagates the break along its bed (slate)
//   chain  — a break spills damage into already-cracked neighbours of the same family
//   loose  — unsupported tiles fall
//   emit   — light emitted (0..1); accent materials light themselves so they read from far away

import { P } from '../art/pal.js';

export const T = {
  AIR: 0, DIRT: 1, GRAVEL: 2, STONE: 3, SLATE: 4, GRANITE: 5, BEDROCK: 6,
  ORE_GOLD: 7, ORE_GEM: 8, CRYSTAL: 9, BONE: 10, RUIN: 11, RELIC: 12,
  ROOT: 13, WATER: 14, MAGMA: 15, MIMIC: 16, GLOWCAP: 17, SUPPORT: 18,
};

const def = (o) => Object.assign({
  name: '?', hp: 3, power: 1, voice: 'stone', solid: true, diggable: true,
  liquid: false, loose: false, emit: 0, opacity: 0.62, fam: 'stone',
  value: 0, item: null, shear: 0, chain: 0, dust: P.ROCK3, hazard: 0,
  spark: false, mass: 1,
}, o);

export const TILES = [];
TILES[T.AIR] = def({ name: 'Air', solid: false, diggable: false, opacity: 0.045, fam: 'air', hp: 0 });

TILES[T.DIRT] = def({
  name: 'Topsoil', hp: 2, power: 0, voice: 'dirt', fam: 'dirt',
  dust: P.DIRT3, opacity: 0.55, mass: 0.8,
});
TILES[T.GRAVEL] = def({
  name: 'Loose Gravel', hp: 2, power: 0, voice: 'gravel', fam: 'gravel',
  dust: P.GRAV3, loose: true, opacity: 0.5, mass: 0.9,
});
TILES[T.STONE] = def({
  name: 'Stone', hp: 4, power: 1, voice: 'stone', fam: 'stone', dust: P.STON3,
});
TILES[T.SLATE] = def({
  // Slate SHEARS. Break one plate and the whole bed lets go sideways.
  name: 'Slate', hp: 4, power: 1, voice: 'slate', fam: 'slate', dust: P.SLAT3, shear: 5,
});
TILES[T.GRANITE] = def({
  // Needs a heavy or a crit until you buy the Reinforced Pick. Sparks when you're too weak.
  name: 'Granite', hp: 7, power: 2, voice: 'granite', fam: 'granite', dust: P.GRAN4,
  spark: true, opacity: 0.72, mass: 1.4,
});
TILES[T.BEDROCK] = def({
  name: 'Bedrock', hp: 999, power: 99, diggable: false, voice: 'granite',
  fam: 'bedrock', dust: P.ROCK1, opacity: 0.95,
});

TILES[T.ORE_GOLD] = def({
  name: 'Gold Seam', hp: 5, power: 1, voice: 'metal', fam: 'gold', dust: P.GOLD3,
  value: 46, item: 'nugget', emit: 0, chain: 3,   // metal does not glow; the flecks are the clue
});
TILES[T.ORE_GEM] = def({
  name: 'Gem Pocket', hp: 6, power: 1, voice: 'crystal', fam: 'gem', dust: P.GEM4,
  value: 165, item: 'gem', emit: 0.30, chain: 3,
});
TILES[T.CRYSTAL] = def({
  // Rings like a struck glass. Chains hard through a cluster — the single best "AGAIN" tile.
  name: 'Resonant Crystal', hp: 4, power: 1, voice: 'crystal', fam: 'cyan', dust: P.CYAN4,
  value: 22, item: 'shard', emit: 0.46, chain: 6, opacity: 0.28,
});
TILES[T.BONE] = def({
  name: 'Fossil Bone', hp: 3, power: 1, voice: 'bone', fam: 'bone', dust: P.BONE3,
  value: 9, item: 'bone', chain: 2,
});
TILES[T.RUIN] = def({
  name: 'Masonry', hp: 7, power: 2, voice: 'metal', fam: 'ruin', dust: P.RUIN4,
  value: 4, opacity: 0.8, mass: 1.3,
});
TILES[T.RELIC] = def({
  name: 'Buried Relic', hp: 9, power: 1, voice: 'metal', fam: 'relic', dust: P.COPP3,
  value: 520, item: 'relic', emit: 0.34,
});
TILES[T.ROOT] = def({
  name: 'Damp Root', hp: 1, power: 0, voice: 'root', fam: 'root', dust: P.ROOT3,
  opacity: 0.30, mass: 0.3,
});
TILES[T.WATER] = def({
  name: 'Water', hp: 0, power: 99, solid: false, diggable: false, liquid: true,
  voice: 'water', fam: 'water', dust: P.WAT4, opacity: 0.16, emit: 0.02,
});
TILES[T.MAGMA] = def({
  name: 'Magma', hp: 0, power: 99, solid: false, diggable: false, liquid: true,
  voice: 'magma', fam: 'magma', dust: P.MAG4, opacity: 0.10, emit: 0.85, hazard: 2,
});
TILES[T.MIMIC] = def({
  // Reads as a gold seam until you notice the flecks are too regular and the hue is a touch green.
  name: 'Gold Seam', hp: 5, power: 1, voice: 'metal', fam: 'mimic', dust: P.GOLD2,
  value: 0, emit: 0,   // must be indistinguishable from ORE_GOLD
});
TILES[T.GLOWCAP] = def({
  name: 'Glowcap', hp: 1, power: 0, voice: 'root', fam: 'fungus', dust: P.FUNG2,
  emit: 0.55, opacity: 0.22, item: 'oil', mass: 0.2,
});
TILES[T.SUPPORT] = def({
  name: 'Old Support', hp: 3, power: 0, voice: 'wood', fam: 'ruin', dust: P.LEATH2, mass: 0.5,
});

for (let i = 0; i < TILES.length; i++) if (!TILES[i]) TILES[i] = TILES[T.STONE];

export const isSolid = (t) => TILES[t].solid;
export const isAir = (t) => t === T.AIR;
export const isLiquid = (t) => TILES[t].liquid;
export const isDiggable = (t) => TILES[t].diggable;

/** Decoration layer: the clue grammar (GDD §7). Painted ON TOP of a tile face. */
export const D = {
  NONE: 0,
  FLECK_FAINT: 1,   // gold: a vein is somewhere near
  FLECK_RICH: 2,    // gold: the vein is adjacent
  HAIRLINE: 3,      // cavern: hollow behind this face
  AIRFLOW: 4,       // cavern: air is moving through
  DAMP: 5,          // water: condensation beading
  ROOTLET: 6,       // water: roots reach down toward it
  EDGE: 7,          // ruins: an unnaturally straight edge
  SCRATCH: 8,       // creature: something has been through here
  BONEHINT: 9,      // fossil: the skeleton continues
  GEMGLINT: 10,     // gem: colour bleeding through the rock
  HEAT: 11,         // magma: the stone is discoloured by heat
};

/** Strata definitions. Depth is in metres and 1 tile == 1 m. */
export const STRATA = [
  {
    id: 0, name: 'TOPSOIL', roman: 'I', top: 0, height: 48, w: 100,
    tint: '#2a1d16', ambient: 0.17, valueMul: 1.0, threat: 0.55,
    tagline: 'Loose ground. Old prospects. Nothing here has teeth yet.',
    music: 'calm',
  },
  {
    id: 1, name: 'SLATE BEDS', roman: 'II', top: 48, height: 60, w: 108,
    tint: '#161e2a', ambient: 0.055, valueMul: 1.95, threat: 1.0,
    tagline: 'The rock lies in sheets. It breaks the way it was laid down.',
    music: 'tense',
  },
  {
    id: 2, name: 'EMBERDEEP', roman: 'III', top: 108, height: 82, w: 116,
    tint: '#2a1410', ambient: 0.035, valueMul: 3.4, threat: 1.7,
    tagline: 'Heat in the stone. Something down here was built, and then abandoned.',
    music: 'dread',
  },
];

export const TOTAL_DEPTH = STRATA[STRATA.length - 1].top + STRATA[STRATA.length - 1].height;
