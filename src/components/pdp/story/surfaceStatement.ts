/**
 * Desktop SURFACE cinematic statement only.
 * Local to SURFACE beat progress. Does not change Story length, camera, or copy windows.
 *
 * Statement is fully gone before the existing SURFACE copy window at 0.46.
 * Scrim stays opaque through the statement, then recedes so artwork appears next.
 */

const STATEMENT = {
  inStart: 0.02,
  inEnd: 0.16,
  holdEnd: 0.38,
  outEnd: 0.44,
} as const;

const SCRIM = {
  outStart: 0.44,
  outEnd: 0.56,
} as const;

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

export type SurfaceStatementVisual = {
  opacity: number;
  translateY: number;
  scale: number;
  /** 1 = artwork fully occluded. Independent of Canvas opacity. */
  scrim: number;
};

function statementMotion(p: number): Pick<SurfaceStatementVisual, 'opacity' | 'translateY' | 'scale'> {
  if (p <= STATEMENT.inStart || p >= STATEMENT.outEnd) {
    return { opacity: 0, translateY: 14, scale: 0.99 };
  }

  if (p < STATEMENT.inEnd) {
    const t = remap(p, STATEMENT.inStart, STATEMENT.inEnd);
    return {
      opacity: t,
      translateY: (1 - t) * 14,
      scale: 0.99 + 0.01 * t,
    };
  }

  if (p <= STATEMENT.holdEnd) {
    return { opacity: 1, translateY: 0, scale: 1 };
  }

  const t = remap(p, STATEMENT.holdEnd, STATEMENT.outEnd);
  return {
    opacity: 1 - t,
    translateY: -10 * t,
    scale: 1 - 0.008 * t,
  };
}

function scrimAt(p: number): number {
  if (p < SCRIM.outStart) return 1;
  if (p >= SCRIM.outEnd) return 0;
  return 1 - remap(p, SCRIM.outStart, SCRIM.outEnd);
}

/**
 * `local` is SURFACE-local 0–1. Inactive (wrong beat / not entered) is always hidden.
 * Statement opacity is 0 at local >= 0.44 — before the existing copy window at 0.46.
 * Scrim remains opaque until the statement is gone, then recedes to reveal artwork.
 */
export function surfaceStatementAt(local: number, active: boolean): SurfaceStatementVisual {
  if (!active) {
    return { opacity: 0, translateY: 14, scale: 0.99, scrim: 0 };
  }

  const p = clamp01(local);
  return { ...statementMotion(p), scrim: scrimAt(p) };
}
