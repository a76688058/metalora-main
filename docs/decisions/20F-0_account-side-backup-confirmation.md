# 20F-0 account-side backup confirmation

Status: DONE

Date: 2026-09-20

#20: CLOSED WITH DEFERRED RESTORE OBLIGATION (do not reopen)

#20F execution: **BLOCKED BY CURRENT FREE PLAN / DEFERRED UNTIL LIVE-COMMERCE PREPARATION**

#24: **NOT OPENED**

Decision: Record the 2026-09-20 production Dashboard confirmation (still Free; backup/PITR/restore UI unavailable) and lock the current pre-first-payment restore timing. Ordinary development may stay on Free. Live commerce may not.

This note does **not** upgrade Supabase, start restore work, open #24, or select a paid tier.

---

## Current account fact (2026-09-20)

Human inspected the production Supabase Dashboard and confirmed:

- Production plan remains **FREE**
- Scheduled backup configuration unavailable
- PITR configuration unavailable
- Restore capability / settings unavailable
- No upgrade performed
- No restore attempted

Do **not** invent: retention, backup schedule, paid-tier capability, or a specific paid plan.

---

## Historical old policy — SUPERSEDED

**OLD AFTER-FIRST-PURCHASE POLICY = SUPERSEDED**

Original `docs/operations.md` §E from `ee50e6a` (2026-08-29) stated:

- Keep Free during development / before the first real customer purchase
- Upgrade to a **paid plan** immediately **after** the first real customer purchase
- Then verify scheduled backups / record retention

That wording is **not** current policy. Do **not** restore it.

---

## Supersession evidence

On 2026-09-16 the after-purchase upgrade rule was judged **OLD / TOO WEAK**.

Commit `ddc070d` (`docs(ops): enforce pre-payment restore gate (#20F)`) replaced it with the current hard gate: backup/restore capability **before** `#24` live-payment activation **or** the first real production customer payment, whichever would occur first.

Historical durable text said **paid plan**, not `Pro`.

---

## Current timing policy — LOCK

**CURRENT PRE-FIRST-PAYMENT RESTORE GATE = ACTIVE**

### During development / QA / pre-launch

Supabase may remain on **FREE**.

There is **no** requirement to upgrade merely because #23 has closed.

#20F is **not** an active implementation blocker for ordinary pre-launch development that does not cross live-payment boundaries.

### Before live commerce

Before either:

- `#24` live-payment activation, **or**
- the first real production customer payment

whichever would occur first, the project must satisfy the restore gate below.

Sequence:

**FREE DURING DEVELOPMENT** → **PAID CAPABILITY BEFORE FIRST LIVE PAYMENT** → **RESTORE GATE PASS** → **#24 / LIVE COMMERCE**

It does **not** mean:

**FIRST REAL PAYMENT** → **THEN UPGRADE**

---

## Exact pre-live-payment hard gate

Until all five items pass: production is **not** restorable; real customer payments must **not** be enabled or accepted.

1. Move to a plan that provides the backup capability required by #20F
2. Confirm scheduled database backups are active
3. Record PITR status if PITR is selected/enabled
4. Execute and record an isolated restore drill
5. Document Storage recovery status/path

Only after the restore gate passes may live-payment activation / first real payment proceed.

---

## Plan-name rule

Do **not** lock the word `Pro` as the project requirement.

Use: **a paid plan that provides the required #20F backup/restore capability**.

The exact Supabase paid tier is selected later from then-current provider capabilities and pricing. This ticket does **not** select a tier.

---

## Outstanding five #20F requirements

Still outstanding on the current Free plan:

1. Paid plan that provides required backup/restore capability — **not selected; not upgraded**
2. Scheduled DB backups confirmed active — **unavailable on Free**
3. PITR status recorded if selected/enabled — **unavailable / not configured**
4. Isolated restore drill executed and recorded — **not attempted**
5. Storage recovery status/path documented — **unverified**

`docs/operations.md` §E remains the A6 runbook snapshot and may be refreshed when #20F actually executes.

---

## #24 remains unopened

#24 live-payment activation is **NOT OPENED**.

This note does not open it.

---

## Do Not Do

- Do not restore the superseded after-first-purchase upgrade policy
- Do not treat one real sale as the trigger to upgrade afterward
- Do not force an immediate paid upgrade during ordinary development / QA / pre-launch
- Do not hard-code `Pro` as the required tier
- Do not invent retention, backup schedule, paid-tier capability, or pricing
- Do not change Supabase, upgrade the plan, start restore work, or execute a restore drill from this note
- Do not open #24
- Do not enable or accept a real production customer payment
- Do not reopen #20
- Do not reopen #21 / #22 / #23
- Do not deploy
- Do not treat #20F as a blocker for ordinary pre-launch work that does not cross `#24` or first-real-payment
- Do not modify `docs/operations.md` from this ticket (A6-owned; refresh when #20F executes)

---

## Resume Condition

When live-commerce preparation is ready: verify current Supabase paid-plan capabilities and start controlled #20F execution **before** `#24` / first real payment.

## Resume Procedure

1. Confirm production is still the intended live project.
2. Select a paid plan using then-current provider backup/restore capabilities (do not assume a historical `Pro` label).
3. After capability exists: scheduled backups → PITR status if used → isolated restore drill → Storage recovery docs.
4. Do **not** enable live payment until the five-item gate passes.
5. Refresh `docs/operations.md` §E under a dedicated A6/authorized ticket when capability actually changes.

## Completed

- 2026-09-20 account-side Free / no-backup confirmation recorded
- After-first-purchase policy classified SUPERSEDED
- Pre-first-payment restore gate locked as current policy
- Plan-name rule recorded (`paid plan`, not hard-coded `Pro`)

## Blocker / Open Item

#20F restore execution remains **BLOCKED** on current Free capability until live-commerce preparation. Isolation of a restore target is still undesigned. Do not use the payment-test project as a production-data restore target.

Ownership: A0 (this confirmation / timing lock). A6 owns `docs/operations.md` and production backup/payment authority when #20F executes.

Relevant Files: `docs/decisions/20F-0_account-side-backup-confirmation.md`, `docs/METALORA_PROJECT_STATE.md`, `docs/operations.md` (unchanged by this ticket)
