import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qifloweuwyhvukabgnoa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpZmxvd2V1d3lodnVrYWJnbm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTYwMTIsImV4cCI6MjA4ODc3MjAxMn0.OtYeV7UatathlEP4wTlTeUHSRFnK5ndrXw7Er8Eutpo';

// Aggressive fetch to bypass the 21-second OS TCP timeout on stale connections
const aggressiveFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  const urlString = typeof url === 'string' ? url : url.toString();
  
  // Storage operations (especially uploads) can take a long time.
  // We bypass the aggressive timeout and retry logic for them.
  if (urlString.includes('/storage/')) {
    return fetch(url, options);
  }

  const isGet = !options?.method || options.method.toUpperCase() === 'GET';
  const maxRetries = isGet ? 3 : 1;
  let attempt = 0;

  while (attempt <= maxRetries) {
    // Very short timeouts to quickly kill stale TCP connections
    // 2.5s for first attempt, 4s for subsequent attempts
    // For non-GET requests, give it a bit more time (5s) to avoid aborting valid mutations
    const timeoutMs = isGet ? (attempt === 0 ? 2500 : 4000) : 5000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Cache-buster to force browser to re-evaluate connection
      const fetchUrl = attempt > 0 && isGet
        ? `${urlString}${urlString.includes('?') ? '&' : '?'}t=${Date.now()}_${attempt}` 
        : url;

      const response = await fetch(fetchUrl, {
        ...options,
        signal: controller.signal,
        // Disable keepalive on retries to force a fresh TCP connection if possible
        keepalive: attempt === 0 ? options?.keepalive : false,
        cache: attempt > 0 && isGet ? 'no-store' : options?.cache,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      attempt++;
      
      if (attempt > maxRetries) {
        console.error(`Fetch failed after ${maxRetries} retries for ${url}:`, error);
        throw error;
      }
      console.warn(`Fetch attempt ${attempt} failed (likely stale connection). Retrying aggressively...`);
    }
  }
  throw new Error('Fetch failed');
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
