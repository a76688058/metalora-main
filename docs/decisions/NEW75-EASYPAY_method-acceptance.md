# NEW7.5 easy-pay confirmation

Status: **CANDIDATE PREPARED — NOT APPLIED — NOT DEPLOYED**

Release parent: `cfb537b020aaabb23488d6c3b0045f11c89bd52e`. The candidate excludes the checkout preview latch, the unreleased cart-notice commit, historical migration application, M3, PDP, and Home Hero. `scripts/sql/historical/` is a verifier fixture and is not a migration.

Date: 2026-11-20

Decision: Toss `requestPayment('카드')` may confirm as `카드` / `CARD` or `간편결제` / `EASY_PAY`. Deployed revision `metalora-direct-00111-nn2` (`DEPLOY_SHA` `cfb537b020aaabb23488d6c3b0045f11c89bd52e`) accepts only `카드` in the server check and in the database functions below.

Read-only inspection of production project METALORA.pj on 2026-11-20:

- `schema_migrations`: `20260826110000`, `20261112160000`, `20261112165000`, `20261112170000`.
- `20261024120000` and `20261113140000` are not in that ledger.
- `apply_provider_capture_observation` and `finalize_paid_order` still require `카드`.
- `begin_full_order_cancellation` still raises `cancellation_method_unsupported` unless the method is `카드`.
- `claim_full_order_cancellation`, `mark_full_order_cancellation`, and `finalize_full_order_cancellation` contain no method gate.
- Live `prosrc` is one byte longer than the local function text. The compared prefix is a one-line shift from a leading newline. No second byte remains for a logic change.

`scripts/sql/easypay-method-acceptance.sql` is the unapplied correction. It changes only the accepted method set to `카드`, `CARD`, `간편결제`, `EASY_PAY` in capture, finalization, and cancellation begin. Merchant, ownership, payment key, `DONE`, server amount, transaction key, idempotent PAID finalization, and the existing cancellation-row return stay in place. It is not a migration.

`scripts/sql/historical/20261024120000_new7_capture_recovery.sql` is the source contract for the recovery verifier. It is not the current production function and must not be copied into `supabase/migrations` or applied.

The checkout card on this branch remains the accepted single card. Wallet marks stay the existing temporary drawings. This merchant's enabled wallet list was not verified.

## Do not

- Do not apply the SQL patch without a separate Owner approval.
- Do not deploy this branch without a separate Owner approval.
- Do not insert ledger rows or run `supabase db push`.
- Do not start a live charge, cancellation, or refund to test it.
- Do not apply the historical capture file.
