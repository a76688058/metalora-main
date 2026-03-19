import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qifloweuwyhvukabgnoa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpZmxvd2V1d3lodnVrYWJnbm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTYwMTIsImV4cCI6MjA4ODc3MjAxMn0.OtYeV7UatathlEP4wTlTeUHSRFnK5ndrXw7Er8Eutpo';

// Custom fetch with interceptor for 401/403 errors
const createCustomFetch = (getClient: () => any) => {
  return async (url: RequestInfo | URL, options?: RequestInit) => {
    let response = await fetch(url, options);
    
    // If JWT expired or unauthorized
    if (response.status === 401 || response.status === 403) {
      try {
        const client = getClient();
        if (client) {
          // Attempt to refresh the session silently
          const { data, error } = await client.auth.refreshSession();
          
          if (data?.session && !error) {
            // Clone options and update the Authorization header with the new token
            const newOptions = { ...options };
            newOptions.headers = new Headers(options?.headers);
            newOptions.headers.set('Authorization', `Bearer ${data.session.access_token}`);
            
            // Retry the API call exactly once
            response = await fetch(url, newOptions);
          }
        }
      } catch (refreshError) {
        console.error('Auto-refresh failed during API call:', refreshError);
      }
    }
    
    return response;
  };
};

// Standard client for regular users
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'metalora-user-token', // Explicit key for users
  },
  global: {
    fetch: createCustomFetch(() => supabase),
    headers: { 'x-client-info': 'metalora-checkout' },
  },
});

// Dedicated client for admins to allow simultaneous sessions
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'metalora-admin-token', // Separate key for admins
  },
  global: {
    fetch: createCustomFetch(() => supabaseAdmin),
    headers: { 'x-client-info': 'metalora-checkout' },
  },
});

// Public client for fetching data without waiting for auth
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
