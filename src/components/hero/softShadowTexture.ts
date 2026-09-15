import * as THREE from 'three';

let cached: THREE.CanvasTexture | null = null;

/** Radial falloff — no hard rectangular boundary */
export function getHeroSoftShadowTexture(): THREE.CanvasTexture {
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cached = new THREE.CanvasTexture(canvas);
    return cached;
  }

  const cx = size * 0.5;
  const cy = size * 0.52;
  const gradient = ctx.createRadialGradient(cx, cy, size * 0.06, cx, cy, size * 0.48);
  gradient.addColorStop(0, 'rgba(18, 14, 10, 0.55)');
  gradient.addColorStop(0.32, 'rgba(18, 14, 10, 0.24)');
  gradient.addColorStop(0.58, 'rgba(18, 14, 10, 0.08)');
  gradient.addColorStop(1, 'rgba(18, 14, 10, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  return cached;
}
