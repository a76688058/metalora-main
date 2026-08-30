import * as THREE from 'three';
import type { ArtworkLayoutMode } from './types';

export function applyTextureCover(
  texture: THREE.Texture,
  imageAspect: number,
  targetAspect: number,
): void {
  if (imageAspect > targetAspect) {
    texture.repeat.set(targetAspect / imageAspect, 1);
    texture.offset.set((1 - targetAspect / imageAspect) / 2, 0);
  } else {
    texture.repeat.set(1, imageAspect / targetAspect);
    texture.offset.set(0, (1 - imageAspect / targetAspect) / 2);
  }
}

/** Per-instance clone — safe to mutate without affecting drei's cached source texture */
export function cloneArtworkTexture(source: THREE.Texture): THREE.Texture {
  const clone = source.clone();
  clone.image = source.image;
  clone.needsUpdate = true;
  return clone;
}

export function resolveAnisotropy(tierValue: number, maxSupported: number): number {
  return Math.min(tierValue, Math.max(1, maxSupported));
}

export function configureArtworkTexture(
  texture: THREE.Texture,
  options: {
    targetAspect: number;
    layoutMode: ArtworkLayoutMode;
    anisotropy: number;
  },
): void {
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = options.anisotropy;

  const img = texture.image as HTMLImageElement | undefined;
  if (!img?.width || !img?.height) return;

  const imageAspect = img.width / img.height;

  if (options.layoutMode === 'cover') {
    applyTextureCover(texture, imageAspect, options.targetAspect);
  } else {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
  }

  texture.needsUpdate = true;
}

/** Contain-mode photo plane scale relative to slab width/height */
export function computePhotoPlaneScale(
  imageAspect: number,
  targetAspect: number,
): [number, number, number] {
  if (imageAspect > targetAspect) {
    return [1, targetAspect / imageAspect, 1];
  }
  return [imageAspect / targetAspect, 1, 1];
}

export function resolveDimensions(
  width: number,
  height: number,
  orientation: 'portrait' | 'landscape',
): { finalWidth: number; finalHeight: number; targetAspect: number } {
  const finalWidth = orientation === 'landscape' ? height : width;
  const finalHeight = orientation === 'landscape' ? width : height;
  return {
    finalWidth,
    finalHeight,
    targetAspect: finalWidth / finalHeight,
  };
}
