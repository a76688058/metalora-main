import {
  WORKSHOP_MEDIA_GCS_HOST,
  parseWorkshopMediaRef,
  type WorkshopMediaKind,
  type WorkshopResolvedMedia,
} from '../workshopMediaCore';
import type { CustomComposition, CustomSource } from './types';

export const WORKSHOP_MEDIA_ENDPOINTS = {
  signUpload: '/api/workshop-media/sign-upload',
  commit: '/api/workshop-media/commit',
  discard: '/api/workshop-media/discard',
} as const;

export const WORKSHOP_UPLOAD_LIMITS: Record<WorkshopMediaKind, number> = {
  original: 25 * 1024 * 1024,
  preview: 5 * 1024 * 1024,
};

const ORIGINAL_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const PREVIEW_CONTENT_TYPE = 'image/jpeg';
const REQUEST_TIMEOUT_MS = 20_000;
const PUT_TIMEOUT_MS = 120_000;

type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown>; blob(): Promise<Blob> };
type FetchLike = (input: string, init: RequestInit) => Promise<FetchResponse>;

/** Browser wiring for the Workshop media endpoints. Holds no signed URL. */
export type WorkshopMediaApi = {
  fetch: FetchLike;
  getAccessToken: () => Promise<string | null>;
  now?: () => number;
};

export type WorkshopUploadFailure =
  | 'unsupported_type'
  | 'too_large'
  | 'unauthenticated'
  | 'sign_failed'
  | 'upload_failed'
  | 'commit_failed';

/** Carries a reason code only; never a URL, path or token. */
export class WorkshopUploadError extends Error {
  constructor(readonly reason: WorkshopUploadFailure) {
    super(`workshop_upload_${reason}`);
    this.name = 'WorkshopUploadError';
  }
}

export type TrustedCustomCartRow = {
  custom_image?: string | null;
  custom_config?: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** Content type the backend will accept for an original, or null. */
export function workshopOriginalContentType(file: Pick<File, 'type' | 'name'>): string | null {
  const mime = (file.type || '').toLowerCase();
  const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
  if ((ORIGINAL_CONTENT_TYPES as readonly string[]).includes(normalized)) return normalized;
  if (normalized && normalized !== 'application/octet-stream') return null;
  const name = (file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

async function postJson(
  api: WorkshopMediaApi,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const token = await api.getAccessToken().catch(() => null);
  if (!token) throw new WorkshopUploadError('unauthenticated');
  const res = await api.fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

type SignedUpload = { path: string; url: string; headers: Record<string, string>; expiresAtMs: number };

function parseSignedUpload(body: unknown, kind: WorkshopMediaKind): SignedUpload | null {
  const rec = asRecord(body);
  const upload = asRecord(rec?.upload);
  if (!rec || !upload) return null;
  const parsed = parseWorkshopMediaRef(rec.path);
  if (!parsed || parsed.source !== 'canonical' || parsed.kind !== kind) return null;
  if (upload.method !== 'PUT' || typeof upload.url !== 'string') return null;
  try {
    const url = new URL(upload.url);
    if (url.protocol !== 'https:' || url.host !== WORKSHOP_MEDIA_GCS_HOST || url.username || url.password) {
      return null;
    }
  } catch {
    return null;
  }
  const headers = asRecord(upload.headers);
  if (!headers || !Object.values(headers).every((value) => typeof value === 'string')) return null;
  const expiresAtMs = typeof rec.expiresAt === 'string' ? Date.parse(rec.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAtMs)) return null;
  return { path: parsed.path, url: upload.url, headers: headers as Record<string, string>, expiresAtMs };
}

async function signUpload(
  api: WorkshopMediaApi,
  kind: WorkshopMediaKind,
  contentType: string,
  sizeBytes: number,
): Promise<SignedUpload> {
  let res: { status: number; body: unknown };
  try {
    res = await postJson(api, WORKSHOP_MEDIA_ENDPOINTS.signUpload, { kind, contentType, sizeBytes });
  } catch (error) {
    if (error instanceof WorkshopUploadError) throw error;
    throw new WorkshopUploadError('sign_failed');
  }
  if (res.status === 401) throw new WorkshopUploadError('unauthenticated');
  if (res.status === 413) throw new WorkshopUploadError('too_large');
  if (res.status !== 200) throw new WorkshopUploadError('sign_failed');
  const signed = parseSignedUpload(res.body, kind);
  if (!signed) throw new WorkshopUploadError('sign_failed');
  return signed;
}

/** Signed PUT with the exact server URL and headers. No redirects, no referrer, no credentials. */
async function putSigned(api: WorkshopMediaApi, signed: SignedUpload, body: Blob): Promise<boolean> {
  const now = api.now ?? Date.now;
  if (now() >= signed.expiresAtMs) return false;
  try {
    const res = await api.fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: timeoutSignal(PUT_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function commitUpload(api: WorkshopMediaApi, path: string, kind: WorkshopMediaKind): Promise<boolean> {
  try {
    const res = await postJson(api, WORKSHOP_MEDIA_ENDPOINTS.commit, { path, kind });
    return res.status === 200 && asRecord(res.body)?.path === path;
  } catch {
    return false;
  }
}

/** Best effort. The server refuses referenced or old objects; those are left to retention. */
export async function discardWorkshopUploads(api: WorkshopMediaApi, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter((path) => parseWorkshopMediaRef(path)?.source === 'canonical'))];
  await Promise.all(
    unique.map((path) =>
      postJson(api, WORKSHOP_MEDIA_ENDPOINTS.discard, { path }).then(
        () => undefined,
        () => undefined,
      ),
    ),
  );
}

/**
 * sign-upload → signed PUT → commit. Returns the committed canonical path only.
 * A failed PUT is retried once with a freshly signed, new path.
 */
async function uploadWorkshopMedia(
  api: WorkshopMediaApi,
  kind: WorkshopMediaKind,
  body: Blob,
  contentType: string,
): Promise<string> {
  if (!(body.size >= 1)) throw new WorkshopUploadError('upload_failed');
  if (body.size > WORKSHOP_UPLOAD_LIMITS[kind]) throw new WorkshopUploadError('too_large');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const signed = await signUpload(api, kind, contentType, body.size);
    if (!(await putSigned(api, signed, body))) {
      await discardWorkshopUploads(api, [signed.path]);
      continue;
    }
    if (!(await commitUpload(api, signed.path, kind))) {
      await discardWorkshopUploads(api, [signed.path]);
      throw new WorkshopUploadError('commit_failed');
    }
    return signed.path;
  }
  throw new WorkshopUploadError('upload_failed');
}

export async function uploadWorkshopOriginal(api: WorkshopMediaApi, file: File): Promise<string> {
  const contentType = workshopOriginalContentType(file);
  if (!contentType) throw new WorkshopUploadError('unsupported_type');
  return uploadWorkshopMedia(api, 'original', file, contentType);
}

export async function uploadWorkshopPreview(api: WorkshopMediaApi, blob: Blob): Promise<string> {
  const body = blob.type === PREVIEW_CONTENT_TYPE ? blob : new Blob([blob], { type: PREVIEW_CONTENT_TYPE });
  return uploadWorkshopMedia(api, 'preview', body, PREVIEW_CONTENT_TYPE);
}

export type WorkshopCartMediaRefs = { originalRef: string; previewRef: string };

export type WorkshopCartMediaResult<T> =
  | { ok: true; value: T; refs: WorkshopCartMediaRefs }
  | { ok: false; reason: 'no_original' | 'upload_failed' | 'not_persisted' };

/**
 * New original (or an existing persisted ref) + new preview, then `persist`. Refs are handed to
 * `persist` only after both uploads committed. If `persist` returns null or throws, this call's
 * new uploads are discarded best effort; the server keeps anything already referenced.
 */
export async function persistWorkshopCartMedia<T>(
  api: WorkshopMediaApi,
  input: { originalFile: File | null; existingOriginalRef: string | null; previewBlob: Blob },
  persist: (refs: WorkshopCartMediaRefs) => Promise<T | null>,
): Promise<WorkshopCartMediaResult<T>> {
  const created: string[] = [];
  let refs: WorkshopCartMediaRefs;
  try {
    let originalRef: string | null = null;
    if (input.originalFile) {
      originalRef = await uploadWorkshopOriginal(api, input.originalFile);
      created.push(originalRef);
    } else if (input.existingOriginalRef) {
      originalRef = input.existingOriginalRef;
    }
    if (!originalRef) return { ok: false, reason: 'no_original' };
    const previewRef = await uploadWorkshopPreview(api, input.previewBlob);
    created.push(previewRef);
    refs = { originalRef, previewRef };
  } catch {
    await discardWorkshopUploads(api, created);
    return { ok: false, reason: 'upload_failed' };
  }

  let value: T | null = null;
  try {
    value = await persist(refs);
  } catch {
    value = null;
  }
  if (value === null) {
    await discardWorkshopUploads(api, created);
    return { ok: false, reason: 'not_persisted' };
  }
  return { ok: true, value, refs };
}

export type WorkshopMediaBlobDeps = {
  resolve: (ref: string) => Promise<WorkshopResolvedMedia | null>;
  retryAfterLoadError: (ref: string, failedSrc: string) => Promise<WorkshopResolvedMedia | null>;
  fetch: FetchLike;
  createObjectUrl: (blob: Blob) => string;
};

/**
 * Persisted canonical ref → local blob: URL for editing. GCS objects are `no-store`, so the
 * temporary signed src is fetched once (CORS, no referrer) instead of being reused after expiry.
 * One re-sign on failure. Null means the image is unavailable; the caller keeps the ref.
 */
export async function loadWorkshopMediaAsObjectUrl(
  ref: string,
  deps: WorkshopMediaBlobDeps,
): Promise<string | null> {
  const fetchBlob = async (src: string): Promise<Blob | null> => {
    try {
      const res = await deps.fetch(src, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: timeoutSignal(PUT_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.size > 0 ? blob : null;
    } catch {
      return null;
    }
  };

  const media = await deps.resolve(ref).catch(() => null);
  if (!media) return null;
  let blob = await fetchBlob(media.src);
  if (!blob) {
    const retried = await deps.retryAfterLoadError(ref, media.src).catch(() => null);
    if (!retried || retried.src === media.src) return null;
    blob = await fetchBlob(retried.src);
  }
  return blob ? deps.createObjectUrl(blob) : null;
}

export function buildCompleteV1Config(
  source: CustomSource,
  composition: CustomComposition,
): Record<string, unknown> {
  return {
    composition: {
      version: 1,
      orientation: composition.orientation,
      zoom: composition.zoom,
      offsetX: composition.offsetX,
      offsetY: composition.offsetY,
    },
    source_width: source.width,
    source_height: source.height,
    material: 'aluminum',
    serial_number: `WS-${Date.now()}`,
  };
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) return null;
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n) || n < 1) return null;
    return n;
  }
  return null;
}

/**
 * Client-side sanity check of the RPC echo. Image identity is compared through the shared
 * Workshop normalizer (canonical path ≡ its legacy URL); unparseable refs never match.
 */
export function verifyTrustedCustomCartRow(
  row: TrustedCustomCartRow | null | undefined,
  expectedPreviewRef: string,
  normalizeRef: (value: unknown) => string | null,
): { ok: true; priceSnapshot: number } | { ok: false } {
  if (!row) return { ok: false };
  const cfg = row.custom_config;
  if (!cfg || typeof cfg !== 'object') return { ok: false };
  if (cfg.price_snapshot_version !== '1') return { ok: false };
  if (cfg.price_snapshot_source !== 'custom_m_price') return { ok: false };
  const priceSnapshot = parsePositiveInt(cfg.price_snapshot);
  if (priceSnapshot === null) return { ok: false };
  const returned = normalizeRef(row.custom_image);
  const expected = normalizeRef(expectedPreviewRef);
  if (!returned || !expected || returned !== expected) return { ok: false };
  return { ok: true, priceSnapshot };
}
