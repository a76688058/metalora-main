import {
  EDGE_COPY_IN_END,
  EDGE_COPY_IN_START,
  EDGE_COPY_OUT_END,
  EDGE_COPY_OUT_START,
  EDGE_DISCLOSURE_IN_END,
  EDGE_DISCLOSURE_IN_START,
  EDGE_DISCLOSURE_OUT_END,
  EDGE_DISCLOSURE_OUT_START,
  MAGNETIC_CALLOUT_ORDER,
  STORY_ANATOMY_LAYER_ORDER,
  SURFACE_REST_AMOUNT,
  SURFACE_WINDOWS,
  EDGE_WINDOWS,
  type PdpStoryBeatId,
  type StoryAnatomyLayerId,
} from './constants';
import {
  layoutCompactInfographicCallouts,
  MAGNETIC_CALLOUT_LINE_SPAN,
  type MagneticCalloutChannels,
  type MagneticCalloutLayout,
} from './magneticLabels';
import { surfaceStatementAt } from './surfaceStatement';
import { surfaceSweepAt } from './surfaceSweep';

/**
 * Compact cinematic travel. Ratios follow desktop 120/140/180 without
 * copying the desktop vh literally.
 */
export const MOBILE_STORY_BEAT_VH: Record<PdpStoryBeatId, number> = {
  surface: 80,
  edge: 100,
  magnetic: 220,
};

export function getMobileStoryTravelVh(): number {
  return MOBILE_STORY_BEAT_VH.surface + MOBILE_STORY_BEAT_VH.edge + MOBILE_STORY_BEAT_VH.magnetic;
}

/**
 * Mobile-only additive tail AFTER the 400vh core. Must not fold into
 * MOBILE_STORY_BEAT_VH or beat ranges — that would stretch SURFACE / EDGE / MAG.
 * 10vh settle + 6vh hold.
 */
export const MOBILE_STORY_TAIL_VH = 16;
export const MOBILE_STORY_TAIL_SETTLE_END = 10 / 16;

export function getMobileStorySectionTravelVh(): number {
  return getMobileStoryTravelVh() + MOBILE_STORY_TAIL_VH;
}

export function splitMobileStoryProgress(raw01: number): { core: number; tail: number } {
  const core = getMobileStoryTravelVh();
  const total = getMobileStorySectionTravelVh();
  const coreShare = core / Math.max(1, total);
  const p = clamp01(raw01);
  if (p <= coreShare) return { core: p / coreShare, tail: 0 };
  return { core: 1, tail: (p - coreShare) / Math.max(0.0001, 1 - coreShare) };
}

function beatRanges(): Record<PdpStoryBeatId, { start: number; end: number }> {
  const total = getMobileStoryTravelVh();
  let cursor = 0;
  const ranges = {
    surface: { start: 0, end: 0 },
    edge: { start: 0, end: 0 },
    magnetic: { start: 0, end: 0 },
  };
  for (const beat of ['surface', 'edge', 'magnetic'] as const) {
    const share = MOBILE_STORY_BEAT_VH[beat] / total;
    ranges[beat] = { start: cursor, end: cursor + share };
    cursor += share;
  }
  return ranges;
}

export const MOBILE_STORY_BEATS = beatRanges();

/**
 * Front-facing exploded scene. Desktop separates the stack ONLY along panel-local
 * −Z (toward the wall); the diagonal spread on screen is purely the 3/4 camera.
 * Mobile reproduces that: layers translate along local Z, and a shared rig rotation
 * supplies the same artwork-front 3/4 as desktop R9 (wall on the right).
 */
const LAYER_DEPTH: Record<StoryAnatomyLayerId, number> = {
  artwork: 0,
  artMagnet: -0.88,
  wallMagnet: -2.02,
  sticker: -2.92,
  wall: -3.58,
};

/**
 * Compact MAGNETIC pose. Desktop R9 yaw is −(π − 2.45) ≈ −39.6° with pitch 0.16 rad.
 * Same artwork-front 3/4 (wall on the right). Scale is smaller for portrait gutters.
 *
 * MAG windows are mobile-local. Do not read MAGNETIC_WINDOWS_DESKTOP — coupling
 * ty to desktop fan made the stack drift up while copy was already on.
 */
const MAG_DEPTH_SCALE = 0.44;
const MAG_YAW = -40;
const MAG_PITCH = 9;
const MAG_SCALE = 0.64;
const MAG_FRONT_YAW = 0;
const MAG_FRONT_PITCH = 2;
const MAG_FRONT_TY = -8;
/** Group re-centering while exploded (desktop uses centerPose for the same reason). */
const MAG_CENTER_TX = -36;
const MAG_CENTER_TY = -48;

/**
 * Plate-local UV (origin top-left of that layer's DOM). Chosen for the
 * labelled-hold 3/4 (wall on the right) so each point sits on an exposed face,
 * not on a neighbor or in a gap. Markers inherit the plate's CSS 3D transform.
 */
export const MOBILE_MAG_LAYER_ANCHOR: Record<StoryAnatomyLayerId, { x: number; y: number }> = {
  artwork: { x: 0.16, y: 0.56 },
  artMagnet: { x: 0.84, y: 0.6 },
  wallMagnet: { x: 0.62, y: 0.52 },
  sticker: { x: 0.82, y: 0.2 },
  wall: { x: 0.9, y: 0.68 },
};

/** Assemble in place → explode → still → callouts. Compress after copy/callouts out. */
const MOBILE_MAG_WINDOWS = {
  assembleEnd: 0.16,
  fanOutEnd: 0.4,
  holdEnd: 0.86,
  compressEnd: 0.975,
} as const;

const MOBILE_MAG_CALLOUT = {
  start: 0.48,
  stagger: 0.042,
  pulseDur: 0.018,
  lineDur: 0.018,
  labelDur: 0.014,
  outStart: 0.78,
  outEnd: 0.84,
  pulseScale: 0.016,
} as const;
/** Perspective the CSS scene uses. Kept here so labels can billboard consistently. */
export const MOBILE_PERSPECTIVE_PX = 1600;

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

function copyPulse(p: number, inStart: number, inEnd: number, outStart: number, outEnd: number): number {
  return remap(p, inStart, inEnd, easeStop) * (1 - remap(p, outStart, outEnd, easeStop));
}

function follow(amount: number, delay: number, duration: number): number {
  return easeStop(clamp01((amount - delay) / duration));
}

function localOf(p: number, beat: PdpStoryBeatId): number {
  const { start, end } = MOBILE_STORY_BEATS[beat];
  return clamp01((p - start) / Math.max(0.0001, end - start));
}

function fanAmountAt(p: number): number {
  const { assembleEnd, fanOutEnd, holdEnd, compressEnd } = MOBILE_MAG_WINDOWS;
  if (p <= assembleEnd) return 0;
  if (p <= fanOutEnd) return remap(p, assembleEnd, fanOutEnd, easeStop);
  if (p <= holdEnd) return 1;
  if (p <= compressEnd) return 1 - remap(p, holdEnd, compressEnd, easeStop);
  return 0;
}

function mobileCalloutChannelsAt(progress: number): MagneticCalloutChannels {
  const p = clamp01(progress);
  const { start, stagger, pulseDur, lineDur, labelDur, outStart, outEnd } = MOBILE_MAG_CALLOUT;
  const fade = 1 - remap(p, outStart, outEnd, (t) => t);
  const pulse = zeroLayers();
  const line = zeroLayers();
  const label = zeroLayers();
  const highlight = zeroLayers();
  MAGNETIC_CALLOUT_ORDER.forEach((id, index) => {
    const t0 = start + index * stagger;
    const pulseT = remap(p, t0, t0 + pulseDur, (t) => t);
    pulse[id] = pulseT > 0 && pulseT < 1 ? Math.sin(Math.PI * pulseT) : 0;
    const lineStart = t0 + pulseDur * 0.45;
    line[id] = easeStop(remap(p, lineStart, lineStart + lineDur, (t) => t)) * fade;
    const labelStart = lineStart + lineDur * 0.4;
    label[id] = easeStop(remap(p, labelStart, labelStart + labelDur, (t) => t)) * fade;
    const explainEnd = labelStart + labelDur;
    const rise = easeStop(remap(p, t0, t0 + pulseDur * 0.4, (t) => t));
    const fall = 1 - remap(p, explainEnd, explainEnd + 0.016, (t) => t);
    highlight[id] = rise * fall * fade;
  });
  return { pulse, line, label, highlight };
}

function surfaceAmount(local: number): number {
  const { contextEnd, peakAt, calmStart } = SURFACE_WINDOWS;
  if (local <= contextEnd) return 0.03 * remap(local, 0, contextEnd);
  if (local <= peakAt) return 0.03 + 0.97 * remap(local, contextEnd, peakAt);
  if (local >= calmStart) return SURFACE_REST_AMOUNT;
  return 1 - (1 - SURFACE_REST_AMOUNT) * remap(local, peakAt, calmStart, easeStop);
}

function zeroLayers(): Record<StoryAnatomyLayerId, number> {
  return { wall: 0, sticker: 0, wallMagnet: 0, artMagnet: 0, artwork: 0 };
}

/**
 * Screen-space pose. `yaw`/`pitch` are the shared rig rotation (deg).
 * SURFACE ~1–9° frontal grazing. EDGE is a moderate ~29° 3/4 hold
 * (desktop yaw −0.50 rad, right edge toward camera), not an edge-glued
 * macro crop. MAGNETIC turns to the shared 3/4 and holds it for the explosion.
 */
function lerpPoseState(
  a: {
    yaw: number;
    pitch: number;
    scale: number;
    tx: number;
    ty: number;
    front: number;
    reverse: number;
    edge: number;
  },
  b: typeof a,
  t: number,
): typeof a {
  return {
    yaw: lerp(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
    scale: lerp(a.scale, b.scale, t),
    tx: lerp(a.tx, b.tx, t),
    ty: lerp(a.ty, b.ty, t),
    front: lerp(a.front, b.front, t),
    reverse: lerp(a.reverse, b.reverse, t),
    edge: lerp(a.edge, b.edge, t),
  };
}

function poseAt(p: number): {
  yaw: number;
  pitch: number;
  scale: number;
  tx: number;
  ty: number;
  front: number;
  reverse: number;
  edge: number;
} {
  const surface = localOf(p, 'surface');
  const edge = localOf(p, 'edge');
  const magnetic = localOf(p, 'magnetic');
  const { start: edgeStart } = MOBILE_STORY_BEATS.edge;
  const { start: magStart } = MOBILE_STORY_BEATS.magnetic;

  if (p <= edgeStart) {
    const amount = surfaceAmount(surface);
    return {
      yaw: lerp(2, 9, amount),
      pitch: 0,
      scale: lerp(0.9, 1.04, amount),
      tx: lerp(0, -2, amount),
      ty: lerp(-2, -1, amount),
      front: 1,
      reverse: 0,
      edge: lerp(0.28, 0.55, amount),
    };
  }

  if (p <= magStart) {
    const { approachEnd, holdEnd, restoreEnd } = EDGE_WINDOWS;
    const wide = typeof window !== 'undefined' && window.innerWidth >= 768;
    const fromSurf = {
      yaw: 8.2,
      pitch: 0,
      scale: 1.028,
      tx: -1.8,
      ty: -1.2,
      front: 1,
      reverse: 0,
      edge: 0.55,
    };
    const peak = {
      yaw: -32,
      pitch: 1.6,
      scale: 1.1,
      tx: wide ? -32 : -2,
      ty: wide ? -6 : -18,
      front: 1,
      reverse: 0,
      edge: 0.62,
    };
    const toMag = {
      yaw: 10,
      pitch: 0,
      scale: 0.98,
      tx: 0,
      ty: -2,
      front: 1,
      reverse: 0,
      edge: 0.4,
    };
    if (edge <= approachEnd) {
      return lerpPoseState(fromSurf, peak, remap(edge, 0, approachEnd));
    }
    if (edge <= holdEnd) {
      return peak;
    }
    if (edge <= restoreEnd) {
      return lerpPoseState(peak, toMag, remap(edge, holdEnd, restoreEnd, easeStop));
    }
    return toMag;
  }

  const { assembleEnd } = MOBILE_MAG_WINDOWS;
  const fan = fanAmountAt(magnetic);
  const cx = fan >= 0.2 ? MAG_CENTER_TX : MAG_CENTER_TX * (fan / 0.2);
  const cy = MAG_CENTER_TY;
  if (magnetic <= assembleEnd) {
    const t = remap(magnetic, 0, assembleEnd);
    return {
      yaw: lerp(10, MAG_YAW, t),
      pitch: lerp(0, MAG_PITCH, t),
      scale: lerp(0.98, MAG_SCALE, t),
      tx: 0,
      ty: lerp(-2, MAG_CENTER_TY, t),
      front: 1,
      reverse: 0,
      edge: lerp(0.4, 0.1, t),
    };
  }
  return {
    yaw: MAG_YAW,
    pitch: MAG_PITCH,
    scale: MAG_SCALE,
    tx: cx,
    ty: cy,
    front: 1,
    reverse: 0,
    edge: 0.1,
  };
}

export type MobileStoryVisual = {
  progress: number;
  beat: PdpStoryBeatId;
  yaw: number;
  pitch: number;
  scale: number;
  tx: number;
  ty: number;
  front: number;
  reverse: number;
  edge: number;
  layerOpacity: number;
  layerZ: Record<StoryAnatomyLayerId, number>;
  labelOpacity: Record<StoryAnatomyLayerId, number>;
  layerLine: Record<StoryAnatomyLayerId, number>;
  layerPulse: Record<StoryAnatomyLayerId, number>;
  layerHighlight: Record<StoryAnatomyLayerId, number>;
  surfaceCopy: number;
  statementOpacity: number;
  statementTranslateY: number;
  statementScale: number;
  scrim: number;
  sweepOpacity: number;
  sweepTravel: number;
  edgeCopy: number;
  disclosure: number;
  magneticCopy: number;
  stackCopy: number;
  explodeDisclosure: number;
  detachDisclosure: number;
  wallSpread: number;
  tail: number;
};

export function createMobileVisual(): MobileStoryVisual {
  return {
    progress: 0,
    beat: 'surface',
    yaw: 2,
    pitch: 0,
    scale: 0.9,
    tx: 0,
    ty: -2,
    front: 1,
    reverse: 0,
    edge: 0.28,
    layerOpacity: 0,
    layerZ: zeroLayers(),
    labelOpacity: zeroLayers(),
    layerLine: zeroLayers(),
    layerPulse: zeroLayers(),
    layerHighlight: zeroLayers(),
    surfaceCopy: 0,
    statementOpacity: 0,
    statementTranslateY: 14,
    statementScale: 0.99,
    scrim: 0,
    sweepOpacity: 0,
    sweepTravel: 0,
    edgeCopy: 0,
    disclosure: 0,
    magneticCopy: 0,
    stackCopy: 0,
    explodeDisclosure: 0,
    detachDisclosure: 0,
    wallSpread: 0,
    tail: 0,
  };
}

export function mobileVisualAt(progress: number, out: MobileStoryVisual = createMobileVisual()): MobileStoryVisual {
  const raw = clamp01(progress);
  const { core: p, tail } = splitMobileStoryProgress(raw);
  const beat: PdpStoryBeatId =
    p < MOBILE_STORY_BEATS.edge.start
      ? 'surface'
      : p < MOBILE_STORY_BEATS.magnetic.start
        ? 'edge'
        : 'magnetic';
  const pose = poseAt(p);
  const surface = localOf(p, 'surface');
  const edge = localOf(p, 'edge');
  const magnetic = localOf(p, 'magnetic');
  const inMagnetic = beat === 'magnetic';
  const inTail = tail > 0.0001;
  const fan = inMagnetic && !inTail ? fanAmountAt(magnetic) : 0;
  const wallSpread = follow(fan, 0, 0.62);
  const stickerSpread = follow(fan, 0.1, 0.62);
  const wallMagnetSpread = follow(fan, 0.22, 0.62);
  const artMagnetSpread = follow(fan, 0.38, 0.62);

  out.layerZ.wall = LAYER_DEPTH.wall * MAG_DEPTH_SCALE * wallSpread;
  out.layerZ.sticker = LAYER_DEPTH.sticker * MAG_DEPTH_SCALE * stickerSpread;
  out.layerZ.wallMagnet = LAYER_DEPTH.wallMagnet * MAG_DEPTH_SCALE * wallMagnetSpread;
  out.layerZ.artMagnet = LAYER_DEPTH.artMagnet * MAG_DEPTH_SCALE * artMagnetSpread;
  out.layerZ.artwork = 0;

  if (inMagnetic && !inTail) {
    const callout = mobileCalloutChannelsAt(magnetic);
    for (const id of STORY_ANATOMY_LAYER_ORDER) {
      out.labelOpacity[id] = callout.label[id];
      out.layerLine[id] = callout.line[id];
      out.layerPulse[id] = callout.pulse[id];
      out.layerHighlight[id] = callout.highlight[id];
    }
  } else {
    for (const id of STORY_ANATOMY_LAYER_ORDER) {
      out.labelOpacity[id] = 0;
      out.layerLine[id] = 0;
      out.layerPulse[id] = 0;
      out.layerHighlight[id] = 0;
    }
  }

  out.progress = p;
  out.tail = tail;
  out.beat = beat;
  out.yaw = pose.yaw;
  out.pitch = pose.pitch;
  out.scale = pose.scale;
  out.tx = pose.tx;
  out.ty = pose.ty;
  out.front = pose.front;
  out.reverse = pose.reverse;
  out.edge = pose.edge;
  out.layerOpacity = inMagnetic ? remap(magnetic, 0, 0.12, easeStop) : 0;
  const statement = surfaceStatementAt(surface, beat === 'surface');
  const sweep = surfaceSweepAt(surface, beat === 'surface');
  out.surfaceCopy = statement.opacity;
  out.statementOpacity = statement.opacity;
  out.statementTranslateY = statement.translateY;
  out.statementScale = statement.scale;
  out.scrim = statement.scrim;
  out.sweepOpacity = sweep.opacity;
  out.sweepTravel = sweep.travel;
  out.edgeCopy =
    beat === 'edge'
      ? copyPulse(edge, EDGE_COPY_IN_START, EDGE_COPY_IN_END, EDGE_COPY_OUT_START, EDGE_COPY_OUT_END)
      : 0;
  out.disclosure =
    beat === 'edge'
      ? copyPulse(
          edge,
          EDGE_DISCLOSURE_IN_START,
          EDGE_DISCLOSURE_IN_END,
          EDGE_DISCLOSURE_OUT_START,
          EDGE_DISCLOSURE_OUT_END,
        )
      : 0;
  out.magneticCopy = inMagnetic && !inTail ? copyPulse(magnetic, 0.4, 0.5, 0.74, 0.83) : 0;
  out.stackCopy = inMagnetic && !inTail ? copyPulse(magnetic, 0.46, 0.54, 0.73, 0.82) : 0;
  out.explodeDisclosure = inMagnetic && !inTail ? copyPulse(magnetic, 0.48, 0.56, 0.73, 0.82) : 0;
  out.detachDisclosure = inMagnetic && !inTail ? copyPulse(magnetic, 0.5, 0.58, 0.73, 0.82) : 0;
  out.wallSpread = wallSpread;
  if (inTail) {
    const t = remap(tail, 0, MOBILE_STORY_TAIL_SETTLE_END, easeStop);
    out.yaw = lerp(MAG_YAW, MAG_FRONT_YAW, t);
    out.pitch = lerp(MAG_PITCH, MAG_FRONT_PITCH, t);
    out.scale = MAG_SCALE;
    out.tx = 0;
    out.ty = lerp(MAG_CENTER_TY, MAG_FRONT_TY, t);
    out.edge = lerp(0.1, 0.28, t);
    out.layerOpacity = 1 - t;
    for (const id of STORY_ANATOMY_LAYER_ORDER) {
      out.labelOpacity[id] = 0;
      out.layerLine[id] = 0;
      out.layerPulse[id] = 0;
      out.layerHighlight[id] = 0;
    }
  }
  return out;
}

export type MobileStoryEls = {
  stage: HTMLElement;
  envelope: HTMLElement;
  rig: HTMLElement;
  front: HTMLElement;
  reverse: HTMLElement;
  edge: HTMLElement;
  plates: Record<StoryAnatomyLayerId, HTMLElement>;
  layerAnchors: Record<StoryAnatomyLayerId, HTMLElement>;
  labels: Record<StoryAnatomyLayerId, HTMLElement>;
  lines: Record<StoryAnatomyLayerId, SVGPathElement>;
  dots: Record<StoryAnatomyLayerId, HTMLElement>;
  glints: Record<StoryAnatomyLayerId, HTMLElement>;
  copySurface: HTMLElement;
  edgeH: HTMLElement;
  edgeB: HTMLElement;
  edgeD: HTMLElement;
  magH: HTMLElement;
  magK: HTMLElement;
  magX: HTMLElement;
  magT: HTMLElement;
  surfaceScrim: HTMLElement;
  surfaceSweep: HTMLElement;
};

export function collectMobileStoryEls(stage: HTMLElement): MobileStoryEls | null {
  const get = (name: string) => stage.querySelector<HTMLElement>(`[data-ms="${name}"]`);
  const envelope = get('envelope');
  const rig = get('rig');
  const front = get('front');
  const reverse = get('reverse');
  const edge = get('edge');
  const copySurface = get('copy-s');
  const edgeH = get('edge-h');
  const edgeB = get('edge-b');
  const edgeD = get('edge-d');
  const magH = get('mag-h');
  const magK = get('mag-k');
  const magX = get('mag-x');
  const magT = get('mag-t');
  const surfaceScrim = get('surface-scrim');
  const surfaceSweep = get('surface-sweep');
  const wall = get('plate-wall');
  const sticker = get('plate-sticker');
  const wallMagnet = get('plate-wm');
  const artMagnet = get('plate-am');
  const artwork = get('plate-art');
  const layerAnchorWall = wall?.querySelector<HTMLElement>('[data-ms="layer-anchor"]') ?? null;
  const layerAnchorSticker = sticker?.querySelector<HTMLElement>('[data-ms="layer-anchor"]') ?? null;
  const layerAnchorWm = wallMagnet?.querySelector<HTMLElement>('[data-ms="layer-anchor"]') ?? null;
  const layerAnchorAm = artMagnet?.querySelector<HTMLElement>('[data-ms="layer-anchor"]') ?? null;
  const layerAnchorArt = artwork?.querySelector<HTMLElement>('[data-ms="layer-anchor"]') ?? null;
  const labelWall = get('label-wall');
  const labelSticker = get('label-sticker');
  const labelWm = get('label-wm');
  const labelAm = get('label-am');
  const labelArt = get('label-art');
  const lineWall = stage.querySelector<SVGPathElement>('[data-ms="line-wall"]');
  const lineSticker = stage.querySelector<SVGPathElement>('[data-ms="line-sticker"]');
  const lineWm = stage.querySelector<SVGPathElement>('[data-ms="line-wm"]');
  const lineAm = stage.querySelector<SVGPathElement>('[data-ms="line-am"]');
  const lineArt = stage.querySelector<SVGPathElement>('[data-ms="line-art"]');
  const dotWall = get('dot-wall');
  const dotSticker = get('dot-sticker');
  const dotWm = get('dot-wm');
  const dotAm = get('dot-am');
  const dotArt = get('dot-art');
  const glintWall = get('glint-wall');
  const glintSticker = get('glint-sticker');
  const glintWm = get('glint-wm');
  const glintAm = get('glint-am');
  const glintArt = get('glint-art');
  if (
    !envelope ||
    !rig ||
    !front ||
    !reverse ||
    !edge ||
    !copySurface ||
    !edgeH ||
    !edgeB ||
    !edgeD ||
    !magH ||
    !magK ||
    !magX ||
    !magT ||
    !surfaceScrim ||
    !surfaceSweep ||
    !wall ||
    !sticker ||
    !wallMagnet ||
    !artMagnet ||
    !artwork ||
    !layerAnchorWall ||
    !layerAnchorSticker ||
    !layerAnchorWm ||
    !layerAnchorAm ||
    !layerAnchorArt ||
    !labelWall ||
    !labelSticker ||
    !labelWm ||
    !labelAm ||
    !labelArt ||
    !lineWall ||
    !lineSticker ||
    !lineWm ||
    !lineAm ||
    !lineArt ||
    !dotWall ||
    !dotSticker ||
    !dotWm ||
    !dotAm ||
    !dotArt ||
    !glintWall ||
    !glintSticker ||
    !glintWm ||
    !glintAm ||
    !glintArt
  ) {
    return null;
  }
  return {
    stage,
    envelope,
    rig,
    front,
    reverse,
    edge,
    plates: { wall, sticker, wallMagnet, artMagnet, artwork },
    layerAnchors: {
      wall: layerAnchorWall,
      sticker: layerAnchorSticker,
      wallMagnet: layerAnchorWm,
      artMagnet: layerAnchorAm,
      artwork: layerAnchorArt,
    },
    labels: {
      wall: labelWall,
      sticker: labelSticker,
      wallMagnet: labelWm,
      artMagnet: labelAm,
      artwork: labelArt,
    },
    lines: {
      wall: lineWall,
      sticker: lineSticker,
      wallMagnet: lineWm,
      artMagnet: lineAm,
      artwork: lineArt,
    },
    dots: {
      wall: dotWall,
      sticker: dotSticker,
      wallMagnet: dotWm,
      artMagnet: dotAm,
      artwork: dotArt,
    },
    glints: {
      wall: glintWall,
      sticker: glintSticker,
      wallMagnet: glintWm,
      artMagnet: glintAm,
      artwork: glintArt,
    },
    copySurface,
    edgeH,
    edgeB,
    edgeD,
    magH,
    magK,
    magX,
    magT,
    surfaceScrim,
    surfaceSweep,
  };
}

function opacityTransform(el: HTMLElement, opacity: number, rise: number): void {
  el.style.opacity = opacity.toFixed(4);
  el.style.transform = `translate3d(0, ${((1 - opacity) * rise).toFixed(2)}px, 0)`;
}

const PLATE_IDS: StoryAnatomyLayerId[] = [
  'wall',
  'sticker',
  'wallMagnet',
  'artMagnet',
  'artwork',
];

/** Peak overlay opacity so the sheen reads on both dark magnets and light plaster. */
const GLINT_GAIN: Record<StoryAnatomyLayerId, number> = {
  wall: 0.7,
  sticker: 0.7,
  wallMagnet: 0.95,
  artMagnet: 0.95,
  artwork: 0.55,
};

function parseTransformOrigin(origin: string): { x: number; y: number; z: number } {
  const parts = origin.split(' ');
  return {
    x: Number.parseFloat(parts[0] ?? '0') || 0,
    y: Number.parseFloat(parts[1] ?? '0') || 0,
    z: Number.parseFloat(parts[2] ?? '0') || 0,
  };
}

function perspectiveMatrix(distance: number): DOMMatrix {
  return new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / distance, 0, 0, 0, 1]);
}

function applyElementTransform(el: HTMLElement, point: DOMPoint): DOMPoint {
  const style = getComputedStyle(el);
  const origin = parseTransformOrigin(style.transformOrigin);
  const raw = style.transform;
  const local = !raw || raw === 'none' ? new DOMMatrix() : new DOMMatrix(raw);
  const composed = new DOMMatrix()
    .translate(origin.x, origin.y, origin.z)
    .multiply(local)
    .translate(-origin.x, -origin.y, -origin.z);
  return point.matrixTransform(composed);
}

/**
 * Project a plate-local UV through the live envelope perspective + rig/plate
 * CSS 3D matrices. Child getBoundingClientRect is the AABB of a 2px marker and
 * is not the painted parallelogram, so it cannot own MAGNETIC anchors.
 */
function projectPlateUvToOverlay(
  plate: HTMLElement,
  uv: { x: number; y: number },
  overlay: HTMLElement,
): { leftPct: number; topPct: number } {
  const envelope = plate.closest<HTMLElement>('[data-ms="envelope"]');
  const rig = plate.closest<HTMLElement>('[data-ms="rig"]');
  const box = overlay.getBoundingClientRect();
  if (!envelope || !rig) {
    return { leftPct: 50, topPct: 50 };
  }
  let point = new DOMPoint(uv.x * plate.offsetWidth, uv.y * plate.offsetHeight, 0, 1);
  point = applyElementTransform(plate, point);
  point = new DOMPoint(point.x + plate.offsetLeft, point.y + plate.offsetTop, point.z, point.w);
  point = applyElementTransform(rig, point);
  point = new DOMPoint(point.x + rig.offsetLeft, point.y + rig.offsetTop, point.z, point.w);
  const envStyle = getComputedStyle(envelope);
  const perspective = Number.parseFloat(envStyle.perspective);
  if (Number.isFinite(perspective) && perspective > 0) {
    const origin = parseTransformOrigin(envStyle.perspectiveOrigin);
    const persp = new DOMMatrix()
      .translate(origin.x, origin.y)
      .multiply(perspectiveMatrix(perspective))
      .translate(-origin.x, -origin.y);
    point = point.matrixTransform(persp);
  }
  const w = point.w || 1;
  const envBox = envelope.getBoundingClientRect();
  const screenX = point.x / w + envBox.left;
  const screenY = point.y / w + envBox.top;
  return {
    leftPct: ((screenX - box.left) / Math.max(1, box.width)) * 100,
    topPct: ((screenY - box.top) / Math.max(1, box.height)) * 100,
  };
}

function mobileCalloutLanes(viewportWidth: number): { leftX: number; rightX: number } {
  if (viewportWidth >= 768) return { leftX: 14, rightX: 86 };
  if (viewportWidth >= 430) return { leftX: 16, rightX: 80 };
  return { leftX: 18, rightX: 78 };
}

function layoutMobileMagneticCallouts(
  projected: { id: StoryAnatomyLayerId; leftPct: number; topPct: number }[],
  viewportWidth: number,
): MagneticCalloutLayout[] {
  const { leftX, rightX } = mobileCalloutLanes(viewportWidth);
  return layoutCompactInfographicCallouts(projected, viewportWidth).map((item) => {
    const ax = item.ax;
    const ay = item.ay;
    const lx = item.side === 'left' ? leftX : rightX;
    if (item.id === 'artwork') {
      return {
        ...item,
        lx,
        ly: ay,
        path: `M ${ax.toFixed(2)} ${ay.toFixed(2)} H ${lx.toFixed(2)}`,
      };
    }
    if (item.id === 'wall') {
      /* Straight H. Label Y follows the plaster point so the right-side
         stack reads 보호 스티커 → 벽 → 벽면 자석. */
      return {
        ...item,
        lx,
        ly: ay,
        path: `M ${ax.toFixed(2)} ${ay.toFixed(2)} H ${lx.toFixed(2)}`,
      };
    }
    if (item.id === 'wallMagnet') {
      const ly = Math.min(54, Math.max(ay + 16, 50));
      return {
        ...item,
        lx,
        ly,
        path: `M ${ax.toFixed(2)} ${ay.toFixed(2)} V ${ly.toFixed(2)} H ${lx.toFixed(2)}`,
      };
    }
    if (item.id === 'artMagnet') {
      const ly = Math.min(item.ly, 16);
      return {
        ...item,
        lx,
        ly,
        path: `M ${ax.toFixed(2)} ${ay.toFixed(2)} V ${ly.toFixed(2)} H ${lx.toFixed(2)}`,
      };
    }
    if (item.id === 'sticker') {
      const ly = Math.min(item.ly, 16);
      return {
        ...item,
        lx,
        ly,
        path: `M ${ax.toFixed(2)} ${ay.toFixed(2)} V ${ly.toFixed(2)} H ${lx.toFixed(2)}`,
      };
    }
    return {
      ...item,
      lx,
      path: `M ${ax.toFixed(2)} ${ay.toFixed(2)} V ${item.ly.toFixed(2)} H ${lx.toFixed(2)}`,
    };
  });
}

export function applyMobileStory(els: MobileStoryEls, visual: MobileStoryVisual): void {
  const yaw = visual.yaw;
  const pitch = visual.pitch;
  const s = visual.scale;
  els.rig.style.transform = `translate(-50%, -50%) translate3d(${visual.tx.toFixed(3)}%, ${visual.ty.toFixed(3)}%, 0) rotateX(${pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg) scale(${s.toFixed(4)})`;
  els.front.style.opacity = visual.front.toFixed(4);
  els.reverse.style.opacity = visual.reverse.toFixed(4);
  els.edge.style.opacity = visual.edge.toFixed(4);
  els.edge.style.transform = `scaleX(${(0.7 + visual.edge * 0.5).toFixed(3)})`;
  els.stage.dataset.pdpStoryProgress = visual.progress.toFixed(3);
  els.stage.dataset.pdpStoryTail = visual.tail.toFixed(3);
  els.stage.dataset.pdpStoryScrim = visual.scrim.toFixed(3);
  els.stage.dataset.pdpStorySweep = visual.sweepOpacity.toFixed(3);
  els.stage.dataset.pdpStoryYaw = visual.yaw.toFixed(2);
  els.stage.dataset.pdpStoryScale = visual.scale.toFixed(3);

  const anatomyLive = visual.layerOpacity > 0.001 || visual.wallSpread > 0;
  if (anatomyLive || els.stage.dataset.msAnatomy === '1') {
    for (const id of PLATE_IDS) {
      const node = els.plates[id];
      const pulseScale = 1 + MOBILE_MAG_CALLOUT.pulseScale * visual.layerPulse[id];
      const hi = visual.layerHighlight[id];
      if (id === 'artwork') {
        node.style.transform = `scale(${pulseScale.toFixed(4)})`;
      } else {
        node.style.opacity = visual.layerOpacity.toFixed(4);
        node.style.transform = `translate(-50%, -50%) translateZ(calc(var(--panel-w) * ${visual.layerZ[id].toFixed(4)})) scale(${pulseScale.toFixed(4)})`;
      }
      const glint = els.glints[id];
      glint.style.opacity = (hi * GLINT_GAIN[id]).toFixed(4);
      glint.style.transform = `translate3d(${((hi - 0.5) * 8).toFixed(2)}%, 0, 0)`;
    }
    els.stage.dataset.msAnatomy = anatomyLive ? '1' : '0';
  }

  const labelsLive = STORY_ANATOMY_LAYER_ORDER.some(
    (id) => visual.labelOpacity[id] > 0.001 || visual.layerLine[id] > 0.001,
  );
  if (labelsLive || els.stage.dataset.msLabels === '1') {
    const overlay = els.dots.artwork.parentElement ?? els.stage;
    const anchors = STORY_ANATOMY_LAYER_ORDER.map((id) => {
      const point = projectPlateUvToOverlay(els.plates[id], MOBILE_MAG_LAYER_ANCHOR[id], overlay);
      return { id, leftPct: point.leftPct, topPct: point.topPct };
    });
    const callouts = layoutMobileMagneticCallouts(anchors, window.innerWidth);
    for (const callout of callouts) {
      const line = visual.layerLine[callout.id];
      const op = visual.labelOpacity[callout.id];
      const path = els.lines[callout.id];
      path.setAttribute('d', callout.path);
      path.style.opacity = line.toFixed(4);
      path.style.strokeDashoffset = ((1 - line) * MAGNETIC_CALLOUT_LINE_SPAN).toFixed(4);
      const dot = els.dots[callout.id];
      dot.style.opacity = line.toFixed(4);
      dot.style.left = `${callout.ax.toFixed(2)}%`;
      dot.style.top = `${callout.ay.toFixed(2)}%`;
      const node = els.labels[callout.id];
      node.style.opacity = op.toFixed(4);
      node.style.left = `${callout.lx.toFixed(2)}%`;
      node.style.top = `${callout.ly.toFixed(2)}%`;
      node.style.transform = `translate(${callout.side === 'left' ? '-100%' : '0'}, -50%)`;
      node.dataset.pdpStoryCalloutSide = callout.side;
    }
    els.stage.dataset.msLabels = labelsLive ? '1' : '0';
  }

  els.surfaceScrim.style.opacity = visual.scrim.toFixed(4);
  els.copySurface.style.opacity = visual.statementOpacity.toFixed(4);
  els.copySurface.style.transform = `translateY(${visual.statementTranslateY.toFixed(2)}px) scale(${visual.statementScale.toFixed(4)})`;
  const sweepX = lerp(118, -18, visual.sweepTravel);
  const sweepY = lerp(-18, 118, visual.sweepTravel);
  els.surfaceSweep.style.opacity = visual.sweepOpacity.toFixed(4);
  els.surfaceSweep.style.backgroundPosition = `${sweepX.toFixed(1)}% ${sweepY.toFixed(1)}%`;
  els.edgeH.style.opacity = visual.edgeCopy.toFixed(4);
  els.edgeB.style.opacity = visual.edgeCopy.toFixed(4);
  els.edgeD.style.opacity = visual.disclosure.toFixed(4);
  els.edgeH.style.transform = 'none';
  els.edgeB.style.transform = 'none';
  els.edgeD.style.transform = 'none';
  opacityTransform(els.magH, visual.magneticCopy, 10);
  opacityTransform(els.magK, visual.stackCopy, 8);
  opacityTransform(els.magX, visual.explodeDisclosure, 6);
  opacityTransform(els.magT, visual.detachDisclosure, 6);

  if (els.stage.dataset.pdpStoryBeat !== visual.beat) {
    els.stage.dataset.pdpStoryBeat = visual.beat;
  }
}
