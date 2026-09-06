// Pickups, world props and HUD icons.
//
// Rows are written as one string per frame with '/' between rows; S() pads every row to the
// widest one, so a miscounted character can never silently shift a sprite.

import { P } from './pal.js';

function S(ox, oy, fps, pal, frames, loop) {
  const all = frames.map(f => f.split('/'));
  const w = Math.max.apply(null, all.map(rows => Math.max.apply(null, rows.map(r => r.length))));
  const h = Math.max.apply(null, all.map(rows => rows.length));
  return {
    ox, oy, fps, loop: loop !== false, pal,
    frames: all.map(rows => {
      const out = rows.map(r => r + '.'.repeat(w - r.length));
      while (out.length < h) out.push('.'.repeat(w));
      return out;
    }),
  };
}

// ── pickups ──────────────────────────────────────────────────────────────────
const GOLD = { '#': P.GOLD0, a: P.GOLD1, b: P.GOLD2, c: P.GOLD3, d: P.GOLD4, e: P.GOLD5 };

export const ITEM_NUGGET = S(4, 8, 12, GOLD, [
  '.........' + '/..#####../.#ddcc#../.#dccbb#./.#ccbba#./..#bba#../...###.../.........',
  '.........' + '/..####.../.#dcc#..../#dccbb#../#ccbbba#./.#bbaa#.../..####..../.........',
  '.........' + '/...###..../..#dcc#../.#dccbb#./.#cbbaa#./.#bbaa#../..####.../.........',
  '.........' + '/..#####../.#edcc#../.#dccb#../.#cbba#../..#ba#.../...##..../.........',
]);

export const ITEM_GEM = S(4, 10, 10, { '#': P.GEM0, a: P.GEM1, b: P.GEM2, c: P.GEM3, d: P.GEM4, e: P.GEM5 }, [
  '....#..../...#e#.../..#dcd#../.#dcbcd#./#dcbabcd#/.#cbabc#./.#bab#.../..#a#..../...#....',
  '....#..../...#e#.../..#ded#../.#dcbcd#./#ecbabce#/.#cbabc#./.#bab#.../..#b#..../...#....',
  '....#..../...#d#.../..#dcd#../.#ccbcc#./#dcbabcd#/.#cbabc#./.#aba#.../..#a#..../...#....',
  '....#..../...#e#.../..#ece#../.#dcbcd#./#dcbebcd#/.#cbabc#./.#bab#.../..#a#..../...#....',
]);

export const ITEM_SHARD = S(3, 6, 14, { '#': P.CYAN0, a: P.CYAN2, b: P.CYAN3, c: P.CYAN4, d: P.CYAN5 }, [
  '...#.../..#c#../.#cbc#./#cbabc#/.#bab#./..#a#../...#...',
  '...#.../..#d#../.#cbc#./#dbabd#/.#aba#./..#b#../...#...',
  '..##.../.#cb#../.#bab#./.#abc#./..#b#../..#a#../..#....',
  '...#.../..#c#../.#dbd#./#cbabc#/.#bab#./..#b#../...#...',
]);

export const ITEM_BONE = S(4, 6, 6, { '#': P.BONE0, a: P.BONE1, b: P.BONE2, c: P.BONE3, d: P.BONE4 }, [
  '.##...##./#dc#.#dc#/#cbbbbbc#/.#cbbbc#./#cb#.#bc#/.##...##.',
  '.##...##./#dc#.#dd#/#cbbabbc#/.#bbabb#./#cb#.#bc#/.##...##.',
]);

export const ITEM_RELIC = S(6, 12, 8, {
  '#': P.INK, a: P.COPP0, b: P.COPP1, c: P.COPP2, d: P.COPP3, e: P.COPP4, g: P.GOLD4, v: P.GEM4, w: P.GEM5,
}, [
  '.....#.......' + '/....#g#....../...#dgd#...../..#cdgdc#..../.#bcdgdcb#.../#abcdvdcba#./.#bcdwdcb#.../..#cdvdc#..../...#bdb#...../....#a#....../.....#.......',
  '.....#.......' + '/....#g#....../...#ege#...../..#cdgdc#..../.#bcdgdcb#.../#abcdwdcba#./.#bcdvdcb#.../..#cdwdc#..../...#bdb#...../....#a#....../.....#.......',
  '.....#.......' + '/....#e#....../...#dgd#...../..#cdgdc#..../.#bcegecb#.../#abcdvdcba#./.#bcdwdcb#.../..#cdvdc#..../...#cdc#...../....#b#....../.....#.......',
  '.....#.......' + '/....#g#....../...#dgd#...../..#cdedc#..../.#bcdgdcb#.../#abcewecba#./.#bcdvdcb#.../..#cdvdc#..../...#bdb#...../....#a#....../.....#.......',
]);

export const ITEM_OIL = S(4, 10, 4, { '#': P.STEEL0, a: P.STEEL2, b: P.GOLD1, c: P.GOLD3, L: P.LANTERN, w: P.GOLD5 }, [
  '...###.../...#a#..../..#aaa#.../.#LLLLL#../#LLwLLLL#/#LcLLLLc#/#LcccccL#/.#bcccb#./..#bbb#../...###...',
  '...###.../...#a#..../..#aaa#.../.#LLLLL#../#LLLLwLL#/#LcLLLLc#/#LccwccL#/.#bcccb#./..#bbb#../...###...',
]);

// ── HUD icons ────────────────────────────────────────────────────────────────
const HEART = { '#': P.INK, a: P.FLSH4, b: P.FLSH3, X: P.FLSH2, d: P.UI_DARK };

export const ICON_HEART = S(0, 0, 3, HEART, [
  '..##.##../.#aaXbb#./#aabXbbb#/#abbbbbb#/.#bbbbb#./..#bbb#../...#b#..../....#....',
  '..##.##../.#aaXbb#./#aabXbbb#/#abbbbbb#/.#bbbbb#./..#bbb#../...#b#..../....#....',
]);
export const ICON_HEART_HALF = S(0, 0, 1, HEART, [
  '..##.##../.#aaX.d#./#aabX..d#/#abbb..d#/.#bbb.d#./..#bb.d../...#d..../....#....',
]);
export const ICON_HEART_EMPTY = S(0, 0, 1, HEART, [
  '..dd.dd../.d...d.d./d.......d/d.......d/.d.....d./..d...d.../...d.d..../....d....',
]);

export const ICON_LANTERN = S(0, 0, 4, { '#': P.STEEL1, a: P.STEEL3, L: P.LANTERN, l: P.GOLD3, w: P.GOLD5 }, [
  '...#.#.../...###..../..#aaa#../.#LlllL#./.#LlwlL#./.#LllwL#./.#LlllL#./.#LlllL#./..#aaa#../...###.../..#...#..',
  '...#.#.../...###..../..#aaa#../.#LllwL#./.#LlllL#./.#LwllL#./.#LlllL#./.#LlllL#./..#aaa#../...###.../..#...#..',
]);

export const ICON_BAG = S(0, 0, 1, { '#': P.INK, a: P.LEATH0, b: P.LEATH1, c: P.LEATH2, g: P.GOLD4 }, [
  '..##...##../.#cc#.#cc#./#bcccccccb#/#bbbbbbbbb#/#bbgbbbgbb#/#abbbbbbba#/#aabbbbbaa#/.#aaaaaaa#./..#######../...........',
]);

export const ICON_PICK = S(0, 0, 1, { '#': P.INK, a: P.STEEL1, b: P.STEEL2, c: P.STEEL3, d: P.STEEL4, h: P.LEATH1, j: P.LEATH2 }, [
  '.##.....##./#cb#...#bc#/#dcb#.#bcd#/.#dcbbbcd#./..#dcbcd#../...#hjh#.../...#hjh#.../...#hjh#.../...#hjh#.../...#hjh#.../....###....',
]);

export const ICON_BOMB = S(0, 0, 6, { '#': P.INK, a: P.ROCK2, b: P.ROCK4, s: P.MAG4, w: P.MAG5, h: P.LEATH1 }, [
  '.....#.../....#h#../...#h#.../..#####../.#bbbbb#./#babbbbb#/#baaabbb#/#baaabbb#/.#aaaaa#./..#####..',
  '....w#w../...w#h#../...#h#.../..#####../.#bbbbb#./#babbbbb#/#baaabbb#/#baaabbb#/.#aaaaa#./..#####..',
]);

export const ICON_SONAR = S(0, 0, 6, { '#': P.CYAN2, a: P.CYAN4, b: P.CYAN5 }, [
  '....##..../...#..#.../..#....#../.#..##..#./#..#bb#..#/#..#bb#..#/.#..##..#./..#....#../...#..#.../....##....',
  '....aa..../...a..a.../..a....a../.a..bb..a./a..abba..a/a..abba..a/.a..bb..a./..a....a../...a..a.../....aa....',
]);

export const ICON_DEPTH = S(0, 0, 1, { '#': P.INK, a: P.STEEL2, b: P.STEEL3, c: P.STEEL4 }, [
  '..#c#../..#b#../..#b#../..#b#../.#bcb#./#bbcbb#/.#bbb#./..###../...#...',
]);

export const ICON_COMBO = S(0, 0, 1, { '#': P.GOLD1, a: P.GOLD3, b: P.GOLD4, c: P.GOLD5 }, [
  '....#..../.#..a..#./..#.a.#../...#b#.../#aabcbaa#/...#b#..../..#.a.#../.#..a..#./....#....',
]);

export const CURSOR = S(5, 5, 4, { '#': P.UI_WHITE, a: P.UI_BONE }, [
  '###.....###/#a.......a#/#.........#/.........../.........../.........../.........../#.........#/#a.......a#/###.....###/...........',
  '.aaa...aaa./.a.......a./.........../.........../.........../.........../.........../.........../.a.......a./.aaa...aaa./...........',
]);

export const ARROW_UP = S(4, 3, 1, { '#': P.UI_WHITE, a: P.UI_BONE }, [
  '....#..../...###.../..#####../.#######./###...###/.a.....a./.........',
]);
export const ARROW_DOWN = S(4, 3, 1, { '#': P.UI_WHITE, a: P.UI_BONE }, [
  '.........' + '/.a.....a./###...###/.#######./..#####../...###.../....#....',
]);

export const VEIN_ARROW = S(4, 4, 12, { '#': P.GOLD2, a: P.GOLD4, b: P.GOLD5 }, [
  '...#...../...##..../#####a.../#####ba../#####a.../...##..../...#...../........./.........',
  '....#..../....##.../.####a.../.####ba../.####a.../....##.../....#..../........./.........',
  '.....#.../.....##../..###a.../..###ba../..###a.../.....##../.....#.../........./.........',
]);

// ── the two big props, built rather than typed ───────────────────────────────
// Straight timber, chains and plate are repetition; writing them as loops keeps them exact and
// lets the frames differ only where they should (the swaying lantern, the glow from below).
function elevatorFrames(lampPhase) {
  const W = 30, H = 40;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };

  // cable running up out of frame
  for (let y = 0; y < 8; y++) { set(14, y, 'i'); set(15, y, 'I'); }
  // headframe: two legs and a cross-brace
  for (let y = 8; y < 34; y++) { rect(3, y, 4, y, y % 4 === 0 ? 'W' : 'w'); rect(25, y, 26, y, y % 4 === 0 ? 'W' : 'w'); }
  rect(3, 8, 26, 9, 'W');
  rect(3, 18, 26, 18, 'w');
  for (let i = 0; i < 22; i++) { set(4 + i, 10 + (i % 8), 'w'); set(25 - i, 10 + (i % 8), 'w'); }
  // winch drum
  rect(11, 9, 18, 13, 'i'); rect(12, 10, 17, 12, 'I'); set(14, 11, 'S'); set(15, 11, 'S');
  // platform
  rect(6, 33, 23, 34, 'W');
  for (let x = 6; x <= 23; x += 3) rect(x, 33, x, 34, 'w');
  rect(5, 35, 24, 35, 'i');
  // hanging lantern
  const ly = 20 + lampPhase;
  set(21, 19, 'i');
  rect(20, ly, 22, ly + 2, 'i');
  set(21, ly + 1, 'L');
  set(20, ly + 1, 'l'); set(22, ly + 1, 'l');
  return g.map(r => r.join(''));
}

export const ELEVATOR = S(15, 39, 3,
  { w: P.LEATH1, W: P.LEATH2, i: P.STEEL1, I: P.STEEL3, S: P.STEEL4, L: P.LANTERN, l: P.GOLD3 },
  [elevatorFrames(0).join('/'), elevatorFrames(1).join('/')]);

function shaftFrames(glow) {
  const W = 30, H = 40;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };

  // winch frame over the hole
  rect(4, 12, 5, 30, 'i'); rect(24, 12, 25, 30, 'i');
  rect(4, 11, 25, 12, 'I');
  rect(11, 12, 18, 16, 'i'); rect(12, 13, 17, 15, 'I');
  // chains going down into it
  for (let y = 17; y < 34; y++) { set(12, y, y % 2 ? 'i' : 'I'); set(17, y, y % 2 ? 'I' : 'i'); }
  // iron plate collar, then the hole
  rect(3, 30, 26, 32, 'I');
  rect(3, 33, 26, 34, 'i');
  rect(6, 33, 23, 39, 'k');           // the mouth
  rect(7, 34, 22, 39, 'K');
  // the glow from below — this is the thing that makes it read as a mouth, not a hatch
  const gy = 36 - glow;
  rect(9, gy, 20, gy + 1, glow > 1 ? 'c' : 'b');
  rect(12, gy + 1, 17, gy + 2, glow > 1 ? 'd' : 'c');
  // rivets
  for (let x = 4; x <= 25; x += 4) { set(x, 31, 'S'); set(x, 34, 'S'); }
  return g.map(r => r.join(''));
}

export const SHAFT_RIG = S(15, 39, 4,
  { i: P.STEEL1, I: P.STEEL3, S: P.STEEL4, k: P.VOID, K: P.INK, b: P.CYAN1, c: P.CYAN2, d: P.CYAN3 },
  [shaftFrames(0).join('/'), shaftFrames(1).join('/'), shaftFrames(2).join('/')]);

export const CRATE = S(7, 11, 1, { '#': P.LEATH0, a: P.LEATH1, b: P.LEATH2, i: P.STEEL1 }, [
  '##############/#abaaaabaaaab#/#abaaaabaaaab#/#iiiiiiiiiiii#/#abaaaabaaaab#/#abaaaabaaaab#/#abaaaabaaaab#/#iiiiiiiiiiii#/#abaaaabaaaab#/#abaaaabaaaab#/##############/..............',
]);

export const SIGN = S(6, 13, 1, { '#': P.LEATH0, a: P.LEATH1, b: P.LEATH2, t: P.UI_BONE }, [
  '.##########./#bbbbbbbbbb#/#btttttttb#./#bttbbbttb#./#btttttttb#./#bttbbbttb#./#btttttttb#./#bbbbbbbbbb#/.####aa####./.....aa...../.....aa...../....#aa#..../....####....',
]);

export const SKULL_PROP = S(6, 9, 1, { '#': P.BONE0, a: P.BONE1, b: P.BONE2, c: P.BONE3, h: P.HELM1, k: P.VOID }, [
  '..hhhhhh..../.hhhhhhhh.../#ccccccccc#./#ckkcckkcc#./#ckkcckkcc#./#cbbbbbbbc#./.#cbabab c#/..#ccccc#../...######...',
]);

export const LANTERN_PROP = S(4, 11, 3, { '#': P.STEEL1, a: P.STEEL3, L: P.LANTERN, w: P.GOLD5 }, [
  '..##..../..#a#.../.######./.#LLLL#./.#LwLL#./.#LLLL#./.#LLLL#./.######./..####../..#..#../..#..#..',
  '..##..../..#a#.../.######./.#LLLL#./.#LLwL#./.#LLLL#./.#LLLL#./.######./..####../..#..#../..#..#..',
]);

export const BEACON = S(6, 15, 8, { '#': P.STEEL1, a: P.STEEL3, g: P.UI_GOOD, w: P.CYAN5 }, [
  '....#.....' + '/...#g#..../..#ggg#.../.#ggggg#../.#gwwwg#../.#ggggg#../..#ggg#.../...###..../...#a#..../...#a#..../..#aaa#.../.#aaaaa#../.#######../..#####.../...###....',
  '....#.....' + '/....#...../...#g#..../..#ggg#.../..#ggg#.../...#g#..../....#...../...###..../...#a#..../...#a#..../..#aaa#.../.#aaaaa#../.#######../..#####.../...###....',
  '....w.....' + '/...wgw..../..wgggw.../.wgggggw../.wgwwwgw../.wgggggw../..wgggw.../...###..../...#a#..../...#a#..../..#aaa#.../.#aaaaa#../.#######../..#####.../...###....',
]);

export const ITEM_ART = {
  nugget: ITEM_NUGGET, gem: ITEM_GEM, shard: ITEM_SHARD,
  bone: ITEM_BONE, relic: ITEM_RELIC, oil: ITEM_OIL,
};

export const PROP_ART = {
  elevator: ELEVATOR, shaft: SHAFT_RIG, crate: CRATE, sign: SIGN,
  skull: SKULL_PROP, lantern: LANTERN_PROP, beacon: BEACON,
};
