# NEW 2 P0.9B-R1 — Before User Created service_role ACL source remediation

Status: **DONE** (source checkpoint; production ACL **not** mutated)

Date: 2026-10-01

Decision: Production hook source must explicitly `REVOKE ALL ON FUNCTION public.hook_before_user_created(jsonb) FROM service_role` because CREATE FUNCTION default privileges granted an **explicit** `service_role=X/postgres` ACL. Do **not** `ALTER DEFAULT PRIVILEGES`. Live REVOKE is **not** applied in this ticket. Hosted mapping stays blocked. `supabase db push` remains **FORBIDDEN**.

A5 independently reviewed P0.9B-R1: **PASS — READY FOR CHECKPOINT**. Source `service_role` revoke, PUBLIC/anon/authenticated revokes, `supabase_auth_admin` grant, no `ALTER DEFAULT PRIVILEGES`, unchanged hook policy body, verifier 37/37, inspection ledger KEEP. Production live ACL remains defective until later apply. Do **not** mark P0.9B certified.

---

## Status

| Item | Value |
|------|--------|
| P0.9B function install | Applied; **A5 BLOCKED certification** (service_role EXECUTE) |
| P0.9B-R1 source | Explicit `service_role` REVOKE added |
| A5 | **PASS — READY FOR CHECKPOINT** |
| Live ACL remediation | **NOT APPLIED** |
| Hosted mapping | **NOT DONE** |
| P0.9B certified | **NO** |
| Next | **GPT REVIEW**. Do not apply live REVOKE from this checkpoint. |

---

## Root cause

P0.9B SQL revoked PUBLIC / anon / authenticated only. Postgres/Supabase default function privileges still granted `service_role` EXECUTE at CREATE OR REPLACE. A5 live ACL: `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}`.

---

## Intended ACL

- owner `postgres` (do not revoke owner)
- EXECUTE `supabase_auth_admin` YES
- PUBLIC / anon / authenticated / `service_role` EXECUTE NO

---

## Payment-test

`scripts/sql/payment-test-2f-b2b-before-user-created.sql` has the **same omission** (no `REVOKE ... FROM service_role`). Left **unchanged** in this ticket. Follow-up only; do not mutate payment-test DB here.

---

## Migration ledger (read-only)

`supabase_migrations.schema_migrations` is **PRESENT**. Row count **1**. Version `20260826110000` only. Incomplete vs local migrations. Do not reconcile. Do not `db push`.

P0.8 reported ABSENT from a partial inspect. This classified `LIVE_DB_URL` inspect supersedes that.

---

## Do Not Do

- Do not apply the live REVOKE from this ticket
- Do not map Hosted Auth
- Do not `ALTER DEFAULT PRIVILEGES`
- Do not `supabase db push`
- Do not edit payment-test hook SQL in this ticket
- Do not open NEW 3 / NEW 4

---

## Resume Condition

Source checkpoint complete. Dedicated later ticket: apply the updated SQL (or the `service_role` REVOKE) on production → live ACL reverify → only then Hosted mapping.

---

## Ownership

A6.

---

## Relevant Files

- `scripts/sql/production-2f-before-user-created.sql`
- `scripts/verify-new2-prod-before-user-hook.ts`
- `docs/operations.md`
- `scripts/inspect-prod-schema-migrations.ts` (read-only ledger fact check)
