import { STORAGE_BASE_URL } from './utils';

export type ImageDerivativeVariant = 'thumb' | 'medium';

export interface ResizeImageVariantOptions {
  maxWidth: number;
  quality?: number;
  mimeType?: string;
}

export type ResizeImageVariantInput = File | Blob;

export const VARIANT_RESIZE_PRESETS: Record<ImageDerivativeVariant, ResizeImageVariantOptions> = {
  thumb: { maxWidth: 320, quality: 0.84, mimeType: 'image/webp' },
  medium: { maxWidth: 720, quality: 0.84, mimeType: 'image/webp' },
};

export class ImageVariantResizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageVariantResizeError';
  }
}

const SUPABASE_PROJECT_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const STORAGE_PUBLIC_PATH = '/storage/v1/object/public/';
const DERIVATIVE_SUFFIX_PATTERN = /__(thumb|medium)$/i;

interface ParsedStorageObject {
  bucket: string;
  objectSegments: string[];
}

function isNonTransformableUrl(url: string): boolean {
  return (
    url.startsWith('blob:') ||
    url.startsWith('data:')
  );
}

function isSupabaseProjectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === SUPABASE_PROJECT_HOST;
  } catch {
    return false;
  }
}

function stripStorageQueryAndHash(url: string): string {
  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutHash.indexOf('?');
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
}

function decodePathSegments(path: string): string[] {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function encodePathSegments(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function getFilenameStem(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const basename = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  return basename.replace(DERIVATIVE_SUFFIX_PATTERN, '');
}

function buildVariantFilename(originalFilename: string, variant: ImageDerivativeVariant): string {
  const stem = getFilenameStem(originalFilename);
  return `${stem}__${variant}.webp`;
}

function isAlreadyVariantFilename(filename: string, variant: ImageDerivativeVariant): boolean {
  return filename.toLowerCase() === buildVariantFilename(filename, variant).toLowerCase()
    || filename.toLowerCase().endsWith(`__${variant}.webp`);
}

function parseSupabasePublicUrl(url: string): ParsedStorageObject | null {
  const cleaned = stripStorageQueryAndHash(url);

  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname !== SUPABASE_PROJECT_HOST) return null;
    if (!parsed.pathname.startsWith(STORAGE_PUBLIC_PATH)) return null;

    const storagePath = parsed.pathname.slice(STORAGE_PUBLIC_PATH.length);
    const segments = decodePathSegments(storagePath);
    if (segments.length < 2) return null;

    const [bucket, ...objectSegments] = segments;
    if (!bucket || objectSegments.length === 0) return null;

    return { bucket, objectSegments };
  } catch {
    return null;
  }
}

function parseRelativeStoragePath(path: string): ParsedStorageObject | null {
  const cleaned = stripStorageQueryAndHash(path.trim());
  const segments = decodePathSegments(cleaned);
  if (segments.length === 0) return null;

  if (segments[0] === 'products' || segments[0] === 'workshop') {
    const [bucket, ...objectSegments] = segments;
    if (objectSegments.length === 0) return null;
    return { bucket, objectSegments };
  }

  return {
    bucket: 'products',
    objectSegments: segments,
  };
}

function buildPublicStorageUrl(parsed: ParsedStorageObject, variantFilename: string): string {
  const objectSegments = [...parsed.objectSegments.slice(0, -1), variantFilename];
  return `${STORAGE_BASE_URL}/${parsed.bucket}/${encodePathSegments(objectSegments)}`;
}

/**
 * Derives a sibling Storage public URL for a thumbnail or medium WebP variant.
 * Non-Supabase, blob, and data URLs are returned unchanged.
 */
export function deriveVariantUrl(
  originalUrl: string | null | undefined,
  variant: ImageDerivativeVariant,
): string | undefined {
  if (!originalUrl) return undefined;
  if (isNonTransformableUrl(originalUrl)) return originalUrl;

  const isAbsoluteHttp = /^https?:\/\//i.test(originalUrl);

  if (isAbsoluteHttp) {
    if (!isSupabaseProjectUrl(originalUrl)) {
      return originalUrl;
    }

    const parsed = parseSupabasePublicUrl(originalUrl);
    if (!parsed) return originalUrl;

    const originalFilename = parsed.objectSegments[parsed.objectSegments.length - 1];
    if (isAlreadyVariantFilename(originalFilename, variant)) {
      return stripStorageQueryAndHash(originalUrl);
    }

    const variantFilename = buildVariantFilename(originalFilename, variant);
    return buildPublicStorageUrl(parsed, variantFilename);
  }

  const parsedRelative = parseRelativeStoragePath(originalUrl);
  if (!parsedRelative) return originalUrl;

  const originalFilename = parsedRelative.objectSegments[parsedRelative.objectSegments.length - 1];
  if (isAlreadyVariantFilename(originalFilename, variant)) {
    return `${STORAGE_BASE_URL}/${parsedRelative.bucket}/${encodePathSegments(parsedRelative.objectSegments)}`;
  }

  const variantFilename = buildVariantFilename(originalFilename, variant);
  return buildPublicStorageUrl(parsedRelative, variantFilename);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageVariantResizeError(`Failed to encode image as ${mimeType}.`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Resizes an image to WebP (by default) using browser APIs only.
 * Does not upscale; preserves aspect ratio and EXIF orientation.
 */
export async function resizeImageVariant(
  input: ResizeImageVariantInput,
  options: ResizeImageVariantOptions,
): Promise<Blob> {
  const { maxWidth, quality = 0.84, mimeType = 'image/webp' } = options;

  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    throw new ImageVariantResizeError('maxWidth must be a positive number.');
  }

  if (quality <= 0 || quality > 1) {
    throw new ImageVariantResizeError('quality must be between 0 and 1.');
  }

  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });

    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new ImageVariantResizeError('Source image has invalid dimensions.');
    }

    const targetWidth = Math.min(maxWidth, sourceWidth);
    const targetHeight = Math.max(1, Math.round((sourceHeight * targetWidth) / sourceWidth));

    canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new ImageVariantResizeError('Unable to acquire 2D canvas context.');
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    return await canvasToBlob(canvas, mimeType, quality);
  } catch (error) {
    if (error instanceof ImageVariantResizeError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown resize failure.';
    throw new ImageVariantResizeError(`Failed to resize image variant: ${message}`);
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
