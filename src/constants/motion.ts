/**
 * Motion foundation tokens for Framer Motion / CSS consumers.
 * Principles: idle = calm; user interaction = alive.
 * Do not import GSAP/Lenis — Framer remains the UI motion layer.
 */
export const MOTION = {
  duration: {
    fast: 0.15,
    normal: 0.28,
    panel: 0.32,
    cinematic: 0.5,
  },
  ease: {
    standard: [0.16, 1, 0.3, 1] as const,
    enter: [0, 0, 0.2, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  /** Framer spring presets */
  spring: {
    panel: { type: 'spring' as const, damping: 28, stiffness: 320 },
    snappy: { type: 'spring' as const, damping: 22, stiffness: 400 },
  },
} as const;

/** Respect prefers-reduced-motion when wiring Framer transitions */
export function motionDuration(key: keyof typeof MOTION.duration, reducedMotion: boolean): number {
  return reducedMotion ? 0.01 : MOTION.duration[key];
}
