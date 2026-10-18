/**
 * NEW27 review UI contract. A0 owns this file.
 * A2 and A3 import it and do not edit it.
 * Fields match the approved review architecture. No phone, address, or client verified flag.
 */

export type ReviewModerationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'hidden'
  | 'deleted';

export type ReviewReportReason = 'spam' | 'abuse' | 'other';

export type ReviewImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export type ReviewImage = {
  id: string;
  objectPath: string;
  contentType: ReviewImageContentType;
  byteSize: number;
  /** Transient display value. Never persist a signed URL. */
  previewUrl: string | null;
};

export type Review = {
  id: string;
  orderItemId: string;
  productId: string | null;
  rating: number | null;
  body: string | null;
  status: ReviewModerationStatus;
  createdAt: string;
  updatedAt: string;
  images: ReviewImage[];
  /** Server-derived. Clients cannot set this. Preview rows must be false. */
  verifiedPurchase: boolean;
};

export type ReviewEligibilityReason =
  | 'eligible'
  | 'not_completed'
  | 'missing_commerce_state'
  | 'already_reviewed'
  | 'unavailable';

export type ReviewEligibility = {
  orderItemId: string;
  orderId: string;
  productId: string | null;
  productTitle: string;
  eligible: boolean;
  reason: ReviewEligibilityReason;
};

export type ReviewSummary = {
  productId: string;
  approvedCount: number;
  averageRating: number | null;
};

export type ReviewModerationAction =
  | 'created'
  | 'edited'
  | 'deleted'
  | 'approved'
  | 'rejected'
  | 'hidden'
  | 'reported'
  | 'commerce_cancelled'
  | 'commerce_refunded'
  | 'redacted';

export type ReviewModerationEvent = {
  id: string;
  reviewId: string;
  action: ReviewModerationAction;
  reasonCode: ReviewReportReason | null;
  fromStatus: ReviewModerationStatus | null;
  toStatus: ReviewModerationStatus | null;
  createdAt: string;
  actorLabel: string | null;
};

export type ReviewReport = {
  id: string;
  reviewId: string;
  reasonCode: ReviewReportReason;
  createdAt: string;
};

/** Writes stay closed until A6 functions are validated and a later ticket opens them. */
export const REVIEW_WRITE_API_READY = false;

/** Public and account reads stay closed until the validated RPCs exist. */
export const REVIEW_READ_API_READY = false;

/** Dev-only preview. Production builds never enable this. */
export function reviewUiPreviewEnabled(): boolean {
  return import.meta.env.DEV === true && import.meta.env.VITE_REVIEW_UI_PREVIEW === '1';
}

export const REVIEW_BODY_MAX = 4000;
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_IMAGE_MAX_COUNT = 3;
export const REVIEW_PAGE_SIZE = 20;
