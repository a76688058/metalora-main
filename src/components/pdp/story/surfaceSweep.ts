/**
 * Desktop SURFACE metallic light sweep only.
 * Local to SURFACE beat progress. Does not change statement, scrim, camera, or Story length.
 *
 * One pass after the artwork reveal scrim has receded. Completely gone before the
 * existing SURFACE peak at local 0.68.
 */

const SWEEP = {
  start: 0.56,
  fadeInEnd: 0.575,
  fadeOutStart: 0.645,
  gone: 0.665,
  travelEnd: 0.66,
} as const;

export type SurfaceSweepVisual = {
  opacity: number;
  travel: number;
};

const HIDDEN: SurfaceSweepVisual = { opacity: 0, travel: 0 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeStop(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function remap(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return easeStop((p - a) / (b - a));
}

function remapLinear(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return clamp01((p - a) / (b - a));
}

/**
 * `local` is SURFACE-local 0–1. Inactive (wrong beat / not entered) is always hidden.
 * Sweep never starts before the artwork-reveal scrim has finished (0.56).
 * Opacity is 0 by 0.665 — before the existing camera peak at 0.68.
 */
export function surfaceSweepAt(local: number, active: boolean): SurfaceSweepVisual {
  if (!active) return HIDDEN;

  const p = clamp01(local);
  if (p < SWEEP.start || p >= SWEEP.gone) return HIDDEN;

  const travel = remapLinear(p, SWEEP.start, SWEEP.travelEnd);
  let opacity = 1;
  if (p < SWEEP.fadeInEnd) {
    opacity = remap(p, SWEEP.start, SWEEP.fadeInEnd);
  } else if (p > SWEEP.fadeOutStart) {
    opacity = 1 - remap(p, SWEEP.fadeOutStart, SWEEP.gone);
  }

  return { opacity, travel };
}
