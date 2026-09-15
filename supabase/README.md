# Supabase schema source of truth

## Authoritative state

**Live Supabase is currently authoritative.**

Incremental hardening and constraints live in `supabase/migrations/*`. Those files document changes applied to the shared production project (and test project). They are not a complete bootstrap from an empty database.

## Historical files (do not replay)

| File | Status |
|------|--------|
| `../supabase-schema.sql` | Historical bootstrap DDL only. Structurally stale vs live (e.g. `products.id` type, `order_items` shape, `inquiries` vs `cs_inquiries`). |
| `../supabase_security_setup.sql` | Pre-#16A RLS snapshot. Contains permissive/stale policies. |

**Never replay historical bootstrap SQL against production or shared Supabase.**

## Fresh-project baseline

The current migration chain assumes an existing live-shaped schema. It is **not sufficient** to bootstrap an empty project.

A trustworthy baseline must come from an **authoritative live schema export** (schema-only, no data), not from manually guessing current DDL.

### Isolated payment-test (`metalora-payment-test`) — #18C

Production must stay untouched. Do not replay `supabase-schema.sql` or `supabase_security_setup.sql`. Do not dump or restore customer data.

1. Copy `.env.payment-test.example` → `.env.payment-test.local` and fill **TEST** API values only. File is gitignored.
2. Copy `.env.payment-test.db.example` → `.env.payment-test.db.local` (gitignored). Fill `LIVE_DB_URL` and `PAYMENT_TEST_DB_URL` locally. Do not paste URIs into chat. Dashboard path: Project Settings → Database → Connection string → URI (Direct or Session pooler, not port 6543). Password is the database password, not the service_role JWT.
3. Dump/restore tools: **Docker is not required.** Prefer `npx supabase db query --db-url` (direct Postgres wire protocol). `supabase db dump` still needs Docker — do not use it on this machine. PostgreSQL `psql`/`pg_dump` are optional.
4. Preflight (no remote apply): `npm run bootstrap:payment-test-schema`
5. Apply live catalog → payment-test via CLI query (after URIs are full Supabase URIs): `npm run bootstrap:payment-test-schema -- --apply`

Dashboard SQL alternative (no CLI URI needed). Do **not** open results in Excel (CP949 corrupts Korean). Discard any previous giant `apply_sql` blob.

1. Production SQL editor: run `scripts/sql/extract-live-utf8-check.sql`. Require `has_gogaek/has_jepum/has_gibon` true and live hex = `eab3a0eab09d` / `eca09ced9288` / `eab8b0ebb3b8`.
2. Production: run `scripts/sql/extract-live-finalize-paid-order.sql`. `function_ddl` must show `고객` / `제품` / `기본`. `utf8_ok` must be true.
3. Production: run `scripts/sql/extract-live-public-ddl.sql`. Copy the `ddl` column **row by row in stmt_no order** (or concatenate `ddl` only). Do not copy `ddl_utf8_b64` into the SQL editor as if it were SQL.
4. TEST project SQL editor only (URL contains `bvihpoorwriejybixmoc`, never `qifloweuwyhvukabgnoa`): paste concatenated `ddl`. Do not apply until step 2 looks correct.
5. Production: run `scripts/sql/extract-live-auth-trigger.sql`. Copy `trigger_sql`.
6. TEST only: `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;` then paste `trigger_sql`.
7. TEST: run `scripts/sql/verify-payment-test-schema.sql`.

6. Incremental files in `supabase/migrations/` are **not** an empty-DB bootstrap. Apply a file to the test project **only if** the dump is missing that object, in this order:

1. `20260826110000_16a0_profiles_privileged_fields_guard.sql`
2. `20260826120000_16a1_orders_order_items_rls.sql`
3. `20260826130000_16a2_products_public_write_lockdown.sql`
4. `20260829140000_16a3_profiles_privacy_helpers.sql`
5. `20260829150000_16a3_profiles_close_public_select.sql`
6. `20260829160000_16a4a_cs_inquiries_rls.sql`
7. `20260829170000_16a4b_cart_items_rls.sql`
8. `20260829180000_16a4c_banners_rls.sql`
9. `20260829190000_16b1_user_scoped_indexes.sql`
10. `20260829200000_16b2a_payment_core_constraints.sql`
11. `20260829210000_16b2b_cart_cs_banners_constraints.sql`
12. `20260829220000_16b3a_product_title_integrity.sql`
13. `20260829230000_17a2_harden_profile_creation_trigger.sql` (function only; trigger must be copied from live `auth.users`)
14. `20260830000000_17b2_orders_user_id_not_null.sql`
15. `20260830100000_18a1_finalize_paid_order_rpc.sql`
16. `20260830110000_18b1_payment_intents.sql`
17. `20260914010000_16c1_profiles_username_contract.sql`

After apply, confirm tables/functions/grants on the **test** project (`scripts/sql/verify-payment-test-schema.sql`). Expected row counts after schema-only restore: 0 for profiles/orders/order_items/payment_intents/cart_items unless system rows exist.

7. Seed **test** catalog/auth only (no production customer PII). Do not seed until schema verification passes. Payment E2E needs at least one sellable product and one member (`@metalora.me` signup). Enable Email auth on the test project; isolated test may disable confirm-email.

Run the app with `npm run dev:payment-test`. Isolated Toss TEST checkout is allowed only against the payment-test project. Do not use production hosts or live Toss keys. #18 is CLOSED.

## Deferred schema topics

- `profiles.user_custom_id` NOT NULL (legacy / admin-provisioned NULL rows). #16C / 16c1 is the closed username contract in `supabase/migrations/20260914010000_16c1_profiles_username_contract.sql`. Do not replay it casually; it is source-of-truth history, not a deploy step.
- `orders.status` normalization (mixed EN/KR values in app; no CHECK yet)

## #16C profile contract (source of truth in repo)

- Member login id = `profiles.user_custom_id` (not a separate `username` column).
- Auth email for members = `{lowercase username}@metalora.me`.
- Existence lookup = `profiles_username_exists` (trim + case-insensitive after 16c1 apply).
- Client cannot change `is_admin`, `total_spent`, or a non-null `user_custom_id` (privileged-fields trigger).
- Profile creation = `auth.users` trigger `handle_new_user` only (no client INSERT policy).

## Later repo cleanup (not done here)

- `src/pages/AdminBanners.tsx` embedded bootstrap SQL
- `src/types/database.ts` phantom product fields
