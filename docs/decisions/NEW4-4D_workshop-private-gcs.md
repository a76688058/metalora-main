# NEW4-4D — Workshop private Seoul GCS media storage

Status: **ACCEPTED — SERVER FOUNDATION IMPLEMENTED (NEW4-4D-3, local commit, not deployed)**. Signed regional delivery proven in NEW4-4D-2A. Next: A0 NEW4-4D-4 shared Workshop media resolver.
The live app still uses Supabase Storage for Workshop images. No deploy, no Cloud Run env binding, no migration applied, no cutover, no Supabase mutation. Three IAM hardening follow-ups remain open (see "Open items").

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
| Bucket IAM | `roles/storage.objectUser` → signer SA; `projectOwner` legacy bucket/object owner and `projectViewer` legacy readers (GCS defaults); `projectEditor` legacy bindings **removed** (NEW4-4D-2A) |
| Signer SA IAM | `roles/iam.serviceAccountTokenCreator` → `807497260135-compute@developer.gserviceaccount.com`, on the signer SA only |
| IAM Credentials API | already enabled before this ticket (no mutation) |
| Dependencies | `@google-cloud/storage` `^8.2.0` (installed 8.2.0); `google-auth-library` `9.15.1` exact (NEW4-4D-2A) |

Upload caps (owner): originals **25 MB** (`image/jpeg`, `image/png`, `image/webp`); previews **5 MB** (`image/jpeg`).
Object metadata: `Cache-Control: private, no-store`.
Future paths: `originals/{uid}/{uuid}.{ext}`, `previews/{uid}/{uuid}.jpg`. Smoke namespace: `_ops-smoke/` only.

Env names (not bound on Cloud Run yet; bind with the NEW4-4D-3 deploy): `WORKSHOP_GCS_BUCKET`, `WORKSHOP_GCS_ENDPOINT`, `WORKSHOP_GCS_SIGNER_SA`. Values listed in `.env.example`. No credentials in env.

## Signed delivery proof (NEW4-4D-2A)

`WORKSHOP_GCS_SMOKE_SIGNED=1 npm run verify:workshop-gcs-foundation` → FOUNDATION CONFIG 28/28 + SIGNED DELIVERY PROOF 20/20 = **48/48 PASS**. Synthetic `_ops-smoke/` objects only.

Chain: operator OAuth → IAM Credentials `signBlob` → `workshop-media-signer` → V4 signed URL → `https://storage.asia-northeast3.rep.googleapis.com/<bucket>/<object>`. Every signed URL is checked before use: host = Seoul regional, `X-Goog-Credential` = signer SA, path bound to the object, `X-Goog-Expires` = 300. Signing aborts if `storage.authClient.getCredentials().client_email` is not the signer SA.

- Signed PUT: `content-type: image/jpeg`, `cache-control: private, no-store`, `x-goog-content-length-range`, `x-goog-if-generation-match: 0` all signed → 200. Stored metadata `image/jpeg`, `private, no-store`, size 16; anonymous GET denied.
- Size: signed range `1,32` + 64-byte body → **400**, nothing stored. Client sending a wider range than signed → **403** (header is bound by the signature).
- Create-only: second signed PUT to the same object → **412**; signed GET still returns the original bytes.
- Signed GET → 200, exact bytes, `private, no-store`, no Cloudflare headers. After delete → 404.
- All synthetic objects deleted; prefix empty (soft delete 0).

Temporary operator binding lifecycle: `user:<operator>` granted `roles/iam.serviceAccountTokenCreator` on the signer SA only → smoke → removed in a `finally` block in the same command → read-back shows only the runtime SA. Verifier default mode asserts the operator binding is absent.

Dependency rationale: `@google-cloud/storage` 8.2.0 picks the signing identity via `instanceof Impersonated` against its own `google-auth-library`. With direct `google-auth-library@9.15.1`, `npm ls` shows storage's copy as `deduped` to the root 9.15.1, and the verifier proves `storage` and the app resolve the same module file and that storage reports the Impersonated target as signer (offline, no runtime fallback). `@google/genai` now gets its own nested `google-auth-library@10.9.1` (re-resolved from the previously hoisted 10.6.1 within genai's `^10` range), `gaxios@7.3.1`, `gcp-metadata@8.1.2`, `google-logging-utils@1.1.3`. The old `gaxios@7.1.3` → `rimraf@5`/`glob@10` chain dropped out. `@google/genai` is not imported by `src/` or `server.ts`. The future server bundle must keep a single `google-auth-library` instance for storage and the adapter; re-check with the verifier after any dependency change.

## Server foundation (NEW4-4D-3)

Code: `src/lib/workshopStorage.ts` (adapter, contracts, handlers), routes in `server.ts`, migration `supabase/migrations/20261007100000_new4_4d_path_validation.sql`, verifier `scripts/verify-new4-4d-3-workshop-media.ts` (run with `npx tsx`; no npm script because `package.json` was outside the ticket's write set).

**Config / identity.** GCS is enabled only when all three `WORKSHOP_GCS_*` env vars equal the approved values: bucket `metalora-workshop-apne3`, endpoint exactly `storage.asia-northeast3.rep.googleapis.com` (bare or `https://`), signer `workshop-media-signer@…`. All absent → legacy-only (current production). Partial or any other value → fail closed: media endpoints 503 `workshop_gcs_not_configured`; retention/withdrawal endpoints 503 before any mutation. Source = runtime ADC (`GoogleAuth`, `cloud-platform` scope, needed for IAM Credentials) → `Impersonated` signer (target scope `devstorage.read_write`) → `Storage({apiEndpoint: regional})`. Before every signature: `getCredentials().client_email` must equal the signer SA; every signed URL must be on the regional host, carry the signer credential, be bound to `/<bucket>/<path>`, and expire in 300 s. List/delete/head also run as the signer (the runtime SA has no bucket write).

**Canonical-path contract.** `originals/{uid}/{uuid}.{jpg|jpeg|png|webp}`, `previews/{uid}/{uuid}.jpg`, lowercase UUIDs. `parseWorkshopRef` / `normalizeWorkshopRef` also accept legacy Supabase public / authenticated / signed (`token` only) URLs on the exact configured Supabase host, and reject other hosts, schemes, ports, credentials, queries, `%`, `..`, `\`, `//`, `#`, malformed UUIDs, wrong prefixes and extensions. Legacy-tolerant `workshopStoragePathFromUrl` (any filename) is kept for NEW4-6/7 cleanup and protection only; it never authorizes signing.

**Endpoints** (`POST`, Supabase JWT via `auth.getUser`; withdrawn users refused; responses `Cache-Control: no-store, private, max-age=0`, `Pragma: no-cache`, `Expires: 0`, `Referrer-Policy: no-referrer`; logs carry `op` + `reason_class` only):

| Path | Contract |
|---|---|
| `/api/workshop-media/sign-upload` | body `{kind, contentType, sizeBytes}`; client `path`/`uid` refused. Original ≤ 25 MiB (`image/jpeg`, `image/png`, `image/webp`); preview ≤ 5 MiB (`image/jpeg`). Server builds `{prefix}/{auth uid}/{randomUUID}.{ext}` and signs PUT with `Content-Type`, `Cache-Control: private, no-store`, `x-goog-content-length-range: 1,<cap>`, `x-goog-if-generation-match: 0`, 300 s. Returns `path`, signed URL, required headers, `expiresAt`, `maxBytes`. |
| `/api/workshop-media/sign-read` | `{refs: string[]}`, 1–20. Per ref: `{ok, store:'gcs', src, expiresAt}`, `{ok, store:'supabase_legacy'}` (keep the legacy URL; nothing signed), or `{ok:false, reason:'invalid_ref'|'not_authorized'}`. No persistence. |
| `/api/workshop-media/commit` | `{path, kind}`; own canonical path only. GCS `head` must show allowed content type matching the extension, 1..cap bytes, `Cache-Control: private, no-store`. Returns `{path, kind, contentType, sizeBytes}` only. |
| `/api/workshop-media/discard` | `{path}`; own canonical path only. 409 if referenced by the caller's cart, progress, unpurged orders or payment intents, or if the object is older than 24 h (retention domain). Absent → 200 `already_absent`. GCS only. |

**Sign-read authorization** (path UID alone never authorizes). Customer, own-UID path that is DB-referenced:
- preview: `cart_items.custom_image`, `cart_items.custom_config.preview_image_url`, unpurged `orders.ordered_items[].{image,user_image_url,custom_config.preview_image_url}`, `payment_intents.validated_snapshot.ordered_items[]` same fields;
- original: `user_progress.uploaded_image_url`, `cart_items.custom_config.original_image_url` only (no order originals for customers).
Admin (`profiles.is_admin = true`, not withdrawn): any Workshop ref inside an unpurged order owned by the ref's UID. A canonical-path DB value signs from GCS; a legacy URL value returns `supabase_legacy`.

**Adapter semantics.** Stores: `gcs` (when configured) + `supabase_legacy` (always during transition). LIST = union; per path the newest `createdAt` wins so nothing is purged early. REMOVE = every store; not-found counts as removed; any other failure fails the path with `store` + `retryable`. No generic storage API is exposed.

**NEW4-6.** `runWorkshopRetentionPurge(admin, now, adapter)`. Completed-order and abandoned passes use the adapter; `completed_at`, 3-day window, `image_purged_at` stamping only after full deletion + reference cleanup, partial-failure retry and abandoned-asset protection are unchanged. Extra guard: an order holding bare canonical paths (GCS era) while GCS is unconfigured is deferred (`gcs_not_configured`), never stamped.

**NEW4-7.** `removeUnorderedWorkshopAssets(admin, adapter, uid)` lists GCS `originals|previews/{uid}/` ∪ legacy, keeps unpurged-order and payment-intent paths, deletes the rest from both stores, stops on first failure (withdrawal stays resumable). Other withdrawal steps unchanged. Legacy listing now pages past 1000 entries.

**Checkout (payment frozen, no Toss).** `claimMatchingCustomCartRow`, `customRowImageUrls` and the v1 original≠preview check compare canonical identities, so a legacy URL and its canonical path match. `customImageRef` drops GCS / `X-Goog-*` URLs, so signed URLs never enter `custom_config`, `image`, `user_image_url` or payment/order snapshots. New canonical uploads are stored as paths; legacy order evidence is unchanged.

**SEO / public leak guard.** `resolvePublicImageUrl` (OG image, Product JSON-LD, RSS `<img>`) returns null for canonical paths, legacy Workshop URLs, `workshop/…`, GCS hosts and signed URLs (OG falls back to the default image). It no longer maps `workshop/` paths to the public bucket. The sitemap emits no images.

## Path validation migration ordering (NEW4-4D-3, prepared, NOT applied)

`20261007100000_new4_4d_path_validation.sql` is transitional dual-format: `workshop_ref_is_accepted(ref, kind)` = `workshop_ref_is_own_canonical` (canonical path for `auth.uid()`) OR `workshop_ref_is_own_legacy_supabase` (exact `https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public/workshop/` + own canonical path). Applied to `add_custom_cart_item` (closes the any-string gap) and to `BEFORE INSERT OR UPDATE` guards on `cart_items` (`custom_image`, `custom_config.preview_image_url`, `custom_config.original_image_url`) and `user_progress.uploaded_image_url`. INSERT checks every non-blank field; UPDATE checks only changed fields; `service_role` is exempt. `custom_cart_payload_is_complete_v1` is unchanged (IMMUTABLE, also used by service-role paths).

Order:
1. Deploy NEW4-4D-3 server code with `WORKSHOP_GCS_*` bound (A6 + owner approval). Adapter integration must be live **before** any client uploads to GCS.
2. Apply this migration (A6 + owner approval). The current client keeps working: it writes own legacy public URLs with UUID filenames. Not accepted: legacy non-UUID filenames (pre-`crypto.randomUUID` fallback), `data:`/`blob:` values, other hosts, the payment-test project host. Payment-test needs its own host decision if it is ever applied there.
3. A0/A2/A3 consumers switch to canonical paths and the media endpoints.
4. A later tightening migration replaces `workshop_ref_is_accepted` with canonical-only, after legacy cutover and TTL.

## Foundation smoke (NEW4-4D-2)

`npm run verify:workshop-gcs-foundation` → 34/34 PASS at the time (superseded by the 48-check version above; default mode now runs FOUNDATION CONFIG only).

Proven on the regional XML API path with operator OAuth (not a signed URL):

- PUT with `Content-Type: image/jpeg`, `Cache-Control: private, no-store`, `x-goog-content-length-range`, `x-goog-if-generation-match: 0` → 200
- GET returns identical bytes, `image/jpeg`, `Cache-Control: private, no-store`; no Cloudflare headers
- anonymous GET → denied
- `x-goog-if-generation-match: 0` on an existing object → 412 (create-only works)
- `x-goog-content-length-range: 1,32` with a 64-byte body → 400, object not stored
- CORS preflight allows `https://metalora.art`, refuses `https://www.metalora.art` and other origins
- DELETE → 204; GET after delete → 404; no `_ops-smoke/` objects remain (soft delete is 0)

## Resolved (NEW4-4D-2A)

- Signed-URL chain: proven (above).
- Impersonation identity mismatch: resolved by direct `google-auth-library@9.15.1` (deduped, verified).
- `projectEditor` legacy bindings removed from this bucket only (`legacyBucketOwner`, `legacyObjectOwner`). `projectOwner` and `projectViewer` bindings unchanged.

## Effective IAM posture (after NEW4-4D-2A)

- Signer SA: bucket `roles/storage.objectUser`; no keys.
- Signer SA TokenCreator holders: runtime SA only (resource-level). Operator: none.
- Runtime SA (project `roles/editor`, `roles/run.builder`; project has no org/folder ancestors):
  - via bucket bindings: none (it is not a basic Owner/Viewer, and `projectEditor` was removed)
  - via `roles/editor`: no `storage.objects.*`; does include `storage.buckets.delete` (empty bucket only), `storage.buckets.create/list`, HMAC key and managed-folder permissions
  - via `roles/run.builder`: **`storage.objects.get` on every project bucket, including this one** → direct read still possible without the signer. Not removed (no approval; may be needed for builds/deploys).
  - Determined from role definitions. An effective-access runtime test was not run: it would need impersonating the runtime SA (extra IAM), and Policy Troubleshooter is not enabled.

## Open items (IAM hardening follow-ups; OPEN; do not block NEW4-4D-3/4, do block "least privilege complete")

No IAM mutation in NEW4-4D-3. No IAM Deny policies added.

1. **Runtime SA direct read via project `roles/run.builder`.** Options: move `run.builder` to a dedicated build SA, or replace it with a narrower role, then re-verify that deploys still work. Owner + A6 ops ticket.
2. **Pre-existing project-wide `roles/iam.serviceAccountTokenCreator` for `firebase-adminsdk-fbsvc@metalora-auth.iam.gserviceaccount.com`.** This can sign as any project SA, including the Workshop signer. Separate audit: owner confirms whether the Firebase Admin SDK identity is used; if not, remove or narrow. The verifier allows only this documented exception.
3. **`roles/editor` can delete this bucket once it is empty.** Separate infra-hardening ticket (narrow runtime roles or add a guard). Low risk while objects exist.

## Not done (by design)

- No deploy, no Cloud Run env binding or revision, no migration applied.
- No client change: WorkshopView, durableHandoff, Cart, CartContext, ProductDetail, OrdersModal, admin consumers and the shared client resolver untouched. Live Workshop uploads and reads remain on Supabase.
- Supabase `workshop` bucket and policies unchanged; no customer object read, copied, moved or deleted.
- Payment frozen until NEW7.

## Remaining owners

- A0 NEW4-4D-4: shared Workshop media resolver (`getFullImageUrl` for legacy URLs + canonical paths via sign-read).
- A2: Workshop upload switch (`durableHandoff`: sign-upload → PUT → commit → discard on abandon), PDP.
- A3: Cart, CartContext, admin consumers; `OrdersModal.tsx` after the protected-WIP handoff (**cutover blocker**; synchronous `getFullImageUrl` at ~line 226).
- A6: deploy + env binding, migration apply, later tightening migration, legacy copy and cutover, Privacy finalization.

## Do not do

- Do not use `storage.googleapis.com` (global endpoint) for Workshop objects.
- Do not enable soft delete, versioning, retention, lifecycle deletion or Cloud CDN on this bucket.
- Do not add origins to CORS without a documented need.
- Do not create service-account keys.
- Do not store signed URLs anywhere, and do not log signed URLs, tokens or customer object paths.
- Do not make the Supabase `workshop` bucket private before every consumer (including protected `OrdersModal.tsx`) reads through GCS.

## Future implementation order

1. Owner decisions on the open IAM items (parallel; required before calling least privilege complete).
2. ~~A6 NEW4-4D-3: adapter, NEW4-6/7 dual-store wiring, endpoints, path-validation migration (prepared).~~ **DONE locally.** Deploy + env binding is a separate A6 ticket with owner approval and must land before any client GCS upload.
3. A0 NEW4-4D-4: `src/lib/workshopMedia.ts` resolver and `getFullImageUrl` handling for both legacy URLs and paths.
4. A2 / A3 / A4: display consumers (Cart, CartContext, PDP, admin) through the resolver.
5. `OrdersModal.tsx` protected-WIP handoff and migration (A3). **Cutover blocker.**
6. A6: apply the dual-format path-validation migration (see ordering above); A2 switches uploads to GCS.
7. Dual-store QA, legacy copy with verification, Supabase cutover (drop insert policy, make private, drop public select, delete legacy objects, wait at least the cache TTL), then the canonical-only tightening migration.
8. Privacy finalization (remove CDN entry and markers), then A5 QA.

## Ownership

A6: GCS ops/IAM, adapter, server endpoints, migrations, NEW4-6/7 integration, legacy copy, Privacy. A0: resolver, `getFullImageUrl`, package approval. A2: Workshop upload, `durableHandoff`, PDP (A4 review for WebGL textures). A3: Cart, CartContext, admin consumers, `OrdersModal.tsx` after WIP handoff. A5: read-only QA.

## Relevant files

`src/lib/workshopStorage.ts`, `src/lib/workshopRetention.ts`, `src/lib/accountWithdrawal.ts`, `server.ts`, `supabase/migrations/20261007100000_new4_4d_path_validation.sql`, `scripts/verify-new4-4d-3-workshop-media.ts`, `scripts/verify-workshop-gcs-foundation.ts`, `.env.example`, `package.json`, `package-lock.json`, `docs/decisions/NEW4-4_privacy-processors.md`.
