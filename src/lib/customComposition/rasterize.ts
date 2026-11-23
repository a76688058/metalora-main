import { compositionRasterFrame, previewPixelSize } from './math';
import { PREVIEW_LONG_EDGE_PX, type CustomComposition, type CustomSource } from './types';

export function loadCustomSource(url: string): Promise<CustomSource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error('Failed to read image dimensions.'));
    image.src = url;
  });
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (url.startsWith('http')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for preview raster.'));
    image.src = url;
  });
}

export async function rasterizeCustomComposition(
  source: CustomSource,
  composition: CustomComposition,
  options?: {
    longEdgePx?: number;
    /** Explicit pixel size for a shared-geometry comparison. Preview callers omit this. */
    targetPx?: { width: number; height: number };
    marginColor?: string;
  },
): Promise<Blob> {
  const longEdge = options?.longEdgePx ?? PREVIEW_LONG_EDGE_PX;
  const marginColor = options?.marginColor ?? '#f4f4f5';
  const placed = compositionRasterFrame(
    source,
    composition,
    options?.targetPx ?? previewPixelSize(composition.orientation, longEdge),
  );
  const canvas = document.createElement('canvas');
  canvas.width = placed.width;
  canvas.height = placed.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is unavailable.');
  }

  ctx.fillStyle = marginColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const image = await loadHtmlImage(source.url);
  ctx.drawImage(image, placed.drawX, placed.drawY, placed.drawWidth, placed.drawHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
  });
  if (!blob) {
    throw new Error('Failed to rasterize composition.');
  }
  return blob;
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
