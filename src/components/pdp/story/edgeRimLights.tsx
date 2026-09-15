import * as THREE from 'three';

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * World-space EDGE signature. Print is MeshBasic and ignores these.
 * Intensity and sweep position are progress-driven so reverse scroll matches forward.
 */
export function PdpStoryRimSignature({
  orientation,
  panelWidth,
  panelHeight,
  scale,
  frameScale,
  rimMix,
  sweep,
  glint,
}: {
  orientation: 'portrait' | 'landscape';
  panelWidth: number;
  panelHeight: number;
  scale: number;
  frameScale: number;
  rimMix: number;
  sweep: number;
  glint: number;
}) {
  const r = clamp01(rimMix);
  const s = clamp01(sweep);
  const g = clamp01(glint);
  if (r < 0.002 && g < 0.002) return null;

  const portrait = orientation !== 'landscape';
  const faceW = (portrait ? panelWidth : panelHeight) * frameScale * scale;
  const faceH = (portrait ? panelHeight : panelWidth) * frameScale * scale;
  const hx = faceW / 2;
  const hy = faceH / 2;
  const along = lerp(portrait ? -hy * 0.7 : -hx * 0.7, portrait ? hy * 0.7 : hx * 0.7, s);

  /** Behind the slab — silhouette catch during 3/4. */
  const rimBehind: [number, number, number] = portrait
    ? [hx + 0.28, along * 0.2, -1.35]
    : [along * 0.2, hy + 0.28, -1.35];
  /** Slides along the long edge so the specular migrates in the parked macro. */
  const sweepKey: [number, number, number] = portrait
    ? [hx + 0.92, along, -0.16]
    : [along, hy + 0.92, -0.16];
  const rimGrazing: [number, number, number] = portrait
    ? [hx + 0.55, along, 0.42]
    : [along, hy + 0.55, 0.42];

  return (
    <>
      <directionalLight position={rimBehind} intensity={1.35 * r} color="#fff4e6" />
      <directionalLight position={rimGrazing} intensity={0.85 * r} color="#f7f2ea" />
      <directionalLight position={sweepKey} intensity={2.05 * r} color="#fff8f0" />
      {g > 0.002 ? (
        <pointLight
          position={sweepKey}
          intensity={0.38 * g}
          distance={0.26}
          decay={2}
          color="#fffaf4"
        />
      ) : null}
    </>
  );
}
