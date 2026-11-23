import { LANDSCAPE_FRAME, PORTRAIT_FRAME, type CustomOrientation } from './types';

/** Confirmed M finished size. Client-supplied millimetres are never accepted. */
export function canonicalOutputMillimeters(
  orientation: unknown,
): { width: number; height: number } | null {
  if (orientation === 'portrait') return { width: PORTRAIT_FRAME.width, height: PORTRAIT_FRAME.height };
  if (orientation === 'landscape') return { width: LANDSCAPE_FRAME.width, height: LANDSCAPE_FRAME.height };
  return null;
}

export type PurchasedComposition = {
  status: 'ready';
  orientation: CustomOrientation;
  widthMm: number | null;
  heightMm: number | null;
  size: 'M';
  version: 1;
  zoom: number;
  offsetX: number;
  offsetY: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  previewRef: string | null;
  originalRef: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveNumber(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

function ref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function orientationOf(value: unknown): CustomOrientation | null {
  return value === 'portrait' || value === 'landscape' ? value : null;
}

/**
 * Read a purchased custom snapshot. Physical size is only the millimetres
 * stored on that snapshot. Missing dimensions stay missing.
 */
export function readPurchasedComposition(
  config: unknown,
  orientationHint: unknown,
): PurchasedComposition | { status: 'incomplete' } {
  const cfg = record(config);
  if (!cfg) return { status: 'incomplete' };
  const composition = record(cfg.composition);
  if (!composition) return { status: 'incomplete' };
  const hinted = orientationOf(orientationHint);
  const composed = orientationOf(composition.orientation);
  const orientation = hinted ?? composed;
  if (!orientation || (hinted && composed && hinted !== composed)) return { status: 'incomplete' };
  if (composition.version !== 1) return { status: 'incomplete' };
  const zoom = finiteNumber(composition.zoom);
  const offsetX = finiteNumber(composition.offsetX);
  const offsetY = finiteNumber(composition.offsetY);
  if (zoom == null || offsetX == null || offsetY == null) return { status: 'incomplete' };
  const sizeRaw = typeof cfg.size === 'string' ? cfg.size.trim() : '';
  if (sizeRaw !== '' && sizeRaw !== 'M' && sizeRaw !== 'A4') return { status: 'incomplete' };
  const storedWidth = positiveNumber(cfg.output_width_mm);
  const storedHeight = positiveNumber(cfg.output_height_mm);
  const previewRef = ref(cfg.preview_image_url);
  const originalRef = ref(cfg.original_image_url);
  return {
    status: 'ready',
    orientation,
    widthMm: storedWidth != null && storedHeight != null ? storedWidth : null,
    heightMm: storedWidth != null && storedHeight != null ? storedHeight : null,
    size: 'M',
    version: 1,
    zoom,
    offsetX,
    offsetY,
    sourceWidth: positiveNumber(cfg.source_width),
    sourceHeight: positiveNumber(cfg.source_height),
    previewRef,
    originalRef: originalRef && originalRef !== previewRef ? originalRef : null,
  };
}
