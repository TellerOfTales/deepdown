// DEEPER master palette.
// GDD §20: "Each geological stratum receives a constrained palette with a small number of
// high-salience accent colours reserved for valuable, dangerous, or mysterious information."
//
// RULE: accent colours (GOLD_*, GEM_*, CYAN_*, MAGMA_*, DANGER) are INFORMATION.
// Never use them for decoration. If it glows, it means something.

export const P = {
  VOID:      '#06060b',
  INK:       '#0d0c13',

  // --- neutral rock ramp (the boring, safe colours) ---
  ROCK0: '#16141d', ROCK1: '#221f2b', ROCK2: '#2f2b3a', ROCK3: '#3e3849',
  ROCK4: '#4f4759', ROCK5: '#61586d', ROCK6: '#786e84',

  // --- dirt / topsoil ---
  DIRT0: '#22160f', DIRT1: '#341f14', DIRT2: '#4a2d1c', DIRT3: '#603c26', DIRT4: '#7b5133', DIRT5: '#96684a',

  // --- gravel ---
  GRAV0: '#241c15', GRAV1: '#38291d', GRAV2: '#4d3928', GRAV3: '#664c36', GRAV4: '#82644a',

  // --- stone ---
  STON0: '#1e1c26', STON1: '#2c2935', STON2: '#3c3847', STON3: '#4d4858', STON4: '#615b6c', STON5: '#7b7488',

  // --- slate (cool, layered) ---
  SLAT0: '#161c26', SLAT1: '#202a38', SLAT2: '#2c3a4c', SLAT3: '#3b4d63', SLAT4: '#4d637d', SLAT5: '#657f9b',

  // --- granite (dense, speckled) ---
  GRAN0: '#221f28', GRAN1: '#332e3c', GRAN2: '#453e50', GRAN3: '#584f65', GRAN4: '#6d6379', GRAN5: '#8c8198',
  GRAN_SPECK: '#b9aec4',

  // --- ACCENT: gold (value) ---
  GOLD0: '#4a2f0a', GOLD1: '#7a4f12', GOLD2: '#ab741d', GOLD3: '#e0a52e', GOLD4: '#ffd867', GOLD5: '#fff3c0',

  // --- ACCENT: gem / violet (rare value, mystery) ---
  GEM0: '#1d1236', GEM1: '#331f5c', GEM2: '#4f2f8c', GEM3: '#7a4fc0', GEM4: '#b07ff0', GEM5: '#e6ccff',

  // --- ACCENT: crystal / cyan (resonance, discovery) ---
  CYAN0: '#0b2a33', CYAN1: '#134a55', CYAN2: '#1d7a80', CYAN3: '#33b3ae', CYAN4: '#7ff0dd', CYAN5: '#d5fff6',

  // --- ACCENT: magma (danger) ---
  MAG0: '#2b0b06', MAG1: '#5e170a', MAG2: '#9c2b0e', MAG3: '#e05a14', MAG4: '#ff9b2e', MAG5: '#ffe08a',

  // --- water ---
  WAT0: '#08202f', WAT1: '#0f3d5c', WAT2: '#1a6591', WAT3: '#2e97c4', WAT4: '#63cbe8', WAT5: '#b6f0ff',

  // --- organic: bone, root, fungus ---
  BONE0: '#3a3428', BONE1: '#5c5442', BONE2: '#847a60', BONE3: '#aea283', BONE4: '#d9cfb2',
  ROOT0: '#12240f', ROOT1: '#1e3d1c', ROOT2: '#2f6130', ROOT3: '#478a45', ROOT4: '#6fbb5e',
  FUNG0: '#1a3a2e', FUNG1: '#2c6a52', FUNG2: '#4fb488', FUNG3: '#9cf0c4',

  // --- ruins / metal ---
  RUIN0: '#1c1b22', RUIN1: '#2e2d36', RUIN2: '#43414d', RUIN3: '#5c5966', RUIN4: '#7d7a89', RUIN5: '#a3a0b0',
  COPP0: '#3d2415', COPP1: '#6b3f22', COPP2: '#9c6034', COPP3: '#c98a4e', COPP4: '#e8b878',

  // --- creatures ---
  FLSH0: '#241119', FLSH1: '#43202f', FLSH2: '#6b3348', FLSH3: '#a44a63', FLSH4: '#d97b7b',
  CHIT0: '#1a1620', CHIT1: '#2b2434', CHIT2: '#413650', CHIT3: '#5c4c6e', CHIT4: '#7d6a91',
  EYE:   '#ff4d5e', EYE_DIM: '#a8232f',

  // --- player ---
  SKIN0: '#7a4530', SKIN1: '#b9724b', SKIN2: '#e2a074',
  CLOTH0: '#1b2b3a', CLOTH1: '#2b445c', CLOTH2: '#3f6180',
  LEATH0: '#3a2415', LEATH1: '#5c3a20', LEATH2: '#82552f',
  STEEL0: '#31303a', STEEL1: '#4c4a58', STEEL2: '#6f6d7d', STEEL3: '#9a97a8', STEEL4: '#c8c5d4',
  HELM0: '#6b4a10', HELM1: '#a5761c', HELM2: '#dba62d',

  // --- UI ---
  UI_WHITE: '#f2f0f5', UI_BONE: '#d8d2c4', UI_DIM: '#8a8496', UI_DARK: '#3a3546',
  UI_GOLD: '#ffd867', UI_DANGER: '#ff5a4a', UI_GOOD: '#7ff0a0', UI_COOL: '#7fd0f0',
  UI_PANEL: '#141220', UI_PANEL_HI: '#241f33',

  LANTERN: '#ffcf8a',
};

/** Ramp helpers so texture recipes read like art direction, not hex soup. */
export const RAMPS = {
  dirt:   [P.DIRT0, P.DIRT1, P.DIRT2, P.DIRT3, P.DIRT4, P.DIRT5],
  gravel: [P.GRAV0, P.GRAV1, P.GRAV2, P.GRAV3, P.GRAV4, P.GRAV4],
  stone:  [P.STON0, P.STON1, P.STON2, P.STON3, P.STON4, P.STON5],
  slate:  [P.SLAT0, P.SLAT1, P.SLAT2, P.SLAT3, P.SLAT4, P.SLAT5],
  granite:[P.GRAN0, P.GRAN1, P.GRAN2, P.GRAN3, P.GRAN4, P.GRAN5],
  gold:   [P.GOLD0, P.GOLD1, P.GOLD2, P.GOLD3, P.GOLD4, P.GOLD5],
  gem:    [P.GEM0, P.GEM1, P.GEM2, P.GEM3, P.GEM4, P.GEM5],
  cyan:   [P.CYAN0, P.CYAN1, P.CYAN2, P.CYAN3, P.CYAN4, P.CYAN5],
  magma:  [P.MAG0, P.MAG1, P.MAG2, P.MAG3, P.MAG4, P.MAG5],
  water:  [P.WAT0, P.WAT1, P.WAT2, P.WAT3, P.WAT4, P.WAT5],
  bone:   [P.BONE0, P.BONE0, P.BONE1, P.BONE2, P.BONE3, P.BONE4],
  ruin:   [P.RUIN0, P.RUIN1, P.RUIN2, P.RUIN3, P.RUIN4, P.RUIN5],
  root:   [P.ROOT0, P.ROOT1, P.ROOT2, P.ROOT3, P.ROOT4, P.ROOT4],
  fungus: [P.FUNG0, P.FUNG0, P.FUNG1, P.FUNG2, P.FUNG3, P.FUNG3],
};

/** '#rrggbb' -> [r,g,b] */
export function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbaStr(hex, a) {
  const [r, g, b] = hexRGB(hex);
  return `rgba(${r},${g},${b},${a})`;
}
