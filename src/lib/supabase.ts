import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qifloweuwyhvukabgnoa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpZmxvd2V1d3lodnVrYWJnbm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTYwMTIsImV4cCI6MjA4ODc3MjAxMn0.OtYeV7UatathlEP4wTlTeUHSRFnK5ndrXw7Er8Eutpo';

// Custom fetch with timeout to prevent hanging requests
const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
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
    lockSession: true,
  },
  global: {
    headers: { 'x-client-info': 'metalora-checkout' },
    fetch: customFetch,
  },
});

// Dedicated client for admins (now sharing the same session)
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: 'metalora-admin-auth-token', // Different key for admin
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    lockSession: true,
  },
  global: {
    headers: { 'x-client-info': 'metalora-checkout' },
    fetch: customFetch,
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
    fetch: customFetch,
  },
});
