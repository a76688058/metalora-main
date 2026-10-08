# NEW4-4D — Workshop private Seoul GCS media storage

Status: **ACCEPTED — ALL LOCAL SOURCE DONE (NEW4-4D-3 … 7C, 8A); D-3 VERIFIER REFRESHED + RELEASE PLAN WRITTEN (NEW4-4D-8); PDP referrer blocker CLOSED locally (NEW4-4D-8A); legacy read bridge + copy tooling DONE locally, NOT RUN (NEW4-4D-9); A2 legacy-ref resolver routing DONE locally (NEW4-4D-9A), A3 shared-display routing DONE locally (NEW4-4D-9B, 116/116), D-9A verifier aligned (NEW4-4D-9C): all client Workshop display consumers resolver-mediated; production read-only inventory: rerun captured output but the DB reference scan failed, so the inventory is incomplete; Supabase `workshop` bucket VERIFIED public; scanner fix + rebuilt job DONE and executed once (NEW4-4D-9D-3): references + source complete, critical three 0, 22 source objects all outside `originals/` / `previews/`, target GCS listing failed (owner accepted the 9D target baseline instead); aggregate source-structure classifier DONE locally, NOT RUN (NEW4-4D-9D-4, rebuild approval pending) (NEW4-4D-9D / 9D-1 / 9D-2 / 9D-3; all temporary bindings removed). BLOCKED for release** on the remaining items in "Release plan (NEW4-4D-8)". Signed regional delivery proven in NEW4-4D-2A.
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

**Resume.** ~~Legacy URL in progress → used directly as before.~~ Superseded by NEW4-4D-9A: strict legacy refs follow the canonical path below. Canonical path → `resolveWorkshopMediaSrc(ref, {mode: 'customer'})` → bytes fetched once (`mode: cors`, no referrer, no credentials) → local `blob:` URL for the editor and canvas (GCS objects are `no-store`, so reusing the signed src after 300 s would break the raster). One `retryWorkshopMediaAfterLoadError` on failure. Unresolvable → toast asks to re-upload, step 1; progress is not cleared or overwritten.

**ProductDetail (`workshop-single`).** Canonical `custom_image` → resolver (customer mode) → temporary src in React state, re-resolved before expiry (85 % of remaining lifetime), loading screen while resolving, image-less product on failure. ~~Legacy / non-canonical refs render exactly as before.~~ Superseded by NEW4-4D-9A: strict legacy refs also resolve; any other ref yields no src. Catalog products never touch the resolver.

**WebGL / A4 boundary.** The workshop preview reaches `ProductTheatreStage` → `PdpSpatialCanvas` → `MetaloraArtwork3D` (and the story canvas). The A4 `TextureLoader` already sets `crossOrigin = 'anonymous'`; no A4 code changed. A4 review recommended: texture load error has no Workshop re-sign hook (A2 mitigates with the pre-expiry refresh; a refresh swaps the texture URL). The theatre / room-preview `<img>` elements (A2 PDP files outside this ticket) carry no `referrerPolicy`; image requests send the page URL as referrer, not the signed query, so no signed-param leak. Add `referrerPolicy="no-referrer"` in the Cart / PDP display ticket. **Done in NEW4-4D-8A.**

**Local dev limitation.** Bucket CORS allows GET/PUT only from `https://metalora.art`. On localhost the signed PUT and the resume byte fetch fail CORS (generic upload / re-upload message); WebGL textures from GCS also fail. Verify end to end only on the production origin after the release guard, or with mocks.

**Verifier note.** The D-3 check "live client still uploads to Supabase workshop bucket" and the D-4 R-scope checks "no consumer imports the resolver" / "live upload still Supabase" were application-state snapshots for the pre-D-5 state and now fail by design (D-3 192/193, D-4 82/84; all contract checks pass). Owners (A6 for D-3, A0 for D-4) should update them to the D-5 state.

**Release guard.** Superseded by the consolidated list in the D-6 section.

## Cart / CartContext / admin consumers (NEW4-4D-6, A3)

Code: `src/lib/workshopMediaDisplay.ts` (display controller, no Supabase import; testable in Node), `src/hooks/useWorkshopMediaDisplay.ts` (binds it to the shared resolver), `src/context/CartContext.tsx`, `src/components/Cart.tsx`, `src/components/admin/adminOrders.ts`, `src/pages/AdminOrders.tsx`, `src/components/admin/adminBestSellers.ts`, `src/pages/AdminBestSellers.tsx`. Verifier: `npx tsx scripts/verify-new4-4d-6-cart-admin.ts` (real `handleSignRead`, mocked signer + DB refs, network disabled; no npm script).

- **Durable refs.** `cart_items.custom_image`, `custom_config.*_image_url` and `orders.ordered_items[]` keep the stored value (canonical path or legacy URL); nothing is rewritten. `CartContext.addToCart` refuses Workshop media that `normalizeWorkshopMediaRef` rejects (signed / regional / `blob:` / `data:` / other hosts) before any `cart_items` write. Workshop rows still enter through `add_custom_cart_item` (D-5). Hydrated `product.image` of a Workshop row is the durable ref. `AdminOrderItem.imageUrl` and `BestSellerItem.image` keep their names; for Workshop items they hold the durable ref, not a URL.
- **Display.** Canonical ref → one batched `resolveWorkshopMedia` per view (Cart only while open; AdminOrders list first items + open detail; best sellers visible Workshop rows) → temporary src in controller memory, re-resolved at 85 % of remaining lifetime, dropped on unmount. No new cache; the resolver cache is shared. Strict legacy Supabase Workshop URLs go through the same resolver since NEW4-4D-9B (they no longer render as stored; older non-UUID URLs → placeholder). Anything else (relative paths, `workshop/…`, queries, other hosts, signed URLs) → existing placeholder; no `getFullImageUrl` / public URL building for Workshop values. Catalog images unchanged.
- **Errors.** `<img onError>` → `retryWorkshopMediaAfterLoadError` once per issued src; second failure, or failure of a `supabase_legacy` src → placeholder. No technical error text, no logging.
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
- **Workshop items** (`product_id === 'workshop-single'`, unchanged; the server writes this id for custom snapshots): durable ref = `workshopOrderItemThumbRef` (preview first, never originals) → `workshopMedia.get(ref).src` (canonical and, since NEW4-4D-9B, strict legacy → server-chosen src in controller memory) → `<img referrerPolicy="no-referrer">`; `onError` → `workshopMedia.onLoadError` (one re-sign, then placeholder); no src / failed → existing `<Image>` placeholder. No picsum, no `getFullImageUrl`, no `crossOrigin`. Relative legacy paths (none expected) now show the placeholder instead of a rebuilt public URL.
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

Legacy refs after G: **decided in NEW4-4D-9: the server answers legacy refs from GCS after the copy; DB refs are not rewritten** (see "Legacy continuity" below).

## Legacy continuity, read bridge and copy tooling (NEW4-4D-9, A6)

Status: **DONE locally, NOT RUN.** No customer object read or copied, no Supabase / GCS / IAM / Cloud Run mutation, no migration, no production inventory executed. Baseline HEAD `fc680e3`.

### Continuity model (decided)

Authorized legacy DB ref → server normalizes it to its canonical path → GCS HEAD → a **verified copy** is served as a regional signed GCS src; otherwise the item stays `supabase_legacy`. Historical `orders.ordered_items`, `payment_intents.validated_snapshot` and consent evidence are never rewritten. Mutable tables that could later be canonicalized (separate, audited, optional ticket; not needed for the bridge): `cart_items.custom_image` / `custom_config`, `user_progress.uploaded_image_url`.

### Server bridge (`handleSignRead`, `workshopStorage.ts`)

- Authorization is unchanged: the DB reference index decides. The bridge runs only for refs already authorized as `supabase_legacy`.
- Response for a bridged item: `ref` = the original requested legacy ref, `store` = `gcs`, `src` = regional signed URL (300 s), `expiresAt`. The client resolver needs no change.
- Served from GCS only if `isBridgeableLegacyCopy`: custom metadata `workshop_origin=supabase_legacy` and `workshop_copy_state=verified`, metadata path equals the normalized path, and `validateCommitMetadata` passes (content type matches the extension, 1 ≤ size ≤ cap, `Cache-Control: private, no-store`). A GCS object without the marker (e.g. a new-upload object at the same path) is never served for a legacy ref.
- Flag `WORKSHOP_LEGACY_SUPABASE_FALLBACK_ENABLED` (not bound in Cloud Run; absent = `true`, backward-compatible):
  - `true`: absent / unverified copy → `supabase_legacy`; GCS HEAD or sign error → `supabase_legacy` (logged as `legacy_fallback_gcs_error` / `legacy_fallback_sign_error`, reason class only).
  - `false` (post-cutover): absent / unverified → item `{ ok: false, reason: 'unavailable' }` (client shows the placeholder); retryable GCS error → 503. Never a silent downgrade.
  - any other value → media routes 503 `workshop_legacy_mode_invalid` (fail closed).
- Discard refuses any object carrying the copy marker (409 `not_discardable`); retention / withdrawal own those objects.
- **Cutover precondition (DEPENDENCY REQUEST A2 / A3, A0 to coordinate).** Today the consumers render legacy public URLs directly and never call sign-read for them: `workshopMediaDisplay.ts` (`isLegacy` → direct src; used by Cart / CartContext / admin / OrdersModal), `ProductDetail.tsx` (`isCanonicalWorkshopRef` gate), `WorkshopView.tsx` (non-canonical → direct). Before Phase G these consumers must route strict legacy refs through the resolver, so the bridge takes effect. Until then the bridge is inert for those surfaces (no regression). **A2 part DONE locally (NEW4-4D-9A); `workshopMediaDisplay` consumers DONE locally (A3 NEW4-4D-9B).**

### A2 legacy-ref resolver routing (NEW4-4D-9A, A2)

Status: **DONE locally.** No deploy, push, migration, Supabase / GCS customer access or remote mutation by the change itself (see the incident note below).

- **Rule.** In the A2 Workshop paths, a ref accepted by the shared strict parser (`normalizeWorkshopMediaRef`: canonical path or the configured METALORA Supabase `workshop` URL) goes to sign-read. Anything else yields no Workshop src. There is no client branch that renders a legacy URL by itself. The server (`WORKSHOP_LEGACY_SUPABASE_FALLBACK_ENABLED`) decides whether the src is a signed GCS URL or the approved legacy URL, so the Phase G switch to `false` needs no client deploy.
- **ProductDetail.** The resolve / refresh logic moved into `src/components/pdp/workshopPreviewSource.ts`; the hook in `ProductDetail.tsx` is a thin wrapper. Canonical and strict legacy `custom_image` resolve in customer mode. The refresh at 85 % of the remaining lifetime applies to any expiring result (legacy bridged to GCS included, no origin special case). A `supabase_legacy` result has no expiry and no timer. Failure → no src (placeholder); never the raw ref. D-8A `no-referrer` is unchanged (policy whenever a Workshop preview ref exists).
- **Workshop resume.** Every valid saved ref → `loadResumedWorkshopOriginal` (resolver → one GET of the server-chosen src → local `blob:` for editor / canvas). One re-sign only when the result is GCS. Resolver or GET failure, or an invalid ref → existing re-upload toast, step 1; `user_progress` untouched. `durableOriginalRef` keeps the original ref, so progress and cart keep writing the legacy ref as before.
- **Not changed.** D-5 upload (sign-upload → regional PUT → commit), `durableHandoff.ts`, shared resolver, server, Cart / CartContext / admin / OrdersModal, migrations. No DB rewrite of any ref.
- **Verifiers.** `npx tsx scripts/verify-new4-4d-9a-legacy-a2.ts` (real client resolver ↔ real `handleSignRead` with the D-9 bridge, in-memory GCS, fake timers). D-5 assertions M / N / Q / W and D-8A's ProductDetail hook checks were moved to the forward state (resolver-mediated legacy); totals unchanged.
- **Incident (payment-test, not production).** During validation `scripts/verify-2f-b2-payment-gate.ts` (not on the ticket list) was run. It creates synthetic users in the payment-test project and deletes them in `finally`; OTP send / verify records and auth log entries may remain there. It reported 17/19 (both failures in its signup-complete step, outside this ticket's scope). That verifier is **not local-only** and must not be run in no-remote-mutation tickets.

### A3 shared display legacy-ref routing (NEW4-4D-9B, A3)

Status: **DONE locally.** No deploy, push, env, migration, customer data access or Supabase / GCS / IAM mutation.

- **Rule.** `workshopMediaDisplay.ts` sends canonical refs and strict legacy refs (shared parser `isLegacyWorkshopRef`: configured METALORA Supabase host, `public` / `authenticated` / `sign?token=` `workshop` URL, strict canonical path) to the shared resolver in the caller's mode. There is no raw-legacy display branch (`LEGACY_PUBLIC_PREFIX`, `brokenLegacy` and the production-host prefix check removed). The server picks the src: bridged signed GCS (`store=gcs`), approved legacy URL (`supabase_legacy`, fallback on), or `unavailable` (fallback off) → placeholder. Resolver failure (401 / 403 / 5xx / signed out / not authorized) → placeholder; the input is never used as src.
- **Consumers.** Cart, AdminOrders, AdminBestSellers (display + download) and OrdersModal inherit this through the shared controller. No consumer file changed. OrdersModal untouched, seven WIP hunks still uncommitted. The best-seller download fetches only the resolved src (`no-referrer`, `credentials: omit`, `no-store`, `blob:`). Catalog unchanged.
- **Same policy as canonical.** One re-sign after a load error when the result is GCS; a `supabase_legacy` src has no re-sign and goes to the placeholder. One shared resolver cache keyed by the durable ref. Thumbnails skip `originals/…` for legacy URLs too (`normalize`).
- **Behavior change.** Older non-UUID legacy public URLs no longer render (placeholder). The D-9 inventory counts them as `malformed_referenced`, a cutover blocker.
- **Not changed.** Shared resolver / core, server, durable refs (no DB rewrite), CartContext guard, payment freeze.
- **Verifiers.** `npx tsx scripts/verify-new4-4d-9b-legacy-a3.ts` (real resolver core ↔ real `handleSignRead` with the D-9 bridge, mocked GCS head / sign and DB refs, network off). D-6 sections B / H / K / R and D-7B section C moved to the resolver-mediated legacy state; totals unchanged (138 / 47).
- **Payment-test note (carried forward).** `scripts/verify-2f-b2-payment-gate.ts` (not a ticket verifier) previously created and deleted synthetic users in the PAYMENT-TEST Supabase project; production not touched; OTP / auth log entries may remain there. Not rerun, no cleanup or inspection done; do not run it in no-remote-mutation tickets.

### Client cutover state + D-9A verifier alignment (NEW4-4D-9C, A2, test-only)

Status: **DONE locally.** No product code changed. No production read, inventory, copy, deploy, env, Supabase / GCS / IAM mutation, migration or payment-test run.

- **State.** Every client Workshop display consumer is resolver-mediated for canonical paths and strict legacy Supabase Workshop URLs: ProductDetail and Workshop resume (D-9A), plus Cart, CartContext, AdminOrders, AdminBestSellers and OrdersModal through `workshopMediaDisplay` (D-9B). No client raw-legacy display shortcut remains. The server's `WORKSHOP_LEGACY_SUPABASE_FALLBACK_ENABLED` alone decides between signed GCS and the approved legacy URL; resolver failure → placeholder, never the input. No durable ref is rewritten.
- **Verifier.** D-9A's two byte freezes on `workshopMediaDisplay.ts` / `useWorkshopMediaDisplay.ts` (stale after D-9B) were replaced by 21 forward-state checks (section W): the real display controller ↔ real resolver ↔ real `handleSignRead` bridge (canonical and legacy sent to sign-read; GCS bridge and server-approved legacy srcs; post-cutover miss and unauthorized → placeholder; one shared re-sign; no second cache / TTL; shared parser as the only acceptance authority; no rewrite; no logging). D-9A is now 121/121. No other A2 check was changed.
- **Open (cutover).** Non-UUID / malformed historical legacy refs are not accepted by the strict parser and show the placeholder. They are a production-inventory concern (`malformed_referenced`, cutover blocker) and need an owner / A6 disposition after the dry-run.
- **Next.** Owner-approved read-only production ops facts and legacy-copy dry-run (A6). Nothing in this ticket touched production.

### Copy tool (`scripts/workshop-legacy-copy.ts` + `workshop-legacy-copy-core.ts`)

- Modes: dry-run is the default (listing + DB scan + GCS metadata; `--verify-bytes` also reads and hashes). `--apply` requires `--confirm-production-copy=qifloweuwyhvukabgnoa` and always verifies bytes. Every run requires `--ack-readonly-production-inventory`. The payment-test project and unknown projects are refused. Conflicting or unknown flags are refused; `--concurrency` 1–8.
- Guards: `WORKSHOP_GCS_BUCKET` must be the approved bucket and the endpoint regional. The ADC identity must be `workshop-legacy-copy@metalora-auth.iam.gserviceaccount.com`. No dotenv, no files written, output is one aggregate JSON (counters + gate) or a reason code.
- Scope: only DB-referenced, strict-canonical source objects are copied. Unreferenced objects are counted, never copied (retention domain; deleted / withdrawn data is not resurrected). Orders are scanned with `image_purged_at IS NULL`; a purged order does not keep an object referenced. Referenced status is independent of object age (NEW4-6). Retained withdrawn-account order evidence stays referenced and bridgeable (NEW4-7).
- Write: same canonical path; create-only (`ifGenerationMatch: 0`, single request, client `md5Hash` + `validation: 'md5'`); `Content-Type` from the extension, checked against magic bytes; `Cache-Control: private, no-store`; custom metadata `workshop_copy_state=written` + `workshop_source_sha256`. Then HEAD (size, MD5, SHA metadata, type, cache), target re-download + SHA-256 compare, then `setMetadata(state=verified)` with `ifMetagenerationMatch`. An interrupted `written` object is promoted only after the same checks. No public URL; signed URLs are never created or persisted.
- Idempotency: existing verified identical → `target_matching`; any difference (bytes, size, type, cache, missing marker) → `target_conflict`, never overwritten.
- Hash semantics: GCS `md5Hash` is the base64 MD5 of the stored bytes for non-composite single-request uploads (this tool's case); CRC32C is also stored by GCS but not used. Source integrity is SHA-256 over the downloaded bytes, stored as metadata and re-checked on the target bytes.
- Bounds: 25 MiB originals / 5 MiB previews (listed size checked before download, actual size after), Supabase list pages of 1000 with offset paging, depth limit 6, DB keyset paging 1000 rows, bounded worker pool, 3 attempts with backoff for retryable errors.
- No delete, move, bucket / policy / IAM / visibility change, no SQL writes (static-checked).

### Classification (aggregate counters only)

Source: A `canonical_bridgeable`, B `noncanonical_filename` (+ `noncanonical_referenced_source`), C `unexpected_prefix`, D `unsupported_extension`, E `malformed_path`, F `duplicate_target`, plus `oversize`, `placeholder_ignored`. Target: G `target_matching`, H `target_conflict`, I `target_missing`, plus `target_unverified`, `target_promoted`, `copied_verified`, `content_signature_mismatch`, `source_size_mismatch`, `copy_failed_*`. References: `referenced_legacy_total`, `legacy_ref_occurrences`, `canonical_refs`, `malformed_referenced` (legacy-host Workshop URL that is not strict canonical, e.g. non-UUID filename), `foreign_host_referenced`, `unrecognized_referenced`, `referenced_missing_source`, `referenced_legacy_resolvable_from_gcs`. A referenced unmappable object (non-UUID / malformed) is a **cutover blocker**.

DB reference inventory (read-only, keyset): `user_progress.uploaded_image_url`, `cart_items.custom_image`, `cart_items.custom_config.original_image_url` / `preview_image_url`, `orders.ordered_items` (unpurged), `payment_intents.validated_snapshot`. No UIDs, order IDs, paths or URLs are output. **Must not be executed against production without owner approval.**

### Machine cutover gate (`evaluateLegacyCutoverGate`)

PASS only if all hold: byte-verified run (apply or `--verify-bytes`), inventory complete (no list / lookup errors, no absent table), no copy failures, `referenced_legacy_resolvable_from_gcs == referenced_legacy_total`, `target_conflict == 0`, `referenced_missing_source == 0`, `malformed_referenced == 0`, `unrecognized_referenced == 0`, `duplicate_target == 0`. Exceptions are never auto-adjudicated; each needs an explicit owner / A6 decision recorded here.

### Execution architecture (recommended, not provisioned)

**Cloud Run Job in asia-northeast3**, one task, keyless dedicated SA `workshop-legacy-copy@metalora-auth.iam.gserviceaccount.com`, job-specific image (the runtime Dockerfile has no `scripts/`). Bytes stay Seoul Supabase (ap-northeast-2) → Seoul job → Seoul bucket, never on an operator laptop. Rejected: local operator run (customer images transit a personal device + operator credentials); Storage Transfer Service (cannot authenticate to Supabase Storage); runtime-service endpoint (mixes the web SA with bulk copy).

Minimal IAM for the job SA (owner approval required, none granted): bucket-level custom role with `storage.objects.create`, `storage.objects.get`, `storage.objects.list`, `storage.objects.update` (no delete, no bucket / IAM permissions); `roles/secretmanager.secretAccessor` on the one Supabase secret only. No signer TokenCreator (the job never signs). No keys.

Supabase credential: `SUPABASE_SERVICE_ROLE_KEY` via a Secret Manager env reference (owner approval; it is broad). Supabase S3 access keys may be narrower but are unverified for this plan.

### Source download

supabase-js `storage.from('workshop').download(path)`: an authenticated Storage API object GET (`/storage/v1/object/workshop/<path>` with a service-role `Authorization` header), not the public `/object/public/` URL. It still traverses the Supabase API gateway / Cloudflare edge; avoiding the CDN entirely is **UNPROVEN**. The authenticated route is expected to be uncached, which is not verified.

### Dual-store / delta flow

1 dry-run (metadata) → 2 apply → 3 dry-run `--verify-bytes` → 4 soak (bridge live with fallback `true`, after the consumer switch) → 5 final delta dry-run → 6 final apply → 7 verify: gate PASS (zero unresolved). Then set the flag to `false` on a reviewed revision, then Phase G. Copy is not a purge: retention and withdrawal continue to delete in both stores.

### Ops facts still required (owner read-only authorization; not inferred)

`workshop` bucket `public` flag; `storage.objects` policies on `workshop`; aggregate object counts / bytes per class; malformed / non-UUID referenced counts (the tool's dry-run produces these once approved); Supabase plan (Free vs Pro); live `add_custom_cart_item` signature.

### Verifier

`npx tsx scripts/verify-new4-4d-9-legacy-copy.ts` (mocked; bridge A–K, copy args / classification / dry-run / apply / retry / delta / semantics / metadata-only / static safety).

## Production read-only inventory (NEW4-4D-9D, A6)

Status: **BLOCKED — CREDENTIAL ACCESS REQUIRED.** The owner approved read-only ops facts and a metadata / DB-reference / aggregate-only dry-run (no byte download, no apply, no mutation). The tool is ready (`--metadata-only`). The Supabase part was **not executed**: no production Supabase credential is available locally without retrieving a raw secret, and the ticket forbids that. Baseline HEAD `7da9340`.

- **Credential state (names only).** No local production `.env`. The only Supabase env files present are payment-test (`.env.payment-test*`, forbidden). No Supabase CLI login token, no `SUPABASE_ACCESS_TOKEN`, no gcloud ADC file. The production `SUPABASE_SERVICE_ROLE_KEY` exists only in the production Cloud Run / Secret Manager configuration; reading it out was not done.
- **Metadata-only mode (added, verified).** `--metadata-only` (requires `--ack-readonly-production-inventory`; refuses `--apply`, `--verify-bytes`, `--confirm-production-copy`). It needs no copy-job SA.
  - Structural guarantee: dedicated adapters (`createSupabaseLegacyMetadataSource`, `createGcsLegacyMetadataTarget`) have no object-body or write implementation; their download / create / mark ports throw.
  - Second layer: the core swaps those ports for counted refusals again (`byte_read_attempts`, `write_attempts`, a pre-copy blocker if > 0).
  - Credentials: GCS uses ADC with `devstorage.read_only`, else the operator's `gcloud auth print-access-token`. That token stays in memory and is not scope-narrowed; on that path the adapters are the guarantee.
  - Labels: a verified marker with consistent metadata is a `target_metadata_match_candidate`, never counted as resolvable. The output carries `cutover_gate: NOT_EVALUATED` and `pre_copy_inventory: READY | BLOCKED` with named blockers.
  - New aggregates: `originals_total`, `previews_total`, `non_uuid_referenced`, `references_by_field` (`<table.column>:<class>` occurrence counts), target bucket totals and marker counts, Supabase bucket facts (`exists`, `public`, `file_size_limit`, `allowed_mime_types`).
  - D-9 verifier 166/166 (30 metadata-only checks: trap adapters prove zero body reads and zero writes).
- **Executed (read-only, aggregate).** Target bucket metadata listing on the Seoul regional endpoint with the operator gcloud login: `target_objects_total = 1`; under `originals/` 0, under `previews/` 0; legacy copy markers `verified` 0, `written` 0. The single object lies outside the customer prefixes and was not further classified (a follow-up prefix read was not pursued). No object body read, no write.
- **Not executed (credential):** Supabase `workshop` bucket facts, storage policies, the plan, `add_custom_cart_item`, migration state, source inventory, DB reference inventory. All remain **UNVERIFIED**. Historical (not re-verified): public bucket, Free plan.
- **No customer byte access:** source bodies 0, target bodies 0, hash verification NOT RUN, image decoding NOT RUN.
- This is **not** a copy gate. Pre-copy inventory: **NOT RUN**.

Resume condition: the owner authorizes one secure credential path, without exposing the value to the operator console:
- (a) a Cloud Run Job (Seoul) running the metadata-only command with `SUPABASE_SERVICE_ROLE_KEY` as a Secret Manager env reference and a read-only GCS identity; or
- (b) an operator-held Supabase Management API token (or a read-only DB role) injected into the process env for ops facts; or
- (c) an explicit owner instruction to inject the service-role key into the local process env without printing it.

Ops facts (policies, plan, function signature, migration list) additionally need SQL / Management API access: the service role cannot read `pg_policies` / `pg_proc` / `supabase_migrations` through PostgREST.

Resume procedure:
1. `npx tsx scripts/workshop-legacy-copy.ts --ack-readonly-production-inventory --metadata-only` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKSHOP_GCS_BUCKET` and `WORKSHOP_GCS_ENDPOINT` injected.
2. Read-only SQL for policies / function / migrations.
3. Record the aggregates here.
4. If `non_uuid_referenced` or `malformed_referenced` > 0: CUTOVER BLOCKER, owner disposition required.

## Seoul metadata inventory job (NEW4-4D-9D-1, A6)

Status: **BLOCKED — OUTPUT NOT CAPTURED.** The job executed once and succeeded, but its aggregate report never reached Cloud Logging. The job SA has no `roles/logging.logWriter`, and Cloud Run writes container stdout as the job identity. The owner declined the extra logWriter grant (2026-10-08), so there was no rerun. **No inventory counters exist.** Source commit `266e1be`.

- **Job:** Cloud Run Job `workshop-metadata-inventory`, asia-northeast3, project `metalora-auth`.
  - 1 task, max retries 0, timeout 1800 s, no schedule, no HTTP endpoint.
  - Execution `workshop-metadata-inventory-6vwsj`: 1 succeeded, 0 failed.
- **Image:** `us-west1-docker.pkg.dev/metalora-auth/cloud-run-source-deploy/workshop-metadata-inventory`, tag = the full source SHA of `266e1be`, digest `sha256:eadd299f4303…c91b2b`.
  - Built by Cloud Build from a `git archive` of 7 tracked paths of `266e1be` (blob-verified; no WIP, `dist/` or `.env`).
  - `Dockerfile.workshop-inventory`: `npm ci --omit=dev --ignore-scripts`, `USER node`, no ARG / ENV secrets.
- **Fixed command:** `scripts/workshop-metadata-inventory-job.ts` hard-codes `--ack-readonly-production-inventory --metadata-only` and refuses any runtime argument.
- **List-only GCS target:** the metadata-only target answers `head` from one paged bucket listing, so it needs only `storage.objects.list` and never issues a per-object GET.
- **Identity:** `workshop-metadata-inventory@metalora-auth.iam.gserviceaccount.com`. Keyless (0 user-managed keys), no project roles.
- **Temporary bindings, granted only for the run** (granted → job created → executed → removed in a `finally` block):
  - `roles/secretmanager.secretAccessor` on `metalora-direct-supabase-service-role` only. The job env referenced version `1`, as the web service does. The secret value was never accessed or printed by the operator.
  - `roles/storage.legacyBucketReader` on `gs://metalora-workshop-apne3` only: `storage.objects.list` + bucket / folder metadata, **no `storage.objects.get`**, so no object-body read.
  - Post-run verification: both bindings **ABSENT**; the SA has no project roles and no keys.
- **Non-secret env:** `SUPABASE_URL` (production project URL), `WORKSHOP_GCS_BUCKET`, `WORKSHOP_GCS_ENDPOINT`. The fallback flag was not bound anywhere. `metalora-direct` and its traffic were unchanged.
- **Output and safety:**
  - Logs hold audit system events only; 0 application lines, so 0 leaked identifiers (leak scan on 0 lines).
  - `byte_read_attempts` / `write_attempts`: not observable (report lost). Structurally, the image cannot read bodies (refusing ports; list-only IAM without `objects.get`) or write (refusing ports; no write role).
  - No copy, no hash verification, final D-9 gate NOT EVALUATED.
- **Ops facts:** still UNVERIFIED (bucket facts were in the lost report). Policies, `add_custom_cart_item`, migration state and plan still need read-only SQL / Management access.

Resume condition: the owner approves a temporary `roles/logging.logWriter` for the job SA (project-level; write-only to logs), or another approved output channel. Then: re-grant the two temporary bindings, `gcloud run jobs execute workshop-metadata-inventory --region asia-northeast3 --wait` once, remove all three bindings and verify ABSENT, leak-scan the logs, record the aggregates here.

Do not: reuse the job for copy; add `--apply` / `--verify-bytes`; grant `objectViewer` / `objectUser`; leave bindings in place.

## Inventory rerun (NEW4-4D-9D-2, A6)

Status: **BLOCKED — DB REFERENCE SCAN FAILED (inventory incomplete).** The owner approved a temporary project-level `roles/logging.logWriter` plus a re-grant of the two bindings and exactly one execution. Execution `workshop-metadata-inventory-tl929`: SUCCEEDED (1/0); no other execution this ticket. Same job, same image digest (`266e1be`), no rebuild.

- **Temporary IAM:**
  - `roles/logging.logWriter` (project), `roles/secretmanager.secretAccessor` (`metalora-direct-supabase-service-role` only), `roles/storage.legacyBucketReader` (`gs://metalora-workshop-apne3` only).
  - All three were verified PRESENT and exact before execution, then removed in a `finally` block. All three verified **ABSENT** afterwards; the SA has no project roles and 0 keys.
- **Log safety:** stdout captured (134 lines, 0 stderr), aggregate JSON only. The leak scan (UUID, URL, Supabase host, customer prefixes, JWT, Bearer, email, signed params, stack, long hex, order-number shapes) found **0 hits**.
- **Captured aggregates:**
  - `byte_read_attempts = 0`, `write_attempts = 0`, `metadata_only = true`, `byte_verified = false`.
  - Supabase `workshop` bucket: exists **true**, public **true**, `file_size_limit` **null**, `allowed_mime_types` **null** (VERIFIED via the Storage API).
  - `reference_lookup_errors = 1`, `reference_values_scanned = 0`. By design the core stops after a failed reference scan, so the **source listing and the target listing did not run**: every source / reference / target counter is 0 because nothing was counted (`target_inventory_listed = false`), **not** because the data is empty.
  - `pre_copy_inventory = BLOCKED` (`inventory_complete`); cutover gate NOT_EVALUATED.
- **Cause: UNEXPLAINED (error class not logged by the tool).**
  - Leading hypothesis: the `orders` scan filters on `image_purged_at`, a column added only by NEW4-6 migration `20261007070000`, which is not applied in production. PostgREST would return an undefined-column error that the tool does not treat as an absent table.
  - Equally consistent with `reference_values_scanned = 0`: a failure on the first table (`user_progress`).
  - Not retried.
- **Critical counters** (`non_uuid_referenced`, `malformed_referenced`, `referenced_missing_source`): **NOT MEASURED**. Data-shape blocker: UNKNOWN.
- **Target GCS:** not listed by the job. From NEW4-4D-9D (operator, count-only): 1 object, 0 under customer prefixes, 0 copy markers.
- No customer copy, no byte / hash verification, no Supabase / GCS object mutation, `metalora-direct` and its traffic unchanged.
- **Still requires read-only SQL / Management:** storage policies, `add_custom_cart_item`, migration state. Supabase plan UNVERIFIED.

Required fix before the next run (A6 tooling ticket + image rebuild + owner approval):
1. Report a sanitized reference-scan failure class: table name + PostgREST / Postgres error code only.
2. Treat a missing `image_purged_at` column as "no order purged yet" and scan all orders (a conservative superset), reported as `orders_purge_column_absent`.
3. Continue the source and target listings when the reference scan fails, so source aggregates are still produced (the pre-copy gate stays BLOCKED).

Then re-run once under the same three temporary bindings.

## Inventory scanner fix + rebuild (NEW4-4D-9D-3, A6)

Status: **BLOCKED — TARGET LISTING FAILED (see "Execution").** Fix, image and job update are DONE. The first execution approval was skipped; the owner then approved one execution.

- **Tooling fix (`fe1ee1b`, `fix(workshop): harden production inventory scan`):**
  - Each reference table is scanned independently and reports `reference_sources.<table>` = ok / absent / failed, plus `reference_failures.<table>` = a sanitized code (SQLSTATE / PostgREST code, `http_<status>`, `no_code` or `request_failed`). Messages are never output.
  - `orders`: if and only if the error is 42703 naming `image_purged_at`, all orders are rescanned without the filter and `orders_purge_column_absent = true`. Any other error is a failure, not a fallback.
  - Metadata-only runs list the target and source even when references fail. Copy modes still stop on a partial reference set.
  - Explicit `bucket_facts_complete`, `reference_scan_complete`, `source_inventory_complete`, `target_inventory_complete`, `source_list_errors`, `target_list_errors` (renamed from `target_inventory_errors`).
  - Output adds `inventory_status`, a per-phase `measurement` (MEASURED / PARTIAL / NOT_MEASURED), `critical_counters` (null unless references and source are both complete) and `data_shape_assessment` (`NO_DATA_SHAPE_BLOCKER` / `CUTOVER_DATA_BLOCKER` / `INVENTORY_INCOMPLETE`).
  - The CLI prints the report, then exits **3** if the inventory is incomplete, so the Cloud Run execution shows FAILED. Max retries stays 0.
  - D-9 verifier: 208/208.
- **Image:** clean `git archive` of `fe1ee1b` (no protected WIP, no `dist/`, no `.env`). Cloud Build `38564bf4` in the existing `cloud-run-source-deploy` repository, tag = full SHA, digest `sha256:1be579a4435d6e51a5e3a4fc8c2558f346c2cf52a408635409f8cfc755da7031`. No build-time secret.
- **Job `workshop-metadata-inventory` (asia-northeast3):** image updated to that digest. SA, maxRetries 0, 1 task, 1800 s timeout, fixed entrypoint (no args) and secret reference are unchanged. No schedule, no endpoint.
  - The update requires the Secret Accessor at deploy time, because Cloud Run validates the secret reference against the job SA. The first update attempt failed with no change, so the three temporary bindings were granted before the update.
- **Temporary IAM:** all three granted and verified exact, then removed when the execution was skipped. Verified **ABSENT** (0 bindings on project / secret / bucket), 0 SA keys.
- **Execution:** **none.** Executions remain `tl929` and `6vwsj` only. No customer data read, no copy, no Supabase / GCS object mutation, `metalora-direct` untouched.

### Execution (owner-approved, 2026-10-08)

Status: **BLOCKED — TARGET GCS LISTING FAILED (inventory incomplete).**

- **Execution:** `workshop-metadata-inventory-wn9sh`, run exactly once.
  - Cloud Run reports FAILED: the container called `exit(3)` because the inventory is incomplete. This is by design.
  - No retry and no other execution. No rebuild or update; image `sha256:1be579a4…7031`.
- **Temporary IAM:** the same three bindings were granted and verified exact, then removed in `finally`. Verified **ABSENT**; 0 SA keys.
- **Log safety:** 94 stdout lines, 0 stderr, aggregate JSON only. The leak scan (UUID, URL, Supabase host, customer prefixes, JWT, Bearer, email, signed params, stack, long hex, order number, raw DB text, secret names) found **0 hits**.
- **Phases:**
  - `bucket_facts_complete = true`, `reference_scan_complete = true`, `source_inventory_complete = true`.
  - `target_inventory_complete = false` (`target_list_errors = 1`).
  - `reference_lookup_errors = 0`, `source_list_errors = 0`.
- **References:**
  - All four tables `ok`, no failures, `tables_absent = 0`.
  - **`orders_purge_column_absent = true`.** Production predates NEW4-6, so the purge-column filter was the 9D-2 failure cause; the fallback scanned all orders.
  - `reference_values_scanned = 0`: no non-null string value in any scanned Workshop field. Row counts are not instrumented.
  - Every reference counter is 0 (`referenced_legacy_total`, `canonical_refs`, `malformed`, `non_uuid`, `unrecognized`, `foreign_host`).
- **Source (Supabase `workshop`):**
  - `source_objects_total = 22`, `source_bytes_total = 39808349`.
  - `originals_total = 0`, `previews_total = 0`, **`unexpected_prefix = 22`**.
  - `canonical_bridgeable = 0`, `noncanonical_filename = 0`, `malformed_path = 0`, `unsupported_extension = 0`, `oversize = 0`, `placeholder_ignored = 0`.
  - Bucket: exists true, public true, size limit null, MIME null.
- **Critical three (MEASURED: references + source complete):** `non_uuid_referenced = 0`, `malformed_referenced = 0`, `referenced_missing_source = 0`.
  - Assessment stays **INVENTORY_INCOMPLETE** because the target phase is incomplete.
- **Target:** not measured. The failure class of the target listing is not logged; the cause is UNEXPLAINED. A plausible but unconfirmed cause is bucket-IAM propagation within about 20 s of the grant.
- `byte_read_attempts = 0`, `write_attempts = 0`. No customer bytes, no copy, no Supabase / GCS mutation, `metalora-direct` unchanged.

Owner decisions:
1. Whether to accept the target state measured by the operator in NEW4-4D-9D (1 object, 0 customer-prefix, 0 markers), or approve a sanitized target-error code plus one more rerun with a longer IAM-propagation wait.
2. What to do with the 22 objects outside `originals/` / `previews/`, none of them DB-referenced. They are not copy candidates under the current tool. An aggregate-only prefix-shape classification would be needed before any decision.

## Legacy source structure classification (NEW4-4D-9D-4, A6)

Status: **BLOCKED — NOT RUN (image rebuild not approved).** The classifier is DONE locally (`c3ce83a`, D-9 222/222). No IAM grant, no job update, no execution, no remote action.

- **Owner decision (2026-10-08):** the NEW4-4D-9D target state (1 object, 0 customer-prefix, 0 copy markers) is the accepted target **baseline**. No GCS object mutation has happened since. Target must be re-verified before any actual copy or final cutover.
- **Classifier:** every metadata-only report now carries `source_structure`, which holds category counts only:
  - depth (root file / one-level / two-level / deeper);
  - root (canonical originals/previews / other / root file);
  - distinct top- and second-level prefixes by UUID-like shape;
  - filename shape (UUID-like / timestamp-like / other);
  - extension and MIME, each from a fixed allowlist (else `other` / `none` / `unknown`);
  - size (total / min / max / five buckets / unknown);
  - age from listing `created_at` (<30 d / 30–90 / 90–365 / >365 / unknown);
  - DB-referenced vs unreferenced.
  
  Names are held in memory only for deduplication and are never output. Job arguments and entrypoint are unchanged.
- **Blocker:** running it needs a rebuild of the inventory image from `c3ce83a` and an update of the existing job's image. Both are outside the 9D-4 approval as written, and the owner skipped that approval card.

Resume (owner approval needed for the rebuild + job update):
1. Build from a clean `git archive` of `c3ce83a` into the existing repository.
2. Grant the Secret Accessor first (Cloud Run validates the secret reference at deploy time), then logWriter.
3. Update the job image, then execute once. Do **not** grant the bucket role: the target phase will report incomplete and exit 3 by design, per the accepted baseline.
4. Remove both grants and verify ABSENT, then leak-scan and record `source_structure`.

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
- ~~A6: legacy copy script and read bridge (NEW4-4D-9).~~ **DONE locally, not run.** A6: deploy tooling for env-in-candidate, release execution (NEW4-4D-10), owner-approved dry-run / copy execution. NEW4-4D-9D-1 / 9D-2 Seoul inventory job: second run captured, DB reference scan failed; tooling fix + image rebuild DONE (`fe1ee1b`, NEW4-4D-9D-3), executed once (`wn9sh`): **target listing failed; owner decision on the target phase + the 22 unexpected-prefix objects required** (see "Inventory scanner fix + rebuild").
- ~~A2 (`ProductDetail`, `WorkshopView`): route strict legacy refs through the resolver.~~ **DONE locally (NEW4-4D-9A).** ~~A3 (`workshopMediaDisplay` consumers: Cart / CartContext / admin / OrdersModal): same, NEW4-4D-9B.~~ **DONE locally (NEW4-4D-9B; D-9A aligned in NEW4-4D-9C).**
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

`src/lib/workshopStorage.ts`, `src/lib/workshopMediaCore.ts`, `src/lib/workshopMedia.ts`, `src/lib/utils.ts`, `scripts/verify-new4-4d-4-workshop-media.ts`, `src/lib/customComposition/durableHandoff.ts`, `src/components/Workshop/WorkshopView.tsx`, `src/components/ProductDetail.tsx`, `scripts/verify-new4-4d-5-workshop-client.ts`, `src/lib/workshopMediaDisplay.ts`, `src/hooks/useWorkshopMediaDisplay.ts`, `src/context/CartContext.tsx`, `src/components/Cart.tsx`, `src/components/admin/adminOrders.ts`, `src/pages/AdminOrders.tsx`, `src/components/admin/adminBestSellers.ts`, `src/pages/AdminBestSellers.tsx`, `scripts/verify-new4-4d-6-cart-admin.ts`, `src/components/OrdersModal.tsx`, `scripts/verify-new4-4d-7b-ordersmodal.ts`, `src/components/pdp/ProductTheatreStage.tsx`, `src/components/pdp/ProductTheatreRoomPreview.tsx`, `src/components/pdp/ProductTruthSection.tsx`, `src/components/pdp/ProductMountIncluded.tsx`, `src/components/pdp/factualVisuals.tsx`, `src/components/pdp/story/PdpStorySection.tsx`, `src/components/pdp/story/PdpStoryStatic.tsx`, `src/components/pdp/story/PdpStoryMobile.tsx`, `scripts/verify-new4-4d-8a-pdp-referrer.ts`, `src/components/pdp/workshopPreviewSource.ts`, `scripts/verify-new4-4d-9a-legacy-a2.ts`, `scripts/workshop-legacy-copy.ts`, `scripts/workshop-legacy-copy-core.ts`, `scripts/verify-new4-4d-9-legacy-copy.ts`, `scripts/workshop-metadata-inventory-job.ts`, `Dockerfile.workshop-inventory`, `src/lib/workshopRetention.ts`, `src/lib/accountWithdrawal.ts`, `server.ts`, `supabase/migrations/20261007100000_new4_4d_path_validation.sql`, `scripts/verify-new4-4d-3-workshop-media.ts`, `scripts/verify-workshop-gcs-foundation.ts`, `.env.example`, `package.json`, `package-lock.json`, `docs/decisions/NEW4-4_privacy-processors.md`.
