# NEW7.5 M1 home release candidate

Status: READY FOR OWNER DECISION

Decision: Assemble the public HOME candidate from production commit f4e84bdf2ec1af941e37b6eb5cb4ede90f00cf59. Include the reviewed home presentation, marquee accessibility, search focus, desktop hero slide, public video selection with sample fallback, and the implemented footer and dark home-header icon styles. Keep admin video, GCS, and catalog staging out of this candidate.

Completed: Branch `release/new75-m1-home` in the isolated worktree. No production deploy, traffic change, database write, or storage write.

Blocker / Open Item: Footer surface and dark home-header icon styles do not yet have an explicit Owner visual PASS. Payment remains frozen.

Do Not Do: Do not deploy this branch, change Cloud Run traffic, or add the homepage video bucket to production from this note.

Resume Condition: Owner visual PASS for the footer and header icons, then a separate production deploy approval.

Resume Procedure: Deploy only `release/new75-m1-home` after that approval. Keep the current production revision available for rollback.

Ownership: A2 home presentation, A1 footer and foundation styles, A0 release branch. A6 required before any production deploy.

Relevant Files: `src/pages/Home.tsx`, `src/preview/HomeHero.tsx`, `src/preview/VideoHero.tsx`, `src/preview/homepageVideoSource.ts`, `src/components/Footer.tsx`, `src/styles/foundation.css`, `scripts/clean-dist.mjs`.
