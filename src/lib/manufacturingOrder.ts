/**
 * Authorized manufacturing output for one purchased order line.
 * Composition and the original reference come only from the stored order row.
 */
import { manufacturingResolution, manufacturingResampled } from './customComposition/math';
import { readPurchasedComposition } from './customComposition/productionSnapshot';
import type { CustomComposition, CustomSource } from './customComposition/types';
import type { ManufacturingByteAccess } from './manufacturingBytes';
import {
  cachedManufacturingMatches,
  manufacturingArtifactKey,
  manufacturingFingerprint,
  renderManufacturingPng,
  ManufacturingRasterError,
  type ManufacturingPng,
} from './manufacturingRaster';

const rendersInFlight = new Map<string, Promise<ManufacturingPng>>();

export type ManufacturingActor =
  | { ok: true; actorUserId: string }
  | { ok: false; status: number; reason_class: string };

export type ManufacturingResult =
  | {
      ok: true;
      status: 200;
      png: Buffer;
      width: number;
      height: number;
      ppiX: number;
      ppiY: number;
      belowReference: boolean;
      resampled: boolean;
      fingerprint: string;
      stored: 'hit' | 'written' | 'absent';
      widthMm: number;
      heightMm: number;
    }
  | { ok: false; status: number; error: string };

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function selectPurchasedManufacturingItem(
  orderedItems: unknown,
  itemIndex: number,
):
  | {
      ok: true;
      source: CustomSource;
      composition: CustomComposition;
      originalRef: string;
    }
  | { ok: false; error: 'line_missing' | 'composition_incomplete' | 'source_missing' } {
  if (!Array.isArray(orderedItems) || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= orderedItems.length) {
    return { ok: false, error: 'line_missing' };
  }
  const item = record(orderedItems[itemIndex]);
  if (!item) return { ok: false, error: 'line_missing' };
  const purchased = readPurchasedComposition(item.custom_config, item.orientation);
  if (purchased.status !== 'ready') return { ok: false, error: 'composition_incomplete' };
  if (
    purchased.sourceWidth == null ||
    purchased.sourceHeight == null ||
    !purchased.originalRef ||
    !purchased.previewRef
  ) {
    return { ok: false, error: 'source_missing' };
  }
  return {
    ok: true,
    originalRef: purchased.originalRef,
    source: {
      url: purchased.originalRef,
      width: purchased.sourceWidth,
      height: purchased.sourceHeight,
    },
    composition: {
      version: 1,
      orientation: purchased.orientation,
      zoom: purchased.zoom,
      offsetX: purchased.offsetX,
      offsetY: purchased.offsetY,
    },
  };
}

export async function renderPurchasedManufacturing(input: {
  actor: ManufacturingActor;
  order: { id: string; ordered_items: unknown } | null;
  itemIndex: number;
  access: ManufacturingByteAccess | null;
  /** Counts original reads. Tests use this to prove unauthorized calls do not touch storage. */
  onOriginalRead?: () => void;
}): Promise<ManufacturingResult> {
  if (input.actor.ok === false) {
    return { ok: false, status: input.actor.status, error: input.actor.reason_class };
  }
  if (!input.order?.id) return { ok: false, status: 404, error: 'not_found' };
  const selected = selectPurchasedManufacturingItem(input.order.ordered_items, input.itemIndex);
  if (selected.ok === false) {
    const status = selected.error === 'line_missing' ? 404 : 422;
    return { ok: false, status, error: selected.error };
  }

  const fingerprint = manufacturingFingerprint({
    orderId: input.order.id,
    itemIndex: input.itemIndex,
    originalRef: selected.originalRef,
    source: selected.source,
    composition: selected.composition,
  });
  const key = manufacturingArtifactKey(fingerprint);
  const resolution = manufacturingResolution(selected.source, selected.composition);
  const resampled = manufacturingResampled(selected.source, selected.composition);

  if (input.access?.persistent) {
    try {
      const existing = await input.access.readArtifact(key);
      if (existing) {
        const matches = await cachedManufacturingMatches(existing, resolution.width, resolution.height);
        if (!matches) return { ok: false, status: 409, error: 'manufacturing_conflict' };
        return finish(cachedPng(existing, resolution, resampled), fingerprint, 'hit');
      }
    } catch {
      return { ok: false, status: 502, error: 'source_unreadable' };
    }
  }

  input.onOriginalRead?.();
  let original: Buffer | null = null;
  try {
    original = input.access ? await input.access.readOriginal(selected.originalRef) : null;
  } catch {
    return { ok: false, status: 502, error: 'source_unreadable' };
  }
  if (!original) return { ok: false, status: 404, error: 'source_missing' };

  let rendered: ManufacturingPng;
  try {
    const pending = rendersInFlight.get(key);
    if (pending) {
      rendered = await pending;
    } else {
      const work = renderManufacturingPng(original, selected.source, selected.composition);
      rendersInFlight.set(key, work);
      try {
        rendered = await work;
      } finally {
        if (rendersInFlight.get(key) === work) rendersInFlight.delete(key);
      }
    }
  } catch (error) {
    if (error instanceof ManufacturingRasterError) return { ok: false, status: 422, error: error.code };
    return { ok: false, status: 422, error: 'decode_failed' };
  }

  if (!input.access?.persistent) {
    return finish(rendered, fingerprint, 'absent');
  }

  try {
    const existing = await input.access.readArtifact(key);
    if (existing) {
      if (!existing.equals(rendered.png)) return { ok: false, status: 409, error: 'manufacturing_conflict' };
      return finish(rendered, fingerprint, 'hit');
    }
    const wrote = await input.access.writeArtifact(key, rendered.png);
    if (wrote === 'exists') {
      const raced = await input.access.readArtifact(key);
      if (!raced || !raced.equals(rendered.png)) return { ok: false, status: 409, error: 'manufacturing_conflict' };
      return finish(rendered, fingerprint, 'hit');
    }
    return finish(rendered, fingerprint, 'written');
  } catch {
    return finish(rendered, fingerprint, 'absent');
  }
}

function cachedPng(
  png: Buffer,
  resolution: ReturnType<typeof manufacturingResolution>,
  resampled: boolean,
): ManufacturingPng {
  return {
    png,
    width: resolution.width,
    height: resolution.height,
    sourceCropWidth: resolution.width,
    sourceCropHeight: resolution.height,
    widthMm: resolution.widthMm,
    heightMm: resolution.heightMm,
    ppiX: resolution.ppiX,
    ppiY: resolution.ppiY,
    belowReference: resolution.belowReference,
    resampled,
  };
}

function finish(rendered: ManufacturingPng, fingerprint: string, stored: 'hit' | 'written' | 'absent'): ManufacturingResult {
  return {
    ok: true,
    status: 200,
    png: rendered.png,
    width: rendered.width,
    height: rendered.height,
    ppiX: rendered.ppiX,
    ppiY: rendered.ppiY,
    belowReference: rendered.belowReference,
    resampled: rendered.resampled,
    fingerprint,
    stored,
    widthMm: rendered.widthMm,
    heightMm: rendered.heightMm,
  };
}
