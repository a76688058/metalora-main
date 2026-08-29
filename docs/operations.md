# Metalora production operations

Minimal runbook for deploy, rollback, payment triage, and backup policy.
Do not store secret values in this document.

---

## A. Current production architecture

```
GitHub main
  → Cloud Build (scripts/deploy-candidate.ps1)
  → Artifact Registry image (tagged with short git SHA)
  → Cloud Run service: metalora-direct (us-west1)
```

Traffic model:

| Tag | Role |
|-----|------|
| *(untagged / percent traffic)* | Live production traffic (100% on one revision) |
| `candidate` | Zero-traffic revision under test |
| `stable` | Previous production revision — rollback target |

Scripts (authoritative automation):

- `scripts/deploy-candidate.ps1` — build image, deploy **no-traffic** candidate, tag `stable` = current prod
- `scripts/promote-candidate.ps1` — route 100% traffic to the **existing** `candidate` revision
- `scripts/rollback-production.ps1` — route 100% traffic to the `stable` revision

Do not hardcode a permanent “current revision” name here; always read Cloud Run traffic.

---

## B. Deploy procedure

1. Working tree clean (`git status --short` empty).
2. On `main`, local `HEAD` aligned with `origin/main`.
3. Deploy candidate:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\deploy-candidate.ps1
   ```
4. Focused candidate validation (examples):
   - `GET {candidate-url}/api/health` → 200
   - `GET {candidate-url}/` → 200
   - ticket-specific checks (headers, payment, etc.)
5. Promote the **exact tested** candidate revision:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\promote-candidate.ps1
   ```
6. Verify production `/api/health` and `/`.
7. Confirm `stable` still points at the previous production revision (rollback target).

**Do not rebuild between candidate validation and promotion.**  
Promotion must move traffic to the already-tested revision only.

---

## C. Rollback procedure

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rollback-production.ps1
```

- Rollback sends 100% traffic to the **stable-tagged** previous production revision.
- After rollback, verify:
  - `GET /api/health` → 200
  - `GET /` → 200

---

## D. Payment incident triage

### Architecture (new payment path)

```
payment_intents (immutable pre-Toss snapshot)
  → Toss approval (POST confirm, or GET recovery if already approved)
  → finalize_paid_order RPC
  → orders.payment_finalized_at set (new-flow completion marker)
```

Completion authority for new payments is **`payment_finalized_at`**, not `status` alone.

### Customer reports: “payment succeeded but order is missing”

1. Obtain **`order_number` only** (Toss `orderId`, e.g. `ORD-…`). Do not collect unnecessary PII for triage.
2. Search Cloud Run logs for that `order_number` / `orderId`.
3. Look for markers such as:
   - `[PAYMENT_START]`
   - `[PAYMENT_TOSS_ERROR]`
   - `[PAYMENT_TOSS_RECOVERY]`
   - `[DB_FINALIZE]`
   - `[DB_FINALIZE_ERROR]`
   - `[PAYMENT_RECOVERY_REQUIRED]`
   - `[DISCORD_ERROR]` (notify-only; not payment failure)
4. Run the read-only queries in `docs/ops-payment-queries.sql`.
5. **Do NOT** manually increment `profiles.total_spent`.
6. **Do NOT** manually insert `order_items`.
7. **Do NOT** retry Toss approval manually from SQL.
8. The normal authenticated `POST /api/payment/confirm` retry path is designed to recover an already-approved Toss payment via **GET lookup** + **idempotent** `finalize_paid_order`.

### Legacy rows (`payment_finalized_at IS NULL`)

- Confirm may return 409 (`[PAYMENT_RECOVERY_REQUIRED]`).
- Do **not** auto-repair.
- Inspect manually / treat as a separate legacy case.

---

## E. Supabase backup status

**Verified current state (as of #20A-1):**

| Item | Status |
|------|--------|
| Supabase plan | Free |
| Scheduled backups | Unavailable on current plan |
| PITR | Not verified / not active |
| Current automated DB recovery | None |

**Operating policy:**

- Keep Free plan during development / before the first real customer purchase.
- **Immediately after the first real customer purchase**, upgrade Supabase to a paid plan.
- After upgrade, verify scheduled backups are active.
- Record retention / latest backup status after upgrade.
- Until then, **never assume** Supabase can automatically restore production data.

Database backups do **not** automatically imply that Storage object files have a separate backup strategy.

---

## F. Database migration rule

- Files in `supabase/migrations/` are **incremental** history applied to the shared live project.
- Old bootstrap SQL (`supabase-schema.sql`, `supabase_security_setup.sql`) is **deprecated** — never replay against production.
- Do not reconstruct a fresh production DB by blindly running historical bootstrap files.
- Migration headers must reflect live applied state.
- Shared Supabase means migration changes affect **production and candidate** Cloud Run revisions that use that database.

See also `supabase/README.md`.

---

## G. Secrets (names only)

**Required in production** (fail-fast at boot if blank):

- `SUPABASE_SERVICE_ROLE_KEY`
- `TOSS_SECRET_KEY`
- `VITE_SUPABASE_ANON_KEY`

**Optional / current:**

- `DISCORD_WEBHOOK_URL`
- `BASE_URL`
- `DEPLOY_SHA` (set by deploy-candidate; used for log correlation)
- `PORT`
- `VITE_SUPABASE_URL` (server has a URL fallback; not fail-fast-required)

Never document secret **values**.

Secret rotation procedures are a future ops enhancement.
