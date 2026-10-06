# NEW4-0 — Legal / policy fact lock

Status: **ACCEPTED** (NEW4 source of truth)

Date: 2026-10-06

SHA at lock: `b9664fbfc9492becb26a0390340f8cb0db643c73`  
Production at lock: `metalora-direct-00119-nij` @ 100%  
`origin/main` at lock: `b9664fbfc9492becb26a0390340f8cb0db643c73`

Decision: This note is the **NEW4 source of truth** for legal, identity, catalog/Workshop policy, shipping/returns, CS, privacy, retention, and consent. Owner-approved operating facts are recorded here. Owner preference is **not** a legal conclusion where legal verification is still pending.

This ticket is **documentation / governance only**. It does **not** change storefront, admin, or runtime behavior.

Payment production: **NOT ACTIVATED**. Live payment is **NEW7 ONLY**. NEW4-0C public payment freeze is **CLOSED**.

---

## Status labels

| Label | Meaning |
|---|---|
| **LOCKED** | Verified and approved. Do not reopen without a dedicated ticket. |
| **OWNER LOCKED** | Owner-approved operating direction. Not automatically a completed legal ruling. |
| **LEGAL HOLD** | Legal verification incomplete. Do not publish as a final legal conclusion. |
| **IMPLEMENTATION REQUIRED** | Direction locked; code/copy/process does not yet exist or does not yet match. |
| **OPEN** | Must be resolved before final launch. |
| **DEFERRED** | Intentionally later. Not a silent skip of a launch blocker. |
| **PLANNED / NOT YET LIVE** | Named future channel or asset. Do not present as currently available. |

---

## Do Not Do

- Do not modify `policies.tsx`, Footer, PDP, Cart, Workshop, DB schema, migrations, `server.ts`, or Cloud Run from this ticket.
- Do not activate production payment before NEW7.
- Do not treat this note as authorization to rewrite live copy.
- Do not convert owner presentation direction into a finished-product origin ruling.
- Do not use `주식회사 메탈로라` or `대표이사` in future copy. Locked business type is **개인사업자**.
- Do not apply Workshop/custom withdrawal restrictions site-wide.
- Do not promise response SLA, 24시간 내, 즉시 답변, or 실시간 상담.
- Do not broadly expose the residential workshop / return-handling address as general storefront business-address copy.
- Do not invent a fake normal shipping price, countdown, expiration, or limited-time urgency for free shipping.
- Do not describe unused courier APIs as live processors.
- Do not publish unsupported overseas-processing country lists as fact.
- Do not use KC certification / exemption / “대상 아님” marketing wording.
- Do not claim `대한민국산`, `한국산`, `Made in Korea`, or `원산지 대한민국` unless separately legally verified.
- Do not push, deploy, mutate Supabase, or edit preserved A3 WIP from this ticket.

---

## 1. Business identity — LOCKED

| Field | Value | Status |
|---|---|---|
| Business type | 개인사업자 | **LOCKED** |
| Trade / brand name | 메탈로라(METALORA) | **LOCKED** |
| Representative | 강동훈 | **LOCKED** |
| Business registration number | 776-19-02470 | **LOCKED** |
| Mail-order sales registration | 2026-울산울주-0166 | **LOCKED** |
| Registered business address | 울산광역시 울주군 서생면 진하해변길 8, 12층 1202호 라-04호실 (아성 일마레) | **LOCKED** |

Remove future use of **주식회사 메탈로라** and **대표이사**.

### Workshop / return-handling location — OWNER LOCKED

Current real workshop and return-handling location:

울산광역시 남구 삼산로45번길 30, 신정이안 103동 201호

This is also the owner’s **residence**.

- Do **not** broadly expose it as general storefront / business-address copy.
- Current return approach: customer contacts METALORA first, then receives the actual return address and instructions.
- Return location may change when a separate office is obtained.

### Public CS identity

| Channel | Status | Value |
|---|---|---|
| Website 1:1 inquiry | **LOCKED** live | current public CS |
| Email | **LOCKED** live | current public CS |
| Future public CS email `cs@metalora.art` | **PLANNED / NOT YET LIVE** | **OPEN** before launch |
| Current temporary email | **OWNER LOCKED** | `a84411448@gmail.com` |
| Messenger / extra Q&A | **PLANNED, NOT LIVE** | do not present as live |
| CS hours | **LOCKED** | 평일 10:00–17:00; 점심 12:00–13:00; 토·일·공휴일 휴무 |
| Telephone | **OPEN** | compliant business/CS telephone required before launch |

Owner prefers **not** to expose a personal mobile number. Prior legal verification indicates telephone contact is part of seller disclosure requirements. A compliant business/CS telephone solution is required before launch.

Current live Footer / policies still display `a76688058@gmail.com` and `010-5595-0541`. That is an **implementation gap**, not a re-lock of identity. Do not treat the live personal mobile number as the approved long-term disclosure number.

Do not promise a response SLA. Customer-facing phrasing may say **영업시간 내 순차 답변**.

---

## 2. Product / manufacturing — LOCKED

Imported from China:

- pre-cut sublimation aluminum blank plate
- magnets
- wall-protection sticker

Past imports: personal name.  
Future imports: planned under METALORA business registration.  
Supplier: direct purchase from Chinese factory.

Domestic process performed directly by METALORA:

- image preparation
- printing
- sublimation transfer
- rear finishing
- assembly
- inspection
- packaging

Current processing location: 신정이안 workshop.

The completed decorated art panel is **not** imported finished from China.

| Role | Direction |
|---|---|
| Seller | 메탈로라(METALORA) |
| Manufacturer | 메탈로라(METALORA) |
| Product brand logo | METALORA planned on product/packaging |

---

## 3. Manufacturing country / origin — OWNER LOCKED / LEGAL HOLD

Owner-approved **presentation direction** when a manufacturing-country field is used:

**제조국 → 대한민국**

Record the distinction:

| Layer | Status |
|---|---|
| Owner-locked presentation direction | 제조국 대한민국 |
| Legal origin determination | **NOT completed** — **LEGAL HOLD** |
| Customer-facing notice field | 상품정보 제공고시 uses **제조국 또는 원산지** — final wording needs legal verification |

Do **not** automatically claim:

- 대한민국산
- 한국산
- Made in Korea
- 원산지 대한민국

Do **not** silently convert the owner decision into a final country-of-origin ruling. Current live notice still shows `심의 예정` for this field.

NEW4-2 may clean non-origin product-notice fields. It **must not** finalize or publish the combined statutory **제조국 또는 원산지** field, and must **not** publish `원산지 대한민국`, `대한민국산`, `한국산`, or `Made in Korea`. That final gate is **LEGAL HOLD** until **NEW4-8**.

---

## 4. Safety / KC — LOCKED (applicability)

Owner supplied an official civil-petition response. For the described aluminum wall-art product:

- **NOT** a safety-managed consumer product under 전기용품 및 생활용품 안전관리법
- KC mark must **not** be used
- wording implying KC certification or safety-management must **not** be used
- this response is **not** a KC exemption certificate
- exact FTC product-information-notice wording was referred to FTC

Current preferred product-notice field:

**법에 의한 인증·허가 등: 해당 없음**

| Layer | Status |
|---|---|
| Substantive safety applicability | **LOCKED** |
| Exact final storefront wording | **IMPLEMENTATION REQUIRED** (final implementation review) |

Do **not** use:

- KC 인증 완료
- KC 인증 제품
- KC 인증 면제
- KC 면제 제품
- KC 인증 대상 아님

Current live notice still shows `심의 예정` for certification. That is an implementation gap, not a reopening of KC applicability.

---

## 5. Standard catalog policy — LOCKED

Standard catalog facts:

- no customer image upload
- no personalization
- normal returned goods can be inspected and resold

Policy:

- treated as a **normal catalog good**
- withdrawal / change-of-mind allowed within **7 days after receipt**
- buyer bears the lawful change-of-mind return cost
- defect / damage / wrong delivery / mismatch → seller bears return cost
- returned goods may be inspected and resold if normal

Do **not** apply Workshop/custom withdrawal restrictions site-wide.

Current live terms/refund copy still treats the entire site as 1:1 custom with post-production change-of-mind refusal. That is a **P0 public policy gap**.

---

## 6. Workshop policy — OWNER LOCKED direction

Workshop:

- public / live menu
- customer uploads image
- personalization exists **only here**
- image is **not** auto-approved
- admin manually reviews image
- production begins after image review/approval

Required policy structure:

1. individual-production notice  
2. transaction-specific withdrawal-restriction notice  
3. electronic consent  
4. image review/approval  
5. production start  

Do **not** use a blanket **「주문제작 상품은 환불 불가」**.

Defect / damage / wrong delivery rights remain.

Cancellation boundary:

- **before** image review / production approval: cancellation allowed
- **after** lawful production approval: change-of-mind restriction may apply **only** with required prior notice/consent

Exact customer wording: **IMPLEMENTATION REQUIRED**.

---

## 7. Workshop image retention — OWNER LOCKED + IMPLEMENTATION REQUIRED

Approved model:

- source images used only for production/shipping purpose
- operator sets order to COMPLETED
- system records explicit `completed_at`
- original source image + Workshop preview/derived stored images deleted within **3 days after `completed_at`**
- remove/clear stale image URL references where practical
- record purge completion, e.g. `image_purged_at`
- after purge, reprint requires customer re-upload

**COMPLETED** currently means **operator-set completion**. There is **no** carrier-delivery webhook. Do not write copy implying carrier-confirmed delivery.

Current implementation:

- **NO** purge job
- **NO** `completed_at`

Abandoned / never-ordered Workshop uploads: delete within **3 days after last relevant activity**. A real scheduled purge must exist before this is promised publicly.

---

## 8. Shipping — LOCKED

Standard shipping: **FREE**.

Marketing presentation allowed:

- 무료배송 혜택
- 현재 무료배송

Do **not** invent a fake normal shipping price, countdown, fake expiration, or false limited-time urgency.

Dispatch lead times (not guaranteed carrier arrival):

| Surface | Dispatch |
|---|---|
| Standard catalog | 주문 후 **2~3영업일 이내 출고** |
| Workshop | 이미지 승인 후 **3~5영업일 이내 출고** |

Jeju / remote areas: **customer additional surcharge NONE**. METALORA bears any actual surcharge while this policy is active.

Prior catalog copy that stated a Jeju/remote extra charge, or mixed production/delivery windows as guaranteed arrival, is superseded **for NEW4 implementation** by this lock. Do not invent a carrier arrival SLA.

---

## 9. Return shipping — OWNER POLICY / CONDITIONAL LOCK

Owner-selected provisional change-of-mind round-trip return cost: **6,000원**.

Legal review requires the amount to be consistent with actual necessary shipping cost.

| Layer | Status |
|---|---|
| Owner policy | 6,000원 |
| Final live lock | **OPEN** — requires actual courier-cost confirmation |

Defect / wrong delivery: seller pays.

Return workflow:

1. customer contacts via website inquiry / email  
2. receives return instructions and address  
3. sends the return  

Do not broadly expose the residential workshop address unless required by the chosen return-process implementation.

---

## 10. CS — LOCKED

Current live:

- website 1:1 inquiry
- email

Not live:

- messenger
- extra Q&A channel

Hours: weekday 10:00–17:00; lunch 12:00–13:00; weekends and public holidays closed.

Allowed phrasing: **영업시간 내 순차 답변**.

Do not promise: 24시간 내 / 즉시 답변 / 실시간 상담.

Admin CS currently saves a DB answer only. There is **no** Kakao / SMS / email answer notification.

---

## 11. Payment — LOCKED (NEW4-0C CLOSED)

Production behavior at SHA `b9664fb`:

- public payment frozen until NEW7
- checkout copy: **결제 준비 중** / **현재 결제 기능을 준비하고 있습니다.**
- Toss UI hidden
- public `/api/payment/prepare` blocked
- `requestPayment` blocked
- payment production **NOT ACTIVATED**

Do not activate production payment before NEW7. See `docs/decisions/NEW4-0_payment-freeze.md`.

The earlier public path that could start Toss TEST payment from production checkout is **fixed by NEW4-0C**. Do not reopen it.

---

## 12. Privacy / data processing — FACT LOCK

Verified data categories (names only; do **not** copy actual customer values):

- auth email
- full name
- phone
- verified e164 / phone identity metadata
- `user_custom_id`
- OAuth identities / provider data
- shipping recipient
- shipping phone / address / zip
- orders / order items
- payment references when payment becomes active
- cart
- Workshop originals / previews
- CS inquiry content
- consent timestamps
- cookies
- GA identifiers when accepted
- IP / UA / security logs
- OTP / SMS metadata

---

## 13. Services / processors — FACT LOCK

**LIVE:**

- Supabase
- Google Cloud / Cloud Run
- SOLAPI
- GA4 (consent gated)
- Kakao OAuth
- Naver OAuth
- Google OAuth
- Discord webhook if configured
- ipify
- Cloudflare trace fallback

**PREPARED / NOT PUBLICLY ACTIVE:**

- Toss Payments

**Currently not actual data processors via API:**

- CJ대한통운
- 우체국

Admin only types courier / tracking text. Do not describe unused courier APIs as live processors.

---

## 14. Overseas processing — FACT LOCK + OPEN vendors

Confirmed: Google Cloud Run production region = **us-west1** → overseas processing **confirmed**.

Unknown / vendor confirmation needed:

- production Supabase region
- GA processing country
- Kakao / Naver / Google OAuth processing details
- SOLAPI
- Toss
- Discord
- ipify
- Cloudflare
- Cloud Logging retention / location details

Do not publish unsupported **「미국 등」** language as fact. Confirmed Cloud Run overseas processing is currently **absent** from public privacy copy (P0 gap).

---

## 15. Account deletion — OWNER LOCKED direction + IMPLEMENTATION REQUIRED

Current implementation:

- no self-service delete
- no admin member delete workflow
- order / payment retention relationships complicate raw Auth deletion

Approved direction:

- **Before launch:** a real admin-assisted account deletion / withdrawal process through email / website 1:1 inquiry
- **NEW5:** add self-service Member / Account UX

When withdrawal is processed:

- account / profile / auth data: delete or anonymize, except where lawful retention is required
- order / payment / contract records: retain separately for the statutory retention period
- Workshop images: follow the separate short purge lifecycle
- Workshop storage must not survive merely because Auth data was removed
- statutory retained records must remain independently valid

This policy split is **OWNER LOCKED**. Do not reopen it.

Backend behavior and final public copy are **IMPLEMENTATION REQUIRED**. Do not let the privacy policy promise an immediate working withdrawal capability before NEW4-7 exists.

---

## 16. Legal record retention — OWNER LOCKED

Keep separate:

| Record | Policy |
|---|---|
| Workshop image | short lifecycle; purge per image policy |
| Order / payment / contract | retain according to verified legal baseline (**5 years**) |
| CS / dispute | retain **3 years** |
| Profile / account | only as needed for active account / lawful purposes; not a substitute for statutory order retention |

Owner decision: non-statutory CS content follows the same **3-year** retention policy.

---

## 17. Consent evidence — OWNER LOCKED + IMPLEMENTATION REQUIRED

Required future model: a **server-side versioned consent ledger** capable of proving:

- WHO
- accepted
- WHICH POLICY VERSION
- WHEN

Apply to:

- Terms
- Privacy
- Workshop custom-production agreement
- checkout / refund / return agreements when NEW7 activates payment

Existing Workshop versioned record may be reused or migrated conceptually.

Current membership timestamps without version ids are **insufficient** for future policy evidence.

Cookie / GA: keep **optional** and **separate** from mandatory service agreement. Do not bundle marketing / analytics consent into required consent.

---

## 18. Known public policy gaps

These are **implementation blockers** for later NEW4 tickets. This note does not fix them.

### P0

- privacy image-deletion promise not implemented
- account deletion / processing-stop promise lacks an actual path
- collected categories missing from privacy policy
- **주식회사 / 대표이사** incorrect for locked 개인사업자 identity
- confirmed Cloud Run overseas processing absent from public disclosure
- entire site treated as custom product
- payment previously misleading (**NOW FIXED** by NEW4-0C)

### P1

- processor list incomplete / inaccurate
- Toss shown as live while frozen
- couriers described as processors though no transmission
- consent versions missing
- unsupported messenger / Q&A copy
- account deletion / order-retention **public copy and backend** are **IMPLEMENTATION REQUIRED** (policy architecture already OWNER LOCKED in §15; do not reopen the owner decision)

---

## 19. Still OPEN before final launch

1. `cs@metalora.art` creation  
2. compliant business / CS telephone number  
3. actual courier-cost validation for the 6,000원 return charge  
4. final legal implementation of **제조국 대한민국** vs **제조국 또는 원산지** notice field  
5. production Supabase / vendor processing regions  
6. actual purge job implementation (`completed_at`, `image_purged_at`, abandoned uploads)  
7. admin-assisted withdrawal backend / process  
8. versioned consent ledger  
9. final product-information notice  
10. full privacy / terms / refund policy rewrite  

---

## 20. Implementation tickets

Ticket **names are unchanged**. Execution **order** below is the A5-approved sequence. NEW4-0C payment freeze is already **CLOSED** and is not reopened here.

Counsel delay must not silently skip a launch blocker; it also must not block unrelated NEW 2/3 closed work.

| Order | ID | Title | Scope | Owner |
|---|---|---|---|---|
| 1 | **NEW4-1** | Policy Architecture | Split catalog vs Workshop policy. Remove whole-site custom assumption. | A2 / A6 |
| 2 | **NEW4-2** | Business / Footer / Product Notice | Individual-business identity; representative / registration; registered business address; Footer business facts; manufacturer direction where safe; non-origin product-notice cleanup; KC/safety field only within already verified scope. **EXCLUDES** final 제조국/원산지 publication. Must **not** publish `원산지 대한민국`, `대한민국산`, `한국산`, `Made in Korea`, or the final combined **제조국 또는 원산지** field. | A1 / A6 |
| 3 | **NEW4-3** | Shipping / Returns / CS Copy | Dispatch periods, free-shipping presentation, return workflow, CS channels/hours. Provisional **6,000원** change-of-mind return cost must remain **conditional** until actual courier cost is verified. | A2 / A6 |
| 4 | **NEW4-5** | Consent Ledger | Versioned server evidence for membership + Workshop + future checkout. | A3 / A6 |
| 5 | **NEW4-6** | Workshop Retention Automation | `completed_at`, `image_purged_at`, 3-day scheduled purge, abandoned uploads. | A6 |
| 6 | **NEW4-7** | Account Withdrawal Backend | Admin-assisted deletion/anonymization; statutory-order retention separation. Implements the already OWNER LOCKED §15 split. | A3 / A6 |
| 7 | **NEW4-4** | Privacy Policy / Processor Disclosure | Actual data inventory, overseas processing, processor truth. Intentionally **after** NEW4-6 and NEW4-7 so public copy does not promise unimplemented purge/withdrawal behavior. | A6 |
| 8 | **NEW4-8** | Product Notice / Origin Final Gate | Final legal review of **제조국 대한민국** vs **제조국 또는 원산지**. Only this ticket may publish the combined notice field after legal verification. | A6 |
| 9 | **NEW4-9** | Integrated Legal / Trust QA | A5 strict read-only. Production candidate later only after the full NEW4 bundle. | A5 (READ ONLY) |

Order rationale: policy split (4-1) before identity/shipping copy (4-2, 4-3). Consent ledger (4-5) and retention/withdrawal systems (4-6, 4-7) before privacy rewrite (4-4), so public copy cannot promise unimplemented purge or withdrawal. Origin/notice final gate (4-8) stays last among copy tickets because the combined 제조국/원산지 field is **LEGAL HOLD**. NEW4-9 is verification, not a rewrite.

Each ticket still requires its own A0 PRE-STAGE REPORT before source writes.

---

## Resume Condition

Use this note as the NEW4 SoT for all later NEW4-1…NEW4-9 tickets. Do not implement copy or schema from this ticket.

## Resume Procedure

1. Open the next ticket (NEW4-1 unless the user names another).  
2. A0 PRE-STAGE REPORT. HARD STOP.  
3. Implement only that ticket’s WRITE SET.  
4. User visual approval if visible. A5 targeted QA where required. A6 on RED/legal surfaces.

## Ownership

A0 owns this governance note. Later tickets follow the table above. A6 owns production-release legal/policy verification. A5 remains READ ONLY.

## Relevant Files

- `docs/decisions/NEW4-0_legal-fact-lock.md` (this SoT)
- `docs/decisions/NEW4-0_payment-freeze.md` (NEW4-0C freeze; CLOSED)
- Live gaps (do **not** edit from this ticket): `src/constants/policies.tsx`, `src/components/Footer.tsx`, `src/components/pdp/ProductInformationNotice.tsx`
