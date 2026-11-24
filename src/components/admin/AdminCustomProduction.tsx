import { useState } from 'react';
import type { AdminOrderItem } from './adminOrders';
import { formatCustomMPrice } from '../../lib/customComposition/customMPrice';
import { manufacturingResolution } from '../../lib/customComposition/math';
import { readPurchasedComposition } from '../../lib/customComposition/productionSnapshot';
import { supabase } from '../../lib/supabase';
import {
  readStoredPurchasedUnitPrice,
  readStoredSourcePixels,
  storedCustomLineAmount,
} from './adminOrderMapping';
import { ProductionInspectionViewer } from './ProductionInspectionViewer';
import {
  lowResolutionCopy,
  parsePixelHeader,
  resamplingNote,
  type ManufacturingFileResult,
} from './productionInspection';

function formatOffset(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export type AdminImageSlot = {
  status: 'loading' | 'ready' | 'failed' | 'absent';
  src: string | null;
};

function ImageSlot({
  slot,
  alt,
  onError,
  empty,
}: {
  slot: AdminImageSlot;
  alt: string;
  onError?: () => void;
  empty: string;
}) {
  if (slot.status === 'loading') {
    return <p className="text-sm text-zinc-400">이미지를 불러오는 중입니다.</p>;
  }
  if (slot.status === 'failed') {
    return <p className="text-sm text-amber-200">이미지를 불러오지 못했습니다.</p>;
  }
  if (slot.status === 'ready' && slot.src) {
    return (
      <img
        src={slot.src}
        alt={alt}
        className="max-h-80 w-full object-contain"
        referrerPolicy="no-referrer"
        onError={onError}
      />
    );
  }
  return <p className="text-sm text-zinc-400">{empty}</p>;
}

export function AdminCustomProduction({
  item,
  orderNumber,
  orderId,
  itemIndex,
  buyerId,
  orderedAt,
  preview,
  original,
  onPreviewError,
  onOriginalError,
  isolatedLabel,
}: {
  item: AdminOrderItem;
  orderNumber: string;
  orderId: string;
  itemIndex: number;
  buyerId: string;
  orderedAt: string;
  preview: AdminImageSlot;
  original: AdminImageSlot;
  onPreviewError?: () => void;
  onOriginalError?: () => void;
  isolatedLabel?: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'working' | 'failed' | 'saved'>('idle');
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const composition = readPurchasedComposition(item.customConfig, item.orientation);
  const ready = composition.status === 'ready';
  const unitPrice = readStoredPurchasedUnitPrice(item.price, item.customConfig);
  const sourcePixels = readStoredSourcePixels(item.customConfig);
  const lineAmount = item.quantity > 1 ? storedCustomLineAmount(unitPrice, item.quantity) : null;
  const config = item.customConfig;
  const processing = [
    config?.ai_upscale === true ? 'AI 고화질' : null,
    config?.ai_outpaint === true ? 'AI 비율복원' : null,
    config?.ai_autofill === true ? 'AI 자동채우기' : null,
  ].filter((value): value is string => Boolean(value));
  const manufacturingSource =
    ready && composition.sourceWidth != null && composition.sourceHeight != null
      ? { url: '', width: composition.sourceWidth, height: composition.sourceHeight }
      : null;
  const manufacturingComposition = ready
    ? {
        version: 1 as const,
        orientation: composition.orientation,
        zoom: composition.zoom,
        offsetX: composition.offsetX,
        offsetY: composition.offsetY,
      }
    : null;
  const resolution =
    manufacturingSource && manufacturingComposition
      ? manufacturingResolution(manufacturingSource, manufacturingComposition)
      : null;
  const resampling =
    manufacturingSource && manufacturingComposition
      ? resamplingNote(manufacturingSource, manufacturingComposition)
      : null;
  const storedSizeDiffers =
    resolution != null &&
    composition.status === 'ready' &&
    composition.widthMm != null &&
    composition.heightMm != null &&
    (composition.widthMm !== resolution.widthMm || composition.heightMm !== resolution.heightMm);
  const canDownload = ready && Boolean(item.originalRef) && resolution != null;

  async function requestManufacturingFile(): Promise<ManufacturingFileResult> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, message: '관리자 세션이 없습니다.' };
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/items/${itemIndex}/manufacturing.png`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: '관리자 권한이 확인되지 않았습니다.' };
      }
      if (response.status === 404) return { ok: false, message: '원본 소스를 찾지 못했습니다.' };
      if (!response.ok) return { ok: false, message: '제작 출력을 만들지 못했습니다. 원본 또는 구매 구도를 확인하세요.' };
      const blob = await response.blob();
      const pixels = parsePixelHeader(response.headers.get('X-Metalora-Manufacturing-Pixels'));
      let width = pixels?.width ?? 0;
      let height = pixels?.height ?? 0;
      if (!pixels) {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      }
      return {
        ok: true,
        src: URL.createObjectURL(blob),
        width,
        height,
        bytes: blob.size,
        belowReference: response.headers.get('X-Metalora-Manufacturing-Review') === 'below-reference',
        resampled: response.headers.get('X-Metalora-Manufacturing-Resampled') === '1',
      };
    } catch {
      return { ok: false, message: '제작 출력을 받지 못했습니다.' };
    }
  }

  async function downloadManufacturing() {
    setDownloadState('working');
    setDownloadNote(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setDownloadState('failed');
      setDownloadNote('관리자 세션이 없습니다.');
      return;
    }
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}/items/${itemIndex}/manufacturing.png`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        setDownloadState('failed');
        setDownloadNote('제작 출력을 만들지 못했습니다. 원본 또는 구매 구도를 확인하세요.');
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `manufacturing-${itemIndex}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      const pixels = response.headers.get('X-Metalora-Manufacturing-Pixels');
      const review = response.headers.get('X-Metalora-Manufacturing-Review');
      const stored = response.headers.get('X-Metalora-Manufacturing-Stored');
      const identity = response.headers.get('X-Metalora-Manufacturing-Id');
      const notes = [
        pixels ? `출력 ${pixels} px` : null,
        review === 'below-reference' ? '300 PPI 참고값보다 낮습니다.' : null,
        stored === 'absent' ? '저장소 보관에 실패했습니다. 같은 구매 구도로 다시 받을 수 있습니다.' : null,
        identity ? `출력 식별 ${identity.slice(0, 12)}` : null,
      ].filter((value): value is string => Boolean(value));
      setDownloadState('saved');
      setDownloadNote(notes.join(' · ') || '제작 출력을 받았습니다.');
    } catch {
      setDownloadState('failed');
      setDownloadNote('제작 출력을 받지 못했습니다.');
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4" aria-label="맞춤 제작 정보">
      {isolatedLabel ? <p className="mb-3 text-xs font-medium text-amber-200">{isolatedLabel}</p> : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-300">큰 화면에서 구매 구도와 제작 파일을 확인합니다.</p>
        <button
          type="button"
          className="focus-ring min-h-11 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40"
          disabled={!ready}
          onClick={() => setViewerOpen(true)}
        >
          제작 확인 화면
        </button>
      </div>
      <h5 className="text-sm font-medium text-white">고객 미리보기</h5>
      <p className="mt-1 text-xs text-zinc-400">화면에서 확인한 구성입니다. 제작 출력이 아닙니다.</p>
      <div className="mt-3 flex min-h-48 items-center justify-center rounded-lg bg-zinc-950 p-3">
        <ImageSlot
          slot={preview}
          alt="고객 미리보기"
          onError={onPreviewError}
          empty="고객 미리보기를 확인할 수 없습니다."
        />
      </div>
      {!ready ? <p className="mt-3 text-sm font-medium text-amber-200">제작 정보 확인 필요</p> : null}
      <div className="mt-4">
        <button
          type="button"
          className="min-h-11 rounded-lg bg-white/10 px-3 text-sm text-white"
          aria-expanded={showOriginal}
          onClick={() => setShowOriginal((open) => !open)}
        >
          {showOriginal ? '원본 소스 닫기' : '원본 소스 보기'}
        </button>
        {showOriginal ? (
          <div className="mt-3">
            <h5 className="text-sm font-medium text-white">원본 소스</h5>
            <p className="mt-1 text-xs text-zinc-400">고객이 올린 원본입니다. 잘라낸 제작 파일이 아닙니다.</p>
            <div className="mt-3 flex min-h-32 items-center justify-center rounded-lg bg-zinc-950 p-3">
              <ImageSlot
                slot={original}
                alt="원본 소스"
                onError={onOriginalError}
                empty="원본 소스를 확인할 수 없습니다."
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4">
        <h5 className="text-sm font-medium text-white">제작 출력</h5>
        <p className="mt-1 text-xs text-zinc-400">구매 시점의 구도와 원본 픽셀로 만든 제작 파일입니다.</p>
        {resolution ? (
          <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
            <dt className="text-zinc-500">크롭 픽셀</dt>
            <dd className="text-zinc-100">{resolution.width} × {resolution.height} px</dd>
            <dt className="text-zinc-500">출력 픽셀</dt>
            <dd className="text-zinc-100">{resolution.width} × {resolution.height} px</dd>
            <dt className="text-zinc-500">실물 치수</dt>
            <dd className="text-zinc-100">{resolution.widthMm} × {resolution.heightMm} mm</dd>
            <dt className="text-zinc-500">유효 해상도</dt>
            <dd className="text-zinc-100">{resolution.ppiX.toFixed(1)} × {resolution.ppiY.toFixed(1)} PPI</dd>
            <dt className="text-zinc-500">픽셀 반올림</dt>
            <dd className="text-zinc-400">{resampling?.text}</dd>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-amber-200">제작 출력을 계산할 구매 구도 또는 원본 픽셀이 없습니다.</p>
        )}
        {resolution?.belowReference ? (
          <p className="mt-2 text-sm font-medium text-amber-200">
            {lowResolutionCopy(resolution.ppiX, resolution.ppiY, resolution.widthMm, resolution.heightMm)}
          </p>
        ) : null}
        {storedSizeDiffers ? (
          <p className="mt-2 text-sm font-medium text-amber-200">저장된 치수와 제작 규격이 다릅니다. 제작 치수는 구매 규격을 사용합니다.</p>
        ) : null}
        {!item.originalRef ? (
          <p className="mt-2 text-sm font-medium text-amber-200">제작 출력에 쓸 원본 소스가 없습니다.</p>
        ) : null}
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40"
          disabled={!canDownload || downloadState === 'working'}
          onClick={() => void downloadManufacturing()}
        >
          {downloadState === 'working' ? '제작 출력을 만드는 중' : '제작 출력 받기'}
        </button>
        {downloadState === 'failed' ? <p className="mt-2 text-sm text-amber-200">{downloadNote}</p> : null}
        {downloadState === 'saved' && downloadNote ? <p className="mt-2 text-sm text-zinc-300">{downloadNote}</p> : null}
      </div>
      <h5 className="mt-4 text-sm font-medium text-white">제작 사양</h5>
      <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
        <dt className="text-zinc-500">사용자</dt>
        <dd className="break-all text-zinc-100">{buyerId || '—'}</dd>
        <dt className="text-zinc-500">주문 시각</dt>
        <dd className="text-zinc-100">{orderedAt || '—'}</dd>
        <dt className="text-zinc-500">고객 미리보기</dt>
        <dd className="break-all text-zinc-100">{item.imageUrl || '—'}</dd>
        <dt className="text-zinc-500">원본 소스</dt>
        <dd className="break-all text-zinc-100">{item.originalRef || '—'}</dd>
        <dt className="text-zinc-500">원본 픽셀</dt>
        <dd className="text-zinc-100">
          {sourcePixels ? `${sourcePixels.width} × ${sourcePixels.height} px` : '저장된 원본 픽셀이 없습니다.'}
        </dd>
        <dt className="text-zinc-500">개당 구매가</dt>
        <dd className="text-zinc-100">{unitPrice == null ? '저장된 구매가가 없습니다.' : formatCustomMPrice(unitPrice)}</dd>
        {item.quantity > 1 && lineAmount != null ? (
          <>
            <dt className="text-zinc-500">수량</dt>
            <dd className="text-zinc-100">{item.quantity}</dd>
            <dt className="text-zinc-500">상품 금액</dt>
            <dd className="text-zinc-100">{formatCustomMPrice(lineAmount)} <span className="text-zinc-400">개당 구매가 × 수량</span></dd>
          </>
        ) : null}
        {processing.length > 0 ? (
          <>
            <dt className="text-zinc-500">처리 표시</dt>
            <dd className="text-zinc-100">{processing.join(' · ')}</dd>
          </>
        ) : null}
        {ready ? (
          <>
            <dt className="text-zinc-500">작품</dt>
            <dd className="text-zinc-100">커스텀 메탈 작품</dd>
            <dt className="text-zinc-500">크기</dt>
            <dd className="text-zinc-100">M</dd>
            <dt className="text-zinc-500">방향</dt>
            <dd className="text-zinc-100">{composition.orientation === 'landscape' ? '가로' : '세로'}</dd>
            <dt className="text-zinc-500">치수</dt>
            <dd className="text-zinc-100">
              {composition.widthMm != null && composition.heightMm != null
                ? `${composition.widthMm} × ${composition.heightMm} mm`
                : '저장된 치수가 없습니다.'}
            </dd>
            <dt className="text-zinc-500">확대</dt>
            <dd className="text-zinc-100">{Math.round(composition.zoom * 100)}%</dd>
            <dt className="text-zinc-500">위치</dt>
            <dd className="text-zinc-100">X {formatOffset(composition.offsetX)} · Y {formatOffset(composition.offsetY)}</dd>
            <dt className="text-zinc-500">구성 버전</dt>
            <dd className="text-zinc-100">{composition.version}</dd>
          </>
        ) : (
          <>
            <dt className="text-zinc-500">구성</dt>
            <dd className="text-zinc-400">저장된 구성이 부족해 치수와 위치를 만들지 않았습니다.</dd>
          </>
        )}
        <dt className="text-zinc-500">주문 번호</dt>
        <dd className="text-zinc-100">{orderNumber || orderId || '—'}</dd>
        {item.lineId ? (
          <>
            <dt className="text-zinc-500">상품 식별자</dt>
            <dd className="break-all text-zinc-100">{item.lineId}</dd>
          </>
        ) : null}
      </dl>
      {viewerOpen ? (
        <ProductionInspectionViewer
          key={`${orderId}:${itemIndex}`}
          item={item}
          orderNumber={orderNumber}
          itemIndex={itemIndex}
          preview={preview}
          original={original}
          onPreviewError={onPreviewError}
          onOriginalError={onOriginalError}
          onRequestManufacturing={requestManufacturingFile}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </section>
  );
}
