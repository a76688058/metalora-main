import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import express, { type Express, type Request, type Response } from "express";
import { reviewRequestBlocked } from "../types/reviews";
import {
  REVIEW_IMAGE_BUCKET,
  REVIEW_IMAGE_MAX_BYTES,
  REVIEW_IMAGE_SIGNED_URL_SECONDS,
  ReviewImageError,
  isReviewUuid,
  type ReviewImageCaller,
  type ReviewImageCodec,
  type ReviewImageStore,
} from "./reviewImageContract";
import {
  deleteReviewAndImages,
  removeOwnedReviewImage,
  signOwnedReviewImages,
  signPublicReviewImages,
  uploadReviewImage,
  type ReviewImagePorts,
} from "./reviewImagePipeline";

const RPC_REASONS: Record<string, ReviewImageError> = {
  review_auth_required: new ReviewImageError("unauthorized", 401),
  withdrawn_subject_frozen: new ReviewImageError("withdrawn", 403),
  review_not_owner: new ReviewImageError("not_owner", 403),
  review_image_limit: new ReviewImageError("limit", 409),
  review_image_not_allowed: new ReviewImageError("not_allowed", 409),
  review_image_server_only: new ReviewImageError("unavailable", 503),
  review_image_not_found: new ReviewImageError("not_found", 404),
  review_backend_unavailable: new ReviewImageError("unavailable", 503),
};

export type ReviewImageRouteDeps = {
  supabaseAdmin: SupabaseClient | null;
  supabasePublic: SupabaseClient | null;
  supabaseUrl: string;
  supabaseAnonKey: string | undefined;
  codec?: ReviewImageCodec | null;
  ports?: ReviewImagePorts;
  authenticate?: (authorization: string | undefined) => Promise<ReviewImageCaller | null>;
};

function reasonFromRpc(error: { message?: string } | null): ReviewImageError | null {
  if (!error?.message) return null;
  for (const [token, mapped] of Object.entries(RPC_REASONS)) {
    if (error.message.includes(token)) return mapped;
  }
  return new ReviewImageError("unavailable", 503);
}

function userClient(deps: ReviewImageRouteDeps, accessToken: string): SupabaseClient {
  return createClient(deps.supabaseUrl, deps.supabaseAnonKey ?? "", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function storageStore(admin: SupabaseClient): ReviewImageStore {
  const bucket = admin.storage.from(REVIEW_IMAGE_BUCKET);
  return {
    async upload(objectPath, bytes, contentType) {
      const { error } = await bucket.upload(objectPath, bytes, {
        contentType,
        upsert: false,
      });
      if (error) throw new ReviewImageError("storage_failed", 503);
    },
    async remove(objectPaths) {
      if (objectPaths.length === 0) return { failed: [] };
      const { error } = await bucket.remove(objectPaths);
      if (error) return { failed: objectPaths };
      return { failed: [] };
    },
    async sign(objectPath, expiresInSeconds) {
      const { data, error } = await bucket.createSignedUrl(objectPath, expiresInSeconds);
      if (error || !data?.signedUrl) throw new ReviewImageError("storage_failed", 503);
      return data.signedUrl;
    },
  };
}

function supabasePorts(deps: ReviewImageRouteDeps): ReviewImagePorts {
  const admin = deps.supabaseAdmin;
  if (!admin || !deps.supabaseAnonKey) {
    throw new ReviewImageError("unavailable", 503);
  }
  return {
    codec: deps.codec ?? null,
    store: storageStore(admin),
    async prepare(accessToken, reviewId) {
      const { data, error } = await userClient(deps, accessToken).rpc("prepare_review_image_attach", {
        p_review_id: reviewId,
      });
      const mapped = reasonFromRpc(error);
      if (mapped) throw mapped;
      const imageCount = typeof data === "number" ? data : Number(data);
      if (!Number.isInteger(imageCount)) throw new ReviewImageError("unavailable", 503);
      return { imageCount };
    },
    async attach(reviewId, objectPath, contentType, byteSize) {
      const { data, error } = await admin.rpc("attach_review_image", {
        p_review_id: reviewId,
        p_object_path: objectPath,
        p_content_type: contentType,
        p_byte_size: byteSize,
      });
      const mapped = reasonFromRpc(error);
      if (mapped) throw mapped;
      if (typeof data !== "string" || !isReviewUuid(data)) {
        throw new ReviewImageError("unavailable", 503);
      }
      return { imageId: data };
    },
    async removeOwnedImage(userId, reviewId, imageId) {
      const { data, error } = await admin.rpc("remove_owned_review_image", {
        p_review_id: reviewId,
        p_image_id: imageId,
        p_user_id: userId,
      });
      const mapped = reasonFromRpc(error);
      if (mapped) throw mapped;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") throw new ReviewImageError("unavailable", 503);
      const objectPath = "object_path" in row ? String(row.object_path) : "";
      const alreadyRemoved = "already_removed" in row && row.already_removed === true;
      if (!objectPath) throw new ReviewImageError("unavailable", 503);
      return { alreadyRemoved, objectPath };
    },
    async listOwnedImages(userId, reviewId) {
      const { data, error } = await admin.rpc("list_owned_review_images", {
        p_review_id: reviewId,
        p_user_id: userId,
      });
      const mapped = reasonFromRpc(error);
      if (mapped) throw mapped;
      if (!Array.isArray(data)) return [];
      return data.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const imageId = "image_id" in row ? String(row.image_id) : "";
        const objectPath = "object_path" in row ? String(row.object_path) : "";
        return imageId && objectPath ? [{ imageId, objectPath }] : [];
      });
    },
    async listOwnedPaths(accessToken, reviewId) {
      const { data, error } = await userClient(deps, accessToken).rpc("list_owned_review_image_paths", {
        p_review_id: reviewId,
      });
      const mapped = reasonFromRpc(error);
      if (mapped) throw mapped;
      return Array.isArray(data) ? data.filter((value): value is string => typeof value === "string") : [];
    },
    async deleteReview(accessToken, reviewId) {
      const { data, error } = await userClient(deps, accessToken).rpc("delete_review", {
        p_review_id: reviewId,
      });
      const mapped = reasonFromRpc(error);
      if (mapped) throw mapped;
      return Array.isArray(data) ? data.filter((value): value is string => typeof value === "string") : [];
    },
    async listPublicImageIds(reviewId) {
      const { data, error } = await admin.rpc("list_public_review_image_ids", {
        p_review_ids: [reviewId],
      });
      if (error || !Array.isArray(data)) throw new ReviewImageError("unavailable", 503);
      return data.flatMap((row) => {
        const imageId = row && typeof row === "object" && "image_id" in row ? String(row.image_id) : "";
        return isReviewUuid(imageId) ? [{ imageId }] : [];
      });
    },
    async publicObjectPath(imageId) {
      const { data, error } = await admin.rpc("review_public_image_object_path", {
        p_image_id: imageId,
      });
      if (error) throw new ReviewImageError("unavailable", 503);
      return typeof data === "string" && data ? data : null;
    },
    async queueCleanup(reviewId, objectPaths) {
      const { error } = await admin.rpc("queue_review_image_cleanup", {
        p_review_id: reviewId,
        p_paths: objectPaths,
      });
      if (error) throw new ReviewImageError("cleanup_incomplete", 503);
    },
    async listCleanup(reviewId) {
      const { data, error } = await admin.rpc("list_review_image_cleanup_jobs", {
        p_review_id: reviewId,
      });
      if (error) throw new ReviewImageError("cleanup_incomplete", 503);
      return Array.isArray(data) ? data.filter((value): value is string => typeof value === "string") : [];
    },
    async completeCleanup(reviewId, objectPaths) {
      const { error } = await admin.rpc("complete_review_image_cleanup", {
        p_review_id: reviewId,
        p_paths: objectPaths,
      });
      if (error) throw new ReviewImageError("cleanup_incomplete", 503);
    },
  };
}

async function authenticateCaller(
  deps: ReviewImageRouteDeps,
  authorization: string | undefined,
): Promise<ReviewImageCaller | null> {
  if (deps.authenticate) return deps.authenticate(authorization);
  if (!deps.supabasePublic || !deps.supabaseAdmin) return null;
  if (!authorization?.startsWith("Bearer ")) return null;
  const accessToken = authorization.slice(7).trim();
  if (!accessToken) return null;
  const { data, error } = await deps.supabasePublic.auth.getUser(accessToken);
  if (error || !data.user?.id) return null;
  if (data.user.app_metadata?.withdrawn === true) {
    throw new ReviewImageError("withdrawn", 403);
  }
  const { data: profile, error: profileError } = await deps.supabaseAdmin
    .from("profiles")
    .select("withdrawn_at")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw new ReviewImageError("unavailable", 503);
  if (typeof profile?.withdrawn_at === "string" && profile.withdrawn_at.trim()) {
    throw new ReviewImageError("withdrawn", 403);
  }
  return { userId: data.user.id, accessToken, withdrawn: false };
}

function sendError(res: Response, error: unknown): void {
  const reason = error instanceof ReviewImageError ? error.reason : "unavailable";
  const status = error instanceof ReviewImageError ? error.status : 500;
  console.error("[REVIEW_IMAGE]", { reason_class: reason });
  res.status(status).json({ ok: false, error: reason });
}

function portsFor(deps: ReviewImageRouteDeps): ReviewImagePorts {
  if (deps.ports) return deps.ports;
  return supabasePorts(deps);
}

export function registerReviewImageRoutes(app: Express, deps: ReviewImageRouteDeps): void {
  const readBytes = express.raw({
    limit: REVIEW_IMAGE_MAX_BYTES,
    type: () => true,
  });

  const denyClosed = (res: Response, capability: "read" | "write"): boolean => {
    if (!reviewRequestBlocked(capability)) return false;
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ ok: false, error: "unavailable" });
    return true;
  };

  app.post("/api/reviews/:reviewId/images", (req, res, next) => {
    readBytes(req, res, (error) => {
      if (error) {
        console.error("[REVIEW_IMAGE]", { reason_class: "too_large" });
        res.status(413).json({ ok: false, error: "too_large" });
        return;
      }
      next();
    });
  }, async (req: Request, res: Response) => {
    try {
      if (denyClosed(res, "write")) return;
      const caller = await authenticateCaller(deps, req.headers.authorization);
      if (!caller) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const uploaded = await uploadReviewImage(portsFor(deps), caller, req.params.reviewId, bytes);
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({
        ok: true,
        imageId: uploaded.imageId,
        contentType: uploaded.contentType,
        byteSize: uploaded.byteSize,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/reviews/:reviewId/my-images", async (req, res) => {
    try {
      if (denyClosed(res, "read")) return;
      const caller = await authenticateCaller(deps, req.headers.authorization);
      if (!caller) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      const images = await signOwnedReviewImages(portsFor(deps), caller, req.params.reviewId);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.status(200).json({ ok: true, images });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/reviews/:reviewId/images", async (req, res) => {
    try {
      if (denyClosed(res, "read")) return;
      const images = await signPublicReviewImages(portsFor(deps), req.params.reviewId);
      if (images.length === 0) {
        res.status(404).json({ ok: false, error: "not_allowed" });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.status(200).json({ ok: true, images });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/reviews/:reviewId/images/:imageId", async (req, res) => {
    try {
      if (denyClosed(res, "write")) return;
      const caller = await authenticateCaller(deps, req.headers.authorization);
      if (!caller) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      const removed = await removeOwnedReviewImage(
        portsFor(deps),
        caller,
        req.params.reviewId,
        req.params.imageId,
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.status(200).json({
        ok: true,
        deleted: true,
        ...(removed.alreadyDeleted ? { alreadyDeleted: true } : {}),
      });
    } catch (error) {
      if (error instanceof ReviewImageError && error.reason === "cleanup_incomplete") {
        console.error("[REVIEW_IMAGE]", { reason_class: "cleanup_incomplete" });
        res.setHeader("Cache-Control", "no-store");
        res.status(503).json({ ok: false, error: "cleanup_incomplete", retry: true });
        return;
      }
      sendError(res, error);
    }
  });

  app.post("/api/reviews/:reviewId/image-deletion", async (req, res) => {
    try {
      if (denyClosed(res, "write")) return;
      const caller = await authenticateCaller(deps, req.headers.authorization);
      if (!caller) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      await deleteReviewAndImages(portsFor(deps), caller, req.params.reviewId);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ ok: true, tombstoned: true, retry: false });
    } catch (error) {
      if (error instanceof ReviewImageError && error.reason === "cleanup_incomplete") {
        console.error("[REVIEW_IMAGE]", { reason_class: "cleanup_incomplete" });
        res.status(503).json({ ok: false, error: "cleanup_incomplete", retry: true });
        return;
      }
      sendError(res, error);
    }
  });
}

export const REVIEW_IMAGE_SIGN_SECONDS = REVIEW_IMAGE_SIGNED_URL_SECONDS;
