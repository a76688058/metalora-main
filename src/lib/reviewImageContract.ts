/**
 * NEW27 server-only review image contract.
 * Filenames, extensions, client MIME types, and client paths are not evidence.
 * Re-encoding is a separate codec. This module does not decode image bytes.
 */

export const REVIEW_IMAGE_BUCKET = "review-images";
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_IMAGE_MAX_COUNT = 3;
export const REVIEW_IMAGE_MAX_EDGE = 8000;
export const REVIEW_IMAGE_MAX_PIXELS = 16_000_000;
export const REVIEW_IMAGE_SIGNED_URL_SECONDS = 300;

export const REVIEW_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReviewImageContentType = (typeof REVIEW_IMAGE_CONTENT_TYPES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewImageReason =
  | "unauthorized"
  | "withdrawn"
  | "not_owner"
  | "not_found"
  | "too_large"
  | "unsupported"
  | "malformed"
  | "dimensions"
  | "limit"
  | "not_allowed"
  | "codec_unavailable"
  | "storage_failed"
  | "cleanup_incomplete"
  | "unavailable";

export class ReviewImageError extends Error {
  constructor(
    readonly reason: ReviewImageReason,
    readonly status: number,
  ) {
    super(reason);
    this.name = "ReviewImageError";
  }
}

export type SanitizedReviewImage = {
  bytes: Buffer;
  contentType: ReviewImageContentType;
  width: number;
  height: number;
};

/**
 * Decode, re-encode, and drop EXIF/embedded metadata.
 * The server codec is the sharp adapter in reviewImageCodec.ts.
 */
export type ReviewImageCodec = {
  reencode(input: Buffer): Promise<SanitizedReviewImage>;
};

export type ReviewImageStore = {
  upload(objectPath: string, bytes: Buffer, contentType: ReviewImageContentType): Promise<void>;
  remove(objectPaths: string[]): Promise<{ failed: string[] }>;
  sign(objectPath: string, expiresInSeconds: number): Promise<string>;
};

export type ReviewImageCaller = {
  userId: string;
  accessToken: string;
  withdrawn: boolean;
};

export function isReviewUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function extensionForContentType(contentType: ReviewImageContentType): "jpg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export function isReviewObjectPath(objectPath: string, reviewId: string): boolean {
  if (!isReviewUuid(reviewId)) return false;
  const match = new RegExp(
    `^reviews/${reviewId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$`,
    "i",
  ).test(objectPath);
  return match && !objectPath.includes("..") && !objectPath.includes("\\");
}

/** Classify by file signature. Client Content-Type is ignored. */
export function sniffReviewImage(bytes: Buffer): ReviewImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function assertSafeImageDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > REVIEW_IMAGE_MAX_EDGE ||
    height > REVIEW_IMAGE_MAX_EDGE ||
    width * height > REVIEW_IMAGE_MAX_PIXELS
  ) {
    throw new ReviewImageError("dimensions", 400);
  }
}
