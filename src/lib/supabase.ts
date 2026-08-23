import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qifloweuwyhvukabgnoa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpZmxvd2V1d3lodnVrYWJnbm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTYwMTIsImV4cCI6MjA4ODc3MjAxMn0.OtYeV7UatathlEP4wTlTeUHSRFnK5ndrXw7Er8Eutpo';

const REQUEST_TIMEOUT_MS = 15000;

const isAbortError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
};

const isCallerAborted = (signal?: AbortSignal) => !!signal?.aborted;

/** Merge caller abort with an internal timeout abort without leaking listeners/timers. */
const fetchWithTimeout = async (
  url: RequestInfo | URL,
  options: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> => {
  const callerSignal = options?.signal ?? undefined;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  let mergedSignal: AbortSignal = timeoutController.signal;
  let removeCallerListener: (() => void) | undefined;
  let anyAbortHandler: (() => void) | undefined;

  try {
    if (callerSignal) {
      if (callerSignal.aborted) {
        throw callerSignal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      }

      const AbortSignalAny = (AbortSignal as typeof AbortSignal & {
        any?: (signals: AbortSignal[]) => AbortSignal;
      }).any;

      if (typeof AbortSignalAny === 'function') {
        mergedSignal = AbortSignalAny([callerSignal, timeoutController.signal]);
      } else {
        const mergedController = new AbortController();
        mergedSignal = mergedController.signal;

        const abortFromCaller = () => {
          mergedController.abort(callerSignal.reason);
        };
        const abortFromTimeout = () => {
          mergedController.abort(timeoutController.signal.reason);
        };

        callerSignal.addEventListener('abort', abortFromCaller);
        timeoutController.signal.addEventListener('abort', abortFromTimeout);
        removeCallerListener = () => callerSignal.removeEventListener('abort', abortFromCaller);
        anyAbortHandler = () => timeoutController.signal.removeEventListener('abort', abortFromTimeout);

        if (timeoutController.signal.aborted) {
          abortFromTimeout();
        }
      }
    }

    return await fetch(url, {
      ...options,
      signal: mergedSignal,
    });
  } finally {
    clearTimeout(timeoutId);
    removeCallerListener?.();
    anyAbortHandler?.();
  }
};

/**
 * Supabase REST fetch policy:
 * - Storage: no timeout/retry (uploads can be slow)
 * - GET: up to 1 retry on network failure or internal timeout only (max 2 HTTP)
 * - non-GET: no automatic retry
 * - never rewrite URLs / never force cache-busters
 * - HTTP Responses (including 4xx/5xx) are never retried
 */
const aggressiveFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  const urlString = typeof url === 'string' ? url : url.toString();

  // Storage operations (especially uploads) can take a long time.
  if (urlString.includes('/storage/')) {
    return fetch(url, options);
  }

  const isGet = !options?.method || options.method.toUpperCase() === 'GET';
  const callerSignal = options?.signal;

  try {
    return await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS);
  } catch (error) {
    // Writes: never auto-retry (duplicate insert/update risk)
    if (!isGet) {
      throw error;
    }

    // Caller cancelled the request — do not retry
    if (isCallerAborted(callerSignal)) {
      throw error;
    }

    // Network failures typically throw TypeError; internal timeouts throw AbortError
    const isNetworkFailure = error instanceof TypeError;
    const isInternalTimeout = isAbortError(error);

    if (!isNetworkFailure && !isInternalTimeout) {
      throw error;
    }

    // One GET retry only; same URL, no cache-buster
    return await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS);
  }
};

// Standard client for regular users
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'metalora-auth-token', // Unified key for both
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    headers: { 'x-client-info': 'metalora-checkout' },
    fetch: aggressiveFetch,
  },
});

// Public client for fetching data without waiting for auth
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: aggressiveFetch,
  },
});
