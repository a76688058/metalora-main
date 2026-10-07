# NEW4-4 — Privacy policy / processor disclosure

Status: **READY FOR A5 NEW4-4 PRIVACY / PROCESSOR REVIEW**

Date: 2026-10-07

Decision: Rewrite public Privacy (and Cookie identity/analytics) so it matches NEW4-5 / NEW4-6 / NEW4-7 source behavior. Bump Privacy to `privacy_v26.10.07` for future genuine membership consent only. Do not auto-backfill existing rows. Production was not mutated. Payment remains frozen until NEW7.

Public 3-day Workshop image wording is in source **only** with a HARD promote gate. Do not promote this revision until the listed operational prerequisites are true.

---

## Privacy version

- Old: `privacy_v26.09.19` / displayed `개인정보 처리방침 (Metalora Legal v26.09.19)`
- New: `privacy_v26.10.07` / displayed `개인정보 처리방침 (Metalora Legal v26.10.07)`
- Cookie displayed title (not a consent-ledger type): `쿠키 정책 (Metalora Cookie Policy v26.10.07)`
- Existing users auto-backfilled: **NO**
- Existing-user re-consent: **NO** — this is an accuracy/disclosure rewrite of processing that already happens. No new collection purpose, no new marketing use, no new live payment collection. Optional GA remains a separate local choice. Historical `privacy_v26.09.19` rows stay evidence of what was actually accepted. Future genuine membership records `privacy_v26.10.07`. A later notice-of-change UX may still be useful; do not silently insert the new version.

Terms / Workshop / checkout versions: **not bumped**.

---

## Major wording corrections

Removed or replaced:

- 주식회사 / 대표이사
- CS email `a76688058@gmail.com`
- Workshop “제작 완료 후 7일 이내 파기”
- “회원탈퇴 시 즉시 완전 삭제” class claims
- Toss + CJ/우체국 as live 수탁자
- Supabase 국외이전 “미국 등”
- paper shredding
- “지체 없이 처리합니다” SLA
- GA presented as always-on membership processing
- 통신비밀보호법 3개월 접속로그 as if implemented

---

## Data categories / purposes

| Category | Purpose |
|---|---|
| Account / auth (login email, synthetic `username@metalora.me`, OAuth identity, name, phone, verified-phone metadata, user_custom_id, provider ids) | membership, login, phone verification |
| Order / shipping | fulfillment and delivery |
| Workshop images + config | individual production |
| CS title/body/answer/timestamps | support / dispute |
| Consent type/version/agreed_at/source/order_number (IP only if already present historically; new RPC rows do not require IP) | consent/contract evidence |
| IP / UA / security events / OTP metadata / rate-limit ids | security / abuse prevention |
| Optional GA after `localStorage cookieConsent=accepted` | optional analytics |

No advertising/marketing use. Live Toss payment identifiers: **not claimed as current collection**.

---

## Account withdrawal

Public model: **ADMIN-ASSISTED**. Channels: website 1:1 inquiry, `a84411448@gmail.com`. No self-service UI.

On processing: membership disabled; unnecessary account/profile data deleted or anonymized; statutory transaction/dispute/consent records retained; active fulfillment data kept as needed. Do not describe tombstone internals.

---

## Retention periods vs automation

| Record | Period | Auto-destruction |
|---|---|---|
| 계약/청약철회 | 5 years | **NO** |
| 대금결제/재화 공급 | 5 years | **NO** |
| 소비자 불만/분쟁 | 3 years | **NO** |
| 표시·광고 | 6 months **only if such records exist** | **NO** |

Do not claim “5년 후 자동 삭제” / “3년 후 자동 파기”.

---

## Workshop image lifecycle wording

Completed order: 관리자가 주문 상태를 배송완료로 처리한 후 3일이 지나면 순차 삭제.

Abandoned upload: 마지막 관련 활동 후 3일이 지나면 순차 삭제 (active order/cart/progress protection).

Reprint: after purge, re-upload required.

Active PAID/PRODUCTION/SHIPPING + withdrawal: fulfillment image may remain until COMPLETED, then the 3-day clock applies.

Production capability today: NEW4-6 source exists; scheduler **NOT CONFIGURED**; production auto-purge **NOT LIVE**. Public promise must not outrun backend — see Release Guard.

---

## Processors / external services

| Service | Classification | Notes |
|---|---|---|
| Supabase | 처리위탁 | Auth + Postgres + Workshop Storage. Hosting country **unresolved** — do not invent. |
| Google Cloud Run | 처리위탁 + 국외 처리 | Production region **us-west1** = Oregon, USA (Google Cloud official regions docs). Request processing; not the persistent DB. |
| SOLAPI | 처리위탁 (국내) | OTP SMS: destination number + verification message. Official privacy lists 솔라피 주식회사, Seoul. |
| Google / Kakao / Naver OAuth | 외부 인증 제공자 | User authorizes the provider; METALORA receives identity. Not 제3자 제공 of METALORA’s profile dump. |
| GA4 | optional analytics | After separate `cookieConsent`. Not a membership ledger type. Processing country not invented; Google partner-sites policy linked. |
| Discord | excluded from current live customer-PII 수탁자 table | Production webhook bound. Success payload = order id / amount / method / product title·option·qty. No name/phone/address/images/CS body. Public payment is frozen so this path does not currently receive live public-storefront orders. Ops alerts = event/phase/request_id/order_id/http_status only. |
| ipify | not a current processor | No current `src/` or `server.ts` usage. |
| Cloudflare trace | not a current processor | No current usage. |
| Toss | PREPARED / NOT LIVE | Disclosed as future/conditional only. |
| CJ / 우체국 | not processors | No courier API. Admin types tracking text. |

Genuine 제3자 제공: none claimed (except lawful requests). No “판매”.

---

## Overseas processing

Supported by evidence:

- Google Cloud Run **us-west1** — United States, Oregon (official Google Cloud region documentation).

Unresolved legally required fact:

- **Production Supabase Auth/DB/Storage hosting country/region** is not established from safe repo/deploy metadata. Do not invent. Korean 국외이전 country field for the persistent datastore remains incomplete until owner confirms from read-only project settings.

GA / Google OAuth processing country: not invented; official Google policy linked.

---

## Cookie / GA

- Necessary storage: login/session, theme, language, cart/workshop progress, security.
- Optional analytics: `localStorage cookieConsent` `accepted` vs `essential_only`.
- GA required for membership: **NO**
- Server consent-ledger type: **NO**
- A3 signup-label follow-up: **YES** — LoginModal / MemberEnrollExisting still require checkbox `쿠키 정책 동의`. That label reads as mandatory cookie/analytics consent. Recommended: `쿠키 정책 확인` (required document acknowledgment) and keep analytics as the separate CookieBanner choice. Do not edit A3 signup UI in this ticket.

---

## Consent RPC

- New Privacy version allowed for `service_role`: **YES** (`privacy_v26.10.07`)
- Authenticated restrictions preserved: **YES** (workshop_custom_v26.10.06 only)
- New migration: `supabase/migrations/20261007090000_new4_4_privacy_version.sql`
- Old NEW4-5 / NEW4-5A migrations modified: **NO**

---

## Release guard

Do **NOT** publicly promote this Privacy revision until:

1. NEW4-5 migrations applied
2. NEW4-6 migration applied
3. NEW4-7 migration applied
4. NEW4 app backend deployed
5. `WORKSHOP_RETENTION_JOB_SECRET` bound
6. hourly retention scheduler configured
7. protected retention endpoint verified
8. withdrawal backend verified operationally

Privacy revision may be promoted before NEW4-6 scheduler verification: **NO**

---

## Migration order (source; not applied)

1. `20261006220000_new4_5_consent_ledger.sql`
2. `20261006223000_new4_5a_restrict_consent_rpc.sql`
3. `20261007070000_new4_6_workshop_retention.sql`
4. `20261007080000_new4_7_account_withdrawal.sql`
5. `20261007090000_new4_4_privacy_version.sql`

Production applied: **NO**

---

## Production mutation

NONE. No deploy, no push, no migration apply, no Auth/Storage/scheduler/secret/payment activation.

---

## Ownership

A6 policy/legal. `policies.tsx` privacy/cookie bodies only; Terms / refund / Workshop agreement untouched. A3 signup labels not edited.

## Relevant Files

- `src/constants/policies.tsx`
- `src/lib/policyVersions.ts`
- `supabase/migrations/20261007090000_new4_4_privacy_version.sql`
- `docs/decisions/NEW4-5_consent-ledger.md` (migration-list successor note only)
