# NEW7.5 3D.6.2 manufacturing image fidelity

Status: ACCEPTED for the pixel pipeline. Release checks add cache-first reads. Authenticated backend E2E was not run.

Decision: Manufacturing output is a server PNG from the original pixels and the purchased composition. Placement is `compositionRasterFrame`, the same function the preview canvas uses. Output size is the rounded source crop window. The 1600 px preview is not enlarged. 300 PPI is a warning reference only. A stored PNG with the expected dimensions is returned without reading the original again. When GCS is configured, canonical bytes are read only from GCS.

Completed: Shared geometry, sharp renderer, admin download route, private `manufacturing/{sha256}.png` artifact that sign-read rejects, browser-vs-sharp marker comparison, Docker Sharp smoke.

Blocker / Open Item: No authenticated Workshop → payment → Admin run. Admin visual approval has not been given. Public traffic stays on the previous live revision.

Do Not Do: Do not treat the customer preview as the print master. Do not upscale to 300 PPI. Do not add the manufacturing prefix to client sign-read. Do not write the artifact path back into the purchased snapshot. Do not fall back from GCS to a second bucket. Do not promote traffic from this note.

Resume Condition: Owner reviews the no-traffic revision and the admin labels. Authenticated E2E still needs an isolated backend.

Ownership: A0 route and geometry, A3 admin presentation, A6 storage and authorization.

Relevant Files: `src/lib/manufacturingRaster.ts`, `src/lib/manufacturingOrder.ts`, `src/lib/manufacturingBytes.ts`, `src/lib/customComposition/math.ts`, `src/lib/customComposition/rasterize.ts`, `server.ts`, `src/components/admin/AdminCustomProduction.tsx`.
