export type CustomOrientation = 'portrait' | 'landscape';

export interface CustomComposition {
  version: 1;
  orientation: CustomOrientation;
  /**
   * Scale relative to cover (frame-fill).
   * 1 = product frame filled.
   * minZoom = contain/cover (full source visible).
   */
  zoom: number;
  /** Frame-normalized pan. 0 = centered. +X moves the image right. */
  offsetX: number;
  /** Frame-normalized pan. 0 = centered. +Y moves the image down. */
  offsetY: number;
}

export interface CustomSource {
  url: string;
  width: number;
  height: number;
}

export const PORTRAIT_FRAME = { width: 200, height: 283 } as const;
export const LANDSCAPE_FRAME = { width: 283, height: 200 } as const;

/** Safety cap relative to cover. Not a product-quality claim. */
export const MAX_ZOOM = 8;

/** Screen-preview raster long edge. Not a print master. Not 4K. */
export const PREVIEW_LONG_EDGE_PX = 1600;

/** Qualitative ~5 mm per edge. Not a verified trim specification. */
export const SAFE_AREA_MM = 5;

export function defaultComposition(
  orientation: CustomOrientation = 'portrait',
): CustomComposition {
  return {
    version: 1,
    orientation,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
}
