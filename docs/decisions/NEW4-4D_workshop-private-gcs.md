# NEW4-4D — Workshop private Seoul GCS media storage

Status: **ACCEPTED — ALL LOCAL SOURCE DONE (NEW4-4D-3 … 7C, 8A); D-3 VERIFIER REFRESHED + RELEASE PLAN WRITTEN (NEW4-4D-8); PDP referrer blocker CLOSED locally (NEW4-4D-8A). BLOCKED for release** on the remaining items in "Release plan (NEW4-4D-8)". Signed regional delivery proven in NEW4-4D-2A.
Production cutover: RELEASE-GATED. Production still runs `b9664fb` on Supabase Storage. HEAD must not be deployed until the release-plan blockers are cleared with owner approval. No deploy, no Cloud Run env binding, no migration applied, no cutover, no Supabase mutation. Three IAM hardening follow-ups remain open (see "Open items").

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

**WebGL / A4 boundary.** The workshop preview reaches `ProductTheatreStage` → `PdpSpatialCanvas` → `MetaloraArtwork3D` (and the story canvas). The A4 `TextureLoader` already sets `crossOrigin = 'anonymous'`; no A4 code changed. A4 review recommended: texture load error has no Workshop re-sign hook (A2 mitigates with the pre-expiry refresh; a refresh swaps the texture URL). The theatre / room-preview `<img>` elements (A2 PDP files outside this ticket) carry no `referrerPolicy`; image requests send the page URL as referrer, not the signed query, so no signed-param leak. Add `referrerPolicy="no-referrer"` in the Cart / PDP display ticket. **Done in NEW4-4D-8A.**

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
- **OrdersModal.** Excluded from D-6 (protected WIP); migrated in D-7B (below).
- **Local dev.** Bucket CORS allows `https://metalora.art` only; `<img>` loads are not CORS-bound, but the best-seller Workshop download fetch fails CORS on localhost (silently, no fallback).

**A4 TARGETED REVIEW RECOMMENDED BEFORE FINAL CUTOVER**: expiring signed texture sources in `MetaloraArtwork3D` / story canvas (no Workshop re-sign hook on texture error), the ProductDetail pre-expiry refresh swapping texture URLs, and `crossOrigin = 'anonymous'` on every Workshop texture path. No A4 code changed in D-6.

**Release guard (consolidated).** D-5 / D-6 client code must not be publicly deployed, and the Supabase bucket must not go private, until all of:
1. D-3 backend deployed (A6 + owner approval).
2. `WORKSHOP_GCS_*` bound on Cloud Run.
3. Backend smoke of sign-upload / sign-read / commit / discard.
4. `20261007100000_new4_4d_path_validation.sql` applied in the order below.
5. ~~`OrdersModal.tsx` protected-WIP handoff and migration (A3).~~ **DONE locally (NEW4-4D-7B).**
6. ~~D-3 / D-4 application-state verifier checks refreshed (A6 / A0).~~ **DONE locally** (D-4 NEW4-4D-7C 95/95; D-3 NEW4-4D-8).
7. Dual-store QA on the production origin (upload, cart, PDP, admin, retention, withdrawal).
8. Legacy object copy to GCS with verification.
9. Supabase `workshop` bucket private cutover (drop insert / public select).
10. Wait at least the CDN cache TTL.
11. Runtime proof that no page emits a public Supabase Workshop URL.
12. Privacy finalization (CDN entry and markers removed; until then the CDN Privacy marker stays).
13. A5 final QA.

## OrdersModal protected-WIP handoff plan (NEW4-4D-7A, plan only)

D-6 verifier 138/138 PASS. `OrdersModal.tsx` was **not** edited; it remains the protected cutover blocker. The other four protected files have no Workshop media and are not blockers.

**WIP snapshot (read only, vs HEAD `cfb89cb`).** SHA-256 `23991DAF463BF8DDCF21F32E811421454457D04676ED2188C1F446F4966932D4`, LF in the working copy (do not let tooling convert to CRLF). Seven hunks, all modal/accessibility/layout/error UX, none touching images or Workshop:
1. imports `cn`, `zClass` (L12–13)
2. `loadError` state (L26)
3. Escape-key effect (L50–59)
4. `setLoadError` in `fetchOrders` (L65, L76)
5. `role="dialog"` / `aria-modal` / `aria-labelledby`, `zClass('sheet')`, backdrop `<button>` (L118–128)
6. panel `max-w-lg`, header without sticky blur, back-button `type` / `aria-label` / `focus-ring`, `id="orders-title"` (L135–154)
7. load-error + "다시 시도" retry state (L164–178)

**Current Workshop rendering (unchanged vs HEAD, L224–242).** One shared branch for catalog and Workshop: `getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop)`. Workshop snapshot `user_image_url` = preview. Legacy Supabase URL → rendered as stored (public bucket). Canonical path → `null` (D-4 guard) → `<Image>` placeholder. `onError` swaps in a picsum image for every item.

**Preservation map.** KEEP EXACTLY + PRESERVE FOR NEW5: hunks 1–7, plus the unchanged status badge, `OrderStepper`, delivery info and empty state. SAFE A3 EDIT ZONE: one import line after L13; one hook call between the realtime effect (ends L107) and `if (!isOpen) return null;` (L109); the item thumbnail block L225–242. CONFLICT ZONE: NONE (the required edit overlaps no WIP hunk; the import addition is adjacent to hunk 1 but does not change it).

**Minimal future A3 edit (display only).**
- Imports: `useWorkshopMediaDisplay`, `workshopDisplayApi` from `../hooks/useWorkshopMediaDisplay`; `workshopOrderItemThumbRef` from `../lib/workshopMediaDisplay`. No new layer, no direct `workshopMedia` / core import. Keep `getFullImageUrl` for catalog items.
- Hook (before the early return): `useWorkshopMediaDisplay(isOpen ? <Workshop items of loaded orders>.map((ji) => workshopOrderItemThumbRef(ji, workshopDisplayApi)) : [], 'customer')`.
- Workshop items only (`product_id === 'workshop-single'`): thumb ref = `workshopOrderItemThumbRef` (preview first, never originals); `src` = `workshopMedia.get(ref).src`; null/loading/failed → existing `<Image>` placeholder; `<img referrerPolicy="no-referrer">`; `onError` → `workshopMedia.onLoadError(ref, src)` (no picsum swap for Workshop). No `crossOrigin` (plain `<img>`).
- Catalog items: existing code path, unchanged.
- Server authorizes customer previews from unpurged `orders.ordered_items` (`image`, `user_image_url`, `custom_config.preview_image_url`); purged orders → placeholder.
- Lifecycle: the modal can stay open past 240 s; the hook re-resolves at 85 % of remaining lifetime and disposes on unmount. Realtime refetches do not re-sign unless the ref set changes (sorted key). No TTL logic or cache in OrdersModal.
- Never: canonical path as `src`, Supabase URL synthesis, signed `src` in state/storage/DB/analytics, `ordered_items` rewrite, order-status change.

**WIP-preserving method.** Owner first decides how the WIP lands: (a) **recommended**: owner commits or explicitly hands over the WIP as-is, then A3 edits on top; (b) A3 edits the dirty file and commits only its own hunks (`git add -p`), which is higher risk. Either way: record the before hash and save `git diff -- src/components/OrdersModal.tsx` outside the repo; edit only the three zones; no formatter, no import sorting, no line-ending change, no stash/reset/checkout/restore; afterwards confirm all seven pre-existing hunks are byte-identical in the new diff and only the planned zones changed. Any overlap found then = HANDOFF CONFLICT → stop and report.

**Cutover.** Supabase `workshop` cannot go private before this migration: OrdersModal renders legacy order previews straight from the public bucket and has no resolver path, so order-history thumbnails would break. (Legacy URLs answered as `supabase_legacy` still point at the public bucket for every consumer; the legacy copy / resolver strategy in release-guard steps 8–9 stays required.)

**Verifiers.** D-4 refreshed by A0 (87/87): the stale "no consumer imports resolver" / "live upload still Supabase" checks are replaced by forward-state checks (protected files unmigrated, core imported only by shared layers, no Supabase `workshop` upload / URL building anywhere in `src`, sign-upload → PUT → commit flow, release-gated cutover). D-3 still has one stale A6-owned check ("live client still uploads to Supabase workshop bucket"); A6 refresh pending.

## OrdersModal Workshop migration (NEW4-4D-7B, A3, owner-approved protected-WIP handoff)

Status: **DONE locally.** Owner approved a narrow handoff (2026-10-07): Workshop image import / hook / thumbnail only, WIP preserved and uncommitted.

- **Edit.** Exactly the three zones from the D-7A plan: two imports (`useWorkshopMediaDisplay`, `workshopDisplayApi`; `workshopOrderItemThumbRef`), one hook call after the realtime effect and before `if (!isOpen) return null;` (unconditional; `isOpen ? refs : []`, `'customer'`), and the item thumbnail block. No formatting, import reordering or line-ending change.
- **Workshop items** (`product_id === 'workshop-single'`, unchanged; the server writes this id for custom snapshots): durable ref = `workshopOrderItemThumbRef` (preview first, never originals) → `workshopMedia.get(ref).src` (canonical → signed src in controller memory; legacy Supabase URL → as stored) → `<img referrerPolicy="no-referrer">`; `onError` → `workshopMedia.onLoadError` (one re-sign, then placeholder); no src / failed → existing `<Image>` placeholder. No picsum, no `getFullImageUrl`, no `crossOrigin`. Relative legacy paths (none expected) now show the placeholder instead of a rebuilt public URL.
- **Catalog items.** Unchanged: `getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop)` and the picsum `onError` fallback.
- **Data.** Display only. `orders` / `ordered_items`, fetch, realtime, status, error/retry UI untouched; no signed src in orders state, storage, URL, analytics or logs.
- **WIP.** The seven pre-existing hunks (cn/zClass imports, `loadError` state, Escape effect, `setLoadError`, dialog/backdrop, panel/header/back button/`orders-title`, retry UI) stay uncommitted. Staging used an index blob = HEAD + the Workshop edits only (`git hash-object` + `update-index`); the remaining working-tree diff equals the pre-edit WIP diff line for line. The other four protected files are byte-identical.
- **Verifier.** `npx tsx scripts/verify-new4-4d-7b-ordersmodal.ts` (static + mocked resolver/sign-read; no network). D-6 verifier X/Y checks updated to the post-handoff state.
- **Cutover.** OrdersModal **no longer blocks** the Supabase-private cutover. No remaining customer-facing Workshop consumer builds public Workshop URLs or passes canonical refs to `getFullImageUrl` (Cart, CartContext, admin, ProductDetail, WorkshopView, OrdersModal all on the shared resolver). Legacy URLs answered `supabase_legacy` still point at the public bucket, so release-guard steps 8–9 (legacy copy, then private cutover) remain required. Non-blocking follow-ups: A4 texture expiry review; PDP theatre / room-preview `<img>` `referrerPolicy` (A2).
- No deploy, no Cloud Run env, no migration apply, no Supabase / GCS / IAM mutation; payment frozen.

**D-4 verifier refresh (NEW4-4D-7C, A0, test-only).** OrdersModal handoff is complete, so the D-4 R-scope no longer treats it as an unmigrated consumer. The stale "protected WIP files do not import the resolver" check and the "OrdersModal still on `getFullImageUrl`" label were replaced with architectural-state checks:
- OrdersModal must use the shared display hook and the order thumb ref, in customer mode only.
- Its Workshop src may come only from `workshopMedia.get(ref).src`; `onError` must go to `onLoadError`.
- It must not use a canonical ref or raw field as src, build public Supabase URLs, call the resolver core directly, or persist anything to storage.
- The catalog path stays on `getFullImageUrl`.
- InquiryModal, ProfileEditModal, ProfileOverlay and ProfileComplete must stay free of Workshop media imports until separately handed over.

All other D-4 security sections are unchanged. Result: 95/95. Deeper OrdersModal behavior stays in the D-7B verifier. No protected product file was changed in this ticket; OrdersModal's seven older WIP hunks remain uncommitted.

## Path validation migration ordering (NEW4-4D-3, prepared, NOT applied; order superseded by "Release plan (NEW4-4D-8)")

`20261007100000_new4_4d_path_validation.sql` is transitional dual-format: `workshop_ref_is_accepted(ref, kind)` = `workshop_ref_is_own_canonical` (canonical path for `auth.uid()`) OR `workshop_ref_is_own_legacy_supabase` (exact `https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public/workshop/` + own canonical path). Applied to `add_custom_cart_item` (closes the any-string gap) and to `BEFORE INSERT OR UPDATE` guards on `cart_items` (`custom_image`, `custom_config.preview_image_url`, `custom_config.original_image_url`) and `user_progress.uploaded_image_url`. INSERT checks every non-blank field; UPDATE checks only changed fields; `service_role` is exempt. `custom_cart_payload_is_complete_v1` is unchanged (IMMUTABLE, also used by service-role paths).

Order:
1. Deploy NEW4-4D-3 server code with `WORKSHOP_GCS_*` bound (A6 + owner approval). Adapter integration must be live **before** any client uploads to GCS.
2. Apply this migration (A6 + owner approval). The current client keeps working: it writes own legacy public URLs with UUID filenames. Not accepted: legacy non-UUID filenames (pre-`crypto.randomUUID` fallback), `data:`/`blob:` values, other hosts, the payment-test project host. Payment-test needs its own host decision if it is ever applied there.
3. A0/A2/A3 consumers switch to canonical paths and the media endpoints.
4. A later tightening migration replaces `workshop_ref_is_accepted` with canonical-only, after legacy cutover and TTL.

## Release plan (NEW4-4D-8, A6, plan only)

Status: **BLOCKED for release** until the blockers below are cleared. No deploy, push, env, migration, IAM, Supabase or GCS action was taken. Baseline HEAD `77d05dd`; production `metalora-direct` (us-west1) revision `metalora-direct-00119-nij` at 100 %, `DEPLOY_SHA` `b9664fb` (= `origin/main`).

**D-3 verifier.** The stale check "live client still uploads to Supabase workshop bucket" is replaced by the group "release forward state" (A–F). It runs the real `uploadWorkshopOriginal` against a mocked fetch (sign-upload → regional PUT → commit; commit / PUT failure → discard; Bearer never on the PUT). It also scans `src/**` (no `storage.from('workshop')`; `getPublicUrl` only on `products`), checks canonical durable values and legacy compatibility (client + server parse, shared identity, legacy store, migration legacy branch), and checks the release gate: zero-traffic candidate, clean-tree check, no implicit `WORKSHOP_GCS_*` binding, no active values in `.env.example`, migration not applied, this note's gate line. No security or adapter check was weakened.

### Release architecture (single artifact)

- `Dockerfile`: the builder runs `vite build` → `dist/client`. The runner copies `server.ts`, top-level `src/lib/*.ts`, the full `node_modules` (incl. `@google-cloud/storage`, `google-auth-library`) and `dist/client`. One Express process serves both the API and the SPA. The server import closure is flat `src/lib/*.ts` only (checked), so the image has every backend dependency.
- **One Cloud Run revision = backend + client.** "Backend first, client later" is not possible with the current deploy architecture. What separates them is the **zero-traffic candidate**: `deploy-candidate.ps1` builds the image, deploys `--no-traffic --tag=candidate`, and tags the current revision `stable`; `promote-candidate.ps1` moves 100 % to `candidate`; `rollback-production.ps1` moves 100 % back to `stable`.
- Candidate tag URL (`candidate---…run.app`) shares production Supabase. GCS CORS allows only `https://metalora.art`, so **browser** uploads / canvas reads on the candidate URL fail CORS. Pre-promotion smoke must be server-to-server (Node script, no browser); browser E2E is only possible after promotion on `metalora.art` (`www.` 301-redirects to the apex in `server.ts`).
- `deploy-candidate.ps1` requires branch `main`, a clean worktree and `HEAD == origin/main`, and uploads the directory with `gcloud builds submit .` (no `.gcloudignore`; `.dockerignore` excludes `dist`, `.env*`, `node_modules`). The Dockerfile `COPY src` would bake any uncommitted WIP into the image. **Deploy only from a fresh clone of the pushed release commit**, never from this working copy (5 protected WIP files, untracked `dist/`). Never stash/reset the WIP to make the tree clean.
- `deploy-candidate.ps1` sets only `DEPLOY_SHA`. Binding `WORKSHOP_GCS_*` in the same candidate revision needs either a reviewed A6 script change (e.g. an extra `--update-env-vars` parameter) or a one-off reviewed `gcloud run deploy … --no-traffic --tag=candidate --update-env-vars=DEPLOY_SHA=…,WORKSHOP_GCS_BUCKET=…,WORKSHOP_GCS_ENDPOINT=…,WORKSHOP_GCS_SIGNER_SA=…`. Answer: **YES, one revision.** Do not bind env with a separate `services update` after the candidate (creates a second untagged revision).

### Release candidate (`b9664fb..77d05dd`, 27 commits, unpushed)

| Class | Commits |
|---|---|
| Docs only | `b98a5f3`, `b82fea9` |
| Application: policy / legal / notice copy (visible; A6 legal gate) | `9821336`, `84bdce8`, `bed06de`, `d95e1e6`, `eb7b6eb`, `f946628`, `e4a9f17`, `6d6ff5b`, `647b12e`, `481fb5f`, `a75fe9b` |
| Application + migration: consent ledger | `ad08fdf` (NEW4-5), `471b131` (NEW4-5A, migration only), `0cf28c4` (auth fail-closed) |
| Application + migration: retention / withdrawal | `5c61d0a` (NEW4-6), `0c06974` (NEW4-7) |
| Dependency / package | `ff3cf7b` (`@google-cloud/storage`), `e238471` (`google-auth-library` 9.15.1 exact) |
| Application + migration: Workshop private media | `42abecb` (backend + path-validation migration), `b000bf9`, `c2f1f35`, `cfb89cb`, `433c668` |
| Verifier only (+ docs) | `dd55f05`, `77d05dd`, this ticket |

Protected WIP is excluded by construction (never committed): `InquiryModal`, `OrdersModal` (the seven older Member/Account hunks; `433c668` committed only the Workshop hunks), `ProfileEditModal`, `ProfileOverlay`, `ProfileComplete`.

### Migration order and classification

HEAD server/client hard dependencies: `profiles.withdrawn_at` (every media request, admin checks) → NEW4-7; `orders.image_purged_at` (sign-read / discard reference index, retention) → NEW4-6; `record_policy_consent` with current versions (signup / social / enroll fail closed; Workshop consent) → NEW4-5, 5A, NEW4-4. Production `b9664fb` writes Workshop consent by direct `insert` into `user_agreements` (`CopyrightPage`), which NEW4-5 removes.

| # | Migration | Depends on | Old prod (`b9664fb`) | HEAD | Class |
|---|---|---|---|---|---|
| 1 | `new4_5_consent_ledger` | — | **breaks** first-time Workshop consent insert (policy dropped) | required | **PROMOTION-COUPLED, MUST PRECEDE PROMOTION** |
| 2 | `new4_5a_restrict_consent_rpc` | 1 (replaces its function) | unaffected | required | with 1 |
| 3 | `new4_6_workshop_retention` | — | compatible (additive column + trigger) | required | **MUST PRECEDE BACKEND** (candidate smoke) |
| 4 | `new4_7_account_withdrawal` | — (FK RESTRICT on `user_agreements` / `cs_inquiries`, `withdrawn_at`, triggers) | compatible (no withdrawn users) | required | **MUST PRECEDE BACKEND** (candidate smoke) |
| 5 | `new4_4_privacy_version` | 2 (replaces its function; Privacy version only) | unaffected | required | with 1–2 |
| 6 | `new4_4d_path_validation` | 2B-5A `add_custom_cart_item(integer,text,text,text,jsonb)` | compatible: old client writes own legacy public URLs with UUID names | compatible: canonical paths | **SAFE BEFORE PROMOTION, AFTER CANDIDATE SMOKE** |

The NEW4-4D-3 order ("server + env first, then migration") is **superseded**: with one artifact the DB must lead the **promotion** (the zero-traffic candidate may be built first). Apply 1–5 in file (timestamp) order in one window, after the candidate is built and right before the candidate smoke, then promote promptly. Between apply and promotion, old production cannot record **new** Workshop consents (users who already consented are unaffected; signup on old prod does not touch the ledger). Keep that window short. Applying 3–4 earlier (out of timestamp order) shortens the window, but needs an explicit migration-history decision. Apply only with reviewed SQL through the approved path; `supabase db push` stays forbidden. Before migration 6: OPS check that the production `add_custom_cart_item` signature matches 2B-5A. Known reject: legacy fallback IDs `Date.now()-rand` (browsers without `crypto.randomUUID`), on new writes only.

### Feature gate

**NO FEATURE GATE REQUIRED** (no `PUBLIC_WORKSHOP_PRIVATE_MEDIA_ENABLED`). Reasons: the zero-traffic candidate isolates backend smoke from customers; promotion and rollback are single traffic moves; the dual-store adapter keeps legacy refs working; HEAD has no Supabase upload path left, so a gate would mean re-adding legacy upload code. Payment is frozen (`PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true`), so no order can capture a canonical ref during the soak. Rolled-back old client: canonical refs in `cart_items` / `user_progress` show broken thumbnails until re-promotion (objects intact; no data loss). **Re-assess** (gate becomes required) if NEW7 payment activation is scheduled before Phase D soak ends.

### First production revision

Image = release commit; env = existing + `DEPLOY_SHA` + the three `WORKSHOP_GCS_*` (approved values); `WORKSHOP_RETENTION_JOB_SECRET` optional (purge endpoint stays disabled without it; scheduler is a separate ticket). Backward compatible with production data: legacy Supabase refs render, upload paths unchanged for existing rows. **Not** backward compatible with the old **schema**: HEAD needs migrations 1–5.

### Sequence (adjusted to the single artifact)

0. Blockers cleared (below); owner approval; push the release commits (explicit user request), fresh clone, A6 env-in-candidate tooling.
1. Deploy candidate (0 %) with `WORKSHOP_GCS_*` (harmless: no traffic; its NEW4 paths fail until step 2). `/api/health` on the tag URL.
2. Apply migrations 1–5 in file order → read-back (columns, functions, policies, triggers). The consent window opens here.
3. Endpoint smoke via tag URL (server-to-server).
4. Apply migration 6 → DB checks (own canonical accepted, own legacy accepted, other UID / other host / `data:` / `blob:` / non-UUID rejected, `service_role` exempt) with the QA identity.
5. Promote (closes the consent window) → browser E2E on `metalora.art` (upload, resume, cart, PDP + WebGL texture, admin, order history, signup / Workshop consent) → Phase D soak.

### Endpoint smoke (synthetic, not run)

Identity: **OWNER-PROVISIONED QA MEMBER REQUIRED**. The owner creates or names a dedicated internal QA account through the normal signup (own phone, consents recorded) and records it as internal-only (no UID in docs). Its JWT is obtained at smoke time inside the script and never printed. Objects only under that UID; every object is discarded / deleted at the end. Admin checks use an existing owner admin account. Never a customer account.

A health: `GET /api/health` 200 on the tag URL; candidate image digest = release SHA. B sign-upload: 200 with `path` = own canonical, `expiresAt` ≤ 300 s; client `path`/`uid` refused; no token → 401. C signed PUT (Node, exact headers) → 200. D commit → 200 `{path, kind, contentType, sizeBytes}`; foreign path → refused. E sign-read: unreferenced → `not_authorized`; after an own `user_progress.uploaded_image_url` write → `gcs` src; signed GET 200 exact bytes. F discard: unreferenced → 200; referenced → 409; again → `already_absent`. G every signed URL host = `storage.asia-northeast3.rep.googleapis.com`, credential = signer SA, `X-Goog-Expires=300`. H API responses `no-store, private`; object `Cache-Control: private, no-store`. I `sizeBytes` > cap → 413; body over the signed range → 400; wider client range → 403. J second PUT → 412, bytes unchanged. K anonymous GET on regional and global hosts → denied; bucket PAP enforced. L Cloud Logging query on the candidate revision for `X-Goog-Signature`, `X-Goog-Credential`, `Bearer` → 0 hits; app logs carry `op` / `reason_class` only. Plus: NEW4-6 / NEW4-7 adapter construction returns no 503 (`workshop_gcs_not_configured`), without running a purge or a withdrawal.

### Cutover phases (Workshop media)

A Foundation (done). B Candidate with env, migrations 1–5, smoke, migration 6. C Promotion: new uploads go to GCS. D Dual-store soak on the production origin (legacy + canonical; retention / withdrawal dual delete; A4 texture check). E Legacy copy (NEW4-4D-9 script). F Final delta copy. G Supabase `workshop` bucket private + drop authenticated insert policy. H Drop public select policy. I Delete legacy objects (only after copy verification; active orders preserved in GCS). J Wait ≥ 1 h CDN TTL + margin (Free plan, historical `cacheControl` 3600; recheck plan at release; on Pro use Smart CDN invalidation). K Prove no public Supabase Workshop URL is served or emitted (pages, API, RSS / OG / JSON-LD, admin) and public URLs return 4xx. L Privacy finalization, then the canonical-only tightening migration, then A5 final QA.

Legacy refs after G: `supabase_legacy` answers still point at the public bucket. Before G, either DB refs must be rewritten to canonical paths (service-role, audited) or the server must answer legacy refs from GCS after the copy. **Decision required in NEW4-4D-9.**

### Legacy copy: NOT YET IMPLEMENTED

Next A6 ticket **NEW4-4D-9 (legacy Workshop object copy)**. Requirements: paginated Supabase listing (`originals/`, `previews/`, past 1000); same canonical path in GCS (signer, regional endpoint); create-only (`ifGenerationMatch: 0`); `Content-Type` + `Cache-Control: private, no-store`; size + MD5/CRC32C verification after write; manifest with counts / bytes / error classes only (no names, no UIDs); idempotent (existing identical object = skip; mismatch = report); delta pass; no Supabase delete until the GCS copy is verified; objects referenced by active orders / payment intents always preserved; non-canonical legacy names reported as counts with a separate disposition. Dry-run first.

### Supabase production state: OPS FACT REQUIRED

Not queried in this ticket. Needed read-only before Phase E: `workshop` bucket exists, `public` flag, `storage.objects` policies on `workshop`, aggregate object counts / bytes per prefix (no names, no UIDs, no bytes read), Supabase plan (Free vs Pro). Historical: public bucket, uploads with `cacheControl` 3600, project `qifloweuwyhvukabgnoa` (ap-northeast-2, Free).

### Release blockers (must clear before step 1)

1. ~~**A2: `referrerPolicy="no-referrer"`**~~ **CLOSED locally (NEW4-4D-8A, see that section).** On PDP `<img>` that render the Workshop front image (`ProductTheatreStage` `displayUrl`, `ProductTheatreRoomPreview` `artworkUrl`, `factualVisuals` / `ProductTruthSection`, `PdpStoryStatic` / `PdpStoryMobile` `frontTextureUrl`). For `workshop-single`, `ProductDetail` passes the signed src into these elements. Practical exposure is low: the global `Referrer-Policy: strict-origin-when-cross-origin` sends only the origin, and signed query strings are never in a referrer. It is still a consumer-contract violation and must ship in the release image.
2. Owner-provisioned QA identity (smoke).
3. A6 tooling for env-in-candidate deploy (or a reviewed one-off command).
4. Visible policy / legal copy in the release (11 commits) passes the A6 legal gate and A5 production-final QA.
5. Owner approval for push, migrations 1–6, deploy and promotion.

Not blocking promotion: A4 texture review (classified **NON-BLOCKING** for promotion). `TextureLoader.setCrossOrigin('anonymous')` is set. Textures persist in GPU memory after load, and signed srcs live in memory only. The ProductDetail refresh at 85 % swaps the URL and triggers a reload (possible flash, no leak). There is no re-sign on texture error. Check it in Phase D, required before A5 final QA. Legacy copy is required before Phase G, not before promotion.

### IAM follow-ups (no change)

None blocks promotion or Phase G. `run.builder` direct read (runtime SA can read objects without the signer): does not expose public access; required before declaring least privilege complete and recommended before Privacy finalization. Firebase project-wide TokenCreator: the same, plus owner audit. Editor `buckets.delete`: only an empty bucket; low risk while objects exist; required before least privilege complete.

### Privacy, logging, payment

Privacy CDN marker stays until Phase L (`NEW4-4_privacy-processors.md`); public Privacy copy unchanged. Cloud Logging `_Default` global bucket: OPEN → separate A6 logging-regionalization ticket (before Privacy finalization). Discord: NEW7 blocker. Payment frozen; no Toss; payment-test project `bvihpoorwriejybixmoc` is never used.

### Source control and rollback

Push: user request + owner approval → `git push origin main` of the release commits (WIP stays local, uncommitted) → fresh clone → `deploy-candidate.ps1` (or the env-capable variant) → smoke → `promote-candidate.ps1 -ValidateOnly` → promote.

Revision rollback (`rollback-production.ps1` → `stable`) if: sign-upload / sign-read unavailable or 5xx; commit / discard errors; canonical refs rejected by DB or server; Cart / PDP / admin / order-history image failures; NEW4-6 / NEW4-7 adapter 503; 5xx spike; any auth / signup / consent regression. After rollback the old client still works on the new schema, except new Workshop consents (NEW4-5) and canonical-ref thumbnails (see Feature gate). Migrations are additive: **do not roll back blindly**. Fix forward. Revert a single function only by a reviewed SQL that restores the prior definition (e.g. `add_custom_cart_item` from 2B-5A, or dropping the two path triggers). Never drop columns or ledger rows. GCS objects stay (create-only, private).

## PDP signed-media referrer (NEW4-4D-8A, A2)

Status: **DONE locally.** Closes release blocker 1. No deploy, no cutover, no remote mutation.

- **Flow.** For `workshop-single` with a cart item, `ProductDetail` puts the resolved temporary src into `product.image` / `front_image`. `getFullImageUrl` passes https through unchanged. So `ProductTheatreStage` `displayUrl`, `ProductTheatreRoomPreview` `artworkUrl`, `PdpStorySection` → `PdpStoryStatic` / `PdpStoryMobile` `frontTextureUrl`, and `factualImageSrc` → `ProductTruthSection` (`ImageSurfaceVisual`) and `ProductMountIncluded` (`IncludedSilhouette`) can all carry a signed src.
- **Fix.** Narrow optional prop `imageReferrerPolicy?: 'no-referrer'`, set by `ProductDetail` only when a Workshop preview ref exists and passed straight to those `<img>`: the theatre 2D image, the room-preview artwork, both static-story images, the mobile-story front, `ImageSurfaceVisual`, `IncludedSilhouette` artwork. Catalog omits the prop, so the attribute is not rendered and catalog markup is byte-identical (external catalog hosts may check Referer). No resolver, TTL, signed-read or storage change; no new logging or persistence.
- **Not patched (proven not to receive signed media).** The room photo `<img>` (local user photo object URL). `MountSchematicVisual` (not mounted). `WorkshopView`'s use of the theatre / room preview (local `blob:` raster preview, no network request).
- **A4 follow-up (Phase D, not a promotion blocker).** three.js `ImageLoader` creates its `<img>` with `crossOrigin` only. The `MetaloraArtwork3D` texture request (theatre viewer, desktop story canvas) therefore falls back to the global `strict-origin-when-cross-origin` and sends the page origin as referrer, never the signed query. A4 should load Workshop textures with no referrer (e.g. a fetch with `referrerPolicy: 'no-referrer'` into `ImageBitmap` / `blob:`). It belongs with the texture-expiry review. No A4 source touched here.
- **Verifier.** `npx tsx scripts/verify-new4-4d-8a-pdp-referrer.ts` (render + static, baseline via `git show`).

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
- A2 consumers (WorkshopView, durableHandoff, ProductDetail) switched in source only (NEW4-4D-5); A3 Cart, CartContext and admin consumers switched in source only (NEW4-4D-6); OrdersModal Workshop thumbnails switched in source only (NEW4-4D-7B). Production Workshop uploads and reads remain on Supabase.
- Supabase `workshop` bucket and policies unchanged; no customer object read, copied, moved or deleted.
- Payment frozen until NEW7.

## Remaining owners

- ~~A0 NEW4-4D-4: shared Workshop media resolver.~~ **DONE locally.**
- ~~A2 NEW4-4D-5: Workshop upload switch, resume, PDP workshop-single.~~ **DONE locally.** A4 targeted review of the WebGL texture expiry path recommended (no A4 code change required).
- ~~A0: D-4 R-scope refresh.~~ **DONE locally (NEW4-4D-7A, then NEW4-4D-7C post-D-7B, 95/95).** ~~A6: D-3 application-state check refresh.~~ **DONE locally (NEW4-4D-8).**
- ~~A2: `referrerPolicy="no-referrer"` on PDP Workshop-capable `<img>`.~~ **DONE locally (NEW4-4D-8A).**
- A6: legacy copy script (NEW4-4D-9), deploy tooling for env-in-candidate, release execution (NEW4-4D-10).
- ~~A3 NEW4-4D-6: Cart, CartContext, admin consumers.~~ **DONE locally.**
- ~~A3: `OrdersModal.tsx` after owner-approved protected-WIP handoff.~~ **DONE locally (NEW4-4D-7B)**; its seven pre-existing WIP hunks stay uncommitted for later Member/Account UX work.
- A4: targeted review of expiring texture sources before final cutover (see D-6), plus no-referrer texture loading (see NEW4-4D-8A). Phase D QA; not a promotion blocker.
- A6: deploy + env binding, migration apply, later tightening migration, legacy copy and cutover, Privacy finalization.

## Do not do

- Do not use `storage.googleapis.com` (global endpoint) for Workshop objects.
- Do not enable soft delete, versioning, retention, lifecycle deletion or Cloud CDN on this bucket.
- Do not add origins to CORS without a documented need.
- Do not create service-account keys.
- Do not store signed URLs anywhere, and do not log signed URLs, tokens or customer object paths.
- Do not make the Supabase `workshop` bucket private before the release guard is met (all consumers now read through the resolver; legacy objects still need the copy step).

## Future implementation order

1. Owner decisions on the open IAM items (parallel; required before calling least privilege complete).
2. ~~A6 NEW4-4D-3: adapter, NEW4-6/7 dual-store wiring, endpoints, path-validation migration (prepared).~~ **DONE locally.** Deploy + env binding is a separate A6 ticket with owner approval and must land before any client GCS upload.
3. ~~A0 NEW4-4D-4: `src/lib/workshopMedia.ts` resolver and `getFullImageUrl` handling for both legacy URLs and paths.~~ **DONE locally.**
4. A2 / A3 / A4: display consumers through the resolver. **A2 (Workshop upload / resume, PDP) done locally (D-5). A3 Cart, CartContext, admin done locally (D-6).** A4 review pending.
5. ~~`OrdersModal.tsx` protected-WIP handoff and migration (A3).~~ **DONE locally (NEW4-4D-7B).**
6. A6: apply the dual-format path-validation migration (see ordering above); A2 switches uploads to GCS.
7. Dual-store QA, legacy copy with verification, Supabase cutover (drop insert policy, make private, drop public select, delete legacy objects, wait at least the cache TTL), then the canonical-only tightening migration.
8. Privacy finalization (remove CDN entry and markers), then A5 QA.

## Ownership

A6: GCS ops/IAM, adapter, server endpoints, migrations, NEW4-6/7 integration, legacy copy, Privacy. A0: resolver, `getFullImageUrl`, package approval. A2: Workshop upload, `durableHandoff`, PDP (A4 review for WebGL textures). A3: Cart, CartContext, admin consumers, `OrdersModal.tsx` after WIP handoff. A5: read-only QA.

## Relevant files

`src/lib/workshopStorage.ts`, `src/lib/workshopMediaCore.ts`, `src/lib/workshopMedia.ts`, `src/lib/utils.ts`, `scripts/verify-new4-4d-4-workshop-media.ts`, `src/lib/customComposition/durableHandoff.ts`, `src/components/Workshop/WorkshopView.tsx`, `src/components/ProductDetail.tsx`, `scripts/verify-new4-4d-5-workshop-client.ts`, `src/lib/workshopMediaDisplay.ts`, `src/hooks/useWorkshopMediaDisplay.ts`, `src/context/CartContext.tsx`, `src/components/Cart.tsx`, `src/components/admin/adminOrders.ts`, `src/pages/AdminOrders.tsx`, `src/components/admin/adminBestSellers.ts`, `src/pages/AdminBestSellers.tsx`, `scripts/verify-new4-4d-6-cart-admin.ts`, `src/components/OrdersModal.tsx`, `scripts/verify-new4-4d-7b-ordersmodal.ts`, `src/components/pdp/ProductTheatreStage.tsx`, `src/components/pdp/ProductTheatreRoomPreview.tsx`, `src/components/pdp/ProductTruthSection.tsx`, `src/components/pdp/ProductMountIncluded.tsx`, `src/components/pdp/factualVisuals.tsx`, `src/components/pdp/story/PdpStorySection.tsx`, `src/components/pdp/story/PdpStoryStatic.tsx`, `src/components/pdp/story/PdpStoryMobile.tsx`, `scripts/verify-new4-4d-8a-pdp-referrer.ts`, `src/lib/workshopRetention.ts`, `src/lib/accountWithdrawal.ts`, `server.ts`, `supabase/migrations/20261007100000_new4_4d_path_validation.sql`, `scripts/verify-new4-4d-3-workshop-media.ts`, `scripts/verify-workshop-gcs-foundation.ts`, `.env.example`, `package.json`, `package-lock.json`, `docs/decisions/NEW4-4_privacy-processors.md`.
