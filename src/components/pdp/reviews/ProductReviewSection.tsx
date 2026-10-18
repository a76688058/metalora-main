import React, { useEffect, useRef, useState } from 'react';
import { REVIEW_READ_API_READY } from '../../../types/reviews';
import { FACTUAL_SHELL } from '../factualVisuals';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/cn';
import {
  PUBLIC_REVIEW_PAGE_SIZE,
  publicReviewAdapter,
} from './publicReviewAdapter';
import {
  PUBLIC_REVIEW_PHOTO_TTL_MS,
  loadPublicReviewPhotos,
  photoResultIsCurrent,
  selectReviewIdsForPhotos,
} from './publicReviewPhotos';
import type {
  PublicCatalogReview,
  PublicReviewAdapter,
  PublicReviewPage,
  PublicReviewPhoto,
  PublicReviewPhotoResult,
} from './publicReviewTypes';

type SectionState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; page: PublicReviewPage };

const WORKSHOP_CATALOG_EXCLUSION = 'workshop-single';
const PHOTO_REFRESH_BUDGET = 1;

type ReviewPhotoEntry =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'failed' }
  | { status: 'ready'; images: PublicReviewPhoto[] };

function photoEntry(result: PublicReviewPhotoResult): ReviewPhotoEntry {
  if (result.status === 'ok') return { status: 'ready', images: result.images };
  if (result.status === 'empty') return { status: 'empty' };
  if (result.status === 'unavailable') return { status: 'empty' };
  return { status: 'failed' };
}

function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function formatAverage(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function StarGlyphs({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span aria-hidden="true" className="tracking-[0.12em] text-text-primary">
      {'★'.repeat(filled)}
      {'☆'.repeat(5 - filled)}
    </span>
  );
}

function ReviewPhoto({
  photo,
  index,
  onExpired,
}: {
  photo: PublicReviewPhoto;
  index: number;
  onExpired: (imageId: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [photo.url]);

  return (
    <li className="aspect-square min-w-0 overflow-hidden border border-border-subtle">
      {broken ? (
        <span className="flex h-full items-center justify-center px-2 text-center type-metadata text-text-tertiary">
          사진을 표시할 수 없습니다
        </span>
      ) : (
        <img
          src={photo.url}
          alt={`리뷰 사진 ${index + 1}`}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => {
            setBroken(true);
            onExpired(photo.id);
          }}
        />
      )}
    </li>
  );
}

function ReviewCard({
  review,
  photos,
  onPhotoExpired,
}: {
  review: PublicCatalogReview;
  photos: ReviewPhotoEntry | undefined;
  onPhotoExpired: (imageId: string) => void;
}) {
  const created = formatReviewDate(review.createdAt);
  return (
    <article className="min-w-0 border-t border-border-subtle py-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StarGlyphs value={review.rating} />
        <span className="type-metadata text-text-secondary">5점 만점에 {review.rating}점</span>
        <span className="type-metadata text-text-primary">구매 확인</span>
        {created ? <time dateTime={review.createdAt} className="type-metadata text-text-tertiary">{created}</time> : null}
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words type-body text-text-primary">{review.body}</p>
      {photos?.status === 'loading' ? (
        <p className="mt-4 type-metadata text-text-tertiary" role="status">사진을 불러오는 중입니다.</p>
      ) : null}
      {photos?.status === 'failed' ? (
        <p className="mt-4 type-metadata text-text-tertiary" role="status">사진을 불러오지 못했습니다.</p>
      ) : null}
      {photos?.status === 'ready' && photos.images.length > 0 ? (
        <ul className="mt-4 grid w-full max-w-[18rem] grid-cols-3 gap-2">
          {photos.images.map((photo, index) => (
            <ReviewPhoto key={photo.id} photo={photo} index={index} onExpired={onPhotoExpired} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function ProductReviewSection({
  productId,
  adapter = publicReviewAdapter,
}: {
  productId: string;
  adapter?: PublicReviewAdapter;
}) {
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<SectionState>(() => (
    REVIEW_READ_API_READY ? { status: 'loading' } : { status: 'unavailable' }
  ));
  const [photoMap, setPhotoMap] = useState<Record<string, ReviewPhotoEntry>>({});
  const requestRef = useRef(0);
  const photoTokenRef = useRef(0);
  const refreshBudgetRef = useRef<Record<string, number>>({});
  const queryRef = useRef({ productId, page });
  const liveQueryRef = useRef({ productId, page });
  liveQueryRef.current = { productId, page };

  if (queryRef.current.productId !== productId || queryRef.current.page !== page) {
    const productChanged = queryRef.current.productId !== productId;
    queryRef.current = { productId, page: productChanged ? 1 : page };
    if (productChanged && page !== 1) setPage(1);
    setState(REVIEW_READ_API_READY ? { status: 'loading' } : { status: 'unavailable' });
    setPhotoMap({});
  }

  useEffect(() => {
    if (productId === WORKSHOP_CATALOG_EXCLUSION) return undefined;
    const requestId = ++requestRef.current;
    if (!REVIEW_READ_API_READY) {
      setState({ status: 'unavailable' });
      return undefined;
    }
    let active = true;
    setState({ status: 'loading' });
    void adapter.loadApprovedReviews({
      productId,
      page,
      pageSize: PUBLIC_REVIEW_PAGE_SIZE,
    }).then((result) => {
      if (!active || requestId !== requestRef.current) return;
      if (result.status === 'unavailable') {
        setState({ status: 'unavailable' });
        return;
      }
      if (result.status === 'error') {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', page: result.page });
    }).catch(() => {
      if (active && requestId === requestRef.current) setState({ status: 'error' });
    });
    return () => {
      active = false;
    };
  }, [adapter, page, productId, reloadKey]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const total = Math.max(1, Math.ceil(state.page.approvedCount / state.page.pageSize));
    if (page > total) setPage(total);
  }, [page, state]);

  const visibleReviewIds = state.status === 'ready' ? selectReviewIdsForPhotos(state.page.reviews) : [];
  const visibleReviewKey = visibleReviewIds.join(',');

  useEffect(() => {
    const token = ++photoTokenRef.current;
    refreshBudgetRef.current = {};
    if (!REVIEW_READ_API_READY || productId === WORKSHOP_CATALOG_EXCLUSION || visibleReviewKey.length === 0) {
      setPhotoMap({});
      return undefined;
    }
    const productAtStart = productId;
    const pageAtStart = page;
    const ids = visibleReviewKey.split(',');
    let active = true;
    let refreshTimer = 0;
    setPhotoMap(Object.fromEntries(ids.map((id) => [id, { status: 'loading' }])));
    void Promise.all(ids.map(async (id) => [id, photoEntry(await loadPublicReviewPhotos(id))] as const))
      .then((entries) => {
        if (!active || !photoResultIsCurrent({
          token,
          currentToken: photoTokenRef.current,
          productId: productAtStart,
          currentProductId: liveQueryRef.current.productId,
          page: pageAtStart,
          currentPage: liveQueryRef.current.page,
        })) return;
        setPhotoMap(Object.fromEntries(entries));
        refreshTimer = window.setTimeout(() => {
          if ((refreshBudgetRef.current.__ttl ?? 0) >= PHOTO_REFRESH_BUDGET) return;
          refreshBudgetRef.current.__ttl = PHOTO_REFRESH_BUDGET;
          void Promise.all(ids.map(async (id) => [id, photoEntry(await loadPublicReviewPhotos(id))] as const))
            .then((refreshed) => {
              if (!photoResultIsCurrent({
                token,
                currentToken: photoTokenRef.current,
                productId: productAtStart,
                currentProductId: liveQueryRef.current.productId,
                page: pageAtStart,
                currentPage: liveQueryRef.current.page,
              })) return;
              setPhotoMap(Object.fromEntries(refreshed));
            })
            .catch(() => undefined);
        }, PUBLIC_REVIEW_PHOTO_TTL_MS);
      })
      .catch(() => {
        if (!active || token !== photoTokenRef.current) return;
        setPhotoMap(Object.fromEntries(ids.map((id) => [id, { status: 'failed' }])));
      });
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
    };
  }, [page, productId, reloadKey, visibleReviewKey]);

  const refreshReviewPhotos = (reviewId: string) => {
    if (!REVIEW_READ_API_READY) return;
    if ((refreshBudgetRef.current[reviewId] ?? 0) >= PHOTO_REFRESH_BUDGET) return;
    refreshBudgetRef.current[reviewId] = PHOTO_REFRESH_BUDGET;
    const token = photoTokenRef.current;
    const productAtStart = liveQueryRef.current.productId;
    const pageAtStart = liveQueryRef.current.page;
    void loadPublicReviewPhotos(reviewId).then((result) => {
      if (!photoResultIsCurrent({
        token,
        currentToken: photoTokenRef.current,
        productId: productAtStart,
        currentProductId: liveQueryRef.current.productId,
        page: pageAtStart,
        currentPage: liveQueryRef.current.page,
      })) return;
      setPhotoMap((current) => ({ ...current, [reviewId]: photoEntry(result) }));
    }).catch(() => undefined);
  };

  if (productId === WORKSHOP_CATALOG_EXCLUSION) return null;

  const readyPage = state.status === 'ready' ? state.page : null;
  const totalPages = readyPage ? Math.max(1, Math.ceil(readyPage.approvedCount / readyPage.pageSize)) : 1;
  const showPager = Boolean(readyPage && readyPage.approvedCount > readyPage.pageSize);

  return (
    <section aria-labelledby="pdp-reviews-title" className={cn(FACTUAL_SHELL, 'min-w-0 py-16 sm:py-20')} aria-busy={state.status === 'loading'}>
      <h2 id="pdp-reviews-title" className="type-section-title text-text-primary">리뷰</h2>

      {state.status === 'loading' ? (
        <p className="mt-6 type-body text-text-secondary" role="status" aria-live="polite">리뷰를 불러오는 중입니다.</p>
      ) : null}

      {state.status === 'unavailable' ? (
        <p className="mt-6 type-body text-text-secondary" role="status">공개 리뷰를 아직 불러올 수 없습니다.</p>
      ) : null}

      {state.status === 'error' ? (
        <div className="mt-6 flex flex-col items-start gap-4" role="alert">
          <p className="type-body text-text-secondary">리뷰를 불러오지 못했습니다.</p>
          <Button type="button" variant="secondary" size="md" onClick={() => setReloadKey((current) => current + 1)}>
            다시 시도
          </Button>
        </div>
      ) : null}

      {readyPage && readyPage.approvedCount === 0 ? (
        <p className="mt-6 type-body text-text-secondary" role="status">아직 승인된 리뷰가 없습니다.</p>
      ) : null}

      {readyPage && readyPage.approvedCount > 0 && readyPage.averageRating !== null ? (
        <div className="mt-6 flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-3">
            <StarGlyphs value={readyPage.averageRating} />
            <span className="type-body text-text-primary">
              평균 {formatAverage(readyPage.averageRating)} / 5
            </span>
          </p>
          <p className="type-metadata text-text-secondary">승인된 리뷰 {readyPage.approvedCount}개</p>
        </div>
      ) : null}

      {readyPage && readyPage.approvedCount > 0 && readyPage.reviews.length === 0 ? (
        <p className="mt-6 type-body text-text-secondary" role="status">이 페이지에는 리뷰가 없습니다.</p>
      ) : null}

      {readyPage && readyPage.reviews.length > 0 ? (
        <div className="mt-8">
          {readyPage.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              photos={photoMap[review.id]}
              onPhotoExpired={() => refreshReviewPhotos(review.id)}
            />
          ))}
        </div>
      ) : null}

      {showPager && readyPage ? (
        <nav aria-label="리뷰 페이지" className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={readyPage.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            이전
          </Button>
          <p className="type-metadata text-text-secondary" aria-current="page" aria-live="polite">
            <span className="sr-only">현재 페이지 </span>
            {readyPage.page} / {totalPages}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={readyPage.page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            다음
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
