/**
 * NEW4-4D-4 — Workshop media resolver core (browser-safe; no Supabase / Node imports).
 *
 * Resolves Workshop refs through POST /api/workshop-media/sign-read:
 *   - canonical GCS path  → short-lived signed GET on the Seoul regional endpoint
 *   - legacy Supabase URL → the exact input URL, only when the server answers `supabase_legacy`
 *
 * The server is the security authority. Client parsing only decides what is worth sending.
 * Signed URLs live in this module's memory only and are never logged or persisted.
 * App code should import from `./workshopMedia` (default instance wired to the Supabase session).
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STRICT_ORIGINAL_RE = new RegExp(`^originals/(${UUID})/(${UUID})\\.(jpg|jpeg|png|webp)$`);
const STRICT_PREVIEW_RE = new RegExp(`^previews/(${UUID})/(${UUID})\\.(jpg)$`);

const LEGACY_MARKERS = [
  '/storage/v1/object/public/workshop/',
  '/storage/v1/object/sign/workshop/',
  '/storage/v1/object/authenticated/workshop/',
] as const;
const LEGACY_SIGN_MARKER = '/storage/v1/object/sign/workshop/';

export const WORKSHOP_MEDIA_SIGN_READ_PATH = '/api/workshop-media/sign-read';
export const WORKSHOP_MEDIA_BATCH_MAX = 20;
export const WORKSHOP_MEDIA_SIGNED_TTL_MS = 300_000;
export const WORKSHOP_MEDIA_REFRESH_RATIO = 0.8;
export const WORKSHOP_MEDIA_GCS_HOST = 'storage.asia-northeast3.rep.googleapis.com';
const REQUEST_TIMEOUT_MS = 15_000;

export type WorkshopMediaKind = 'original' | 'preview';
export type WorkshopMediaRefSource = 'canonical' | 'legacy_supabase';
export type ParsedWorkshopMediaRef = { path: string; kind: WorkshopMediaKind; source: WorkshopMediaRefSource };

function parseCanonical(path: string, source: WorkshopMediaRefSource): ParsedWorkshopMediaRef | null {
  if (STRICT_ORIGINAL_RE.test(path)) return { path, kind: 'original', source };
  if (STRICT_PREVIEW_RE.test(path)) return { path, kind: 'preview', source };
  return null;
}

/** Same acceptance rules as server `parseWorkshopRef` (parity checked by the NEW4-4D-4 verifier). */
export function parseWorkshopMediaRef(
  value: unknown,
  legacyHosts: readonly string[] = [],
): ParsedWorkshopMediaRef | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  if (/[%\\\s#]/.test(raw) || raw.includes('..')) return null;

  if (!raw.includes('://')) {
    if (raw.includes('?') || raw.includes('//') || raw.includes(':')) return null;
    return parseCanonical(raw, 'canonical');
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
  const hosts = legacyHosts.map((host) => host.toLowerCase());
  if (!hosts.includes(url.hostname)) return null;

  for (const marker of LEGACY_MARKERS) {
    if (!url.pathname.startsWith(marker)) continue;
    if (marker === LEGACY_SIGN_MARKER) {
      const keys = [...url.searchParams.keys()];
      if (keys.length !== 1 || keys[0] !== 'token') return null;
    } else if (url.search) {
      return null;
    }
    return parseCanonical(url.pathname.slice(marker.length), 'legacy_supabase');
  }
  return null;
}

/**
 * True for a canonical Workshop object path, also when written with a query, leading slash or
 * `workshop/` bucket prefix. Such values must never become a public Storage URL.
 */
export function isCanonicalWorkshopPathLike(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  let path = value.trim().split(/[?#]/)[0] ?? '';
  path = path.replace(/^\/+/, '');
  if (path.startsWith('workshop/')) path = path.slice('workshop/'.length);
  return parseCanonical(path, 'canonical') !== null;
}

export type WorkshopMediaMode = 'customer' | 'admin';
export type WorkshopMediaStore = 'gcs' | 'supabase_legacy';

export type WorkshopResolvedMedia = {
  /** The ref exactly as sent to sign-read (trimmed input). */
  ref: string;
  src: string;
  store: WorkshopMediaStore;
  /** Local epoch ms after which a GCS `src` must not be used. Null for legacy URLs. */
  expiresAt: number | null;
};

export type WorkshopMediaFailure =
  | 'invalid_ref'
  | 'not_authorized'
  | 'legacy_url_required'
  | 'unauthenticated'
  | 'unavailable'
  | 'malformed_response';

export type WorkshopMediaSession = { userId: string; accessToken: string };

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type WorkshopMediaResolverDeps = {
  getSession: () => Promise<WorkshopMediaSession | null>;
  fetch: FetchLike;
  legacyHosts: readonly string[];
  now?: () => number;
  endpoint?: string;
};

export type ResolveWorkshopMediaOptions = {
  /** Request context only. The server decides privilege from the caller's profile. */
  mode?: WorkshopMediaMode;
};

type CacheEntry = {
  ref: string;
  media: WorkshopResolvedMedia;
  refreshAt: number;
  validUntil: number;
  attempt: number;
};

type Outcome = { ok: true; entry: CacheEntry } | { ok: false; reason: WorkshopMediaFailure };

/** Server/network trouble, not a denial: a still-valid cached URL may be kept. */
function isTransient(outcome: Outcome): boolean {
  return outcome.ok === false && (outcome.reason === 'unavailable' || outcome.reason === 'malformed_response');
}

type PendingItem = { ref: string; attempt: number; settle: (outcome: Outcome) => void };
type PendingGroup = { session: WorkshopMediaSession; items: PendingItem[] };

function isRegionalSignedSrc(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.host === WORKSHOP_MEDIA_GCS_HOST && !url.username && !url.password;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export type WorkshopMediaResolver = ReturnType<typeof createWorkshopMediaResolver>;

export function createWorkshopMediaResolver(deps: WorkshopMediaResolverDeps) {
  const now = deps.now ?? Date.now;
  const endpoint = deps.endpoint ?? WORKSHOP_MEDIA_SIGN_READ_PATH;
  const legacyHosts = deps.legacyHosts.map((host) => host.toLowerCase());
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<Outcome>>();
  const pending = new Map<string, PendingGroup>();
  let flushScheduled = false;
  let generation = 0;

  const parse = (value: unknown) => parseWorkshopMediaRef(value, legacyHosts);
  const cacheKey = (userId: string, mode: WorkshopMediaMode, ref: string) => `${userId}\n${mode}\n${ref}`;
  const fail = (reason: WorkshopMediaFailure): Outcome => ({ ok: false, reason });

  function itemOutcome(ref: string, item: unknown, startedAt: number, attempt: number): Outcome {
    const rec = asRecord(item);
    if (!rec || rec.ref !== ref) return fail('malformed_response');
    if (rec.ok === false) {
      if (rec.reason === 'invalid_ref') return fail('invalid_ref');
      if (rec.reason === 'not_authorized') return fail('not_authorized');
      return fail('malformed_response');
    }
    if (rec.ok !== true) return fail('malformed_response');

    if (rec.store === 'gcs') {
      const expiresAtMs = typeof rec.expiresAt === 'string' ? Date.parse(rec.expiresAt) : Number.NaN;
      if (!isRegionalSignedSrc(rec.src) || !Number.isFinite(expiresAtMs)) return fail('malformed_response');
      // Lifetime is measured on the local clock from request start: never longer than the
      // server TTL, never trusting a skewed absolute clock for extra time.
      const lifetime = Math.min(WORKSHOP_MEDIA_SIGNED_TTL_MS, expiresAtMs - startedAt);
      const validUntil = lifetime > 0 ? startedAt + lifetime : startedAt;
      return {
        ok: true,
        entry: {
          ref,
          media: { ref, src: rec.src, store: 'gcs', expiresAt: validUntil },
          refreshAt: lifetime > 0 ? startedAt + lifetime * WORKSHOP_MEDIA_REFRESH_RATIO : startedAt,
          validUntil,
          attempt,
        },
      };
    }

    if (rec.store === 'supabase_legacy') {
      // Only an input that already is a trusted legacy URL can be rendered; never mint one.
      if (parse(ref)?.source !== 'legacy_supabase') return fail('legacy_url_required');
      return {
        ok: true,
        entry: {
          ref,
          media: { ref, src: ref, store: 'supabase_legacy', expiresAt: null },
          refreshAt: startedAt + WORKSHOP_MEDIA_SIGNED_TTL_MS * WORKSHOP_MEDIA_REFRESH_RATIO,
          validUntil: startedAt + WORKSHOP_MEDIA_SIGNED_TTL_MS,
          attempt,
        },
      };
    }
    return fail('malformed_response');
  }

  async function sendBatch(session: WorkshopMediaSession, items: PendingItem[]): Promise<Outcome[]> {
    const refs = items.map((item) => item.ref);
    const all = (reason: WorkshopMediaFailure) => refs.map(() => fail(reason));
    const startedAt = now();
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      const timeout =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          : undefined;
      res = await deps.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ refs }),
        cache: 'no-store',
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        signal: timeout,
      });
    } catch {
      return all('unavailable');
    }
    if (res.status === 401) return all('unauthenticated');
    if (res.status === 403) return all('not_authorized');
    if (!res.ok) return all('unavailable');

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return all('malformed_response');
    }
    const responseItems = asRecord(body)?.items;
    if (!Array.isArray(responseItems) || responseItems.length !== refs.length) return all('malformed_response');
    return refs.map((ref, i) => itemOutcome(ref, responseItems[i], startedAt, items[i].attempt));
  }

  async function flush(): Promise<void> {
    flushScheduled = false;
    const groups = [...pending.values()];
    pending.clear();
    const batches: Promise<void>[] = [];
    for (const group of groups) {
      for (let i = 0; i < group.items.length; i += WORKSHOP_MEDIA_BATCH_MAX) {
        const chunk = group.items.slice(i, i + WORKSHOP_MEDIA_BATCH_MAX);
        batches.push(
          sendBatch(group.session, chunk).then(
            (outcomes) => chunk.forEach((item, j) => item.settle(outcomes[j])),
            () => chunk.forEach((item) => item.settle(fail('unavailable'))),
          ),
        );
      }
    }
    await Promise.all(batches);
  }

  function load(
    key: string,
    ref: string,
    session: WorkshopMediaSession,
    mode: WorkshopMediaMode,
    attempt: number,
  ): Promise<Outcome> {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const startedGeneration = generation;
    const groupKey = `${session.userId}\n${mode}`;
    const promise = new Promise<Outcome>((settle) => {
      const group = pending.get(groupKey) ?? { session, items: [] };
      group.items.push({ ref, attempt, settle });
      pending.set(groupKey, group);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(() => void flush());
      }
    }).then((outcome) => {
      if (generation === startedGeneration) {
        if (outcome.ok === true) cache.set(key, outcome.entry);
        else if (!isTransient(outcome)) cache.delete(key);
      }
      return outcome;
    });
    inFlight.set(key, promise);
    void promise.finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
    return promise;
  }

  function prune(at: number): void {
    for (const [key, entry] of cache) if (at >= entry.validUntil) cache.delete(key);
  }

  async function currentSession(): Promise<WorkshopMediaSession | null> {
    try {
      const session = await deps.getSession();
      return session?.userId && session.accessToken ? session : null;
    } catch {
      return null;
    }
  }

  /**
   * Resolves many refs at once. The map is keyed by each input string exactly as given and
   * contains only usable results; invalid, unauthorized or failed refs are simply absent.
   */
  async function resolve(
    refs: Iterable<unknown>,
    options: ResolveWorkshopMediaOptions = {},
  ): Promise<Map<string, WorkshopResolvedMedia>> {
    const mode: WorkshopMediaMode = options.mode === 'admin' ? 'admin' : 'customer';
    const out = new Map<string, WorkshopResolvedMedia>();
    const inputsByRef = new Map<string, string[]>();
    for (const input of refs) {
      if (typeof input !== 'string' || !parse(input)) continue;
      const ref = input.trim();
      const inputs = inputsByRef.get(ref) ?? [];
      inputs.push(input);
      inputsByRef.set(ref, inputs);
    }
    if (inputsByRef.size === 0) return out;

    const session = await currentSession();
    if (!session) return out;

    const at = now();
    prune(at);
    await Promise.all(
      [...inputsByRef.keys()].map(async (ref) => {
        const key = cacheKey(session.userId, mode, ref);
        const cached = cache.get(key);
        let media: WorkshopResolvedMedia | null = null;
        if (cached && at < cached.refreshAt) {
          media = cached.media;
        } else {
          const outcome = await load(key, ref, session, mode, 0);
          if (outcome.ok === true) media = outcome.entry.media;
          else if (cached && now() < cached.validUntil && isTransient(outcome)) media = cached.media;
        }
        if (media) for (const input of inputsByRef.get(ref) ?? []) out.set(input, media);
      }),
    );
    return out;
  }

  async function resolveOne(
    ref: unknown,
    options: ResolveWorkshopMediaOptions = {},
  ): Promise<WorkshopResolvedMedia | null> {
    if (typeof ref !== 'string') return null;
    return (await resolve([ref], options)).get(ref) ?? null;
  }

  /**
   * Call once when an <img>/texture fails to load `failedSrc`. Re-signs a GCS ref at most once
   * per issued URL chain; legacy URLs and an already-retried URL return null (show placeholder).
   */
  async function retryAfterLoadError(
    ref: unknown,
    failedSrc: string,
    options: ResolveWorkshopMediaOptions = {},
  ): Promise<WorkshopResolvedMedia | null> {
    if (typeof ref !== 'string' || !parse(ref)) return null;
    const trimmed = ref.trim();
    const mode: WorkshopMediaMode = options.mode === 'admin' ? 'admin' : 'customer';
    const session = await currentSession();
    if (!session) return null;
    const key = cacheKey(session.userId, mode, trimmed);
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.media.src !== failedSrc) return now() < entry.validUntil ? entry.media : null;
    cache.delete(key);
    if (entry.media.store !== 'gcs' || entry.attempt >= 1) return null;
    const outcome = await load(key, trimmed, session, mode, 1);
    return outcome.ok ? outcome.entry.media : null;
  }

  /** Drops cached results for one ref (all modes / sessions). */
  function invalidate(ref: unknown): void {
    if (typeof ref !== 'string') return;
    const trimmed = ref.trim();
    for (const [key, entry] of cache) if (entry.ref === trimmed) cache.delete(key);
  }

  /** Drops every cached result; responses still in flight are not stored. */
  function clear(): void {
    generation += 1;
    cache.clear();
  }

  return {
    resolve,
    resolveOne,
    retryAfterLoadError,
    invalidate,
    clear,
    normalize: (value: unknown) => parse(value)?.path ?? null,
    isCanonical: (value: unknown) => parse(value)?.source === 'canonical',
    isLegacy: (value: unknown) => parse(value)?.source === 'legacy_supabase',
    cacheSize: () => cache.size,
  };
}
