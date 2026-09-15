import {
  MAGNETIC_TAIL_SETTLE_END,
  MAGNETIC_WINDOWS_DESKTOP,
  type StoryAnatomyLayerId,
  type SurfaceCameraPose,
} from './constants';
import { ANATOMY_LAYOUT } from './magneticAnatomy';
import { magneticDesktopCalloutChannelsAt } from './magneticLabels';
import { edgeVisualAt, type StoryOrientation } from './edgeChoreography';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeSoft(t: number): number {
  const x = clamp01(t);
  const cosine = 0.5 - 0.5 * Math.cos(Math.PI * x);
  return x * 0.58 + cosine * 0.42;
}

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

function copyPulse(p: number, inStart: number, inEnd: number, outStart: number, outEnd: number): number {
  const enter = remap(p, inStart, inEnd, easeStop);
  const leave = 1 - remap(p, outStart, outEnd, easeStop);
  return enter * leave;
}

/** Delayed follow along a shared 0–1 amount. Reverses cleanly when amount falls. */
function follow(amount: number, delay: number, duration: number): number {
  return easeStop(clamp01((amount - delay) / duration));
}

/**
 * Panel-local (0, 0, z) into world, matching the canvas group order
 * Ry(yaw) · Rx(pitch). Used to translate framing, never to rotate it.
 */
function localDepthToWorld(z: number, yaw: number, pitch: number): [number, number, number] {
  const y = -z * Math.sin(pitch);
  const depth = z * Math.cos(pitch);
  return [depth * Math.sin(yaw), y, depth * Math.cos(yaw)];
}

/**
 * The stack grows only along −Z, so its midpoint slides away from the panel.
 * Shifting camera and target by the same vector re-centres the envelope
 * without touching distance, orientation or the approved fan-out.
 */
function centerPose(pose: SurfaceCameraPose, envelopeCenterZ: number): SurfaceCameraPose {
  const [dx, dy, dz] = localDepthToWorld(envelopeCenterZ, pose.yaw, pose.pitch);
  return {
    ...pose,
    position: [pose.position[0] + dx, pose.position[1] + dy, pose.position[2] + dz],
    lookAt: [pose.lookAt[0] + dx, pose.lookAt[1] + dy, pose.lookAt[2] + dz],
  };
}

/**
 * Locked artwork-front 3/4. Same 004D camera distance and side-on amount
 * as the accepted rear pose; yaw is mirrored so the print faces the viewer
 * at the same grazing angle (rear used yaw 2.45 / 2.26).
 * Physical stack still grows along local −Z (wall farthest).
 */
function anatomyPose(orientation: StoryOrientation): SurfaceCameraPose {
  const portrait = orientation !== 'landscape';
  return {
    position: portrait ? [3.15, 1.22, 6.85] : [1.05, 3.05, 6.85],
    lookAt: [0, 0.04, 0],
    yaw: portrait ? -(Math.PI - 2.45) : -(Math.PI - 2.26),
    pitch: portrait ? 0.16 : 0.45,
    fov: 40,
  };
}

function restPose(orientation: StoryOrientation): SurfaceCameraPose {
  const portrait = orientation !== 'landscape';
  return {
    position: portrait ? [3.2, 1.24, 7.15] : [1.08, 3.1, 7.15],
    lookAt: [0, 0.04, 0],
    yaw: portrait ? -(Math.PI - 2.45) : -(Math.PI - 2.26),
    pitch: portrait ? 0.16 : 0.45,
    fov: 40,
  };
}

function cameraRadius(pose: SurfaceCameraPose): number {
  return Math.hypot(
    pose.position[0] - pose.lookAt[0],
    pose.position[1] - pose.lookAt[1],
    pose.position[2] - pose.lookAt[2],
  );
}

/** Same distance as the assembled 3/4 rest; camera on +Z, product yaw/pitch near 0. */
function frontPose(orientation: StoryOrientation): SurfaceCameraPose {
  const rest = restPose(orientation);
  const radius = cameraRadius(rest);
  return {
    position: [0, rest.lookAt[1], radius],
    lookAt: rest.lookAt,
    yaw: 0,
    pitch: orientation === 'landscape' ? 0.03 : 0.02,
    fov: 40,
  };
}

function lerpPoseKeepDistance(
  from: SurfaceCameraPose,
  to: SurfaceCameraPose,
  t: number,
): SurfaceCameraPose {
  const lookAt: [number, number, number] = [
    lerp(from.lookAt[0], to.lookAt[0], t),
    lerp(from.lookAt[1], to.lookAt[1], t),
    lerp(from.lookAt[2], to.lookAt[2], t),
  ];
  const a: [number, number, number] = [
    from.position[0] - from.lookAt[0],
    from.position[1] - from.lookAt[1],
    from.position[2] - from.lookAt[2],
  ];
  const b: [number, number, number] = [
    to.position[0] - to.lookAt[0],
    to.position[1] - to.lookAt[1],
    to.position[2] - to.lookAt[2],
  ];
  const ra = Math.hypot(a[0], a[1], a[2]) || 1;
  const rb = Math.hypot(b[0], b[1], b[2]) || 1;
  const radius = lerp(ra, rb, t);
  const na: [number, number, number] = [a[0] / ra, a[1] / ra, a[2] / ra];
  const nb: [number, number, number] = [b[0] / rb, b[1] / rb, b[2] / rb];
  const d = Math.min(1, Math.max(-1, na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2]));
  const theta = Math.acos(d);
  let dir: [number, number, number] = nb;
  if (theta >= 1e-4) {
    const s = Math.sin(theta);
    const w0 = Math.sin((1 - t) * theta) / s;
    const w1 = Math.sin(t * theta) / s;
    const x = w0 * na[0] + w1 * nb[0];
    const y = w0 * na[1] + w1 * nb[1];
    const z = w0 * na[2] + w1 * nb[2];
    const len = Math.hypot(x, y, z) || 1;
    dir = [x / len, y / len, z / len];
  }
  return {
    position: [lookAt[0] + dir[0] * radius, lookAt[1] + dir[1] * radius, lookAt[2] + dir[2] * radius],
    lookAt,
    yaw: lerp(from.yaw, to.yaw, t),
    pitch: lerp(from.pitch, to.pitch, t),
    fov: lerp(from.fov, to.fov, t),
  };
}

/** Desktop post-MAGNETIC tail. tailLocal 0 = assembled 3/4 rest (no snap). */
export function magneticTailPose(
  tailLocal: number,
  orientation: StoryOrientation,
  envelopeCenterZ: number,
): SurfaceCameraPose {
  const t = remap(clamp01(tailLocal), 0, MAGNETIC_TAIL_SETTLE_END, easeStop);
  return centerPose(lerpPoseKeepDistance(restPose(orientation), frontPose(orientation), t), envelopeCenterZ);
}

function fanAmountAt(p: number): number {
  const { settleEnd, fanOutEnd, holdEnd, compressEnd } = MAGNETIC_WINDOWS_DESKTOP;
  if (p <= settleEnd) return 0;
  if (p <= fanOutEnd) return remap(p, settleEnd, fanOutEnd, easeStop);
  if (p <= holdEnd) return 1;
  if (p <= compressEnd) return 1 - remap(p, holdEnd, compressEnd, easeStop);
  return 0;
}

export type MagneticVisual = {
  pose: SurfaceCameraPose;
  panelOffset: [number, number, number];
  artMagnetDetach: number;
  wallOpacity: number;
  magnetOpacity: number;
  wallSpread: number;
  stickerSpread: number;
  wallMagnetSpread: number;
  magneticCopyOpacity: number;
  stackCopyOpacity: number;
  explodeDisclosureOpacity: number;
  detachDisclosureOpacity: number;
  layerLabelOpacity: Record<StoryAnatomyLayerId, number>;
  layerLine: Record<StoryAnatomyLayerId, number>;
  layerPulse: Record<StoryAnatomyLayerId, number>;
  layerHighlight: Record<StoryAnatomyLayerId, number>;
  envelopeCenterZ: number;
  edgeMix: number;
};

export function magneticVisualAt(progress: number, orientation: StoryOrientation): MagneticVisual {
  const p = clamp01(progress);
  const handoff = edgeVisualAt(1, orientation);
  const anatomy = anatomyPose(orientation);
  const rest = restPose(orientation);
  const { settleEnd, compressEnd } = MAGNETIC_WINDOWS_DESKTOP;

  const fan = fanAmountAt(p);
  const wallSpread = follow(fan, 0, 0.7);
  const stickerSpread = follow(fan, 0.08, 0.7);
  const wallMagnetSpread = follow(fan, 0.16, 0.7);
  const artMagnetDetach = follow(fan, 0.26, 0.7);
  const wallZ = lerp(ANATOMY_LAYOUT.wallSeatedZ, ANATOMY_LAYOUT.wallExplodedZ, wallSpread);
  const envelopeCenterZ = wallZ / 2;

  let pose = handoff.pose;
  let edgeMix = handoff.edgeMix;
  const layerOpacity = remap(p, 0, 0.04, easeStop);

  if (p <= settleEnd) {
    const t = remap(p, 0, settleEnd);
    pose = lerpPose(handoff.pose, anatomy, t);
    edgeMix = lerp(handoff.edgeMix, 0.16, t);
  } else if (p <= compressEnd) {
    pose = anatomy;
    edgeMix = 0.16;
  } else {
    const t = remap(p, compressEnd, 1, easeStop);
    pose = lerpPose(anatomy, rest, t);
    edgeMix = lerp(0.16, 0.08, t);
  }

  const callout = magneticDesktopCalloutChannelsAt(p);

  return {
    pose: centerPose(pose, envelopeCenterZ),
    panelOffset: [0, 0, 0],
    artMagnetDetach,
    wallOpacity: layerOpacity,
    magnetOpacity: layerOpacity,
    wallSpread,
    stickerSpread,
    wallMagnetSpread,
    magneticCopyOpacity: copyPulse(p, 0.12, 0.28, 0.92, 0.99),
    stackCopyOpacity: copyPulse(p, 0.2, 0.36, 0.86, 0.94),
    explodeDisclosureOpacity: copyPulse(p, 0.22, 0.4, 0.82, 0.9),
    detachDisclosureOpacity: copyPulse(p, 0.28, 0.42, 0.86, 0.94),
    layerLabelOpacity: callout.label,
    layerLine: callout.line,
    layerPulse: callout.pulse,
    layerHighlight: callout.highlight,
    envelopeCenterZ,
    edgeMix,
  };
}
