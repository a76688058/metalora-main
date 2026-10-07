# NEW4-4 — Privacy policy / processor disclosure

Status: **OPEN — SOURCE STILL BLOCKED** (NEW4-4C). Two country fields cannot be filled truthfully: Supabase Storage CDN cache (Cloudflare, global) and Cloud Logging `_Default` (`global`). Cloud Logging retention is an owner fact. Public promotion is blocked by the `공개 전 확인 필요` markers and the release guard below.

---

## NEW4-4C — CDN / Cloud Logging (2026-10-07)

Owner facts:

- Production Supabase plan: **Free** (current production fact)
- Planned: **Pro** at/around Grand Open (PLAN, not current fact)
- Production Cloud Logging `_Default` bucket location: **global**
- Cloud Logging `_Default` retention: **not supplied — OWNER FACT REQUIRED**

CDN (official Supabase docs):

- Provider: Supabase Storage CDN on Cloudflare (`supabase.com/regions`: “Storage CDN cache — Global, cached on Cloudflare”; Cloudflare, Inc. on the Supabase subprocessor list, June 1, 2026).
- Free = Basic CDN. Supabase Storage v2 announcement: the Basic CDN adds a cache header (default 1 hour, configurable), and a deleted image keeps being served until that cache expires. `storage/cdn/fundamentals`: the CDN may evict earlier if a region stops requesting the object.
- METALORA Workshop uploads: `cacheControl: '3600'` (`src/lib/customComposition/durableHandoff.ts`), served via `getPublicUrl`.
- Pro+ = Smart CDN (`storage/cdn/smart-cdn`): edge cache invalidated on update/delete, “up to 60 seconds” to propagate globally; browser cache still follows `cacheControl`. Cache purge API is Pro+.
- Conservative wording valid on Free and Pro: “설정된 캐시 유효기간(현재 약 1시간) 또는 제공자의 무효화 처리까지 일시적으로 남을 수 있습니다.” Free = edge TTL ≈ cacheControl; Pro = edge ≤ ~60 s, browser ≤ cacheControl. Neither is described as instant or exactly one hour.
- Release-time requirement: immediately before public promotion, re-verify the actual Supabase plan. If Pro, re-check Smart CDN wording against official docs; if Free, keep the Basic CDN classification. If `cacheControl` changes, update “현재 약 1시간”.

CDN countries:

- Cloudflare publishes an official network page (`cloudflare.com/network`, currently “348 cities · 8 regions”; other official pages say “125+ countries”) and a status location list. Both change over time.
- That list shows where Cloudflare has data centers, not where a given METALORA object is cached. Supabase says objects are cached at edges where they are requested and may be evicted per region. Listing every Cloudflare country would overstate; no narrower official list exists.
- Legally usable country list: **NO**. Public field kept as marker `[공개 전 확인 필요: CDN 캐시 국가]`.

Cloud Logging (official Google docs `logging/docs/region-support`, `store-log-entries`):

- `global` = “Logs stored in any data centers in the world. Logs might be moved to different data centers.” No country list. Do not map to the US.
- Existing `_Default` bucket location cannot be changed; a new regional bucket + `_Default` sink update would be needed to fix the location.
- Default `_Default` retention = 30 days unless customized. The actual project setting is not supplied, so the public field is a marker.
- Logged data (code inspection): app logs = request_id, event/outcome classes, OTP/SMS outcome + purpose + SOLAPI message id (no phone/OTP), auth outcome classes, retention/withdrawal stage classes, startup deploy SHA. Payment paths (frozen) also log order numbers, internal user UUID (`[PAYMENT_PREPARE] ... for user`, intent-lookup failures), and raw Supabase/Toss error objects. Cloud Run request logs (platform) = remote IP, User-Agent, request URL, status, latency. No name/phone/address/email/image/CS body in app logs.
- Public field kept as marker `[공개 전 확인 필요: Cloud Logging 로그 보관 국가]` and `[공개 전 확인 필요: Cloud Logging 로그 보관 기간]`.

Architecture options (do not implement in NEW4-4):

- **Option A — CDN (recommended):** stop serving Workshop customer objects through public Supabase CDN URLs. Make `workshop` objects private and deliver them through an authenticated Cloud Run endpoint that downloads with the service role and responds `Cache-Control: private, no-store`. Signed URLs alone are not enough: Supabase docs say Smart CDN caches signed URL responses. Server-side downloads from Cloud Run (us-west1) would traverse Supabase's edge near the US; confirm in the ticket whether authenticated downloads are edge-cached and keep `cacheControl` minimal. Owners: A3 Workshop/Cart/admin image UX + A6 server endpoint + storage policy migration. NEW4-6 purge paths must stay valid.
- **Option B — CDN:** enumerate every Cloudflare country. Not recommended: unstable, overstates, not object-specific.
- **Option A — Logging (recommended):** create a regional log bucket (for example `us-west1`, matching the already-disclosed Cloud Run country, or `asia-northeast3` Seoul) with a documented retention, update the `_Default` sink to route there, then disclose that region and retention. This is a production Logging mutation and needs its own approved A6 ops ticket. Note: `_Required` (audit logs) stays global; confirm whether it contains customer personal data.
- **Option B — Logging:** disclose `global`. Not recommended: no country list.

Discord: payment-path only; payment frozen. Full Discord country disclosure (or removing/changing the Discord notification architecture) is a **NEW7 payment-unfreeze blocker**, not a blocker for today's non-payment public state. Discord is not removed.

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
| Supabase | 처리위탁 (국내 보관, NEW4-4B) | Auth + Postgres + Workshop Storage. Production project `qifloweuwyhvukabgnoa` region `ap-northeast-2` (owner-confirmed) = “Northeast Asia (Seoul)” per Supabase official regions docs. Public: 보관 위치 대한민국(서울). |
| Google Cloud Run | 처리위탁 + 국외 처리 | Production region **us-west1** = Oregon, USA (Google Cloud official regions docs). Request processing; not the persistent DB. |
| SOLAPI | 처리위탁 (국내) | OTP SMS: destination number + verification message. Official privacy lists 솔라피 주식회사, Seoul. |
| Google / Kakao / Naver OAuth | 외부 인증 제공자 | User authorizes the provider; METALORA receives identity. Not 제3자 제공 of METALORA’s profile dump. |
| GA4 | optional analytics | After separate `cookieConsent`. Not a membership ledger type. Processing country not invented; Google partner-sites policy linked. |
| Discord | 처리위탁 + 국외 이전 (NEW4-4A) | Production webhook bound; not removed. Called only from payment code in `server.ts`. Order notification after confirmed payment: 주문번호, 결제 금액, 결제수단, product title/option/qty, [커스텀]/[기성], AI option flags. Payment-ops alert: payment_event, phase, request_id, order_id, http_status, provider/provider_code, retryable, recovery_required, deploy_sha. Does NOT receive name, phone, address, email, Workshop image, CS body. Order-linked transaction data can be linkable to a customer, so it is disclosed. Not 제3자 제공. Public payment frozen (client-side `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7`), so order notifications do not occur before public payment opens; disclosed conditionally. |
| ipify | not a current processor | No current `src/` or `server.ts` usage. |
| Cloudflare trace | not a current processor | No current usage. |
| Toss | PREPARED / NOT LIVE | Disclosed as future/conditional only. |
| CJ / 우체국 | not processors | No courier API. Admin types tracking text. |

Genuine 제3자 제공: none claimed (except lawful requests). No “판매”.

---

## Overseas processing

Legal basis (NEW4-4A): 개인정보 보호법 제28조의8 제1항 제3호 가목 — 계약 체결·이행에 필요한 처리위탁·보관으로서 제2항 각 호(항목, 국가·시기·방법, 이전받는 자 명칭·연락처, 이용목적·보유기간, 거부 방법·절차·효과)를 처리방침에 공개. Source: 국가법령정보센터 조문 (시행 2026. 9. 11., 법률 제21445호). Not consent-based; the product collects no separate overseas consent. 시행령 제31조 was not separately fetched; the public text cites the statute only.

Public 제9조 entries:

| Recipient | Country | Contact | Source |
|---|---|---|---|
| 1. Google Cloud Run (Korea billing contracting entity: Google Cloud Korea LLC, reseller; “Google” = Google Asia Pacific Pte. Ltd. and affiliates) | USA, Oregon (`us-west1`) | Google Cloud Data Protection Team `https://support.google.com/cloud/contact/dpo` | cloud.google.com/terms/google-entity; Cloud DPA §12 / Appendix; Compute Engine regions-zones |
| 2. Google Cloud Logging (same recipient) | **MARKER** — `_Default` = `global` (NEW4-4C) | same | logging/docs/region-support |
| 3. Supabase Storage CDN cache (Supabase, Inc.; subprocessor Cloudflare, Inc.) | **MARKER** — global Cloudflare edge (NEW4-4C) | privacy@supabase.com | supabase.com/regions; Supabase subprocessor list |
| 4. Discord Inc. | USA (official policy: US servers; may also store in other countries depending on user/provider location) | privacy@discord.com; 444 De Haro Street #200, San Francisco, CA 94107, USA | discord.com/privacy |

Retention fields: no vendor-side day counts invented. Cloud Run = request processing duration. Cloud Logging = **MARKER** (owner fact). CDN = cache validity (currently about 1 hour) or provider invalidation. Discord = until METALORA deletes the notification or the relationship ends; Discord-side per Discord policy.

Refusal: necessary infrastructure; no per-user exclusion exists. Refusal path = request withdrawal / stop use via 1:1 문의 or a84411448@gmail.com; effect = membership and orders cannot be provided. Kept separate from optional GA refusal.

Supabase region (NEW4-4B) — **RESOLVED**:

- Owner-confirmed region: `ap-northeast-2` (project `qifloweuwyhvukabgnoa`)
- Verified official location: “Northeast Asia (Seoul)” — supabase.com/docs/guides/platform/regions and supabase.com/regions. Public wording: 대한민국(서울).
- Supabase official regions page: primary Postgres database, Auth service, and Storage objects at origin stay in the chosen region.
- Classification: domestic 처리위탁 (Privacy 제8조). Removed from the 제9조 overseas list. A foreign vendor entity alone does not make Seoul-hosted storage an overseas transfer.
- Supabase region marker removed (NEW4-4B). NEW4-4C added CDN/Logging markers. Promotion check: `rg "공개 전 확인 필요" src/constants/policies.tsx` must return no hits.

Remaining Supabase overseas aspect:

- Storage CDN cache (Cloudflare, global): now a public 제9조 entry with a country marker. See NEW4-4C above (Option A recommended).
- Supabase Edge Functions run globally, but METALORA has no `supabase/functions` and no `functions.invoke` usage → not applicable.
- Supabase DPA/subprocessor list (June 1, 2026) lists US vendors for support/monitoring (for example Sentry, Slack, OpenAI). Customer-data access through these for support is not documented for this project; not speculated.

Verification items (not owner facts; read-only, need approval to run):

- METALORA Google Cloud billing account address is Korea (determines Google Cloud Korea LLC as contracting entity). Public text states the official rule, not the account fact.
- Cloud Logging `_Default`: location owner-confirmed `global` (NEW4-4C); retention days still OWNER FACT REQUIRED.
- Discord: vendor does not enumerate countries beyond the US. A5/legal to confirm the US-plus-vendor-statement wording is sufficient for 제28조의8 제2항 제2호.

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

HARD public-promotion prerequisites (NEW4-4C). NEW4-4 is **not** production-ready until all are complete:

1. apply all NEW4 migrations in order (`20261006220000_new4_5_consent_ledger.sql`, `20261006223000_new4_5a_restrict_consent_rpc.sql`, `20261007070000_new4_6_workshop_retention.sql`, `20261007080000_new4_7_account_withdrawal.sql`, `20261007090000_new4_4_privacy_version.sql`)
2. verify all migrations
3. deploy matching NEW4 backend/app revision
4. bind `WORKSHOP_RETENTION_JOB_SECRET`
5. configure hourly Workshop retention scheduler
6. verify protected retention endpoint operationally
7. verify account-withdrawal backend operationally
8. re-verify the actual Supabase plan at release time (Free = Basic CDN; Pro = Smart CDN) and the Workshop `cacheControl`
9. resolve the Workshop CDN overseas issue (Option A delivery change, or a legally approved alternative) and fill/remove the `CDN 캐시 국가` marker
10. resolve Cloud Logging disclosure (regional bucket or legally approved alternative) and fill the `Cloud Logging 로그 보관 국가` / `로그 보관 기간` markers; owner supplies retention
11. final A5 privacy review
12. no `공개 전 확인 필요` markers remain (`rg "공개 전 확인 필요" src/constants/policies.tsx` → no hits)
13. only then expose Privacy v26.10.07 and the 3-day Workshop wording

Payment unfreeze (NEW7) additionally requires: Discord overseas country disclosure legally complete, or the Discord notification architecture changed/removed.

RESOLVED (NEW4-4B): production Supabase Auth/DB/Storage hosting region = `ap-northeast-2`, Seoul, South Korea. Overseas disclosure updated accordingly.

Privacy revision may be promoted before NEW4-6 scheduler verification: **NO**

NEW4-6 verifier (NEW4-4A): the old check `배송완료\s*후\s*3일` did not match the real wording `배송완료로 처리한 후 3일`, so it passed by accident. It now detects the real 3-day wording, requires this release guard (secret + hourly scheduler) whenever that wording exists, and rejects 72시간 / 배송사가 배송완료 / 제작 직후 즉시 삭제 variants.

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
- `scripts/verify-new4-6-workshop-retention.ts` (NEW4-4A copy assertion only)
