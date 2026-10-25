/**
 * Public Toss client-key selection.
 *
 * Vite inlines `import.meta.env.VITE_*` when the client bundle is built or served.
 * The activation image build may mount BuildKit secret `toss_live_client_key`
 * and export `VITE_TOSS_LIVE_CLIENT_KEY` only for that Vite command.
 * `scripts/deploy-candidate.ps1` does not pass the secret. A Cloud Run runtime
 * variable does not change the built bundle.
 *
 * Absence fails closed. A test key is never used in its place.
 * Screening and payment-test read only VITE_TOSS_TEST_CLIENT_KEY.
 */

export type TossClientKeyPurpose = 'production-checkout' | 'payment-test' | 'screening';

export type TossClientKeyFailure = 'absent' | 'test_key_refused' | 'live_key_refused' | 'invalid';

export type TossClientKeyDecision =
  | { ok: true; key: string }
  | { ok: false; reason: TossClientKeyFailure };

const TEST_KEY = /^test_ck_[A-Za-z0-9]+$/;
const LIVE_KEY = /^live_ck_[A-Za-z0-9]+$/;
const TEST_MARKER = /test_(ck|sk|gsk)/;
const LIVE_MARKER = /live_(ck|sk|gsk)/;

export function resolveTossClientKey(input: {
  purpose: TossClientKeyPurpose;
  raw: string | null | undefined;
}): TossClientKeyDecision {
  const trimmed = typeof input.raw === 'string' ? input.raw.trim() : '';
  if (!trimmed) return { ok: false, reason: 'absent' };

  if (input.purpose === 'production-checkout') {
    if (TEST_MARKER.test(trimmed) || trimmed.startsWith('test_ck_')) {
      return { ok: false, reason: 'test_key_refused' };
    }
    if (!LIVE_KEY.test(trimmed)) return { ok: false, reason: 'invalid' };
    return { ok: true, key: trimmed };
  }

  if (LIVE_MARKER.test(trimmed) || trimmed.startsWith('live_ck_')) {
    return { ok: false, reason: 'live_key_refused' };
  }
  if (!TEST_KEY.test(trimmed)) return { ok: false, reason: 'invalid' };
  return { ok: true, key: trimmed };
}
