# NEW7 remaining issues

Status: DONE for the confirm guard and storefront timing copy. BLOCKED for the published shipping-policy sentence.

Decision: `POST /api/payment/confirm` refuses before Toss when the Toss secret is `test_sk_` or `test_gsk_` and Supabase is the production host. That refusal is the intended cross-write guard. A live secret prefix is outside this guard. Screening return pages do not call prepare or confirm.

The published general-goods line “주문 후 2~3영업일 이내 출고” is a dispatch promise. Confirmed catalog production is 2–5 business days, then carrier delivery is 1–3 business days after dispatch. Those are sequential stages. PDP copy now states both. The legal sentence in `src/constants/policies.tsx` is unchanged.

Owner replacement, not applied:

일반 상품은 제작에 2–5영업일이 소요되며, 제작이 끝난 뒤 출고됩니다. 출고 후 배송은 1–3영업일이 소요됩니다.

Completed: regression coverage for the confirm refusal; PDP timing copy.
Blocker: owner approval before editing the published shipping policy. LIVE confirm remains unverified until a live Toss secret is issued.
Do Not Do: do not let a TEST secret finalize production orders; do not change the legal sentence without approval; do not activate LIVE payments or reviews.
Resume Condition: owner approves the replacement sentence, and a live Toss secret exists before any LIVE confirm check.
Resume Procedure: replace only the general-goods dispatch sentence, then run the payment-test env verifier. LIVE confirm stays a separate authorized check.
Ownership: A3 storefront copy. A6 policy and payment authority.
Relevant Files: `server.ts`, `src/lib/paymentEnvGuard.ts`, `scripts/verify-payment-test-env.ts`, `src/components/pdp/ProductTheatreRail.tsx`, `src/components/pdp/ProductOrderConfidence.tsx`, `src/constants/policies.tsx`
