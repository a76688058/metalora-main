# NEW 2F — Auth Expansion (sub-contract)

Status: **OPEN** (sub-workstream of NEW 2F)

Date: 2026-09-23

Decision: Recovery, verified phone OTP, Google/Kakao/Naver, identity reconciliation, withdrawal, marketing consent, and membership consent history are **LAUNCH-REQUIRED**. They are **not** optional auth expansion.

Parent: `docs/decisions/NEW-2F_account-profile-auth-ux.md`. This is **not** a new master launch stage. NEW 2F remains **OPEN**. NEW 3 is **NOT OPENED**.

This note does **not** authorize application source, DB mutation, provider enablement, env change, or deploy.

---

## Status

| Item | Value |
|------|--------|
| NEW 2F | **OPEN** |
| Auth expansion | **OPEN** — launch-required |
| Visual/chrome 2F | **UNCOMMITTED**; USER visual review **not** complete |
| A6 RED | **REQUIRED** |
| Implementation | **SLICED** — 0b / A / B / C1 / C2 / D / E |
| Production providers / unique verified-phone | **GATED** |
| Next RED action | **A6 — SLICE 0b** if production read-only SQL is available; else **A6 — SLICE A PAYMENT-TEST FOUNDATION PLAN** |

Evidence: A0 PRE-AUDIT COMPLETE. A6 AUTH ARCHITECTURE AUDIT COMPLETE. A6 ARCHITECTURE CLARIFICATION COMPLETE. Architecture blockers for this contract text: **NONE**.

---

## Historical exclusion — SUPERSEDED

The original NEW 2F open contract excluded SNS signup/login, password reset/recovery, phone verification, and account linking as **OPTIONAL AUTH EXPANSION**.

That exclusion is **SUPERSEDED**. Those items are **LAUNCH-REQUIRED**. Do not treat the old OUT-OF-SCOPE list as current.

---

## Launch-required scope

- existing username + password login
- existing signup
- logout
- ID recovery
- password recovery/reset
- logged-in password change
- verified phone ownership via OTP
- phone as primary recovery channel
- Google login/signup
- Kakao login/signup
- Naver login/signup
- automatic **internal** username generation for social-first users
- duplicate-account prevention
- controlled social identity reconciliation
- phone change with OTP verification
- member withdrawal
- marketing consent management
- policy/consent version history
- simple re-consent for material changes
- login/recovery abuse protection
- account/security UX inside Profile (`계정 및 보안`)

---

## Out for launch

- Apple login
- MFA / 2FA
- new-device login notifications
- all-device session-management UI
- permanent CAPTCHA
- separate `/account` route
- recovery email
- consumer-facing SNS connect/disconnect management screen

Do not reintroduce these as launch blockers.

---

## Canonical identity

Canonical customer: `profiles.id` = `auth.users.id`.

Password identity: virtual `{username}@metalora.me` continues to support username/password login. It is **not** a recovery inbox.

Do **not** use provider email as a silent person-merge key.

Primary reconciliation credential: **VERIFIED NORMALIZED MOBILE PHONE**.

Social identities may join the same canonical customer only under the reconciliation lifecycle below.

Phone is **NOT** a GoTrue phone-login identity at launch.

---

## Verified account phone vs contact phone — LOCKED

### A. Account / recovery phone

Conceptual fields (names may match A6): `verified_phone_e164`, `verified_phone_hmac`, `phone_verified_at`.

Authority: A6 trusted OTP / change-phone path **only**.

- normalized
- OTP-proven
- recovery-authoritative
- SNS-reconciliation-authoritative
- cannot be set by checkout / profile free-text writes
- unique enforcement **only after** production inventory gate (Slice 0b)

`verified_phone_hmac` remains reserved across withdrawn accounts until NEW 4 defines re-registration policy.

### B. Contact / shipping phone

Existing `profiles.phone_number` remains unverified contact/shipping information.

May be written by Profile shipping UX, Checkout, ShippingModal, and authorized order/CS flows.

It must **NEVER** become verified merely because it was entered or used in an order.

`orders.shipping_phone` remains order-specific.

Existing `profiles.phone_number` values are **UNVERIFIED**. Do **not** auto-promote them. A customer becomes recovery-capable only after OTP enrollment.

---

## Slice 0b — production inventory gate

Production live inventory has **NOT** been completed (production DB live SQL credentials were unavailable to A6). Never invent production counts.

**SLICE 0b — PRODUCTION READ-ONLY PHONE / USERNAME INVENTORY** must **PASS** before:

- production verified-phone unique index/constraint
- any production backfill that assumes one-phone-one-customer

0b does **not** block: this contract, additive schema design, payment-test OTP, recovery/social/consent architecture.

---

## Phone OTP — LOCKED

**CUSTOM TRUSTED SERVER / RPC OTP.** Not Supabase phone Auth as a second customer login.

Purposes: `signup` / `recovery` / `change_phone` / `identity_link`.

- normalized KR mobile
- hashed/HMAC OTP at rest
- server pepper
- TTL approximately 3–5 minutes
- one-time use
- resend cooldown
- attempt limit
- purpose binding
- per-phone and per-IP limits
- generic anonymous responses
- SMS credentials server-side only

Vendor TBD. Architecture remains SMS-vendor agnostic.

---

## Recovery UX — LOCKED

Login entry: `아이디/비밀번호를 모르겠어요`. One unified flow.

phone → OTP ownership proof → account recovery capability.

**Before successful OTP:** do **not** reveal whether phone/account exists.

**After successful OTP:**

- password/legacy username member: reveal recoverable username and allow password reset
- social-first member: do **not** expose opaque generated internal username as customer identity

Recovery email: **OUT FOR LAUNCH**.

Login/recovery must avoid enumeration. Do not expose `존재하지 않는 아이디입니다` as an anonymous distinction. Preferred generic credential failure: `아이디 또는 비밀번호를 확인해주세요.` Exact Korean copy is A3 UX.

---

## Password reset — LOCKED

Virtual email mailbox is **not** a recovery inbox.

Flow: recovery OTP → short-lived one-time recovery ticket → trusted server password update → **global session revocation** → normal login again.

Service role: **SERVER ONLY**. Never client-exposed.

### Ticket state machine — LOCKED

States: `issued` → `claimed` → `completed` | `failed` | `indeterminate` (or equivalent terminal non-reusable state). Plus `expired` before claim.

- `issued` → atomic DB claim via conditional UPDATE
- only one caller can claim
- ticket immediately becomes non-reusable
- SUCCESS: `claimed` → `completed`
- KNOWN FAILURE: `claimed` → `failed`
- UNKNOWN / crash after claim: `claimed` → `indeterminate`
- **Never reopen a claimed ticket**
- User recovery from failed/indeterminate: new OTP → new ticket → new password reset
- TTL applies before claim
- Plain ticket/OTP must not be stored

---

## Password change / set — LOCKED

Username/password users: logged-in change requires reauthentication. Default: current password → new password.

Social-first user with no password: verified-phone step-up → **SET** password.

After password change/reset/set: revoke old sessions and require fresh login unless later A6 testing proves another safe contract.

---

## Social providers

Required: **Google**, **Kakao**, **Naver**. Not required: Apple.

Rollout: **PAYMENT-TEST FIRST**. No production provider enablement without a later explicit gate. Do not enable providers merely because this contract is approved.

- Google: native Supabase provider
- Kakao: native Supabase provider
- Naver: Supabase custom OAuth2 (`custom:naver`) if provider mapping proves compatible. Fallback only if necessary: server-managed OAuth / userinfo proxy. **Separate checkpoint from Google/Kakao.**

Backend identity linking: **REQUIRED**. Consumer connect/disconnect UI: **NOT REQUIRED FOR LAUNCH**.

---

## Social-first lifecycle — LOCKED

OAuth may create a pending auth user/profile. A pending social profile with NULL `user_custom_id` is **NOT** a usable customer.

Pending user cannot pay or enter normal member flows until:

- METALORA phone OTP
- required policy consent
- internal username generation

Pending-social users must have bounded lifetime / cleanup. Suggested TTL: **approximately 24 hours** (A6 may confirm).

### Internal username — LOCKED

Generate automatically. Suggested format: `ml` + random lowercase alphanumeric token. Must satisfy existing username uniqueness rules.

**THE GENERATED USERNAME IS INTERNAL ONLY.** Do not display opaque `ml…` as the customer’s normal account identity.

Legacy/password users retain their chosen visible username. Do **not** backfill admin NULL username rows.

---

## Social reconciliation — LOCKED

Do not silently merge by email. Provider email is only a hint.

- Existing member + new SNS: authenticated canonical member → phone OTP `identity_link` proof → link provider identity to same auth user
- Social first: pending social auth user → new verified phone → consent → internal username → activate same user
- Verified phone already belongs to another **active** member: **DO NOT** merge automatically. Require login to existing member then link from canonical account
- Provider identity already attached elsewhere: **REJECT**. Never steal/reassign provider identity in the normal customer flow

---

## Withdrawal — LOCKED

Withdrawal is **NOT** raw auth-user deletion. Keep stable canonical IDs for commerce/legal records.

Model: `profiles.account_status = withdrawn` (or equivalent).

Stack:

- mark profile withdrawn
- scrub active PII
- preserve stable profile/auth identity as required
- clear plaintext `verified_phone_e164`
- retain `verified_phone_hmac` reservation
- globally revoke sessions
- randomize password as defense in depth
- ban/disable Supabase Auth user
- retain social identities bound to tombstone (**do not unlink** — otherwise the provider subject could create a new auth user)
- block recovery, callback reactivation, payment/member gate
- remove disposable cart/progress/pending OTP/social data
- storage deletion/retention according to class

Immediate same-phone registration after withdrawal: **BLOCKED**. Final wait/re-registration policy: **NEW 4**.

### Withdrawn gates

Every relevant authority must reject withdrawn users. At minimum: AuthContext usable-member gate; payment/member server authorization; OAuth callback; OTP/recovery completion; password reset/set; SNS completion.

Auth ban is **not** the only guard. `account_status` is also authoritative.

---

## Session

Current persisted Supabase session is adequate. Do **not** add `로그인 유지` at launch unless implementation later changes persistence semantics.

---

## Rate limit / abuse — LOCKED

Do **not** implement account-global “10 failures → victim account locked.”

USER intent: approximately **10 failures / 5 minutes** on **`(IP + username)`**, plus broader per-IP caps.

OTP: per-phone send cap; per-IP send cap; resend delay; verification attempt cap; cost-control daily threshold.

Permanent CAPTCHA: **NO**. Adaptive CAPTCHA is future mitigation only if abuse appears.

---

## Consent current truth — preserve

Do not collapse these four concepts:

| Store | Meaning |
|------|---------|
| `profiles.agreed_to_terms_at` / `privacy` / `cookie` | Latest-state timestamps. **Not** a versioned legal ledger. Preserve. |
| `public.user_agreements` | Custom copyright/legal acceptance. Historical rows must remain. Do **not** repurpose/destructively rewrite. |
| CookieBanner browser consent | Separate from membership legal consent. |
| Checkout/payment snapshots | Order-time consents, not membership consent. |

### New membership consent ledger — LOCKED

**CREATE A NEW APPEND-ONLY MEMBERSHIP CONSENT LEDGER.** Do **not** silently convert `user_agreements` into the generic membership ledger.

Conceptual fields: `id`, `user_id`, `document_type`, `version`, `accepted_at`, `source`, `context`, optional `policy_hash`, server-attested metadata where justified, `created_at`.

No client UPDATE/DELETE. Do not fabricate historical version meaning for old records.

### `user_agreements` hardening

A6 found unsafe over-grants. Future A6 slice must review/harden anon UPDATE / DELETE / TRUNCATE without destroying existing rows. CASCADE evidence-loss must be addressed in withdrawal-safe design. **No schema change in this docs ticket.**

### Marketing consent — LOCKED

Optional. Default **OFF**. Separate from required account consents. Persist grant/revoke history append-only. UX: simple toggle in `계정 및 보안`. Legal wording/channels/retention: **NEW 4**. Cookie analytics is **not** marketing consent.

### Re-consent

Support simple version-based re-consent. Do **not** force re-consent for typo/copy edits. Material policy version may mark `requires_reconsent`. Required policy may block authenticated flow until accepted when legally/operationally required. Optional marketing/cookie are not the same blocking class. Final legal classification: **NEW 4**.

---

## Account IA

Do **not** create `/account` by default. ProfileOverlay remains the hub.

Target: 프로필 수정 / 주문 내역 / 1:1 문의 / 커스텀 제작 / **계정 및 보안** / 로그아웃.

Inside 계정 및 보안: verified phone; password change/set; marketing consent; membership withdrawal. Keep UX minimal.

---

## METALORA UX principle — LOCKED (USER-approved)

Text: Toss-like clarity and minimalism. Do not over-explain obvious actions. Remove unnecessary headings, helper sentences, redundant descriptions, verbose confirmations.

Visual/interaction identity remains uniquely METALORA: premium; art-object; aluminum material; light response; subtle chromatic spectrum; interaction-driven delight; calm when idle; alive when touched.

**“Idle에서는 정제되어 있고, 사용자가 만지면 재료가 살아난다.”**

Use: restrained magenta → violet → cyan spectral language; directional metallic/specular response; subtle depth; responsive focus/hover/touch; short refined motion.

Avoid: noisy neon; generic SaaS; gaming/cyberpunk dashboard; excessive explanatory copy; always-moving decorative animation.

Current Login redesign is **UNCOMMITTED**; USER has **not** finally approved it. Pending visual refinements (remove `로그인` heading/subtitle; logo-only top; simplify signup copy; directional metallic specular instead of round white glow; stronger localized chromatic edge; aluminum/panel character) are **A3**, not this docs ticket.

---

## Ownership

| Agent | Owns |
|------|------|
| **A6** | DB migrations; OTP; recovery tickets; server/RPC auth; rate limiting; verified phone authority; social providers; reconciliation; provider config; consent/marketing ledgers; withdrawal backend; payment-test vs production isolation |
| **A3** | Login/recovery UI; social controls; OTP UX; `계정 및 보안`; password change/set UX; marketing toggle; withdrawal UX; final visual/interaction |
| **A0** | App callback route; AuthContext/member gate; ProtectedRoute if needed; governance |
| **A5** | Targeted QA after each slice |
| **A1** | **NONE** by default |

Do **not** blend uncommitted A3 visual files into Auth backend slices. Do not commit them from A6/A0 tickets.

---

## Slices

### SLICE 0b — PRODUCTION READ-ONLY INVENTORY

A6. READ ONLY. Required before production unique verified-phone enforcement. No implementation.

### SLICE A — VERIFIED PHONE / OTP FOUNDATION

A6 primary. **Payment-test first.** Additive verified-phone fields; OTP challenge; rate-limit foundation; recovery identity authority; stop conflating contact phone with recovery phone; write-path authority enforcement. **No SNS.** Checkpoint/report before B.

### SLICE B — RECOVERY + PASSWORD

A6 + A3. Unified ID/password recovery; password reset ticket; password change; social-user password set foundation; anti-enumeration; visual review. Checkpoint/report before C1.

### SLICE C1 — GOOGLE + KAKAO

A6 + A0 + A3. **Payment-test only first.** Providers; pending-social callback; phone completion; required consent; internal username; manual identity linking; pending cleanup. Checkpoint/report required.

### SLICE C2 — NAVER

Separate. `custom:naver` first. Fallback server proxy only if required. Do **not** merge into C1 checkpoint.

### SLICE D — ACCOUNT SECURITY / WITHDRAWAL / CONSENT

A6 + A3. `계정 및 보안`; withdrawal; `account_status` gates; consent ledger; marketing history/toggle; `user_agreements` hardening. Checkpoint/report required.

### SLICE E — FINAL AUTH / PROFILE UX INTEGRATION

A3 primary. Final Login signature; Profile/account integration; minimal Toss-like text; METALORA interactive material language; USER visual approval. Then A5 targeted QA → A0 closure.

---

## Environments

PAYMENT-TEST: `bvihpoorwriejybixmoc`  
PRODUCTION: `qifloweuwyhvukabgnoa`  
Never confuse.

All RED feature implementation: **PAYMENT-TEST FIRST** unless explicitly authorized otherwise. No production providers/migrations/deploy from this amendment.

Google/Kakao/Naver **production** enablement requires later explicit authorization.

---

## Legal / ops — NEW 4

Keep separate from engineering:

- statutory retention periods
- exact withdrawal retention clock
- withdrawn-phone re-registration wait
- marketing wording/channel requirements
- SMS sender registration
- Kakao/Naver provider policy / data-processing issues
- Custom image retention vs copyright wording
- which policy changes legally require re-consent
- final policy version operations

NEW 2F must not invent legal conclusions.

---

## Auth-expansion Definition of Done

NEW 2F cannot close until:

- original visual/account UX is USER-approved
- verified phone foundation passes
- ID recovery passes
- password recovery/reset passes
- password change/set passes
- Google, Kakao, and Naver pass
- duplicate-account prevention passes
- pending-social lifecycle passes
- withdrawal capability passes
- marketing consent capability passes
- membership consent history passes
- Auth/session/`account_status` gates pass
- no accidental account enumeration
- no unsafe phone/shipping conflation
- USER visual approval **PASS**
- A5 targeted QA **PASS**

Production rollout remains separately gated by launch pipeline stages (NEW 6/7 etc.).

---

## Do Not Do

- Implement from this amendment
- Mutate DB / enable providers / edit env / deploy
- Open NEW 3
- Commit or revert A3 uncommitted visual files
- Auto-promote `profiles.phone_number` to verified
- Use GoTrue phone login at launch
- Use provider email as silent merge
- Unlink SNS identities on withdrawal
- Account-global login lockout
- Collapse CookieBanner / checkout consents / Custom `user_agreements` / membership ledger into one table

---

## Ownership / relevant files

A0 owns this sub-contract and parent status. A6 owns RED slices. A3 owns customer UX slices.

- `docs/decisions/NEW-2F_auth-expansion.md` (this sub-contract)
- `docs/decisions/NEW-2F_account-profile-auth-ux.md` (parent)
- `docs/METALORA_PROJECT_STATE.md`
