# NEW4-0C — Public payment freeze

Status: **READY FOR A5 NEW4-0C QA**

Date: 2026-10-06

Decision: Public storefront payment is **intentionally unavailable** until NEW7 production payment activation. This is a temporary safety/trust freeze. It does not implement or activate Toss production payment.

## Previous public behavior

Cart checkout could call `/api/payment/prepare`, load the Toss SDK, and `requestPayment` with the TEST client key. Production payment was not activated, so that path was a misleading public test-payment launch.

## Freeze

Gate: `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7` in `src/lib/publicPaymentFreeze.ts`.

While true:

- Cart step-2 CTA is disabled: **결제 준비 중** / **현재 결제 기능을 준비하고 있습니다.**
- Consent sheet does not open
- `handlePayment` returns before prepare / Toss / `requestPayment`
- Cart browsing, item selection, and totals remain usable
- Payment implementation is kept for NEW7 (not deleted)

`METALORA_ENV` is not used to unfreeze.

## PaymentSuccess

Natural entry was Toss `successUrl` after `requestPayment`. That launch is blocked. Direct `/payment/success` without Toss params already shows an error, not a fake success. PaymentSuccess was not redesigned.

## Unused ShippingModal

`ShippingModal` “저장하고 결제하기” is not mounted on a public route. Not edited in this ticket.

## Removal condition

NEW7 production payment activation gate. NEW7 must remove or set `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7` to false.

## Do Not Do

- Do not activate Toss production keys.
- Do not change server payment contracts in this ticket.
- Do not deploy from this ticket.
- Do not edit preserved WIP.
