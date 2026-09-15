/**
 * Hero slab dimensions — same physical convention as PDP LIVE 3D PREVIEW.
 * Source of truth is sale format (A4) + orientation, NOT source image pixels.
 *
 * PDP Poster3D defaults: width=1, height=1.414, thickness=0.008, layoutMode=cover
 */
import { resolveDimensions } from '../artwork3d/textureUtils';

/** ISO A4 short × long in scene units — matches MetaloraArtwork3D / Poster3D defaults */
export const HERO_SALE_FORMAT_WIDTH = 1;
export const HERO_SALE_FORMAT_HEIGHT = 1.414;

/** Same thickness as Poster3D LIVE 3D PREVIEW */
export const HERO_SALE_FORMAT_THICKNESS = 0.008;

export function resolveHeroArtworkDimensions(
  orientation: 'portrait' | 'landscape',
): {
  width: number;
  height: number;
  aspect: number;
  thickness: number;
} {
  const { finalWidth, finalHeight, targetAspect } = resolveDimensions(
    HERO_SALE_FORMAT_WIDTH,
    HERO_SALE_FORMAT_HEIGHT,
    orientation,
  );
  return {
    width: finalWidth,
    height: finalHeight,
    aspect: targetAspect,
    thickness: HERO_SALE_FORMAT_THICKNESS,
  };
}
