import {
  MAGNETIC_CALLOUT,
  MAGNETIC_CALLOUT_DESKTOP,
  MAGNETIC_CALLOUT_ORDER,
  MAGNETIC_LAYER_LABELS,
  STORY_MM_PER_UNIT,
  STORY_PANEL_HEIGHT,
  STORY_PANEL_WIDTH,
  STORY_STICKER_HEIGHT_MM,
  STORY_STICKER_WIDTH_MM,
  STORY_WALL_FACE_SCALE,
  type StoryAnatomyLayerId,
  type SurfaceCameraPose,
} from './constants';

type Vec3 = [number, number, number];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function remap(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return clamp01((p - a) / (b - a));
}

function easeStop(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function zeroChannels(): Record<StoryAnatomyLayerId, number> {
  return { wall: 0, sticker: 0, wallMagnet: 0, artMagnet: 0, artwork: 0 };
}

export type MagneticCalloutChannels = {
  pulse: Record<StoryAnatomyLayerId, number>;
  line: Record<StoryAnatomyLayerId, number>;
  label: Record<StoryAnatomyLayerId, number>;
  highlight: Record<StoryAnatomyLayerId, number>;
};

function channelsFromSpec(
  progress: number,
  spec: {
    start: number;
    stagger: number;
    pulseDur: number;
    lineDur: number;
    labelDur: number;
    outStart: number;
    outEnd: number;
  },
): MagneticCalloutChannels {
  const p = clamp01(progress);
  const { start, stagger, pulseDur, lineDur, labelDur, outStart, outEnd } = spec;
  const fade = 1 - remap(p, outStart, outEnd);
  const pulse = zeroChannels();
  const line = zeroChannels();
  const label = zeroChannels();
  const highlight = zeroChannels();
  MAGNETIC_CALLOUT_ORDER.forEach((id, index) => {
    const t0 = start + index * stagger;
    const pulseT = remap(p, t0, t0 + pulseDur);
    pulse[id] = pulseT > 0 && pulseT < 1 ? Math.sin(Math.PI * pulseT) : 0;
    const lineStart = t0 + pulseDur * 0.45;
    line[id] = easeStop(remap(p, lineStart, lineStart + lineDur)) * fade;
    const labelStart = lineStart + lineDur * 0.4;
    label[id] = easeStop(remap(p, labelStart, labelStart + labelDur)) * fade;
    const explainEnd = labelStart + labelDur;
    const rise = easeStop(remap(p, t0, t0 + pulseDur * 0.4));
    const fall = 1 - remap(p, explainEnd, explainEnd + 0.016);
    highlight[id] = rise * fall * fade;
  });
  return { pulse, line, label, highlight };
}

/** Compact / shared. Process order: 벽 → 스티커 → 벽면 자석 → 액자 자석 → 액자. */
export function magneticCalloutChannelsAt(progress: number): MagneticCalloutChannels {
  return channelsFromSpec(progress, MAGNETIC_CALLOUT);
}

/** Desktop hold only. Slower stagger; highlight plateau while the item is explained. */
export function magneticDesktopCalloutChannelsAt(progress: number): MagneticCalloutChannels {
  return channelsFromSpec(progress, MAGNETIC_CALLOUT_DESKTOP);
}

type Vec2 = { leftPct: number; topPct: number };

function transformLocal(local: Vec3, yaw: number, pitch: number): Vec3 {
  const [x, y, z] = local;
  const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
  const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
  return [
    x * Math.cos(yaw) + z1 * Math.sin(yaw),
    y1,
    -x * Math.sin(yaw) + z1 * Math.cos(yaw),
  ];
}

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

/** User units. Oversized so non-scaling-stroke dash is never visible as gaps. */
export const MAGNETIC_CALLOUT_LINE_SPAN = 4000;

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

/** Left = product side, right = wall/sticker side. Avoids crossing the 3/4 stack. */
const CALLOUT_SIDE: Record<StoryAnatomyLayerId, 'left' | 'right'> = {
  artwork: 'left',
  artMagnet: 'left',
  wallMagnet: 'right',
  sticker: 'right',
  wall: 'right',
};

export type MagneticCalloutLayout = {
  id: StoryAnatomyLayerId;
  text: string;
  side: 'left' | 'right';
  ax: number;
  ay: number;
  lx: number;
  ly: number;
  path: string;
};

/** Desktop R9 was 11 / 91. Inward lanes shorten leaders without changing sides. */
const DESKTOP_LABEL_LEFT = 16.5;
const DESKTOP_LABEL_RIGHT = 84.5;

function labelColumnX(side: 'left' | 'right', compact: boolean): number {
  if (compact) return side === 'left' ? 18 : 82;
  return side === 'left' ? DESKTOP_LABEL_LEFT : DESKTOP_LABEL_RIGHT;
}

export function layoutCalloutsFromAnchors(
  projected: { id: StoryAnatomyLayerId; leftPct: number; topPct: number }[],
  compact = false,
): MagneticCalloutLayout[] {
  if (projected.length === 0) return [];
  const leftX = labelColumnX('left', compact);
  const rightX = labelColumnX('right', compact);
  const nudge = compact ? 1.6 : 2.2;
  const minGap = compact ? 6.2 : 4.6;
  const yMin = compact ? 14 : 20;
  const yMax = compact ? 62 : 58;
  const bySide = {
    left: projected.filter((item) => CALLOUT_SIDE[item.id] === 'left').sort((a, b) => a.topPct - b.topPct),
    right: projected.filter((item) => CALLOUT_SIDE[item.id] === 'right').sort((a, b) => a.topPct - b.topPct),
  };
  const placed: MagneticCalloutLayout[] = [];
  (['left', 'right'] as const).forEach((side) => {
    const column = bySide[side];
    let lastLy = -Infinity;
    column.forEach((item) => {
      const lx = side === 'left' ? leftX : rightX;
      const ax = item.leftPct + (side === 'left' ? -nudge : nudge);
      const ay = item.topPct;
      let ly = Math.min(yMax, Math.max(yMin, ay));
      if (ly < lastLy + minGap) ly = lastLy + minGap;
      ly = Math.min(yMax, ly);
      lastLy = ly;
      const elbow = side === 'left' ? lx + 3.2 : lx - 3.2;
      const aligned = Math.abs(ly - ay) < 0.55;
      const path = aligned
        ? `M ${ax.toFixed(2)} ${ay.toFixed(2)} H ${lx.toFixed(2)}`
        : `M ${ax.toFixed(2)} ${ay.toFixed(2)} H ${elbow.toFixed(2)} V ${ly.toFixed(2)} H ${lx.toFixed(2)}`;
      placed.push({
        id: item.id,
        text: MAGNETIC_LAYER_LABELS[item.id],
        side,
        ax,
        ay,
        lx,
        ly,
        path,
      });
    });
  });
  return placed;
}

/**
 * Matches PDP_FRAME_SCALE without importing the canvas module (compact = 0 WebGL).
 */
const FACE_SCALE = 1.8;

/**
 * Desktop plate-local XY. Centres / exposed faces — not the wall/sticker overlap
 * and not the artwork/magnet gap. Compact CSS 3D reuses the same local offsets.
 * Wall stays on the unboosted face so stack scale does not enlarge the plaster.
 */
function anchorLocal(id: StoryAnatomyLayerId, z: number, stackScale = 1): Vec3 {
  const face = FACE_SCALE * stackScale;
  const artHalfW = (STORY_PANEL_WIDTH * face) / 2;
  const stickerHalfW = ((STORY_STICKER_WIDTH_MM / STORY_MM_PER_UNIT) * face) / 2;
  const stickerHalfH = ((STORY_STICKER_HEIGHT_MM / STORY_MM_PER_UNIT) * face) / 2;
  const wallHalfW = ((STORY_PANEL_WIDTH * FACE_SCALE) / 2) * STORY_WALL_FACE_SCALE.x;
  const wallHalfH = ((STORY_PANEL_HEIGHT * FACE_SCALE) / 2) * STORY_WALL_FACE_SCALE.y;
  switch (id) {
    case 'artwork':
      return [-artHalfW * 0.92, 0, z];
    case 'artMagnet':
      return [0, 0, z];
    case 'wallMagnet':
      return [0, 0, z];
    case 'sticker':
      return [-stickerHalfW * 0.22, -stickerHalfH * 0.38, z];
    case 'wall':
      return [wallHalfW * 0.78, 0.02 * wallHalfH, z];
  }
}

/** Fixed desktop lanes so long horizontals never share a Y. */
const DESKTOP_LANE: Record<
  StoryAnatomyLayerId,
  { side: 'left' | 'right'; ly: number }
> = {
  artMagnet: { side: 'left', ly: 24 },
  artwork: { side: 'left', ly: 51 },
  sticker: { side: 'right', ly: 22 },
  wall: { side: 'right', ly: 40 },
  wallMagnet: { side: 'right', ly: 56 },
};

function desktopPath(
  id: StoryAnatomyLayerId,
  ax: number,
  ay: number,
  lx: number,
  ly: number,
): string {
  const axS = ax.toFixed(2);
  const ayS = ay.toFixed(2);
  const lxS = lx.toFixed(2);
  const lyS = ly.toFixed(2);
  if (id === 'artwork' || id === 'wall') {
    if (Math.abs(ly - ay) < 1.2) return `M ${axS} ${ayS} H ${lxS}`;
    const elbow = id === 'artwork' ? lx + 2.4 : lx - 2.4;
    return `M ${axS} ${ayS} H ${elbow.toFixed(2)} V ${lyS} H ${lxS}`;
  }
  if (id === 'artMagnet') {
    return `M ${axS} ${ayS} V ${lyS} H ${lxS}`;
  }
  if (id === 'sticker') {
    return `M ${axS} ${ayS} V ${lyS} H ${lxS}`;
  }
  /* wallMagnet: drop first from the plate centre, then right to the label. */
  return `M ${axS} ${ayS} V ${lyS} H ${lxS}`;
}

function layoutLaneCallouts(
  projected: { id: StoryAnatomyLayerId; leftPct: number; topPct: number }[],
  leftX: number,
  rightX: number,
): MagneticCalloutLayout[] {
  if (projected.length === 0) return [];
  return projected.map((item) => {
    const lane = DESKTOP_LANE[item.id];
    const lx = lane.side === 'left' ? leftX : rightX;
    const ly = lane.ly;
    return {
      id: item.id,
      text: MAGNETIC_LAYER_LABELS[item.id],
      side: lane.side,
      ax: item.leftPct,
      ay: item.topPct,
      lx,
      ly,
      path: desktopPath(item.id, item.leftPct, item.topPct, lx, ly),
    };
  });
}

function layoutDesktopCallouts(
  projected: { id: StoryAnatomyLayerId; leftPct: number; topPct: number }[],
): MagneticCalloutLayout[] {
  return layoutLaneCallouts(projected, DESKTOP_LABEL_LEFT, DESKTOP_LABEL_RIGHT).map((item) => {
    if (item.id !== 'artwork' && item.id !== 'wall') return item;
    const ly = item.ay;
    return {
      ...item,
      ly,
      path: `M ${item.ax.toFixed(2)} ${item.ay.toFixed(2)} H ${item.lx.toFixed(2)}`,
    };
  });
}

/**
 * Compact R10: same R9 lanes and routing, shorter portrait columns.
 * Desktop lanes live on DESKTOP_LABEL_LEFT / RIGHT; compact columns stay local.
 */
export function layoutCompactInfographicCallouts(
  projected: { id: StoryAnatomyLayerId; leftPct: number; topPct: number }[],
  viewportWidth: number,
): MagneticCalloutLayout[] {
  const leftX = viewportWidth >= 768 ? 14 : viewportWidth >= 430 ? 18 : 22;
  const rightX = viewportWidth >= 768 ? 86 : viewportWidth >= 430 ? 78 : 76;
  return layoutLaneCallouts(projected, leftX, rightX);
}

/**
 * Desktop infographic layout. Compact CSS 3D uses layoutCompactInfographicCallouts
 * (same lanes / desktopPath, shorter columns).
 */
export function layoutMagneticCallouts({
  layers,
  pose,
  aspect,
  compact = false,
  stackScale = 1,
}: {
  layers: { id: StoryAnatomyLayerId; z: number }[];
  pose: SurfaceCameraPose;
  aspect: number;
  compact?: boolean;
  stackScale?: number;
}): MagneticCalloutLayout[] {
  const projected = layers.flatMap((layer) => {
    const center = projectToStage(
      transformLocal(anchorLocal(layer.id, layer.z, compact ? 1 : stackScale), pose.yaw, pose.pitch),
      pose,
      aspect,
    );
    if (!center) return [];
    return [{ id: layer.id, ...center }];
  });
  if (compact) return layoutCompactInfographicCallouts(projected, 390);
  return layoutDesktopCallouts(projected);
}
