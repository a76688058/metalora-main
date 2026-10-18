/** UI limits from the approved NEW27 contract. The server remains the authority. */

import { REVIEW_IMAGE_MAX_BYTES, REVIEW_IMAGE_MAX_COUNT } from '../../types/reviews';

export { REVIEW_IMAGE_MAX_BYTES, REVIEW_IMAGE_MAX_COUNT };

const REVIEW_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ReviewImageUploadStatus = 'selected' | 'uploading' | 'uploaded' | 'failed';

export type ReviewImageDraft = {
  id: string;
  file: File;
  previewUrl: string;
  status: ReviewImageUploadStatus;
  statusLabel: string | null;
};

export function reviewImageRejection(file: File): string | null {
  if (!REVIEW_IMAGE_TYPES.has(file.type)) {
    return 'JPEG, PNG, WebP 이미지만 선택할 수 있습니다.';
  }
  if (file.size <= 0 || file.size > REVIEW_IMAGE_MAX_BYTES) {
    return '이미지 한 장은 5MB 이하여야 합니다.';
  }
  return null;
}

export function remainingReviewImageSlots(savedCount: number, selectedCount: number): number {
  if (!Number.isInteger(savedCount) || savedCount < 0 || !Number.isInteger(selectedCount) || selectedCount < 0) return 0;
  return Math.max(0, REVIEW_IMAGE_MAX_COUNT - savedCount - selectedCount);
}

export function takeReviewImages(
  current: ReviewImageDraft[],
  incoming: File[],
  savedCount = 0,
): { next: ReviewImageDraft[]; message: string | null } {
  const next = [...current];
  let message: string | null = null;
  for (const file of incoming) {
    if (remainingReviewImageSlots(savedCount, next.length) <= 0) {
      message = '이미지는 3장까지 선택할 수 있습니다.';
      break;
    }
    const rejection = reviewImageRejection(file);
    if (rejection) {
      message = rejection;
      continue;
    }
    next.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'selected',
      statusLabel: null,
    });
  }
  return { next, message };
}

export function releaseReviewImages(images: readonly ReviewImageDraft[]) {
  for (const image of images) URL.revokeObjectURL(image.previewUrl);
}
