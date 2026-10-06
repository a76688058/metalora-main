# NEW4-5 — Versioned consent ledger

Status: **READY FOR A6 SECURITY / CONSENT REVIEW**

Date: 2026-10-06

Decision: Reuse and extend existing `public.user_agreements` as the single versioned consent ledger. Do not create a second competing table. Production was not mutated. Payment remains frozen until NEW7.

## Architecture

Chosen model: **extend `user_agreements`**.

Reason: Workshop already stored WHO + version + WHEN there (`ML_Legal_v260325`). Adding `policy_type` plus a server-side insert RPC is the smallest coherent model. A second generic table would duplicate evidence.

## Schema

Table: `public.user_agreements`

Key fields:

- `user_id`
- `policy_type` (`terms` | `privacy` | `workshop_custom` | `checkout_return_refund`)
- `agreement_version`
- `agreed_at` (server `now()`)
- `source` (optional)
- `order_number` (optional)
- `ip_address` (nullable; historic client IPs kept, new rows do not require IP)

Uniqueness: `(user_id, policy_type, agreement_version)`

Existing unique `(user_id, agreement_version)` is preserved.

RLS: authenticated SELECT own rows only. No authenticated INSERT/UPDATE/DELETE. Inserts go through `record_policy_consent` (SECURITY DEFINER). Authenticated callers can only record for `auth.uid()`. `service_role` may pass `p_user_id`. `agreed_at` is not client-settable.

Migration: `supabase/migrations/20261006220000_new4_5_consent_ledger.sql`  
Production applied: **NO**

## Policy versions

These ids match the live policy titles. Privacy was not rewritten in NEW4-1/2/3.

- Terms: `terms_v26.10.06`
- Privacy: `privacy_v26.09.19`
- Workshop: `workshop_custom_v26.10.06` (current). Historic known row: `ML_Legal_v260325`
- Checkout/return: `checkout_return_refund_v26.10.06`

Authoritative TS source: `src/lib/policyVersions.ts` (RPC allowlists the same current pairings).

## Membership

New genuine signup / social activation / member enroll (not `already_complete`):

- Keep writing `profiles.agreed_to_terms_at` / `agreed_to_privacy_at` / `agreed_to_cookie_at` as before
- Additionally insert ledger rows for **Terms** and **Privacy** current versions via service-role RPC
- Cookie/GA is **not** written to the ledger

Legacy timestamps: remain unversioned evidence on `profiles`. They were **not** assigned a policy version.

Retroactive version fabrication: **NO**

Re-consent UX for legacy members who only have timestamps: **not in this ticket**. Later genuine re-consent would create a new ledger row.

A0: AuthContext was not edited. Membership writes are in `passwordAuthHandlers` / `socialAuthHandlers`.

## Workshop

Existing `ML_Legal_v260325` rows: preserved and classified `policy_type = workshop_custom` because that version is the known historic Workshop agreement. Legacy evidence remains historical. It does **not** satisfy the current Workshop gate.

Current Workshop access requires evidence for `policy_type = workshop_custom` AND `agreement_version = workshop_custom_v26.10.06`.

New Workshop acceptance: current `workshop_custom_v26.10.06` via RPC after the user sees and explicitly accepts `policies.agreement`. Overlay/CopyrightPage do not treat a legacy-only row as sufficient. No silent re-consent. No automatic insertion from the older Workshop agreement.

Once `workshop_custom_v26.10.06` is recorded, the current gate is satisfied. Catalog customers are not required to accept Workshop custom restrictions.

## NEW4-5B

Status: **CLOSED** (local source only; no production migration/deploy)

- Legacy Workshop evidence remains historical
- Current version required for current Workshop access
- Legacy-only user must re-consent to `workshop_custom_v26.10.06`
- Displayed agreement now matches v26.10.06 (`policies.agreement`)
- Unimplemented retention / deletion-duration promises removed from the Workshop agreement
- Production migration/deploy: **NO**

## Checkout

Cart consent payload includes `policy_versions`. Public payment freeze is unchanged, so the public storefront still cannot call prepare/Toss.

Server prepare stamps authoritative `policy_versions` when a prepare does occur. Finalize records `checkout_return_refund` on the ledger with `order_number`. That write cannot run from the frozen public CTA.

Production payment enabled: **NO**

## Cookie / GA

Optional and separate: **YES**

`localStorage cookieConsent` remains the GA/analytics choice. It is not a required ledger type.

Signup still has a live “쿠키 정책” checkbox that stamps `agreed_to_cookie_at` only. That is not converted into a mandatory versioned ledger agreement and is not GA enablement.

## Do Not Do (this ticket)

- Do not apply this migration to production
- Do not backfill Terms/Privacy versions from `agreed_to_*_at`
- Do not activate payment
- Do not rewrite privacy/processor/overseas copy
- Do not implement purge, withdrawal, origin, or consent-ledger product UI beyond evidence writes

## Follow-ups

- Apply migration in the dedicated environment ticket (not production from NEW4-5)
- Optional later re-consent for legacy unversioned members
- NEW7: public checkout will exercise the prepared finalize ledger write
- NEW4-4 privacy rewrite must bump `privacy_v26.09.19` in TS + RPC together
- NEW4-5C: membership fail-closed (A3)

## Ownership

A3 Cart/Workshop UX + A6 schema/server/auth handlers.

## Relevant Files

- `supabase/migrations/20261006220000_new4_5_consent_ledger.sql`
- `src/lib/policyVersions.ts`
- `src/lib/consentLedger.ts`
- `src/lib/passwordAuthHandlers.ts`
- `src/lib/socialAuthHandlers.ts`
- `src/components/Workshop/CopyrightPage.tsx`
- `src/components/WorkshopOverlay.tsx`
- `src/components/Cart.tsx`
- `server.ts`
