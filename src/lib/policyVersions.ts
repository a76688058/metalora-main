/**
 * NEW4-5 — Authoritative policy version identifiers.
 * Version id = the policy text actually shown. Do not bump unless that text changes.
 */

export const POLICY_TYPES = {
  terms: 'terms',
  privacy: 'privacy',
  workshopCustom: 'workshop_custom',
  checkoutReturnRefund: 'checkout_return_refund',
} as const;

export type PolicyType = (typeof POLICY_TYPES)[keyof typeof POLICY_TYPES];

/** Current Terms text: Metalora Terms v26.10.06 */
export const TERMS_POLICY_VERSION = 'terms_v26.10.06';

/** Current Privacy text: Metalora Legal v26.09.19 (NEW4-4 has not rewritten it) */
export const PRIVACY_POLICY_VERSION = 'privacy_v26.09.19';

/** Current Workshop agreement text: Metalora Consent v26.10.06 */
export const WORKSHOP_CUSTOM_POLICY_VERSION = 'workshop_custom_v26.10.06';

/** Known historic Workshop row in user_agreements. Do not mint as a new acceptance. */
export const LEGACY_WORKSHOP_AGREEMENT_VERSION = 'ML_Legal_v260325';

/** Current refund/return policy text: Metalora Brand Policy v26.10.06 */
export const CHECKOUT_RETURN_REFUND_POLICY_VERSION = 'checkout_return_refund_v26.10.06';

export const POLICY_VERSIONS = {
  terms: TERMS_POLICY_VERSION,
  privacy: PRIVACY_POLICY_VERSION,
  workshop_custom: WORKSHOP_CUSTOM_POLICY_VERSION,
  checkout_return_refund: CHECKOUT_RETURN_REFUND_POLICY_VERSION,
} as const;

export function checkoutPolicyVersionSnapshot(includesWorkshop: boolean): Record<string, string> {
  const versions: Record<string, string> = {
    terms: POLICY_VERSIONS.terms,
    privacy: POLICY_VERSIONS.privacy,
    checkout_return_refund: POLICY_VERSIONS.checkout_return_refund,
  };
  if (includesWorkshop) {
    versions.workshop_custom = POLICY_VERSIONS.workshop_custom;
  }
  return versions;
}
