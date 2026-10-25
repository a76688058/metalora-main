/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_METALORA_ENV?: string;
  readonly VITE_GA4_MEASUREMENT_ID?: string;
  readonly VITE_ANALYTICS_DEBUG?: string;
  readonly VITE_TOSS_TEST_CLIENT_KEY?: string;
  readonly VITE_TOSS_LIVE_CLIENT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
