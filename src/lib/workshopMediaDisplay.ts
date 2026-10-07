/**
 * NEW4-4D-6 — Workshop media at Cart / admin display boundaries (browser-safe, no Supabase import).
 *
 * Durable values (cart rows, order items) keep the stored ref. A canonical ref resolves through the
 * shared resolver to a temporary src held only in this controller (view state, cleared on dispose);
 * the resolver owns caching. A legacy Supabase Workshop URL renders exactly as stored. Anything else
 * renders the caller's placeholder: the input is never used as a src and no public URL is built.
 */
import { PRODUCTION_SUPABASE_HOST } from './supabaseHosts';
import type {
  ResolveWorkshopMediaOptions,
  WorkshopMediaMode,
  WorkshopResolvedMedia,
} from './workshopMediaCore';

const LEGACY_PUBLIC_PREFIX = '/storage/v1/object/public/workshop/';
const MIN_REFRESH_DELAY_MS = 5_000;
const REFRESH_FRACTION = 0.85;

export type WorkshopDisplayApi = {
  isCanonical(value: unknown): boolean;
  isLegacy(value: unknown): boolean;
  resolve(
    refs: Iterable<unknown>,
    options: ResolveWorkshopMediaOptions,
  ): Promise<Map<string, WorkshopResolvedMedia>>;
  retryAfterLoadError(
    ref: unknown,
    failedSrc: string,
    options: ResolveWorkshopMediaOptions,
  ): Promise<WorkshopResolvedMedia | null>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type WorkshopDisplayRef =
  | { kind: 'canonical'; ref: string }
  | { kind: 'legacy'; src: string }
  | { kind: 'none' };

export type WorkshopDisplayState = { status: 'loading' | 'ready' | 'failed'; src: string | null };

/**
 * Public Workshop URL on the production project written before UUID file names. Display only:
 * rendered as stored, never signed, never treated as a trusted ref.
 */
function isLegacyPublicWorkshopUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.hostname === PRODUCTION_SUPABASE_HOST &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    url.pathname.startsWith(LEGACY_PUBLIC_PREFIX) &&
    url.pathname.length > LEGACY_PUBLIC_PREFIX.length
  );
}

export function workshopDisplayRef(value: unknown, api: WorkshopDisplayApi): WorkshopDisplayRef {
  if (typeof value !== 'string') return { kind: 'none' };
  const trimmed = value.trim();
  if (!trimmed) return { kind: 'none' };
  if (api.isCanonical(trimmed)) return { kind: 'canonical', ref: trimmed };
  if (api.isLegacy(trimmed) || isLegacyPublicWorkshopUrl(trimmed)) return { kind: 'legacy', src: trimmed };
  return { kind: 'none' };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const CUSTOM_CONFIG_MEDIA_FIELDS = ['preview_image_url', 'original_image_url'] as const;
const isBlank = (value: unknown) => value == null || value === '';

/**
 * Cart writes accept Workshop media only as durable refs (canonical path or trusted legacy
 * Supabase URL). Signed, regional, blob:, data: and other URLs are refused, never stored.
 */
export function hasOnlyDurableWorkshopRefs(
  customImage: unknown,
  customConfig: unknown,
  normalize: (value: unknown) => string | null,
): boolean {
  if (!isBlank(customImage) && normalize(customImage) === null) return false;
  const config = asRecord(customConfig);
  return CUSTOM_CONFIG_MEDIA_FIELDS.every((field) => isBlank(config[field]) || normalize(config[field]) !== null);
}

/**
 * Thumbnail ref for a Workshop order item (`orders.ordered_items[]`, read only). Preview first;
 * canonical originals are skipped: admin thumbnails never sign an original.
 */
export function workshopOrderItemThumbRef(raw: unknown, api: WorkshopDisplayApi): string | null {
  const item = asRecord(raw);
  const config = asRecord(item.custom_config);
  const candidates = [
    config.preview_image_url,
    item.image,
    item.user_image_url,
    item.front_image,
    item.custom_image,
    item.preview_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const trimmed = candidate.trim();
    if (api.isCanonical(trimmed) && trimmed.startsWith('originals/')) continue;
    return trimmed;
  }
  return null;
}

/** Sorted, de-duplicated canonical refs among `values` (stable key for effects). */
export function canonicalWorkshopRefs(values: Iterable<unknown>, api: WorkshopDisplayApi): string[] {
  const refs = new Set<string>();
  for (const value of values) {
    const display = workshopDisplayRef(value, api);
    if (display.kind === 'canonical') refs.add(display.ref);
  }
  return [...refs].sort();
}

export type WorkshopMediaDisplay = ReturnType<typeof createWorkshopMediaDisplay>;

export function createWorkshopMediaDisplay(
  api: WorkshopDisplayApi,
  mode: WorkshopMediaMode,
  onChange: () => void,
) {
  const now = api.now ?? Date.now;
  const setTimer = api.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = api.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const options: ResolveWorkshopMediaOptions = { mode };

  let refs: string[] = [];
  let key = '';
  let generation = 0;
  let timer: unknown = null;
  const srcs = new Map<string, string>();
  const failed = new Set<string>();
  const brokenLegacy = new Set<string>();
  const retriedSrcs = new Set<string>();

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  async function run(gen: number): Promise<void> {
    const targets = refs;
    const resolved = await api.resolve(targets, options).catch(() => new Map<string, WorkshopResolvedMedia>());
    if (gen !== generation) return;
    let soonest: number | null = null;
    for (const ref of targets) {
      const media = resolved.get(ref);
      if (media) {
        srcs.set(ref, media.src);
        failed.delete(ref);
        if (media.expiresAt !== null) soonest = soonest === null ? media.expiresAt : Math.min(soonest, media.expiresAt);
      } else {
        srcs.delete(ref);
        failed.add(ref);
      }
    }
    stopTimer();
    if (soonest !== null) {
      const delay = Math.max(MIN_REFRESH_DELAY_MS, (soonest - now()) * REFRESH_FRACTION);
      timer = setTimer(() => {
        timer = null;
        if (gen === generation) void run(gen);
      }, delay);
    }
    onChange();
  }

  /** Sets the refs currently on screen; resolves them as one batch (resolver chunks by 20). */
  function setRefs(values: Iterable<unknown>): Promise<void> {
    const next = canonicalWorkshopRefs(values, api);
    const nextKey = next.join('\n');
    if (nextKey === key) return Promise.resolve();
    key = nextKey;
    generation += 1;
    stopTimer();
    const keep = new Set(next);
    for (const ref of [...srcs.keys()]) if (!keep.has(ref)) srcs.delete(ref);
    for (const ref of [...failed]) if (!keep.has(ref)) failed.delete(ref);
    refs = next;
    if (refs.length === 0) {
      onChange();
      return Promise.resolve();
    }
    return run(generation);
  }

  function get(value: unknown): WorkshopDisplayState {
    const display = workshopDisplayRef(value, api);
    if (display.kind === 'legacy') {
      return brokenLegacy.has(display.src) ? { status: 'failed', src: null } : { status: 'ready', src: display.src };
    }
    if (display.kind === 'none') return { status: 'failed', src: null };
    const src = srcs.get(display.ref);
    if (src) return { status: 'ready', src };
    if (failed.has(display.ref) || !refs.includes(display.ref)) return { status: 'failed', src: null };
    return { status: 'loading', src: null };
  }

  /** Call from <img onError>. One re-sign per issued src; then the placeholder. */
  async function onLoadError(value: unknown, failedSrc: string): Promise<void> {
    const display = workshopDisplayRef(value, api);
    if (display.kind === 'legacy') {
      brokenLegacy.add(display.src);
      onChange();
      return;
    }
    if (display.kind !== 'canonical' || srcs.get(display.ref) !== failedSrc) return;
    const gen = generation;
    if (retriedSrcs.has(failedSrc)) {
      srcs.delete(display.ref);
      failed.add(display.ref);
      onChange();
      return;
    }
    retriedSrcs.add(failedSrc);
    const media = await api.retryAfterLoadError(display.ref, failedSrc, options).catch(() => null);
    if (gen !== generation || srcs.get(display.ref) !== failedSrc) return;
    if (media && media.src !== failedSrc) {
      srcs.set(display.ref, media.src);
      failed.delete(display.ref);
    } else {
      srcs.delete(display.ref);
      failed.add(display.ref);
    }
    onChange();
  }

  /** Drops every temporary src and pending refresh. A later setRefs starts over. */
  function dispose(): void {
    generation += 1;
    stopTimer();
    refs = [];
    key = '';
    srcs.clear();
    failed.clear();
    brokenLegacy.clear();
    retriedSrcs.clear();
  }

  return { setRefs, get, onLoadError, dispose, hasPendingRefresh: () => timer !== null };
}
