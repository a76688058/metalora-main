# NEW 2 P0.5 — Production Docker runner boot

Status: **DONE** (source packaging checkpoint). **CURRENT LIVE STATE SUPERSEDED** by `docs/decisions/NEW-2_production-release.md` (P1 Cloud Build / `metalora-direct-00093-car` **CERTIFIED**). Historical body below is the P0.5 source checkpoint only.

Date: 2026-10-01

Decision: The Cloud Run runner image copies all top-level `src/lib/*.ts` modules so `tsx server.ts` can resolve the NEW2 auth runtime graph. Auth behavior, SMS vendor choice, and production mutation are out of scope.

A5 independently reviewed this source fix: **PASS — READY FOR CHECKPOINT**. Classification: **SOURCE FIX PASS**. **IMAGE BUILD VERIFICATION DEFERRED TO P1 CLOUD BUILD.**

---

## Status

| Item | Value |
|------|--------|
| NEW 2 | **CLOSED** (customer UX); production deploy still **BLOCKED** on later P1 parity |
| P0.5 | **DONE** — Docker runner packaging source checkpoint |
| A5 | **PASS — READY FOR CHECKPOINT** |
| Production | **UNCHANGED** |
| Next | **GPT REVIEW**. Do **not** deploy. Do **not** open NEW 3 / NEW 4. |

---

## Decision

`server.ts` boots via `tsx` in the runner stage. Vite’s builder `COPY src` does not survive into the runner. Copying only `supabaseHosts.ts` and `paymentEnvGuard.ts` cannot boot NEW2.

Required packaging: `COPY src/lib/*.ts ./src/lib/`.

That covers the current graph (OTP / password / social handlers and transitive top-level `src/lib` modules) without copying client `customComposition/` or introducing a second server build.

---

## Completed

- Dockerfile runner COPY expanded from two files to `src/lib/*.ts`
- Structural + host runtime verifier: `npm run verify:new2-docker-runner` (**31/31**)
- `.dockerignore` unchanged (`.env` / `.env.*` already excluded)
- Auth business logic **not** edited

---

## Docker verification truth

**PASS:**

- source import graph coverage
- host tsx runtime import
- host server boot
- host `/api/health` 200
- no missing-module errors

**NOT YET VERIFIED:**

- actual Docker image build
- actual container boot

Do **not** write “Docker build PASS”.

**IMAGE BUILD VERIFICATION DEFERRED TO P1 CLOUD BUILD.**

This workstation has **no Docker CLI/engine**; image build/container filesystem were not executed here.

---

## P1 hard gate (before any traffic promotion)

Eventual P1 candidate deployment must satisfy **before** any traffic promotion:

1. Cloud Build succeeds
2. new candidate revision created at **0%** traffic
3. candidate boots
4. candidate `/api/health` = 200
5. no `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND`
6. smoke passes on candidate URL
7. only then may traffic promotion be considered

Failure at any step: **NO PROMOTION**.

---

## Blocker / Open Item

Still **not** production-deployable until later tickets:

- production SMS provider
- production NEW2 schema/RPC parity
- `PHONE_IDENTITY_KEY`
- `OTP_PEPPER`
- Before User Created production hook
- Google/Kakao/Naver production Auth parity
- redirect/Site URL verification
- P1 Cloud Build/image/container proof

---

## Do Not Do

- Do not revert the runner to the two-file COPY
- Do not copy `.env` or payment-test secrets into the image
- Do not choose or add an SMS vendor here
- Do not apply production migrations or deploy from this ticket
- Do not open NEW 3 / NEW 4 from this note
- Do not mix preserved A3 WIP into a production deploy worktree
- Do not claim Docker image build PASS

---

## Resume Condition

Source packaging is check-pointed. Production P1 remains a separate mutation ticket after remaining blockers.

---

## Resume Procedure

1. Confirm Dockerfile runner copies `src/lib/*.ts`
2. `npm run verify:new2-docker-runner`
3. P1 Cloud Build + 0% candidate + `/api/health` — **not this ticket**
4. Do not deploy until remaining P0 blockers are resolved and the P1 hard gate PASSes

---

## Ownership

A6 (packaging / production image). A1/A3 UI and auth business logic frozen. A0 owns this checkpoint.

---

## Relevant Files

- `Dockerfile`
- `scripts/verify-new2-docker-runner.ts`
- `docs/operations.md` (image contract note + P1 gate)
- `server.ts` (import graph; not edited by P0.5)
