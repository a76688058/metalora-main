import { REVIEW_READ_API_READY } from '../../../types/reviews';
import { PUBLIC_REVIEW_PAGE_SIZE } from './publicReviewTypes';
import type { PublicReviewPhoto, PublicReviewPhotoResult } from './publicReviewTypes';

/** Matches REVIEW_IMAGE_SIGNED_URL_SECONDS. The image JSON does not include an expiry field. */
export const PUBLIC_REVIEW_PHOTO_TTL_MS = 300_000;
export const PUBLIC_REVIEW_PHOTO_LIMIT = 3;
const PHOTO_URL_MAX_LENGTH = 2048;
const REVIEW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDisplayUrl(value: string): boolean {
  if (value.length === 0 || value.length > PHOTO_URL_MAX_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * GET /api/reviews/:reviewId/images
 * 200 { ok: true, images: [{ id, url }] }
 * 404 { ok: false, error: "not_allowed" } when the server has no public images
 * Other failures { ok: false, error: reason } without image payloads
 */
export function parsePublicReviewPhotoResponse(status: number, body: unknown): PublicReviewPhotoResult {
  if (status === 404) return { status: 'empty' };
  if (status !== 200) return { status: 'failed' };
  if (!isRecord(body) || body.ok !== true || !Array.isArray(body.images)) return { status: 'failed' };
  const images: PublicReviewPhoto[] = [];
  for (const item of body.images) {
    if (!isRecord(item)) return { status: 'failed' };
    if (typeof item.id !== 'string' || !REVIEW_ID_PATTERN.test(item.id)) return { status: 'failed' };
    if (typeof item.url !== 'string' || !isDisplayUrl(item.url)) return { status: 'failed' };
    images.push({ id: item.id, url: item.url });
  }
  if (images.length === 0) return { status: 'empty' };
  return { status: 'ok', images: images.slice(0, PUBLIC_REVIEW_PHOTO_LIMIT) };
}

export function selectReviewIdsForPhotos(reviews: readonly { id: string }[]): string[] {
  return reviews.slice(0, PUBLIC_REVIEW_PAGE_SIZE).map((review) => review.id);
}

export function photoResultIsCurrent(input: {
  token: number;
  currentToken: number;
  productId: string;
  currentProductId: string;
  page: number;
  currentPage: number;
}): boolean {
  return input.token === input.currentToken
    && input.productId === input.currentProductId
    && input.page === input.currentPage;
}

export async function loadPublicReviewPhotos(
  reviewId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicReviewPhotoResult> {
  if (!REVIEW_READ_API_READY) return { status: 'unavailable' };
  if (!REVIEW_ID_PATTERN.test(reviewId)) return { status: 'failed' };
  try {
    const response = await fetchImpl(`/api/reviews/${encodeURIComponent(reviewId)}/images`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    return parsePublicReviewPhotoResponse(response.status, body);
  } catch {
    return { status: 'failed' };
  }
}
