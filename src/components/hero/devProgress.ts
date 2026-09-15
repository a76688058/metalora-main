import { clamp01 } from './curves';

/** DEV-ONLY: ?heroProgress=0.5 overrides drag state for visual QA */
export function readDevHeroProgressOverride(): number | null {
  if (!import.meta.env.DEV) return null;
  const raw = new URLSearchParams(window.location.search).get('heroProgress');
  if (raw === null || raw === '') return null;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return null;
  return clamp01(n);
}

/** DEV-ONLY: ?heroCover=0.5 — collection cover phase while story is locked */
export function readDevHeroCoverOverride(): number | null {
  if (!import.meta.env.DEV) return null;
  const raw = new URLSearchParams(window.location.search).get('heroCover');
  if (raw === null || raw === '') return null;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return null;
  return clamp01(n);
}

/** Opt-in authoring HUD. Default customer-facing Hero never shows debug chrome. */
export function isDevHeroAuthoringEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).has('heroAuthoring');
}
