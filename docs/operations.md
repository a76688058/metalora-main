# Metalora production operations

Minimal runbook for deploy, rollback, payment triage, incident response, and backup policy.
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

Rollback is **not automatic**. Use it only after recording current traffic and deciding a revision regression is the cause. Full incident wrapper: **#20G**.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rollback-production.ps1
```

- Script sends 100% traffic to the **stable-tagged** previous production revision. It does **not** retag `stable`.
- **CHECK** before: production revision, `stable` target, `deploy_sha`.
- **CHECK** after: exactly one revision at 100%; `GET /api/health` → 200 JSON `{"status":"ok"}`; `GET /` → 200 HTML.
- Do **not** run `scripts/verify-candidate.ps1` against production (it refuses when `candidate` aliases production).

---

## D. Payment incident triage

Payment **contracts** (#20C / #20D / #20J and the confirm-retry path) live here. Severity, contain, verify, and close: **#20G**. Dependency playbooks: **#20I**.

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

**#20F remains blocked** until scheduled backups, PITR, and a verified restore path exist. Do **not** treat production as backed up or restorable today. Do **not** invent a restore command.

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

Secret **review / rotation readiness** is **#20L** (later in this file). Do not rotate secrets as a first diagnostic step during an incident.

---

## H. Incident Response Runbook (#20G)

Roles: **operator** (executes checks/actions) and **incident owner** (classifies, decides contain/recover/close). One person may hold both.

Snapshot (read live; **not** a permanent identity): after #20D promote, production was `metalora-direct-00064-vat` @ 100% and `stable` was `metalora-direct-00061-yen`. Always re-read Cloud Run traffic.

### Principles

1. Preserve evidence first.
2. Prefer read-only diagnosis.
3. Stop further damage before any data repair.
4. Rollback the **application revision** when evidence points to a bad release.
5. Never fabricate commerce state.
6. Separate application recovery (traffic/revision) from data reconciliation (later approved plan / **#20M**).
7. Record exact revision, `deploy_sha`, and timestamps.
8. Validate recovery before closing.

**DO NOT**

- insert `order_items` by hand
- increment/decrement `profiles.total_spent`
- mark payment successful without evidence
- delete `payment_intents` to hide an anomaly
- replay destructive migrations during an incident
- change production secrets as a first diagnostic step
- change traffic without recording the previous production / `stable` / percent split
- invent a DB restore while **#20F** is blocked

### Severity

| Level | Meaning | Examples |
|---|---|---|
| **SEV-1** | Critical production | Storefront broadly down; checkout/payment broadly down; confirmed payment with missing/inconsistent order **at scale**; production DB unavailable; widespread integrity failure |
| **SEV-2** | Material degradation | Partial provider failures; one dependency degraded; repeated `#20D` alerts; isolated `recovery_required`; admin-critical workflow down |
| **SEV-3** | Limited / non-critical | Isolated user issue; non-critical dependency warning; low-impact operational defect |

Isolated `recovery_required` with one `order_number` is typically **SEV-2** (HIGH reconciliation, not automatically SEV-1). Scale / DB-down / storefront-down is **SEV-1**.

### Universal flow

**A. DETECT** — Record time and source (Discord `#20D`, Cloud Logging, user report, checklist).

**B. CONFIRM** — Safe reproduce only. **CHECK:** `GET https://metalora.art/api/health` → 200 `{"status":"ok"}`; `GET https://metalora.art/`; Cloud Run production revision, traffic percents, `stable` tag, `DEPLOY_SHA`. Also hit the Cloud Run **service URL** if the public origin is in doubt (**#20I-D**).

**C. CLASSIFY** — SEV-1/2/3 and class: application / payment / database / dependency / DNS.

**D. CONTAIN** — Stop deploy/promote. Preserve state. Rollback **only** if a release regression is evidenced (section below). No DB mutations.

**E. DIAGNOSE** — `deploy_sha`, `request_id`, `order_number`, `payment_event`, Cloud Run logs, `#20J` SELECT-only queries. Do not use GA4 (**#22**).

**F. RECOVER** — Application: approved rollback script if justified. Dependency: wait/retry per **#20I**. Payment: authenticated `POST /api/payment/confirm` retry only (section D). No manual reconstruction. No settlement/cancel-refund procedures (**#24**).

**G. VERIFY** — `/api/health`, `/`, relevant API, production revision, 100% on exactly one revision, `stable` unchanged unless a later ticket retags it, relevant `#20J` query if commerce-related.

**H. CLOSE** — Fill the incident record below. Remaining risk + follow-up ticket. Formal post-incident reconciliation verification is **#20M** (not this runbook).

### Application / release incident

**CHECK**

1. Production revision, percent, `stable`, `candidate`, `DEPLOY_SHA`.
2. Whether `/api/health` and `/` fail on **public origin**, **service URL**, or both.
3. Cloud Run logs for the **current** production revision.

**ACTION** (suspected bad production revision)

1. Record production + `stable` **before** any traffic change.
2. Stop `deploy-candidate` / `promote-candidate`.
3. If rollback is justified, run **only**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\rollback-production.ps1
   ```
4. Confirm exactly one revision has 100% traffic and it equals the pre-recorded `stable` target.
5. Smoke: `GET /api/health`, `GET /` on `https://metalora.art` (and service URL if needed).
6. Keep the failed revision identity for the incident record. Do not delete it as cleanup.

**DO NOT** auto-rollback. **DO NOT** promote a new candidate as the first recovery. **DO NOT** use ad-hoc `gcloud run services update-traffic` unless the approved script cannot run — and then only to the already-recorded `stable` revision. `scripts/verify-candidate.ps1` is for an **isolated 0% candidate**, not production.

### Payment incident

Use section **D** contracts. Sequence:

1. Capture `order_number`, `request_id`, `deploy_sha`, `payment_event`, time window. No name/address/phone/email/`paymentKey`.
2. Cloud Logging: `[PAYMENT_OPS_FAILURE]` filters in section D. Discord is secondary (**#20I-E**).
3. Classify:
   - provider failed **before** confirmation (`alert_eligible` may be false; not a page)
   - provider confirmed / Toss `DONE` but finalize failed → `recovery_required=true` → reconciliation-required **HIGH**
   - integrity mismatch / ownership / amount
   - benign idempotent replay (`already_finalized`)
4. If data-state must be confirmed: `#20J` SELECT-only (especially #20J-1, #20J-2, #20J-3, #20J-4). No auto-repair.
5. Recover only via authenticated confirm retry (GET lookup + idempotent `finalize_paid_order`).
6. Live Toss keys, real settlement, cancel/refund: **#24**. Do not claim they exist here.

**DO NOT** fabricate orders, `order_items`, `payment_finalized_at`, or `total_spent`. **DO NOT** retry Toss approval from SQL.

### Database / data incident

Current capability is section **E**: Free plan, no scheduled DB backups, PITR not available as a restore path, no verified restore drill, Storage objects not covered. **#20F blocked.**

**CHECK** — Preserve logs and `#20J` SELECT results (affected ids / time window). Identify whether auth, payment finalize, or both fail.

**ACTION** — Stop mutation-heavy troubleshooting. Do not weaken RLS. Do not switch Cloud Run at the payment-test project. Do not restore (no restore exists). Escalate any destructive action; it needs a **separate approved recovery plan**, not this runbook.

**DO NOT** call the system backed up or recoverable today.

### Incident record template

Do not record customer name, address, phone, email, `paymentKey`, or secrets.

```
Incident ID / date:
Severity (SEV-1 / SEV-2 / SEV-3):
Detection source:
Start time:
Affected service/path:
Production revision (before):
Stable revision (before):
deploy_sha:
request_id(s):
order_number(s):
Observed symptoms:
Evidence (log markers / #20J query ids only):
Containment:
Recovery action:
Verification performed:
Remaining risk:
Follow-up ticket:
Close time:
Production revision (after):
```

### Stage boundaries

Admin access operations: **#20K**. Periodic security maintenance: **#20L** (later in this file). Not implemented here: **#20M** formal post-incident reconciliation verification; **#21** SEO; **#22** GA4; **#23** device QA; **#24** live Toss / settlement / cancel-refund / legal launch / fulfillment.

---

## I. Operational Checklist (#20H)

Cadence is practical, not automated. No cron / Cloud Monitoring in this stage.

### Daily / active-commerce

- [ ] `GET https://metalora.art/api/health` → 200 `{"status":"ok"}`
- [ ] Exactly one Cloud Run revision at 100% traffic
- [ ] Review `#20D` Discord / `[PAYMENT_OPS_FAILURE]` `alert_eligible=true`
- [ ] Review `recovery_required=true` events
- [ ] If commerce activity exists: `#20J-1`, `#20J-2`, `#20J-3`, `#20J-4` (SELECT-only)
- [ ] Note unresolved incident follow-ups

### Weekly

- [ ] Cloud Run error patterns (not a full recertification)
- [ ] `[DISCORD_OPS_ALERT_ERROR]` / missing Discord vs present payment logs
- [ ] `#20J-5` profile/member queries
- [ ] `#20J-6` catalog/soft-stock (not physical inventory)
- [ ] `stable` still points at a sensible previous production revision
- [ ] Outstanding `recovery_required` cases

### After every production deploy

Candidate (0%): `scripts/verify-candidate.ps1` (isolation + health + `/` + unknown `/api` JSON 404 + headers + HTML cache).

After promote / on production:

- [ ] Production revision and `DEPLOY_SHA`
- [ ] 100% on exactly one revision; no split
- [ ] `stable` recorded (must remain pre-promote production)
- [ ] `GET /api/health`, `GET /`
- [ ] Unknown `/api` → JSON 404 (not SPA HTML) if that contract is in scope
- [ ] No unexpected `#20D` alerts

Do **not** run `verify-candidate.ps1` after promote (candidate tag will alias production; script refuses).

### After payment incident

- [ ] Correlate `#20C` logs (`request_id` / `order_number` / `payment_event`)
- [ ] Review `#20D` alert if `alert_eligible=true`
- [ ] Run relevant `#20J` query
- [ ] Confirm order/`payment_finalized_at` via existing recovery path only
- [ ] Record follow-up on the incident template

### Monthly / periodic (#20H only)

- [ ] This file still matches live architecture (service, traffic model, scripts)
- [ ] Backup status (section E) has not silently changed; **#20F** still blocked unless newly verified
- [ ] Unresolved operational risks listed
- [ ] **#20K** admin roster review (`docs/ops-admin-queries.sql` A/E)
- [ ] **#20K** unexpected/orphan admin-state check (queries B/C/D)
- [ ] **#20K** unresolved privilege-change review (query F is metadata only, not an audit log)
- [ ] **#20L** security query pack + dependency advisories (`docs/ops-security-queries.sql`, `npm audit` / `npm outdated`)

### After admin access change (#20K)

- [ ] Re-query authoritative `profiles.is_admin` roster
- [ ] Confirm exactly the intended profile id has (or no longer has) admin
- [ ] Record evidence on the change/incident template (no PII / no secrets)

Security maintenance, secret rotation, RLS regression cadence: **#20L** (not this checklist).

---

## J. External Dependency Incident Response (#20I)

Use the universal flow in **#20G**. These playbooks classify **which** dependency.

### A. Cloud Run (`metalora-direct`, `us-west1`, project `metalora-auth`)

**Symptoms:** health failure, 5xx, revision startup failure, wrong revision/traffic, candidate/prod drift.

**CHECK:** production revision; traffic percents; `stable`; `DEPLOY_SHA`; revision logs; `GET /api/health`.

**ACTION:** stop deploy/promote; decide revision-vs-dependency; rollback **only** if release-related using `scripts/rollback-production.ps1`; verify 100% + smoke.

**DO NOT:** retag `stable` during incident recovery; probe production with `verify-candidate.ps1`.

### B. Supabase (production project host `qifloweuwyhvukabgnoa.supabase.co`)

**Symptoms:** DB/API down; auth failures; `finalize_paid_order` / `[DB_FINALIZE_ERROR]`; unexpected RLS.

**CHECK:** whether auth, payment, or both fail; Cloud Run DB error markers; project status in the vendor dashboard (do not paste keys).

**ACTION:** wait/retry dependency recovery; after restoration, SELECT-only `#20J` + confirm-retry for incomplete payments.

**DO NOT:** weaken RLS; point production at the payment-test project; mutate commerce rows; invent a backup restore (**#20F** blocked).

### C. Toss Payments

**Symptoms:** provider network/HTTP errors; confirm failures; repeated `[PAYMENT_OPS_FAILURE]`.

**CHECK:** `payment_event`, `provider_code`, `recovery_required`; whether failure was **before** or **after** provider confirmation; vendor status **if** published (unknown URL: do not invent one).

**ACTION:** if provider may already have confirmed, do **not** blindly re-POST confirm from a second client; use existing GET-recovery + finalize path (section D). Correlate `#20J`.

**DO NOT:** manually mark paid. **Boundary:** live keys / real settlement / cancel-refund = **#24**.

### D. DNS / domain (`metalora.art`)

Canonical public origin is `https://metalora.art` (`BASE_URL` / server SEO origin). Registrar/DNS host is **not** documented here — do not invent it.

**CHECK:** public origin vs Cloud Run **service URL** from `gcloud run services describe` (status URL). TLS on the public origin. Apex reachability.

**If service URL works and `metalora.art` fails:** treat as DNS/domain/TLS. Do **not** rollback the application revision first.

**If both fail:** treat as Cloud Run / app (**#20I-A**).

### E. Discord (ops alert side channel)

**Symptoms:** `[DISCORD_OPS_ALERT_ERROR]`; alerts missing while `[PAYMENT_OPS_FAILURE]` logs exist.

**ACTION:** inspect Cloud Run logs (source of truth). Payment correctness first. Restore webhook delivery separately. Never print or rotate the webhook value in chat (**#20L** for rotation).

**DO NOT:** treat Discord outage as payment failure; send test webhooks during IR; recursive-page on `[DISCORD_OPS_ALERT_ERROR]`.

### F. CDN / edge

No separately managed CDN product is established. Google frontend / Cloud Run ingress is assumed. If a dedicated CDN is added later, write a playbook then. Do not tune a CDN that is not in the architecture.

---

## K. Admin Access Operations (#20K)

Do not redesign #16 / #17. There are **no role tiers** beyond boolean `profiles.is_admin`.

### Source of truth

| Item | Contract |
|---|---|
| Privilege state | `public.profiles.is_admin` (`boolean NOT NULL DEFAULT false`) |
| Client Admin UI | **Not** an authorization source. `AdminUsers` does not toggle `is_admin`. |
| `AdminLogin` | Signs in with Auth password, then **reads** `profiles.is_admin`. Non-admin keeps the member session (`#17`) and is denied `/admin`. |
| `ProtectedRoute(requireAdmin)` | Requires a session **and** `resolved.is_admin === true`. Does **not** require `user_custom_id`. |
| Member usable-profile | `isUsableMemberProfile` (non-blank `user_custom_id`) applies to member checkout/routes, **not** to admin routes. NULL username on an admin-provisioned profile is intentional (`#16C-1`). |
| RLS | Table policies / `profiles_is_current_user_admin()` consult the same `is_admin` column. |
| `server.ts` | No admin grant/revoke API and no `is_admin` checks. |

**Who can change `is_admin`:** trigger `profiles_guard_privileged_fields` (`#16A-0` / `#16C-1`) freezes `is_admin` (and `total_spent`) unless `auth.jwt() ->> 'role'` is `service_role`. Authenticated client JWTs cannot grant themselves admin. SQL-editor sessions that do **not** present a service_role JWT will keep the old `is_admin` value. Do **not** disable the trigger. Do **not** give service-role credentials to a human storefront user.

### Inventory

SELECT-only pack: `docs/ops-admin-queries.sql` (A roster, B orphan auth user, C NULL `is_admin`, D blank username, E count, F recent `updated_at` on admin rows).

### Periodic review

**Monthly:** run A/E; confirm every admin id still needs access; run B/C/D; glance at F as a hint only.

**After staff/operator change:** re-run roster immediately; revoke access that is no longer required (procedure below); do not delete profile/order history.

**After security incident:** re-review all admins; revoke suspect access; credential rotation only if exposure is evidenced (**#20L**); verify production after containment (**#20G**).

### Grant procedure

Live grant is **not** executed in this ticket and **must not** be pasted into the SELECT pack.

**Before:** verify target `profiles.id` (and `user_custom_id` if present) via query A; confirm an `auth.users` row exists (query B healthy for that id); confirm privilege is required; record who / why / date (incident template; no email/phone).

**During:** separately approved maintenance action only — DML that can actually change `is_admin` must run as **service_role JWT** (same class as `supabaseAdmin`). There is no in-app grant control.

**DO NOT:** edit `localStorage`; bypass/disable the privileged-fields trigger; weaken RLS; grant service-role to a person.

**After:** re-run query A/E; confirm **exactly** the intended id is admin; AdminLogin verification only when a later ticket explicitly approves a live login test; record evidence.

### Revocation procedure

Live revoke is **not** executed in this ticket.

**Before:** identify exact `profiles.id` (no ambiguous username-only match if username is NULL).

**During:** same authoritative mechanism as grant (`is_admin = false` via service_role JWT). Do **not** delete the profile or orders to remove privilege.

**After:** re-run query A; confirm the id is absent from the admin roster. If compromise is suspected, privilege removal **and** Auth session/account containment are **different** operations (below).

### Session / Auth limitation

These are **not** the same:

| Layer | What it does | Immediate effect of `is_admin = false` |
|---|---|---|
| A. Profile privilege | `profiles.is_admin` | RLS admin policies fail on the next DB request. Client UI may still show admin until `refreshProfile` / reload. |
| B. Auth session/JWT | Supabase Auth access token | **Not** invalidated by changing `is_admin`. Token does not carry the admin flag. |
| C. Account disable/delete | Vendor Auth user controls | Not implemented in this repo. Not the same as A or B. |

Client inactivity sign-out (30 minutes, admin session only) is **not** global revocation.

Immediate global session invalidation is **not proven** by current app code. For compromise: remove privilege (A) **and** use supported Auth sign-out/disable **only** via a separately approved vendor/Auth maintenance action (C/B). Do not mutate sessions from this ticket.

### Compromised admin playbook

1. Classify SEV (**#20G**). Suspected admin takeover is at least SEV-2; storefront-wide abuse is SEV-1.
2. Preserve evidence (roster SELECT results, Cloud Run log window). No PII in the record.
3. Identify exact `profiles.id`.
4. Revoke `is_admin` via the approved service_role mechanism; do not weaken Auth/RLS to “get back in”.
5. Re-run roster A/E for unexpected extra admins.
6. Review Cloud Run / Supabase evidence (not Discord as source of truth).
7. Rotate secrets **only** if this incident shows credential exposure (**#20L**).
8. Verify admin routes deny the id after containment; smoke production if the incident was SEV-1.
9. Follow-up record; formal reconciliation **#20M**.

### Audit logging — current reality

**No durable admin-action audit log exists.**

- `profiles.updated_at` is current-row metadata, not history, and may not change on privilege-only DML.
- Browser `console.*` is not an audit trail.
- Cloud Run logs do not prove who changed `is_admin` in SQL/Dashboard.
- `#20K` is review/change procedure, not an audit product. Do not add an audit table in this stage.

### Privacy

Query outputs: `profile_id`, `user_custom_id`, `is_admin`, timestamps, counts. Never email, phone, name, address, tokens, or service-role values.

---

## L. Periodic Security Maintenance (#20L)

Do **not** mutate secrets, RLS, packages, or runtime in this procedure. No auto-fix. No secret **values** in records or this file.

Catalog checks: `docs/ops-security-queries.sql` (SELECT-only). Admin roster: `docs/ops-admin-queries.sql` (**#20K**).

### Cadence

**Monthly (or before a major release):** secret-name inventory; `#20L` SQL pack vs last snapshot; `#20K` roster; `npm audit` + `npm outdated`; production config checks below.

**After any DB migration:** rerun SQL A–H; privileged guard (D) + SECURITY DEFINER inventory (E/F); expected objects (H).

**After auth/admin change:** `#20K` A/B/E; no policy/privilege regression.

**After security incident:** full checklist; rotate secrets **only** if exposure is evidenced; **#20G** contain/verify; **#20M** for formal reconciliation.

### Secret / key inventory (names only)

**SECRET** (Secret Manager on production Cloud Run; never commit values):

| Env name | Binding name (snapshot) |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `metalora-direct-supabase-service-role` |
| `TOSS_SECRET_KEY` | `metalora-direct-toss-secret-key` |
| `DISCORD_WEBHOOK_URL` | `metalora-direct-discord-webhook` |

**PUBLIC / CLIENT CONFIG** (not equivalent to service-role): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable anon key), `BASE_URL`, `DEPLOY_SHA`. Production fail-closed also requires the anon key to be **present** (blank-name check), but it is still not a service-role secret.

Repo placeholders: `.env.example`, `.env.payment-test.example`. Local files `.env*` stay gitignored except those examples. `.dockerignore` excludes `.env` / `.env.*` and `supabase/.temp/`.

Production (`metalora-direct-00064-vat` snapshot): `METALORA_ENV` unset (payment-test inactive). Re-read live env **names** on each review.

**Monthly review:** expected bindings only; no secret in git (`git grep` for `live_sk_` / webhook URLs / service-role JWT material); payment-test still isolated (`#18` guards).

**Rotate when:** suspected/confirmed exposure; operator with secret access leaves; provider requires it; secret appeared in logs/chat/tickets; incident evidence. Do **not** rotate on a calendar with no reason.

**Approved rotation sequence (no values in commands):** (1) identify secret **name**, (2) create new provider credential/version, (3) update Secret Manager / Cloud Run binding, (4) `scripts/deploy-candidate.ps1`, (5) `scripts/verify-candidate.ps1`, (6) promote only after gate, (7) production smoke, (8) revoke **old** credential only after the new one is proven, (9) record evidence without values.

### RLS / policy regression

Run `docs/ops-security-queries.sql`. Compare to the previous saved inventory. Unexpected new public table without RLS, missing `trg_profiles_guard_privileged_fields`, or missing `finalize_paid_order` = HIGH. Broad `PUBLIC`/`anon` policies are **REVIEW**, not automatic bugs (catalog product/banner reads are expected). Do not ENABLE/DROP RLS from the pack.

### Dependency / supply-chain

No Dependabot / GitHub Actions security workflow is in this repo today.

**CHECK:** `npm audit`, `npm outdated`, lockfile diff, Dockerfile `node:22-bookworm-slim`, unexpected new direct deps.

**Classify:** CRITICAL = exploitable on a **reachable production** path. HIGH = material, prioritized. REVIEW = advisory, outdated, unused, dev-only, or unclear reachability (do not upgrade solely because a newer version exists).

**Remediation (separate ticket):** identify package/version → production reachability → smallest compatible change → lint/build → candidate if runtime-affecting → promote gate → record CVE/advisory id. **Do not `npm audit fix` in this stage.**

**Hygiene (do not remove in #20L):** `@google/genai` has no `src/` import (AI Studio leftover README still mentions Gemini). `better-sqlite3` likewise unused in app source. Classify as NON-BLOCKING dependency-surface reduction.

**#20L inspection snapshot (do not fix here):** `npm audit` reported 18 issues (3 low, 4 moderate, 10 high, 1 critical=`protobufjs`). Vite advisories in the report are largely **dev-server** class; production image serves Express + prebuilt `dist/client`. Treat as REVIEW until a ticket proves production reachability. `npm outdated` lists many wanted/latest bumps — not automatic upgrades.

### Production security-config review

**CHECK** (contracts already closed in `#18`/`#19`; do not reopen unless drift):

- Production Supabase host lock (`qifloweuwyhvukabgnoa.supabase.co`); payment-test must not point at it
- `METALORA_ENV` absent on production; cross-write guards on prepare/confirm
- Fail-closed required env **names** at boot
- Headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, production `HSTS`
- HTML `Cache-Control: no-cache`; hashed assets may be immutable
- `trust proxy` = true (GCP); `x-powered-by` disabled
- Unknown `/api` → JSON 404
- `.env*` / `supabase/.temp/` ignored in git and Docker context
- Secret Manager binding **names** match the table above

CSP and application rate limiting are **deferred** (server comment: no CSP). No evidence in this inspection to implement them in #20L. No WAF/SIEM/new vendor.

### Admin cross-check

Use **#20K**. There is **no** durable admin audit log.

### Vulnerability / finding record

```
Finding ID / date:
Source/tool (npm audit / SQL pack / config review):
Affected component:
Severity (CRITICAL / HIGH / REVIEW):
Evidence (advisory id, query letter — no secrets/PII/paymentKey):
Production reachability:
Remediation owner / ticket:
Verification:
Closure date:
```

### Operator checklist

**Source / repo:** unexpected secret files; ignore rules intact; lockfile reviewed; no surprise dependencies.

**Cloud / runtime:** production revision; Secret Manager **names**; payment-test off; `/api/health`; security headers.

**Database:** SQL A–H; privileged guard present; SECURITY DEFINER inventory reviewed.

**Admin:** `#20K` roster / orphans / still-required access.

**Alerting:** `#20C` / `#20D` still in `server.ts` + this file; `[DISCORD_OPS_ALERT_ERROR]` reviewed.

**Backup:** section E; **#20F still blocked** on Free plan — do not mark backup healthy.

**DO NOT:** auto-fix; print secret values; disable the privileged-field trigger; invent restore.
