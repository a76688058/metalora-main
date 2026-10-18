import { supabase } from '../../lib/supabase';
import {
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_READ_API_READY,
  REVIEW_WRITE_API_READY,
  type ReviewModerationAction,
  type ReviewModerationStatus,
  type ReviewReportReason,
} from '../../types/reviews';

export type ReviewReadState = 'loading' | 'empty' | 'error' | 'unavailable';

export type ReviewStatus = Exclude<ReviewModerationStatus, 'deleted'>;

export const REVIEW_BACKEND_UNAVAILABLE =
  '리뷰 저장은 아직 연결되지 않았습니다. 작성, 수정, 삭제, 심사는 실행되지 않습니다.';

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: '검토 중',
  approved: '공개',
  rejected: '반려',
  hidden: '숨김',
};

/** No network call. Hosted review RPCs stay closed until the readiness constants change. */
export function readReviewAvailability(): Exclude<ReviewReadState, 'loading'> {
  return REVIEW_READ_API_READY ? 'empty' : 'unavailable';
}

export function reviewReadsEnabled(): boolean {
  return REVIEW_READ_API_READY;
}

export function reviewWritesEnabled(): boolean {
  return REVIEW_WRITE_API_READY;
}

const REVIEW_ERROR_MESSAGE: Record<string, string> = {
  review_not_eligible: '이 주문에는 리뷰를 작성할 수 없습니다.',
  review_entitlement_consumed: '이 주문 상품의 리뷰 자격은 이미 사용되었습니다. 삭제해도 다시 작성할 수 없습니다.',
  review_not_owner: '이 리뷰를 변경할 수 없습니다.',
  withdrawn_subject_frozen: '탈퇴 처리된 계정에서는 리뷰를 변경할 수 없습니다.',
  review_auth_required: '로그인한 뒤에 다시 시도해 주세요.',
  review_order_not_owned: '본인 주문만 리뷰할 수 있습니다.',
  review_rating_invalid: '별점은 1점부터 5점까지입니다.',
  review_body_required: '리뷰 내용을 입력해 주세요.',
  review_moderation_forbidden: '심사 권한이 없습니다.',
  review_moderation_invalid: '지원하지 않는 심사 동작입니다.',
  review_delete_retry: '사진 정리가 끝나지 않았습니다. 삭제를 다시 눌러 주세요. 리뷰 자격은 복구되지 않습니다.',
  review_delete_failed: '리뷰를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  review_create_failed: '리뷰를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  photo_unauthorized: '로그인한 뒤에 다시 시도해 주세요.',
  photo_withdrawn: '탈퇴 처리된 계정에서는 사진을 올릴 수 없습니다.',
  photo_not_owner: '이 리뷰에 사진을 추가할 수 없습니다.',
  photo_too_large: '이미지 한 장은 5MB 이하여야 합니다.',
  photo_unsupported: 'JPEG, PNG, WebP 이미지만 올릴 수 있습니다.',
  photo_invalid: '이미지 파일을 확인할 수 없습니다.',
  photo_limit: '사진은 한 리뷰에 3장까지입니다. 이미 저장된 사진이 있으면 더 올릴 수 없습니다.',
  photo_not_allowed: '검토 중인 리뷰에만 사진을 추가할 수 있습니다.',
  photo_storage: '사진을 저장하지 못했습니다. 다시 시도해 주세요.',
  photo_failed: '사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.',
  photo_read_failed: '사진을 불러오지 못했습니다.',
  photo_not_found: '사진을 찾을 수 없습니다.',
  saved_delete_forbidden: '이 리뷰의 사진을 삭제할 권한이 없습니다.',
  saved_delete_withdrawn: '탈퇴한 계정에서는 사진을 삭제할 수 없습니다.',
  photo_delete_failed: '사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  photo_delete_retry: '사진은 리뷰에서 제거되었습니다. 저장소 정리는 끝나지 않았습니다.',
};

const REVIEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function reviewErrorMessage(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  for (const [code, message] of Object.entries(REVIEW_ERROR_MESSAGE)) {
    if (raw.includes(code)) return message;
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export type ListedReview = {
  id: string;
  orderItemId: string;
  productId: string | null;
  rating: number | null;
  body: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type ListedReviewEvent = {
  id: string;
  action: ReviewModerationAction;
  reasonCode: ReviewReportReason | null;
  fromStatus: ReviewModerationStatus | null;
  toStatus: ReviewModerationStatus | null;
  createdAt: string;
};

const REVIEW_STATUSES = new Set<ReviewStatus>(['pending', 'approved', 'rejected', 'hidden']);
const EVENT_ACTIONS = new Set<ReviewModerationAction>([
  'created', 'edited', 'deleted', 'approved', 'rejected', 'hidden', 'reported',
  'commerce_cancelled', 'commerce_refunded', 'redacted',
]);
const REPORT_REASONS = new Set<ReviewReportReason>(['spam', 'abuse', 'other']);
const MODERATION_ACTIONS = new Set(['approve', 'reject', 'hide']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asStatus(value: unknown): ReviewStatus | null {
  return typeof value === 'string' && REVIEW_STATUSES.has(value as ReviewStatus) ? value as ReviewStatus : null;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

export function parseListedReview(value: unknown): ListedReview | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || typeof row.order_item_id !== 'string') return null;
  const status = asStatus(row.status);
  if (!status || typeof row.created_at !== 'string' || typeof row.updated_at !== 'string') return null;
  const productId = asNullableString(row.product_id);
  const rating = asNullableNumber(row.rating);
  const body = asNullableString(row.body);
  if (productId === undefined || rating === undefined || body === undefined) return null;
  return {
    id: row.id,
    orderItemId: row.order_item_id,
    productId,
    rating,
    body,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseListedEvent(value: unknown): ListedReviewEvent | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || typeof row.created_at !== 'string') return null;
  if (typeof row.action !== 'string' || !EVENT_ACTIONS.has(row.action as ReviewModerationAction)) return null;
  const reason = row.reason_code === null || (typeof row.reason_code === 'string' && REPORT_REASONS.has(row.reason_code as ReviewReportReason))
    ? (row.reason_code as ReviewReportReason | null)
    : null;
  if (row.reason_code !== null && reason === null && typeof row.reason_code === 'string') return null;
  const fromStatus = row.from_status === null ? null : asStatus(row.from_status) ?? (row.from_status === 'deleted' ? 'deleted' : null);
  const toStatus = row.to_status === null ? null : asStatus(row.to_status) ?? (row.to_status === 'deleted' ? 'deleted' : null);
  if (row.from_status !== null && fromStatus === null) return null;
  if (row.to_status !== null && toStatus === null) return null;
  return {
    id: row.id,
    action: row.action as ReviewModerationAction,
    reasonCode: reason,
    fromStatus,
    toStatus,
    createdAt: row.created_at,
  };
}

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error('review_auth_required');
  }
}

async function requireAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token?.trim() ?? '';
  if (error || !accessToken) throw new Error('review_auth_required');
  return accessToken;
}

/** Matches POST /api/reviews/:reviewId/image-deletion. Does not infer tombstone state from a retry. */
export function classifyReviewDeletionResponse(status: number, body: unknown): 'success' | 'retry' | 'auth' | 'withdrawn' | 'not_owner' | 'failed' {
  const record = body !== null && typeof body === 'object' ? body as Record<string, unknown> : null;
  const ok = record?.ok === true;
  const tombstoned = record?.tombstoned === true;
  const retry = record?.retry === true;
  const reason = typeof record?.error === 'string' ? record.error : '';
  if (status === 200 && ok && tombstoned && record?.retry === false) return 'success';
  if (status === 503 && retry) return 'retry';
  if (status === 401 || reason === 'unauthorized') return 'auth';
  if (status === 403 && reason === 'withdrawn') return 'withdrawn';
  if (status === 403 || reason === 'not_owner') return 'not_owner';
  return 'failed';
}

export async function fetchMyReviews(): Promise<ListedReview[]> {
  if (!reviewReadsEnabled()) return [];
  await requireSession();
  const { data, error } = await supabase.rpc('list_my_reviews');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((row) => {
    const parsed = parseListedReview(row);
    return parsed ? [parsed] : [];
  });
}

export async function createReview(orderItemId: string, rating: number, body: string): Promise<string> {
  if (!reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  await requireSession();
  const { data, error } = await supabase.rpc('create_review', {
    p_order_item_id: orderItemId,
    p_rating: rating,
    p_body: body,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !REVIEW_UUID.test(data)) throw new Error('review_create_failed');
  return data;
}

export type UploadedReviewPhoto = {
  imageId: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
};

/** Matches POST /api/reviews/:reviewId/images. Success is HTTP 201 with ok, imageId, contentType, and byteSize. */
export function classifyReviewImageUpload(status: number, body: unknown): 'success' | 'unauthorized' | 'withdrawn' | 'not_owner' | 'too_large' | 'unsupported' | 'invalid' | 'limit' | 'not_allowed' | 'storage' | 'failed' {
  const record = body !== null && typeof body === 'object' ? body as Record<string, unknown> : null;
  const reason = typeof record?.error === 'string' ? record.error : '';
  const contentType = typeof record?.contentType === 'string' ? record.contentType : '';
  if (
    status === 201
    && record?.ok === true
    && typeof record.imageId === 'string'
    && REVIEW_UUID.test(record.imageId)
    && PHOTO_CONTENT_TYPES.has(contentType)
    && typeof record.byteSize === 'number'
  ) return 'success';
  if (status === 401 || reason === 'unauthorized') return 'unauthorized';
  if (reason === 'withdrawn') return 'withdrawn';
  if (status === 403 || reason === 'not_owner') return 'not_owner';
  if (status === 413 || reason === 'too_large') return 'too_large';
  if (status === 415 || reason === 'unsupported') return 'unsupported';
  if (reason === 'malformed' || reason === 'dimensions') return 'invalid';
  if (reason === 'limit') return 'limit';
  if (reason === 'not_allowed') return 'not_allowed';
  if (reason === 'storage_failed' || reason === 'cleanup_incomplete' || reason === 'codec_unavailable') return 'storage';
  return 'failed';
}

export async function uploadReviewPhoto(reviewId: string, file: File): Promise<UploadedReviewPhoto> {
  if (!reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  if (!REVIEW_UUID.test(reviewId)) throw new Error('photo_not_allowed');
  if (!PHOTO_CONTENT_TYPES.has(file.type) || file.size <= 0 || file.size > REVIEW_IMAGE_MAX_BYTES) {
    throw new Error(file.size > REVIEW_IMAGE_MAX_BYTES ? 'photo_too_large' : 'photo_unsupported');
  }
  const accessToken = await requireAccessToken();
  let response: Response;
  try {
    response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/images`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file,
    });
  } catch {
    throw new Error('photo_failed');
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const outcome = classifyReviewImageUpload(response.status, payload);
  if (outcome === 'success') {
    const record = payload as { imageId: string; contentType: UploadedReviewPhoto['contentType']; byteSize: number };
    return { imageId: record.imageId, contentType: record.contentType, byteSize: record.byteSize };
  }
  if (outcome === 'unauthorized') throw new Error('photo_unauthorized');
  if (outcome === 'withdrawn') throw new Error('photo_withdrawn');
  if (outcome === 'not_owner') throw new Error('photo_not_owner');
  if (outcome === 'too_large') throw new Error('photo_too_large');
  if (outcome === 'unsupported') throw new Error('photo_unsupported');
  if (outcome === 'invalid') throw new Error('photo_invalid');
  if (outcome === 'limit') throw new Error('photo_limit');
  if (outcome === 'not_allowed') throw new Error('photo_not_allowed');
  if (outcome === 'storage') throw new Error('photo_storage');
  throw new Error('photo_failed');
}

export type OwnedReviewPhoto = {
  id: string;
  url: string;
};

/** Matches GET /api/reviews/:reviewId/my-images. Empty images is a successful owned review. */
export function parseOwnedReviewImages(status: number, body: unknown): OwnedReviewPhoto[] | 'unauthorized' | 'withdrawn' | 'not_owner' | 'failed' {
  const record = body !== null && typeof body === 'object' ? body as Record<string, unknown> : null;
  const reason = typeof record?.error === 'string' ? record.error : '';
  if (status === 200 && record?.ok === true && Array.isArray(record.images)) {
    const images: OwnedReviewPhoto[] = [];
    for (const item of record.images) {
      if (!item || typeof item !== 'object') return 'failed';
      const row = item as Record<string, unknown>;
      if (typeof row.id !== 'string' || !REVIEW_UUID.test(row.id)) return 'failed';
      if (typeof row.url !== 'string' || row.url.trim().length === 0) return 'failed';
      images.push({ id: row.id, url: row.url });
    }
    return images.slice(0, 3);
  }
  if (status === 401 || reason === 'unauthorized') return 'unauthorized';
  if (reason === 'withdrawn') return 'withdrawn';
  if (status === 403 || reason === 'not_owner') return 'not_owner';
  return 'failed';
}

export async function fetchOwnedReviewImages(reviewId: string): Promise<OwnedReviewPhoto[]> {
  if (!reviewReadsEnabled() && !reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  if (!REVIEW_UUID.test(reviewId)) throw new Error('photo_not_allowed');
  const accessToken = await requireAccessToken();
  let response: Response;
  try {
    response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/my-images`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('photo_read_failed');
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const parsed = parseOwnedReviewImages(response.status, payload);
  if (Array.isArray(parsed)) return parsed;
  if (parsed === 'unauthorized') throw new Error('photo_unauthorized');
  if (parsed === 'withdrawn') throw new Error('photo_withdrawn');
  if (parsed === 'not_owner') throw new Error('photo_not_owner');
  throw new Error('photo_read_failed');
}

/** Matches DELETE /api/reviews/:reviewId/images/:imageId. HTTP 200 counts only when deleted is true. */
export function classifyOwnedImageDeletion(status: number, body: unknown): 'deleted' | 'retry' | 'unauthorized' | 'withdrawn' | 'not_owner' | 'not_found' | 'failed' {
  const record = body !== null && typeof body === 'object' ? body as Record<string, unknown> : null;
  const reason = typeof record?.error === 'string' ? record.error : '';
  if (status === 200 && record?.ok === true && record.deleted === true) return 'deleted';
  if (status === 503 && record?.retry === true) return 'retry';
  if (status === 401 || reason === 'unauthorized') return 'unauthorized';
  if (reason === 'withdrawn') return 'withdrawn';
  if (status === 403 || reason === 'not_owner') return 'not_owner';
  if (status === 404 || reason === 'not_found') return 'not_found';
  return 'failed';
}

export async function deleteOwnedReviewImage(reviewId: string, imageId: string): Promise<'deleted' | 'retry'> {
  if (!reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  if (!REVIEW_UUID.test(reviewId) || !REVIEW_UUID.test(imageId)) throw new Error('photo_not_found');
  const accessToken = await requireAccessToken();
  let response: Response;
  try {
    response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('photo_delete_failed');
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const outcome = classifyOwnedImageDeletion(response.status, payload);
  if (outcome === 'deleted' || outcome === 'retry') return outcome;
  if (outcome === 'unauthorized') throw new Error('photo_unauthorized');
  if (outcome === 'withdrawn') throw new Error('saved_delete_withdrawn');
  if (outcome === 'not_owner') throw new Error('saved_delete_forbidden');
  if (outcome === 'not_found') throw new Error('photo_not_found');
  throw new Error('photo_delete_failed');
}

export async function editReview(reviewId: string, rating: number, body: string): Promise<void> {
  if (!reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  await requireSession();
  const { error } = await supabase.rpc('edit_review', {
    p_review_id: reviewId,
    p_rating: rating,
    p_body: body,
  });
  if (error) throw error;
}

export async function deleteReview(reviewId: string): Promise<void> {
  if (!reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  const accessToken = await requireAccessToken();
  let response: Response;
  try {
    response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/image-deletion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('review_delete_failed');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const outcome = classifyReviewDeletionResponse(response.status, body);
  if (outcome === 'success') return;
  if (outcome === 'retry') throw new Error('review_delete_retry');
  if (outcome === 'auth') throw new Error('review_auth_required');
  if (outcome === 'withdrawn') throw new Error('withdrawn_subject_frozen');
  if (outcome === 'not_owner') throw new Error('review_not_owner');
  throw new Error('review_delete_failed');
}

export async function fetchAdminReviews(): Promise<ListedReview[]> {
  if (!reviewReadsEnabled()) return [];
  await requireSession();
  const { data, error } = await supabase.rpc('list_admin_reviews');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((row) => {
    const parsed = parseListedReview(row);
    return parsed ? [parsed] : [];
  });
}

export async function moderateReview(reviewId: string, action: 'approve' | 'reject' | 'hide'): Promise<void> {
  if (!reviewWritesEnabled()) throw new Error('review_backend_unavailable');
  if (!MODERATION_ACTIONS.has(action)) throw new Error('review_moderation_invalid');
  await requireSession();
  const { error } = await supabase.rpc('moderate_review', {
    p_review_id: reviewId,
    p_action: action,
  });
  if (error) throw error;
}

export async function fetchAdminReviewEvents(reviewId: string): Promise<ListedReviewEvent[]> {
  if (!reviewReadsEnabled()) return [];
  await requireSession();
  const { data, error } = await supabase.rpc('list_admin_review_events', { p_review_id: reviewId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((row) => {
    const parsed = parseListedEvent(row);
    return parsed ? [parsed] : [];
  });
}
