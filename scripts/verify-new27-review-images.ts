/**
 * NEW27 review-image pipeline. Local mocks only. Does not contact Supabase.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import express from "express";
import {
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_IMAGE_SIGNED_URL_SECONDS,
  ReviewImageError,
  isReviewObjectPath,
  sniffReviewImage,
  type ReviewImageCodec,
  type ReviewImageContentType,
  type ReviewImageStore,
} from "../src/lib/reviewImageContract";
import {
  deleteReviewAndImages,
  removeOwnedReviewImage,
  signOwnedReviewImages,
  signPublicReviewImages,
  uploadReviewImage,
  type ReviewImagePorts,
} from "../src/lib/reviewImagePipeline";
import { createSharpReviewImageCodec } from "../src/lib/reviewImageCodec";
import { registerReviewImageRoutes } from "../src/lib/reviewImageRoutes";
import sharp from "sharp";

const reviewId = "018c27c0-0000-4000-8000-0000000000aa";
const imageId = "018c27c0-0000-4000-8000-0000000000bb";
const caller = {
  userId: "018c27c0-0000-4000-8000-0000000000c1",
  accessToken: "synthetic-token",
  withdrawn: false,
};

function jpegWithExif(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    Buffer.from("EXIF synthetic-gps END", "latin1"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function webpBytes(): Buffer {
  const bytes = Buffer.alloc(16);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  return bytes;
}

type StoreCall = { op: string; path?: string; bytes?: Buffer; expires?: number; paths?: string[] };

function memoryStore(failRemove: string[] = []): { store: ReviewImageStore; calls: StoreCall[] } {
  const calls: StoreCall[] = [];
  const store: ReviewImageStore = {
    async upload(objectPath, bytes, contentType) {
      calls.push({ op: "upload", path: objectPath, bytes: Buffer.from(bytes) });
      assert.equal(contentType, "image/jpeg");
    },
    async remove(objectPaths) {
      calls.push({ op: "remove", paths: objectPaths });
      return { failed: objectPaths.filter((objectPath) => failRemove.includes(objectPath)) };
    },
    async sign(objectPath, expiresInSeconds) {
      calls.push({ op: "sign", path: objectPath, expires: expiresInSeconds });
      return `https://signed.invalid/${expiresInSeconds}`;
    },
  };
  return { store, calls };
}

function strippingCodec(overrides?: Partial<Awaited<ReturnType<ReviewImageCodec["reencode"]>>>): ReviewImageCodec {
  return {
    async reencode(input) {
      const text = input.toString("latin1");
      if (text.includes("NOT_AN_IMAGE")) throw new Error("decode failed");
      const stripped = Buffer.from(text.replace(/EXIF[\s\S]*?END/g, "CLEAN"), "latin1");
      return {
        bytes: stripped,
        contentType: "image/jpeg" as ReviewImageContentType,
        width: 640,
        height: 480,
        ...overrides,
      };
    },
  };
}

function ports(partial: Partial<ReviewImagePorts> & Pick<ReviewImagePorts, "store">): ReviewImagePorts {
  return {
    codec: strippingCodec(),
    prepare: async () => ({ imageCount: 0 }),
    attach: async () => ({ imageId }),
    listOwnedPaths: async () => [],
    listOwnedImages: async () => [],
    removeOwnedImage: async () => {
      throw new Error("removeOwnedImage was not stubbed");
    },
    deleteReview: async () => [],
    listPublicImageIds: async () => [],
    publicObjectPath: async () => null,
    queueCleanup: async () => undefined,
    listCleanup: async () => [],
    completeCleanup: async () => undefined,
    ...partial,
  };
}

async function expectReason(reason: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    assert.fail(`expected ${reason}`);
  } catch (error) {
    assert.ok(error instanceof ReviewImageError, String(error));
    assert.equal(error.reason, reason);
  }
}

async function solid(width: number, height: number, format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 30, b: 40 } },
  });
  if (format === "jpeg") return image.jpeg().toBuffer();
  if (format === "png") return image.png().toBuffer();
  return image.webp().toBuffer();
}

async function gpsJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 20, height: 10, channels: 3, background: { r: 180, g: 30, b: 40 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", Model: "X100" },
      IFD2: {
        GPSLatitudeRef: "N",
        GPSLatitude: "37/1 0/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "127/1 0/1 0/1",
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

async function verifyRealSharpCodec(): Promise<void> {
  const codec = createSharpReviewImageCodec();
  for (const format of ["jpeg", "png", "webp"] as const) {
    const input = await solid(24, 16, format);
    const output = await codec.reencode(input);
    const expected = format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/webp";
    assert.equal(output.contentType, expected);
    assert.equal(sniffReviewImage(output.bytes), expected);
    const again = await sharp(output.bytes).metadata();
    assert.equal(again.format, format);
    assert.equal(again.exif, undefined);
    assert.equal(again.xmp, undefined);
    assert.equal(again.iptc, undefined);
    assert.equal(again.width, 24);
    assert.equal(again.height, 16);
  }

  const input = await gpsJpeg();
  const inputMeta = await sharp(input).metadata();
  assert.equal(inputMeta.orientation, 6);
  assert.ok(inputMeta.exif);
  assert.equal(inputMeta.exif.includes(Buffer.from("TestCam")), true);
  assert.equal(inputMeta.exif.toString("latin1").includes("N"), true);
  assert.equal(inputMeta.exif.toString("latin1").includes("E"), true);
  const sanitized = await codec.reencode(input);
  assert.equal(sanitized.width, 10);
  assert.equal(sanitized.height, 20);
  assert.equal(sanitized.bytes.includes(Buffer.from("TestCam")), false);
  assert.equal(sanitized.bytes.includes(Buffer.from("X100")), false);
  const outputMeta = await sharp(sanitized.bytes).metadata();
  assert.equal(outputMeta.exif, undefined);
  assert.equal(outputMeta.orientation, undefined);
  assert.equal(outputMeta.xmp, undefined);
  assert.equal(outputMeta.iptc, undefined);
  const pixel = await sharp(sanitized.bytes).raw().toBuffer();
  assert.ok(pixel[0] > 150 && pixel[1] < 80 && pixel[2] < 80);

  const used = memoryStore();
  await uploadReviewImage(
    ports({ store: used.store, codec }),
    caller,
    reviewId,
    input,
  );
  const stored = used.calls.find((call) => call.op === "upload");
  assert.ok(stored?.bytes);
  assert.equal(stored.bytes.equals(input), false);
  assert.equal(stored.bytes.includes(Buffer.from("TestCam")), false);
  assert.match(stored.path ?? "", /\.jpg$/);

  await expectReason("unsupported", () => codec.reencode(Buffer.from("GIF89a")));
  await expectReason("unsupported", () => codec.reencode(Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"4\"></svg>")));
  const corruptJpeg = await solid(16, 16, "jpeg");
  await expectReason("malformed", () => codec.reencode(corruptJpeg.subarray(0, Math.floor(corruptJpeg.length / 2))));
  await expectReason("malformed", () => codec.reencode(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("not-a-jpeg")])));
  await expectReason("malformed", () => codec.reencode(Buffer.concat([pngBytes(), Buffer.from("broken")])));
  await expectReason("malformed", () => codec.reencode(webpBytes()));
  await expectReason("malformed", () => codec.reencode(Buffer.alloc(0)));
  const wide = await solid(8001, 1, "jpeg");
  const dense = await solid(4001, 4000, "jpeg");
  await expectReason("dimensions", () => codec.reencode(wide));
  await expectReason("dimensions", () => codec.reencode(dense));

  const animated = Buffer.alloc(20);
  animated.write("RIFF", 0, "ascii");
  animated.writeUInt32LE(12, 4);
  animated.write("WEBP", 8, "ascii");
  animated.write("VP8X", 12, "ascii");
  animated.writeUInt32LE(10, 16);
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x02;
  await expectReason("unsupported", () => codec.reencode(Buffer.concat([animated.subarray(0, 20), vp8x])));

  const apng = Buffer.concat([
    pngBytes().subarray(0, 8),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("acTL"),
    Buffer.alloc(4),
  ]);
  await expectReason("unsupported", () => codec.reencode(apng));
}

async function verifyIndividualRemoval(): Promise<void> {
  const otherReviewId = "018c27c0-0000-4000-8000-0000000000ab";
  const keepId = "018c27c0-0000-4000-8000-0000000000b1";
  const dropId = "018c27c0-0000-4000-8000-0000000000b2";
  const foreignId = "018c27c0-0000-4000-8000-0000000000b3";
  const keepPath = `reviews/${reviewId}/${keepId}.jpg`;
  const dropPath = `reviews/${reviewId}/${dropId}.jpg`;
  const foreignPath = `reviews/${otherReviewId}/${foreignId}.jpg`;
  type StoredImage = { id: string; reviewId: string; path: string };
  const images: StoredImage[] = [
    { id: keepId, reviewId, path: keepPath },
    { id: dropId, reviewId, path: dropPath },
    { id: foreignId, reviewId: otherReviewId, path: foreignPath },
  ];
  const removals: StoredImage[] = [];
  const jobs = new Map<string, Set<string>>();
  const review = { status: "approved", rating: 5, body: "kept text", entitlementConsumed: true };
  let deleteReviewCalls = 0;
  const storeFail = new Set<string>();
  const completed: Array<{ reviewId: string; paths: string[] }> = [];

  const removalPorts = ports({
    store: {
      async upload(objectPath, bytes, contentType) {
        assert.equal(contentType, "image/jpeg");
        assert.equal(bytes.includes(Buffer.from("EXIF")), false);
        assert.equal(objectPath.startsWith(`reviews/${reviewId}/`), true);
      },
      async remove(objectPaths) {
        return { failed: objectPaths.filter((objectPath) => storeFail.has(objectPath)) };
      },
      async sign(objectPath, expiresInSeconds) {
        assert.equal(expiresInSeconds, 300);
        return `https://signed.invalid/${objectPath.split("/").at(-1)}`;
      },
    },
    deleteReview: async () => {
      deleteReviewCalls += 1;
      return [];
    },
    listPublicImageIds: async (requestedReviewId) => (
      review.status === "approved"
        ? images.filter((image) => image.reviewId === requestedReviewId).map((image) => ({ imageId: image.id }))
        : []
    ),
    publicObjectPath: async (requestedImageId) => (
      images.find((image) => image.id === requestedImageId)?.path ?? null
    ),
    listOwnedImages: async (userId, requestedReviewId) => {
      if (userId !== caller.userId) throw new ReviewImageError("not_owner", 403);
      return images
        .filter((image) => image.reviewId === requestedReviewId)
        .map((image) => ({ imageId: image.id, objectPath: image.path }));
    },
    removeOwnedImage: async (userId, requestedReviewId, requestedImageId) => {
      if (userId !== caller.userId) throw new ReviewImageError("not_owner", 403);
      const current = images.find((image) => image.id === requestedImageId);
      if (current && current.reviewId !== requestedReviewId) throw new ReviewImageError("not_found", 404);
      if (current) {
        images.splice(images.indexOf(current), 1);
        removals.push(current);
        return { alreadyRemoved: false, objectPath: current.path };
      }
      const prior = removals.find((image) => image.id === requestedImageId);
      if (!prior || prior.reviewId !== requestedReviewId) throw new ReviewImageError("not_found", 404);
      return { alreadyRemoved: true, objectPath: prior.path };
    },
    queueCleanup: async (requestedReviewId, objectPaths) => {
      const queued = jobs.get(requestedReviewId) ?? new Set<string>();
      for (const objectPath of objectPaths) {
        assert.equal(objectPath.startsWith(`reviews/${requestedReviewId}/`), true);
        queued.add(objectPath);
      }
      jobs.set(requestedReviewId, queued);
    },
    completeCleanup: async (requestedReviewId, objectPaths) => {
      completed.push({ reviewId: requestedReviewId, paths: [...objectPaths] });
      const queued = jobs.get(requestedReviewId);
      for (const objectPath of objectPaths) {
        assert.equal(objectPath.startsWith(`reviews/${requestedReviewId}/`), true);
        queued?.delete(objectPath);
      }
    },
    prepare: async (accessToken, requestedReviewId) => {
      assert.equal(accessToken, caller.accessToken);
      if (review.status !== "pending") throw new ReviewImageError("not_allowed", 409);
      const imageCount = images.filter((image) => image.reviewId === requestedReviewId).length;
      if (imageCount >= 3) throw new ReviewImageError("limit", 409);
      return { imageCount };
    },
    attach: async (requestedReviewId, objectPath) => {
      assert.equal(review.status, "pending");
      const imageIdFromPath = objectPath.split("/")[2]?.replace(/\.[^.]+$/, "") ?? "";
      images.push({ id: imageIdFromPath, reviewId: requestedReviewId, path: objectPath });
      return { imageId: imageIdFromPath };
    },
  });

  const removed = await removeOwnedReviewImage(removalPorts, caller, reviewId, dropId);
  assert.equal(removed.alreadyDeleted, false);
  assert.equal(review.status, "approved");
  assert.equal(review.rating, 5);
  assert.equal(review.body, "kept text");
  assert.equal(review.entitlementConsumed, true);
  assert.equal(deleteReviewCalls, 0);
  assert.equal(images.some((image) => image.id === keepId), true);
  assert.equal(images.some((image) => image.id === dropId), false);
  assert.equal(images.some((image) => image.id === foreignId), true);

  const publicImages = await signPublicReviewImages(removalPorts, reviewId);
  assert.deepEqual(publicImages.map((image) => image.id), [keepId]);
  const ownedImages = await signOwnedReviewImages(removalPorts, caller, reviewId);
  assert.deepEqual(ownedImages.map((image) => image.id), [keepId]);

  await expectReason("not_owner", () => removeOwnedReviewImage(
    removalPorts,
    { ...caller, userId: "018c27c0-0000-4000-8000-0000000000c2" },
    reviewId,
    keepId,
  ));
  await expectReason("withdrawn", () => removeOwnedReviewImage(
    removalPorts,
    { ...caller, withdrawn: true },
    reviewId,
    keepId,
  ));
  assert.equal(images.some((image) => image.id === keepId), true);
  await expectReason("not_found", () => removeOwnedReviewImage(removalPorts, caller, reviewId, foreignId));
  assert.equal(images.some((image) => image.id === foreignId), true);
  await expectReason("not_found", () => removeOwnedReviewImage(
    removalPorts,
    caller,
    reviewId,
    "018c27c0-0000-4000-8000-000000000099",
  ));

  const repeated = await removeOwnedReviewImage(removalPorts, caller, reviewId, dropId);
  assert.equal(repeated.alreadyDeleted, true);
  assert.equal(review.status, "approved");
  assert.equal(review.rating, 5);
  assert.equal(deleteReviewCalls, 0);

  storeFail.add(keepPath);
  await expectReason("cleanup_incomplete", () => removeOwnedReviewImage(removalPorts, caller, reviewId, keepId));
  assert.equal(images.some((image) => image.id === keepId), false);
  assert.equal(jobs.get(reviewId)?.has(keepPath), true);
  assert.deepEqual(await signPublicReviewImages(removalPorts, reviewId), []);
  assert.deepEqual(await signOwnedReviewImages(removalPorts, caller, reviewId), []);
  jobs.set(otherReviewId, new Set([foreignPath]));
  storeFail.delete(keepPath);
  const reconciled = await removeOwnedReviewImage(removalPorts, caller, reviewId, keepId);
  assert.equal(reconciled.alreadyDeleted, true);
  assert.equal(jobs.get(otherReviewId)?.has(foreignPath), true);
  assert.equal(images.some((image) => image.id === foreignId), true);
  assert.deepEqual(completed.at(-1), { reviewId, paths: [keepPath] });
  assert.equal(review.status, "approved");

  review.status = "pending";
  const fillers = [
    "018c27c0-0000-4000-8000-0000000000b4",
    "018c27c0-0000-4000-8000-0000000000b5",
    "018c27c0-0000-4000-8000-0000000000b6",
  ];
  for (const filler of fillers) {
    images.push({ id: filler, reviewId, path: `reviews/${reviewId}/${filler}.jpg` });
  }
  await expectReason("limit", () => uploadReviewImage(removalPorts, caller, reviewId, jpegWithExif()));
  assert.equal(images.filter((image) => image.reviewId === reviewId).length, 3);
  await removeOwnedReviewImage(removalPorts, caller, reviewId, fillers[0]);
  assert.equal(images.filter((image) => image.reviewId === reviewId).length, 2);
  await uploadReviewImage(removalPorts, caller, reviewId, jpegWithExif());
  assert.equal(images.filter((image) => image.reviewId === reviewId).length, 3);
  assert.equal(review.entitlementConsumed, true);
  assert.equal(deleteReviewCalls, 0);

  review.status = "approved";
  const approvedCount = images.filter((image) => image.reviewId === reviewId).length;
  await expectReason("not_allowed", () => uploadReviewImage(removalPorts, caller, reviewId, jpegWithExif()));
  assert.equal(images.filter((image) => image.reviewId === reviewId).length, approvedCount);
  const approvedImage = images.find((image) => image.reviewId === reviewId);
  assert.ok(approvedImage);
  await removeOwnedReviewImage(removalPorts, caller, reviewId, approvedImage.id);
  assert.equal(review.status, "approved");
  assert.equal(review.rating, 5);
  assert.equal(review.body, "kept text");
  assert.equal(deleteReviewCalls, 0);

  await new Promise<void>((resolve, reject) => {
    const app = express();
    let wholeReviewDeletes = 0;
    const httpImages = new Map<string, string>([[dropId, dropPath]]);
    const httpRemovals = new Map<string, string>();
    let failStorage = false;
    registerReviewImageRoutes(app, {
      supabaseAdmin: null,
      supabasePublic: null,
      supabaseUrl: "http://127.0.0.1",
      supabaseAnonKey: undefined,
      authenticate: async (authorization) => {
        if (authorization === "Bearer owner") return caller;
        if (authorization === "Bearer other") {
          return { ...caller, userId: "018c27c0-0000-4000-8000-0000000000c2" };
        }
        if (authorization === "Bearer withdrawn") return { ...caller, withdrawn: true };
        return null;
      },
      ports: ports({
        store: {
          async upload() {
            throw new Error("unused");
          },
          async remove(objectPaths) {
            return { failed: failStorage ? objectPaths : [] };
          },
          async sign() {
            return "https://signed.invalid/300";
          },
        },
        deleteReview: async () => {
          wholeReviewDeletes += 1;
          return [];
        },
        removeOwnedImage: async (userId, requestedReviewId, requestedImageId) => {
          if (userId !== caller.userId) throw new ReviewImageError("not_owner", 403);
          if (requestedReviewId !== reviewId || requestedImageId === foreignId) {
            throw new ReviewImageError("not_found", 404);
          }
          const current = httpImages.get(requestedImageId);
          if (current) {
            httpImages.delete(requestedImageId);
            httpRemovals.set(requestedImageId, current);
            return { alreadyRemoved: false, objectPath: current };
          }
          const prior = httpRemovals.get(requestedImageId);
          if (!prior) throw new ReviewImageError("not_found", 404);
          return { alreadyRemoved: true, objectPath: prior };
        },
        queueCleanup: async () => undefined,
        completeCleanup: async () => undefined,
      }),
    });
    const server = createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const base = `http://127.0.0.1:${address.port}/api/reviews/${reviewId}/images/${dropId}`;
      try {
        assert.equal((await fetch(base, { method: "DELETE" })).status, 401);
        assert.equal((await fetch(base, { method: "DELETE", headers: { authorization: "Bearer other" } })).status, 403);
        assert.equal((await fetch(base, { method: "DELETE", headers: { authorization: "Bearer withdrawn" } })).status, 403);
        const deleted = await fetch(base, { method: "DELETE", headers: { authorization: "Bearer owner" } });
        assert.equal(deleted.status, 200);
        assert.equal(deleted.headers.get("cache-control"), "no-store");
        assert.equal(deleted.headers.get("referrer-policy"), "no-referrer");
        const deletedBody = await deleted.json() as { ok: boolean; deleted: boolean; objectPath?: string };
        assert.deepEqual(deletedBody, { ok: true, deleted: true });
        const repeatedDelete = await fetch(base, { method: "DELETE", headers: { authorization: "Bearer owner" } });
        assert.equal(repeatedDelete.status, 200);
        assert.deepEqual(await repeatedDelete.json(), { ok: true, deleted: true, alreadyDeleted: true });
        const missing = await fetch(
          `http://127.0.0.1:${address.port}/api/reviews/${reviewId}/images/${foreignId}`,
          { method: "DELETE", headers: { authorization: "Bearer owner" } },
        );
        assert.equal(missing.status, 404);
        assert.equal((await missing.json() as { error: string }).error, "not_found");
        failStorage = true;
        httpImages.set(keepId, keepPath);
        const cleanup = await fetch(
          `http://127.0.0.1:${address.port}/api/reviews/${reviewId}/images/${keepId}`,
          { method: "DELETE", headers: { authorization: "Bearer owner" } },
        );
        assert.equal(cleanup.status, 503);
        assert.deepEqual(await cleanup.json(), { ok: false, error: "cleanup_incomplete", retry: true });
        assert.equal(httpImages.has(keepId), false);
        assert.equal(wholeReviewDeletes, 0);
        server.close();
        resolve();
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });
}

async function main(): Promise<void> {
  assert.equal(sniffReviewImage(jpegWithExif()), "image/jpeg");
  assert.equal(sniffReviewImage(pngBytes()), "image/png");
  assert.equal(sniffReviewImage(webpBytes()), "image/webp");
  assert.equal(sniffReviewImage(Buffer.from("GIF89a")), null);
  assert.equal(sniffReviewImage(Buffer.from("not an image")), null);
  assert.equal(sniffReviewImage(Buffer.from([0xff, 0xd8])), null);

  const traversal = `reviews/${reviewId}/../../secrets.png`;
  assert.equal(isReviewObjectPath(traversal, reviewId), false);
  assert.equal(isReviewObjectPath(`reviews/${reviewId}/not-a-uuid.jpg`, reviewId), false);

  {
    const used = memoryStore();
    await expectReason("too_large", () => uploadReviewImage(
      ports({ store: used.store }),
      caller,
      reviewId,
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(REVIEW_IMAGE_MAX_BYTES)]),
    ));
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    let prepares = 0;
    await expectReason("limit", () => uploadReviewImage(
      ports({
        store: used.store,
        prepare: async () => {
          prepares += 1;
          return { imageCount: 3 };
        },
      }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(prepares, 1);
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    await expectReason("malformed", () => uploadReviewImage(
      ports({ store: used.store, codec: strippingCodec() }),
      caller,
      reviewId,
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("NOT_AN_IMAGE")]),
    ));
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    await uploadReviewImage(ports({ store: used.store }), caller, reviewId, jpegWithExif());
    const upload = used.calls.find((call) => call.op === "upload");
    assert.ok(upload?.bytes);
    assert.equal(upload.bytes.includes(Buffer.from("EXIF")), false);
    assert.equal(upload.bytes.includes(Buffer.from("synthetic-gps")), false);
    assert.equal(upload.bytes.includes(Buffer.from("CLEAN")), true);
    assert.match(upload.path ?? "", new RegExp(`^reviews/${reviewId}/[0-9a-f-]{36}\\.jpg$`));
    assert.equal(upload.path?.includes(".."), false);
  }

  {
    const used = memoryStore();
    await expectReason("dimensions", () => uploadReviewImage(
      ports({ store: used.store, codec: strippingCodec({ width: 8001, height: 10 }) }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    await expectReason("dimensions", () => uploadReviewImage(
      ports({ store: used.store, codec: strippingCodec({ width: 5000, height: 5000 }) }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
  }

  {
    const used = memoryStore();
    await expectReason("not_owner", () => uploadReviewImage(
      ports({
        store: used.store,
        prepare: async () => {
          throw new ReviewImageError("not_owner", 403);
        },
      }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    await expectReason("withdrawn", () => uploadReviewImage(
      ports({ store: used.store }),
      { ...caller, withdrawn: true },
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    const throwing: ReviewImageStore = {
      ...used.store,
      async upload() {
        throw new Error("storage down");
      },
    };
    let attached = 0;
    await expectReason("storage_failed", () => uploadReviewImage(
      ports({
        store: throwing,
        attach: async () => {
          attached += 1;
          return { imageId };
        },
      }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(attached, 0);
  }

  {
    const used = memoryStore();
    let queued: string[] = [];
    await expectReason("not_allowed", () => uploadReviewImage(
      ports({
        store: used.store,
        attach: async () => {
          throw new Error("review_image_not_allowed");
        },
        queueCleanup: async (_reviewId, objectPaths) => {
          queued = objectPaths;
        },
      }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(used.calls.some((call) => call.op === "remove"), true);
    assert.deepEqual(queued, []);
  }

  {
    const used = memoryStore();
    let queued: string[] = [];
    await expectReason("cleanup_incomplete", () => uploadReviewImage(
      ports({
        store: {
          ...used.store,
          async remove(objectPaths) {
            return { failed: objectPaths };
          },
        },
        attach: async () => {
          throw new Error("db down");
        },
        queueCleanup: async (_reviewId, objectPaths) => {
          queued = objectPaths;
        },
      }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(queued.length, 1);
    assert.equal(isReviewObjectPath(queued[0], reviewId), true);
  }

  {
    const used = memoryStore();
    let prepares = 0;
    await expectReason("codec_unavailable", () => uploadReviewImage(
      ports({
        store: used.store,
        codec: null,
        prepare: async () => {
          prepares += 1;
          return { imageCount: 0 };
        },
      }),
      caller,
      reviewId,
      jpegWithExif(),
    ));
    assert.equal(prepares, 0);
    assert.equal(used.calls.length, 0);
  }

  {
    const objectPath = `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d2.jpg`;
    const used = memoryStore();
    const signed = await signPublicReviewImages(ports({
      store: used.store,
      listPublicImageIds: async () => [{ imageId }],
      publicObjectPath: async () => objectPath,
    }), reviewId);
    assert.equal(signed.length, 1);
    assert.equal(signed[0].id, imageId);
    assert.equal(used.calls[0].expires, REVIEW_IMAGE_SIGNED_URL_SECONDS);
    assert.equal(REVIEW_IMAGE_SIGNED_URL_SECONDS, 300);
  }

  {
    const used = memoryStore();
    const signed = await signPublicReviewImages(ports({
      store: used.store,
      listPublicImageIds: async () => [],
      publicObjectPath: async () => `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d2.jpg`,
    }), reviewId);
    assert.deepEqual(signed, []);
    assert.equal(used.calls.length, 0);
  }

  {
    const used = memoryStore();
    const signed = await signPublicReviewImages(ports({
      store: used.store,
      listPublicImageIds: async () => [{ imageId }],
      publicObjectPath: async () => `reviews/other-review/018c27c0-0000-4000-8000-0000000000d2.jpg`,
    }), reviewId);
    assert.deepEqual(signed, []);
    assert.equal(used.calls.some((call) => call.op === "sign"), false);
  }

  {
    const kept = `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d3.jpg`;
    const used = memoryStore([kept]);
    let deleted = 0;
    await expectReason("cleanup_incomplete", () => deleteReviewAndImages(
      ports({
        store: used.store,
        listOwnedPaths: async () => [kept, `../${reviewId}`],
        deleteReview: async () => {
          deleted += 1;
          return [];
        },
      }),
      caller,
      reviewId,
    ));
    assert.equal(deleted, 0);
    assert.deepEqual(used.calls[0].paths, [kept]);
  }

  {
    const orphan = `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d4.jpg`;
    const used = memoryStore([orphan]);
    let queued: string[] = [];
    await expectReason("cleanup_incomplete", () => deleteReviewAndImages(
      ports({
        store: used.store,
        deleteReview: async () => [orphan],
        queueCleanup: async (_reviewId, objectPaths) => {
          queued = objectPaths;
        },
      }),
      caller,
      reviewId,
    ));
    assert.deepEqual(queued, [orphan]);
  }

  {
    const orphan = `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d5.jpg`;
    const removed: string[] = [];
    const store: ReviewImageStore = {
      async upload() {
        throw new Error("unused");
      },
      async remove(objectPaths) {
        removed.push(...objectPaths);
        return { failed: [] };
      },
      async sign() {
        return "unused";
      },
    };
    let completed: string[] = [];
    await deleteReviewAndImages(ports({
      store,
      listCleanup: async () => [orphan],
      completeCleanup: async (_reviewId, objectPaths) => {
        completed = objectPaths;
      },
    }), caller, reviewId);
    assert.deepEqual(removed, [orphan]);
    assert.deepEqual(completed, [orphan]);
  }

  {
    const ownedPath = `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d6.jpg`;
    const used = memoryStore();
    let seenUserId = "";
    const signed = await signOwnedReviewImages(ports({
      store: used.store,
      listOwnedImages: async (userId) => {
        seenUserId = userId;
        return [{ imageId, objectPath: ownedPath }];
      },
    }), caller, reviewId);
    assert.equal(seenUserId, caller.userId);
    assert.equal(signed[0].url, "https://signed.invalid/300");
    assert.equal(used.calls[0].expires, 300);
    const ignored = await signOwnedReviewImages(ports({
      store: used.store,
      listOwnedImages: async () => [{ imageId, objectPath: `../${reviewId}` }],
    }), caller, reviewId);
    assert.deepEqual(ignored, []);
    await expectReason("storage_failed", () => signOwnedReviewImages(ports({
      store: {
        ...used.store,
        async sign() {
          throw new Error(`secret ${ownedPath}`);
        },
      },
      listOwnedImages: async () => [{ imageId, objectPath: ownedPath }],
    }), caller, reviewId));
  }

  await new Promise<void>((resolve, reject) => {
    const app = express();
    const used = memoryStore();
    registerReviewImageRoutes(app, {
      supabaseAdmin: null,
      supabasePublic: null,
      supabaseUrl: "http://127.0.0.1",
      supabaseAnonKey: undefined,
      ports: ports({
        store: used.store,
        listOwnedImages: async (userId, requestedReviewId) => {
          if (userId === "018c27c0-0000-4000-8000-0000000000c2") throw new ReviewImageError("not_owner", 403);
          if (userId !== caller.userId || requestedReviewId !== reviewId) return [];
          return [{
            imageId,
            objectPath: `reviews/${reviewId}/018c27c0-0000-4000-8000-0000000000d6.jpg`,
          }];
        },
      }),
      authenticate: async (authorization) => {
        if (authorization === "Bearer withdrawn") return { ...caller, withdrawn: true };
        if (authorization === "Bearer other") {
          return { ...caller, userId: "018c27c0-0000-4000-8000-0000000000c2", accessToken: "other" };
        }
        if (authorization === "Bearer owner") return caller;
        return null;
      },
    });
    const server = createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const base = `http://127.0.0.1:${address.port}`;
      try {
        const denied = await fetch(`${base}/api/reviews/${reviewId}/images`, { method: "POST", body: jpegWithExif() });
        assert.equal(denied.status, 401);
        const hidden = await fetch(`${base}/api/reviews/${reviewId}/images`);
        assert.equal(hidden.status, 404);
        const withdrawn = await fetch(`${base}/api/reviews/${reviewId}/image-deletion`, {
          method: "POST",
          headers: { authorization: "Bearer withdrawn" },
        });
        assert.equal(withdrawn.status, 403);
        const uploaded = await fetch(`${base}/api/reviews/${reviewId}/images`, {
          method: "POST",
          headers: {
            authorization: "Bearer owner",
            "content-type": "image/gif",
            "x-object-path": `../${reviewId}`,
          },
          body: jpegWithExif(),
        });
        assert.equal(uploaded.status, 201);
        const payload = await uploaded.json() as { imageId: string; contentType: string; objectPath?: string };
        assert.equal(payload.imageId, imageId);
        assert.equal(payload.contentType, "image/jpeg");
        assert.equal(payload.objectPath, undefined);
        const stored = used.calls.find((call) => call.op === "upload");
        assert.equal(stored?.path?.includes(".."), false);
        assert.equal(stored?.bytes?.includes(Buffer.from("EXIF")), false);
        const owned = await fetch(`${base}/api/reviews/${reviewId}/my-images`, {
          headers: { authorization: "Bearer owner" },
        });
        assert.equal(owned.status, 200);
        assert.equal(owned.headers.get("cache-control"), "no-store");
        assert.equal(owned.headers.get("referrer-policy"), "no-referrer");
        const ownedBody = await owned.json() as { images: Array<{ id: string; url: string; objectPath?: string }> };
        assert.equal(ownedBody.images.length, 1);
        assert.equal(ownedBody.images[0].id, imageId);
        assert.equal(ownedBody.images[0].url, "https://signed.invalid/300");
        assert.equal(JSON.stringify(ownedBody).includes("reviews/"), false);
        const empty = await fetch(`${base}/api/reviews/018c27c0-0000-4000-8000-0000000000ee/my-images`, {
          headers: { authorization: "Bearer owner" },
        });
        assert.equal(empty.status, 200);
        assert.deepEqual(await empty.json(), { ok: true, images: [] });
        const stranger = await fetch(`${base}/api/reviews/${reviewId}/my-images`, {
          headers: { authorization: "Bearer other" },
        });
        assert.equal(stranger.status, 403);
        const frozen = await fetch(`${base}/api/reviews/${reviewId}/my-images`, {
          headers: { authorization: "Bearer withdrawn" },
        });
        assert.equal(frozen.status, 403);
        const unsigned = await fetch(`${base}/api/reviews/${reviewId}/my-images`);
        assert.equal(unsigned.status, 401);
        const spoofed = await fetch(
          `${base}/api/reviews/${reviewId}/my-images?p_user_id=018c27c0-0000-4000-8000-0000000000c2&object_path=../secret.jpg`,
          { headers: { authorization: "Bearer owner", "x-user-id": "018c27c0-0000-4000-8000-0000000000c2" } },
        );
        assert.equal(spoofed.status, 200);
        const spoofedBody = await spoofed.json() as { images: Array<{ id: string }> };
        assert.equal(spoofedBody.images[0].id, imageId);
        server.close();
        resolve();
      } catch (error) {
        server.close();
        reject(error);
      }
    });
  });

  await verifyIndividualRemoval();
  await verifyRealSharpCodec();

  const routeSource = readFileSync("src/lib/reviewImageRoutes.ts", "utf8");
  const pipelineSource = readFileSync("src/lib/reviewImagePipeline.ts", "utf8");
  const serverSource = readFileSync("server.ts", "utf8");
  const sql = readFileSync("supabase/migrations/20261016120000_new27_review_image_server.sql", "utf8");
  const flags = readFileSync("src/types/reviews.ts", "utf8");
  assert.equal(routeSource.includes("getPublicUrl"), false);
  assert.equal(pipelineSource.includes("getPublicUrl"), false);
  assert.equal(routeSource.includes("createSignedUrl"), true);
  assert.equal(serverSource.includes("codec: null"), false);
  assert.equal(serverSource.includes("createSharpReviewImageCodec()"), true);
  assert.equal(readFileSync("src/lib/reviewImageCodec.ts", "utf8").includes("keepExif"), false);
  assert.equal(sql.includes("session_replication_role"), false);
  assert.equal(/GRANT [^;]+ ON TABLE public\.review_images/.test(sql), false);
  function createBody(sqlText: string, name: string): string {
    const start = sqlText.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.notEqual(start, -1, name);
    const end = sqlText.indexOf("$$;", start);
    assert.notEqual(end, -1, name);
    return sqlText.slice(start, end);
  }
  const catalogSql = readFileSync("supabase/migrations/20261015180000_new27_reviews.sql", "utf8");
  const catalogReviews = createBody(catalogSql, "list_public_reviews(");
  const publicIds = createBody(sql, "list_public_review_image_ids(");
  const publicPath = createBody(sql, "review_public_image_object_path(");
  const ownedPaths = createBody(sql, "list_owned_review_image_paths(");
  for (const body of [catalogReviews, publicIds, publicPath]) {
    assert.equal(body.includes("review.status = 'approved'"), true);
    assert.equal(body.includes("review.product_id IS NOT NULL"), true);
    assert.equal(body.includes("review_commerce_is_fulfilled"), true);
  }
  assert.equal(ownedPaths.includes("review.product_id IS NOT NULL"), false);
  assert.equal(sql.includes("GRANT "), true);
  assert.equal(/GRANT [^;]+ ON TABLE public\./.test(sql), false);

  const removalSql = readFileSync("supabase/migrations/20261018170000_new27_remove_owned_review_image.sql", "utf8");
  const removalBody = createBody(removalSql, "remove_owned_review_image(");
  assert.equal(removalBody.includes("auth.role()"), true);
  assert.equal(removalBody.includes("'service_role'"), true);
  assert.equal(removalBody.includes("auth.uid()"), false);
  assert.equal(removalBody.includes("p_user_id"), true);
  assert.equal(removalBody.includes("withdrawn_at"), true);
  assert.equal(removalBody.includes("DELETE FROM public.review_images"), true);
  assert.equal(removalBody.includes("UPDATE public.reviews"), false);
  assert.equal(removalBody.includes("delete_review"), false);
  assert.equal(removalBody.includes("search_path = pg_catalog, pg_temp"), true);
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.remove_owned_review_image\(uuid, uuid, uuid\) TO authenticated/.test(removalSql), false);
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.remove_owned_review_image\(uuid, uuid, uuid\) TO anon/.test(removalSql), false);
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.remove_owned_review_image\(uuid, uuid, uuid\) TO service_role/.test(removalSql), true);
  assert.equal(/GRANT [^;]+ ON TABLE public\./.test(removalSql), false);
  assert.equal(removalSql.includes("session_replication_role"), false);
  assert.equal(routeSource.includes("app.delete(\"/api/reviews/:reviewId/images/:imageId\""), true);
  assert.equal(routeSource.includes("removeOwnedReviewImage"), true);
  assert.equal(routeSource.includes("admin.rpc(\"remove_owned_review_image\""), true);
  assert.equal(routeSource.includes("p_user_id: userId"), true);
  assert.equal(routeSource.includes("app.post(\"/api/reviews/:reviewId/image-deletion\""), true);

  const ownedSql = readFileSync("supabase/migrations/20261016230000_new27_owned_review_images.sql", "utf8");
  const ownedBody = createBody(ownedSql, "list_owned_review_images(");
  assert.equal(ownedBody.includes("auth.role()"), true);
  assert.equal(ownedBody.includes("'service_role'"), true);
  assert.equal(ownedBody.includes("auth.uid()"), false);
  assert.equal(ownedBody.includes("p_user_id"), true);
  assert.equal(ownedBody.includes("withdrawn_at"), true);
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.list_owned_review_images\(uuid, uuid\) TO authenticated/.test(ownedSql), false);
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.list_owned_review_images\(uuid, uuid\) TO anon/.test(ownedSql), false);
  assert.equal(/GRANT EXECUTE ON FUNCTION public\.list_owned_review_images\(uuid, uuid\) TO service_role/.test(ownedSql), true);
  assert.equal(routeSource.includes("userClient(deps, accessToken).rpc(\"list_owned_review_images\""), false);
  assert.equal(routeSource.includes("admin.rpc(\"list_owned_review_images\""), true);
  assert.equal(routeSource.includes("p_user_id: userId"), true);
  assert.equal(flags.includes("export const REVIEW_READ_API_READY = false;"), true);
  assert.equal(flags.includes("export const REVIEW_WRITE_API_READY = false;"), true);
  const customer = readFileSync("src/components/reviews/reviewCopy.ts", "utf8");
  assert.equal(customer.includes("attach_review_image"), false);

  console.log("NEW27 review image local tests: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
