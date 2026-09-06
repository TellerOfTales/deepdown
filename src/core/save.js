const KEY = 'deeper.save.v1';

const EMPTY = () => ({
  bank: 0,
  upgrades: {},
  journal: [],
  discoveries: [],
  stats: { runs: 0, deepest: 0, banked: 0, tilesBroken: 0, bestCombo: 0, strikes: 0, crits: 0, deaths: 0 },
  muted: false,
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const d = JSON.parse(raw);
    const base = EMPTY();
    return {
      bank: d.bank | 0,
      upgrades: d.upgrades || {},
      journal: Array.isArray(d.journal) ? d.journal : [],
      discoveries: Array.isArray(d.discoveries) ? d.discoveries : [],
      stats: Object.assign(base.stats, d.stats || {}),
      muted: !!d.muted,
    };
  } catch (e) { return EMPTY(); }
}

export function save(G) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      bank: G.bank,
      upgrades: G.upgrades,
      journal: G.journal.filter(j => j.found).map(j => j.id),
      discoveries: Array.from(G.discoveries),
      stats: G.stats,
      muted: G.muted,
    }));
  } catch (e) { /* private mode — the run still works, it just will not persist */ }
}

export function wipe() { try { localStorage.removeItem(KEY); } catch (e) {} }
