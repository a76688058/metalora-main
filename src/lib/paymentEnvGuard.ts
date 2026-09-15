import {
  isProductionSupabaseHost,
  supabaseHostFromUrl,
} from "./supabaseHosts";

export const PAYMENT_TEST_ENV_NAME = "payment-test";

export const PAYMENT_TEST_REQUIRED_ENV_NAMES = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOSS_SECRET_KEY",
] as const;

export const PAYMENT_TEST_CROSS_WRITE_ERROR =
  "결제 테스트 환경이 프로덕션 데이터베이스를 가리키고 있습니다.";

export function isTossTestSecret(secret: string): boolean {
  const trimmed = secret.trim();
  return trimmed.startsWith("test_sk_") || trimmed.startsWith("test_gsk_");
}

export function missingPaymentTestEnv(
  env: Record<string, string | undefined>,
): string[] {
  return PAYMENT_TEST_REQUIRED_ENV_NAMES.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

export function refuseTossTestToProductionSupabase(input: {
  tossSecretKey: string;
  supabaseUrl: string;
}): { refuse: true; reason: "toss_test_to_production" } | { refuse: false } {
  const host = supabaseHostFromUrl(input.supabaseUrl);
  if (isTossTestSecret(input.tossSecretKey) && isProductionSupabaseHost(host)) {
    return { refuse: true, reason: "toss_test_to_production" };
  }
  return { refuse: false };
}

export function refusePaymentTestProductionHost(input: {
  metaloraEnv: string;
  supabaseUrl: string;
}): { refuse: true; reason: "payment_test_production_host" } | { refuse: false } {
  if (input.metaloraEnv !== PAYMENT_TEST_ENV_NAME) {
    return { refuse: false };
  }
  const host = supabaseHostFromUrl(input.supabaseUrl);
  if (!host || isProductionSupabaseHost(host)) {
    return { refuse: true, reason: "payment_test_production_host" };
  }
  return { refuse: false };
}
