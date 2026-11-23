import { useState } from 'react';
import type { AdminOrderItem } from './adminOrders';
import { formatCustomMPrice } from '../../lib/customComposition/customMPrice';
import { readPurchasedComposition } from '../../lib/customComposition/productionSnapshot';
import {
  readStoredPurchasedUnitPrice,
  readStoredSourcePixels,
  storedCustomLineAmount,
} from './adminOrderMapping';

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
  buyerId: string;
  orderedAt: string;
  preview: AdminImageSlot;
  original: AdminImageSlot;
  onPreviewError?: () => void;
  onOriginalError?: () => void;
  isolatedLabel?: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
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
  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4" aria-label="맞춤 제작 정보">
      {isolatedLabel ? <p className="mb-3 text-xs font-medium text-amber-200">{isolatedLabel}</p> : null}
      <h5 className="text-sm font-medium text-white">최종 제작 이미지</h5>
      <p className="mt-1 text-xs text-zinc-400">고객이 확정한 프레임 안의 구성입니다.</p>
      <div className="mt-3 flex min-h-48 items-center justify-center rounded-lg bg-zinc-950 p-3">
        <ImageSlot
          slot={preview}
          alt="최종 제작 이미지"
          onError={onPreviewError}
          empty="제작 정보 확인 필요"
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
          {showOriginal ? '원본 업로드 이미지 닫기' : '원본 업로드 이미지 보기'}
        </button>
        {showOriginal ? (
          <div className="mt-3">
            <h5 className="text-sm font-medium text-white">원본 업로드 이미지</h5>
            <p className="mt-1 text-xs text-zinc-400">제작 기준이 아닌, 고객이 올린 원본입니다.</p>
            <div className="mt-3 flex min-h-32 items-center justify-center rounded-lg bg-zinc-950 p-3">
              <ImageSlot
                slot={original}
                alt="원본 업로드 이미지"
                onError={onOriginalError}
                empty="원본 이미지를 확인할 수 없습니다."
              />
            </div>
          </div>
        ) : null}
      </div>
      <h5 className="mt-4 text-sm font-medium text-white">제작 사양</h5>
      <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
        <dt className="text-zinc-500">사용자</dt>
        <dd className="break-all text-zinc-100">{buyerId || '—'}</dd>
        <dt className="text-zinc-500">주문 시각</dt>
        <dd className="text-zinc-100">{orderedAt || '—'}</dd>
        <dt className="text-zinc-500">편집 이미지</dt>
        <dd className="break-all text-zinc-100">{item.imageUrl || '—'}</dd>
        <dt className="text-zinc-500">원본 이미지</dt>
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
    </section>
  );
}
