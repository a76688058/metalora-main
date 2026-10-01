# NEW 2F — Auth Expansion (sub-contract)

Status: **CLOSED** for NEW 2 customer Auth (B–C2). Slice D/E **DEFERRED OUT OF NEW 2**.

Date: 2026-09-28 (C1 STAGE OPEN); C2 OPEN 2026-09-29; closed 2026-10-01 with NEW 2

Decision: Recovery, verified phone OTP, Google/Kakao/Naver, and identity reconciliation customer Auth are **COMPLETE** on payment-test and **CLOSED** with NEW 2. Withdrawal, marketing consent ledger, and leftover Profile chrome remain **DEFERRED OUT OF NEW 2**. They are **not** NEW 2 blockers.

Parent: `docs/decisions/NEW-2F_account-profile-auth-ux.md`. This is **not** a new master launch stage. NEW 2F is **CLOSED**. NEW 3 is **NOT OPENED**.

Prior “NEW 2F OPEN / C1 OPEN / C2 OPEN” headlines in this sub-contract are **SUPERSEDED**. Historical B2 live-state evidence below is preserved.

---

## Status

| Item | Value |
|------|--------|
| NEW 2F | **CLOSED** |
| Auth expansion customer Auth (B–C2) | **CLOSED** |
| B1 | **COMPLETE** |
| B2 | **CHECKPOINTED / COMPLETE** |
| B2a Customer Auth UX | **COMPLETE / USER APPROVED / A5 PASS** |
| C1 Google / Kakao | **CLOSED** — `docs/decisions/NEW-2F_c1-google-kakao.md` |
| C2 Naver | **CLOSED** — `docs/decisions/NEW-2F_c2-naver.md` |
| D Account security / withdrawal / consent | **DEFERRED OUT OF NEW 2** |
| E Final Auth / Profile UX integration | **DEFERRED OUT OF NEW 2** |
| Slice 0b production inventory | **NOT DONE** — not a NEW 2 blocker |
| Production providers / unique verified-phone | **GATED** |
| Production | **UNCHANGED** |
| Next action | **GPT REVIEW** of NEW 2 closure. Do **not** open NEW 3/4 from this note. |

Evidence: A0 PRE-AUDIT COMPLETE. A6 AUTH ARCHITECTURE AUDIT COMPLETE. A6 ARCHITECTURE CLARIFICATION COMPLETE. B2 implementation + A5 integrated QA **PASS**. Blocker / HIGH / MEDIUM: **NONE**.

---

## B2 live state — CURRENT TRUTH (2026-09-28)

Durable HEAD at B2 checkpoint: `3586ec732a7556226a23519553165cdafb8dd4b4`. B2 is **CHECKPOINTED / COMPLETE**. Preserved dirty WIP is the five non-B2 A3 Profile/Inquiry/Orders files only.

### B2a — Customer Auth UX

**COMPLETE / USER APPROVED / A5 PASS.**

Includes: Login; trusted password Signup; verified-phone OTP Signup; username server check; password minimum 8; Signup password confirmation; Signup stale-state clearing; unified ID/password Recovery; Recovery OTP; recoverable username display; password reset; Recovery password confirmation; Auth mode-exit stale-state clearing; minimal METALORA premium material UX.

Official Signup **no longer** uses browser `supabase.auth.signUp`.

Final A3 mode-exit cleanup: **PASS**. Do **not** treat remaining Profile `계정 및 보안` / D / E as part of this B2 close.

### Verified phone / payment

Usable customer membership requires **all** of:

- nonblank `user_custom_id`
- nonblank `verified_phone_fingerprint`
- non-null `phone_verified_at`

`profiles.phone_number` remains contact/shipping only and is **NOT** authority. Do not auto-promote it.

Payment prepare/confirm now use the same verified-phone customer requirement. Payment-gate implementation/tests are **validated WIP**. No payment amount / Toss business semantics changed. Final A6 verification-contract cleanup: **PASS**.

### B2b hosted Auth ingress — LIVE on payment-test

Payment-test project: `bvihpoorwriejybixmoc`. Production project: `qifloweuwyhvukabgnoa`. Production was **NOT** mutated.

Hosted Before User Created hook is **ENABLED and LIVE** in payment-test.

- Function: `public.hook_before_user_created(jsonb)`
- Hosted Auth mapping: `pg-functions://postgres/public/hook_before_user_created`

Observed live behavior: public `provider=email` `signUp` → **403** `Public password signup is not allowed.` → no user/session leftover. This also blocks non-`@metalora.me` public email signup.

Do **not** document current state as “hook is not invoked”, “hook still needs to be enabled”, or “public signup currently fails only through `handle_new_user` / P0001”. Those are **historical** findings only. Detail: `docs/decisions/NEW-2F_b2b-hook-contract.md`.

Provider policy in the hook (current): explicit allow-list `google`, `kakao`, `custom:naver`. Reject email / empty / anonymous / bare `naver` / other `custom:*` / unknown. Global signup was **not** disabled. Email/password remains usable for trusted Admin `createUser` and existing password login. Historical “other provider strings currently allowed / Naver not yet implemented” is **SUPERSEDED**.

### Username enumeration — CLOSED for B2

Direct `profiles_username_exists` is no longer callable by `anon` or `authenticated`. It remains available only to privileged server roles as required.

Official UI uses `POST /api/auth/signup/username-check`.

### Password minimum

Current password minimum is **8 characters**.

Verified layers: Signup UI; Recovery/reset UI; trusted backend; hosted GoTrue.

Observed hosted Auth: 7 chars → **422** `weak_password`; 8 chars → accepted when otherwise valid.

No mandatory uppercase, number, or symbol. Signup is **not** still 6.

### Payment-test OTP dev observability

Payment-test has `GET /api/auth/dev/otp/latest` only when **all** hold: `METALORA_ENV=payment-test`, `SMS_ADAPTER=dev-capture`, non-production Supabase host, loopback request.

Dev/test observability only. It does **not** return OTP from the normal send endpoint, bypass OTP verification, or exist for production.

### Expected residuals — not B2 blockers

- direct GoTrue `signInWithPassword` remains outside app-local login throttles
- Google/Kakao/Naver customer SNS flows are C1/C2 **CLOSED** (live Social Pending / Recovery / R2 terminal visual DEFERRED NON-BLOCKING)
- historical incomplete/raw accounts are not repaired
- production rollout has not happened
- production verified-phone unique index still awaits Slice 0b
- password reset does not guarantee immediate invalidation of already-issued access JWTs
- production remains unchanged

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

Identity / email is a **two-layer** rule. Detail: `docs/decisions/NEW-2F_c1-google-kakao.md`.

**AUTH LAYER:** Hosted Supabase may automatically link Google/Kakao identities that share the same **verified** provider email before METALORA callback/onboarding runs. Accepted C1 invariant. Do not undo it in C1.

**METALORA APPLICATION LAYER:** METALORA itself must never merge users by email, skip phone verification because emails match, or use email as payment/member/recovery authority. App-controlled reconciliation uses verified phone only.

Primary application reconciliation credential: **VERIFIED NORMALIZED MOBILE PHONE**.

Social identities may join the same canonical customer only under Hosted verified-email auto-link **or** later explicit linking (not C1). C1 app phone collisions are **R2 fail closed**.

Phone is **NOT** a GoTrue phone-login identity at launch.

---

## Verified account phone vs contact phone — LOCKED

### A. Account / recovery phone

Live authority fields: `verified_phone_e164` (sensitive; not ordinary AuthContext select), `verified_phone_fingerprint`, `phone_verified_at`. Conceptual `verified_phone_hmac` in earlier contract text maps to live `verified_phone_fingerprint`.

Authority: A6 trusted OTP / change-phone path **only**.

- normalized
- OTP-proven
- recovery-authoritative
- SNS-reconciliation-authoritative
- cannot be set by checkout / profile free-text writes
- unique enforcement **only after** production inventory gate (Slice 0b)

`verified_phone_fingerprint` remains reserved across withdrawn accounts until NEW 4 defines re-registration policy.

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

- required consents: **terms + privacy + cookie** (same class as B2 password Signup)
- METALORA phone OTP
- no conflicting active phone owner (C1 **R2**)
- internal username generation

Marketing consent is **OUT** until D.

Pending-social users must have bounded lifetime / cleanup. Suggested TTL: **approximately 24 hours** (A6 may confirm).

### Internal username — LOCKED

Generate automatically. Suggested format: `ml` + random lowercase alphanumeric token. Must satisfy existing username uniqueness rules.

**THE GENERATED USERNAME IS INTERNAL ONLY.** Do not display opaque `ml…` as the customer’s normal account identity.

Legacy/password users retain their chosen visible username. Do **not** backfill admin NULL username rows.

---

## Social reconciliation — LOCKED (C1 amendment)

Durable C1 contract: `docs/decisions/NEW-2F_c1-google-kakao.md`.

The earlier bullets (“provider email is only a hint and can never merge”; “require login to existing member then link from canonical account”) are **SUPERSEDED** for C1.

**C1 application phone collisions = R2 fail closed.** Do not activate or merge. Do not attach provider. Do not mint/switch canonical session. Direct to original login.

**R1 silent identity transfer: REMOVED.** There is no supported Admin API to move an OAuth identity from pending user A to canonical user B. METALORA OTP cannot mint a canonical session.

**R1-REAUTH / `linkIdentity()` customer linking: OUT OF C1.** `linkIdentity()` needs an already authenticated canonical user and a new OAuth round trip. Consumer connect/disconnect UI remains outside C1.

**Hosted verified-email auto-link:** ACCEPTED Auth-layer invariant. Before User Created does not intercept LinkAccount. If Google/Kakao share a verified email, Supabase may attach to the existing `auth.users` row before METALORA onboarding. Accept that canonical session. Do not undo the link. Usability still requires the existing verified-phone member gate.

Password `{username}@metalora.me` normally does not auto-link to a Google/Kakao mailbox.

Provider identity already attached elsewhere: **REJECT** app-level transfer. Never steal/reassign in METALORA.

---

## Withdrawal — LOCKED

Withdrawal is **NOT** raw auth-user deletion. Keep stable canonical IDs for commerce/legal records.

Model: `profiles.account_status = withdrawn` (or equivalent).

Stack:

- mark profile withdrawn
- scrub active PII
- preserve stable profile/auth identity as required
- clear plaintext `verified_phone_e164`
- retain `verified_phone_fingerprint` reservation
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

B2a Login / Signup / Recovery UX is **USER APPROVED / A5 PASS** and **CHECKPOINTED**. Slice E still owns final Profile / `계정 및 보안` integration. Do not reopen B2a visuals from later SNS/D tickets.

---

## Ownership

| Agent | Owns |
|------|------|
| **A6** | DB migrations; OTP; recovery tickets; server/RPC auth; rate limiting; verified phone authority; social providers; reconciliation; provider config; consent/marketing ledgers; withdrawal backend; payment-test vs production isolation |
| **A3** | Login/recovery UI; social controls; OTP UX; `계정 및 보안`; password change/set UX; marketing toggle; withdrawal UX; final visual/interaction |
| **A0** | `AuthCallback.tsx` **only** (no A3 co-write); AuthContext/member gate; ProtectedRoute if needed; governance |
| **A5** | Targeted QA after each slice |
| **A1** | **NONE** by default |

Do **not** blend uncommitted A3 visual files into Auth backend slices. Do not commit them from A6/A0 tickets.

---

## Slices

Live progress: **0b NOT DONE**; **A COMPLETE**; **B1 COMPLETE**; **B2 CHECKPOINTED / COMPLETE**; **C1 CLOSED**; **C2 CLOSED**; **D DEFERRED OUT OF NEW 2**; **E DEFERRED OUT OF NEW 2**. NEW 2F customer Auth is **CLOSED**.

### SLICE 0b — PRODUCTION READ-ONLY INVENTORY

A6. READ ONLY. Required before production unique verified-phone enforcement. **NOT DONE.** Not a NEW 2 blocker.

### SLICE A — VERIFIED PHONE / OTP FOUNDATION

A6 primary. **COMPLETE** on payment-test. Additive verified-phone fields; OTP challenge; rate-limit foundation; recovery identity authority; contact phone is not recovery phone. **No SNS.**

### SLICE B — RECOVERY + PASSWORD

A6 + A3. Split as **B1 COMPLETE** and **B2 CHECKPOINTED / COMPLETE**. Unified ID/password recovery; password reset; password change; anti-enumeration; B2a customer auth UX; verified-phone member/payment gate; B2b hosted ingress.

### SLICE C1 — GOOGLE + KAKAO

**CLOSED.** Contract: `docs/decisions/NEW-2F_c1-google-kakao.md`. Payment-test first.

C1 uses Hosted verified-email auto-link as an Auth invariant and **R2** for app phone collisions. No R1 identity transfer. No customer `linkIdentity` / connect UI. Social Signup consents = terms + privacy + cookie. `AuthCallback.tsx` is **A0-only**.

### SLICE C2 — NAVER

**CLOSED.** Contract: `docs/decisions/NEW-2F_c2-naver.md`. Provider identity `custom:naver`. Trusted social creation is an explicit allow-list. Unified Auth UX polish (Google + Kakao + Naver) is **C2-5 COMPLETE**.

### SLICE D — ACCOUNT SECURITY / WITHDRAWAL / CONSENT

**DEFERRED OUT OF NEW 2.** A6 + A3. `계정 및 보안`; withdrawal; `account_status` gates; consent ledger; marketing history/toggle; `user_agreements` hardening. Not a NEW 2 blocker.

### SLICE E — FINAL AUTH / PROFILE UX INTEGRATION

**DEFERRED OUT OF NEW 2.** A3 primary. Final Profile/account integration; remaining chrome. B2a Login/Signup/Recovery is USER-approved. Not a NEW 2 blocker.

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

NEW 2 customer Auth (B–C2) is **CLOSED**. Historical DoD items that still belong later (withdrawal capability, marketing consent capability, membership consent history, leftover Profile/`계정 및 보안`) are **DEFERRED OUT OF NEW 2** and do **not** keep NEW 2F open.

Closed on NEW 2:

- original customer Auth UX USER-approved for inspected core states
- verified phone foundation
- ID recovery
- password recovery/reset
- Google, Kakao, and Naver
- duplicate-account prevention (R2 fail-closed)
- pending-social lifecycle (functional)
- anti-enumeration
- no unsafe phone/shipping conflation
- A5 targeted integrated NEW2 QA **ALL PASS**

Still deferred: withdrawal; marketing consent ledger; membership consent history; leftover Profile chrome; Slice 0b production inventory; production providers.

Production rollout remains separately gated by launch pipeline stages (NEW 6/7 etc.).

---

## Do Not Do

- Reopen C1 / C2 / NEW 2F customer Auth from this note
- Mutate DB / enable production providers / edit env / deploy from this note
- Open NEW 3
- Revert preserved dirty A3 Profile/Inquiry/Orders WIP
- Auto-promote `profiles.phone_number` to verified
- Use GoTrue phone login at launch
- Merge users in METALORA by email, or skip phone verification because emails match
- Undo Hosted verified-email auto-link
- Implement R1 identity transfer or C1 customer `linkIdentity`
- Unlink SNS identities on withdrawal
- Account-global login lockout
- Collapse CookieBanner / checkout consents / Custom `user_agreements` / membership ledger into one table
- Document current hook state as “not invoked” or “still needs enablement”
- Co-write `AuthCallback.tsx` (A0 only)

---

## Ownership / relevant files

A0 owns this sub-contract and parent status. A6 owns RED slices. A3 owns customer UX slices.

- `docs/decisions/NEW-2F_auth-expansion.md` (this sub-contract)
- `docs/decisions/NEW-2F_account-profile-auth-ux.md` (parent)
- `docs/decisions/NEW-2F_c1-google-kakao.md` (C1 CLOSED)
- `docs/decisions/NEW-2F_c2-naver.md` (C2 CLOSED)
- `docs/decisions/NEW-2F_b2b-hook-contract.md` (payment-test hosted hook — LIVE)
- `docs/METALORA_PROJECT_STATE.md`
- `docs/decisions/NEW-1_launch-pipeline-v3.md`