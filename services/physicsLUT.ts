/**
 * Pre-computed physics lookup tables.
 *
 * Instead of computing Math.exp(-dt/tau) hundreds of times per frame
 * (once per SmoothValue, SpringSystem, etc.), we pre-compute 512
 * entries covering the common dt range and interpolate at runtime.
 *
 * This is the moral equivalent of a shader uniform lookup table —
 * cheap O(1) table access instead of expensive transcendental math.
 */

/** Number of pre-computed entries (power of 2 for fast indexing). */
const LUT_SIZE = 512;

/** Minimum dt in seconds (below this we clamp). */
const DT_MIN = 0.001;

/** Maximum dt in seconds (above this we clamp to LUT[LUT_SIZE-1]). */
const DT_MAX = 0.2;

/**
 * Pre-computed exp(-dt/tau) for a fixed tau.
 * Entry i covers dt = DT_MIN + (DT_MAX - DT_MIN) * i / (LUT_SIZE - 1).
 */
class ExpDecayLUT {
  private values: Float32Array;
  private tau: number;

  constructor(tau: number) {
    this.tau = tau;
    this.values = new Float32Array(LUT_SIZE);
    for (let i = 0; i < LUT_SIZE; i++) {
      const dt = DT_MIN + ((DT_MAX - DT_MIN) * i) / (LUT_SIZE - 1);
      this.values[i] = Math.exp(-dt / tau);
    }
  }

  /** Look up exp(-dt/tau) with linear interpolation. */
  lookup(dt: number): number {
    if (dt <= DT_MIN) return this.values[0];
    if (dt >= DT_MAX) return this.values[LUT_SIZE - 1];

    const idx = ((dt - DT_MIN) / (DT_MAX - DT_MIN)) * (LUT_SIZE - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, LUT_SIZE - 1);
    const frac = idx - i0;
    return this.values[i0] + (this.values[i1] - this.values[i0]) * frac;
  }
}

/** Cache of LUTs keyed by tau (rounded to 2 decimals for reuse). */
const lutCache = new Map<string, ExpDecayLUT>();

export const expDecay = (dt: number, tau: number): number => {
  if (dt <= 0) return 1;
  // Round tau to 2 decimals for cache key
  const key = tau.toFixed(2);
  let lut = lutCache.get(key);
  if (!lut) {
    lut = new ExpDecayLUT(tau);
    lutCache.set(key, lut);
  }
  return lut.lookup(dt);
};

/**
 * Standard smoothing used by SmoothValue:
 *   alpha = 1 - exp(-dt / tau)
 *
 * This is the single most-called math operation in the animation system.
 */
export const smoothAlpha = (dt: number, tau: number): number => {
  return 1 - expDecay(dt, tau);
};

/**
 * Discrete spring steps. For common spring configurations we pre-compute
 * the position after `dt` seconds starting from (position=1, velocity=0)
 * with target=0.  At runtime we scale by the actual displacement.
 *
 * This replaces the per-frame per-line Hooke's law integration.
 */
const SPRING_LUT_SIZE = 256;

interface SpringLutConfig {
  mass: number;
  stiffness: number;
  damping: number;
}

const SPRING_CONFIGS: SpringLutConfig[] = [
  // Lyric line position springs (most common)
  { mass: 1.15, stiffness: 100, damping: 16 },
  { mass: 1.18, stiffness: 95, damping: 16 },
  { mass: 1.2, stiffness: 90, damping: 15 },
  // Drag position
  { mass: 1, stiffness: 260, damping: 24 },
  { mass: 1.02, stiffness: 230, damping: 23 },
  { mass: 1.05, stiffness: 200, damping: 22 },
  // Hold position
  { mass: 1.08, stiffness: 160, damping: 21 },
  { mass: 1.1, stiffness: 140, damping: 19 },
  { mass: 1.12, stiffness: 120, damping: 18 },
  // Scale spring
  { mass: 2, stiffness: 100, damping: 25 },
  // Seek
  { mass: 1.08, stiffness: 124, damping: 20 },
  // Scroll springs
  { mass: 0.9, stiffness: 200, damping: 30 },
  { mass: 0.9, stiffness: 280, damping: 24 },
];

interface SpringLUTEntry {
  /** Position after dt, normalized for initial displacement=1, target=0 */
  pos: number;
  /** Velocity after dt, normalized for initial displacement=1, target=0 */
  vel: number;
}

class SpringLUT {
  entries: SpringLUTEntry[];

  constructor(config: SpringLutConfig) {
    this.entries = [];
    for (let i = 0; i < SPRING_LUT_SIZE; i++) {
      const dt = DT_MIN + ((DT_MAX - DT_MIN) * i) / (SPRING_LUT_SIZE - 1);
      // Simulate one spring step
      let pos = 1;
      let vel = 0;
      const substeps = 4;
      const h = dt / substeps;
      for (let s = 0; s < substeps; s++) {
        const springForce = -config.stiffness * pos;
        const dampingForce = -config.damping * vel;
        const acc = (springForce + dampingForce) / config.mass;
        vel += acc * h;
        pos += vel * h;
      }
      this.entries.push({ pos, vel });
    }
  }

  step(dt: number): { pos: number; vel: number } {
    if (dt <= DT_MIN) return this.entries[0];
    if (dt >= DT_MAX) return this.entries[SPRING_LUT_SIZE - 1];

    const idx =
      ((dt - DT_MIN) / (DT_MAX - DT_MIN)) * (SPRING_LUT_SIZE - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, SPRING_LUT_SIZE - 1);
    const frac = idx - i0;
    const e0 = this.entries[i0];
    const e1 = this.entries[i1];
    return {
      pos: e0.pos + (e1.pos - e0.pos) * frac,
      vel: e0.vel + (e1.vel - e0.vel) * frac,
    };
  }
}

const springLutCache = new Map<string, SpringLUT>();

const springKey = (c: SpringLutConfig): string =>
  `${c.mass}|${c.stiffness}|${c.damping}`;

export const springStep = (
  dt: number,
  config: { mass: number; stiffness: number; damping: number },
): { pos: number; vel: number } => {
  const key = springKey(config);
  let lut = springLutCache.get(key);
  if (!lut) {
    lut = new SpringLUT(config);
    springLutCache.set(key, lut);
  }
  return lut.step(dt);
};

/** Pre-warm all LUTs at startup so lookups never incur allocation. */
export const warmPhysicsLUTs = () => {
  // Trigger lazy init for all known configs
  SPRING_CONFIGS.forEach((c) => springStep(0.01, c));
  // Common tau values used by SmoothValue (hover: 0.05/0.10, blur: 0.12/0.18, etc.)
  [0.05, 0.06, 0.10, 0.12, 0.14, 0.18, 0.4, 0.5, 1.5].forEach((tau) => {
    expDecay(0.01, tau);
  });
};
