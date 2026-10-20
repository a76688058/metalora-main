# CARD-SCREENING Toss test checkout

Status: IMPLEMENTED, not deployed

Decision: `CARD_SCREENING_TEST_ENABLED` opens a Toss `test_ck` payment window from the existing cart. `PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7` stays true. Production `POST /api/payment/prepare` stays HTTP 503.

Completed: Cart CTA, isolated screening request, `/payment/screening/success` and `/payment/screening/fail`. Those pages do not call confirm.

Do Not Do: Do not set the freeze flag false. Do not switch the client key to `live_ck`. Do not point screening callbacks at `/payment/success`.

Resume Condition: A6 deploys this branch only after the regression checks in the handoff.

Rollback: Set `CARD_SCREENING_TEST_ENABLED` to false and redeploy, or redeploy the previous production SHA. Do not change `TOSS_SECRET_KEY`.

Ownership: A2 cart/routing for this ticket. A6 deploy.

Relevant Files: `src/lib/cardScreeningTest.ts`, `src/components/Cart.tsx`, `src/pages/ScreeningPaymentResult.tsx`, `src/App.tsx`, `src/lib/publicPaymentFreeze.ts`
