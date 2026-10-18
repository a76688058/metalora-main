/**
 * Catalog PDP view of the public review RPCs.
 * src/types/reviews.ts is the shared contract. This file only projects
 * list_public_reviews and product_review_public_stats.
 * Those functions return id, rating, body, and created_at, plus
 * approved_count and average_rating. They do not return images,
 * customer identity, or a client-set verified-purchase flag.
 * Photos come only from GET /api/reviews/:reviewId/images.
 */

export type PublicReviewRating = 1 | 2 | 3 | 4 | 5;

export const PUBLIC_REVIEW_PAGE_SIZE = 5;

export type PublicCatalogReview = {
  id: string;
  rating: PublicReviewRating;
  body: string;
  createdAt: string;
};

/** Signed display value from the public image route. Not a storage path. */
export type PublicReviewPhoto = {
  id: string;
  url: string;
};

export type PublicReviewPhotoResult =
  | { status: 'unavailable' }
  | { status: 'empty' }
  | { status: 'failed' }
  | { status: 'ok'; images: PublicReviewPhoto[] };

export type PublicReviewPage = {
  /** Null when the approved count is zero. Never a fabricated score. */
  averageRating: number | null;
  approvedCount: number;
  page: number;
  pageSize: number;
  reviews: PublicCatalogReview[];
};

export type PublicReviewLoadResult =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ok'; page: PublicReviewPage };

export type PublicReviewAdapter = {
  /**
   * Approved, still-eligible catalog reviews for one product.
   * list_public_reviews(p_product_id, p_limit, p_offset) returns
   * id, rating, body, created_at, newest first.
   * product_review_public_stats(p_product_id) returns
   * approved_count and average_rating.
   * "unavailable" means REVIEW_READ_API_READY is false and no RPC ran.
   * An empty approved set is status "ok" with approvedCount 0.
   */
  loadApprovedReviews(input: {
    productId: string;
    page: number;
    pageSize: number;
  }): Promise<PublicReviewLoadResult>;
};
