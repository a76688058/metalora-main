# METALORA — remaining release pipeline

Status: **ACTIVE**

Date: 2026-10-11. Exit amendment: 2026-10-14.

Decision: This note is the only approved remaining release pipeline. Order is fixed: NEW5 → NEW6 → NEW7 → NEW8 → NEW9 → LIVE. NEW3 and NEW4 are **CLOSED**. Prior production promotion is not a NEW5 EXIT PASS.

Completed: NEW3 **CLOSED**. NEW4 **CLOSED**.

Blocker / Open Item: NEW5 EXIT PASS is not recorded. Nested policy dialog verification (item A) is mandatory before that exit and is **BLOCKED / NOT TESTED**. NEW6, NEW7, NEW8, and NEW9 are **NOT OPENED**.

Do Not Do: Do not change the order. Do not skip stages. Do not create a new stage without approval. Do not reopen a closed stage unless a regression requires it. Do not start NEW6, NEW7, NEW8, or NEW9 before the amended NEW5 EXIT PASS. Do not modify payment state before NEW7. Do not modify production database or storage without approved scope. Do not expand QA scope. Do not refactor during QA. Do not declare PASS without evidence. Do not treat a deferred check as PASS.

Resume Condition: Item A has independent PASS evidence on release candidate `09343023902096854f879e400db58dadeddd3056`, and this note still records every deferred check at its approved gate.

Resume Procedure: Finish the nested policy dialog check on an isolated payment-test runtime of this SHA. Then A5 read-only exit audit. Close NEW5 only on the amended FINAL QA PASS.

Ownership: A0 release governance. NEW5 execution is A5 read-only QA unless a later ticket assigns a write. NEW6–NEW9 payment, backup, and production gates stay A6.

Relevant Files: `docs/decisions/NEW-1_launch-pipeline-v3.md` (historical pipeline body; remaining-stage status points here), `docs/METALORA_PROJECT_STATE.md`.

Production at registration: `metalora-direct-00139-men` at 100%, commit `84aabfb99bcb68cf658e6b7b1fd9a44ecc81ce2d`. Rollback tag `stable` is `metalora-direct-00136-daq`. Payment remains frozen. No migration is authorized by this note.

Approval history: The owner registered this remaining pipeline on 2026-10-11. That text existed only as an uncommitted note and was absent from candidate commit `09343023902096854f879e400db58dadeddd3056`. On 2026-10-14 the owner approved the modified PATH 2 amendment below. That approval reschedules mandatory checks. It does not convert them to PASS, and it does not by itself close NEW5.

---

## NEW5 — Final Non-Live QA

Status: **INCOMPLETE**. The amended exit is not met. NEW6 remains **NOT OPENED**.

Approved fixes, already accepted inside their tested scope:

1. 390px PDP: cookie bar must not block `장바구니에 담기`.
2. Login dialog: focus on open, Escape closes, focus restores on close.
3. Unknown route: 404 content plus a Home recovery action.
4. Shipping policy text matches the confirmed island-delivery charge.
5. Existing TypeScript errors only: `NOTICE_REVIEW_PENDING` import, Workshop success `reason` access.

No payment, database, storage, or production deploy is authorized by this note.

Scope:

5.1 Visual Regression — Typography; Spacing; Buttons; Forms; Modals / Dialogs; Empty / Error / Loading States.

5.2 Responsive — Mobile ≈390px; Tablet; Desktop ≈1440px.

5.3 Browser / Device — iPhone Safari; Desktop Chrome; Edge / Safari family; Touch / Wheel / Keyboard.

5.4 Accessibility — Keyboard Navigation; Focus; Labels; Dialogs; Reduced Motion; Screen Reader Critical Paths.

5.5 Functional Regression — Auth; Account; PDP; Cart; Checkout; Workshop; Admin.

5.6 SEO / Analytics Regression — Canonical; Robots; Sitemap; Noindex; Metadata; Analytics Events.

EXIT CONDITION: **FINAL QA PASS** under the 2026-10-14 amended contract. The original checklist remains. A deferred row is not a pass.

## NEW5 EXIT AMENDMENT — owner approved 2026-10-14

Modified PATH 2. This is not the earlier blanket PATH 2 proposal. Stage order is unchanged.

Before NEW5 EXIT:

- A. Nested policy dialog verification must PASS. Current evidence: **BLOCKED / NOT TESTED**. Prior partial evidence stays partial: a legitimate payment-test OTP flow opened the policy dialog; Tab and Shift+Tab stayed inside; Escape began dismissal. Exit completion, signup remaining open, focus return, background containment, and the second Escape were not confirmed. No runtime of SHA `09343023902096854f879e400db58dadeddd3056` is available on a port with existing external block coverage. Ports 3011 and 3012 serve `metalora-main-clean-19f3` at detached `3c77eb3755ba8c4c9413a4d32c1e4be5daf52cec`. A new listen port would be publicly allowed by the existing Node.js inbound allow rule. No firewall rule and no source change is authorized by this amendment.

Before NEW7 PRODUCTION PAYMENT PASS, still **NOT TESTED**:

- C. Workshop Step 2 / upload-storage verification. Owner: A6 prepares an isolated non-production storage target; A5 verifies the editor Step 2. Prerequisite: no production GCS or production Supabase Storage upload. Residual risk: a custom order can be paid before upload behavior is proven.
- J. Checkout shipping-form validation. Owner: A3 for form UX, A6 for payment authority. Prerequisite: payment freeze stays until NEW7, then the form is verified before payment exit. Residual risk: address, island-delivery, or charge behavior can be wrong when payment opens.

Before NEW9 FINAL LAUNCH GATE PASS, still **NOT TESTED**:

- B. Non-production analytics verification. Owner: A6. Prerequisite: an isolated observation target and no production GA delivery. Residual risk: live measurement can be absent or wrong.
- D. iPhone Safari. Owner: A5. Prerequisite: a real device. Residual risk: mobile Safari defects.
- E. Desktop Safari. Owner: A5. Prerequisite: real macOS Safari. Residual risk: desktop Safari defects.
- F. Real touch. Owner: A5. Prerequisite: a physical touch device. Residual risk: touch interaction defects.
- G. Screen-reader critical paths. Owner: A5. Prerequisite: actual assistive technology. Residual risk: an essential control is unusable.
- H. Visual pixel regression. Owner: A5. Prerequisite: an approved baseline. Residual risk: visual drift. Manual views already accepted do not replace this comparison.
- I. Home Canvas headed Chrome and Edge. Owner: A5. Prerequisite: genuine headed Chrome and Edge. Cursor Chromium evidence stays limited to that browser. The room image was not production artwork. Residual risk: home motion differs in those browsers.

These rows stay binding at the gates above. They are not deleted and are not moved past NEW9 without a new owner decision.

Accepted NEW5 evidence, only inside the scope already tested:

- Five original blocker fixes.
- Login focus restoration and login, signup, and recovery focus trap on Chrome 154 and Edge 155.
- Workshop reduced-motion correction and Workshop Step 1.
- Payment-test authentication, account viewing, cart operations, and payment-freeze behavior.
- Responsive checks that were completed.
- Payment-test admin QA, with the disposable admin removed.
- Production-mode server SEO.
- Home Canvas on Cursor Chromium only.

Payment freeze remains in effect until NEW7. NEW6 RESTORE PASS remains a hard prerequisite before NEW7. NEW9 still requires the prior release-gate evidence, including the carryovers above, and final owner approval.

## NEW6 — Backup / Restore Hard Gate

Status: **NOT OPENED**. Failure blocks NEW7.

Scope: Production Backup Verification; Supabase Backup Status; PITR Verification; Isolated Restore Drill; Storage Recovery; Restore Validation.

EXIT CONDITION: **RESTORE PASS**

## NEW7 — Production Payment Activation

Status: **NOT OPENED**. No payment activation before this stage. NEW6 RESTORE PASS is required first. Items C and J must PASS before this stage's payment exit. Both are **NOT TESTED**.

Scope: Toss Production Configuration; Server Payment Contract; Prepare / Confirm Flow; Amount Guards; Order Guards; Idempotency; Failure Handling; Custom / Workshop Payment Dependencies; Production Payment Smoke; Cancel / Refund Verification.

EXIT CONDITION: **PRODUCTION PAYMENT PASS**

## NEW8 — Real Order / Fulfillment Dry Run

Status: **NOT OPENED**.

Scope: Real Order Creation; Full Order Lifecycle; Production Operation; Production / Inspection; Packaging; Shipping; Customer Experience.

EXIT CONDITION: **REAL ORDER / FULFILLMENT PASS**

## NEW9 — Final Launch Gate

Status: **NOT OPENED**. Items B and D–I must PASS before this stage's final pass. All are **NOT TESTED**.

Scope: Release Evidence Review; Production Infrastructure; Cloud Run Revision; Rollback Revision; Domain / TLS / Health; Public Web Verification; Operational Readiness; Monitoring / Analytics; Final Release Record.

EXIT CONDITION: **FINAL USER APPROVAL**

## LIVE

Status: **NOT REACHED**.

After final approval: Production Public Operation; Initial Order Monitoring; Error Monitoring; Rollback Ready; Improvement Backlog.

---

## Stage report

Every stage report includes: Summary, Changed Files, Validation, Evidence, Risks, PASS/FAIL Recommendation.
