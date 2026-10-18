import { supabasePublic } from '../../../lib/supabase';
import { REVIEW_READ_API_READY } from '../../../types/reviews';
import {
  PUBLIC_REVIEW_PAGE_SIZE,
  type PublicCatalogReview,
  type PublicReviewAdapter,
  type PublicReviewLoadResult,
  type PublicReviewRating,
} from './publicReviewTypes';

export { PUBLIC_REVIEW_PAGE_SIZE };

const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function parseAverage(value: unknown, count: number): number | null | undefined {
  if (count === 0) return value == null ? null : undefined;
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return undefined;
  return parsed;
}

function parseRating(value: unknown): PublicReviewRating | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value;
  return null;
}

function parseReviewRow(value: unknown): PublicCatalogReview | null {
  if (!isRecord(value)) return null;
  const rating = parseRating(value.rating);
  if (!rating) return null;
  if (typeof value.id !== 'string' || !PRODUCT_ID_PATTERN.test(value.id)) return null;
  if (typeof value.body !== 'string') return null;
  if (typeof value.created_at !== 'string' || Number.isNaN(new Date(value.created_at).getTime())) return null;
  return {
    id: value.id,
    rating,
    body: value.body,
    createdAt: value.created_at,
  };
}

function parseStats(value: unknown): { approvedCount: number; averageRating: number | null } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) return null;
  const approvedCount = parseCount(row.approved_count);
  if (approvedCount === null) return null;
  const averageRating = parseAverage(row.average_rating, approvedCount);
  if (averageRating === undefined) return null;
  return { approvedCount, averageRating };
}

function parseReviewList(value: unknown): PublicCatalogReview[] | null {
  if (!Array.isArray(value)) return null;
  const reviews: PublicCatalogReview[] = [];
  for (const row of value) {
    const review = parseReviewRow(row);
    if (!review) return null;
    reviews.push(review);
  }
  return reviews;
}

export const publicReviewAdapter: PublicReviewAdapter = {
  async loadApprovedReviews({ productId, page, pageSize }): Promise<PublicReviewLoadResult> {
    if (!REVIEW_READ_API_READY) return { status: 'unavailable' };
    if (
      pageSize !== PUBLIC_REVIEW_PAGE_SIZE
      || !Number.isInteger(page)
      || page < 1
      || !PRODUCT_ID_PATTERN.test(productId)
    ) {
      return { status: 'error' };
    }

    const offset = (page - 1) * PUBLIC_REVIEW_PAGE_SIZE;
    try {
      const [listResult, statsResult] = await Promise.all([
        supabasePublic.rpc('list_public_reviews', {
          p_product_id: productId,
          p_limit: PUBLIC_REVIEW_PAGE_SIZE,
          p_offset: offset,
        }),
        supabasePublic.rpc('product_review_public_stats', {
          p_product_id: productId,
        }),
      ]);
      if (listResult.error || statsResult.error) return { status: 'error' };
      const reviews = parseReviewList(listResult.data);
      const stats = parseStats(statsResult.data);
      if (!reviews || !stats) return { status: 'error' };
      if (reviews.length > stats.approvedCount) return { status: 'error' };
      return {
        status: 'ok',
        page: {
          averageRating: stats.averageRating,
          approvedCount: stats.approvedCount,
          page,
          pageSize: PUBLIC_REVIEW_PAGE_SIZE,
          reviews,
        },
      };
    } catch {
      return { status: 'error' };
    }
  },
};
