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

**Idempotency:** Toss `paymentKey` (PSP confirm) + `order_number` / Toss `orderId` (DB finalize). Do not invent a third key.

**Stock:** `products.options.stock` is a catalog availability flag checked at `/api/payment/prepare` only. It is not decremented and must not block finalize after Toss `DONE`.

### Customer reports: “payment succeeded but order is missing”

1. Obtain **`order_number` only** (Toss `orderId`, e.g. `ORD-…`). Do not collect unnecessary PII for triage.
2. Search Cloud Run logs for that `order_number` / `orderId`.
3. Look for markers such as:
   - `[PAYMENT_OPS_FAILURE]` (canonical #20C operational detection signal)
   - `[PAYMENT_START]`
   - `[PAYMENT_TOSS_ERROR]`
   - `[PAYMENT_TOSS_RECOVERY]`
   - `[DB_FINALIZE]`
   - `[DB_FINALIZE_ERROR]`
   - `[PAYMENT_RECOVERY_REQUIRED]`
   - `[DISCORD_ERROR]` (notify-only; not payment failure)
4. Run the read-only queries in `docs/ops-payment-queries.sql` (A–H volume/legacy, then **#20J** anomaly checks as needed).
5. **Do NOT** manually increment `profiles.total_spent`.
6. **Do NOT** manually insert `order_items`.
7. **Do NOT** retry Toss approval manually from SQL.
8. The normal authenticated `POST /api/payment/confirm` retry path is designed to recover an already-approved Toss payment via **GET lookup** + **idempotent** `finalize_paid_order`.

### Legacy rows (`payment_finalized_at IS NULL`)

- Confirm may return 409 (`[PAYMENT_RECOVERY_REQUIRED]`).
- Do **not** auto-repair.
- Inspect manually / treat as a separate legacy case.

### Payment Failure Detection (#20C)

Canonical Cloud Logging marker (server-side only; does **not** depend on GA4 or browser consent):

`[PAYMENT_OPS_FAILURE]`

Browser `reportPaymentFail` belongs to analytics (**#22**), not #20C. Do not use GA4 as an operational detector.

Each event is one JSON line (`ops_domain = "payment"`). Fields:

| Field | Meaning |
|---|---|
| `payment_event` | Stable machine code for the failure class (see taxonomy in server.ts). |
| `alert_eligible` | `true` = pager-worthy operational failure for **#20D**. `false` = recorded but not a page (e.g. Toss never approved). |
| `recovery_required` | `true` = external payment may have succeeded while internal finalize did not complete, or an unfinalized existing order. |
| `retryable` | `true` = a later authenticated confirm retry may still succeed. |
| `request_id` | Server-generated UUID for this single prepare/confirm request. Correlate logs; not stored in the database; not a client API field. |

`order_id` is the Toss/order_number string (`ORD-…`) when present. Unified events never include shipping PII, `paymentKey`, tokens/secrets, raw bodies, or raw provider payloads.

#### Cloud Logging queries

Scope (all queries):

```
resource.type="cloud_run_revision"
resource.labels.service_name="metalora-direct"
```

If Cloud Run parses the JSON line into `jsonPayload`:

**C. All payment operational failures**

```
resource.type="cloud_run_revision"
resource.labels.service_name="metalora-direct"
jsonPayload.message="[PAYMENT_OPS_FAILURE]"
```

**D. Alert-eligible only (#20D default)**

```
resource.type="cloud_run_revision"
resource.labels.service_name="metalora-direct"
jsonPayload.message="[PAYMENT_OPS_FAILURE]"
jsonPayload.alert_eligible=true
```

**E. Recovery-required**

```
resource.type="cloud_run_revision"
resource.labels.service_name="metalora-direct"
jsonPayload.message="[PAYMENT_OPS_FAILURE]"
jsonPayload.recovery_required=true
```

If a line is ingested as `textPayload` instead, search `"[PAYMENT_OPS_FAILURE]"` under the same `resource` filter, then inspect the JSON object on that line.

### Operational Alerts (#20D)

Discord is an operational side channel. Delivery success or failure **must not** change payment HTTP status, finalize/idempotency, or recovery behavior.

- **Failure ops alerts** (`alert_eligible = true`): bounded awaited delivery (2.5s timeout) so Cloud Run is less likely to drop the page. Discord still cannot change the original payment HTTP result.
- **Success notification:** operational side effect only. It is **non-blocking** and must **not** delay the successful payment response.

#### A. Trigger

Send a Discord **failure** alert only when:

`[PAYMENT_OPS_FAILURE]` AND `alert_eligible = true`

`alert_eligible = false` must **not** page Discord.

Browser `reportPaymentFail` belongs to analytics (**#22**) and is **not** an ops pager.

#### B. Priority

`recovery_required = true` is the highest payment-ops priority. Discord text is labeled **RECOVERY REQUIRED / CRITICAL OPERATIONS ACTION**.

#### C. Discord failure alert fields

Bounded operational fields only:

- `payment_event`
- `phase`
- `request_id`
- `order_id` (when present)
- `http_status`
- `provider`
- `provider_code`
- `retryable`
- `recovery_required`
- `deploy_sha`

#### D. PII policy

Discord alerts (failure **and** success) must **not** contain:

- customer / shipping name
- address / `address_detail`
- phone / email
- `paymentKey`
- raw request / provider payloads
- secrets (webhook URL, Toss keys, service role, JWT)

#### E. Success notification

First-finalize success notify still fires only when `already_finalized` is false.

The success HTTP response does **not** wait for Discord. Delivery uses the shared bounded transport as a non-blocking side effect.

Success Discord now includes order number, amount, payment method, and line items (title / option / qty / existing operational flags). It **excludes** shipping name, address, and `address_detail`. Phone and email are not included.

#### F. Discord delivery failure

If an **ops failure alert** cannot be delivered, Cloud Logging records:

`[DISCORD_OPS_ALERT_ERROR]`

Allowed fields: `payment_event`, `request_id`, `order_id` (when safe), HTTP status category, `deploy_sha`. No webhook URL, raw body, PII, or arbitrary error dump. This marker **must not** send another Discord notification.

Success-notify delivery failure remains `[DISCORD_ERROR]` (order_id only).

#### G. Operational action

For `recovery_required = true`:

- investigate payment / order reconciliation using Cloud Logging + `docs/ops-payment-queries.sql`
- do **not** manually fabricate `order_items`
- do **not** manually increment `profiles.total_spent`
- do **not** retry Toss approval from SQL
- use the authenticated confirm retry path / existing runbook

#### H. Boundary

GA4 / browser `reportPaymentFail` remains **#22**. It is not an operational detector and not a Discord pager.

### Commerce / data anomaly detection (#20J)

SELECT-only checks live in `docs/ops-payment-queries.sql` (sections **#20J-1** onward). They inspect database state. They do **not** page Discord, do **not** mutate rows, and do **not** replace #20C/#20D.

| Signal | Role |
|---|---|
| **#20C** `[PAYMENT_OPS_FAILURE]` | Runtime failure classification (Cloud Logging) |
| **#20D** Discord when `alert_eligible=true` | Ops pager for eligible runtime failures |
| **#20J** SQL pack | Data-state inconsistency after the fact |

Correlate a #20J row with logs using `order_number` (or profile/product internal id), `#20C` `request_id` when the time window is known, `deploy_sha`, and timestamp. Do **not** use GA4 (**#22**).

**Daily (or after a payment incident / commerce-affecting rollback):**

- #20J-1 amount mismatch (finalized intent vs order)
- #20J-3 payment identifier reuse
- A/F/G plus #20J-2 unmarked-order vs intent collision (finalized-order integrity)
- #20J-4 `profiles.total_spent` vs SUM of `payment_finalized_at IS NOT NULL` orders

**Weekly:**

- #20J-5 profile/member integrity (missing profile for commerce; member-domain username gap)
- #20J-6 catalog soft-stock / option structure

Also run the pack before **#24** launch readiness where relevant.

**Severity:** HIGH = money / recovery / identifier reuse / missing owner profile. REVIEW = catalog JSON / member-domain username gap / same-row key conflict. INFO = visible product with no purchasable option (may be intentional sold-out).

**Stock disclaimer:** `products.options.stock` is a prepare-time catalog flag, not a transactional inventory ledger. #20J-6 does not prove physical stock.

**Do not:** INSERT/UPDATE/DELETE from these results; manually increment `total_spent`; fabricate `order_items`; retry Toss from SQL.

No scheduler / cron / Cloud Monitoring automation in #20J.

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
- `VITE_SUPABASE_URL` (default `npm run dev` still has a production URL fallback; **payment-test does not** — `npm run dev:payment-test` fail-closes if `.env.payment-test.local` is missing or still points at production)

Isolated payment-test: copy `.env.payment-test.example` → `.env.payment-test.local` (gitignored). Required names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`. Toss TEST + production host is refused on `/api/payment/prepare` and `/api/payment/confirm`. Bootstrap and verify steps: `supabase/README.md`. #18 isolated TEST environment is CLOSED; do not use production hosts or live Toss keys in payment-test.

Never document secret **values**.

Secret rotation procedures are a future ops enhancement.
