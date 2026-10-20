# NEW7 remaining issues

Status: DONE for the confirm guard, storefront timing copy, and the approved general-goods shipping sentence. LIVE confirm remains pending.

Decision: `POST /api/payment/confirm` refuses before Toss when the Toss secret is `test_sk_` or `test_gsk_` and Supabase is the production host. That refusal is the intended cross-write guard. A live secret prefix is outside this guard. Screening return pages do not call prepare or confirm.

The published general-goods line “주문 후 2~3영업일 이내 출고” promised dispatch before the confirmed 2–5 business-day production window. Production and carrier delivery are sequential stages. PDP copy states both. On 2026-10-20 the owner approved this exact shipping-policy sentence, and it is now the general-goods text in `src/constants/policies.tsx`:

일반 상품은 제작에 2~5영업일이 소요되며, 제작이 끝난 뒤 출고됩니다. 출고 후 배송은 1~3영업일이 소요됩니다.

Completed: regression coverage for the confirm refusal; PDP timing copy; approved policy sentence.
Blocker: LIVE confirm remains unverified until a live Toss secret is issued.
Do Not Do: do not let a TEST secret finalize production orders; do not activate LIVE payments or reviews.
Resume Condition: a live Toss secret exists before any LIVE confirm check.
Resume Procedure: LIVE confirm stays a separate authorized check. Do not reopen the approved shipping sentence.
Ownership: A3 storefront copy. A6 policy and payment authority.
Relevant Files: `server.ts`, `src/lib/paymentEnvGuard.ts`, `scripts/verify-payment-test-env.ts`, `src/components/pdp/ProductTheatreRail.tsx`, `src/components/pdp/ProductOrderConfidence.tsx`, `src/constants/policies.tsx`
