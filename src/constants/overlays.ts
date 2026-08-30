import type { CSSProperties } from 'react';

/**
 * METALORA overlay z-index scale — CSS tokens in tokens.css are canonical.
 * Use zClass('dialog') or zStyle('dialog') — never duplicate numeric literals in TS.
 */
export const Z_LAYERS = [
  'base',
  'cookie',
  'header',
  'drawerBackdrop',
  'drawer',
  'sheetBackdrop',
  'sheet',
  'dialogBackdrop',
  'dialog',
  'toast',
  'criticalLoading',
] as const;

export type ZIndexLayer = (typeof Z_LAYERS)[number];

const CSS_VAR: Record<ZIndexLayer, string> = {
  base: '--z-base',
  cookie: '--z-cookie',
  header: '--z-header',
  drawerBackdrop: '--z-drawer-backdrop',
  drawer: '--z-drawer',
  sheetBackdrop: '--z-sheet-backdrop',
  sheet: '--z-sheet',
  dialogBackdrop: '--z-dialog-backdrop',
  dialog: '--z-dialog',
  toast: '--z-toast',
  criticalLoading: '--z-critical-loading',
};

/** CSS custom property name for a layer (canonical source: tokens.css) */
export function zVar(layer: ZIndexLayer): string {
  return CSS_VAR[layer];
}

const TAILWIND_CLASS: Record<ZIndexLayer, string> = {
  base: 'z-base',
  cookie: 'z-cookie',
  header: 'z-header',
  drawerBackdrop: 'z-drawer-backdrop',
  drawer: 'z-drawer',
  sheetBackdrop: 'z-sheet-backdrop',
  sheet: 'z-sheet',
  dialogBackdrop: 'z-dialog-backdrop',
  dialog: 'z-dialog',
  toast: 'z-toast',
  criticalLoading: 'z-critical-loading',
};

/** Tailwind @utility class referencing the CSS z-index token */
export function zClass(layer: ZIndexLayer): string {
  return TAILWIND_CLASS[layer];
}

/** Inline style helper for Framer Motion / dynamic consumers */
export function zStyle(layer: ZIndexLayer): CSSProperties {
  return { zIndex: `var(${zVar(layer)})` };
}
