# NEW4-4D — Workshop private Seoul GCS media storage

Status: **ACCEPTED — SERVER FOUNDATION + SHARED RESOLVER + A2 WORKSHOP CLIENT + A3 CART / ADMIN CONSUMERS IMPLEMENTED (NEW4-4D-3 / 4 / 5 / 6, local commits, not deployed)**. Signed regional delivery proven in NEW4-4D-2A. Open: `OrdersModal.tsx` (protected WIP, cutover blocker), release guard below.
Production still runs the pre-D-3 build on Supabase Storage. D-5 / D-6 client code exists locally and **must not be deployed** until the release guard below is met. No deploy, no Cloud Run env binding, no migration applied, no cutover, no Supabase mutation. Three IAM hardening follow-ups remain open (see "Open items").

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

## Shared client resolver (NEW4-4D-4)

Code: `src/lib/workshopMediaCore.ts` (browser-safe core, no Supabase import, testable in Node), `src/lib/workshopMedia.ts` (app entry: default instance on `supabase.auth.getSession()`; cache cleared on `SIGNED_OUT`), one guard line in `src/lib/utils.ts`. Verifier: `npx tsx scripts/verify-new4-4d-4-workshop-media.ts` (runs the resolver against the real `handleSignRead` with mocks; no npm script, `package.json` untouched).

Exports (`workshopMedia.ts`): `resolveWorkshopMedia(refs, {mode})` → `Map<input, {ref, src, store, expiresAt}>` (usable results only), `resolveWorkshopMediaSrc`, `retryWorkshopMediaAfterLoadError(ref, failedSrc)`, `invalidateWorkshopMedia`, `clearWorkshopMediaCache`, `normalizeWorkshopMediaRef`, `isCanonicalWorkshopRef`, `isLegacyWorkshopRef`, `isCanonicalWorkshopPathLike`.

- **Contract.** Body exactly `{refs}`; Bearer = current Supabase access token; `cache: no-store`, `referrerPolicy: no-referrer`. Server per-ref items are matched by index + `ref`. Client parser mirrors server `parseWorkshopRef` (parity-tested); refs the client rejects are never sent, so one bad ref cannot 400 a batch. Server stays the authority.
- **Batching.** Dedupe by trimmed ref; callers in the same tick coalesce; chunks of 20 (21 → 20 + 1). In-flight map: one sign per ref at a time.
- **Cache.** Memory only (no local/session storage, IndexedDB, DB, persisted state). Key = session user + mode + ref. Lifetime = min(300 s, server `expiresAt` − local request start) on the local clock; refresh at 80 % (240 s); expired URLs are dropped and never returned. If refresh fails while the old URL is still valid, the old URL is kept. Past/skewed `expiresAt` → usable once, not cached. Denials are not cached.
- **Modes.** `customer | admin` is request context and part of the cache key only; it is not sent (the endpoint has no mode field) and never grants privilege.
- **Legacy.** `supabase_legacy` → `src` = the exact legacy input URL. A canonical path whose DB value is legacy → no `src` (never mints a Supabase URL). No DB rewrite, no client copy.
- **Failures** (`invalid_ref`, `not_authorized`, cross-user, purged, 401/403/5xx, network, malformed body, non-regional `src`, signed out) → no `src`; input is never used as a fallback. Consumers choose placeholders.
- **Retry.** `retryWorkshopMediaAfterLoadError` re-signs a GCS ref once per URL chain; a second failure, or any legacy failure, returns null.
- **`getFullImageUrl`.** Returns null for canonical Workshop paths (also `workshop/`-prefixed, leading `/`, or with a query), so they never become `/object/public/workshop/…`. Products, external, blob/data and full legacy Workshop URLs are unchanged. No live row holds a bare canonical path yet, so no current consumer changes. Workshop consumers must not use `getFullImageUrl` / `getOptimizedImageUrl` / `deriveVariantUrl` after migration.

Consumer contract (A2 / A3 / A4):
- `<img>` / texture elements for Workshop media: `referrerPolicy="no-referrer"`. Never put `src` in analytics, logs, storage, DB or snapshots; persist the ref only.
- Canvas / WebGL: set `crossOrigin = 'anonymous'` (`img.crossOrigin` / `TextureLoader.setCrossOrigin('anonymous')`) before assigning `src`, else the canvas is tainted. Bucket CORS allows GET only from `https://metalora.art` (not `www.`, not localhost), so local dev canvas reads of GCS media will fail CORS. Draw from the local `File`/blob where one exists; the resolver does not fetch bytes.
- Re-resolve on mount and before 240 s; reuse the cached result otherwise.

## Workshop client (NEW4-4D-5, A2)

Code: `src/lib/customComposition/durableHandoff.ts` (no Supabase import; testable in Node), `src/components/Workshop/WorkshopView.tsx`, `src/components/ProductDetail.tsx`. Verifier: `npx tsx scripts/verify-new4-4d-5-workshop-client.ts` (real server handlers, mocked GCS + DB refs; no network). No npm script (`package.json` untouched).

**Accepted input.** Workshop file picker already accepts only JPEG / PNG / WebP and rejects HEIC / HEIF / SVG / other types before upload, so it matches the backend. Originals > 25 MB are now refused at file pick (`25MB 이하의 사진을 선택해 주세요.`). Preview is the client raster JPEG (≤ 5 MB).

**Upload (add to cart).** `persistWorkshopCartMedia`: original (new `File`, or the resumed persisted ref unchanged) → preview → `add_custom_cart_item` with the two refs. Each upload: `POST sign-upload {kind, contentType, sizeBytes}` → `PUT` to the exact returned URL with the exact returned headers (`referrerPolicy: no-referrer`, `credentials: omit`, `redirect: error`; URL must be https on the Seoul regional host, else refused, no fallback) → `POST commit {path, kind}`. Only the committed canonical path is returned. A failed or locally expired PUT gets one fresh sign-upload with a **new** path; max one retry. Errors carry a reason code only; UI shows the existing generic toasts.

**Cleanup.** Preview failure → best-effort `POST discard` for the committed original. RPC error / throw → discard both new uploads. A resumed original is never discarded. If a row already references a path the server returns 409 and the client leaves it (NEW4-6 retention). No client GCS DELETE, no Supabase Storage `upload` / `getPublicUrl` / `remove` on the Workshop path.

**Persistence.** `cart_items.custom_image`, `custom_config.preview_image_url` / `original_image_url` and `user_progress.uploaded_image_url` receive canonical paths for new uploads (field names unchanged). Never signed, regional, Supabase public, `blob:` or `data:` values. `verifyTrustedCustomCartRow` compares the RPC echo through `normalizeWorkshopMediaRef` (canonical ≡ its legacy URL; anything unparseable fails). Server remains the authority. New uploads still do not write `user_progress` before add-to-cart (unchanged behavior); progress is saved only from the durable ref, never from the display src.

**Resume.** Legacy URL in progress → used directly as before (no resolver, no re-upload, no rewrite). Canonical path → `resolveWorkshopMediaSrc(ref, {mode: 'customer'})` → bytes fetched once (`mode: cors`, no referrer, no credentials) → local `blob:` URL for the editor and canvas (GCS objects are `no-store`, so reusing the signed src after 300 s would break the raster). One `retryWorkshopMediaAfterLoadError` on failure. Unresolvable → toast asks to re-upload, step 1; progress is not cleared or overwritten.

**ProductDetail (`workshop-single`).** Canonical `custom_image` → resolver (customer mode) → temporary src in React state, re-resolved before expiry (85 % of remaining lifetime), loading screen while resolving, image-less product on failure. Legacy / non-canonical refs render exactly as before. Catalog products never touch the resolver.

**WebGL / A4 boundary.** The workshop preview reaches `ProductTheatreStage` → `PdpSpatialCanvas` → `MetaloraArtwork3D` (and the story canvas). The A4 `TextureLoader` already sets `crossOrigin = 'anonymous'`; no A4 code changed. A4 review recommended: texture load error has no Workshop re-sign hook (A2 mitigates with the pre-expiry refresh; a refresh swaps the texture URL). The theatre / room-preview `<img>` elements (A2 PDP files outside this ticket) carry no `referrerPolicy`; image requests send the page URL as referrer, not the signed query, so no signed-param leak. Add `referrerPolicy="no-referrer"` in the Cart / PDP display ticket.

**Local dev limitation.** Bucket CORS allows GET/PUT only from `https://metalora.art`. On localhost the signed PUT and the resume byte fetch fail CORS (generic upload / re-upload message); WebGL textures from GCS also fail. Verify end to end only on the production origin after the release guard, or with mocks.

**Verifier note.** The D-3 check "live client still uploads to Supabase workshop bucket" and the D-4 R-scope checks "no consumer imports the resolver" / "live upload still Supabase" were application-state snapshots for the pre-D-5 state and now fail by design (D-3 192/193, D-4 82/84; all contract checks pass). Owners (A6 for D-3, A0 for D-4) should update them to the D-5 state.

**Release guard.** Superseded by the consolidated list in the D-6 section.

## Cart / CartContext / admin consumers (NEW4-4D-6, A3)

Code: `src/lib/workshopMediaDisplay.ts` (display controller, no Supabase import; testable in Node), `src/hooks/useWorkshopMediaDisplay.ts` (binds it to the shared resolver), `src/context/CartContext.tsx`, `src/components/Cart.tsx`, `src/components/admin/adminOrders.ts`, `src/pages/AdminOrders.tsx`, `src/components/admin/adminBestSellers.ts`, `src/pages/AdminBestSellers.tsx`. Verifier: `npx tsx scripts/verify-new4-4d-6-cart-admin.ts` (real `handleSignRead`, mocked signer + DB refs, network disabled; no npm script).

- **Durable refs.** `cart_items.custom_image`, `custom_config.*_image_url` and `orders.ordered_items[]` keep the stored value (canonical path or legacy URL); nothing is rewritten. `CartContext.addToCart` refuses Workshop media that `normalizeWorkshopMediaRef` rejects (signed / regional / `blob:` / `data:` / other hosts) before any `cart_items` write. Workshop rows still enter through `add_custom_cart_item` (D-5). Hydrated `product.image` of a Workshop row is the durable ref. `AdminOrderItem.imageUrl` and `BestSellerItem.image` keep their names; for Workshop items they hold the durable ref, not a URL.
- **Display.** Canonical ref → one batched `resolveWorkshopMedia` per view (Cart only while open; AdminOrders list first items + open detail; best sellers visible Workshop rows) → temporary src in controller memory, re-resolved at 85 % of remaining lifetime, dropped on unmount. No new cache; the resolver cache is shared. Legacy Supabase Workshop URLs (strict, or older non-UUID public URLs on the production host) render exactly as stored and are never sent to sign-read. Anything else (relative paths, `workshop/…`, queries, other hosts, signed URLs) → existing placeholder; no `getFullImageUrl` / public URL building for Workshop values. Catalog images unchanged.
- **Errors.** `<img onError>` → `retryWorkshopMediaAfterLoadError` once per issued src; second failure or legacy failure → placeholder. No technical error text, no logging.
- **Admin.** `mode: 'admin'` is cache context only; the server authorizes via `profiles.is_admin`. Refusal / 401 / 403 / 5xx / signed out → placeholder, never a legacy URL synthesized from a path. Thumbnails use the preview (`custom_config.preview_image_url`, `image`, `user_image_url`, `front_image`, `custom_image`, `preview_url`; canonical `originals/…` skipped). No A3 surface resolves originals: AdminOrders has no production-download workflow and the best-seller download is a representative thumbnail. Best-seller Workshop download fetches with `no-referrer`, `credentials: omit`, `no-store` into a `blob:` link and never falls back to `window.open` (catalog fallback unchanged). Dashboard renders no Workshop media (counts only), no change.
- **No signed persistence.** Signed srcs exist only in controller memory and `<img src>`: not in cart rows, admin data, React data state, storage, DB writes, URLs / navigation state, analytics, logs. All Workshop `<img>` carry `referrerPolicy="no-referrer"`; no `crossOrigin` (plain images, no canvas).
- **Payment.** Freeze unchanged. `prepare` items, `pendingOrder` and `ordered_items` are built from durable refs (`user_image_url: item.custom_image`).
- **OrdersModal.** Excluded (protected WIP). **KNOWN PROTECTED CUTOVER BLOCKER**: synchronous `getFullImageUrl` keeps legacy URLs working and returns null for canonical paths. No workaround (no public redirect, anonymous sign endpoint, cookie, or Supabase URL reconstruction).
- **Local dev.** Bucket CORS allows `https://metalora.art` only; `<img>` loads are not CORS-bound, but the best-seller Workshop download fetch fails CORS on localhost (silently, no fallback).

**A4 TARGETED REVIEW RECOMMENDED BEFORE FINAL CUTOVER**: expiring signed texture sources in `MetaloraArtwork3D` / story canvas (no Workshop re-sign hook on texture error), the ProductDetail pre-expiry refresh swapping texture URLs, and `crossOrigin = 'anonymous'` on every Workshop texture path. No A4 code changed in D-6.

**Release guard (consolidated).** D-5 / D-6 client code must not be publicly deployed, and the Supabase bucket must not go private, until all of:
1. D-3 backend deployed (A6 + owner approval).
2. `WORKSHOP_GCS_*` bound on Cloud Run.
3. Backend smoke of sign-upload / sign-read / commit / discard.
4. `20261007100000_new4_4d_path_validation.sql` applied in the order below.
5. `OrdersModal.tsx` protected-WIP handoff and migration (A3).
6. D-3 / D-4 application-state verifier checks refreshed to the D-5/D-6 state (A6 / A0).
7. Dual-store QA on the production origin (upload, cart, PDP, admin, retention, withdrawal).
8. Legacy object copy to GCS with verification.
9. Supabase `workshop` bucket private cutover (drop insert / public select).
10. Wait at least the CDN cache TTL.
11. Runtime proof that no page emits a public Supabase Workshop URL.
12. Privacy finalization (CDN entry and markers removed; until then the CDN Privacy marker stays).
13. A5 final QA.

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
- A2 consumers (WorkshopView, durableHandoff, ProductDetail) switched in source only (NEW4-4D-5); A3 Cart, CartContext and admin consumers switched in source only (NEW4-4D-6). OrdersModal untouched. Production Workshop uploads and reads remain on Supabase.
- Supabase `workshop` bucket and policies unchanged; no customer object read, copied, moved or deleted.
- Payment frozen until NEW7.

## Remaining owners

- ~~A0 NEW4-4D-4: shared Workshop media resolver.~~ **DONE locally.**
- ~~A2 NEW4-4D-5: Workshop upload switch, resume, PDP workshop-single.~~ **DONE locally.** A4 targeted review of the WebGL texture expiry path recommended (no A4 code change required).
- A0 / A6: update the D-4 R-scope and D-3 application-state snapshot checks to the D-5 / D-6 state (D-3 192/193, D-4 82/84 by design).
- ~~A3 NEW4-4D-6: Cart, CartContext, admin consumers.~~ **DONE locally.**
- A3: `OrdersModal.tsx` after the protected-WIP handoff (**cutover blocker**; synchronous `getFullImageUrl` keeps working for legacy URLs, returns null for canonical paths).
- A4: targeted review of expiring texture sources before final cutover (see D-6).
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
3. ~~A0 NEW4-4D-4: `src/lib/workshopMedia.ts` resolver and `getFullImageUrl` handling for both legacy URLs and paths.~~ **DONE locally.**
4. A2 / A3 / A4: display consumers through the resolver. **A2 (Workshop upload / resume, PDP) done locally (D-5). A3 Cart, CartContext, admin done locally (D-6).** A4 review pending.
5. `OrdersModal.tsx` protected-WIP handoff and migration (A3). **Cutover blocker.**
6. A6: apply the dual-format path-validation migration (see ordering above); A2 switches uploads to GCS.
7. Dual-store QA, legacy copy with verification, Supabase cutover (drop insert policy, make private, drop public select, delete legacy objects, wait at least the cache TTL), then the canonical-only tightening migration.
8. Privacy finalization (remove CDN entry and markers), then A5 QA.

## Ownership

A6: GCS ops/IAM, adapter, server endpoints, migrations, NEW4-6/7 integration, legacy copy, Privacy. A0: resolver, `getFullImageUrl`, package approval. A2: Workshop upload, `durableHandoff`, PDP (A4 review for WebGL textures). A3: Cart, CartContext, admin consumers, `OrdersModal.tsx` after WIP handoff. A5: read-only QA.

## Relevant files

`src/lib/workshopStorage.ts`, `src/lib/workshopMediaCore.ts`, `src/lib/workshopMedia.ts`, `src/lib/utils.ts`, `scripts/verify-new4-4d-4-workshop-media.ts`, `src/lib/customComposition/durableHandoff.ts`, `src/components/Workshop/WorkshopView.tsx`, `src/components/ProductDetail.tsx`, `scripts/verify-new4-4d-5-workshop-client.ts`, `src/lib/workshopMediaDisplay.ts`, `src/hooks/useWorkshopMediaDisplay.ts`, `src/context/CartContext.tsx`, `src/components/Cart.tsx`, `src/components/admin/adminOrders.ts`, `src/pages/AdminOrders.tsx`, `src/components/admin/adminBestSellers.ts`, `src/pages/AdminBestSellers.tsx`, `scripts/verify-new4-4d-6-cart-admin.ts`, `src/lib/workshopRetention.ts`, `src/lib/accountWithdrawal.ts`, `server.ts`, `supabase/migrations/20261007100000_new4_4d_path_validation.sql`, `scripts/verify-new4-4d-3-workshop-media.ts`, `scripts/verify-workshop-gcs-foundation.ts`, `.env.example`, `package.json`, `package-lock.json`, `docs/decisions/NEW4-4_privacy-processors.md`.
