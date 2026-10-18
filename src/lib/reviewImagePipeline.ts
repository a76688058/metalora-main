import { randomUUID } from "node:crypto";
import {
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_IMAGE_MAX_COUNT,
  REVIEW_IMAGE_SIGNED_URL_SECONDS,
  ReviewImageError,
  assertSafeImageDimensions,
  extensionForContentType,
  isReviewObjectPath,
  isReviewUuid,
  sniffReviewImage,
  type ReviewImageCaller,
  type ReviewImageCodec,
  type ReviewImageContentType,
  type ReviewImageStore,
} from "./reviewImageContract";

export type ReviewImagePorts = {
  prepare(accessToken: string, reviewId: string): Promise<{ imageCount: number }>;
  attach(
    reviewId: string,
    objectPath: string,
    contentType: ReviewImageContentType,
    byteSize: number,
  ): Promise<{ imageId: string }>;
  listOwnedPaths(accessToken: string, reviewId: string): Promise<string[]>;
  listOwnedImages(
    userId: string,
    reviewId: string,
  ): Promise<Array<{ imageId: string; objectPath: string }>>;
  removeOwnedImage(
    userId: string,
    reviewId: string,
    imageId: string,
  ): Promise<{ alreadyRemoved: boolean; objectPath: string }>;
  deleteReview(accessToken: string, reviewId: string): Promise<string[]>;
  listPublicImageIds(reviewId: string): Promise<Array<{ imageId: string }>>;
  publicObjectPath(imageId: string): Promise<string | null>;
  queueCleanup(reviewId: string, objectPaths: string[]): Promise<void>;
  listCleanup(reviewId: string): Promise<string[]>;
  completeCleanup(reviewId: string, objectPaths: string[]): Promise<void>;
  store: ReviewImageStore;
  codec: ReviewImageCodec | null;
};

export type UploadedReviewImage = {
  imageId: string;
  contentType: ReviewImageContentType;
  byteSize: number;
};

export type SignedReviewImage = {
  id: string;
  url: string;
};

function verifiedPaths(reviewId: string, objectPaths: string[]): string[] {
  return objectPaths.filter((objectPath) => isReviewObjectPath(objectPath, reviewId));
}

async function removeVerified(
  store: ReviewImageStore,
  reviewId: string,
  objectPaths: string[],
): Promise<{ removed: string[]; failed: string[] }> {
  const paths = verifiedPaths(reviewId, objectPaths);
  if (paths.length === 0) return { removed: [], failed: [] };
  const result = await store.remove(paths);
  const failed = new Set(result.failed);
  return {
    removed: paths.filter((objectPath) => !failed.has(objectPath)),
    failed: paths.filter((objectPath) => failed.has(objectPath)),
  };
}

export async function uploadReviewImage(
  ports: ReviewImagePorts,
  caller: ReviewImageCaller,
  reviewId: string,
  bytes: Buffer,
): Promise<UploadedReviewImage> {
  if (caller.withdrawn) throw new ReviewImageError("withdrawn", 403);
  if (!isReviewUuid(reviewId)) throw new ReviewImageError("not_allowed", 400);
  if (bytes.length === 0 || bytes.length > REVIEW_IMAGE_MAX_BYTES) {
    throw new ReviewImageError("too_large", 413);
  }
  if (!sniffReviewImage(bytes)) throw new ReviewImageError("unsupported", 415);
  const codec = ports.codec;
  if (!codec) throw new ReviewImageError("codec_unavailable", 503);

  const prepared = await ports.prepare(caller.accessToken, reviewId);
  if (prepared.imageCount >= REVIEW_IMAGE_MAX_COUNT) {
    throw new ReviewImageError("limit", 409);
  }

  let sanitized;
  try {
    sanitized = await codec.reencode(bytes);
  } catch (error) {
    if (error instanceof ReviewImageError) throw error;
    throw new ReviewImageError("malformed", 400);
  }
  assertSafeImageDimensions(sanitized.width, sanitized.height);
  if (sanitized.bytes.length === 0 || sanitized.bytes.length > REVIEW_IMAGE_MAX_BYTES) {
    throw new ReviewImageError("too_large", 413);
  }

  const objectPath = `reviews/${reviewId.toLowerCase()}/${randomUUID()}.${extensionForContentType(sanitized.contentType)}`;
  if (!isReviewObjectPath(objectPath, reviewId)) {
    throw new ReviewImageError("unavailable", 500);
  }

  try {
    await ports.store.upload(objectPath, sanitized.bytes, sanitized.contentType);
  } catch {
    throw new ReviewImageError("storage_failed", 503);
  }

  try {
    const attached = await ports.attach(
      reviewId,
      objectPath,
      sanitized.contentType,
      sanitized.bytes.length,
    );
    return {
      imageId: attached.imageId,
      contentType: sanitized.contentType,
      byteSize: sanitized.bytes.length,
    };
  } catch (error) {
    const removed = await ports.store.remove([objectPath]).catch(() => ({ failed: [objectPath] }));
    if (removed.failed.includes(objectPath)) {
      await ports.queueCleanup(reviewId, [objectPath]).catch(() => undefined);
      throw new ReviewImageError("cleanup_incomplete", 503);
    }
    if (error instanceof ReviewImageError) throw error;
    throw new ReviewImageError("not_allowed", 409);
  }
}

export async function signPublicReviewImages(
  ports: ReviewImagePorts,
  reviewId: string,
): Promise<SignedReviewImage[]> {
  if (!isReviewUuid(reviewId)) throw new ReviewImageError("not_allowed", 400);
  const images = await ports.listPublicImageIds(reviewId);
  const signed: SignedReviewImage[] = [];
  for (const image of images) {
    if (!isReviewUuid(image.imageId)) continue;
    const objectPath = await ports.publicObjectPath(image.imageId);
    if (!objectPath || !isReviewObjectPath(objectPath, reviewId)) continue;
    const url = await ports.store.sign(objectPath, REVIEW_IMAGE_SIGNED_URL_SECONDS);
    signed.push({ id: image.imageId, url });
  }
  return signed;
}

export async function signOwnedReviewImages(
  ports: ReviewImagePorts,
  caller: ReviewImageCaller,
  reviewId: string,
): Promise<SignedReviewImage[]> {
  if (caller.withdrawn) throw new ReviewImageError("withdrawn", 403);
  if (!isReviewUuid(reviewId)) throw new ReviewImageError("not_allowed", 400);
  const rows = await ports.listOwnedImages(caller.userId, reviewId);
  const signed: SignedReviewImage[] = [];
  for (const row of rows) {
    if (!isReviewUuid(row.imageId) || !isReviewObjectPath(row.objectPath, reviewId)) continue;
    let url: string;
    try {
      url = await ports.store.sign(row.objectPath, REVIEW_IMAGE_SIGNED_URL_SECONDS);
    } catch {
      throw new ReviewImageError("storage_failed", 503);
    }
    signed.push({ id: row.imageId, url });
  }
  return signed;
}

export type RemovedReviewImage = {
  alreadyDeleted: boolean;
};

export async function removeOwnedReviewImage(
  ports: ReviewImagePorts,
  caller: ReviewImageCaller,
  reviewId: string,
  imageId: string,
): Promise<RemovedReviewImage> {
  if (caller.withdrawn) throw new ReviewImageError("withdrawn", 403);
  if (!isReviewUuid(reviewId) || !isReviewUuid(imageId)) {
    throw new ReviewImageError("not_found", 404);
  }
  const removed = await ports.removeOwnedImage(caller.userId, reviewId, imageId);
  if (!isReviewObjectPath(removed.objectPath, reviewId)) {
    throw new ReviewImageError("unavailable", 503);
  }
  let failed: string[];
  try {
    failed = (await ports.store.remove([removed.objectPath])).failed;
  } catch {
    failed = [removed.objectPath];
  }
  if (failed.length > 0) {
    await ports.queueCleanup(reviewId, [removed.objectPath]).catch(() => undefined);
    throw new ReviewImageError("cleanup_incomplete", 503);
  }
  await ports.completeCleanup(reviewId, [removed.objectPath]);
  return { alreadyDeleted: removed.alreadyRemoved };
}

export async function deleteReviewAndImages(
  ports: ReviewImagePorts,
  caller: ReviewImageCaller,
  reviewId: string,
): Promise<void> {
  if (caller.withdrawn) throw new ReviewImageError("withdrawn", 403);
  if (!isReviewUuid(reviewId)) throw new ReviewImageError("not_allowed", 400);

  const owned = verifiedPaths(reviewId, await ports.listOwnedPaths(caller.accessToken, reviewId));
  const firstPass = await removeVerified(ports.store, reviewId, owned);
  if (firstPass.failed.length > 0) {
    throw new ReviewImageError("cleanup_incomplete", 503);
  }

  const returned = verifiedPaths(reviewId, await ports.deleteReview(caller.accessToken, reviewId));
  const secondPass = await removeVerified(ports.store, reviewId, returned);
  if (secondPass.failed.length > 0) {
    await ports.queueCleanup(reviewId, secondPass.failed);
    throw new ReviewImageError("cleanup_incomplete", 503);
  }

  const queued = verifiedPaths(reviewId, await ports.listCleanup(reviewId));
  const drained = await removeVerified(ports.store, reviewId, queued);
  if (drained.removed.length > 0) {
    await ports.completeCleanup(reviewId, drained.removed);
  }
  if (drained.failed.length > 0) {
    throw new ReviewImageError("cleanup_incomplete", 503);
  }
}
