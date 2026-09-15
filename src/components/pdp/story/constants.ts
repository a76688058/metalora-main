/** 1 world unit = 210mm. Finished panel is 200 × 283 × 1.15mm — not A4. */
export const STORY_MM_PER_UNIT = 210;
export const STORY_PANEL_WIDTH_MM = 200;
export const STORY_PANEL_HEIGHT_MM = 283;
export const STORY_PANEL_THICKNESS_MM = 1.15;

export const STORY_PANEL_WIDTH = STORY_PANEL_WIDTH_MM / STORY_MM_PER_UNIT;
export const STORY_PANEL_HEIGHT = STORY_PANEL_HEIGHT_MM / STORY_MM_PER_UNIT;
/** Face size must not scale this. 1.15 / 210 ≈ 0.0055. */
export const STORY_PANEL_THICKNESS = 0.0055;

/** Real SKU face millimetres. Thickness of these parts is unmeasured. */
export const STORY_STICKER_WIDTH_MM = 190;
export const STORY_STICKER_HEIGHT_MM = 145;
export const STORY_MAGNET_SIZE_MM = 80;

/**
 * Authored anatomy role tones. Wall = receiving plane, sticker = light film,
 * magnets = dark squares, artwork reverse = unprinted aluminum.
 *
 * Single source for both the WebGL anatomy and the static story. The 3D rig
 * multiplies its own exposure factors on top of these to survive a compressive
 * tone curve; DOM uses them as authored.
 */
export const STORY_LAYER_TONES = {
  wall: '#bfc5cc',
  sticker: '#d9dde2',
  magnet: '#33373d',
  artworkReverse: '#8c8d91',
  /** Neutral rolled aluminum — not charcoal, not chrome, not pastel gray. */
  panelEdge: '#c4c8cd',
} as const;

/**
 * Motion Magnetic Anatomy wall only (desktop WebGL + mobile DOM).
 * Larger than the product face so it reads as a receiving surface, not a SKU.
 * Warm-neutral plaster, not metal. Not a measured wall dimension.
 * Static/reduced-motion keeps STORY_LAYER_TONES.wall.
 */
export const STORY_WALL_SURFACE_COLOR = '#cfc4b6';
export const STORY_WALL_FACE_SCALE = { x: 1.68, y: 1.52 } as const;

/** Fan-out order. Wall travels farthest; artwork is the anchor. */
export type StoryAnatomyLayerId = 'wall' | 'sticker' | 'wallMagnet' | 'artMagnet' | 'artwork';

export const STORY_ANATOMY_LAYER_ORDER: readonly StoryAnatomyLayerId[] = [
  'wall',
  'sticker',
  'wallMagnet',
  'artMagnet',
  'artwork',
];

export const PDP_STORY_DESKTOP_QUERY = '(min-width: 1100px)';
/** Pre-mount only. Visual stays inactive until section entry. */
export const PDP_STORY_LAZY_ROOT_MARGIN = '80px 0px';

export type PdpStoryBeatId = 'surface' | 'edge' | 'magnetic';

/**
 * Enabled-beat *animation travel* in vh — not total section height.
 * Section height = sticky stage (100svh − shell) + this travel.
 */
export const PDP_STORY_BEAT_VH: Record<PdpStoryBeatId, number> = {
  surface: 120,
  edge: 140,
  magnetic: 180,
};

export const PDP_STORY_ENABLED_BEATS: readonly PdpStoryBeatId[] = ['surface', 'edge', 'magnetic'];

export function getPdpStoryTravelVh(): number {
  return PDP_STORY_ENABLED_BEATS.reduce((sum, beat) => sum + PDP_STORY_BEAT_VH[beat], 0);
}

/**
 * Desktop-only travel appended AFTER the 440vh SURFACE/EDGE/MAGNETIC core.
 * Must not be folded into getPdpStoryTravelVh() — that would renormalize beat ranges.
 * 12vh settle + 6vh hold.
 */
export const PDP_STORY_DESKTOP_TAIL_VH = 18;
export const MAGNETIC_TAIL_SETTLE_END = 12 / 18;

export function getPdpStoryDesktopTravelVh(): number {
  return getPdpStoryTravelVh() + PDP_STORY_DESKTOP_TAIL_VH;
}

/** Map 0–1 over desktop section travel (core + tail) into core choreography + tail local. */
export function splitDesktopStoryProgress(raw01: number): { core: number; tail: number } {
  const core = getPdpStoryTravelVh();
  const total = getPdpStoryDesktopTravelVh();
  const coreShare = core / Math.max(1, total);
  const p = Math.min(1, Math.max(0, raw01));
  if (p <= coreShare) return { core: p / coreShare, tail: 0 };
  return { core: 1, tail: (p - coreShare) / Math.max(0.0001, 1 - coreShare) };
}

/** @deprecated Alias of getPdpStoryTravelVh() — this is travel, not total section height. */
export function getPdpStoryRangeVh(): number {
  return getPdpStoryTravelVh();
}

/** @deprecated Use getPdpStoryTravelVh() — travel of enabled beats. */
export const PDP_STORY_RANGE_VH = getPdpStoryTravelVh();

export function getStoryBeatRanges(): Record<PdpStoryBeatId, { start: number; end: number }> {
  const total = Math.max(1, getPdpStoryTravelVh());
  let cursor = 0;
  const ranges = {
    surface: { start: 0, end: 0 },
    edge: { start: 1, end: 1 },
    magnetic: { start: 1, end: 1 },
  };
  for (const beat of PDP_STORY_ENABLED_BEATS) {
    const share = PDP_STORY_BEAT_VH[beat] / total;
    ranges[beat] = { start: cursor, end: cursor + share };
    cursor += share;
  }
  return ranges;
}

export const PDP_STORY_BEATS = getStoryBeatRanges();

/** Story macro sits closer than the default 0.1 near plane. Theatre omits this. */
export const STORY_CAMERA_NEAR = 0.008;

/** Follows native scroll. Seconds. Mass so camera does not track 1:1. */
export const SURFACE_PROGRESS_DAMPING_TAU = 0.15;

/**
 * Single-path camera: pose = lerp(START, PEAK, amount).
 * amount → 1 at peakAt, then eases to restAmount (never back to 0).
 */
export const SURFACE_WINDOWS = {
  /** Theatre-adjacent hold. */
  contextEnd: 0.12,
  /** Closeness peaks here. */
  peakAt: 0.68,
  /** Amount already at rest; sticky can release. */
  calmStart: 0.94,
} as const;

/** 1 = PEAK. Exit parks here so framing never returns to START. */
export const SURFACE_REST_AMOUNT = 0.9;

export const SURFACE_COPY_IN_START = 0.46;
export const SURFACE_COPY_IN_END = 0.72;
export const SURFACE_COPY_OUT_START = 0.8;
export const SURFACE_COPY_OUT_END = 0.97;

export const SURFACE_HEADLINE = '종이가 아니라, 알루미늄.';

export const EDGE_MEASURE_PRIMARY = '1.15 mm';
export const EDGE_MEASURE_SECONDARY = '알루미늄 패널';
export const EDGE_DISCLOSURE = '확대된 가장자리 표현입니다.\n실제 패널 두께는 1.15mm입니다.';

export const EDGE_WINDOWS = {
  approachEnd: 0.3,
  macroEnd: 0.54,
  holdEnd: 0.68,
  restoreEnd: 0.93,
} as const;

export const EDGE_COPY_IN_START = 0.14;
export const EDGE_COPY_IN_END = 0.36;
export const EDGE_COPY_OUT_START = 0.78;
export const EDGE_COPY_OUT_END = 0.94;
export const EDGE_DISCLOSURE_IN_START = 0.2;
export const EDGE_DISCLOSURE_IN_END = 0.4;
export const EDGE_DISCLOSURE_OUT_START = 0.82;
export const EDGE_DISCLOSURE_OUT_END = 0.96;

export const MAGNETIC_HEADLINE = '못 없이 설치하는 마그네틱 마운트.';
export const MAGNETIC_STACK_COPY =
  '작품 × 1\n보호 스티커 × 1\n자석 × 2';
export const MAGNETIC_EXPLODE_DISCLOSURE = '이해를 돕기 위해 간격을 벌린 표현입니다.';
export const MAGNETIC_DETACH_DISCLOSURE = '구조 이해를 위해 분리하여 표현했습니다.';

/** Fan-out order — wall first, artwork last. */
export const MAGNETIC_LAYER_LABELS: Record<StoryAnatomyLayerId, string> = {
  wall: '벽',
  sticker: '보호 스티커',
  wallMagnet: '벽면 자석',
  artMagnet: '액자 자석',
  artwork: '액자',
};

/** Process / install order for callout reveal — not the camera-facing visual stack. */
export const MAGNETIC_CALLOUT_ORDER: readonly StoryAnatomyLayerId[] = [
  'wall',
  'sticker',
  'wallMagnet',
  'artMagnet',
  'artwork',
];

/** A settle → fan-out → hold → reverse-compress → rest. */
export const MAGNETIC_WINDOWS = {
  settleEnd: 0.18,
  fanOutEnd: 0.46,
  holdEnd: 0.7,
  compressEnd: 0.96,
} as const;

/**
 * Callouts live only in the exploded hold (after fanOutEnd, before holdEnd).
 * Per layer: pulse → line draw → label, then a shared readable hold, then out
 * before reverse compression.
 */
export const MAGNETIC_CALLOUT = {
  start: 0.478,
  stagger: 0.022,
  pulseDur: 0.014,
  lineDur: 0.015,
  labelDur: 0.012,
  outStart: 0.652,
  outEnd: 0.69,
  /** Scale delta at pulse peak. 1.6% — not a bounce. */
  pulseScale: 0.016,
} as const;

/**
 * Magnetic Anatomy callout pacing (desktop R7–R9, compact R10).
 * Allocated so one typical scroll step ≈ one component, still inside the exploded hold.
 * Fan-out / compress geometry is unchanged; hold is longer so callouts can breathe.
 */
export const MAGNETIC_CALLOUT_DESKTOP = {
  start: 0.498,
  stagger: 0.06,
  pulseDur: 0.024,
  lineDur: 0.022,
  labelDur: 0.018,
  outStart: 0.818,
  outEnd: 0.848,
  pulseScale: 0.016,
} as const;

/** Keep fan-out windows; delay compress until callouts have faded. Desktop + compact R10. */
export const MAGNETIC_WINDOWS_DESKTOP = {
  settleEnd: MAGNETIC_WINDOWS.settleEnd,
  fanOutEnd: MAGNETIC_WINDOWS.fanOutEnd,
  holdEnd: 0.855,
  compressEnd: 0.975,
} as const;

/**
 * @deprecated Window covering the whole callout sequence. Prefer MAGNETIC_CALLOUT.
 * Kept so existing opacity pulses still gate overlay mount.
 */
export const MAGNETIC_LABEL_WINDOWS = {
  inStart: MAGNETIC_CALLOUT.start,
  inEnd: 0.62,
  outStart: MAGNETIC_CALLOUT.outStart,
  outEnd: MAGNETIC_CALLOUT.outEnd,
} as const;

/** @deprecated Callout stagger lives on MAGNETIC_CALLOUT. */
export const MAGNETIC_LABEL_STAGGER = MAGNETIC_CALLOUT.stagger;

/**
 * Static story only (compact + reduced motion). The three motion beats reuse the
 * approved desktop copy above; MOUNTED closes the sequence the desktop beat ends
 * on and states only what the composition shows.
 */
export const STATIC_STACK_AXIS_NOTE = '위에서 아래로, 벽에서 액자까지의 순서입니다.';
export const STATIC_REVERSE_NOTE = '액자는 뒷면(알루미늄)이 보이는 방향입니다.';
export const MOUNTED_HEADLINE = '설치를 마친 모습.';
export const MOUNTED_BODY = '벽 · 보호 스티커 · 벽면 자석 · 액자 자석 · 액자가 하나로 맞물린 상태입니다.';
export const MOUNTED_DISCLOSURE = '벽면은 구조 설명을 위한 표현입니다.';

export type SurfaceCameraPose = {
  position: [number, number, number];
  lookAt: [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
};

/**
 * Theatre-adjacent framing on a full-viewport stage.
 * Camera distance only — mesh stays 200 × 283 × 1.15mm.
 * Rest occupancy target ≈ 45–55% of story-stage height. Framing only.
 */
export const SURFACE_POSE_START: SurfaceCameraPose = {
  position: [0.018, 0.009, 8.65],
  lookAt: [0, 0, 0],
  yaw: 0.02,
  pitch: 0.006,
  fov: 40,
};

/** Closer inspection on the same path. Still framed, not full-bleed. */
export const SURFACE_POSE_PEAK: SurfaceCameraPose = {
  position: [0.4, 0.114, 7.75],
  lookAt: [0, 0.015, 0],
  yaw: 0.157,
  pitch: 0.028,
  fov: 40,
};

/**
 * Documented rest pose = lerp(START, PEAK, SURFACE_REST_AMOUNT).
 * Not a third camera target — pull-back stays on the approach path.
 */
export const SURFACE_POSE_END: SurfaceCameraPose = {
  position: [0.362, 0.104, 7.84],
  lookAt: [0, 0.0135, 0],
  yaw: 0.1433,
  pitch: 0.0258,
  fov: 40,
};
