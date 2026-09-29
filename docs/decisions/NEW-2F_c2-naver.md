# NEW 2F C2 — Naver social auth

Status: **OPEN**

Date: 2026-09-29 (STAGE OPEN)

Decision: USER approved **C2 OPEN**. Naver social login/signup is **IMPLEMENT NOW** on payment-test. It is **not** deferred to a future Auth UX redesign. C1 remains **OPEN**. C1 USER FINAL AUTH UX VISUAL APPROVAL remains **DEFERRED** until one unified polish covering Google + Kakao + Naver.

Parent: `docs/decisions/NEW-2F_account-profile-auth-ux.md`. Expansion: `docs/decisions/NEW-2F_auth-expansion.md`. C1: `docs/decisions/NEW-2F_c1-google-kakao.md`.

This note records C2 contracts. Production is not mutated. C2-0 through C2-4 functional implementation is **CHECKPOINTED**. C2 remains **OPEN** because C2-5 unified Auth UX polish, USER visual approval, and A5 QA are not done. USER has explicitly approved proceeding with unified Auth UX now. C1 visual approval remains **DEFERRED** into that unified pass. Do **not** close C2 or C1.

---

## Status

| Item | Value |
|------|--------|
| NEW 2F | **OPEN** — do **not** close |
| C1 | **OPEN** — functional/security checkpoint COMPLETE; USER FINAL visual **DEFERRED** into C2-5 unified Auth UX |
| C2 | **OPEN** — **FUNCTIONAL COMPLETE**; not closed |
| C2-0 | **PROOF PASS** — native OIDC `custom:naver`; userinfo proxy **NOT REQUIRED** |
| C2-1 | **IMPLEMENTED** — trusted backend |
| C2-2 | **IMPLEMENTED** — shared pending-social routing includes `custom:naver` |
| C2-3 | **IMPLEMENTED** — customer Naver entry/recovery UI |
| C2-4 | **FUNCTIONALLY COMPLETE** — matrix below |
| C2-5 | **OPEN / NEXT** — UNIFIED AUTH UX POLISH (do **not** implement from this checkpoint) |
| C2-6 | **NOT STARTED** — A5 READ ONLY after C2-5 visual approval |
| Naver | **FUNCTIONAL IMPLEMENTATION COMPLETE** — C2 still OPEN |
| Apple | **OUT** |
| Production | **UNCHANGED** |
| Next | **C2-5 A3** unified Auth UX polish after GPT REVIEW of this checkpoint |

C1 durable HEAD at functional checkpoint: `7b874e3771a42c5b07352ac0e5de312a06e92f6a`.

---

## Sequence — LOCKED

1. C2 Naver functional implementation
2. Real Naver login/signup/R2/recovery proof
3. Functional QA
4. Final unified Auth UX polish for Google + Kakao + Naver
5. USER final visual approval

Do **not** finalize Auth UX before Naver. Do **not** treat existing A3 C1 polish as final approval.

---

## Implementation slices — LOCKED

Do **not** build the customer Naver button before C2-0 proves the actual provider identity/userinfo contract.

1. **C2-0 A6** — payment-test Naver Hosted/custom OAuth proof
2. **C2-1 A6** — trusted provider / backend / recovery support
3. **C2-2 A0** — shared pending-social identity/session routing if required
4. **C2-3 A3** — Naver customer Auth UI
5. **C2-4** — REAL/FIXTURE matrix execution
6. **C2-5** — unified Auth UX polish for Google/Kakao/Naver → USER visual approval
7. **C2-6 A5** — READ ONLY final QA

---

## C2-0 first principle — LOCKED

Hosted Supabase has no native Naver provider in the C1 PRE-STAGE finding. Candidate identifier `custom:naver` is **not trusted as fact** until payment-test proves `auth.identities[].provider`.

C2-0 must establish, without encoding assumptions:

- exact provider string
- successful PKCE callback
- whether Hosted userinfo mapping succeeds
- whether email is present
- whether email is verified / treated as verified by Hosted Auth
- whether `email_optional` or equivalent is needed
- whether Naver nested userinfo requires a proxy/adapter

---

## C2-0 findings — 2026-09-29 (payment-test only)

Status: **PROOF PASS**, then **REAL ACTIVATED**. Native OIDC `custom:naver`. Userinfo proxy **NOT REQUIRED**. The same singleton Auth user completed social activation on payment-test (matrix A + G). Do **not** delete, merge, or move its identity.

| Fact | Result |
|------|--------|
| Target | `bvihpoorwriejybixmoc` only |
| Production contacted | **NO** |
| Custom provider | `identifier=custom:naver` `provider_type=oidc` `enabled=true` `email_optional=true` `pkce_enabled=true` |
| Issuer | `https://nid.naver.com` |
| Native OIDC | **PASS** |
| Userinfo proxy | **NOT REQUIRED** |
| `auth.identities[].provider` | **`custom:naver`** (proven) |
| `app_metadata.provider` | **`custom:naver`** |
| Provider subject | **PRESENT** |
| Email | **ABSENT** (valid) |
| Profile | **PRESENT**, pending: username / fingerprint / `phone_verified_at` **ABSENT**; capability flags **false** |
| Usable-member / payment | **REJECTED** |
| Hosted auto-link | **NONE** — separate canonical Auth user |
| Native `provider=naver` | still `400 validation_failed` |
| Bare `naver` identity | **NOT** the Hosted identity string |

Inspect scripts: `scripts/inspect-2f-c2-0-naver-provider.ts`, `scripts/inspect-2f-c2-0-naver-live.ts`. Temporary C2-0 browser proof harness `public/c2-0-naver-proof.html` was removed at functional checkpoint (not product/runtime/test).

---

## Security allowlist — LOCKED (C2-1)

Trusted Hosted identity providers (explicit, no wildcards):

- `google`
- `kakao`
- `custom:naver`

Reject: `email`, empty, `anonymous`, bare `naver`, `custom:anything`, unknown.

Customer-visible / recovery token mapping (explicit):

- `google` → `google`
- `kakao` → `kakao`
- `custom:naver` → `naver`

Bare `naver` and `custom:*` other than `custom:naver` do **not** map. No email inference.

Payment-test Before User Created (`scripts/sql/payment-test-2f-b2b-before-user-created.sql`) is the only applied hook. Not a production migration.

---

## Identity / member / recovery — UNCHANGED from C1

- `profiles.id = auth.users.id`
- METALORA reconciliation authority = verified phone, **not** email
- Hosted same-verified-email auto-link remains a platform invariant
- No METALORA email merge, silent identity transfer, or `linkIdentity` UI
- R2: pending social + phone owned by another canonical member → fail closed **after** OTP proof; no activation/merge/transfer/disclosure
- Capability flags: `password_login_enabled` / `social_login_enabled`
- Usable member: id + nonblank username + fingerprint + `phone_verified_at`
- Naver OAuth session alone is **not** usable and **not** payable
- Activated Naver social-only: `password_login_enabled=false`, `social_login_enabled=true`
- Internal username: same `ml` + 10 lowercase alphanumeric, server-only, never customer-facing
- Recovery after Naver activation: no password reset, no recoverable username, `linked_providers` from real `auth.identities` after verified-phone proof; one customer-facing Naver control

---

## Scope

**IN:** payment-test Naver OAuth feasibility/proof; Hosted custom OAuth/OIDC if supported; exact provider string; userinfo/email behavior; trusted classification; pending social; social complete; verified-phone onboarding; R2; recovery `linked_providers`; Login/Signup Naver entry; returning login; real activation; real recovery; C2 matrix; C2 functional/security QA; then unified Auth UX polish.

**OUT:** Apple; production Naver/credentials/redirects/schema/deploy/payment activation; R1 identity transfer; connect/disconnect UI; social-first password set; MFA; withdrawal; marketing-consent expansion; permanent CAPTCHA; session-management UI.

Do not expand C2.

---

## Test matrix

| | Case | Proof |
|--|------|--------|
| A | New Naver + unowned phone | **REAL PASS** |
| B | Same Naver subject returning | **REAL PASS** |
| C | Naver pending + password-member phone | **FIXTURE PASS** |
| D | Naver pending + existing Google member phone | **REAL PASS** |
| E | Naver social recovery after activation | **REAL PASS** |
| F | Same verified-email Hosted auto-link | **NOT NATURALLY EXERCISED** |
| G | Missing/unverified email | **REAL PASS** |

Do not manufacture unnecessary live identities. Production untouched. No merge. No identity transfer. Internal `ml`+10 username never exposed. Activated Naver: `password_login_enabled=false`, `social_login_enabled=true`. Pending collision Auth row remains unusable and is **not** deleted.

---

## Environments

Payment-test only: `bvihpoorwriejybixmoc`. Production `qifloweuwyhvukabgnoa` **MUST** remain untouched. No production provider enablement, credentials, redirects, migrations, deploy, or payment activation.

---

## Ownership

| Slice | Owner |
|------|--------|
| C2-0 / C2-1 | **A6** |
| C2-2 | **A0** if routing required |
| C2-3 / C2-5 | **A3** |
| C2-6 | **A5** READ ONLY |

Preserve dirty WIP (do not revert/stage/edit unless re-owned):

- `src/components/InquiryModal.tsx`
- `src/components/OrdersModal.tsx`
- `src/components/ProfileEditModal.tsx`
- `src/components/ProfileOverlay.tsx`
- `src/pages/ProfileComplete.tsx`

---

## Do Not Do

- Close C2 or C1
- Implement C2-5 in the functional checkpoint (record only)
- Delete the second pending `custom:naver` Auth user
- Delete, merge, or move the activated Naver identity
- Claim Matrix F
- Trust `custom:*`, bare `naver`, or arbitrary custom providers
- Require or synthesize Naver email
- Change `isUsableMemberProfile` / `verifyPaymentMember`
- Touch production
- Deploy

---

## C2-1 — trusted backend (A6)

Status: **IMPLEMENTED** (functional checkpoint).

- Social complete accepts trusted identity `custom:naver` with the same activation contract as Google/Kakao
- R2: pending `custom:naver` + owned phone → `409 phone_already_registered` after OTP only
- Recovery: `auth.identities` `custom:naver` → `linked_providers=["naver"]`; social-only: `recoverable_username=null`, `password_reset_allowed=false`
- Email absence does not block trusted social activation
- Internal username remains `ml` + 10 lowercase alphanumeric, server-only

Verification: `npm run verify:2f-c2-1` (fixture/disposable only).

---

## C2-2 — pending-social routing (A0)

Status: **IMPLEMENTED** (functional checkpoint).

- Shared `hasC1SocialIdentity` / `isPendingC1SocialCustomer` consume the explicit C2-1 set: `google`, `kakao`, `custom:naver`
- Bare `naver` and `custom:anything` remain rejected
- AuthCallback generic path unchanged: pending/unusable → `/login` with session kept; usable → safe redirect
- AuthContext Workshop skip inherits the helper; pending Naver does not open Workshop
- LoginModal still consumes `isPendingC1SocialCustomer`; a pending `custom:naver` session shows existing generic social onboarding.

Verification: `npx tsx scripts/verify-2f-c2-2-pending-routing.ts`

---

## C2-3 — customer Naver Auth UI (A3)

Status: **IMPLEMENTED** (functional checkpoint). Not final Auth UX polish.

- Login/Signup social entry adds **Naver로 계속** beside Google/Kakao
- Customer token `naver` → Hosted `signInWithOAuth({ provider: "custom:naver" })` + same-origin `/auth/callback`
- Visible UI never renders `custom:naver`
- Recovery `linked_providers=["naver"]` renders the Naver continue control
- Pending onboarding, pending X sign-out, social complete, and R2 collision remain the generic C1 paths
- Bare `naver` and other `custom:*` are not accepted as OAuth/recovery tokens

Verification: `npm run verify:2f-c2-3`

---

## C2-4 — real Naver activation (A6 READ ONLY)

Status: **FUNCTIONALLY COMPLETE**. Two `custom:naver` Auth users remain: (1) activated canonical member; (2) Hosted-OAuth **pending** user from a second Naver account. Do **not** delete pending #2.

Operational note: a stale payment-test server initially returned a false `not_social` HTTP 400. After restarting `npm run dev:payment-test` onto current code, Naver activation succeeded. That stale-process failure is **not** a remaining backend defect.

Prior REAL R2 vs first Naver member’s phone remains recorded. Latest REAL Matrix D: same pending #2 reused + phone owned by an existing **GOOGLE** member → latest `social_complete` `phone_already_registered` (HTTP 409), identity_link OTP verified then unclaimed/unconsumed, no activation, no merge, no `custom:naver` on the Google member, pending sessions 0, first Naver unchanged.

---

## C2-5 — UNIFIED AUTH UX POLISH — OPEN / NEXT (A3)

Status: **OPEN**. Recorded only. **Do not implement in the functional checkpoint.**

USER has explicitly approved proceeding with unified Auth UX now. C1 USER FINAL visual approval remains **DEFERRED** into this same pass. C2 stays **OPEN** until this polish, USER visual approval, and C2-6 A5 QA.

### Surfaces

Password login; password signup; Google; Kakao; Naver; social provider row; pending social onboarding; phone OTP send / input / verify; consent states; R2 collision; password recovery; social recovery; loading; error; disabled; focus; light; dark; desktop; mobile/responsive; reduced-motion.

### Known UX fix

Generic `social_complete` HTTP 400 must **not** automatically render `인증이 만료되었습니다. 다시 시도해 주세요.` (`mapSocialCompleteError` in `customerAuthRequests.ts`). Need safer customer-facing mapping. A stale payment-test server previously made this look like `not_social`; mapping remains wrong for genuine 400s.

### Brand / visual contract

Toss-like text minimalism **and** METALORA premium material language.

Visual character: graphite; aluminum; frost; restrained magenta → violet → cyan material wake; subtle directional/specular response; refined depth; calm idle; interaction wakes the material.

Avoid: generic SaaS; excessive glassmorphism; noisy gradients; neon/cyberpunk; huge decorative animation; excessive explanatory copy; provider-brand colors dominating the entire modal.

Naver / Google / Kakao must remain recognizable.

---

## Resume

1. **GPT REVIEW** of this functional checkpoint
2. **C2-5 A3** unified Auth UX polish (OPEN / NEXT)
3. C1 remains OPEN visual-deferred until that unified pass
4. Do **not** delete the pending `custom:naver` Auth user
5. Do **not** close C2 until C2-5 visual approval + C2-6 A5 QA

Ownership: A0 (this functional checkpoint). A3 owns C2-5. A5 owns C2-6. A6 owns C2-0/C2-1/C2-4 evidence.

Relevant files: this note; `src/components/auth/socialOAuth.ts`; `src/components/auth/SocialContinueRow.tsx`; `src/components/LoginModal.tsx`; `scripts/verify-2f-c2-3-auth-ui.ts`; `src/lib/authIntegrity.ts`; `scripts/verify-2f-c2-2-pending-routing.ts`; `src/lib/trustedSocialProviders.ts`; `src/lib/accountKind.ts`; `src/lib/socialAuthHandlers.ts`; `scripts/sql/payment-test-2f-b2b-before-user-created.sql`; `scripts/verify-2f-c2-1-naver-trusted.ts`; `docs/decisions/NEW-2F_c1-google-kakao.md`; `docs/decisions/NEW-2F_auth-expansion.md`; `docs/decisions/NEW-2F_account-profile-auth-ux.md`; `docs/METALORA_PROJECT_STATE.md`
