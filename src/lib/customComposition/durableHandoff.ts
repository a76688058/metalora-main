import { supabase } from '../supabase';
import type { CustomComposition, CustomSource } from './types';

export type DurableUpload = {
  path: string;
  publicUrl: string;
};

export type TrustedCustomCartRow = {
  custom_image?: string | null;
  custom_config?: Record<string, unknown> | null;
};

function uniqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFile(file: File): string {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  if (ext === 'png' || ext === 'webp' || ext === 'jpg' || ext === 'jpeg') return ext;
  return 'jpg';
}

function publicUrlFor(path: string): string {
  const { data } = supabase.storage.from('workshop').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadWorkshopOriginal(userId: string, file: File): Promise<DurableUpload> {
  const path = `originals/${userId}/${uniqueId()}.${extensionFromFile(file)}`;
  const { error } = await supabase.storage.from('workshop').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return { path, publicUrl: publicUrlFor(path) };
}

export async function uploadWorkshopPreview(userId: string, blob: Blob): Promise<DurableUpload> {
  const path = `previews/${userId}/${uniqueId()}.jpg`;
  const file = new File([blob], 'preview.jpg', { type: 'image/jpeg' });
  const { error } = await supabase.storage.from('workshop').upload(path, file, {
    cacheControl: '3600',
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return { path, publicUrl: publicUrlFor(path) };
}

export async function removeWorkshopPaths(paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  await supabase.storage.from('workshop').remove(unique);
}

export function buildCompleteV1Config(
  source: CustomSource,
  composition: CustomComposition,
): Record<string, unknown> {
  return {
    composition: {
      version: 1,
      orientation: composition.orientation,
      zoom: composition.zoom,
      offsetX: composition.offsetX,
      offsetY: composition.offsetY,
    },
    source_width: source.width,
    source_height: source.height,
    material: 'aluminum',
    serial_number: `WS-${Date.now()}`,
  };
}

function normalizeAssetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}`.replace(/\/+$/, '');
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n) || n < 1) return null;
    return n;
  }
  return null;
}

export function verifyTrustedCustomCartRow(
  row: TrustedCustomCartRow | null | undefined,
  previewUrl: string,
): { ok: true; priceSnapshot: number } | { ok: false } {
  if (!row) return { ok: false };
  const cfg = row.custom_config;
  if (!cfg || typeof cfg !== 'object') return { ok: false };
  if (cfg.price_snapshot_version !== '1') return { ok: false };
  if (cfg.price_snapshot_source !== 'custom_m_price') return { ok: false };
  const priceSnapshot = parsePositiveInt(cfg.price_snapshot);
  if (priceSnapshot === null) return { ok: false };
  const returnedImage = typeof row.custom_image === 'string' ? row.custom_image : '';
  if (!returnedImage || normalizeAssetUrl(returnedImage) !== normalizeAssetUrl(previewUrl)) {
    return { ok: false };
  }
  return { ok: true, priceSnapshot };
}
