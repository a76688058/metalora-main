# NEW4-4D — Workshop private Seoul GCS media storage

Status: **ON HOLD — FOUNDATION PROVISIONED, SIGNED-URL CHAIN NOT YET PROVEN** (NEW4-4D-2, 2026-10-07).
Infrastructure exists and passes the synthetic regional smoke. The app still uses Supabase Storage for Workshop images. Do not start NEW4-4D-3 until the two open items below are decided.

## Decision

Workshop customer images (originals and previews) will move from the public Supabase `workshop` bucket (Cloudflare global CDN) to a private Google Cloud Storage bucket in Seoul. The browser reads and writes them directly with short-lived V4 signed URLs on the Seoul regional endpoint. The DB stores canonical object paths only, never URLs or signed URLs.

Owner approval (2026-10-07): bucket name, caps, bucket security, CORS, signer-SA model, IAM bindings, IAM Credentials API, env names, `@google-cloud/storage` direct dependency, and the migration direction.

## Provisioned (NEW4-4D-2)

| Item | Value |
|---|---|
| Project | `metalora-auth` |
| Bucket | `gs://metalora-workshop-apne3` |
| Location | `ASIA-NORTHEAST3` (Seoul), location type `region` |
| Storage class | `STANDARD` |
| Public Access Prevention | `enforced` |
| Uniform Bucket-Level Access | enabled |
| Soft delete | disabled (`retentionDurationSeconds: 0`) |
| Versioning / retention / holds / lifecycle / website | none |
| Cloud CDN / load balancer | none (no backend bucket in project) |
| CORS | origin `https://metalora.art`; methods `GET`, `PUT`; response headers `Content-Type`, `Cache-Control`, `x-goog-content-length-range`, `x-goog-if-generation-match`; max age 300 s |
| Regional endpoint | `https://storage.asia-northeast3.rep.googleapis.com` (XML path style `/<bucket>/<object>`) |
| Signer SA | `workshop-media-signer@metalora-auth.iam.gserviceaccount.com`, no user-managed keys |
| Bucket IAM (added) | `roles/storage.objectUser` → signer SA, bucket scope only |
| Signer SA IAM | `roles/iam.serviceAccountTokenCreator` → `807497260135-compute@developer.gserviceaccount.com`, on the signer SA only |
| IAM Credentials API | already enabled before this ticket (no mutation) |
| Dependency | `@google-cloud/storage` `^8.2.0` (installed 8.2.0) |

Upload caps (owner): originals **25 MB** (`image/jpeg`, `image/png`, `image/webp`); previews **5 MB** (`image/jpeg`).
Object metadata: `Cache-Control: private, no-store`.
Future paths: `originals/{uid}/{uuid}.{ext}`, `previews/{uid}/{uuid}.jpg`. Smoke namespace: `_ops-smoke/` only.

Env names (not bound on Cloud Run yet; bind with the NEW4-4D-3 deploy): `WORKSHOP_GCS_BUCKET`, `WORKSHOP_GCS_ENDPOINT`, `WORKSHOP_GCS_SIGNER_SA`. Values listed in `.env.example`. No credentials in env.

## Smoke result

`npm run verify:workshop-gcs-foundation` → **34/34 PASS**, synthetic objects only, regional host only.

Proven on the regional XML API path with operator OAuth (not a signed URL):

- PUT with `Content-Type: image/jpeg`, `Cache-Control: private, no-store`, `x-goog-content-length-range`, `x-goog-if-generation-match: 0` → 200
- GET returns identical bytes, `image/jpeg`, `Cache-Control: private, no-store`; no Cloudflare headers
- anonymous GET → denied
- `x-goog-if-generation-match: 0` on an existing object → 412 (create-only works)
- `x-goog-content-length-range: 1,32` with a 64-byte body → 400, object not stored
- CORS preflight allows `https://metalora.art`, refuses `https://www.metalora.art` and other origins
- DELETE → 204; GET after delete → 404; no `_ops-smoke/` objects remain (soft delete is 0)

## Open items (blocking NEW4-4D-3)

1. **Signed-URL chain not tested.** The operator account holds only `roles/owner`, which (like `roles/editor`) has no `iam.serviceAccounts.signBlob`. No extra IAM was granted. Unproven: V4 signed PUT/GET on the regional host, with the `x-goog-*` headers as signed headers. Resume: owner approves a temporary, time-conditioned `roles/iam.serviceAccountTokenCreator` for the operator on the signer SA only, runs the signed smoke, then removes the binding. Alternatively, prove it from the runtime identity in a non-production context.
2. **Impersonation wiring needs a second dependency decision (A0 + owner, RED).** `@google-cloud/storage` 8.2.0 bundles its own `google-auth-library` 9.15.1 and picks the signing identity via `instanceof Impersonated` against that copy. The hoisted copy is 10.6.1, from `@google/genai`. An `Impersonated` client from a different copy silently falls back to `getCredentials()`, which on Cloud Run is the metadata identity (the runtime SA): the wrong signer. Options: (a) direct `google-auth-library@^9.15.1` so npm dedupes it with the copy storage uses, confirmed with `npm ls`; (b) a storage release that matches the hoisted major. Whichever is chosen, the adapter must fail closed unless `getCredentials().client_email === WORKSHOP_GCS_SIGNER_SA` before signing.
3. **Least privilege on the bucket.** GCS added default convenience bindings: `projectEditor`/`projectOwner` → `roles/storage.legacyBucketOwner` and `roles/storage.legacyObjectOwner`; `projectViewer` → reader roles. The runtime SA has project `roles/editor`, so it can read and write this bucket's objects directly without the signer. Removing the `projectEditor` bindings was not in the approved scope. It needs owner approval; keep `projectOwner` so the operator keeps access.

## Not done (by design)

- No app cutover: Workshop upload/read code unchanged, Supabase `workshop` bucket and policies unchanged.
- No customer object read, copied, moved or deleted.
- No path migration, no NEW4-6 / NEW4-7 change, no Cloud Run env, revision, deploy or traffic change.
- Payment frozen until NEW7.

## Do not do

- Do not use `storage.googleapis.com` (global endpoint) for Workshop objects.
- Do not enable soft delete, versioning, retention, lifecycle deletion or Cloud CDN on this bucket.
- Do not add origins to CORS without a documented need.
- Do not create service-account keys.
- Do not store signed URLs anywhere, and do not log signed URLs, tokens or customer object paths.
- Do not make the Supabase `workshop` bucket private before every consumer (including protected `OrdersModal.tsx`) reads through GCS.

## Future implementation order

1. Resolve open items 1–3 (owner/A0).
2. A6 NEW4-4D-3: storage adapter (GCS + Supabase legacy) wired into NEW4-6 / NEW4-7 dual-store deletion, plus sign-upload / sign-read / commit / discard endpoints. Bind env in the same deploy.
3. A0: `src/lib/workshopMedia.ts` resolver and `getFullImageUrl` handling for both legacy URLs and paths.
4. A2 / A3 / A4: display consumers (Cart, CartContext, PDP, admin) through the resolver.
5. `OrdersModal.tsx` protected-WIP handoff and migration (A3). **Cutover blocker.**
6. A6: canonical-path validation migration (RPC + triggers); A2 switches uploads to GCS.
7. Dual-store QA, legacy copy with verification, Supabase cutover (drop insert policy, make private, drop public select, delete legacy objects, wait at least the cache TTL).
8. Privacy finalization (remove CDN entry and markers), then A5 QA.

## Ownership

A6: GCS ops/IAM, adapter, server endpoints, migrations, NEW4-6/7 integration, legacy copy, Privacy. A0: resolver, `getFullImageUrl`, package approval. A2: Workshop upload, `durableHandoff`, PDP (A4 review for WebGL textures). A3: Cart, CartContext, admin consumers, `OrdersModal.tsx` after WIP handoff. A5: read-only QA.

## Relevant files

`scripts/verify-workshop-gcs-foundation.ts`, `.env.example`, `package.json`, `package-lock.json`, `docs/decisions/NEW4-4_privacy-processors.md`.
