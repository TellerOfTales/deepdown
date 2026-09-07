// Deterministic RNG + noise. Everything in DEEPER that is "random" is seeded,
// so a run can be replayed, shared, and debugged.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of two ints (+ optional salt). Used for tile variants. */
export function hash2(x, y, salt = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (salt | 0) * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash2 normalised to [0,1). */
export function hashf(x, y, salt = 0) {
  return hash2(x, y, salt) / 4294967296;
}

export class Rand {
  constructor(seed) { this.next = mulberry32(seed); this.seed = seed; }
  f(a = 1, b) { const r = this.next(); return b === undefined ? r * a : a + r * (b - a); }
  i(a, b) { return b === undefined ? Math.floor(this.next() * a) : a + Math.floor(this.next() * (b - a + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Weighted pick. entries: [[value, weight], ...] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  /** Unit vector at a random angle. */
  dir() { const a = this.next() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; }
}

/** Smooth value noise on an integer lattice. Deterministic for a given salt. */
export function valueNoise2(x, y, salt = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashf(xi, yi, salt), b = hashf(xi + 1, yi, salt);
  const c = hashf(xi, yi + 1, salt), d = hashf(xi + 1, yi + 1, salt);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Fractal value noise. Returns roughly [0,1]. */
export function fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5, salt = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, y * freq, salt + o * 7919);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
/** Frame-rate independent exponential approach. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
