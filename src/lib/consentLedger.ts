import type { SupabaseClient } from '@supabase/supabase-js';
import {
  POLICY_TYPES,
  POLICY_VERSIONS,
  type PolicyType,
} from './policyVersions';

export type ConsentSource =
  | 'membership_signup'
  | 'membership_social'
  | 'membership_enroll'
  | 'workshop'
  | 'checkout_finalize';

type LedgerClient = Pick<SupabaseClient, 'rpc'>;

export async function recordPolicyConsent(
  client: LedgerClient,
  input: {
    policyType: PolicyType;
    policyVersion: string;
    source: ConsentSource;
    orderNumber?: string;
    /** Required when called with the service-role client (auth.uid() is null). */
    userId?: string;
  },
): Promise<boolean> {
  const { data, error } = await client.rpc('record_policy_consent', {
    p_policy_type: input.policyType,
    p_policy_version: input.policyVersion,
    p_source: input.source,
    p_order_number: input.orderNumber ?? null,
    p_user_id: input.userId ?? null,
  });
  if (error) {
    console.error('[CONSENT_LEDGER] record_policy_consent failed', {
      policyType: input.policyType,
      source: input.source,
      error: error.message,
    });
    return false;
  }
  const rpc = (data ?? {}) as { ok?: boolean };
  if (rpc.ok !== true) {
    console.error('[CONSENT_LEDGER] record_policy_consent rejected', {
      policyType: input.policyType,
      source: input.source,
      data,
    });
    return false;
  }
  return true;
}

/**
 * Server-side membership Terms + Privacy. Does not record cookie/GA.
 * Success only when both current required versions persist. Partial write is failure.
 */
export async function recordMembershipPolicyConsents(
  admin: LedgerClient,
  userId: string,
  source: Extract<ConsentSource, 'membership_signup' | 'membership_social' | 'membership_enroll'>,
): Promise<boolean> {
  const termsOk = await recordPolicyConsent(admin, {
    userId,
    policyType: POLICY_TYPES.terms,
    policyVersion: POLICY_VERSIONS.terms,
    source,
  });
  const privacyOk = await recordPolicyConsent(admin, {
    userId,
    policyType: POLICY_TYPES.privacy,
    policyVersion: POLICY_VERSIONS.privacy,
    source,
  });
  return termsOk && privacyOk;
}

export async function recordCheckoutReturnRefundConsent(
  admin: LedgerClient,
  userId: string,
  orderNumber: string,
): Promise<void> {
  await recordPolicyConsent(admin, {
    userId,
    policyType: POLICY_TYPES.checkoutReturnRefund,
    policyVersion: POLICY_VERSIONS.checkout_return_refund,
    source: 'checkout_finalize',
    orderNumber,
  });
}
