/**
 * Read-only inspection facts for a purchased custom line.
 * Crop geometry is the manufacturing window. Display zoom is not part of this module.
 */
import {
  compositionRasterFrame,
  effectiveSourceWindow,
  manufacturingPixelSize,
  manufacturingResolution,
  manufacturingResampled,
  previewPixelSize,
} from '../../lib/customComposition/math';
import { PREVIEW_LONG_EDGE_PX, type CustomComposition, type CustomSource } from '../../lib/customComposition/types';

export type InspectionImageSlot = {
  status: 'loading' | 'ready' | 'failed' | 'absent';
  src: string | null;
};

export type ManufacturingFileResult =
  | {
      ok: true;
      src: string;
      width: number;
      height: number;
      bytes: number;
      belowReference: boolean;
      resampled: boolean;
    }
  | { ok: false; message: string };

export function parsePixelHeader(value: string | null): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return null;
  return { width, height };
}

export function fileTypeLabel(ref: string | null, role: 'original' | 'preview'): string {
  if (role === 'preview') return 'JPEG';
  const ext = ref?.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'PNG';
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'webp') return 'WebP';
  return '알 수 없음';
}

export function originalDownloadName(ref: string | null): string {
  const kind = fileTypeLabel(ref, 'original');
  const ext = kind === 'JPEG' ? 'jpg' : kind === 'WebP' ? 'webp' : kind === 'PNG' ? 'png' : 'img';
  return `original-source.${ext}`;
}

export function formatPurchasedOffset(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function formatInspectorZoom(mode: 'fit' | 'actual', zoom: number): string {
  if (mode === 'actual') return `원본 픽셀 ${Math.round(zoom * 100)}%`;
  return zoom === 1 ? '화면에 맞추기' : `화면에 맞추기 × ${Math.round(zoom * 100) / 100}`;
}

/** Fractions of the original. Same window the manufacturing raster samples. */
export function purchasedCropFractions(source: CustomSource, composition: CustomComposition): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const window = effectiveSourceWindow(source, composition);
  return {
    left: window.x / source.width,
    top: window.y / source.height,
    width: window.width / source.width,
    height: window.height / source.height,
  };
}

export function resamplingNote(
  source: CustomSource,
  composition: CustomComposition,
): { tone: 'quiet' | 'info'; text: string } {
  const size = manufacturingPixelSize(source, composition);
  const frame = compositionRasterFrame(source, composition, size);
  const dx = frame.drawWidth - source.width;
  const dy = frame.drawHeight - source.height;
  if (!manufacturingResampled(source, composition)) {
    return {
      tone: 'quiet',
      text: '정수 픽셀 반올림은 원본 크기 기준 1.5픽셀 안입니다.',
    };
  }
  return {
    tone: 'info',
    text: `정수 픽셀로 맞추면서 원본 전체가 가로 ${dx.toFixed(2)}픽셀, 세로 ${dy.toFixed(2)}픽셀만큼 조정됩니다. 이 반올림은 낮은 인쇄 해상도의 원인이 아닙니다.`,
  };
}

export function inspectionFacts(source: CustomSource, composition: CustomComposition) {
  const resolution = manufacturingResolution(source, composition);
  const window = effectiveSourceWindow(source, composition);
  return {
    originalWidth: source.width,
    originalHeight: source.height,
    cropWidth: resolution.width,
    cropHeight: resolution.height,
    manufacturingWidth: resolution.width,
    manufacturingHeight: resolution.height,
    widthMm: resolution.widthMm,
    heightMm: resolution.heightMm,
    ppiX: resolution.ppiX,
    ppiY: resolution.ppiY,
    belowReference: resolution.belowReference,
    zoom: composition.zoom,
    offsetX: composition.offsetX,
    offsetY: composition.offsetY,
    version: composition.version,
    orientation: composition.orientation,
    window,
    overlay: purchasedCropFractions(source, composition),
    resampling: resamplingNote(source, composition),
  };
}

export function lowResolutionCopy(ppiX: number, ppiY: number, widthMm: number, heightMm: number): string {
  return `유효 해상도 ${ppiX.toFixed(1)} × ${ppiY.toFixed(1)} PPI입니다. 실물 ${widthMm} × ${heightMm} mm에 비해 원본 픽셀이 적습니다. 외부에서 키워도 원본에 없는 세부가 복원되지는 않습니다.`;
}

export function concisePrintWarning(ppiX: number, ppiY: number): string {
  const ppi = Math.min(ppiX, ppiY);
  return `약 ${ppi.toFixed(1)} PPI입니다. 인쇄하기에 원본 픽셀이 적고, 키워도 없는 세부는 복원되지 않습니다.`;
}

/** Preview and manufacturing placements for one frozen composition. Same source window. */
export function sharedRasterFrames(source: CustomSource, composition: CustomComposition) {
  const sourceWindow = effectiveSourceWindow(source, composition);
  const previewTarget = previewPixelSize(composition.orientation, PREVIEW_LONG_EDGE_PX);
  const manufacturingTarget = manufacturingPixelSize(source, composition);
  return {
    sourceWindow,
    preview: compositionRasterFrame(source, composition, previewTarget),
    manufacturing: compositionRasterFrame(source, composition, manufacturingTarget),
  };
}
