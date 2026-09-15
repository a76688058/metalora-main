import {
  SURFACE_COPY_IN_END,
  SURFACE_COPY_IN_START,
  SURFACE_COPY_OUT_END,
  SURFACE_COPY_OUT_START,
  SURFACE_POSE_PEAK,
  SURFACE_POSE_START,
  SURFACE_REST_AMOUNT,
  SURFACE_WINDOWS,
  type SurfaceCameraPose,
} from './constants';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Mild S-curve. More linear than cosine so the mid-dolly does not dump. */
function easeSoft(t: number): number {
  const x = clamp01(t);
  const cosine = 0.5 - 0.5 * Math.cos(Math.PI * x);
  return x * 0.58 + cosine * 0.42;
}

/** Zero derivative at both ends — peak leave and rest arrive. */
function easeStop(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function remap(p: number, a: number, b: number, ease: (t: number) => number = easeSoft): number {
  if (b <= a) return p >= b ? 1 : 0;
  return ease((p - a) / (b - a));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: SurfaceCameraPose, b: SurfaceCameraPose, t: number): SurfaceCameraPose {
  return {
    position: [
      lerp(a.position[0], b.position[0], t),
      lerp(a.position[1], b.position[1], t),
      lerp(a.position[2], b.position[2], t),
    ],
    lookAt: [
      lerp(a.lookAt[0], b.lookAt[0], t),
      lerp(a.lookAt[1], b.lookAt[1], t),
      lerp(a.lookAt[2], b.lookAt[2], t),
    ],
    yaw: lerp(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    fov: lerp(a.fov, b.fov, t),
  };
}

/**
 * 0 ≈ START, 1 = PEAK, rest = SURFACE_REST_AMOUNT.
 * One path. No START / PEAK / END pose switch.
 */
function amountAt(p: number): number {
  const { contextEnd, peakAt, calmStart } = SURFACE_WINDOWS;
  if (p <= contextEnd) return 0.03 * remap(p, 0, contextEnd);
  if (p <= peakAt) return 0.03 + 0.97 * remap(p, contextEnd, peakAt);
  if (p >= calmStart) return SURFACE_REST_AMOUNT;
  return 1 - (1 - SURFACE_REST_AMOUNT) * remap(p, peakAt, calmStart, easeStop);
}

function poseAt(amount: number): SurfaceCameraPose {
  return lerpPose(SURFACE_POSE_START, SURFACE_POSE_PEAK, amount);
}

function stageOpacityAt(p: number): number {
  return 0.94 + 0.06 * remap(p, 0, SURFACE_WINDOWS.contextEnd);
}

function copyOpacityAt(p: number): number {
  const enter = remap(p, SURFACE_COPY_IN_START, SURFACE_COPY_IN_END, easeStop);
  const leave = 1 - remap(p, SURFACE_COPY_OUT_START, SURFACE_COPY_OUT_END, easeStop);
  return enter * leave;
}

/**
 * Studio↔grazing follow closeness, then a slow recede that never reaches 0.
 * Floor 0.10 at context so grazing does not "switch on".
 */
function grazingMixAt(p: number, amount: number): number {
  const risen = 0.1 + 0.9 * easeSoft(clamp01((amount - 0.02) / 0.98));
  if (p <= SURFACE_WINDOWS.peakAt) return risen;
  const recede = remap(p, SURFACE_WINDOWS.peakAt, 1, easeStop);
  return lerp(risen, 0.7, recede * 0.5);
}

export type SurfaceVisual = {
  amount: number;
  pose: SurfaceCameraPose;
  stageOpacity: number;
  copyOpacity: number;
  grazingMix: number;
};

export function surfaceVisualAt(progress: number): SurfaceVisual {
  const p = clamp01(progress);
  const amount = amountAt(p);
  return {
    amount,
    pose: poseAt(amount),
    stageOpacity: stageOpacityAt(p),
    copyOpacity: copyOpacityAt(p),
    grazingMix: grazingMixAt(p, amount),
  };
}

/** @deprecated Use surfaceVisualAt().pose */
export function surfacePoseAt(progress: number): SurfaceCameraPose {
  return surfaceVisualAt(progress).pose;
}
