// Every "feel" number in DEEPER lives here. Tuning happens in this file and nowhere else.
// GDD Pillar 1: digging must feel good with NO progression attached — these numbers are the game.

export const TS = 16;              // tile size in px (1 tile == 1 metre)
export const VW = 480, VH = 270;   // internal render resolution (30 x 16.875 tiles)

export const CFG = {
  // ── strike rhythm ────────────────────────────────────────────────────────────
  // The whole retention engine. A strike has a recovery; near the END of recovery a
  // narrow window opens. Land the next strike inside it and you CRACK instead of thunk.
  // A strike fires the INSTANT you press, if the pick is ready. Zero input latency.
  // The skill is pressing ON THE BEAT: land the press inside a window around the moment the pick
  // becomes ready again and you get a CRITICAL FRACTURE. Press too early (mashing) and you break
  // your own rhythm; press late and you just dig normally. Nobody is ever punished for playing
  // casually — they simply dig slower and never hear the combo climb.
  strikeCooldown: 0.255,
  perfectGrace:   0.090,   // press this long BEFORE ready and it still counts (buffered)
  perfectWindow:  0.115,   // ...and this long after. ~205ms total. Generous, but not free.
  earlyLockout:   0.085,   // a too-early press stalls the pick: mashing is strictly worse
  comboDecay:     0.70,    // grace after the window closes before the combo drops
  comboMax:       40,

  heavyChargeTime: 0.42,   // hold DIG this long for a heavy strike
  heavyCooldown:   0.42,

  dmgNormal: 1.25,
  critMul:   2.0,
  heavyMul:  2.0,
  chainSpill: 0.55,        // fraction of overkill damage that spills into cracked neighbours

  // ── hitstop / camera (the punctuation marks) ─────────────────────────────────
  hitstopTap:      0.018,
  hitstopCrit:     0.055,
  hitstopBreak:    0.045,
  hitstopBigBreak: 0.10,
  hitstopDiscovery:0.30,
  shakeTap:   0.35,
  shakeCrit:  1.5,
  shakeBreak: 1.1,
  shakeHeavy: 2.6,
  shakeCollapse: 6.0,
  shakeDamage: 5.0,
  camPunch: 2.4,           // px of camera lunge toward the struck tile

  playerW: 11, playerH: 26,   // collision box: 0.7 tiles wide, 1.6 tall.
  // A sideways strike swings through the WHOLE face in front of you — it damages both tiles
  // the body occupies (full damage to the aimed row, `sideSpill` to the other). Tunnelling
  // therefore clears a person-sized hole, which is why horizontal digging feels powerful.
  sideSpill: 0.7,

  // ── movement ─────────────────────────────────────────────────────────────────
  runSpeed: 74,
  accel: 620, friction: 900, airAccel: 340,
  gravity: 560, maxFall: 300,
  jumpVel: 176, jumpCut: 0.42,
  coyote: 0.10, jumpBuffer: 0.12,
  climbSpeed: 46,          // in a chimney (both sides solid)
  fallSafe: 6.2,           // tiles you can drop without harm
  fallDmgPerTile: 0.34,

  // ── resources ────────────────────────────────────────────────────────────────
  maxHealth: 5,
  // 120 units at 0.50/s is four minutes of light on a full lantern — roughly one thorough
  // stratum. Reaching the third one means finding glowcaps, dimming the lamp (which halves the
  // drain), or buying Oil Reserve. The lantern is the expedition clock (GDD §8).
  lightMax: 120,
  lightDrain: 0.50,        // per second
  lanternRadius: 9.4,      // tiles
  carryMax: 1100,          // "grams" — treasure has weight, wealth is literally a burden
  toolMax: 100,
  toolWearTap: 0.15, toolWearHeavy: 0.55, toolWearHard: 0.55,

  // ── loot ─────────────────────────────────────────────────────────────────────
  magnetRadius: 34, magnetForce: 500, pickupRadius: 9,
  lootLife: 999,

  // ── enemies ──────────────────────────────────────────────────────────────────
  invuln: 0.85,
  knockback: 130,
};

// Value per gram is the whole inventory decision: relics 4.3, gems 2.75, shards 1.6,
// nuggets 1.35, bones 1.1. Wealth is literally a burden, and the good stuff is dense.
export const WEIGHT = { nugget: 34, gem: 60, shard: 14, bone: 8, relic: 120, oil: 0 };

/** Depth (m) -> stratum index. */
export const COLORS_RISK = ['#8a8496', '#d8d2c4', '#ffd867', '#ff9b2e', '#ff5a4a'];
