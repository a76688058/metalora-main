/**
 * NEW4-4D-4 — Shared Workshop media resolver (app entry point).
 *
 * Consumers render Workshop images only through this module, never through getFullImageUrl /
 * getOptimizedImageUrl / deriveVariantUrl. Consumer contract:
 *   - <img> / texture loads: referrerPolicy="no-referrer"; canvas/WebGL use crossOrigin="anonymous"
 *     (bucket CORS allows GET from https://metalora.art).
 *   - Never store `src` (state persisted across sessions, storage, DB, analytics). Re-resolve instead.
 *   - On load error call retryWorkshopMediaAfterLoadError once; null means show a placeholder.
 */
import { supabase } from './supabase';
import { PRODUCTION_SUPABASE_HOST, supabaseHostFromUrl } from './supabaseHosts';
import {
  createWorkshopMediaResolver,
  type ResolveWorkshopMediaOptions,
  type WorkshopResolvedMedia,
} from './workshopMediaCore';

export {
  WORKSHOP_MEDIA_BATCH_MAX,
  WORKSHOP_MEDIA_REFRESH_RATIO,
  WORKSHOP_MEDIA_SIGNED_TTL_MS,
  isCanonicalWorkshopPathLike,
  type ResolveWorkshopMediaOptions,
  type WorkshopMediaMode,
  type WorkshopMediaStore,
  type WorkshopResolvedMedia,
} from './workshopMediaCore';

/** Same project selection as `./supabase`; the server trusts only its own project host. */
function legacyWorkshopHosts(): string[] {
  const paymentTest =
    import.meta.env.MODE === 'payment-test' || import.meta.env.VITE_METALORA_ENV === 'payment-test';
  if (!paymentTest) return [PRODUCTION_SUPABASE_HOST];
  const host = supabaseHostFromUrl(import.meta.env.VITE_SUPABASE_URL ?? '');
  return host ? [host] : [];
}

const resolver = createWorkshopMediaResolver({
  legacyHosts: legacyWorkshopHosts(),
  fetch: (input, init) => fetch(input, init),
  getSession: async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    return session?.user?.id && session.access_token
      ? { userId: session.user.id, accessToken: session.access_token }
      : null;
  },
});

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') resolver.clear();
});

/** Canonical object path for a trusted Workshop ref (canonical path or legacy Supabase URL). */
export const normalizeWorkshopMediaRef = (value: unknown): string | null => resolver.normalize(value);
export const isCanonicalWorkshopRef = (value: unknown): boolean => resolver.isCanonical(value);
export const isLegacyWorkshopRef = (value: unknown): boolean => resolver.isLegacy(value);

export const resolveWorkshopMedia = (
  refs: Iterable<unknown>,
  options?: ResolveWorkshopMediaOptions,
): Promise<Map<string, WorkshopResolvedMedia>> => resolver.resolve(refs, options);

export const resolveWorkshopMediaSrc = (
  ref: unknown,
  options?: ResolveWorkshopMediaOptions,
): Promise<WorkshopResolvedMedia | null> => resolver.resolveOne(ref, options);

export const retryWorkshopMediaAfterLoadError = (
  ref: unknown,
  failedSrc: string,
  options?: ResolveWorkshopMediaOptions,
): Promise<WorkshopResolvedMedia | null> => resolver.retryAfterLoadError(ref, failedSrc, options);

export const invalidateWorkshopMedia = (ref: unknown): void => resolver.invalidate(ref);
export const clearWorkshopMediaCache = (): void => resolver.clear();
