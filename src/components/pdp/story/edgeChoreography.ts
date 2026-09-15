import {
  EDGE_COPY_IN_END,
  EDGE_COPY_IN_START,
  EDGE_COPY_OUT_END,
  EDGE_COPY_OUT_START,
  EDGE_DISCLOSURE_IN_END,
  EDGE_DISCLOSURE_IN_START,
  EDGE_DISCLOSURE_OUT_END,
  EDGE_DISCLOSURE_OUT_START,
  EDGE_WINDOWS,
  STORY_PANEL_HEIGHT,
  STORY_PANEL_WIDTH,
  type SurfaceCameraPose,
} from './constants';
import { surfaceVisualAt } from './surfaceChoreography';

export type StoryOrientation = 'portrait' | 'landscape';

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

/** Pitch then yaw — matches PdpSpatialCanvas nested groups. */
function transformLocal(
  local: [number, number, number],
  yaw: number,
  pitch: number,
): [number, number, number] {
  const [x, y, z] = local;
  const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
  const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
  return [
    x * Math.cos(yaw) + z1 * Math.sin(yaw),
    y1,
    -x * Math.sin(yaw) + z1 * Math.cos(yaw),
  ];
}

function poseFromLocals(
  yaw: number,
  pitch: number,
  lookLocal: [number, number, number],
  cameraLocal: [number, number, number],
  fov: number,
): SurfaceCameraPose {
  return {
    position: transformLocal(cameraLocal, yaw, pitch),
    lookAt: transformLocal(lookLocal, yaw, pitch),
    yaw,
    pitch,
    fov,
  };
}

type EdgeKey = {
  pose: SurfaceCameraPose;
  grazingMix: number;
  edgeMix: number;
};

/**
 * EDGE peak is a moderate 3/4 continuation of SURFACE rest — same object,
 * slight Y-turn (negative yaw: +X / right aluminum toward camera, matching
 * world-space rim lights), slight approach. Not an edge-glued macro.
 * Restore stays the previous MAGNETIC handoff pose.
 */
function edgeKeys(orientation: StoryOrientation): {
  approach: EdgeKey;
  macro: EdgeKey;
  restore: EdgeKey;
} {
  const portrait = orientation !== 'landscape';

  const peak: SurfaceCameraPose = portrait
    ? {
        position: [2.08, 0.12, 6.32],
        lookAt: [1.06, 0.02, 0],
        yaw: -0.5,
        pitch: 0.028,
        fov: 40,
      }
    : {
        position: [1.08, 1.18, 6.62],
        lookAt: [0.92, 0.16, 0],
        yaw: 0.12,
        pitch: 0.5,
        fov: 40,
      };

  const restoreYaw = portrait ? 0.32 : 0.12;
  const restorePitch = portrait ? 0.022 : 0.26;
  const restoreLook: [number, number, number] = [0, 0.01, 0];
  const restoreCam: [number, number, number] = portrait
    ? [0.12, 0.055, 7.85]
    : [0.09, 0.12, 7.85];

  const peakKey: EdgeKey = {
    pose: peak,
    grazingMix: 0.5,
    edgeMix: 0.7,
  };

  return {
    approach: peakKey,
    macro: peakKey,
    restore: {
      pose: poseFromLocals(restoreYaw, restorePitch, restoreLook, restoreCam, 40),
      grazingMix: 0.42,
      edgeMix: 0.28,
    },
  };
}

function copyOpacityAt(p: number): number {
  const enter = remap(p, EDGE_COPY_IN_START, EDGE_COPY_IN_END, easeStop);
  const leave = 1 - remap(p, EDGE_COPY_OUT_START, EDGE_COPY_OUT_END, easeStop);
  return enter * leave;
}

function disclosureOpacityAt(p: number): number {
  const enter = remap(p, EDGE_DISCLOSURE_IN_START, EDGE_DISCLOSURE_IN_END, easeStop);
  const leave = 1 - remap(p, EDGE_DISCLOSURE_OUT_START, EDGE_DISCLOSURE_OUT_END, easeStop);
  return enter * leave;
}

function rimMixAt(p: number): number {
  const enter = remap(p, 0.06, 0.46, easeSoft);
  const leave = 1 - remap(p, 0.7, 0.93, easeSoft);
  return enter * leave;
}

/** 0 → 1 along the long edge; recedes after hold so reverse scroll is symmetric. */
function sweepAt(p: number): number {
  const peak = (EDGE_WINDOWS.macroEnd + EDGE_WINDOWS.holdEnd) * 0.5;
  if (p <= peak) return remap(p, 0.1, peak, easeSoft);
  return (1 - remap(p, peak, EDGE_WINDOWS.restoreEnd, easeSoft)) * 0.92;
}

/** Tiny accent around the strongest macro reflection only. */
function glintAt(p: number): number {
  const enter = remap(p, EDGE_WINDOWS.macroEnd + 0.02, EDGE_WINDOWS.holdEnd - 0.04, easeStop);
  const leave = 1 - remap(p, EDGE_WINDOWS.holdEnd - 0.04, EDGE_WINDOWS.holdEnd + 0.02, easeStop);
  return enter * leave;
}

export type EdgeVisual = {
  pose: SurfaceCameraPose;
  stageOpacity: number;
  copyOpacity: number;
  grazingMix: number;
  edgeMix: number;
  rimMix: number;
  sweep: number;
  glint: number;
  edgeCopyOpacity: number;
  disclosureOpacity: number;
};

export function edgeVisualAt(progress: number, orientation: StoryOrientation): EdgeVisual {
  const p = clamp01(progress);
  const handoffSurf = surfaceVisualAt(1);
  const handoff: EdgeKey = {
    pose: handoffSurf.pose,
    grazingMix: handoffSurf.grazingMix,
    edgeMix: 0,
  };
  const keys = edgeKeys(orientation);
  const { approachEnd, macroEnd, holdEnd, restoreEnd } = EDGE_WINDOWS;

  let pose = handoff.pose;
  let grazingMix = handoff.grazingMix;
  let edgeMix = 0;

  if (p <= approachEnd) {
    const t = remap(p, 0, approachEnd);
    pose = lerpPose(handoff.pose, keys.approach.pose, t);
    grazingMix = lerp(handoff.grazingMix, keys.approach.grazingMix, t);
    edgeMix = lerp(0, keys.approach.edgeMix, t);
  } else if (p <= macroEnd) {
    const t = remap(p, approachEnd, macroEnd, easeStop);
    pose = lerpPose(keys.approach.pose, keys.macro.pose, t);
    grazingMix = lerp(keys.approach.grazingMix, keys.macro.grazingMix, t);
    edgeMix = lerp(keys.approach.edgeMix, keys.macro.edgeMix, t);
  } else if (p <= holdEnd) {
    pose = keys.macro.pose;
    grazingMix = keys.macro.grazingMix;
    edgeMix = keys.macro.edgeMix;
  } else if (p <= restoreEnd) {
    const t = remap(p, holdEnd, restoreEnd, easeStop);
    pose = lerpPose(keys.macro.pose, keys.restore.pose, t);
    grazingMix = lerp(keys.macro.grazingMix, keys.restore.grazingMix, t);
    edgeMix = lerp(keys.macro.edgeMix, keys.restore.edgeMix, t);
  } else {
    pose = keys.restore.pose;
    grazingMix = keys.restore.grazingMix;
    edgeMix = keys.restore.edgeMix;
  }

  return {
    pose,
    stageOpacity: 1,
    copyOpacity: 0,
    grazingMix,
    edgeMix,
    rimMix: rimMixAt(p),
    sweep: sweepAt(p),
    glint: glintAt(p),
    edgeCopyOpacity: copyOpacityAt(p),
    disclosureOpacity: disclosureOpacityAt(p),
  };
}

/** Matches PDP_FRAME_SCALE without importing the canvas module. */
const FACE_SCALE = 1.8;

type Vec3 = [number, number, number];
type Vec2 = { leftPct: number; topPct: number };

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function projectToStage(point: Vec3, pose: SurfaceCameraPose, aspect: number): Vec2 | null {
  const forward = normalize(sub(pose.lookAt, pose.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = normalize(cross(right, forward));
  const view = sub(point, pose.position);
  const depth = dot(view, forward);
  if (depth <= 0.01) return null;
  const halfHeight = Math.tan((pose.fov * Math.PI) / 360) * depth;
  const halfWidth = halfHeight * aspect;
  const ndcX = dot(view, right) / halfWidth;
  const ndcY = dot(view, up) / halfHeight;
  return {
    leftPct: ((ndcX + 1) / 2) * 100,
    topPct: ((1 - ndcY) / 2) * 100,
  };
}

export type EdgeCopyAnchor = {
  leftPct: number;
  topPct: number;
  artLeftPct: number;
  artRightPct: number;
  artTopPct: number;
  artBottomPct: number;
};

/**
 * Desktop EDGE copy sits to the right of the projected artwork AABB,
 * vertically centered on that AABB. Gap is 90–126px equivalent.
 */
export function edgeCopyAnchor(
  pose: SurfaceCameraPose,
  aspect: number,
  orientation: StoryOrientation,
  stageWidthPx: number,
): EdgeCopyAnchor | null {
  const faceW = orientation === 'landscape' ? STORY_PANEL_HEIGHT : STORY_PANEL_WIDTH;
  const faceH = orientation === 'landscape' ? STORY_PANEL_WIDTH : STORY_PANEL_HEIGHT;
  const hw = (faceW * FACE_SCALE) / 2;
  const hh = (faceH * FACE_SCALE) / 2;
  const locals: Vec3[] = [
    [-hw, hh, 0],
    [hw, hh, 0],
    [hw, -hh, 0],
    [-hw, -hh, 0],
  ];
  const projected: Vec2[] = [];
  for (const local of locals) {
    const point = projectToStage(transformLocal(local, pose.yaw, pose.pitch), pose, aspect);
    if (!point) return null;
    projected.push(point);
  }
  const xs = projected.map((p) => p.leftPct);
  const ys = projected.map((p) => p.topPct);
  const artLeftPct = Math.min(...xs);
  const artRightPct = Math.max(...xs);
  const artTopPct = Math.min(...ys);
  const artBottomPct = Math.max(...ys);
  if (artRightPct - artLeftPct < 4 || artBottomPct - artTopPct < 4) return null;

  const width = Math.max(1, stageWidthPx);
  const gapPx = Math.min(126, Math.max(90, width * 0.07));
  const gapPct = (gapPx / width) * 100;

  return {
    leftPct: artRightPct + gapPct,
    topPct: (artTopPct + artBottomPct) / 2,
    artLeftPct,
    artRightPct,
    artTopPct,
    artBottomPct,
  };
}
