// Deterministic RNG + math + value-noise helpers.

export class RNG {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  // xorshift32
  next() {
    let x = this.s;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  // approx gaussian via sum of uniforms
  gauss(mean = 0, sd = 1) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this.next();
    return mean + (s - 3) / 1.46 * sd;
  }
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

// 2D value noise, seeded, a couple of octaves.
export function makeNoise(seed) {
  const rng = new RNG(seed * 2654435761 >>> 0);
  const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = rng.next();
  const grid = (xi, zi) => P[((xi & 255) * 256 + (zi & 255)) >>> 0];
  function octave(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const fx = smooth(x - xi), fz = smooth(z - zi);
    const a = lerp(grid(xi, zi), grid(xi + 1, zi), fx);
    const b = lerp(grid(xi, zi + 1), grid(xi + 1, zi + 1), fx);
    return lerp(a, b, fz);
  }
  return (x, z) => {
    let v = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < 4; o++) {
      v += octave(x * freq, z * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2.0;
    }
    return v / norm;
  };
}
