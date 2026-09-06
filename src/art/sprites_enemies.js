// DEEPER — creature sprites (First Playable).
//
// Format: see the header of ./spritesheet.js. Every frame of a sprite is the same size and
// every row is EXACTLY the declared width. '.' is transparent.
//
// ALL SPRITES FACE RIGHT. The renderer mirrors around ox for a left-facing enemy.
//
// GDD §12: an enemy must create a MINING decision, so the silhouette has to telegraph the answer
// before the player is close enough to be punished for guessing:
//   BURROWER  — armoured plates + a hook-ringed maw. "It came out of the rock." Answer: don't
//               stand on soft material; break its route or fight it in the open.
//   CRAWLER   — long legs above a flat body. "It is on the ceiling." Answer: look up, or mine
//               the ceiling out from under it.
//   STONEBACK — front half is literal rock, back half is bare meat. Answer: get behind it, get
//               above it, or drop something on it.
//   GLOWMOTH  — luminous eyespots on ragged wings. Answer: your own lantern is the bait.
//   MIMIC     — a gold seam that is a mouth. Answer: the tell is in the material, not the sprite.

import { P } from './pal.js';

// ─────────────────────────────────────────────────────────────────────────────
// BURROWER — 22×16, ox 11, oy 15.
// Segmented armoured worm: CHIT1..CHIT4 plates separated by FLSH1/FLSH2 joint gaps.
// The joint gaps travel BACKWARDS along the body across the animation — peristalsis. That is
// what sells "swimming through rock" without moving the silhouette much, and it is cheap to read
// at 16 px. The front is a radial mouth: interlocking pale BONE4 hooks around an INK maw.
// ─────────────────────────────────────────────────────────────────────────────

const BURROWER_PAL = {
  '0': P.CHIT0, '1': P.CHIT1, '2': P.CHIT2, '3': P.CHIT3, '4': P.CHIT4,
  'f': P.FLSH1, 'g': P.FLSH2, 'h': P.FLSH3,
  'k': P.BONE4, 'i': P.INK,
  'e': P.EYE, 'd': P.EYE_DIM,
};

/** Mostly submerged: only the dorsal ridge breaks the surface of the soft material. */
export const BURROWER_SWIM = {
  pal: BURROWER_PAL, ox: 11, oy: 15, fps: 10,
  frames: [
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      ".........4g444........",
      "......4443g3334g4.....",
      "...44g3332g2223g344...",
      "..433g2221g1112g2334..",
      "..000f0000f0000f0000.." ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      ".........f4444........",
      "......444g3333f44.....",
      "...4f3333g2222g3344...",
      "..43g2222g1111g22334..",
      "..00f0000f0000f00000.." ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      ".........4444f........",
      "......44f3333g444.....",
      "...f4333g2222g33344...",
      "..4g3222g1111g222334..",
      "..0f0000f0000f000000.." ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      ".........444f4........",
      "......4f4333g3444.....",
      "...4433g3222g233344...",
      "..f3322g2111g1222334..",
      "..f0000f0000f0000000.." ],
  ],
};

/** Full body out of the rock, undulating. Joint gaps travel backwards; a dorsal bump rides with them. */
export const BURROWER_MOVE = {
  pal: BURROWER_PAL, ox: 11, oy: 15, fps: 12,
  frames: [
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "..............f444....",
      ".........f4444g33343k.",
      ".....4444g3333g22e3iik",
      "...4f3333g2222g2223iki",
      "..43g2222g2222g2223iik",
      ".322g2222g2222g2223iki",
      ".000g1111g2222g22e1iik",
      "....f0000f0000g11100k.",
      "..............f000....",
      "......................" ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "............4.4444....",
      ".........4444f333343k.",
      ".....444f3333g222e3iik",
      "...f4333g2222g22223iki",
      "..4g3222g2222g22223iik",
      ".32g2222g2222g22223iki",
      ".00f1111g2222g222e1iik",
      "....0000f0000f111100k.",
      "..............0000....",
      "......................" ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "..............4444....",
      "........4444f4333343k.",
      ".....44f4333g3222e3iik",
      "...4433g3222g222223iki",
      "..f3322g2222g222223iik",
      ".3g2222g2222g222223iki",
      ".0f0111g2222g2222e1iik",
      "....000f0000f0111100k.",
      "..............0000....",
      "......................" ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "..............4444....",
      ".......4444f44333343k.",
      "....44f3333g33222e3iik",
      "...433g2222g2222223iki",
      "..4322g2222g2222223iik",
      ".f2222g2222g2222223iki",
      ".f0011g2222g22222e1iik",
      "....00f0000f00111100k.",
      "..............0000....",
      "......................" ],
  ],
};

/** Coil → extend (mouth wide, +4 px reach) → recover. Non-looping: the code holds the last frame. */
export const BURROWER_LUNGE = {
  pal: BURROWER_PAL, ox: 11, oy: 15, fps: 18, loop: false,
  frames: [
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      ".............44444....",
      "..........f4433333....",
      "......f444g33222ek....",
      "..f444g333g222222k....",
      "..g333g222g222222k....",
      "33g222g222g222222k....",
      "22g222g222g22222ek....",
      "00f111g111g1111111....",
      "..f000f000f0000000....",
      "......................" ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "...................kk.",
      "..................kiik",
      ".................kiiik",
      ".............f4egkiiik",
      ".........f444g33giiiik",
      "....f4444g333g22giiiik",
      "3333g3333g222g22giiiik",
      "0000g2222g222g22gkiiik",
      "....f0000f000g1e.kiiik",
      ".............f00..kiik",
      "...................kk." ],
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      ".............f4444....",
      "........f4444g3333.k..",
      "...f4444g3333g22e2kik.",
      "333g3333g2222g2222gik.",
      "222g2222g2222g2222kik.",
      "000g1111g1111g11e1.k..",
      "...f0000f0000f0000....",
      "......................" ],
  ],
};

/** Flinch: segments pulled apart so raw FLSH3 shows in every joint, eyes shut, hooks clenched. */
export const BURROWER_HURT = {
  pal: BURROWER_PAL, ox: 11, oy: 15, fps: 1,
  frames: [
    [ "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "......................",
      "............h4444.....",
      ".......h4444h33d3.....",
      "...h444h3333h2222k....",
      "...g333g2222g2222kk...",
      ".33g222g2222g2222hkk..",
      ".00g111g2222g22d2kk...",
      "...h000h0000g1111k....",
      "............h0000.....",
      "......................" ],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// CRAWLER — 18×14, ox 9, oy 13.
//
// ORIENTATION — READ THIS BEFORE INTEGRATING:
//   CLING, TENSE and DROP are authored CEILING-HUNG: the flat body sits in the TOP rows of the
//   frame and the six legs reach UP out of the top edge to grip the rock. The lower rows are
//   deliberately empty — that empty space IS the drop the player is about to be in.
//   Because ox/oy stay 9/13 for every state, a ceiling-hung frame draws its body roughly
//   9..13 px ABOVE the anchor. So for these three states the entity should pass the anchor as
//   (x, ceilingBottomY + 13), i.e. the anchor sits one sprite-height below the ceiling it clings
//   to. DROP then animates that anchor downward and the body falls with it, legs streaming up.
//   SCUTTLE and HURT are authored FLOOR-UP (body low, legs reaching DOWN to the anchor row),
//   so those two use the anchor as ordinary feet.
//
// The tell: eyes are EYE_DIM while clinging and snap to full EYE in TENSE. That colour step is
// the only warning the player gets, and it is a learnable rule, not noise.
// ─────────────────────────────────────────────────────────────────────────────

const CRAWLER_PAL = {
  '0': P.CHIT0, '1': P.CHIT1, '2': P.CHIT2, '3': P.CHIT3,
  'e': P.EYE, 'd': P.EYE_DIM,
};

/** Ceiling-hung. Subtle leg twitch, body pulses. */
export const CRAWLER_CLING = {
  pal: CRAWLER_PAL, ox: 9, oy: 13, fps: 6,
  frames: [
    [ "..3..1..3...1..31.",
      "...3.1...3..1.3.1.",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111dd0.",
      "...12222222222dd0.",
      "....23333333332...",
      "......333333......",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".................." ],
    [ "..3..1..3..1..3.1.",
      "...3.1...3..1.3.1.",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111dd0.",
      "...12222222222dd0.",
      "....23333333332...",
      ".......3333.......",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".................." ],
    [ "...3..1.3...1..3.1",
      "....3.1..3.1..3.1.",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111dd0.",
      "...12222222222dd0.",
      "....23333333332...",
      "......333333......",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".................." ],
    [ "..3..1..3..1..3.1.",
      "....3.1..3.1..3.1.",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111dd0.",
      "...12222222222dd0.",
      "....23333333332...",
      ".......3333.......",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".................." ],
  ],
};

/** Ceiling-hung. Legs compress, body hauls itself up, eyes go hot. This is the tell before the drop. */
export const CRAWLER_TENSE = {
  pal: CRAWLER_PAL, ox: 9, oy: 13, fps: 12,
  frames: [
    [ "...3.1..3..1..3.1.",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111ee0.",
      "...12222222222ee0.",
      "....23333333332...",
      "......333333......",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".................." ],
    [ "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111ee0.",
      "...12222222222ee0.",
      "....23333333332...",
      ".....33333333.....",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".................." ],
  ],
};

/** Falling. Legs stream upward behind the body — the shape reads as "already too late". */
export const CRAWLER_DROP = {
  pal: CRAWLER_PAL, ox: 9, oy: 13, fps: 14,
  frames: [
    [ "..................",
      ".....1.....1...1..",
      "....31...3.1.3.1..",
      "....3.1..3.1.3.1..",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111ee0.",
      "...12222222222ee0.",
      "....23333333332...",
      "......333333......",
      "..................",
      "..................",
      "..................",
      ".................." ],
    [ "..................",
      "..................",
      ".....1.....1...1..",
      "....31...3.1.3.1..",
      "....3.1..3.1.3.1..",
      "....3.1..3.1.3.1..",
      "....01111111110...",
      "...11111111111ee0.",
      "...12222222222ee0.",
      "....23333333332...",
      "......333333......",
      "..................",
      "..................",
      ".................." ],
  ],
};

/** Floor orientation. Body low and flat, six legs scrabbling; frames 1 and 3 crouch 1 px. */
export const CRAWLER_SCUTTLE = {
  pal: CRAWLER_PAL, ox: 9, oy: 13, fps: 14,
  frames: [
    [ "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "......333333......",
      "....23333333332...",
      "...12222222222ee0.",
      "...11111111111ee0.",
      "....01111111110...",
      "...3.1..3.1..3.1..",
      "..3..1.3...1..3.1.",
      ".3..1..3...1...31." ],
    [ "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "......333333......",
      "....23333333332...",
      "...12222222222ee0.",
      "...11111111111ee0.",
      "....01111111110...",
      "...3.1..3.1..3.1..",
      "..3..1.3...1..3.1." ],
    [ "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "......333333......",
      "....23333333332...",
      "...12222222222ee0.",
      "...11111111111ee0.",
      "....01111111110...",
      "....3.1..3.13..1..",
      ".....3.1..3.13..1.",
      "......3.1..31.3.1." ],
    [ "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "......333333......",
      "....23333333332...",
      "...12222222222ee0.",
      "...11111111111ee0.",
      "....01111111110...",
      "....3.1..3.13..1..",
      ".....3.1..3.13..1." ],
  ],
};

/** Floor orientation. Legs thrown wide, eyes dim. */
export const CRAWLER_HURT = {
  pal: CRAWLER_PAL, ox: 9, oy: 13, fps: 1,
  frames: [
    [ "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "......333333......",
      "....23333333332...",
      "...12222222222dd0.",
      "...11111111111dd0.",
      "....01111111110...",
      ".3..1..3..1....31.",
      "3..1..3....1....31",
      "3.1...3.....1....3" ],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// STONEBACK — 26×18, ox 13, oy 17.
//
// The whole creature is one lesson delivered in one look, so the two halves share no vocabulary:
//   FRONT (right, x≈13..25): ROCK3..ROCK6 with GRAN_SPECK flecks, a dead-straight lit top edge and
//     a flat vertical skirt. It is drawn with the same shape language as literal stone tiles —
//     the player has already learned that language from mining, so it reads as "this is rock".
//   BACK  (left,  x≈1..12): FLSH1..FLSH3, round, soft, no flecks, no straight lines, with a pale
//     FLSH4/BONE4 weak point sitting proud on top where a falling rock or a drop-attack lands.
// Nothing in between. Hitting the front should feel obviously wrong before you even try it.
// ─────────────────────────────────────────────────────────────────────────────

const STONEBACK_PAL = {
  'q': P.ROCK0, 'l': P.ROCK1, 'm': P.ROCK2, 'a': P.ROCK3, 'b': P.ROCK4, 'c': P.ROCK5, 'd': P.ROCK6,
  's': P.GRAN_SPECK,
  'f': P.FLSH1, 'g': P.FLSH2, 'h': P.FLSH3, 'w': P.FLSH4, 'p': P.BONE4,
  'e': P.EYE, 'E': P.EYE_DIM,
};

/** Slow four-beat plod. Only the legs cycle: the shell is a mass that does not bounce. */
export const STONEBACK_WALK = {
  pal: STONEBACK_PAL, ox: 13, oy: 17, fps: 8,
  frames: [
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....hwwwh...hbbbbbsbbbbcc.",
      "...hwpppwhhhgbaasaaaaaabcd",
      "..hgwwwwgggggaaaaaaaasaabc",
      "..gggggggggggaaaaaaaaaaaab",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmel",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "...fff...fff.mmmmmmmmmmmmm",
      "...ff.....ff...lll...lll..",
      "..ll......ll...ll.....ll.." ],
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....hwwwh...hbbbbbsbbbbcc.",
      "...hwpppwhhhgbaasaaaaaabcd",
      "..hgwwwwgggggaaaaaaaasaabc",
      "..gggggggggggaaaaaaaaaaaab",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmel",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "...fff...fff.mmmmmmmmmmmmm",
      "....ff...ff.....lll.lll...",
      "....ll..ll......ll...ll..." ],
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....hwwwh...hbbbbbsbbbbcc.",
      "...hwpppwhhhgbaasaaaaaabcd",
      "..hgwwwwgggggaaaaaaaasaabc",
      "..gggggggggggaaaaaaaaaaaab",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmel",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "...fff...fff.mmmmmmmmmmmmm",
      "..ff.......ff..lll...lll..",
      ".ll........ll..ll.....ll.." ],
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....hwwwh...hbbbbbsbbbbcc.",
      "...hwpppwhhhgbaasaaaaaabcd",
      "..hgwwwwgggggaaaaaaaasaabc",
      "..gggggggggggaaaaaaaaaaaab",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmel",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "...fff...fff.mmmmmmmmmmmmm",
      "...ff....ff.....lll..lll..",
      "...ll...ll.......ll..ll..." ],
  ],
};

/** Armour set down on the ground, legs gone. Frame 1 settles 1 px — a breathing "immovable" pose. */
export const STONEBACK_BRACE = {
  pal: STONEBACK_PAL, ox: 13, oy: 17, fps: 6,
  frames: [
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....hwwwh...hbbbbbsbbbbcc.",
      "...hwpppwhhhgbaasaaaaaabcd",
      "..hgwwwwgggggaaaaaaaasaabc",
      "..gggggggggggaaaaaaaaaaaab",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmel",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "..fffffffffffmmmmmmmmmmmmm" ],
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....hwwwh...hbbbbbsbbbbcc.",
      "...hwpppwhhhgbaasaaaaaabcd",
      "..hgwwwwgggggaaaaaaaasaabc",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmel",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "..fffffffffffmmmmmmmmmmmmm" ],
  ],
};

/** Head down, shell tipped forward, soft back raised: the pose that makes the weak point reachable. */
export const STONEBACK_CHARGE = {
  pal: STONEBACK_PAL, ox: 13, oy: 17, fps: 14,
  frames: [
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      "....hwwwh....dcccscccccd..",
      "...hwpppwhhhhcbsbbbbsbbcd.",
      "..hgwwwwgggggbbbbbsbbbbcc.",
      "..gggggggggggbaasaaaaaabcd",
      ".ggggggggggggaaaaaaaasaabc",
      ".fgggggggggggaaaaaaaaaaaab",
      ".ffffffffffffaaaaaaaalllll",
      "..fffffffffffaaaaaaaallmel",
      "...fff...fff.aaaaaaaallmml",
      "...ff.....ff.mmmmmmmmlllll",
      "...ll.....ll..mmmmmmmmmmm.",
      "...............lll..llll.." ],
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      "....hwwwh....dcccscccccd..",
      "...hwpppwhhhhcbsbbbbsbbcd.",
      "..hgwwwwgggggbbbbbsbbbbcc.",
      "..gggggggggggbaasaaaaaabcd",
      ".ggggggggggggaaaaaaaasaabc",
      ".fgggggggggggaaaaaaaaaaaab",
      ".ffffffffffffaaaaaaaalllll",
      "..fffffffffffaaaaaaaallmel",
      "...fff...fff.aaaaaaaallmml",
      "....ff...ff..mmmmmmmmlllll",
      "....ll...ll...mmmmmmmmmmm.",
      "..............llll.lll...." ],
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      "....hwwwh....dcccscccccd..",
      "...hwpppwhhhhcbsbbbbsbbcd.",
      "..hgwwwwgggggbbbbbsbbbbcc.",
      "..gggggggggggbaasaaaaaabcd",
      ".ggggggggggggaaaaaaaasaabc",
      ".fgggggggggggaaaaaaaaaaaab",
      ".ffffffffffffaaaaaaaalllll",
      "..fffffffffffaaaaaaaallmel",
      "...fff...fff.aaaaaaaallmml",
      "..ff......ff.mmmmmmmmlllll",
      "..ll......ll..mmmmmmmmmmm.",
      ".............lll...llll..." ],
  ],
};

/** Hit. The weak point floods pale — confirmation that the player found the right answer. */
export const STONEBACK_HURT = {
  pal: STONEBACK_PAL, ox: 13, oy: 17, fps: 1,
  frames: [
    [ "..........................",
      "..........................",
      "..........................",
      "..........................",
      "..............ddddddddd...",
      ".............dcccscccccd..",
      ".............cbsbbbbsbbcd.",
      "....ppppp...hbbbbbsbbbbcc.",
      "...ppppppphhgbaasaaaaaabcd",
      "..hppppppggggaaaaaaaasaabc",
      "..gggggggggggaaaaaaaaaaaab",
      ".ggggggggggggaaaaaaaalllll",
      ".fgggggggggggaaaaaaaallmEl",
      ".ffffffffffffaaaaaaaallmml",
      "..fffffffffffaaaaaaaalllll",
      "..fff.....fffmmmmmmmmmmmmm",
      ".ff.......ff...lll...lll..",
      "ll........ll...ll.....ll.." ],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOWMOTH — 14×12, ox 7, oy 6 (anchor is the CENTRE: it flies, it has no feet).
// Ragged GEM3/GEM4 wings, CYAN4 eyespots, a tiny FLSH0 body. The eyespots are the only cyan on
// screen that is not a crystal, which is the point: the player's lantern is what summoned it.
// ─────────────────────────────────────────────────────────────────────────────

const GLOWMOTH_PAL = {
  '2': P.GEM2, '3': P.GEM3, '4': P.GEM4, '5': P.GEM5,
  'c': P.CYAN4, 'b': P.FLSH0, 'f': P.FLSH1,
};

/** Erratic 4-beat wingbeat: closed → mid → full spread → mid, eyespots shifting as they catch light. */
export const GLOWMOTH_FLY = {
  pal: GLOWMOTH_PAL, ox: 7, oy: 6, fps: 16,
  frames: [
    [ "..............",
      "....33..33....",
      "...343..343...",
      "...3c3bb3c3...",
      "..3443bb3443..",
      "..3333ff3333..",
      "...333bb333...",
      "....33bb33....",
      ".....3bb3.....",
      "......ff......",
      "......f.......",
      ".............." ],
    [ "..............",
      "..33......33..",
      ".3443....3443.",
      ".3c43.bb.34c3.",
      ".34443bb34443.",
      ".33333ff33333.",
      "..3333bb3333..",
      "...333bb333...",
      "....33bb33....",
      "......ff......",
      "......f.......",
      ".............." ],
    [ "..............",
      "..............",
      "33..........33",
      "3443..bb..3443",
      "34c443bb344c43",
      "344443ff344443",
      ".33333bb33333.",
      "..3333bb3333..",
      "....33bb33....",
      "......ff......",
      "......f.......",
      ".............." ],
    [ "..............",
      "..33......33..",
      ".3443....3443.",
      ".34c3.bb.3c43.",
      ".34443bb34443.",
      ".33333ff33333.",
      "..3333bb3333..",
      "...333bb333...",
      "....33bb33....",
      "......ff......",
      "......f.......",
      ".............." ],
  ],
};

/** Hit: one wing crumples, the eyespots drop to GEM2 — the light goes out of it. */
export const GLOWMOTH_HURT = {
  pal: GLOWMOTH_PAL, ox: 7, oy: 6, fps: 1,
  frames: [
    [ "..............",
      "..............",
      "...22.....2...",
      "..2232bb32....",
      ".22322bb322...",
      "..2222ff222...",
      "...222bb22....",
      ".....2bb2.....",
      "......ff......",
      "......f.......",
      "..............",
      ".............." ],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// MIMIC — 16×16, ox 8, oy 15. It occupies a full tile and is drawn as a tile-sized block.
//
// DORMANT is deliberately NOT clever: it is gold on dark rock, and at a glance it is a payday.
// The honest tell lives in the tiletex generator for T.MIMIC (flecks too evenly spaced, hue a
// touch green), not in this sprite — the environment is the information, not the enemy art.
// WAKE reveals the joke in three frames: the horizontal seam is a mouth and the gold was teeth.
// ─────────────────────────────────────────────────────────────────────────────

const MIMIC_PAL = {
  'q': P.ROCK0, 'r': P.ROCK1, 'R': P.ROCK2,
  '1': P.GOLD1, '2': P.GOLD2, '3': P.GOLD3, '4': P.GOLD4,
  'f': P.FLSH1, 'g': P.FLSH2, 'i': P.INK,
  'e': P.EYE, 'd': P.EYE_DIM,
};

/** Indistinguishable from a gold seam. A branching vein in host rock, no symmetry, no face. */
export const MIMIC_DORMANT = {
  pal: MIMIC_PAL, ox: 8, oy: 15, fps: 1,
  frames: [
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rrRrrrrr1rrRrrrq",
      "rqrrr1rr21rrrrRr",
      "rrRr123332rrRrrr",
      "rr1234433321rrqr",
      "r1234433234321rr",
      "rrq123332221rrrr",
      "rrrr12211rrRrrqr",
      "rRrrrr1rrrrrrrrr",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
  ],
};

/** The seam splits, gum floods in, the gold resolves into teeth and two eyes open. Plays once. */
export const MIMIC_WAKE = {
  pal: MIMIC_PAL, ox: 8, oy: 15, fps: 14, loop: false,
  frames: [
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rrRrrrrr1rrRrrrq",
      "rqrrr1rr21rrrrRr",
      "rrRr123332rrRrrr",
      "rr1233iii3321rqr",
      "r123iiiiiii321rr",
      "rrq123iii2221rrr",
      "rrrr12211rrRrrqr",
      "rRrrrr1rrrrrrrrr",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rrRrrrrr1rrRrrrq",
      "rqrrer1re21rrrRr",
      "rr333333333333rr",
      "rrg3g3g3g3g3g3rr",
      "rriiiiiiiiiiiirr",
      "rr3g3g3g3g3g3grr",
      "rr333333333333rr",
      "rRrrrr1rrrrrrrrr",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rr3333333333333r",
      "rg3g3g3g3g3g3g3r",
      "regiiiiiiiiiiger",
      "rgiiiiiiiiiiiigr",
      "rgiiiiiiiiiiiigr",
      "regiiiiiiiiiiger",
      "rg3g3g3g3g3g3g3r",
      "rr3333333333333r",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
  ],
};

/** Snap. Frame 1 has the teeth fully interlocked — the shape a bear trap makes. */
export const MIMIC_BITE = {
  pal: MIMIC_PAL, ox: 8, oy: 15, fps: 16,
  frames: [
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rrRrrrrr1rrRrrrq",
      "rr3333333333333r",
      "rg3g3g3g3g3g3g3r",
      "regiiiiiiiiiiger",
      "rgiiiiiiiiiiiigr",
      "rg3g3g3g3g3g3g3r",
      "rr3333333333333r",
      "rRrrrr1rrrrrrrrr",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rrRrrrrr1rrRrrrq",
      "rqrer1rre1rrrRrr",
      "rr333333333333rr",
      "rr3g3g3g3g3g3grr",
      "rrg3g3g3g3g3g3rr",
      "rr333333333333rr",
      "rrrr12211rrRrrqr",
      "rRrrrr1rrrrrrrrr",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
  ],
};

/** Hit: teeth broken out to raw FLSH1/FLSH2, eyes dimmed. */
export const MIMIC_HURT = {
  pal: MIMIC_PAL, ox: 8, oy: 15, fps: 1,
  frames: [
    [ "qrrRrrrrRrrrrRrq",
      "rrRrrrqrrrRrrrrr",
      "rRrrrrrrRrrrqrrR",
      "rrrqrrRrrrrrRrrr",
      "rr3333333333333r",
      "rgfgfgfgfgfgfg3r",
      "rdgiiiiiiiiiigdr",
      "rgiiiiiiiiiiiigr",
      "rgiiiiiiiiiiiigr",
      "rdgiiiiiiiiiigdr",
      "rgfgfgfgfgfgfg3r",
      "rr3333333333333r",
      "rrrqrrrrRrrrrRrr",
      "rrRrrrrrrrqrrrrr",
      "qrrrrRrrrrrrRrrr",
      "rrrrqrrrRrrrrrrq" ],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup tables for src/entities/enemies.js
// ─────────────────────────────────────────────────────────────────────────────

/** type -> { STATE: sprite }. State keys match Enemy.state exactly. */
export const ENEMY_ART = {
  burrower:  { swim: BURROWER_SWIM, move: BURROWER_MOVE, lunge: BURROWER_LUNGE, hurt: BURROWER_HURT },
  crawler:   { cling: CRAWLER_CLING, tense: CRAWLER_TENSE, drop: CRAWLER_DROP,
               scuttle: CRAWLER_SCUTTLE, hurt: CRAWLER_HURT },
  stoneback: { walk: STONEBACK_WALK, brace: STONEBACK_BRACE, charge: STONEBACK_CHARGE,
               hurt: STONEBACK_HURT },
  glowmoth:  { fly: GLOWMOTH_FLY, hurt: GLOWMOTH_HURT },
  mimic:     { dormant: MIMIC_DORMANT, wake: MIMIC_WAKE, bite: MIMIC_BITE, hurt: MIMIC_HURT },
};

/**
 * Collision boxes in world pixels: [w, h]. Deliberately TIGHTER than the art.
 * Legs, wings, hooks and shell overhang are silhouette, not hurtbox — a player who dodges a
 * lunge by a pixel should be rewarded, not clipped by a tooth.
 */
export const HITBOX = {
  burrower:  [18, 11],
  crawler:   [14, 10],
  stoneback: [22, 14],
  glowmoth:  [10, 8],
  mimic:     [13, 13],
};

