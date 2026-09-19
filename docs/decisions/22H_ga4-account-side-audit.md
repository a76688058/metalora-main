# 22H GA4 account-side audit

Status: DONE

Decision: Production Measurement ID `G-T2FFXETHTZ` maps to signed-in property METALORA / `551862907` / Web stream `내 웹사이트` (`https://metalora.art`, stream `15523305112`). Account-side audit is read-only PASS. No GA4 configuration change is required to continue #22.

Completed:
- Property/stream identity MATCH
- All seven tracked events RECEIVED on stream `내 웹사이트` (last 28 days)
- `purchase` is a Key event; funnel/custom events are not
- Realtime last 30 min: 1 user, 3 views, paths `/`, `/policy/terms`, `/product/d3c9fbad-fbdd-4f82-a2ff-b2b4b107658c`
- Ecommerce last 28 days: 2 transactions, ₩79,200; item names/revenue/qty visible on default item report
- Custom definitions: none
- Single Web stream; no second metalora.art stream

Blocker / Open Item:
- DebugView not run (no existing debug session; debug mode not enabled)
- item_id / item_variant not visible on default ecommerce report (report not customized)
- Historical hostname / run.app / localhost pollution NOT VERIFIED (no Exploration)
- Data filters not opened (read-only constraint)

Do Not Do:
- Do not toggle Key events, Enhanced Measurement, streams, custom definitions, Ads, Search Console, or consent for this finding
- Do not reopen source analytics solely because historical GA data is sparse
- Do not treat `[TEST] Payment fixture` ₩200 as a #22 source defect

Resume Condition: Start #22 legal / privacy analytics review.

Resume Procedure: Keep account-side conclusions separate from already verified source-side #22B/#22C/#22G/consent/purchase truth.

Ownership: A6

Relevant Files: `src/lib/ga4.ts` (source ID `G-T2FFXETHTZ`; not written in this ticket)
