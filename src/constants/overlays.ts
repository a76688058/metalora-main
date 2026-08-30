/**
 * METALORA overlay z-index scale — Phase 2 will migrate existing overlays to these values.
 * Use Z_INDEX.dialog rather than ad-hoc z-[70000].
 */
export const Z_INDEX = {
  base: 0,
  cookie: 90,
  header: 100,
  drawerBackdrop: 200,
  drawer: 210,
  sheetBackdrop: 220,
  sheet: 230,
  dialogBackdrop: 240,
  dialog: 250,
  toast: 300,
  criticalLoading: 400,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX;

/** Tailwind arbitrary value helper: className={`z-[${zDialog}]`} → use zDialog() */
export function zLayer(layer: ZIndexLayer): number {
  return Z_INDEX[layer];
}

/** CSS custom property name for a layer */
export function zVar(layer: ZIndexLayer): string {
  const map: Record<ZIndexLayer, string> = {
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
  return map[layer];
}
