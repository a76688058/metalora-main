import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth, Impersonated, type AuthClient } from 'google-auth-library';

/**
 * NEW4-4D-3 — Workshop media storage adapter.
 *
 * Two stores during the transition:
 *   gcs              — private Seoul bucket, every request on the regional endpoint
 *   supabase_legacy  — public `workshop` bucket used by the live client until cutover
 *
 * Only Workshop operations are exposed (list customer objects, remove, head, sign).
 * Signed URLs, signatures, tokens and object URLs are never logged.
 */

export const WORKSHOP_BUCKET = 'workshop';
export const WORKSHOP_GCS_PROJECT = 'metalora-auth';
export const WORKSHOP_GCS_APPROVED_BUCKET = 'metalora-workshop-apne3';
export const WORKSHOP_GCS_REGIONAL_HOST = 'storage.asia-northeast3.rep.googleapis.com';
export const WORKSHOP_GCS_SIGNER_SA = `workshop-media-signer@${WORKSHOP_GCS_PROJECT}.iam.gserviceaccount.com`;
export const WORKSHOP_GCS_ENV = {
  bucket: 'WORKSHOP_GCS_BUCKET',
  endpoint: 'WORKSHOP_GCS_ENDPOINT',
  signer: 'WORKSHOP_GCS_SIGNER_SA',
} as const;

export const WORKSHOP_MEDIA_CACHE_CONTROL = 'private, no-store';
export const WORKSHOP_SIGNED_URL_TTL_SECONDS = 300;
export const WORKSHOP_SIGN_READ_BATCH_MAX = 20;
export const WORKSHOP_DISCARD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const WORKSHOP_STORAGE_LIST_PAGE = 1000;

/** GCS custom metadata written by the legacy copy tool (NEW4-4D-9). Values are fixed tokens or a hash. */
export const WORKSHOP_LEGACY_COPY_METADATA = {
  origin: 'workshop_origin',
  state: 'workshop_copy_state',
  sourceSha256: 'workshop_source_sha256',
} as const;
export const WORKSHOP_LEGACY_COPY_ORIGIN = 'supabase_legacy';
export type WorkshopLegacyCopyState = 'written' | 'verified';

/**
 * Server-side legacy read mode. Absent = `true` (transition: uncopied legacy refs keep the
 * Supabase response). `false` = post-cutover: legacy refs resolve from verified GCS copies only.
 */
export const WORKSHOP_LEGACY_FALLBACK_ENV = 'WORKSHOP_LEGACY_SUPABASE_FALLBACK_ENABLED';

export const WORKSHOP_MEDIA_PATHS = {
  signUpload: '/api/workshop-media/sign-upload',
  signRead: '/api/workshop-media/sign-read',
  commit: '/api/workshop-media/commit',
  discard: '/api/workshop-media/discard',
} as const;

export type WorkshopMediaKind = 'original' | 'preview';

export const WORKSHOP_UPLOAD_CAPS: Record<WorkshopMediaKind, number> = {
  original: 25 * 1024 * 1024,
  preview: 5 * 1024 * 1024,
};

export const WORKSHOP_CONTENT_TYPES: Record<WorkshopMediaKind, readonly string[]> = {
  original: ['image/jpeg', 'image/png', 'image/webp'],
  preview: ['image/jpeg'],
};

/** API responses that carry signed URLs must never be cached or leak via Referer. */
export const WORKSHOP_MEDIA_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'Referrer-Policy': 'no-referrer',
};

export function applyWorkshopMediaResponseHeaders(res: { setHeader(name: string, value: string): unknown }): void {
  for (const [name, value] of Object.entries(WORKSHOP_MEDIA_RESPONSE_HEADERS)) res.setHeader(name, value);
}

// ---------------------------------------------------------------------------
// Path contracts
// ---------------------------------------------------------------------------

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STRICT_ORIGINAL_RE = new RegExp(`^originals/(${UUID})/(${UUID})\\.(jpg|jpeg|png|webp)$`);
const STRICT_PREVIEW_RE = new RegExp(`^previews/(${UUID})/(${UUID})\\.(jpg)$`);
const LOWER_UUID_RE = new RegExp(`^${UUID}$`);

/** Legacy-tolerant object shape (any filename). Used for cleanup/deletion only, never for signing. */
const WORKSHOP_OBJECT_PATH_RE =
  /^(originals|previews)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^\\/]+$/i;

const STORAGE_PUBLIC_MARKERS = [
  '/storage/v1/object/public/workshop/',
  '/storage/v1/object/sign/workshop/',
  '/storage/v1/object/authenticated/workshop/',
] as const;

const LEGACY_SIGN_MARKER = '/storage/v1/object/sign/workshop/';

export function isCanonicalWorkshopObjectPath(path: string): boolean {
  return WORKSHOP_OBJECT_PATH_RE.test(path);
}

/** Legacy-tolerant extraction (NEW4-6 semantics). Cleanup/protection only. */
export function workshopStoragePathFromUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isCanonicalWorkshopObjectPath(trimmed)) return trimmed;

  let pathname = trimmed;
  try {
    const parsed = new URL(trimmed);
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    try {
      pathname = decodeURIComponent(trimmed.split('?')[0] ?? trimmed);
    } catch {
      return null;
    }
  }

  const lower = pathname.toLowerCase();
  for (const marker of STORAGE_PUBLIC_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx < 0) continue;
    const rest = pathname.slice(idx + marker.length).replace(/^\/+/, '');
    if (isCanonicalWorkshopObjectPath(rest)) return rest;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function collectWorkshopPaths(value: unknown, acc: Set<string> = new Set(), depth = 0): string[] {
  if (depth > 8 || value == null) return [...acc];
  if (typeof value === 'string') {
    const path = workshopStoragePathFromUrl(value);
    if (path) acc.add(path);
    return [...acc];
  }
  if (Array.isArray(value)) {
    for (const item of value) collectWorkshopPaths(item, acc, depth + 1);
    return [...acc];
  }
  const rec = asRecord(value);
  if (!rec) return [...acc];
  for (const nested of Object.values(rec)) collectWorkshopPaths(nested, acc, depth + 1);
  return [...acc];
}

export type ParsedWorkshopRef = {
  path: string;
  kind: WorkshopMediaKind;
  uid: string;
  objectId: string;
  ext: string;
  source: 'canonical' | 'legacy_supabase';
};

export type WorkshopRefOptions = {
  /** Exact hostnames of the trusted legacy Supabase project. Empty = legacy URLs rejected. */
  legacyHosts?: readonly string[];
};

function parseStrictCanonicalPath(path: string, source: ParsedWorkshopRef['source']): ParsedWorkshopRef | null {
  const original = STRICT_ORIGINAL_RE.exec(path);
  if (original) {
    return { path, kind: 'original', uid: original[1], objectId: original[2], ext: original[3], source };
  }
  const preview = STRICT_PREVIEW_RE.exec(path);
  if (preview) {
    return { path, kind: 'preview', uid: preview[1], objectId: preview[2], ext: preview[3], source };
  }
  return null;
}

/**
 * Strict Workshop reference parser. Accepts:
 *   - canonical `originals/{uid}/{uuid}.{jpg|jpeg|png|webp}` / `previews/{uid}/{uuid}.jpg`
 *   - legacy Supabase public / authenticated / signed URL on an exact trusted host
 * Rejects unknown hosts, query abuse, `%`, `..`, backslash, double slash, malformed UUIDs,
 * wrong prefixes and unexpected extensions.
 */
export function parseWorkshopRef(value: unknown, options: WorkshopRefOptions = {}): ParsedWorkshopRef | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  if (/[%\\\s#]/.test(raw) || raw.includes('..')) return null;

  if (!raw.includes('://')) {
    if (raw.includes('?') || raw.includes('//') || raw.includes(':')) return null;
    return parseStrictCanonicalPath(raw, 'canonical');
  }

  if (!raw.startsWith('https://')) return null;
  if (raw.slice('https://'.length).includes('//')) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const hosts = (options.legacyHosts ?? []).map((host) => host.toLowerCase());
  if (!hosts.includes(url.hostname)) return null;

  for (const marker of STORAGE_PUBLIC_MARKERS) {
    if (!url.pathname.startsWith(marker)) continue;
    if (marker === LEGACY_SIGN_MARKER) {
      const keys = [...url.searchParams.keys()];
      if (keys.length !== 1 || keys[0] !== 'token') return null;
    } else if (url.search) {
      return null;
    }
    return parseStrictCanonicalPath(url.pathname.slice(marker.length), 'legacy_supabase');
  }
  return null;
}

export function normalizeWorkshopRef(value: unknown, options: WorkshopRefOptions = {}): string | null {
  return parseWorkshopRef(value, options)?.path ?? null;
}

/** Comparison identity: canonical path for trusted Workshop refs, otherwise the trimmed value. */
export function workshopRefIdentity(value: unknown, options: WorkshopRefOptions = {}): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeWorkshopRef(trimmed, options) ?? trimmed;
}

export function legacySupabaseHosts(supabaseUrl: string | null | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') ? [url.hostname.toLowerCase()] : [];
  } catch {
    return [];
  }
}

/** True for any value that is (or points at) private Workshop media or a GCS signed URL. */
export function isWorkshopMediaOrSignedValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (workshopStoragePathFromUrl(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('workshop/') ||
    lower.startsWith('originals/') ||
    lower.startsWith('previews/') ||
    lower.startsWith('_ops-smoke/') ||
    lower.includes('/workshop/') ||
    lower.includes('x-goog-signature') ||
    lower.includes('x-goog-credential') ||
    lower.includes(WORKSHOP_GCS_APPROVED_BUCKET)
  ) {
    return true;
  }
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host.endsWith('googleapis.com') || host === 'storage.cloud.google.com';
  } catch {
    return false;
  }
}

function extensionForContentType(kind: WorkshopMediaKind, contentType: string): string | null {
  if (!WORKSHOP_CONTENT_TYPES[kind].includes(contentType)) return null;
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

/** Strict canonical object path (no URL forms). */
export function parseCanonicalWorkshopPath(path: string): ParsedWorkshopRef | null {
  return parseStrictCanonicalPath(path, 'canonical');
}

export function contentTypeForExtension(ext: string): string | null {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

export function buildCanonicalWorkshopPath(
  kind: WorkshopMediaKind,
  uid: string,
  contentType: string,
  objectId: string = randomUUID(),
): string | null {
  if (!LOWER_UUID_RE.test(uid) || !LOWER_UUID_RE.test(objectId)) return null;
  const ext = extensionForContentType(kind, contentType);
  if (!ext) return null;
  const path = `${kind === 'original' ? 'originals' : 'previews'}/${uid}/${objectId}.${ext}`;
  return parseStrictCanonicalPath(path, 'canonical') ? path : null;
}

// ---------------------------------------------------------------------------
// GCS configuration (regional endpoint + signer are hard requirements)
// ---------------------------------------------------------------------------

export type WorkshopGcsConfig = {
  bucket: string;
  endpointHost: string;
  signerSa: string;
};

export type WorkshopGcsConfigResult =
  | { state: 'absent' }
  | { state: 'invalid'; reason: 'partial' | 'bucket' | 'endpoint' | 'signer' }
  | { state: 'ready'; config: WorkshopGcsConfig };

/** Accepts only the approved Seoul regional host (bare or `https://`, optional trailing slash). */
export function resolveRegionalEndpointHost(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === WORKSHOP_GCS_REGIONAL_HOST || trimmed === `${WORKSHOP_GCS_REGIONAL_HOST}/`) {
    return WORKSHOP_GCS_REGIONAL_HOST;
  }
  if (trimmed === `https://${WORKSHOP_GCS_REGIONAL_HOST}` || trimmed === `https://${WORKSHOP_GCS_REGIONAL_HOST}/`) {
    return WORKSHOP_GCS_REGIONAL_HOST;
  }
  return null;
}

export function readWorkshopGcsConfig(env: Record<string, string | undefined>): WorkshopGcsConfigResult {
  const bucket = (env[WORKSHOP_GCS_ENV.bucket] ?? '').trim();
  const endpoint = (env[WORKSHOP_GCS_ENV.endpoint] ?? '').trim();
  const signer = (env[WORKSHOP_GCS_ENV.signer] ?? '').trim();
  if (!bucket && !endpoint && !signer) return { state: 'absent' };
  if (!bucket || !endpoint || !signer) return { state: 'invalid', reason: 'partial' };
  if (bucket !== WORKSHOP_GCS_APPROVED_BUCKET) return { state: 'invalid', reason: 'bucket' };
  const endpointHost = resolveRegionalEndpointHost(endpoint);
  if (!endpointHost) return { state: 'invalid', reason: 'endpoint' };
  if (signer !== WORKSHOP_GCS_SIGNER_SA) return { state: 'invalid', reason: 'signer' };
  return { state: 'ready', config: { bucket, endpointHost, signerSa: signer } };
}

export type WorkshopLegacyFallbackResult =
  | { state: 'ready'; enabled: boolean }
  | { state: 'invalid' };

/** `true` / absent → fallback on; `false` → off; anything else fails closed. */
export function readWorkshopLegacyFallback(env: Record<string, string | undefined>): WorkshopLegacyFallbackResult {
  const raw = (env[WORKSHOP_LEGACY_FALLBACK_ENV] ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'true') return { state: 'ready', enabled: true };
  if (raw === 'false') return { state: 'ready', enabled: false };
  return { state: 'invalid' };
}

export class WorkshopStorageConfigError extends Error {
  constructor(readonly reason: string) {
    super('workshop_gcs_config_invalid');
  }
}

// ---------------------------------------------------------------------------
// Store model
// ---------------------------------------------------------------------------

export type WorkshopStoreName = 'gcs' | 'supabase_legacy';
export type WorkshopStorageOperation = 'list' | 'remove' | 'head' | 'sign' | 'init';

export class WorkshopStorageError extends Error {
  constructor(
    readonly store: WorkshopStoreName,
    readonly operation: WorkshopStorageOperation,
    readonly retryable: boolean,
  ) {
    super(`workshop_storage_${operation}_failed`);
  }
}

export type WorkshopListScope = { kind: 'all' } | { kind: 'user'; uid: string };

export type WorkshopListedObject = {
  path: string;
  createdAtMs: number | null;
  store: WorkshopStoreName;
};

export type WorkshopObjectMetadata = {
  path: string;
  sizeBytes: number;
  contentType: string | null;
  cacheControl: string | null;
  createdAtMs: number | null;
  /** Set only on objects written by the legacy copy tool. */
  legacyCopy?: WorkshopLegacyCopyState | null;
};

export type WorkshopSignedUpload = {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
};

export type WorkshopSignedRead = { url: string; expiresAt: string };

export interface WorkshopObjectStore {
  readonly name: WorkshopStoreName;
  listObjects(scope: WorkshopListScope): Promise<WorkshopListedObject[]>;
  remove(path: string): Promise<'removed' | 'absent'>;
}

export interface WorkshopGcsObjectStore extends WorkshopObjectStore {
  readonly name: 'gcs';
  head(path: string): Promise<WorkshopObjectMetadata | null>;
  signUpload(path: string, contentType: string, maxBytes: number): Promise<WorkshopSignedUpload>;
  signRead(path: string): Promise<WorkshopSignedRead>;
}

function userScopeValid(scope: WorkshopListScope): boolean {
  return scope.kind === 'all' || LOWER_UUID_RE.test(scope.uid.toLowerCase());
}

// --- Supabase legacy -------------------------------------------------------

function isMissingStorageObjectError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('not_found') ||
    lower.includes('does not exist') ||
    lower.includes('no such file')
  );
}

type SupabaseListRow = { name: string; id: string | null; createdAtMs: number | null };

async function supabaseListPrefix(admin: SupabaseClient, prefix: string): Promise<SupabaseListRow[]> {
  const rows: SupabaseListRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(WORKSHOP_BUCKET).list(prefix, {
      limit: WORKSHOP_STORAGE_LIST_PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new WorkshopStorageError('supabase_legacy', 'list', true);
    const page = data ?? [];
    if (page.length === 0) break;
    for (const entry of page) {
      const createdRaw = typeof entry.created_at === 'string' ? Date.parse(entry.created_at) : Number.NaN;
      const updatedRaw = typeof entry.updated_at === 'string' ? Date.parse(entry.updated_at) : Number.NaN;
      const createdAtMs = Number.isFinite(createdRaw)
        ? createdRaw
        : Number.isFinite(updatedRaw)
          ? updatedRaw
          : null;
      rows.push({ name: entry.name, id: entry.id ?? null, createdAtMs });
    }
    if (page.length < WORKSHOP_STORAGE_LIST_PAGE) break;
    offset += page.length;
  }
  return rows;
}

export function createSupabaseLegacyWorkshopStore(admin: SupabaseClient): WorkshopObjectStore {
  return {
    name: 'supabase_legacy',
    async listObjects(scope) {
      if (!userScopeValid(scope)) throw new WorkshopStorageError('supabase_legacy', 'list', false);
      const out: WorkshopListedObject[] = [];
      if (scope.kind === 'user') {
        for (const root of ['originals', 'previews'] as const) {
          const prefix = `${root}/${scope.uid}`;
          for (const entry of await supabaseListPrefix(admin, prefix)) {
            if (!entry.name || entry.name === '.emptyFolderPlaceholder') continue;
            const path = `${prefix}/${entry.name}`;
            if (isCanonicalWorkshopObjectPath(path)) {
              out.push({ path, createdAtMs: entry.createdAtMs, store: 'supabase_legacy' });
            }
          }
        }
        return out;
      }
      for (const root of ['originals', 'previews'] as const) {
        for (const folder of await supabaseListPrefix(admin, root)) {
          if (!folder.name || folder.name === '.emptyFolderPlaceholder') continue;
          if (folder.id) {
            const direct = `${root}/${folder.name}`;
            if (isCanonicalWorkshopObjectPath(direct)) {
              out.push({ path: direct, createdAtMs: folder.createdAtMs, store: 'supabase_legacy' });
            }
            continue;
          }
          for (const file of await supabaseListPrefix(admin, `${root}/${folder.name}`)) {
            if (!file.name || file.name === '.emptyFolderPlaceholder') continue;
            const path = `${root}/${folder.name}/${file.name}`;
            if (!isCanonicalWorkshopObjectPath(path)) continue;
            out.push({ path, createdAtMs: file.createdAtMs, store: 'supabase_legacy' });
          }
        }
      }
      return out;
    },
    async remove(path) {
      if (!isCanonicalWorkshopObjectPath(path)) throw new WorkshopStorageError('supabase_legacy', 'remove', false);
      const { error } = await admin.storage.from(WORKSHOP_BUCKET).remove([path]);
      if (!error) return 'removed';
      if (isMissingStorageObjectError(error.message)) return 'absent';
      throw new WorkshopStorageError('supabase_legacy', 'remove', true);
    },
  };
}

// --- GCS (impersonated signer, regional endpoint only) ----------------------

const GCS_SOURCE_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];
const GCS_TARGET_SCOPES = ['https://www.googleapis.com/auth/devstorage.read_write'];

/** Storage client whose only identity is the impersonated signer SA on the regional endpoint. */
export function createSignerStorage(config: WorkshopGcsConfig, sourceClient: AuthClient): Storage {
  if (resolveRegionalEndpointHost(config.endpointHost) !== WORKSHOP_GCS_REGIONAL_HOST) {
    throw new WorkshopStorageConfigError('endpoint');
  }
  if (config.signerSa !== WORKSHOP_GCS_SIGNER_SA) throw new WorkshopStorageConfigError('signer');
  const authClient = new Impersonated({
    sourceClient,
    targetPrincipal: config.signerSa,
    targetScopes: GCS_TARGET_SCOPES,
    lifetime: 3600,
    delegates: [],
  });
  return new Storage({
    projectId: WORKSHOP_GCS_PROJECT,
    apiEndpoint: `https://${WORKSHOP_GCS_REGIONAL_HOST}`,
    useAuthWithCustomEndpoint: true,
    authClient,
  });
}

/** Fails closed unless the storage client's effective identity is exactly the signer SA. */
export async function assertEffectiveSigner(storage: Storage): Promise<void> {
  const creds = await storage.authClient.getCredentials();
  if (creds.client_email !== WORKSHOP_GCS_SIGNER_SA) {
    throw new WorkshopStorageError('gcs', 'sign', false);
  }
}

/** Every signed URL must be regional, signer-credentialed, object-bound and 300 s. */
export function assertSignedUrlShape(url: string, bucket: string, path: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WorkshopStorageError('gcs', 'sign', false);
  }
  const credential = parsed.searchParams.get('X-Goog-Credential') ?? '';
  const ok =
    parsed.protocol === 'https:' &&
    parsed.host === WORKSHOP_GCS_REGIONAL_HOST &&
    credential.startsWith(`${WORKSHOP_GCS_SIGNER_SA}/`) &&
    parsed.pathname === `/${bucket}/${path}` &&
    parsed.searchParams.get('X-Goog-Expires') === String(WORKSHOP_SIGNED_URL_TTL_SECONDS);
  if (!ok) throw new WorkshopStorageError('gcs', 'sign', false);
}

export function workshopUploadHeaders(contentType: string, maxBytes: number): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': WORKSHOP_MEDIA_CACHE_CONTROL,
    'x-goog-content-length-range': `1,${maxBytes}`,
    'x-goog-if-generation-match': '0',
  };
}

/** Copy-tool state from GCS custom metadata; null unless the origin marker is exact. */
export function legacyCopyStateOf(custom: unknown): WorkshopLegacyCopyState | null {
  const rec = asRecord(custom);
  if (!rec || rec[WORKSHOP_LEGACY_COPY_METADATA.origin] !== WORKSHOP_LEGACY_COPY_ORIGIN) return null;
  const state = rec[WORKSHOP_LEGACY_COPY_METADATA.state];
  return state === 'written' || state === 'verified' ? state : null;
}

function gcsErrorCode(error: unknown): number | null {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'number' ? code : null;
}

function gcsRetryable(error: unknown): boolean {
  const code = gcsErrorCode(error);
  return code == null || code === 408 || code === 429 || code >= 500;
}

export function createGcsWorkshopStore(
  config: WorkshopGcsConfig,
  options: { storageFactory?: () => Promise<Storage> } = {},
): WorkshopGcsObjectStore {
  const factory =
    options.storageFactory ??
    (async () => {
      const sourceClient = (await new GoogleAuth({ scopes: GCS_SOURCE_SCOPES }).getClient()) as AuthClient;
      return createSignerStorage(config, sourceClient);
    });
  let pending: Promise<Storage> | null = null;

  async function storage(): Promise<Storage> {
    if (!pending) {
      pending = (async () => {
        const client = await factory();
        await assertEffectiveSigner(client);
        return client;
      })();
      pending.catch(() => {
        pending = null;
      });
    }
    try {
      return await pending;
    } catch (error) {
      if (error instanceof WorkshopStorageError) throw error;
      throw new WorkshopStorageError('gcs', 'init', true);
    }
  }

  async function bucket() {
    return (await storage()).bucket(config.bucket);
  }

  return {
    name: 'gcs',
    async listObjects(scope) {
      if (!userScopeValid(scope)) throw new WorkshopStorageError('gcs', 'list', false);
      const prefixes =
        scope.kind === 'all' ? ['originals/', 'previews/'] : [`originals/${scope.uid}/`, `previews/${scope.uid}/`];
      const out: WorkshopListedObject[] = [];
      const b = await bucket();
      for (const prefix of prefixes) {
        try {
          const [files] = await b.getFiles({ prefix, autoPaginate: true });
          for (const file of files) {
            if (!isCanonicalWorkshopObjectPath(file.name)) continue;
            const created = Date.parse(String(file.metadata?.timeCreated ?? ''));
            out.push({ path: file.name, createdAtMs: Number.isFinite(created) ? created : null, store: 'gcs' });
          }
        } catch (error) {
          throw new WorkshopStorageError('gcs', 'list', gcsRetryable(error));
        }
      }
      return out;
    },
    async remove(path) {
      if (!isCanonicalWorkshopObjectPath(path)) throw new WorkshopStorageError('gcs', 'remove', false);
      const b = await bucket();
      try {
        await b.file(path).delete();
        return 'removed';
      } catch (error) {
        if (gcsErrorCode(error) === 404) return 'absent';
        throw new WorkshopStorageError('gcs', 'remove', gcsRetryable(error));
      }
    },
    async head(path) {
      if (!parseStrictCanonicalPath(path, 'canonical')) throw new WorkshopStorageError('gcs', 'head', false);
      const b = await bucket();
      try {
        const [meta] = await b.file(path).getMetadata();
        const created = Date.parse(String(meta.timeCreated ?? ''));
        const size = Number(meta.size);
        return {
          path,
          sizeBytes: Number.isFinite(size) ? size : -1,
          contentType: typeof meta.contentType === 'string' ? meta.contentType : null,
          cacheControl: typeof meta.cacheControl === 'string' ? meta.cacheControl : null,
          createdAtMs: Number.isFinite(created) ? created : null,
          legacyCopy: legacyCopyStateOf(meta.metadata),
        };
      } catch (error) {
        if (gcsErrorCode(error) === 404) return null;
        throw new WorkshopStorageError('gcs', 'head', gcsRetryable(error));
      }
    },
    async signUpload(path, contentType, maxBytes) {
      const parsed = parseStrictCanonicalPath(path, 'canonical');
      if (!parsed || !WORKSHOP_CONTENT_TYPES[parsed.kind].includes(contentType)) {
        throw new WorkshopStorageError('gcs', 'sign', false);
      }
      const client = await storage();
      await assertEffectiveSigner(client);
      const headers = workshopUploadHeaders(contentType, maxBytes);
      const expiresMs = Date.now() + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000;
      let url: string;
      try {
        [url] = await client.bucket(config.bucket).file(path).getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: expiresMs,
          contentType,
          extensionHeaders: {
            'cache-control': headers['Cache-Control'],
            'x-goog-content-length-range': headers['x-goog-content-length-range'],
            'x-goog-if-generation-match': headers['x-goog-if-generation-match'],
          },
        });
      } catch {
        throw new WorkshopStorageError('gcs', 'sign', true);
      }
      assertSignedUrlShape(url, config.bucket, path);
      return { url, method: 'PUT', headers, expiresAt: new Date(expiresMs).toISOString() };
    },
    async signRead(path) {
      if (!parseStrictCanonicalPath(path, 'canonical')) throw new WorkshopStorageError('gcs', 'sign', false);
      const client = await storage();
      await assertEffectiveSigner(client);
      const expiresMs = Date.now() + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000;
      let url: string;
      try {
        [url] = await client.bucket(config.bucket).file(path).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: expiresMs,
        });
      } catch {
        throw new WorkshopStorageError('gcs', 'sign', true);
      }
      assertSignedUrlShape(url, config.bucket, path);
      return { url, expiresAt: new Date(expiresMs).toISOString() };
    },
  };
}

// --- Dual-store adapter -----------------------------------------------------

export type WorkshopRemoveOutcome =
  | { ok: true }
  | { ok: false; store: WorkshopStoreName; retryable: boolean };

export type WorkshopStorageAdapter = {
  readonly gcs: WorkshopGcsObjectStore | null;
  readonly stores: readonly WorkshopObjectStore[];
  /** Union across stores; per path the newest createdAt wins so nothing is purged early. */
  listCustomerObjects(scope: WorkshopListScope): Promise<WorkshopListedObject[]>;
  /** Removes from every store. Not-found counts as removed; any other failure fails the path. */
  removePath(path: string): Promise<WorkshopRemoveOutcome>;
};

export function createWorkshopStorageAdapter(input: {
  legacy: WorkshopObjectStore | null;
  gcs: WorkshopGcsObjectStore | null;
}): WorkshopStorageAdapter {
  const stores = [input.gcs, input.legacy].filter((s): s is WorkshopObjectStore => s != null);
  return {
    gcs: input.gcs,
    stores,
    async listCustomerObjects(scope) {
      const merged = new Map<string, WorkshopListedObject>();
      for (const store of stores) {
        for (const object of await store.listObjects(scope)) {
          const prev = merged.get(object.path);
          if (!prev) {
            merged.set(object.path, object);
            continue;
          }
          const createdAtMs =
            prev.createdAtMs == null
              ? object.createdAtMs
              : object.createdAtMs == null
                ? prev.createdAtMs
                : Math.max(prev.createdAtMs, object.createdAtMs);
          merged.set(object.path, { ...prev, createdAtMs });
        }
      }
      return [...merged.values()];
    },
    async removePath(path) {
      for (const store of stores) {
        try {
          await store.remove(path);
        } catch (error) {
          const retryable = error instanceof WorkshopStorageError ? error.retryable : true;
          return { ok: false, store: store.name, retryable };
        }
      }
      return { ok: true };
    },
  };
}

const gcsStoreCache = new Map<string, WorkshopGcsObjectStore>();

/** GCS store for a ready config (shared per process). Null when GCS is not configured. */
export function workshopGcsStoreFor(result: WorkshopGcsConfigResult): WorkshopGcsObjectStore | null {
  if (result.state !== 'ready') return null;
  const key = `${result.config.bucket}|${result.config.endpointHost}|${result.config.signerSa}`;
  let store = gcsStoreCache.get(key);
  if (!store) {
    store = createGcsWorkshopStore(result.config);
    gcsStoreCache.set(key, store);
  }
  return store;
}

/**
 * Transition adapter: Supabase legacy always; GCS when configured.
 * Partial or non-approved GCS config fails closed (throws) instead of silently skipping GCS.
 */
export function defaultWorkshopStorageAdapter(
  admin: SupabaseClient,
  env: Record<string, string | undefined> = process.env,
): WorkshopStorageAdapter {
  const config = readWorkshopGcsConfig(env);
  if (config.state === 'invalid') throw new WorkshopStorageConfigError(config.reason);
  return createWorkshopStorageAdapter({
    legacy: createSupabaseLegacyWorkshopStore(admin),
    gcs: workshopGcsStoreFor(config),
  });
}

/** Bare canonical paths in a payload were written by the GCS flow and require the GCS store. */
export function collectGcsEraPaths(value: unknown, acc: Set<string> = new Set(), depth = 0): string[] {
  if (depth > 8 || value == null) return [...acc];
  if (typeof value === 'string') {
    const parsed = parseWorkshopRef(value);
    if (parsed?.source === 'canonical') acc.add(parsed.path);
    return [...acc];
  }
  if (Array.isArray(value)) {
    for (const item of value) collectGcsEraPaths(item, acc, depth + 1);
    return [...acc];
  }
  const rec = asRecord(value);
  if (!rec) return [...acc];
  for (const nested of Object.values(rec)) collectGcsEraPaths(nested, acc, depth + 1);
  return [...acc];
}

// ---------------------------------------------------------------------------
// Authorization (DB references are the authority, never path UID alone)
// ---------------------------------------------------------------------------

export type WorkshopMediaCaller = { userId: string; isAdmin: boolean };

export type WorkshopCustomerRows = {
  cart: { custom_image?: unknown; custom_config?: unknown }[];
  progress: { uploaded_image_url?: unknown }[];
  /** Orders with image_purged_at IS NULL. */
  orders: { ordered_items?: unknown }[];
  intents: { validated_snapshot?: unknown }[];
};

export interface WorkshopReferenceSource {
  customerRows(uid: string): Promise<WorkshopCustomerRows>;
  /** Unpurged orders owned by any of `uids`. */
  adminOrderRows(uids: string[]): Promise<{ ordered_items?: unknown }[]>;
}

export function createSupabaseWorkshopReferenceSource(admin: SupabaseClient): WorkshopReferenceSource {
  return {
    async customerRows(uid) {
      const [cart, progress, orders, intents] = await Promise.all([
        admin.from('cart_items').select('custom_image, custom_config').eq('user_id', uid),
        admin.from('user_progress').select('uploaded_image_url').eq('user_id', uid),
        admin.from('orders').select('ordered_items').eq('user_id', uid).is('image_purged_at', null),
        admin.from('payment_intents').select('validated_snapshot').eq('user_id', uid),
      ]);
      if (cart.error || progress.error || orders.error || intents.error) {
        throw new Error('workshop_reference_lookup_failed');
      }
      return {
        cart: cart.data ?? [],
        progress: progress.data ?? [],
        orders: orders.data ?? [],
        intents: intents.data ?? [],
      };
    },
    async adminOrderRows(uids) {
      if (uids.length === 0) return [];
      const { data, error } = await admin
        .from('orders')
        .select('ordered_items')
        .in('user_id', uids)
        .is('image_purged_at', null);
      if (error) throw new Error('workshop_reference_lookup_failed');
      return data ?? [];
    },
  };
}

/** path → store that the DB reference points at (canonical path = gcs, legacy URL = supabase_legacy). */
type ReferenceIndex = Map<string, WorkshopStoreName>;

function indexRef(index: ReferenceIndex, value: unknown, kind: WorkshopMediaKind | null, opts: WorkshopRefOptions): void {
  const parsed = parseWorkshopRef(value, opts);
  if (!parsed || (kind && parsed.kind !== kind)) return;
  const store: WorkshopStoreName = parsed.source === 'canonical' ? 'gcs' : 'supabase_legacy';
  if (index.get(parsed.path) !== 'gcs') index.set(parsed.path, store);
}

function indexOrderedItemPreviews(index: ReferenceIndex, orderedItems: unknown, opts: WorkshopRefOptions): void {
  if (!Array.isArray(orderedItems)) return;
  for (const item of orderedItems) {
    const rec = asRecord(item);
    if (!rec) continue;
    indexRef(index, rec.image, 'preview', opts);
    indexRef(index, rec.user_image_url, 'preview', opts);
    indexRef(index, asRecord(rec.custom_config)?.preview_image_url, 'preview', opts);
  }
}

function indexAllRefs(index: ReferenceIndex, value: unknown, opts: WorkshopRefOptions, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') return indexRef(index, value, null, opts);
  if (Array.isArray(value)) {
    for (const item of value) indexAllRefs(index, item, opts, depth + 1);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  for (const nested of Object.values(rec)) indexAllRefs(index, nested, opts, depth + 1);
}

export function buildCustomerReferenceIndex(
  rows: WorkshopCustomerRows,
  opts: WorkshopRefOptions,
): { previews: ReferenceIndex; originals: ReferenceIndex } {
  const previews: ReferenceIndex = new Map();
  const originals: ReferenceIndex = new Map();
  for (const row of rows.cart) {
    const cfg = asRecord(row.custom_config);
    indexRef(previews, row.custom_image, 'preview', opts);
    indexRef(previews, cfg?.preview_image_url, 'preview', opts);
    indexRef(originals, cfg?.original_image_url, 'original', opts);
  }
  for (const row of rows.progress) indexRef(originals, row.uploaded_image_url, 'original', opts);
  for (const row of rows.orders) indexOrderedItemPreviews(previews, row.ordered_items, opts);
  for (const row of rows.intents) {
    indexOrderedItemPreviews(previews, asRecord(row.validated_snapshot)?.ordered_items, opts);
  }
  return { previews, originals };
}

export function buildAdminReferenceIndex(rows: { ordered_items?: unknown }[], opts: WorkshopRefOptions): ReferenceIndex {
  const index: ReferenceIndex = new Map();
  for (const row of rows) indexAllRefs(index, row.ordered_items, opts);
  return index;
}

/** Every Workshop path still referenced by the caller's durable rows (discard protection). */
export function referencedPathsForProtection(rows: WorkshopCustomerRows): Set<string> {
  const out = new Set<string>();
  for (const value of [rows.cart, rows.progress, rows.orders, rows.intents]) {
    for (const path of collectWorkshopPaths(value)) out.add(path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Endpoint handlers (pure over injected deps; server.ts owns HTTP + auth)
// ---------------------------------------------------------------------------

export type WorkshopMediaDeps = {
  gcs: WorkshopGcsObjectStore | null;
  references: WorkshopReferenceSource;
  legacyHosts: readonly string[];
  /** Transition fallback for legacy refs without a verified GCS copy. Undefined = enabled. */
  legacyFallback?: boolean;
  now?: () => number;
};

export type WorkshopMediaResponse = { status: number; body: Record<string, unknown> };

const GCS_UNAVAILABLE: WorkshopMediaResponse = { status: 503, body: { error: 'workshop_gcs_not_configured' } };

function storageFailure(error: unknown, op: string): WorkshopMediaResponse {
  const retryable = error instanceof WorkshopStorageError ? error.retryable : true;
  console.error('[WORKSHOP_MEDIA]', {
    op,
    reason_class: error instanceof WorkshopStorageError ? error.message : 'internal_error',
    retryable,
  });
  return { status: retryable ? 503 : 500, body: { error: 'storage_unavailable', retryable } };
}

function parseKind(value: unknown): WorkshopMediaKind | null {
  return value === 'original' || value === 'preview' ? value : null;
}

export function validateSignUploadRequest(
  body: unknown,
): { ok: true; kind: WorkshopMediaKind; contentType: string; sizeBytes: number } | { ok: false; reason: string } {
  const rec = asRecord(body);
  if (!rec) return { ok: false, reason: 'invalid_request' };
  if ('path' in rec || 'uid' in rec || 'user_id' in rec) return { ok: false, reason: 'client_path_forbidden' };
  const kind = parseKind(rec.kind);
  if (!kind) return { ok: false, reason: 'invalid_kind' };
  const contentType = typeof rec.contentType === 'string' ? rec.contentType.trim().toLowerCase() : '';
  if (!WORKSHOP_CONTENT_TYPES[kind].includes(contentType)) return { ok: false, reason: 'unsupported_content_type' };
  const sizeBytes = rec.sizeBytes;
  if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    return { ok: false, reason: 'invalid_size' };
  }
  if (sizeBytes > WORKSHOP_UPLOAD_CAPS[kind]) return { ok: false, reason: 'too_large' };
  return { ok: true, kind, contentType, sizeBytes };
}

export async function handleSignUpload(
  deps: WorkshopMediaDeps,
  caller: WorkshopMediaCaller,
  body: unknown,
): Promise<WorkshopMediaResponse> {
  const request = validateSignUploadRequest(body);
  if (request.ok === false) return { status: request.reason === 'too_large' ? 413 : 400, body: { error: request.reason } };
  if (!deps.gcs) return GCS_UNAVAILABLE;
  const path = buildCanonicalWorkshopPath(request.kind, caller.userId.toLowerCase(), request.contentType);
  if (!path) return { status: 400, body: { error: 'invalid_caller' } };
  try {
    const upload = await deps.gcs.signUpload(path, request.contentType, WORKSHOP_UPLOAD_CAPS[request.kind]);
    return {
      status: 200,
      body: {
        path,
        kind: request.kind,
        upload: { url: upload.url, method: upload.method, headers: upload.headers },
        expiresAt: upload.expiresAt,
        maxBytes: WORKSHOP_UPLOAD_CAPS[request.kind],
      },
    };
  } catch (error) {
    return storageFailure(error, 'sign_upload');
  }
}

type SignReadItem =
  | { ref: string; ok: true; store: 'gcs'; src: string; expiresAt: string }
  | { ref: string; ok: true; store: 'supabase_legacy' }
  | { ref: string; ok: false; reason: 'invalid_ref' | 'not_authorized' | 'unavailable' };

/** A GCS object may stand in for a legacy ref only if the copy tool verified it and it is servable. */
export function isBridgeableLegacyCopy(parsed: ParsedWorkshopRef, meta: WorkshopObjectMetadata | null): boolean {
  if (!meta || meta.legacyCopy !== 'verified' || meta.path !== parsed.path) return false;
  return validateCommitMetadata(parsed, meta).ok === true;
}

type LegacyBridgeOutcome =
  | { kind: 'gcs'; src: string; expiresAt: string }
  | { kind: 'legacy' }
  | { kind: 'unavailable' }
  | { kind: 'failure'; response: WorkshopMediaResponse };

/**
 * Authorized legacy ref → verified GCS copy at the same canonical path, else the transition
 * fallback. Fallback off (post-cutover): absent/unverified → unavailable, GCS errors → 503.
 */
async function bridgeLegacyRead(
  gcs: WorkshopGcsObjectStore,
  parsed: ParsedWorkshopRef,
  fallback: boolean,
): Promise<LegacyBridgeOutcome> {
  let meta: WorkshopObjectMetadata | null;
  try {
    meta = await gcs.head(parsed.path);
  } catch (error) {
    if (!fallback) return { kind: 'failure', response: storageFailure(error, 'sign_read_legacy') };
    console.error('[WORKSHOP_MEDIA]', { op: 'sign_read_legacy', reason_class: 'legacy_fallback_gcs_error' });
    return { kind: 'legacy' };
  }
  if (!isBridgeableLegacyCopy(parsed, meta)) {
    if (meta) console.error('[WORKSHOP_MEDIA]', { op: 'sign_read_legacy', reason_class: 'legacy_copy_unverified' });
    return fallback ? { kind: 'legacy' } : { kind: 'unavailable' };
  }
  try {
    const signed = await gcs.signRead(parsed.path);
    return { kind: 'gcs', src: signed.url, expiresAt: signed.expiresAt };
  } catch (error) {
    if (!fallback) return { kind: 'failure', response: storageFailure(error, 'sign_read_legacy') };
    console.error('[WORKSHOP_MEDIA]', { op: 'sign_read_legacy', reason_class: 'legacy_fallback_sign_error' });
    return { kind: 'legacy' };
  }
}

export async function handleSignRead(
  deps: WorkshopMediaDeps,
  caller: WorkshopMediaCaller,
  body: unknown,
): Promise<WorkshopMediaResponse> {
  const refs = asRecord(body)?.refs;
  if (!Array.isArray(refs) || refs.length === 0) return { status: 400, body: { error: 'invalid_request' } };
  if (refs.length > WORKSHOP_SIGN_READ_BATCH_MAX) {
    return { status: 400, body: { error: 'too_many_refs', max: WORKSHOP_SIGN_READ_BATCH_MAX } };
  }
  if (!refs.every((ref) => typeof ref === 'string' && ref.length <= 2048)) {
    return { status: 400, body: { error: 'invalid_request' } };
  }
  const opts = { legacyHosts: deps.legacyHosts };
  const uid = caller.userId.toLowerCase();
  const parsed = (refs as string[]).map((ref) => ({ ref, parsed: parseWorkshopRef(ref, opts) }));

  let customer: ReturnType<typeof buildCustomerReferenceIndex>;
  let adminIndex: ReferenceIndex = new Map();
  try {
    customer = buildCustomerReferenceIndex(await deps.references.customerRows(uid), opts);
    if (caller.isAdmin) {
      const uids = [...new Set(parsed.map((p) => p.parsed?.uid).filter((v): v is string => !!v))];
      adminIndex = buildAdminReferenceIndex(await deps.references.adminOrderRows(uids), opts);
    }
  } catch {
    console.error('[WORKSHOP_MEDIA]', { op: 'sign_read', reason_class: 'db_error' });
    return { status: 503, body: { error: 'reference_lookup_failed' } };
  }

  const items: SignReadItem[] = [];
  for (const { ref, parsed: p } of parsed) {
    if (!p) {
      items.push({ ref, ok: false, reason: 'invalid_ref' });
      continue;
    }
    let store: WorkshopStoreName | undefined;
    if (p.uid === uid) store = (p.kind === 'preview' ? customer.previews : customer.originals).get(p.path);
    if (!store && caller.isAdmin) store = adminIndex.get(p.path);
    if (!store) {
      items.push({ ref, ok: false, reason: 'not_authorized' });
      continue;
    }
    if (store === 'supabase_legacy') {
      const fallback = deps.legacyFallback !== false;
      if (!deps.gcs) {
        if (!fallback) return GCS_UNAVAILABLE;
        items.push({ ref, ok: true, store });
        continue;
      }
      const bridged = await bridgeLegacyRead(deps.gcs, p, fallback);
      if (bridged.kind === 'failure') return bridged.response;
      if (bridged.kind === 'gcs') {
        items.push({ ref, ok: true, store: 'gcs', src: bridged.src, expiresAt: bridged.expiresAt });
      } else if (bridged.kind === 'legacy') {
        items.push({ ref, ok: true, store: 'supabase_legacy' });
      } else {
        items.push({ ref, ok: false, reason: 'unavailable' });
      }
      continue;
    }
    if (!deps.gcs) return GCS_UNAVAILABLE;
    try {
      const signed = await deps.gcs.signRead(p.path);
      items.push({ ref, ok: true, store: 'gcs', src: signed.url, expiresAt: signed.expiresAt });
    } catch (error) {
      return storageFailure(error, 'sign_read');
    }
  }
  return { status: 200, body: { items } };
}

function ownCanonicalPath(
  value: unknown,
  caller: WorkshopMediaCaller,
): { ok: true; parsed: ParsedWorkshopRef } | { ok: false; status: number; error: string } {
  const parsed = parseWorkshopRef(value);
  if (!parsed || parsed.source !== 'canonical') return { ok: false, status: 400, error: 'invalid_path' };
  if (parsed.uid !== caller.userId.toLowerCase()) return { ok: false, status: 403, error: 'not_owner' };
  return { ok: true, parsed };
}

export function validateCommitMetadata(
  parsed: ParsedWorkshopRef,
  meta: WorkshopObjectMetadata,
): { ok: true } | { ok: false; reason: string } {
  const expectedType = contentTypeForExtension(parsed.ext);
  if (!meta.contentType || !WORKSHOP_CONTENT_TYPES[parsed.kind].includes(meta.contentType)) {
    return { ok: false, reason: 'content_type_not_allowed' };
  }
  if (meta.contentType !== expectedType) return { ok: false, reason: 'content_type_extension_mismatch' };
  if (!Number.isSafeInteger(meta.sizeBytes) || meta.sizeBytes < 1) return { ok: false, reason: 'invalid_size' };
  if (meta.sizeBytes > WORKSHOP_UPLOAD_CAPS[parsed.kind]) return { ok: false, reason: 'too_large' };
  if (meta.cacheControl !== WORKSHOP_MEDIA_CACHE_CONTROL) return { ok: false, reason: 'cache_control_mismatch' };
  return { ok: true };
}

export async function handleCommit(
  deps: WorkshopMediaDeps,
  caller: WorkshopMediaCaller,
  body: unknown,
): Promise<WorkshopMediaResponse> {
  const rec = asRecord(body);
  const kind = parseKind(rec?.kind);
  if (!rec || !kind) return { status: 400, body: { error: 'invalid_request' } };
  const own = ownCanonicalPath(rec.path, caller);
  if (own.ok === false) return { status: own.status, body: { error: own.error } };
  if (own.parsed.kind !== kind) return { status: 400, body: { error: 'kind_mismatch' } };
  if (!deps.gcs) return GCS_UNAVAILABLE;
  let meta: WorkshopObjectMetadata | null;
  try {
    meta = await deps.gcs.head(own.parsed.path);
  } catch (error) {
    return storageFailure(error, 'commit');
  }
  if (!meta) return { status: 404, body: { error: 'not_found' } };
  const verdict = validateCommitMetadata(own.parsed, meta);
  if (verdict.ok === false) return { status: 422, body: { error: verdict.reason } };
  return {
    status: 200,
    body: { path: own.parsed.path, kind, contentType: meta.contentType, sizeBytes: meta.sizeBytes },
  };
}

export async function handleDiscard(
  deps: WorkshopMediaDeps,
  caller: WorkshopMediaCaller,
  body: unknown,
): Promise<WorkshopMediaResponse> {
  const own = ownCanonicalPath(asRecord(body)?.path, caller);
  if (own.ok === false) return { status: own.status, body: { error: own.error } };
  if (!deps.gcs) return GCS_UNAVAILABLE;
  const path = own.parsed.path;

  let referenced: Set<string>;
  try {
    referenced = referencedPathsForProtection(await deps.references.customerRows(caller.userId.toLowerCase()));
  } catch {
    console.error('[WORKSHOP_MEDIA]', { op: 'discard', reason_class: 'db_error' });
    return { status: 503, body: { error: 'reference_lookup_failed' } };
  }
  if (referenced.has(path)) return { status: 409, body: { error: 'protected_reference' } };

  try {
    const meta = await deps.gcs.head(path);
    if (!meta) return { status: 200, body: { path, discarded: false, already_absent: true } };
    if (meta.legacyCopy) return { status: 409, body: { error: 'not_discardable' } };
    const now = deps.now ? deps.now() : Date.now();
    if (meta.createdAtMs == null || now - meta.createdAtMs > WORKSHOP_DISCARD_MAX_AGE_MS) {
      return { status: 409, body: { error: 'not_discardable' } };
    }
    const outcome = await deps.gcs.remove(path);
    return { status: 200, body: { path, discarded: outcome === 'removed', already_absent: outcome === 'absent' } };
  } catch (error) {
    return storageFailure(error, 'discard');
  }
}
