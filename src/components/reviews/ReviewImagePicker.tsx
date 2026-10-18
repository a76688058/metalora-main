import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  REVIEW_IMAGE_MAX_COUNT,
  releaseReviewImages,
  remainingReviewImageSlots,
  takeReviewImages,
  type ReviewImageDraft,
} from './reviewLimits';

export type SavedReviewPhotoView = {
  id: string;
  url: string;
};

type ReviewImagePickerProps = {
  images: ReviewImageDraft[];
  onChange: (images: ReviewImageDraft[]) => void;
  disabled?: boolean;
  savedPhotos?: SavedReviewPhotoView[];
  savedState?: 'hidden' | 'loading' | 'ready' | 'error';
  savedMessage?: string | null;
  onRefreshSaved?: () => void;
  canDeleteSaved?: boolean;
  confirmDeleteId?: string | null;
  deletingSavedId?: string | null;
  onAskDeleteSaved?: (imageId: string) => void;
  onConfirmDeleteSaved?: (imageId: string) => void;
  onCancelDeleteSaved?: () => void;
  pendingCleanups?: { imageId: string }[];
  onRetryCleanup?: (imageId: string) => void;
  /** Changes when the open review or account changes. Focus is not moved for a stale scope. */
  focusScope?: string | null;
};

export function ReviewImagePicker({
  images,
  onChange,
  disabled = false,
  savedPhotos = [],
  savedState = 'hidden',
  savedMessage = null,
  onRefreshSaved,
  canDeleteSaved = false,
  confirmDeleteId = null,
  deletingSavedId = null,
  onAskDeleteSaved,
  onConfirmDeleteSaved,
  onCancelDeleteSaved,
  pendingCleanups = [],
  onRetryCleanup,
  focusScope = null,
}: ReviewImagePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const deleteRefs = useRef(new Map<string, HTMLButtonElement>());
  const confirmRefs = useRef(new Map<string, HTMLButtonElement>());
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const retryRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusIntent = useRef<{ type: 'confirm' | 'restore'; id: string } | null>(null);
  const armedDeleteId = useRef<string | null>(null);
  const armedRetryId = useRef<string | null>(null);
  const scopeRef = useRef(focusScope);
  const previousPhotoIds = useRef<string[]>(savedPhotos.map((photo) => photo.id));
  const previousDeletingId = useRef<string | null>(deletingSavedId);
  const [message, setMessage] = useState<string | null>(null);
  const [brokenSaved, setBrokenSaved] = useState<string[]>([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const savedKnown = savedState === 'hidden' || savedState === 'ready';
  const savedCount = savedState === 'ready' ? savedPhotos.length : 0;
  const room = savedKnown ? remainingReviewImageSlots(savedCount, images.length) : 0;
  const full = disabled || room <= 0;

  useEffect(() => () => releaseReviewImages(imagesRef.current), []);
  useEffect(() => { setBrokenSaved([]); }, [savedPhotos]);

  const focusControl = (node: HTMLElement | null | undefined) => {
    if (!node || !node.isConnected) return;
    node.focus();
  };

  const focusSurvivor = (preferredDelete?: HTMLButtonElement | null) => {
    const nextDelete = preferredDelete ?? [...deleteRefs.current.values()].find((button) => !button.disabled);
    const nextRemove = [...removeRefs.current.values()].find((button) => !button.disabled);
    const nextRetry = [...retryRefs.current.values()].find((button) => !button.disabled);
    focusControl(
      nextDelete
      ?? nextRemove
      ?? (addRef.current && !addRef.current.disabled ? addRef.current : null)
      ?? refreshRef.current
      ?? nextRetry
      ?? statusRef.current,
    );
  };

  const focusAfterRemoval = (removedId: string, previousIds: string[], currentIds: string[]) => {
    const index = previousIds.indexOf(removedId);
    const nextId = currentIds[index] ?? currentIds[index - 1];
    focusSurvivor(nextId ? deleteRefs.current.get(nextId) : null);
  };

  useLayoutEffect(() => {
    if (scopeRef.current !== focusScope) {
      scopeRef.current = focusScope;
      focusIntent.current = null;
      armedDeleteId.current = null;
      armedRetryId.current = null;
      previousPhotoIds.current = savedPhotos.map((photo) => photo.id);
      previousDeletingId.current = deletingSavedId;
      return;
    }
    const intent = focusIntent.current;
    if (intent?.type === 'confirm' && confirmDeleteId === intent.id) {
      focusControl(confirmRefs.current.get(intent.id));
      focusIntent.current = null;
    } else if (intent?.type === 'restore' && confirmDeleteId == null) {
      if (savedPhotos.some((photo) => photo.id === intent.id)) focusControl(deleteRefs.current.get(intent.id));
      focusIntent.current = null;
    }
    const currentIds = savedPhotos.map((photo) => photo.id);
    const armed = armedDeleteId.current;
    if (armed && !currentIds.includes(armed)) {
      focusAfterRemoval(armed, previousPhotoIds.current, currentIds);
      armedDeleteId.current = null;
    } else if (previousDeletingId.current && !deletingSavedId && armed && currentIds.includes(armed) && confirmDeleteId === armed) {
      focusControl(confirmRefs.current.get(armed));
      armedDeleteId.current = null;
    }
    const retrying = armedRetryId.current;
    if (retrying && previousDeletingId.current === retrying && !deletingSavedId) {
      const retryButton = retryRefs.current.get(retrying);
      if (retryButton) focusControl(retryButton);
      else focusSurvivor();
      armedRetryId.current = null;
    }
    previousPhotoIds.current = currentIds;
    previousDeletingId.current = deletingSavedId ?? null;
  }, [focusScope, confirmDeleteId, deletingSavedId, savedPhotos, pendingCleanups]);

  const replace = (next: ReviewImageDraft[]) => {
    const removed = images.filter((image) => !next.some((item) => item.id === image.id));
    releaseReviewImages(removed);
    onChange(next);
  };

  const openPicker = () => inputRef.current?.click();
  const emptySlots = room;
  const countLabel = savedState === 'loading'
    ? '사진을 불러오는 중'
    : savedState === 'error'
      ? (savedMessage ?? '사진을 불러오지 못했습니다')
      : `${savedCount + images.length}/${REVIEW_IMAGE_MAX_COUNT} · 장당 5MB`;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-medium text-[#16150f] dark:text-[#f3f1ec]">사진</label>
        <span ref={statusRef} tabIndex={-1} className="focus-ring text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{countLabel}</span>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={full}
        className="sr-only"
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          event.target.value = '';
          const result = takeReviewImages(images, selected, savedCount);
          setMessage(result.message);
          replace(result.next);
        }}
      />
      <ul className="grid max-w-[24.75rem] grid-cols-3 gap-3">
        {savedState === 'ready' ? savedPhotos.map((photo) => {
          const broken = brokenSaved.includes(photo.id);
          return (
            <li key={photo.id}>
              {broken ? (
                <div className="flex aspect-square w-full items-center justify-center rounded-[2px] border border-black/10 px-2 text-center text-sm text-[#3f3c36] dark:border-white/10 dark:text-[#c9c4b8]">
                  사진을 불러오지 못했습니다
                </div>
              ) : (
                <img
                  src={photo.url}
                  alt="저장된 사진"
                  referrerPolicy="no-referrer"
                  onError={() => setBrokenSaved((current) => current.includes(photo.id) ? current : [...current, photo.id])}
                  className="aspect-square w-full rounded-[2px] border border-black/10 object-cover dark:border-white/10"
                />
              )}
              <p className="mt-1 text-sm text-[#3f3c36] dark:text-[#c9c4b8]">저장된 사진</p>
              {canDeleteSaved ? (
                <div className="mt-1 space-y-1">
                  {confirmDeleteId === photo.id ? (
                    <>
                      <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">이 사진을 삭제할까요?</p>
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) confirmRefs.current.set(photo.id, node);
                          else confirmRefs.current.delete(photo.id);
                        }}
                        disabled={deletingSavedId === photo.id}
                        aria-label="저장된 사진 삭제 확인"
                        onClick={() => {
                          armedDeleteId.current = photo.id;
                          onConfirmDeleteSaved?.(photo.id);
                        }}
                        className="focus-ring min-h-11 rounded-[2px] bg-[#f6f4ef] px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#101114] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
                      >
                        {deletingSavedId === photo.id ? '삭제 중' : '삭제'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          focusIntent.current = { type: 'restore', id: photo.id };
                          onCancelDeleteSaved?.();
                        }}
                        className="focus-ring min-h-11 rounded-[2px] px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
                      >
                        닫기
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      ref={(node) => {
                        if (node) deleteRefs.current.set(photo.id, node);
                        else deleteRefs.current.delete(photo.id);
                      }}
                      disabled={deletingSavedId === photo.id}
                      aria-label="저장된 사진 삭제"
                      onClick={() => {
                        focusIntent.current = { type: 'confirm', id: photo.id };
                        onAskDeleteSaved?.(photo.id);
                      }}
                      className="focus-ring min-h-11 rounded-[2px] bg-[#f6f4ef] px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#101114] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          );
        }) : null}
        {images.map((image, index) => (
          <li key={image.id}>
            <div className="relative">
              <img
                src={image.previewUrl}
                alt={`선택한 리뷰 이미지 ${index + 1}`}
                className="aspect-square w-full rounded-[2px] border border-black/10 object-cover dark:border-white/10"
              />
              <button
                type="button"
                ref={(node) => {
                  if (node) removeRefs.current.set(image.id, node);
                  else removeRefs.current.delete(image.id);
                }}
                disabled={image.status === 'uploading' || image.status === 'uploaded'}
                className="focus-ring absolute bottom-1 right-1 min-h-11 rounded-[2px] bg-[#f6f4ef] px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#101114] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
                onClick={() => replace(images.filter((item) => item.id !== image.id))}
              >
                제거
              </button>
            </div>
            <p className="mt-1 break-words text-sm text-[#3f3c36] dark:text-[#c9c4b8]" aria-live="polite">
              {image.status === 'uploading' ? '올리는 중' : image.status === 'uploaded' ? '저장됨' : image.status === 'failed' ? (image.statusLabel ?? '올리지 못함') : '추가할 사진'}
            </p>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, index) => (
          <li key={`empty-${index}`}>
            {index === 0 ? (
              <button
                type="button"
                ref={addRef}
                disabled={full}
                onClick={openPicker}
                className="focus-ring flex aspect-square w-full items-center justify-center rounded-[2px] border border-black/10 bg-transparent text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
              >
                사진 추가
              </button>
            ) : (
              <div className="aspect-square rounded-[2px] border border-black/10 dark:border-white/10" aria-hidden="true" />
            )}
          </li>
        ))}
      </ul>
      {message ? <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">{message}</p> : null}
      {onRefreshSaved && (savedState === 'error' || brokenSaved.length > 0) ? (
        <button type="button" ref={refreshRef} onClick={onRefreshSaved} className="focus-ring min-h-11 rounded-md px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]">
          다시 불러오기
        </button>
      ) : null}
      {pendingCleanups.map((item) => (
        <div key={item.imageId} className="space-y-1">
          <p className="text-sm text-[#3f3c36] dark:text-[#c9c4b8]">사진은 리뷰에서 제거되었습니다. 저장소 정리는 끝나지 않았습니다.</p>
          <button
            type="button"
            ref={(node) => {
              if (node) retryRefs.current.set(item.imageId, node);
              else retryRefs.current.delete(item.imageId);
            }}
            disabled={deletingSavedId === item.imageId}
            onClick={() => {
              armedRetryId.current = item.imageId;
              onRetryCleanup?.(item.imageId);
            }}
            className="focus-ring min-h-11 rounded-md px-2 text-sm font-medium text-[#3f3c36] hover:text-[#16150f] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#c9c4b8] dark:hover:text-[#f3f1ec]"
          >
            {deletingSavedId === item.imageId ? '정리 중' : '정리 다시 시도'}
          </button>
        </div>
      ))}
    </div>
  );
}
