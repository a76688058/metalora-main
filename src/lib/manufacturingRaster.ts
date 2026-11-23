/**
 * Server-only manufacturing raster. Uses the same placement as the preview canvas.
 * Output size is the source crop, rounded to whole pixels. It is not a scaled-up preview.
 */
import { createHash } from 'node:crypto';
import { compositionRasterFrame, manufacturingPixelSize, manufacturingResolution, manufacturingResampled } from './customComposition/math';
import type { CustomComposition, CustomSource } from './customComposition/types';

export const MANUFACTURING_RENDERER_VERSION = 'mfg-1';
export const MANUFACTURING_MAX_BYTES = 25 * 1024 * 1024;
export const MANUFACTURING_MAX_PIXELS = 40_000_000;
export const MANUFACTURING_MARGIN = '#f4f4f5';

export type ManufacturingRasterCode =
  | 'decode_failed'
  | 'source_dimension_mismatch'
  | 'source_too_large'
  | 'unsupported';

export class ManufacturingRasterError extends Error {
  constructor(readonly code: ManufacturingRasterCode) {
    super(code);
  }
}

export type ManufacturingPng = {
  png: Buffer;
  width: number;
  height: number;
  sourceCropWidth: number;
  sourceCropHeight: number;
  widthMm: number;
  heightMm: number;
  ppiX: number;
  ppiY: number;
  belowReference: boolean;
  resampled: boolean;
};

function sharpOptions() {
  return {
    failOn: 'error' as const,
    limitInputPixels: MANUFACTURING_MAX_PIXELS,
    animated: false,
    pages: 1,
    sequentialRead: true,
  };
}

function rejectNonImage(bytes: Buffer): void {
  const head = bytes.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype')) {
    throw new ManufacturingRasterError('unsupported');
  }
  const signature = bytes.toString('ascii', 0, 6);
  if (signature === 'GIF87a' || signature === 'GIF89a') {
    throw new ManufacturingRasterError('unsupported');
  }
}

export function manufacturingArtifactKey(fingerprint: string): string {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new ManufacturingRasterError('decode_failed');
  }
  return `manufacturing/${fingerprint}.png`;
}

export function manufacturingFingerprint(input: {
  orderId: string;
  itemIndex: number;
  originalRef: string;
  source: CustomSource;
  composition: CustomComposition;
}): string {
  const resolution = manufacturingResolution(input.source, input.composition);
  const payload = JSON.stringify({
    renderer: MANUFACTURING_RENDERER_VERSION,
    orderId: input.orderId,
    itemIndex: input.itemIndex,
    originalRef: input.originalRef,
    sourceWidth: input.source.width,
    sourceHeight: input.source.height,
    orientation: input.composition.orientation,
    zoom: input.composition.zoom,
    offsetX: input.composition.offsetX,
    offsetY: input.composition.offsetY,
    version: input.composition.version,
    width: resolution.width,
    height: resolution.height,
    widthMm: resolution.widthMm,
    heightMm: resolution.heightMm,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/** Cheap check for a stored PNG. Does not decode the customer original. */
export async function cachedManufacturingMatches(
  bytes: Buffer,
  width: number,
  height: number,
): Promise<boolean> {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') return false;
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return false;
  }
  try {
    const meta = await sharp(bytes, { failOn: 'error', animated: false, pages: 1 }).metadata();
    return meta.format === 'png' && meta.width === width && meta.height === height;
  } catch {
    return false;
  }
}

export async function renderManufacturingPng(
  bytes: Buffer,
  source: CustomSource,
  composition: CustomComposition,
): Promise<ManufacturingPng> {
  if (bytes.length === 0 || bytes.length > MANUFACTURING_MAX_BYTES) {
    throw new ManufacturingRasterError('source_too_large');
  }
  rejectNonImage(bytes);
  const resolution = manufacturingResolution(source, composition);
  if (resolution.width * resolution.height > MANUFACTURING_MAX_PIXELS) {
    throw new ManufacturingRasterError('source_too_large');
  }
  if (source.width * source.height > MANUFACTURING_MAX_PIXELS) {
    throw new ManufacturingRasterError('source_too_large');
  }

  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    throw new ManufacturingRasterError('decode_failed');
  }

  let orientedPng: Buffer;
  try {
    const output = await sharp(bytes, sharpOptions())
      .rotate()
      .toColorspace('srgb')
      .flatten({ background: MANUFACTURING_MARGIN })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (output.info.width !== source.width || output.info.height !== source.height) {
      throw new ManufacturingRasterError('source_dimension_mismatch');
    }
    orientedPng = output.data;
  } catch (error) {
    if (error instanceof ManufacturingRasterError) throw error;
    throw new ManufacturingRasterError('decode_failed');
  }

  const frame = compositionRasterFrame(source, composition, {
    width: resolution.width,
    height: resolution.height,
  });
  const resampled = manufacturingResampled(source, composition);

  try {
    const png = await compositeOnMargin(sharp, orientedPng, frame);
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
  } catch (error) {
    if (error instanceof ManufacturingRasterError) throw error;
    throw new ManufacturingRasterError('decode_failed');
  }
}

async function compositeOnMargin(
  sharp: typeof import('sharp').default,
  orientedPng: Buffer,
  frame: { width: number; height: number; drawX: number; drawY: number; drawWidth: number; drawHeight: number },
): Promise<Buffer> {
  const canvasW = frame.width;
  const canvasH = frame.height;
  const dw = Math.max(1, Math.round(frame.drawWidth));
  const dh = Math.max(1, Math.round(frame.drawHeight));
  const left = Math.round(frame.drawX);
  const top = Math.round(frame.drawY);
  const resized = await sharp(orientedPng).resize(dw, dh, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const srcLeft = Math.max(0, -left);
  const srcTop = Math.max(0, -top);
  const destLeft = Math.max(0, left);
  const destTop = Math.max(0, top);
  const cropW = Math.min(dw - srcLeft, canvasW - destLeft);
  const cropH = Math.min(dh - srcTop, canvasH - destTop);
  const background = () =>
    sharp({
      create: { width: canvasW, height: canvasH, channels: 3, background: MANUFACTURING_MARGIN },
    }).png();
  if (cropW < 1 || cropH < 1) return background().toBuffer();
  const extracted = await sharp(resized)
    .extract({ left: srcLeft, top: srcTop, width: cropW, height: cropH })
    .png()
    .toBuffer();
  return background()
    .composite([{ input: extracted, left: destLeft, top: destTop }])
    .png()
    .toBuffer();
}

export function manufacturingPixelSizeFor(
  source: CustomSource,
  composition: CustomComposition,
): { width: number; height: number } {
  return manufacturingPixelSize(source, composition);
}
