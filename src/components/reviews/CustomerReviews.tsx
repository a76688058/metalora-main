import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { ReviewImagePicker } from './ReviewImagePicker';
import { StarRating } from './StarRating';
import {
  REVIEW_BACKEND_UNAVAILABLE,
  REVIEW_STATUS_LABEL,
  createReview,
  deleteOwnedReviewImage,
  deleteReview,
  editReview,
  fetchMyReviews,
  fetchOwnedReviewImages,
  readReviewAvailability,
  reviewErrorMessage,
  reviewReadsEnabled,
  reviewWritesEnabled,
  uploadReviewPhoto,
  type OwnedReviewPhoto,
  type ReviewReadState,
  type ReviewStatus,
} from './reviewCopy';
import { releaseReviewImages, type ReviewImageDraft } from './reviewLimits';
import { REVIEW_BODY_MAX, reviewUiPreviewEnabled, type ReviewEligibility } from '../../types/reviews';

type ReviewPhoto = {
  src: string;
  alt: string;
};

type OwnReview = {
  id: string;
  orderItemLabel: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  imageSrc?: string | null;
  photos?: ReviewPhoto[];
};

export type CustomerReviewPreviewScene = 'filled' | 'loading' | 'empty' | 'error';

export type CustomerReviewPreview = {
  scene: CustomerReviewPreviewScene;
  eligible: ReviewEligibility | null;
  productImageSrc?: string | null;
  reviews: OwnReview[];
};

type PurchaseChoice = {
  id: string;
  productId: string | null;
  label: string;
};

function purchaseLabel(productId: string | null, title: unknown): string {
  if (typeof title === 'string' && title.trim()) return title.trim();
  return productId === null ? '맞춤 제작' : '카탈로그 상품';
}

async function fetchOwnOrderItems(userId: string): Promise<PurchaseChoice[]> {
  const { data: orders, error: orderError } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', userId);
  if (orderError) throw orderError;
  const orderIds = (Array.isArray(orders) ? orders : []).flatMap((row) => {
    const id = row && typeof row === 'object' && 'id' in row ? (row as { id?: unknown }).id : null;
    return typeof id === 'string' ? [id] : [];
  });
  if (orderIds.length === 0) return [];
  const { data: items, error: itemError } = await supabase
    .from('order_items')
    .select('id, product_id, product_title, order_id')
    .in('order_id', orderIds);
  if (itemError) throw itemError;
  return (Array.isArray(items) ? items : []).flatMap((row) => {
    if (!row || typeof row !== 'object' || !('id' in row)) return [];
    const id = (row as { id?: unknown }).id;
    const rawProductId = (row as { product_id?: unknown }).product_id;
    const title = (row as { product_title?: unknown }).product_title;
    if (typeof id !== 'string') return [];
    let productId: string | null;
    if (rawProductId === null) productId = null;
    else if (typeof rawProductId === 'string') productId = rawProductId;
    else return [];
    return [{ id, productId, label: purchaseLabel(productId, title) }];
  });
}

type CustomerReviewsProps = {
  onBack: () => void;
  /** Ignored unless the dev-only preview gate is on. Never writes. */
  preview?: CustomerReviewPreview;
  /** The account overlay already shows the page title. */
  embedded?: boolean;
};

function Readout({
  state,
  loading,
  empty,
  error,
  unavailable,
}: {
  state: ReviewReadState;
  loading: string;
  empty: string;
  error: string;
  unavailable: string;
}) {
  if (state === 'loading') {
    return <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]" aria-busy="true">{loading}</p>;
  }
  if (state === 'empty') return <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{empty}</p>;
  if (state === 'error') return <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{error}</p>;
  return <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{unavailable}</p>;
}

/** Portrait matches the confirmed M panel, 200 × 283 mm. A missing image stays a flat neutral plate. */
function ProductPlate({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className="aspect-[200/283] w-full rounded-[2px] border border-black/10 object-cover dark:border-white/10"
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${alt} 이미지 없음`}
      className="aspect-[200/283] w-full rounded-[2px] border border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]"
    />
  );
}

function StaticStars({ value }: { value: number }) {
  const score = Math.min(5, Math.max(0, value));
  return (
    <p className="text-base tracking-wide text-[#16150f] dark:text-[#f3f1ec]" aria-label={`${score}점`}>
      <span aria-hidden="true">{'★'.repeat(score)}{'☆'.repeat(5 - score)}</span>
    </p>
  );
}

export function CustomerReviews({ onBack, preview, embedded = false }: CustomerReviewsProps) {
  const previewOn = reviewUiPreviewEnabled() && preview != null;
  const [eligibility, setEligibility] = useState<ReviewReadState>('loading');
  const [ownReviews, setOwnReviews] = useState<ReviewReadState>('loading');
  const [reviews, setReviews] = useState<OwnReview[]>([]);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [images, setImages] = useState<ReviewImageDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<PurchaseChoice[]>([]);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [createdReviewId, setCreatedReviewId] = useState<string | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<OwnedReviewPhoto[]>([]);
  const [savedState, setSavedState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [savedReload, setSavedReload] = useState(0);
  const [photoCleanups, setPhotoCleanups] = useState<{ reviewId: string; imageId: string }[]>([]);
  const [confirmPhotoId, setConfirmPhotoId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const loadGen = useRef(0);
  const savedGen = useRef(0);
  const photoActionGen = useRef(0);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const showEligible = previewOn && preview?.scene === 'filled' && preview.eligible?.eligible === true;
  const productTitle = showEligible && preview?.eligible ? preview.eligible.productTitle : null;
  const productImageSrc = showEligible ? preview?.productImageSrc : null;

  const applyPreview = () => {
    if (!preview) return;
    setOrderItems([]);
    setSelectedOrderItemId(null);
    if (preview.scene !== 'filled') {
      setEligibility(preview.scene);
      setOwnReviews(preview.scene);
      setReviews([]);
      return;
    }
    setEligibility('empty');
    setOwnReviews('empty');
    setReviews(preview.reviews);
  };

  const loadAccountReviews = async (generation: { current: number }, token: number) => {
    setEligibility('loading');
    setOwnReviews('loading');
    setFormError(null);
    if (!reviewReadsEnabled() && !reviewWritesEnabled()) {
      const availability = readReviewAvailability();
      setEligibility(availability);
      setOwnReviews(availability);
      setReviews([]);
      setOrderItems([]);
      setSelectedOrderItemId(null);
      return;
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (generation.current !== token) return;
    const userId = sessionData.session?.user?.id ?? null;
    if (sessionError || !userId) {
      setEligibility('unavailable');
      setOwnReviews('unavailable');
      setReviews([]);
      setOrderItems([]);
      setSelectedOrderItemId(null);
      return;
    }
    let purchases: PurchaseChoice[] = [];
    try {
      purchases = await fetchOwnOrderItems(userId);
      if (generation.current !== token) return;
      setOrderItems(purchases);
      setSelectedOrderItemId((current) => current && purchases.some((item) => item.id === current) ? current : purchases[0]?.id ?? null);
      setEligibility(purchases.length === 0 ? 'empty' : 'empty');
    } catch {
      if (generation.current !== token) return;
      setEligibility('error');
      setOrderItems([]);
    }
    if (!reviewReadsEnabled()) {
      setOwnReviews('unavailable');
      setReviews([]);
      return;
    }
    try {
      const rows = await fetchMyReviews();
      if (generation.current !== token) return;
      const visible = rows.flatMap((row) => {
        if (row.rating === null || !row.body) return [];
        const match = purchases.find((item) => item.id === row.orderItemId);
        const label = match?.label ?? (row.productId === null ? '맞춤 제작' : '카탈로그 상품');
        return [{
          id: row.id,
          orderItemLabel: label,
          rating: row.rating,
          body: row.body,
          status: row.status,
        }];
      });
      setReviews(visible);
      setOwnReviews('empty');
    } catch {
      if (generation.current !== token) return;
      setOwnReviews('error');
      setReviews([]);
    }
  };

  useEffect(() => {
    if (previewOn) {
      applyPreview();
      return;
    }
    const run = () => {
      const token = ++loadGen.current;
      void loadAccountReviews(loadGen, token);
    };
    run();
    const { data } = supabase.auth.onAuthStateChange(() => {
      setReviews([]);
      setOrderItems([]);
      setSelectedOrderItemId(null);
      setEditingId(null);
      setDeleteId(null);
      setCreatedReviewId(null);
      savedGen.current += 1;
      photoActionGen.current += 1;
      setSavedPhotos([]);
      setSavedState('idle');
      setSavedMessage(null);
      setPhotoCleanups([]);
      setConfirmPhotoId(null);
      setDeletingPhotoId(null);
      releaseReviewImages(imagesRef.current);
      setImages([]);
      setFormError(null);
      setFormNotice(null);
      setSubmitting(false);
      run();
    });
    return () => {
      loadGen.current += 1;
      data.subscription.unsubscribe();
    };
  }, [previewOn, preview]);

  const photoReviewId = previewOn ? null : (editingId ?? createdReviewId);

  useEffect(() => {
    if (!photoReviewId || (!reviewReadsEnabled() && !reviewWritesEnabled())) {
      setSavedPhotos([]);
      setSavedState('idle');
      setSavedMessage(null);
      return;
    }
    const token = ++savedGen.current;
    const reviewId = photoReviewId;
    setSavedState('loading');
    setSavedMessage(null);
    void fetchOwnedReviewImages(reviewId)
      .then((photos) => {
        if (savedGen.current !== token) return;
        setSavedPhotos(photos);
        setSavedState('ready');
      })
      .catch((error: unknown) => {
        if (savedGen.current !== token) return;
        setSavedPhotos([]);
        setSavedState('error');
        setSavedMessage(reviewErrorMessage(error));
      });
    return () => {
      savedGen.current += 1;
    };
  }, [photoReviewId, savedReload]);

  useEffect(() => {
    photoActionGen.current += 1;
    setConfirmPhotoId(null);
    setDeletingPhotoId(null);
  }, [photoReviewId]);

  const visibleSaved = savedPhotos.filter((photo) => !photoCleanups.some((item) => item.reviewId === photoReviewId && item.imageId === photo.id));
  const currentCleanups = photoCleanups.filter((item) => item.reviewId === photoReviewId);

  const deleteSavedPhoto = async (imageId: string) => {
    if (previewOn || !reviewWritesEnabled() || !photoReviewId || deletingPhotoId) return;
    const reviewId = photoReviewId;
    const token = photoActionGen.current;
    setDeletingPhotoId(imageId);
    try {
      const outcome = await deleteOwnedReviewImage(reviewId, imageId);
      if (photoActionGen.current !== token) return;
      setSavedPhotos((current) => current.filter((photo) => photo.id !== imageId));
      setConfirmPhotoId(null);
      if (outcome === 'retry') {
        setPhotoCleanups((current) => current.some((item) => item.reviewId === reviewId && item.imageId === imageId)
          ? current
          : [...current, { reviewId, imageId }]);
        setFormError(null);
        setFormNotice(reviewErrorMessage(new Error('photo_delete_retry')));
      } else {
        setPhotoCleanups((current) => current.filter((item) => !(item.reviewId === reviewId && item.imageId === imageId)));
        setFormNotice(null);
      }
      setSavedReload((value) => value + 1);
    } catch (error) {
      if (photoActionGen.current !== token) return;
      setFormNotice(null);
      setFormError(reviewErrorMessage(error));
    } finally {
      if (photoActionGen.current === token) setDeletingPhotoId(null);
    }
  };

  const refresh = () => {
    if (previewOn && preview) {
      setEligibility('loading');
      setOwnReviews('loading');
      setReviews([]);
      applyPreview();
      return;
    }
    const token = ++loadGen.current;
    void loadAccountReviews(loadGen, token);
  };

  const clearEditor = () => {
    releaseReviewImages(imagesRef.current);
    savedGen.current += 1;
    setSavedPhotos([]);
    setSavedState('idle');
    setSavedMessage(null);
    setEditingId(null);
    setCreatedReviewId(null);
    setRating(0);
    setBody('');
    setImages([]);
  };

  const selectedPurchase = orderItems.find((item) => item.id === selectedOrderItemId) ?? null;
  const editingReview = reviews.find((review) => review.id === editingId) ?? null;
  const canAttachPhotos = !editingId || editingReview?.status === 'pending' || createdReviewId !== null;
  const canWrite = !previewOn && reviewWritesEnabled() && !submitting
    && rating >= 1 && rating <= 5
    && body.trim().length > 0 && body.trim().length <= REVIEW_BODY_MAX
    && (editingId !== null || selectedOrderItemId !== null);

  const submitReview = async () => {
    if (previewOn || !reviewWritesEnabled() || submitting) return;
    const text = body.trim();
    if (rating < 1 || rating > 5 || text.length < 1 || text.length > REVIEW_BODY_MAX) {
      setFormError('별점과 리뷰 내용을 확인해 주세요.');
      setFormNotice(null);
      return;
    }
    if (!editingId && !selectedOrderItemId) {
      setFormError('리뷰를 작성할 주문 상품을 선택해 주세요.');
      setFormNotice(null);
      return;
    }
    const token = loadGen.current;
    const alreadySaved = editingId ?? createdReviewId;
    const pendingPhotos = canAttachPhotos ? images.filter((image) => image.status !== 'uploaded') : [];
    setSubmitting(true);
    setFormError(null);
    setFormNotice(null);
    try {
      let reviewId = editingId ?? createdReviewId;
      if (editingId) {
        await editReview(editingId, rating, text);
      } else if (createdReviewId) {
        await editReview(createdReviewId, rating, text);
      } else if (selectedOrderItemId) {
        reviewId = await createReview(selectedOrderItemId, rating, text);
        if (loadGen.current !== token) return;
        setCreatedReviewId(reviewId);
      }
      if (loadGen.current !== token) return;
      if (!reviewId) throw new Error('review_create_failed');
      let failed = 0;
      let stored = 0;
      let limitReached = false;
      for (const image of pendingPhotos) {
        if (loadGen.current !== token) return;
        if (limitReached) {
          setImages((current) => current.map((item) => item.id === image.id
            ? { ...item, status: 'failed', statusLabel: reviewErrorMessage(new Error('photo_limit')) }
            : item));
          failed += 1;
          continue;
        }
        setImages((current) => current.map((item) => item.id === image.id
          ? { ...item, status: 'uploading', statusLabel: null }
          : item));
        try {
          await uploadReviewPhoto(reviewId, image.file);
          if (loadGen.current !== token) return;
          releaseReviewImages([image]);
          setImages((current) => current.filter((item) => item.id !== image.id));
          stored += 1;
        } catch (error) {
          if (loadGen.current !== token) return;
          const message = error instanceof Error && error.message === 'photo_limit';
          if (message) limitReached = true;
          setImages((current) => current.map((item) => item.id === image.id
            ? { ...item, status: 'failed', statusLabel: reviewErrorMessage(error) }
            : item));
          failed += 1;
        }
      }
      if (loadGen.current !== token) return;
      if (stored > 0) setSavedReload((value) => value + 1);
      if (failed > 0) {
        setFormNotice('리뷰는 저장되었습니다. 일부 사진은 올리지 못했습니다. 실패한 사진만 다시 올릴 수 있습니다.');
        refresh();
        return;
      }
      const savedWithPhotos = stored > 0;
      if (!savedWithPhotos) clearEditor();
      setFormNotice(alreadySaved
        ? (savedWithPhotos ? '리뷰를 수정했습니다. 사진도 저장되었습니다. 다시 검토됩니다.' : '리뷰를 수정했습니다. 다시 검토됩니다.')
        : (savedWithPhotos ? '리뷰를 등록했습니다. 사진도 저장되었습니다. 검토 후 공개됩니다.' : '리뷰를 등록했습니다. 검토 후 공개됩니다.'));
      refresh();
    } catch (error) {
      if (loadGen.current !== token) return;
      setFormNotice(null);
      setFormError(reviewErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (previewOn || !reviewWritesEnabled() || !deleteId || submitting) return;
    const reviewId = deleteId;
    const token = loadGen.current;
    setSubmitting(true);
    setFormError(null);
    setFormNotice(null);
    try {
      await deleteReview(reviewId);
      if (loadGen.current !== token) return;
      if (editingId === reviewId) clearEditor();
      setDeleteId(null);
      setFormNotice('리뷰를 삭제했습니다. 같은 주문 상품에는 다시 작성할 수 없습니다.');
      refresh();
    } catch (error) {
      if (loadGen.current !== token) return;
      setFormNotice(null);
      setFormError(reviewErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="@container space-y-6">
      <div className={`flex items-end gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {embedded ? <span className="sr-only">리뷰</span> : <h3 className="text-lg font-medium tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">리뷰</h3>}
        <button type="button" onClick={onBack} className="focus-ring min-h-11 rounded-md px-3 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]">
          내 정보
        </button>
      </div>

      <div className="grid items-start gap-6 @2xl:grid-cols-[minmax(168px,230px)_minmax(0,1fr)] @2xl:gap-8">
        <section aria-labelledby="review-product-heading">
          <h4 id="review-product-heading" className="sr-only">구매한 상품</h4>
          {productTitle ? (
            <div className="flex items-end gap-4 @2xl:block">
              <div className="w-24 shrink-0 @2xl:w-full">
                <ProductPlate src={productImageSrc} alt={productTitle} />
              </div>
              <div className="min-w-0 space-y-1 @2xl:mt-4">
                <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">METALORA</p>
                <p className="break-keep text-lg font-medium tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">{productTitle}</p>
                <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">구매가 확인된 상품</p>
              </div>
            </div>
          ) : selectedPurchase ? (
            <div className="space-y-4">
              <div className="flex items-end gap-4 @2xl:block">
                <div className="w-24 shrink-0 @2xl:w-full">
                  <ProductPlate src={null} alt={selectedPurchase.label} />
                </div>
                <div className="min-w-0 space-y-1 @2xl:mt-4">
                  <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">METALORA</p>
                  <p className="break-keep text-lg font-medium tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">{selectedPurchase.label}</p>
                  <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{selectedPurchase.productId === null ? '맞춤 제작' : '카탈로그'}</p>
                  <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">리뷰 가능 여부는 등록할 때 서버가 확인합니다.</p>
                </div>
              </div>
              {orderItems.length > 1 ? (
                <ul className="space-y-2">
                  {orderItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={item.id === selectedOrderItemId}
                        onClick={() => setSelectedOrderItemId(item.id)}
                        className="focus-ring min-h-11 w-full rounded-[2px] border border-black/10 px-3 text-left text-sm font-medium text-[#16150f] dark:border-white/10 dark:text-[#f3f1ec]"
                      >
                        {item.label}
                        <span className="ml-2 text-[#3f3c36] dark:text-[#c9c4b8]">{item.productId === null ? '맞춤 제작' : '카탈로그'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <Readout
                state={eligibility}
                loading="구매 확인 중"
                empty="불러온 주문 상품이 없습니다."
                error="구매 확인을 불러오지 못했습니다."
                unavailable="구매 자격은 서버에서만 확인됩니다. 지금은 주문 목록을 받을 수 없습니다."
              />
              {eligibility === 'error' ? (
                <Button type="button" variant="secondary" size="md" onClick={refresh}>다시 시도</Button>
              ) : null}
            </div>
          )}
        </section>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submitReview();
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-lg font-medium tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">{editingId ? '리뷰 수정' : '리뷰 작성'}</h4>
            {editingId ? (
              <button type="button" onClick={clearEditor} className="focus-ring min-h-11 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]">
                작성으로 돌아가기
              </button>
            ) : null}
          </div>
          <StarRating value={rating} onChange={setRating} className="gap-1 text-3xl" />
          <label className="block">
            <span className="sr-only">리뷰</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={5}
              placeholder="사용 경험에 대해 적어 주세요."
              maxLength={REVIEW_BODY_MAX}
              className="focus-ring min-h-32 w-full resize-y rounded-[2px] border border-black/10 bg-transparent px-4 py-3 text-base text-[#16150f] placeholder:text-[#3f3c36] dark:border-white/10 dark:text-[#f3f1ec] dark:placeholder:text-[#c9c4b8]"
            />
          </label>
          <ReviewImagePicker
            images={images}
            onChange={setImages}
            disabled={previewOn ? submitting : (!reviewWritesEnabled() || !canAttachPhotos || submitting)}
            savedPhotos={visibleSaved}
            savedState={previewOn || !photoReviewId ? 'hidden' : savedState === 'idle' ? 'loading' : savedState}
            savedMessage={savedMessage}
            onRefreshSaved={() => setSavedReload((value) => value + 1)}
            canDeleteSaved={!previewOn && reviewWritesEnabled()}
            confirmDeleteId={confirmPhotoId}
            deletingSavedId={deletingPhotoId}
            onAskDeleteSaved={setConfirmPhotoId}
            onConfirmDeleteSaved={(imageId) => { void deleteSavedPhoto(imageId); }}
            onCancelDeleteSaved={() => setConfirmPhotoId(null)}
            pendingCleanups={currentCleanups}
            onRetryCleanup={(imageId) => { void deleteSavedPhoto(imageId); }}
            focusScope={photoReviewId}
          />
          {previewOn ? null : !reviewWritesEnabled() ? (
            <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">사진 업로드는 아직 연결되지 않았습니다.</p>
          ) : !canAttachPhotos ? (
            <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">검토 중인 리뷰에만 사진을 추가할 수 있습니다.</p>
          ) : !photoReviewId ? (
            <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">리뷰가 저장된 뒤에 사진을 올립니다.</p>
          ) : null}
          <div className="space-y-3 pt-2">
            <Button type="submit" size="lg" disabled={!canWrite} loading={submitting} fullWidth aria-describedby="review-submit-note">
              {editingId ? '수정 저장' : '리뷰 등록'}
            </Button>
            <p id="review-submit-note" className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">
              {previewOn || !reviewWritesEnabled() ? REVIEW_BACKEND_UNAVAILABLE : '리뷰를 저장한 뒤 선택한 사진을 올립니다. 사진 안전 검사는 서버가 합니다.'}
            </p>
            {formError ? <p role="alert" className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{formError}</p> : null}
            {formNotice ? <p role="status" className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{formNotice}</p> : null}
          </div>
        </form>
      </div>

      <section aria-labelledby="own-reviews-heading" className="space-y-2 border-t border-black/10 pt-6 dark:border-white/10">
        <div className="flex items-baseline justify-between gap-3">
          <h4 id="own-reviews-heading" className="text-lg font-medium tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">내 리뷰</h4>
          {reviews.length > 0 ? <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{reviews.length}</p> : null}
        </div>
        {reviews.length === 0 ? (
          <Readout
            state={ownReviews}
            loading="내 리뷰를 불러오는 중"
            empty="작성한 리뷰가 없습니다."
            error="내 리뷰를 불러오지 못했습니다."
            unavailable="내 리뷰 목록은 서버 연결 후 표시됩니다."
          />
        ) : null}
        {ownReviews === 'error' ? (
          <Button type="button" variant="secondary" size="md" onClick={refresh}>다시 시도</Button>
        ) : null}
        <ul className="grid gap-x-8 @2xl:grid-cols-2">
          {reviews.map((review) => (
            <li key={review.id} className="border-b border-black/10 py-5 dark:border-white/10">
              <div className="flex items-start gap-3">
                <div className="w-11 shrink-0">
                  <ProductPlate src={review.imageSrc ?? productImageSrc} alt={review.orderItemLabel} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="break-keep text-lg font-medium tracking-[-0.02em] text-[#16150f] dark:text-[#f3f1ec]">{review.orderItemLabel}</p>
                    <p className="text-sm font-medium text-[#3f3c36] dark:text-[#c9c4b8]">{REVIEW_STATUS_LABEL[review.status]}</p>
                  </div>
                  <StaticStars value={review.rating} />
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#16150f] dark:text-[#f3f1ec]">{review.body}</p>
              {review.photos && review.photos.length > 0 ? (
                <ul className="mt-3 flex gap-2">
                  {review.photos.map((photo) => (
                    <li key={photo.src} className="w-14">
                      <img src={photo.src} alt={photo.alt} className="aspect-square w-full rounded-[2px] object-cover" />
                    </li>
                  ))}
                </ul>
              ) : null}
              {previewOn || reviewWritesEnabled() ? (
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    disabled={!previewOn && !reviewWritesEnabled()}
                    className="focus-ring min-h-11 rounded-md px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:opacity-50 dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
                    onClick={() => {
                      releaseReviewImages(imagesRef.current);
                      setImages([]);
                      setCreatedReviewId(null);
                      setEditingId(review.id);
                      setRating(review.rating);
                      setBody(review.body);
                      setDeleteId(null);
                      setFormError(null);
                      setFormNotice(null);
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={!previewOn && !reviewWritesEnabled()}
                    className="focus-ring min-h-11 rounded-md px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:opacity-50 dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
                    onClick={() => setDeleteId(review.id)}
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {deleteId ? (
        <div role="region" aria-labelledby="review-delete-title" className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 py-4 dark:border-white/10">
          <div>
            <h4 id="review-delete-title" className="text-sm font-medium text-[#16150f] dark:text-[#f3f1ec]">리뷰를 삭제할까요?</h4>
            <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">
              {previewOn || !reviewWritesEnabled()
                ? '삭제는 서버에서만 처리됩니다. 지금은 실행되지 않습니다.'
                : '삭제하면 리뷰는 비공개로 남고, 같은 주문 상품에 다시 작성할 수 없습니다.'}
            </p>
          </div>
          <div className="flex gap-2">
            {previewOn || !reviewWritesEnabled() ? null : (
              <Button type="button" size="md" disabled={submitting} onClick={() => { void confirmDelete(); }}>삭제</Button>
            )}
            <Button type="button" variant="secondary" size="md" onClick={() => setDeleteId(null)}>닫기</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
