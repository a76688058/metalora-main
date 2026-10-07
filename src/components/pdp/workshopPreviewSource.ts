import type { WorkshopResolvedMedia } from '../../lib/workshopMedia';

export type WorkshopPreviewState = { ref: string; src: string | null; status: 'loading' | 'ready' | 'failed' };

export type WorkshopPreviewDeps = {
  normalize: (ref: unknown) => string | null;
  resolve: (ref: string) => Promise<WorkshopResolvedMedia | null>;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  now: () => number;
};

const MIN_REFRESH_MS = 5_000;
const REFRESH_FRACTION = 0.85;

/** Empty ref: nothing to show. Canonical or strict legacy ref: resolve. Anything else: no src. */
export function initialWorkshopPreviewState(
  ref: string,
  normalize: WorkshopPreviewDeps['normalize'],
): WorkshopPreviewState {
  if (!ref) return { ref, src: null, status: 'ready' };
  return { ref, src: null, status: normalize(ref) ? 'loading' : 'failed' };
}

/**
 * Resolves a workshop-single preview ref through sign-read and re-resolves before the returned
 * src expires. The server picks the source; the src is only ever passed to `emit`.
 * Returns a stop function.
 */
export function startWorkshopPreview(
  ref: string,
  deps: WorkshopPreviewDeps,
  emit: (state: WorkshopPreviewState) => void,
): () => void {
  let current = initialWorkshopPreviewState(ref, deps.normalize);
  emit(current);
  if (current.status !== 'loading') return () => undefined;

  let cancelled = false;
  let timer: unknown;
  const run = async () => {
    timer = undefined;
    const media = await deps.resolve(ref).catch(() => null);
    if (cancelled) return;
    if (!media) {
      if (!current.src) {
        current = { ref, src: null, status: 'failed' };
        emit(current);
      }
      return;
    }
    if (current.src !== media.src || current.status !== 'ready') {
      current = { ref, src: media.src, status: 'ready' };
      emit(current);
    }
    if (media.expiresAt !== null) {
      const delay = Math.max(MIN_REFRESH_MS, (media.expiresAt - deps.now()) * REFRESH_FRACTION);
      timer = deps.setTimer(() => void run(), delay);
    }
  };
  void run();

  return () => {
    cancelled = true;
    if (timer !== undefined) deps.clearTimer(timer);
  };
}
