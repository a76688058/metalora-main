import {
  LANDSCAPE_FRAME,
  MAX_ZOOM,
  PORTRAIT_FRAME,
  SAFE_AREA_MM,
  type CustomComposition,
  type CustomOrientation,
  type CustomSource,
} from './types';

export function frameSize(orientation: CustomOrientation): { width: number; height: number } {
  return orientation === 'landscape' ? LANDSCAPE_FRAME : PORTRAIT_FRAME;
}

export function frameAspect(orientation: CustomOrientation): number {
  const frame = frameSize(orientation);
  return frame.width / frame.height;
}

/** Qualitative fractions of the product frame. Not a manufacturing guarantee. */
export function safeAreaInsetFractions(orientation: CustomOrientation): { x: number; y: number } {
  const frame = frameSize(orientation);
  return {
    x: SAFE_AREA_MM / frame.width,
    y: SAFE_AREA_MM / frame.height,
  };
}

export function coverScale(source: CustomSource, orientation: CustomOrientation): number {
  const frame = frameSize(orientation);
  return Math.max(frame.width / source.width, frame.height / source.height);
}

export function containScale(source: CustomSource, orientation: CustomOrientation): number {
  const frame = frameSize(orientation);
  return Math.min(frame.width / source.width, frame.height / source.height);
}

/** Slider/engine minimum: full source visible. Always <= 1. */
export function minZoom(source: CustomSource, orientation: CustomOrientation): number {
  const cover = coverScale(source, orientation);
  if (cover <= 1e-9) return 1;
  return containScale(source, orientation) / cover;
}

export function displayScale(source: CustomSource, composition: CustomComposition): number {
  return coverScale(source, composition.orientation) * composition.zoom;
}

export function imageSizeInFrame(
  source: CustomSource,
  composition: CustomComposition,
): { width: number; height: number } {
  const scale = displayScale(source, composition);
  return {
    width: source.width * scale,
    height: source.height * scale,
  };
}

function clampAxis(overflow: number, value: number): number {
  const max = Math.abs(overflow) / 2;
  if (max <= 1e-9) return 0;
  return Math.min(max, Math.max(-max, value));
}

export function clampOffset(
  source: CustomSource,
  composition: CustomComposition,
): { offsetX: number; offsetY: number } {
  const frame = frameSize(composition.orientation);
  const image = imageSizeInFrame(source, composition);
  return {
    offsetX: clampAxis(image.width / frame.width - 1, composition.offsetX),
    offsetY: clampAxis(image.height / frame.height - 1, composition.offsetY),
  };
}

export function clampComposition(
  source: CustomSource,
  composition: CustomComposition,
): CustomComposition {
  const min = minZoom(source, composition.orientation);
  const zoom = Math.min(MAX_ZOOM, Math.max(min, composition.zoom));
  const next = { ...composition, zoom };
  return { ...next, ...clampOffset(source, next) };
}

export function applyZoom(
  source: CustomSource,
  composition: CustomComposition,
  zoom: number,
): CustomComposition {
  return clampComposition(source, { ...composition, zoom });
}

export function applyPan(
  source: CustomSource,
  composition: CustomComposition,
  deltaOffsetX: number,
  deltaOffsetY: number,
): CustomComposition {
  return clampComposition(source, {
    ...composition,
    offsetX: composition.offsetX + deltaOffsetX,
    offsetY: composition.offsetY + deltaOffsetY,
  });
}

export function pointerDeltaToOffset(
  dxPx: number,
  dyPx: number,
  frameClientWidth: number,
  frameClientHeight: number,
): { offsetX: number; offsetY: number } {
  if (frameClientWidth <= 0 || frameClientHeight <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }
  return {
    offsetX: dxPx / frameClientWidth,
    offsetY: dyPx / frameClientHeight,
  };
}

/** Source-space point currently at the product-frame center. */
export function sourceFocalPoint(
  source: CustomSource,
  composition: CustomComposition,
): { u: number; v: number } {
  const frame = frameSize(composition.orientation);
  const scale = displayScale(source, composition);
  const u = 0.5 - (composition.offsetX * frame.width) / (source.width * scale);
  const v = 0.5 - (composition.offsetY * frame.height) / (source.height * scale);
  return {
    u: Math.min(1, Math.max(0, u)),
    v: Math.min(1, Math.max(0, v)),
  };
}

export function applyOrientation(
  source: CustomSource,
  composition: CustomComposition,
  orientation: CustomOrientation,
): CustomComposition {
  if (composition.orientation === orientation) return composition;
  const focal = sourceFocalPoint(source, composition);
  const next: CustomComposition = { ...composition, orientation };
  const scale = displayScale(source, next);
  const frame = frameSize(orientation);
  return clampComposition(source, {
    ...next,
    offsetX: ((0.5 - focal.u) * source.width * scale) / frame.width,
    offsetY: ((0.5 - focal.v) * source.height * scale) / frame.height,
  });
}

export function resetEdits(
  source: CustomSource,
  composition: CustomComposition,
): CustomComposition {
  return clampComposition(source, {
    ...composition,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });
}

export function imageCssLayout(
  source: CustomSource,
  composition: CustomComposition,
): {
  widthPercent: number;
  heightPercent: number;
  leftPercent: number;
  topPercent: number;
} {
  const frame = frameSize(composition.orientation);
  const image = imageSizeInFrame(source, composition);
  return {
    widthPercent: (image.width / frame.width) * 100,
    heightPercent: (image.height / frame.height) * 100,
    leftPercent: 50 + composition.offsetX * 100,
    topPercent: 50 + composition.offsetY * 100,
  };
}

/** Source-pixel window covering the product frame. */
export function effectiveSourceWindow(
  source: CustomSource,
  composition: CustomComposition,
): { x: number; y: number; width: number; height: number } {
  const frame = frameSize(composition.orientation);
  const scale = displayScale(source, composition);
  const image = imageSizeInFrame(source, composition);
  const centerX = frame.width / 2 + composition.offsetX * frame.width;
  const centerY = frame.height / 2 + composition.offsetY * frame.height;
  return {
    x: (0 - (centerX - image.width / 2)) / scale,
    y: (0 - (centerY - image.height / 2)) / scale,
    width: frame.width / scale,
    height: frame.height / scale,
  };
}

/**
 * Cover-relative zoom above 1 crops tighter than frame-fill,
 * so fewer source pixels cover the product. Not a DPI/print claim.
 */
export function compositionIsTightCrop(composition: CustomComposition): boolean {
  return composition.zoom > 1 + 1e-6;
}
