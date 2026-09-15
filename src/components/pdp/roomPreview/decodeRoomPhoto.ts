import {
  ROOM_JPEG_QUALITY,
  ROOM_PHOTO_DECODE_ERROR,
  ROOM_PHOTO_MAX_LONG_EDGE,
  type DecodeRoomPhotoResult,
} from './types';

export class RoomPhotoDecodeError extends Error {
  constructor(message: string = ROOM_PHOTO_DECODE_ERROR) {
    super(message);
    this.name = 'RoomPhotoDecodeError';
  }
}

function fail(): never {
  throw new RoomPhotoDecodeError();
}

function destSize(sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  const longEdge = Math.max(sourceWidth, sourceHeight);
  if (!(longEdge > 0) || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) {
    fail();
  }
  const scale = longEdge > ROOM_PHOTO_MAX_LONG_EDGE ? ROOM_PHOTO_MAX_LONG_EDGE / longEdge : 1;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) {
          reject(new RoomPhotoDecodeError());
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      ROOM_JPEG_QUALITY,
    );
  });
}

function drawToDisplayBlob(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<DecodeRoomPhotoResult> {
  const { width, height } = destSize(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) fail();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvasToJpegBlob(canvas).then((blob) => ({
    blob,
    width,
    height,
    sourceWidth,
    sourceHeight,
  }));
}

async function decodeWithCreateImageBitmap(file: File): Promise<DecodeRoomPhotoResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    const result = await drawToDisplayBlob(bitmap, bitmap.width, bitmap.height);
    return result;
  } finally {
    bitmap?.close();
  }
}

function loadHtmlImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new RoomPhotoDecodeError());
    img.src = objectUrl;
  });
}

async function decodeWithHtmlImage(file: File): Promise<DecodeRoomPhotoResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    try {
      await img.decode?.();
    } catch {
      /* decode() is optional; onload already succeeded */
    }
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return await drawToDisplayBlob(img, width, height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function decodeRoomPhoto(file: File): Promise<DecodeRoomPhotoResult> {
  if (!file || file.size <= 0) fail();
  if (file.type && !file.type.startsWith('image/')) fail();

  try {
    if (typeof createImageBitmap === 'function') {
      return await decodeWithCreateImageBitmap(file);
    }
  } catch {
    /* fall through to HTMLImageElement */
  }

  try {
    return await decodeWithHtmlImage(file);
  } catch (error) {
    if (error instanceof RoomPhotoDecodeError) throw error;
    fail();
  }
}

export function revokeRoomPhotoUrl(url: string | null | undefined) {
  if (!url || !url.startsWith('blob:')) return;
  URL.revokeObjectURL(url);
}
