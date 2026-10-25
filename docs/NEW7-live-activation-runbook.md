# NEW7 live activation runbook

Status: **PREPARED. NOT ACTIVATED.**

Public payment activation remains **NO-GO**, and checkout remains frozen. NEW6 is a **WAIVED / OWNER-APPROVED EXCEPTION** for NEW7 entry only, not RESTORE PASS or a technical restoration PASS. This document does not enable checkout, change Toss credentials, open NEW7, or authorize public payment activation.

## A. Existing completed evidence

Treat these as already shown. Do not rerun them for this preparation.

| Item | Evidence |
|---|---|
| Production Cloud Run | `metalora-direct-00146-peg` |
| Production source | `22e5d7259851bbaa55e521c0efb0c5c84bcefc62` |
| Production Supabase | `qifloweuwyhvukabgnoa` |
| Payment-test Supabase | `bvihpoorwriejybixmoc` |
| NEW27 hosted deployment and database security | Owner-confirmed PASS |
| NEW7 production cancellation SQL | Owner-confirmed APPLIED |
| NEW7 cancellation implementation | On the production SHA |
| Toss TEST payment and one full cancellation | PASS on payment-test only. Order `ORD-a4ff1693-0ac1-4dae-8a99-0fd3cf5d2604`, 100 KRW, provider `CANCELED`, one `DONE` cancel, local `CANCELLED`, one ledger row |
| Idempotency | Repeat admin cancel returned already complete. Provider cancel count stayed 1 |
| Frozen-code production deployment | Owner-confirmed. `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7` is `true` |
| Review activation | `REVIEW_READ_API_READY=false`, `REVIEW_WRITE_API_READY=false` |

Payment-test `orders.completed_at` was added as a nullable column so the already-applied commerce function could finalize that test cancellation. No `completed_at` value was written. That repair was not a production SQL change.

## B. Merchant approval prerequisites

Published storefront facts a reviewer can already see. These were not rewritten.

Present:

- Footer identity: 상호 메탈로라(METALORA), 대표자 강동훈, 사업자등록번호 776-19-02470, 통신판매업 신고번호 2026-울산울주-0166, 사업자등록지 as published in `src/components/Footer.tsx`
- Customer contact in that footer: email `a84411448@gmail.com`, phone `010-5595-0541`
- Partnership link: `contact@metalora.me`
- Policy routes: `/policy/terms`, `/policy/refund`, `/policy/privacy`, `/policy/cookie`, `/policy/agreement`
- Published refund text: general catalog change-of-mind within 7 days after receipt; buyer pays that return shipping; defect, damage, or wrong item is seller-paid
- Published shipping text: free shipping now; Jeju and remote islands have an extra charge; general goods ship within 2–3 business days; Workshop ships within 3–5 business days after image approval
- PDP repeats the 7-day return and the Jeju extra-charge statement
- Catalog prices come from the product option. The cart shows the selected total. While frozen, the payment method block says 결제 준비 중 and does not open Toss

Owner decision, not edited here:

- The published general-goods line says dispatch within 2–3 business days. The confirmed catalog production window used for product truth is 2–5 business days, with delivery 1–3 business days after dispatch. Do not change the published policy until the owner chooses the wording Toss should review.
- Toss merchant ID, the approved payment-method list, and the live key pair are not in the repo. They arrive only after Toss issues them.

## C. Environment and key mapping

No secret values belong in this file, in git, or in chat.

| Role | Where it lives | Rule |
|---|---|---|
| Live secret | Cloud Run env `TOSS_SECRET_KEY`, Secret Manager name `metalora-direct-toss-secret-key` | Server confirm and cancel only. Never in the client bundle |
| Live client key | The key passed to `loadTossPayments` in `src/components/Cart.tsx` | Must be the live key for the same merchant as the secret. The current source has a hardcoded client key whose prefix is `test_ck_`. The cart does not load it while the freeze is true |
| Merchant ID | Not a separate env var | The live client key and live secret must be the pair Toss issued for one MID. Do not mix a test key with a live key |
| Approved method | Code requests `카드` and full cancellation accepts only method `카드` | Do not turn on a method the cancellation path cannot finish |
| Production Supabase | `qifloweuwyhvukabgnoa` | Production Cloud Run only |
| Payment-test Supabase | `bvihpoorwriejybixmoc` | Local `METALORA_ENV=payment-test` only. Startup refuses this mode against production |
| Test secret | Local `.env.payment-test.local` only | Prefix `test_sk_` or `test_gsk_`. Never bind it to `metalora-direct-toss-secret-key` |

Callbacks already implemented:

- Success: `{origin}/payment/success`, then `POST /api/payment/confirm` with `paymentKey`, `orderId`, and `amount`
- Failure: `{origin}/payment/fail`
- Confirm checks the stored intent amount and accepts only Toss status `DONE`
- Lookup: `GET /v1/payments/orders/{orderId}`
- Admin full cancel: `POST /api/admin/orders/:orderId/cancel` with `{ cancelReason }` only. The body does not send `cancelAmount`
- Webhook `POST /api/payment/webhook` acknowledges and does not write the database

Production `METALORA_ENV` stays unset. Do not use it to unfreeze.

## D. Remaining owner-only actions

1. Toss merchant and card-company approval, including the MID and the allowed method list.
2. Issue the live client key and live secret. Do not send those values in chat.
3. Decide whether the published 2–3 business-day dispatch line stays for the review packet.
4. NEW6 is **WAIVED / OWNER-APPROVED EXCEPTION** for entering NEW7 only. This is not RESTORE PASS or a technical restoration PASS. Production database restoration and Storage recovery remain unverified. This item does not open NEW7.
5. Approve one real production payment and one full cancellation after the freeze is intentionally removed. That approval is not this document.

## E. NEW6 hard gate

NEW6 is **WAIVED / OWNER-APPROVED EXCEPTION**. The exception substitutes for RESTORE PASS only as the prerequisite for entering NEW7. It is not RESTORE PASS and not a technical restoration PASS. Production database restoration and Storage recovery remain unverified. PITR remains disabled, and the current Supabase plan remains unchanged. NEW7 remains **NOT OPENED**. NEW7 conditions C and J remain **NOT TESTED**.

Public payment activation remains **NO-GO**. The exception does not authorize payment activation, production deployment, SQL execution, ingress changes, or any other production modification.

## F. Safe production activation sequence

Recording sections D and E does not start this sequence. Those sections do not open NEW7, authorize public payment activation, or authorize deployment. A separate explicit authorization is required before any activation action. Public payment activation remains **NO-GO**, and checkout remains frozen. Do not fold it into an unrelated deploy.

1. Record the current 100% revision and `DEPLOY_SHA`. Expected baseline before this sequence is `metalora-direct-00146-peg` / `22e5d7259851bbaa55e521c0efb0c5c84bcefc62`, unless a later frozen revision has replaced it.
2. In one reviewed change, and only then:
   - set `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7` to `false`
   - replace the Cart client key with the live client key
   - leave review flags false
3. Refuse the change if the client key still starts with `test_ck_` or the bound secret is still a test secret. An operator checks the prefix. Do not record the value.
4. Add a new version of `metalora-direct-toss-secret-key` for the live secret. Do not put the test secret on that binding.
5. From a clean `main` that matches `origin/main`, run `scripts/deploy-candidate.ps1`. It deploys with `--no-traffic` and tags `candidate`. It does not clear an unknown older candidate tag by itself; stop if the tag update fails.
6. Run `scripts/verify-candidate.ps1` against the 0% candidate. Do not promote in that same step.
7. Promote only with a separate approval. Production traffic stays on the recorded revision until that promote.

The freeze is a source constant compiled into the client and checked by `POST /api/payment/prepare`. An unrelated deploy of a revision where the constant is still `true` cannot open checkout. `METALORA_ENV` cannot unfreeze production. Payment-test mode cannot start against the production Supabase host.

`POST /api/payment/confirm` and `POST /api/admin/orders/:orderId/cancel` stay available while the freeze is true so an already accepted payment can be finished or cancelled.

## G. Controlled real-payment validation

After promote, one approved live card payment:

- Storefront can request payment
- Toss status is `DONE`
- Local order is `PAID` and `payment_finalized_at` is set
- The stored payment key matches the provider
- The paid amount matches the order
- `profiles.total_spent` increases once, by that amount
- The order is not a payment-test row and the Supabase project is `qifloweuwyhvukabgnoa`

Stop if any of those fail. Do not mark the order paid by hand.

## H. Full-cancellation validation

On that same live order, one admin cancel:

- Caller is an admin. Customers have no cancel route
- Toss status becomes `CANCELED` with one `DONE` cancel, a transaction key, and balance 0
- Local status becomes `CANCELLED`
- Each item commerce state is `cancelled`
- One ledger row matches the paid amount
- The same admin request again does not add a ledger row or a second refund
- `total_spent` stays the cumulative finalized amount. Cancellation does not subtract it
- `completed_at` stays null unless the order had actually entered `COMPLETED`

## I. Monitoring and rollback

Stop new charges and continue recovery as different actions.

| Situation | Stop new charges | Continue recovery |
|---|---|---|
| Need to halt checkout | Keep or restore `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7=true` and deploy that revision. Do not rely on `METALORA_ENV` | Leave confirm and admin cancel available |
| Confirm timeout | The freeze does not fix a payment already sent to Toss | Retry `POST /api/payment/confirm` for that order. The server looks up Toss before treating the payment as unpaid |
| Duplicate confirm | — | A finalized order returns the existing success and does not increment `total_spent` again |
| Toss `DONE`, local finalize failed | Do not start another checkout for that order | Retry confirm. Do not insert an order or edit `total_spent` by hand |
| Cancel `provider_uncertain` | — | Retry the same admin cancel. The route looks up first and reuses the stored idempotency key. Do not create a second key |
| Toss `CANCELED`, ledger missing | — | Retry the same admin cancel while the attempt is `local_uncertain` or `provider_uncertain`. Lookup finalizes. Do not send a new cancel if lookup already proves the full cancel |
| Bad deploy | — | Dry-run `scripts/rollback-production.ps1`. A separately approved `-Execute` returns 100% to `metalora-direct-00153-puf`. Do not use `stable` or invent another traffic command |

`stable` currently points to `metalora-direct-00139-men` (`DEPLOY_SHA` `84aabfb99bcb68cf658e6b7b1fd9a44ecc81ce2d`). That revision has no `POST /api/admin/orders/:orderId/cancel`. The validated rollback target is `metalora-direct-00153-puf` (`DEPLOY_SHA` `f8e4bc2dc1b09ddbb5ba86037afcce25adb6d106`). The script checks that revision and SHA, and the cancellation route, on every run. A mismatch fails closed. The default run does not change traffic. Actual rollback requires `-Execute` and `-OwnerAuthorization "APPROVE ROLLBACK metalora-direct-00153-puf"`.

The script does not remove tags. A LIVE-capable revision remains reachable at its tag URL after traffic returns to `00153-puf`. After a real rollback, read the live tag map and remove only the one tag on that LIVE-capable revision. Tag removal needs a separate owner authorization. Do not remove `stable` or unrelated tags. If the mapping is ambiguous, remove nothing.

Rollback safety: do not send traffic to a revision that lacks `POST /api/admin/orders/:orderId/cancel` while any `payment_cancellations` row is `pending`, `provider_uncertain`, or `local_uncertain`. The cancellation SQL can stay. An older app cannot resume those rows. `POST /api/payment/confirm` and the admin cancellation route stay available on `00153-puf` for a payment that was already accepted. Freezing checkout does not require a traffic rollback.

Customer support: use the published phone and email. Do not promise a refund until the provider status is `CANCELED` and the ledger row exists. Escalation is an admin cancel of a `PAID` card order that has not entered production, shipping, or completed fulfillment.

Ledger check, read-only: one `payment_cancellation_ledger` row per cancelled order, `cancel_amount` equal to the paid amount, and `total_spent` still equal to the sum of orders with `payment_finalized_at` set. Do not edit `total_spent`.

## J. GO / NO-GO

GO only when every line is true:

- Toss merchant and card review are approved
- Live client key and live secret are the same MID, and the secret binding is the live secret
- The activation commit is the only change that sets the freeze false and replaces the test client key
- Candidate verification passed at 0% traffic
- NEW6 is **WAIVED / OWNER-APPROVED EXCEPTION** for NEW7 entry only. That waiver is not RESTORE PASS, not a technical restoration PASS, and not authorization for public payment activation. Production database restoration and Storage recovery remain unverified.
- Review flags are still false
- One controlled live payment and one full cancel match sections G and H
- Rollback target still contains the admin cancel route, or no uncertain cancellation is open

NO-GO if any of these are true:

- NEW6 is treated as RESTORE PASS, a technical restoration PASS, or authorization to activate public payment
- The freeze is false while the client key still starts with `test_ck_`
- The production secret is a test secret
- A deploy other than the activation commit is being used to turn checkout on
- Review activation is being turned on in the same change
- The only available rollback revision cannot resume an open cancellation

Current result: **NO-GO**. Checkout stays frozen.
