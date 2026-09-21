import { frameSize, imageSizeInFrame } from './math';
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
    marginColor?: string;
  },
): Promise<Blob> {
  const longEdge = options?.longEdgePx ?? PREVIEW_LONG_EDGE_PX;
  const marginColor = options?.marginColor ?? '#f4f4f5';
  const frame = frameSize(composition.orientation);
  const longMm = Math.max(frame.width, frame.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((frame.width / longMm) * longEdge));
  canvas.height = Math.max(1, Math.round((frame.height / longMm) * longEdge));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is unavailable.');
  }

  ctx.fillStyle = marginColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const image = await loadHtmlImage(source.url);
  const placed = imageSizeInFrame(source, composition);
  const unit = canvas.width / frame.width;
  const drawWidth = placed.width * unit;
  const drawHeight = placed.height * unit;
  const centerX = canvas.width / 2 + composition.offsetX * canvas.width;
  const centerY = canvas.height / 2 + composition.offsetY * canvas.height;

  ctx.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);

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
