/**
 * NEW4-4D-3 — Workshop private media backend: local checks.
 * Mocks and synthetic refs only. No GCS / Supabase / network calls, no customer data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Storage } from '@google-cloud/storage';
import { OAuth2Client } from 'google-auth-library';
import {
  WORKSHOP_CONTENT_TYPES,
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_GCS_SIGNER_SA,
  WORKSHOP_MEDIA_CACHE_CONTROL,
  WORKSHOP_MEDIA_PATHS,
  WORKSHOP_SIGN_READ_BATCH_MAX,
  WORKSHOP_UPLOAD_CAPS,
  WorkshopStorageError,
  applyWorkshopMediaResponseHeaders,
  assertEffectiveSigner,
  assertSignedUrlShape,
  buildCanonicalWorkshopPath,
  collectGcsEraPaths,
  createGcsWorkshopStore,
  createSignerStorage,
  createWorkshopStorageAdapter,
  handleCommit,
  handleDiscard,
  handleSignRead,
  handleSignUpload,
  isWorkshopMediaOrSignedValue,
  legacySupabaseHosts,
  normalizeWorkshopRef,
  parseWorkshopRef,
  readWorkshopGcsConfig,
  resolveRegionalEndpointHost,
  validateCommitMetadata,
  validateSignUploadRequest,
  workshopRefIdentity,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopListScope,
  type WorkshopListedObject,
  type WorkshopMediaDeps,
  type WorkshopObjectMetadata,
  type WorkshopObjectStore,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import { removeWorkshopObjects, runWorkshopRetentionPurge } from '../src/lib/workshopRetention';
import { removeUnorderedWorkshopAssets } from '../src/lib/accountWithdrawal';
import {
  WORKSHOP_MEDIA_ENDPOINTS,
  WorkshopUploadError,
  uploadWorkshopOriginal,
  type WorkshopMediaApi,
} from '../src/lib/customComposition/durableHandoff';
import { WORKSHOP_MEDIA_GCS_HOST, parseWorkshopMediaRef } from '../src/lib/workshopMediaCore';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results: { group: string; name: string; pass: boolean }[] = [];
let group = '';

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ group, name, pass: condition });
  const suffix = !condition && detail ? ` - ${detail}` : '';
  console.log(`${condition ? 'PASS' : 'FAIL'}: [${group}] ${name}${suffix}`);
}

function section(label: string): void {
  group = label;
  console.log(`\n== ${label} ==`);
}

// Synthetic identities (not customer data).
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OBJ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OBJ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OBJ_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const LEGACY_BASE = `https://${LEGACY_HOST}/storage/v1/object/public/workshop/`;
const opts = { legacyHosts: [LEGACY_HOST] };

const ORIGINAL = `originals/${UID}/${OBJ_A}.png`;
const PREVIEW = `previews/${UID}/${OBJ_B}.jpg`;
const PREVIEW_2 = `previews/${UID}/${OBJ_C}.jpg`;
const OTHER_PREVIEW = `previews/${OTHER}/${OBJ_A}.jpg`;
const OTHER_ORIGINAL = `originals/${OTHER}/${OBJ_B}.jpeg`;
const FAKE_SIGNED = (p: string) =>
  `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Credential=${encodeURIComponent(`${WORKSHOP_GCS_SIGNER_SA}/x`)}&X-Goog-Expires=300&X-Goog-Signature=synthetic`;

// ---------------------------------------------------------------------------
section('A-F canonical / legacy normalization');
assert('A canonical original accepted', normalizeWorkshopRef(ORIGINAL) === ORIGINAL);
assert('A canonical preview accepted', normalizeWorkshopRef(PREVIEW) === PREVIEW);
assert('A canonical source flagged', parseWorkshopRef(PREVIEW)?.source === 'canonical');
assert('A jpeg/webp originals accepted',
  !!normalizeWorkshopRef(`originals/${UID}/${OBJ_A}.jpeg`) && !!normalizeWorkshopRef(`originals/${UID}/${OBJ_A}.webp`));
assert('B legacy public URL -> canonical', normalizeWorkshopRef(`${LEGACY_BASE}${PREVIEW}`, opts) === PREVIEW);
assert('B legacy source flagged', parseWorkshopRef(`${LEGACY_BASE}${PREVIEW}`, opts)?.source === 'legacy_supabase');
assert('B legacy authenticated URL -> canonical',
  normalizeWorkshopRef(`https://${LEGACY_HOST}/storage/v1/object/authenticated/workshop/${ORIGINAL}`, opts) === ORIGINAL);
assert('B legacy signed URL (token only) -> canonical',
  normalizeWorkshopRef(`https://${LEGACY_HOST}/storage/v1/object/sign/workshop/${PREVIEW}?token=abc.def`, opts) === PREVIEW);
assert('B legacy signed URL with extra query rejected',
  normalizeWorkshopRef(`https://${LEGACY_HOST}/storage/v1/object/sign/workshop/${PREVIEW}?token=a&x=1`, opts) === null);
assert('B legacy public URL with query rejected', normalizeWorkshopRef(`${LEGACY_BASE}${PREVIEW}?download=1`, opts) === null);
assert('B legacy URL rejected without trusted host config', normalizeWorkshopRef(`${LEGACY_BASE}${PREVIEW}`) === null);
assert('B legacy identity == canonical identity',
  workshopRefIdentity(`${LEGACY_BASE}${PREVIEW}`, opts) === workshopRefIdentity(PREVIEW, opts));
assert('C external host rejected', normalizeWorkshopRef(`https://evil.example/storage/v1/object/public/workshop/${PREVIEW}`, opts) === null);
assert('C other Supabase project rejected',
  normalizeWorkshopRef(`https://bvihpoorwriejybixmoc.supabase.co/storage/v1/object/public/workshop/${PREVIEW}`, opts) === null);
assert('C http scheme rejected', normalizeWorkshopRef(`http://${LEGACY_HOST}/storage/v1/object/public/workshop/${PREVIEW}`, opts) === null);
assert('C GCS URL not a trusted ref', normalizeWorkshopRef(FAKE_SIGNED(PREVIEW), opts) === null);
assert('C data/blob/javascript rejected',
  [`data:image/png;base64,AAAA`, `blob:https://metalora.art/x`, `javascript:alert(1)`].every((v) => normalizeWorkshopRef(v, opts) === null));
assert('C port / credentials rejected',
  normalizeWorkshopRef(`https://${LEGACY_HOST}:444/storage/v1/object/public/workshop/${PREVIEW}`, opts) === null
    && normalizeWorkshopRef(`https://u:p@${LEGACY_HOST}/storage/v1/object/public/workshop/${PREVIEW}`, opts) === null);
assert('D other UID parses but is not caller-owned', parseWorkshopRef(OTHER_PREVIEW)?.uid === OTHER);
assert('E traversal rejected', normalizeWorkshopRef(`previews/${UID}/../${OBJ_B}.jpg`) === null);
assert('E percent-encoding rejected', normalizeWorkshopRef(`previews/${UID}/${OBJ_B}%2Ejpg`) === null);
assert('E backslash rejected', normalizeWorkshopRef(`previews\\${UID}\\${OBJ_B}.jpg`) === null);
assert('E double slash rejected', normalizeWorkshopRef(`previews//${UID}/${OBJ_B}.jpg`) === null);
assert('E query on canonical rejected', normalizeWorkshopRef(`${PREVIEW}?x=1`) === null);
assert('E fragment rejected', normalizeWorkshopRef(`${PREVIEW}#x`) === null);
assert('F malformed object UUID rejected', normalizeWorkshopRef(`previews/${UID}/not-a-uuid.jpg`) === null);
assert('F malformed uid rejected', normalizeWorkshopRef(`previews/not-a-user/${OBJ_B}.jpg`) === null);
assert('F uppercase UUID rejected (no case aliasing)', normalizeWorkshopRef(`previews/${UID}/${OBJ_B.toUpperCase()}.jpg`) === null);
assert('F wrong prefix rejected', normalizeWorkshopRef(`products/${UID}/${OBJ_B}.jpg`) === null);
assert('F preview must be .jpg', normalizeWorkshopRef(`previews/${UID}/${OBJ_B}.png`) === null);
assert('F unexpected extension rejected', normalizeWorkshopRef(`originals/${UID}/${OBJ_A}.gif`) === null);
assert('F extra segment rejected', normalizeWorkshopRef(`originals/${UID}/x/${OBJ_A}.png`) === null);
assert('legacySupabaseHosts accepts only https *.supabase.co',
  legacySupabaseHosts(`https://${LEGACY_HOST}`)[0] === LEGACY_HOST && legacySupabaseHosts('https://evil.example').length === 0);
assert('buildCanonicalWorkshopPath original png', buildCanonicalWorkshopPath('original', UID, 'image/png', OBJ_A) === ORIGINAL);
assert('buildCanonicalWorkshopPath preview jpg', buildCanonicalWorkshopPath('preview', UID, 'image/jpeg', OBJ_B) === PREVIEW);
assert('buildCanonicalWorkshopPath rejects preview png', buildCanonicalWorkshopPath('preview', UID, 'image/png') === null);

// ---------------------------------------------------------------------------
section('R regional endpoint hard check');
const approvedEnv = {
  WORKSHOP_GCS_BUCKET: WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_ENDPOINT: `https://${WORKSHOP_GCS_REGIONAL_HOST}`,
  WORKSHOP_GCS_SIGNER_SA: WORKSHOP_GCS_SIGNER_SA,
};
assert('absent env -> absent (legacy-only)', readWorkshopGcsConfig({}).state === 'absent');
assert('approved env -> ready', readWorkshopGcsConfig(approvedEnv).state === 'ready');
assert('bare regional host accepted',
  readWorkshopGcsConfig({ ...approvedEnv, WORKSHOP_GCS_ENDPOINT: WORKSHOP_GCS_REGIONAL_HOST }).state === 'ready');
for (const endpoint of [
  'storage.googleapis.com',
  'https://storage.googleapis.com',
  'http://storage.asia-northeast3.rep.googleapis.com',
  'https://storage.us-west1.rep.googleapis.com',
  'https://storage.asia-northeast3.rep.googleapis.com.evil.example',
  'https://storage.asia-northeast3.rep.googleapis.com/extra',
]) {
  const result = readWorkshopGcsConfig({ ...approvedEnv, WORKSHOP_GCS_ENDPOINT: endpoint });
  assert(`endpoint refused: ${endpoint}`, result.state === 'invalid' && result.reason === 'endpoint');
}
assert('partial env fails closed', readWorkshopGcsConfig({ WORKSHOP_GCS_BUCKET: WORKSHOP_GCS_APPROVED_BUCKET }).state === 'invalid');
assert('non-approved bucket fails closed',
  readWorkshopGcsConfig({ ...approvedEnv, WORKSHOP_GCS_BUCKET: 'other-bucket' }).state === 'invalid');
assert('resolveRegionalEndpointHost(global) = null', resolveRegionalEndpointHost('storage.googleapis.com') === null);
let globalThrew = false;
try {
  createSignerStorage({ bucket: WORKSHOP_GCS_APPROVED_BUCKET, endpointHost: 'storage.googleapis.com', signerSa: WORKSHOP_GCS_SIGNER_SA }, new OAuth2Client());
} catch {
  globalThrew = true;
}
assert('createSignerStorage refuses global endpoint', globalThrew);
let shapeGlobal = false;
try {
  assertSignedUrlShape(FAKE_SIGNED(PREVIEW).replace(WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com'), WORKSHOP_GCS_APPROVED_BUCKET, PREVIEW);
} catch (error) {
  shapeGlobal = error instanceof WorkshopStorageError;
}
assert('signed URL on global host refused', shapeGlobal);
let shapeOk = true;
try {
  assertSignedUrlShape(FAKE_SIGNED(PREVIEW), WORKSHOP_GCS_APPROVED_BUCKET, PREVIEW);
} catch {
  shapeOk = false;
}
assert('regional, signer-credentialed, object-bound, 300 s URL accepted', shapeOk);
let shapeTtl = false;
try {
  assertSignedUrlShape(FAKE_SIGNED(PREVIEW).replace('X-Goog-Expires=300', 'X-Goog-Expires=900'), WORKSHOP_GCS_APPROVED_BUCKET, PREVIEW);
} catch {
  shapeTtl = true;
}
assert('signed URL with 900 s expiry refused', shapeTtl);
let shapePath = false;
try {
  assertSignedUrlShape(FAKE_SIGNED(PREVIEW_2), WORKSHOP_GCS_APPROVED_BUCKET, PREVIEW);
} catch {
  shapePath = true;
}
assert('signed URL bound to another object refused', shapePath);

// ---------------------------------------------------------------------------
section('Q effective signer principal hard check');
const readyConfig = { bucket: WORKSHOP_GCS_APPROVED_BUCKET, endpointHost: WORKSHOP_GCS_REGIONAL_HOST, signerSa: WORKSHOP_GCS_SIGNER_SA };
const offlineSource = new OAuth2Client();
offlineSource.setCredentials({ access_token: 'offline-identity-check' });
const signerStorage = createSignerStorage(readyConfig, offlineSource);
let signerOk = true;
try {
  await assertEffectiveSigner(signerStorage);
} catch {
  signerOk = false;
}
assert('Impersonated chain reports workshop-media-signer as effective identity (offline)', signerOk);
assert('storage apiEndpoint is the regional host', signerStorage.apiEndpoint === `https://${WORKSHOP_GCS_REGIONAL_HOST}`);
const regionalAuth = signerStorage as unknown as {
  customEndpoint?: boolean;
  useAuthWithCustomEndpoint?: boolean;
};
assert('regional apiEndpoint is treated as a custom endpoint', regionalAuth.customEndpoint === true);
assert('custom regional endpoint keeps OAuth (useAuthWithCustomEndpoint=true)', regionalAuth.useAuthWithCustomEndpoint === true);
let wrongSignerThrew = false;
try {
  createSignerStorage({ ...readyConfig, signerSa: '807497260135-compute@developer.gserviceaccount.com' }, offlineSource);
} catch {
  wrongSignerThrew = true;
}
assert('runtime SA as signer refused at construction', wrongSignerThrew);
{
  const storageSrc = fs.readFileSync(path.join(root, 'src/lib/workshopStorage.ts'), 'utf8');
  const signerFn = storageSrc.slice(
    storageSrc.indexOf('export function createSignerStorage'),
    storageSrc.indexOf('export async function assertEffectiveSigner'),
  );
  const storeFn = storageSrc.slice(
    storageSrc.indexOf('export function createGcsWorkshopStore'),
    storageSrc.indexOf('export type WorkshopRemoveOutcome'),
  );
  assert('createSignerStorage sets useAuthWithCustomEndpoint true', /useAuthWithCustomEndpoint:\s*true/.test(signerFn));
  assert('createSignerStorage keeps the Seoul regional apiEndpoint', signerFn.includes('WORKSHOP_GCS_REGIONAL_HOST'));
  assert('createSignerStorage impersonates config.signerSa only', /new Impersonated\(/.test(signerFn) && /targetPrincipal:\s*config\.signerSa/.test(signerFn));
  assert('createSignerStorage does not use the runtime SA as Storage identity', !/807497260135-compute@developer\.gserviceaccount\.com/.test(signerFn));
  assert('createSignerStorage does not grant runtime-SA object roles', !/roles\/storage\./.test(signerFn));
  assert('GCS head/remove/list share the impersonated Storage factory',
    /return createSignerStorage\(config, sourceClient\)/.test(storeFn)
    && (storeFn.match(/await bucket\(\)/g)?.length ?? 0) >= 3
    && /async head\(path\)/.test(storeFn)
    && /async remove\(path\)/.test(storeFn)
    && /async listObjects\(/.test(storeFn)
    && !/new Storage\(/.test(storeFn));
}

function fakeStorage(clientEmail: string, signedUrl: (p: string) => string): Storage {
  const file = (p: string) => ({ getSignedUrl: async () => [signedUrl(p)] });
  return {
    authClient: { getCredentials: async () => ({ client_email: clientEmail }) },
    bucket: () => ({ file }),
  } as unknown as Storage;
}
const fallbackStore = createGcsWorkshopStore(readyConfig, {
  storageFactory: async () => fakeStorage('807497260135-compute@developer.gserviceaccount.com', FAKE_SIGNED),
});
let fallbackRefused = false;
try {
  await fallbackStore.signRead(PREVIEW);
} catch (error) {
  fallbackRefused = error instanceof WorkshopStorageError;
}
assert('runtime/default identity never signs (fallback refused)', fallbackRefused);
const globalStore = createGcsWorkshopStore(readyConfig, {
  storageFactory: async () => fakeStorage(WORKSHOP_GCS_SIGNER_SA, (p) => FAKE_SIGNED(p).replace(WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com')),
});
let globalRefused = false;
try {
  await globalStore.signUpload(PREVIEW, 'image/jpeg', WORKSHOP_UPLOAD_CAPS.preview);
} catch (error) {
  globalRefused = error instanceof WorkshopStorageError;
}
assert('store refuses a signed URL that is not on the regional host', globalRefused);
const goodStore = createGcsWorkshopStore(readyConfig, { storageFactory: async () => fakeStorage(WORKSHOP_GCS_SIGNER_SA, FAKE_SIGNED) });
const goodUpload = await goodStore.signUpload(PREVIEW, 'image/jpeg', WORKSHOP_UPLOAD_CAPS.preview);
assert('signed upload headers: create-only', goodUpload.headers['x-goog-if-generation-match'] === '0');
assert('signed upload headers: size range bound to cap', goodUpload.headers['x-goog-content-length-range'] === `1,${WORKSHOP_UPLOAD_CAPS.preview}`);
assert('signed upload headers: private, no-store', goodUpload.headers['Cache-Control'] === WORKSHOP_MEDIA_CACHE_CONTROL);
assert('signed upload headers: Content-Type', goodUpload.headers['Content-Type'] === 'image/jpeg');
let typeRefused = false;
try {
  await goodStore.signUpload(PREVIEW, 'image/png', WORKSHOP_UPLOAD_CAPS.preview);
} catch {
  typeRefused = true;
}
assert('store refuses content type outside kind allowlist', typeRefused);

// ---------------------------------------------------------------------------
// Mock stores / references
type RemoveBehavior = 'removed' | 'absent' | 'fail_retryable' | 'fail_permanent';

function mockStore(
  name: 'gcs' | 'supabase_legacy',
  objects: WorkshopListedObject[],
  behavior: (p: string) => RemoveBehavior = () => 'removed',
): WorkshopObjectStore & { removed: string[]; scopes: WorkshopListScope[] } {
  const removed: string[] = [];
  const scopes: WorkshopListScope[] = [];
  return {
    name,
    removed,
    scopes,
    async listObjects(scope) {
      scopes.push(scope);
      return objects.filter((o) => scope.kind === 'all' || o.path.split('/')[1] === scope.uid);
    },
    async remove(p) {
      const b = behavior(p);
      if (b === 'fail_retryable') throw new WorkshopStorageError(name, 'remove', true);
      if (b === 'fail_permanent') throw new WorkshopStorageError(name, 'remove', false);
      removed.push(p);
      return b === 'absent' ? 'absent' : 'removed';
    },
  };
}

function mockGcs(options: {
  objects?: WorkshopListedObject[];
  meta?: Record<string, WorkshopObjectMetadata>;
  behavior?: (p: string) => RemoveBehavior;
} = {}): WorkshopGcsObjectStore & { removed: string[]; signedReads: string[]; signedUploads: { path: string; contentType: string; maxBytes: number }[] } {
  const base = mockStore('gcs', options.objects ?? [], options.behavior);
  const signedReads: string[] = [];
  const signedUploads: { path: string; contentType: string; maxBytes: number }[] = [];
  return {
    ...base,
    name: 'gcs',
    signedReads,
    signedUploads,
    async head(p) {
      return options.meta?.[p] ?? null;
    },
    async signUpload(p, contentType, maxBytes) {
      signedUploads.push({ path: p, contentType, maxBytes });
      return {
        url: FAKE_SIGNED(p),
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Cache-Control': WORKSHOP_MEDIA_CACHE_CONTROL,
          'x-goog-content-length-range': `1,${maxBytes}`,
          'x-goog-if-generation-match': '0',
        },
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      };
    },
    async signRead(p) {
      signedReads.push(p);
      return { url: FAKE_SIGNED(p), expiresAt: new Date(Date.now() + 300_000).toISOString() };
    },
  };
}

function refs(rowsByUid: Record<string, Partial<WorkshopCustomerRows>>, adminOrders: { user_id: string; ordered_items: unknown }[] = []) {
  const calls = { admin: [] as string[][] };
  const source: WorkshopReferenceSource = {
    async customerRows(uid) {
      const r = rowsByUid[uid] ?? {};
      return { cart: r.cart ?? [], progress: r.progress ?? [], orders: r.orders ?? [], intents: r.intents ?? [] };
    },
    async adminOrderRows(uids) {
      calls.admin.push(uids);
      return adminOrders.filter((o) => uids.includes(o.user_id));
    },
  };
  return { source, calls };
}

const customer = { userId: UID, isAdmin: false };
const admin = { userId: OTHER, isAdmin: true };

// ---------------------------------------------------------------------------
section('G-H sign-upload caps + type allowlist');
assert('G original 25 MiB cap', WORKSHOP_UPLOAD_CAPS.original === 25 * 1024 * 1024);
assert('G preview 5 MiB cap', WORKSHOP_UPLOAD_CAPS.preview === 5 * 1024 * 1024);
assert('G original at cap accepted',
  validateSignUploadRequest({ kind: 'original', contentType: 'image/png', sizeBytes: WORKSHOP_UPLOAD_CAPS.original }).ok === true);
const overOriginal = validateSignUploadRequest({ kind: 'original', contentType: 'image/png', sizeBytes: WORKSHOP_UPLOAD_CAPS.original + 1 });
assert('G original over cap rejected', overOriginal.ok === false && overOriginal.reason === 'too_large');
assert('G preview at cap accepted',
  validateSignUploadRequest({ kind: 'preview', contentType: 'image/jpeg', sizeBytes: WORKSHOP_UPLOAD_CAPS.preview }).ok === true);
const overPreview = validateSignUploadRequest({ kind: 'preview', contentType: 'image/jpeg', sizeBytes: WORKSHOP_UPLOAD_CAPS.preview + 1 });
assert('G preview over cap rejected', overPreview.ok === false && overPreview.reason === 'too_large');
assert('G zero / fractional / string size rejected',
  [0, 1.5, '100', -1].every((s) => validateSignUploadRequest({ kind: 'preview', contentType: 'image/jpeg', sizeBytes: s }).ok === false));
assert('H original allowlist = jpeg/png/webp', WORKSHOP_CONTENT_TYPES.original.join(',') === 'image/jpeg,image/png,image/webp');
assert('H preview allowlist = jpeg', WORKSHOP_CONTENT_TYPES.preview.join(',') === 'image/jpeg');
assert('H original gif rejected', validateSignUploadRequest({ kind: 'original', contentType: 'image/gif', sizeBytes: 10 }).ok === false);
assert('H original svg rejected', validateSignUploadRequest({ kind: 'original', contentType: 'image/svg+xml', sizeBytes: 10 }).ok === false);
assert('H preview png rejected', validateSignUploadRequest({ kind: 'preview', contentType: 'image/png', sizeBytes: 10 }).ok === false);
assert('client-supplied path rejected',
  validateSignUploadRequest({ kind: 'preview', contentType: 'image/jpeg', sizeBytes: 10, path: OTHER_PREVIEW }).ok === false);
assert('client-supplied uid rejected',
  validateSignUploadRequest({ kind: 'preview', contentType: 'image/jpeg', sizeBytes: 10, uid: OTHER }).ok === false);
{
  const gcs = mockGcs();
  const deps: WorkshopMediaDeps = { gcs, references: refs({}).source, legacyHosts: [LEGACY_HOST] };
  const res = await handleSignUpload(deps, customer, { kind: 'original', contentType: 'image/webp', sizeBytes: 1000 });
  const p = String(res.body.path);
  assert('sign-upload 200', res.status === 200);
  assert('server-generated canonical path under caller uid', parseWorkshopRef(p)?.uid === UID && parseWorkshopRef(p)?.ext === 'webp');
  assert('signed with kind cap (not client size)', gcs.signedUploads[0]?.maxBytes === WORKSHOP_UPLOAD_CAPS.original);
  const upload = res.body.upload as { headers: Record<string, string>; method: string };
  assert('response carries required headers', upload.headers['x-goog-if-generation-match'] === '0' && upload.method === 'PUT');
  assert('response has expiry metadata', typeof res.body.expiresAt === 'string');
  assert('response exposes no signer credentials', !/private_key|client_email|access_token/i.test(JSON.stringify(res.body)));
  const res2 = await handleSignUpload(deps, customer, { kind: 'preview', contentType: 'image/jpeg', sizeBytes: 1000 });
  assert('two uploads get distinct UUID paths', res2.body.path !== res.body.path);
  const big = await handleSignUpload(deps, customer, { kind: 'preview', contentType: 'image/jpeg', sizeBytes: WORKSHOP_UPLOAD_CAPS.preview + 1 });
  assert('over-cap sign-upload -> 413', big.status === 413);
  const off = await handleSignUpload({ ...deps, gcs: null }, customer, { kind: 'preview', contentType: 'image/jpeg', sizeBytes: 10 });
  assert('GCS not configured -> 503 fail closed', off.status === 503 && off.body.error === 'workshop_gcs_not_configured');
}

// ---------------------------------------------------------------------------
section('I sign-read customer authorization');
{
  const gcs = mockGcs();
  const legacyPreviewUrl = `${LEGACY_BASE}${PREVIEW_2}`;
  const r = refs({
    [UID]: {
      cart: [{ custom_image: PREVIEW, custom_config: { preview_image_url: PREVIEW, original_image_url: ORIGINAL } }],
      orders: [{ ordered_items: [{ image: legacyPreviewUrl, custom_config: { original_image_url: `originals/${UID}/${OBJ_C}.png` } }] }],
    },
  });
  const deps: WorkshopMediaDeps = { gcs, references: r.source, legacyHosts: [LEGACY_HOST] };
  const res = await handleSignRead(deps, customer, {
    refs: [
      PREVIEW,
      ORIGINAL,
      legacyPreviewUrl,
      `originals/${UID}/${OBJ_C}.png`,
      OTHER_PREVIEW,
      `previews/${UID}/${OBJ_A}.jpg`,
      'https://evil.example/x.jpg',
    ],
  });
  const items = res.body.items as { ref: string; ok: boolean; store?: string; src?: string; reason?: string }[];
  assert('cart preview signed via GCS', items[0]?.ok === true && items[0]?.store === 'gcs' && !!items[0]?.src);
  assert('cart original (active resume/edit) signed', items[1]?.ok === true && items[1]?.store === 'gcs');
  assert('legacy-stored order preview -> supabase_legacy, no signed src', items[2]?.ok === true && items[2]?.store === 'supabase_legacy' && !items[2]?.src);
  assert('customer cannot fetch order original by path', items[3]?.ok === false && items[3]?.reason === 'not_authorized');
  assert('other user preview refused', items[4]?.ok === false && items[4]?.reason === 'not_authorized');
  assert('own-UID but unreferenced path refused', items[5]?.ok === false && items[5]?.reason === 'not_authorized');
  assert('external URL -> invalid_ref', items[6]?.ok === false && items[6]?.reason === 'invalid_ref');
  assert('only authorized GCS refs were signed', gcs.signedReads.join('|') === [PREVIEW, ORIGINAL].join('|'));
  assert('non-admin never queries admin order index', r.calls.admin.length === 0);

  const progress = refs({ [UID]: { progress: [{ uploaded_image_url: ORIGINAL }] } });
  const pr = await handleSignRead({ ...deps, references: progress.source }, customer, { refs: [ORIGINAL] });
  assert('user_progress original signed', (pr.body.items as { ok: boolean }[])[0]?.ok === true);

  const misplaced = refs({ [UID]: { cart: [{ custom_image: ORIGINAL, custom_config: {} }] } });
  const mr = await handleSignRead({ ...deps, references: misplaced.source }, customer, { refs: [ORIGINAL] });
  assert('original referenced only in a preview field is refused', (mr.body.items as { ok: boolean }[])[0]?.ok === false);

  const intents = refs({ [UID]: { intents: [{ validated_snapshot: { ordered_items: [{ user_image_url: PREVIEW }] } }] } });
  const ir = await handleSignRead({ ...deps, references: intents.source }, customer, { refs: [PREVIEW] });
  assert('payment_intent snapshot preview signed', (ir.body.items as { ok: boolean }[])[0]?.ok === true);

  const tooMany = await handleSignRead(deps, customer, { refs: Array(WORKSHOP_SIGN_READ_BATCH_MAX + 1).fill(PREVIEW) });
  assert(`batch cap ${WORKSHOP_SIGN_READ_BATCH_MAX} enforced`, tooMany.status === 400 && WORKSHOP_SIGN_READ_BATCH_MAX === 20);
  const notArray = await handleSignRead(deps, customer, { refs: PREVIEW });
  assert('non-array refs rejected', notArray.status === 400);
  const nonString = await handleSignRead(deps, customer, { refs: [{}] });
  assert('non-string ref rejected', nonString.status === 400);
}

// ---------------------------------------------------------------------------
section('J sign-read admin authorization');
{
  const gcs = mockGcs();
  const r = refs({}, [
    { user_id: UID, ordered_items: [{ custom_config: { original_image_url: ORIGINAL, preview_image_url: PREVIEW } }] },
  ]);
  const deps: WorkshopMediaDeps = { gcs, references: r.source, legacyHosts: [LEGACY_HOST] };
  const res = await handleSignRead(deps, admin, { refs: [ORIGINAL, PREVIEW, `previews/${UID}/${OBJ_C}.jpg`] });
  const items = res.body.items as { ok: boolean; store?: string }[];
  assert('admin signs order original', items[0]?.ok === true && items[0]?.store === 'gcs');
  assert('admin signs order preview', items[1]?.ok === true);
  assert('admin refused for ref not in an unpurged order', items[2]?.ok === false);
  assert('admin order lookup scoped to ref UIDs', JSON.stringify(r.calls.admin[0]) === JSON.stringify([UID]));
  const nonAdmin = await handleSignRead(deps, { userId: OTHER, isAdmin: false }, { refs: [ORIGINAL] });
  assert('non-admin cannot use order index', (nonAdmin.body.items as { ok: boolean }[])[0]?.ok === false);
}

// ---------------------------------------------------------------------------
section('K signed response no-store');
{
  const headers: Record<string, string> = {};
  applyWorkshopMediaResponseHeaders({ setHeader: (n, v) => { headers[n] = v; } });
  assert('Cache-Control no-store, private', /no-store/.test(headers['Cache-Control']) && /private/.test(headers['Cache-Control']));
  assert('Pragma no-cache', headers.Pragma === 'no-cache');
  assert('Referrer-Policy no-referrer', headers['Referrer-Policy'] === 'no-referrer');
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const routeBlock = server.slice(server.indexOf('const workshopMediaRoute'), server.indexOf('workshopMediaRoute(WORKSHOP_MEDIA_PATHS.discard'));
  assert('headers applied before auth/handler in every media route',
    routeBlock.indexOf('applyWorkshopMediaResponseHeaders(res)') > -1
      && routeBlock.indexOf('applyWorkshopMediaResponseHeaders(res)') < routeBlock.indexOf('resolveWorkshopMediaCaller('));
  for (const p of Object.values(WORKSHOP_MEDIA_PATHS)) {
    assert(`route registered: ${p}`, server.includes(`WORKSHOP_MEDIA_PATHS.${Object.keys(WORKSHOP_MEDIA_PATHS).find((k) => WORKSHOP_MEDIA_PATHS[k as keyof typeof WORKSHOP_MEDIA_PATHS] === p)}`));
  }
  const storageSrc = fs.readFileSync(path.join(root, 'src/lib/workshopStorage.ts'), 'utf8');
  const logLines = storageSrc.split('\n').filter((l) => /console\.(log|error|warn)/.test(l));
  const logBlocks = [...storageSrc.matchAll(/console\.(?:log|error|warn)\([\s\S]*?\);/g)].map((m) => m[0]);
  assert('adapter logs never include url/src/path/token/authorization',
    logLines.length > 0 && logBlocks.every((b) => !/\b(url|src|path|token|authorization|signed)\b\s*[:,)]/i.test(b)));
  assert('media route logs only op + reason_class',
    [...routeBlock.matchAll(/console\.(?:log|error|warn)\([\s\S]*?\);/g)].every((m) => !/req\.|url|token|authorization/i.test(m[0])));
}

// ---------------------------------------------------------------------------
section('L commit metadata checks');
{
  const fresh = Date.now() - 1000;
  const good: WorkshopObjectMetadata = { path: PREVIEW, sizeBytes: 1000, contentType: 'image/jpeg', cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL, createdAtMs: fresh };
  const parsedPreview = parseWorkshopRef(PREVIEW)!;
  const parsedOriginal = parseWorkshopRef(ORIGINAL)!;
  assert('valid preview metadata', validateCommitMetadata(parsedPreview, good).ok === true);
  const reason = (r: ReturnType<typeof validateCommitMetadata>) => (r.ok === false ? r.reason : 'ok');
  assert('content type outside allowlist', reason(validateCommitMetadata(parsedPreview, { ...good, contentType: 'image/png' })) === 'content_type_not_allowed');
  assert('extension/content-type mismatch', reason(validateCommitMetadata(parsedOriginal, { ...good, path: ORIGINAL, contentType: 'image/jpeg' })) === 'content_type_extension_mismatch');
  assert('over cap', reason(validateCommitMetadata(parsedPreview, { ...good, sizeBytes: WORKSHOP_UPLOAD_CAPS.preview + 1 })) === 'too_large');
  assert('zero size', reason(validateCommitMetadata(parsedPreview, { ...good, sizeBytes: 0 })) === 'invalid_size');
  assert('cache-control must be private, no-store', reason(validateCommitMetadata(parsedPreview, { ...good, cacheControl: 'public, max-age=3600' })) === 'cache_control_mismatch');
  assert('missing content type', reason(validateCommitMetadata(parsedPreview, { ...good, contentType: null })) === 'content_type_not_allowed');

  const gcs = mockGcs({ meta: { [PREVIEW]: good, [PREVIEW_2]: { ...good, path: PREVIEW_2, cacheControl: null } } });
  const deps: WorkshopMediaDeps = { gcs, references: refs({}).source, legacyHosts: [LEGACY_HOST] };
  const ok = await handleCommit(deps, customer, { path: PREVIEW, kind: 'preview' });
  assert('commit 200 returns path + minimal metadata only',
    ok.status === 200 && Object.keys(ok.body).sort().join(',') === 'contentType,kind,path,sizeBytes');
  assert('commit response has no URL', !/https?:/i.test(JSON.stringify(ok.body)));
  assert('commit: other uid -> 403', (await handleCommit(deps, customer, { path: OTHER_PREVIEW, kind: 'preview' })).status === 403);
  assert('commit: kind mismatch -> 400', (await handleCommit(deps, customer, { path: PREVIEW, kind: 'original' })).status === 400);
  assert('commit: legacy URL not accepted -> 400', (await handleCommit(deps, customer, { path: `${LEGACY_BASE}${PREVIEW}`, kind: 'preview' })).status === 400);
  assert('commit: object missing -> 404', (await handleCommit(deps, customer, { path: `previews/${UID}/${OBJ_A}.jpg`, kind: 'preview' })).status === 404);
  assert('commit: bad metadata -> 422', (await handleCommit(deps, customer, { path: PREVIEW_2, kind: 'preview' })).status === 422);
  assert('commit: GCS off -> 503', (await handleCommit({ ...deps, gcs: null }, customer, { path: PREVIEW, kind: 'preview' })).status === 503);
}

// ---------------------------------------------------------------------------
section('M discard protection');
{
  const now = Date.now();
  const meta = (p: string, ageMs: number): WorkshopObjectMetadata => ({ path: p, sizeBytes: 10, contentType: 'image/jpeg', cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL, createdAtMs: now - ageMs });
  const old = `previews/${UID}/${OBJ_A}.jpg`;
  const gcs = mockGcs({ meta: { [PREVIEW]: meta(PREVIEW, 1000), [PREVIEW_2]: meta(PREVIEW_2, 1000), [old]: meta(old, 2 * 24 * 3600 * 1000) } });
  const r = refs({ [UID]: { cart: [{ custom_image: `${LEGACY_BASE}${PREVIEW_2}`, custom_config: {} }] } });
  const deps: WorkshopMediaDeps = { gcs, references: r.source, legacyHosts: [LEGACY_HOST], now: () => now };
  const fresh = await handleDiscard(deps, customer, { path: PREVIEW });
  assert('fresh unreferenced upload discarded', fresh.status === 200 && fresh.body.discarded === true && gcs.removed.includes(PREVIEW));
  const protectedRes = await handleDiscard(deps, customer, { path: PREVIEW_2 });
  assert('path referenced by cart (even as legacy URL) -> 409', protectedRes.status === 409 && !gcs.removed.includes(PREVIEW_2));
  const orderProtected = refs({ [UID]: { orders: [{ ordered_items: [{ custom_config: { original_image_url: ORIGINAL } }] }] } });
  const op = await handleDiscard({ ...deps, references: orderProtected.source }, customer, { path: ORIGINAL });
  assert('active order original -> 409', op.status === 409);
  const intentProtected = refs({ [UID]: { intents: [{ validated_snapshot: { ordered_items: [{ image: PREVIEW }] } }] } });
  const ip = await handleDiscard({ ...deps, references: intentProtected.source }, customer, { path: PREVIEW });
  assert('payment intent reference -> 409', ip.status === 409);
  const progressProtected = refs({ [UID]: { progress: [{ uploaded_image_url: ORIGINAL }] } });
  const pp = await handleDiscard({ ...deps, references: progressProtected.source }, customer, { path: ORIGINAL });
  assert('user_progress reference -> 409', pp.status === 409);
  const aged = await handleDiscard(deps, customer, { path: old });
  assert('older than 24 h -> 409 (retention domain)', aged.status === 409 && !gcs.removed.includes(old));
  const absent = await handleDiscard(deps, customer, { path: `previews/${UID}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg` });
  assert('already absent -> idempotent 200', absent.status === 200 && absent.body.already_absent === true);
  assert('other uid -> 403', (await handleDiscard(deps, customer, { path: OTHER_PREVIEW })).status === 403);
  assert('legacy URL / arbitrary path -> 400',
    (await handleDiscard(deps, customer, { path: `${LEGACY_BASE}${PREVIEW}` })).status === 400
      && (await handleDiscard(deps, customer, { path: 'products/x.jpg' })).status === 400);
  assert('admin flag grants no delete of others', (await handleDiscard(deps, admin, { path: PREVIEW })).status === 403);
}

// ---------------------------------------------------------------------------
section('N NEW4-6 GCS + Supabase dual delete');
{
  const legacyOriginalUrl = `${LEGACY_BASE}${ORIGINAL}`;
  const gcsA = mockStore('gcs', []);
  const legA = mockStore('supabase_legacy', [], (p) => (p === PREVIEW ? 'absent' : 'removed'));
  const adapterA = createWorkshopStorageAdapter({ gcs: gcsA as unknown as WorkshopGcsObjectStore, legacy: legA });
  const rA = await removeWorkshopObjects(adapterA, [ORIGINAL, PREVIEW, ORIGINAL]);
  assert('removes each unique path from both stores', gcsA.removed.length === 2 && legA.removed.length === 2 && rA.ok && rA.removed === 2);
  assert('not-found counts as removed', rA.failed === 0);

  const gcsB = mockStore('gcs', [], (p) => (p === PREVIEW ? 'fail_retryable' : 'removed'));
  const legB = mockStore('supabase_legacy', []);
  const rB = await removeWorkshopObjects(createWorkshopStorageAdapter({ gcs: gcsB as unknown as WorkshopGcsObjectStore, legacy: legB }), [ORIGINAL, PREVIEW]);
  assert('provider failure fails the path (retry later)', rB.ok === false && rB.failed === 1 && rB.removed === 1);

  // Full purge pass against a synthetic in-memory DB.
  const nowDate = new Date('2026-10-07T00:00:00.000Z');
  function fakeAdmin(tables: Record<string, unknown[]>, writes: string[]): SupabaseClient {
    return {
      from(table: string) {
        const state = { op: 'select', returning: false, patch: null as unknown };
        const respond = () => {
          if (state.op === 'select') return { data: tables[table] ?? [], error: null };
          if (state.returning) return { data: [{ id: 'synthetic' }], error: null };
          return { data: null, error: null };
        };
        const builder: Record<string, unknown> = new Proxy({}, {
          get(_t, prop: string) {
            if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(respond()).then(res, rej);
            if (prop === 'maybeSingle') return () => Promise.resolve({ data: null, error: null });
            return (arg?: unknown) => {
              if (prop === 'update' || prop === 'delete' || prop === 'insert') {
                state.op = prop;
                writes.push(`${table}.${prop}:${JSON.stringify(arg ?? null)}`);
              } else if (prop === 'select' && state.op !== 'select') {
                state.returning = true;
              }
              return builder;
            };
          },
        });
        return builder;
      },
    } as unknown as SupabaseClient;
  }
  const order = {
    id: 'order-synthetic',
    order_number: 'ORD-SYNTHETIC',
    status: 'COMPLETED',
    completed_at: '2026-10-03T00:00:00.000Z',
    image_purged_at: null,
    ordered_items: [{ product_id: 'workshop-single', is_custom: true, user_image_url: PREVIEW, custom_config: { original_image_url: legacyOriginalUrl, preview_image_url: PREVIEW } }],
  };
  const writes1: string[] = [];
  const gcs1 = mockStore('gcs', []);
  const leg1 = mockStore('supabase_legacy', []);
  const s1 = await runWorkshopRetentionPurge(
    fakeAdmin({ orders: [order] }, writes1),
    nowDate,
    createWorkshopStorageAdapter({ gcs: gcs1 as unknown as WorkshopGcsObjectStore, legacy: leg1 }),
  );
  assert('completed order purged across GCS + legacy', s1.completed_orders_purged === 1 && gcs1.removed.length === 2 && leg1.removed.length === 2);
  assert('image_purged_at stamped after deletion', writes1.some((w) => w.startsWith('orders.update') && w.includes('image_purged_at')));

  const writes2: string[] = [];
  const gcs2 = mockStore('gcs', [], () => 'fail_retryable');
  const leg2 = mockStore('supabase_legacy', []);
  const s2 = await runWorkshopRetentionPurge(
    fakeAdmin({ orders: [order] }, writes2),
    nowDate,
    createWorkshopStorageAdapter({ gcs: gcs2 as unknown as WorkshopGcsObjectStore, legacy: leg2 }),
  );
  assert('GCS failure keeps image_purged_at null', s2.completed_orders_failed === 1 && !writes2.some((w) => w.includes('image_purged_at')));
  assert('GCS failure leaves references intact', !writes2.some((w) => w.startsWith('orders.update')));

  const writes3: string[] = [];
  const leg3 = mockStore('supabase_legacy', []);
  const s3 = await runWorkshopRetentionPurge(fakeAdmin({ orders: [order] }, writes3), nowDate, createWorkshopStorageAdapter({ gcs: null, legacy: leg3 }));
  assert('GCS-era refs without GCS config: deferred, nothing stamped',
    s3.completed_orders_failed === 1 && leg3.removed.length === 0 && !writes3.some((w) => w.includes('image_purged_at')));
  assert('collectGcsEraPaths finds only bare canonical paths', collectGcsEraPaths(order.ordered_items).join('|') === PREVIEW);

  const legacyOnly = { ...order, ordered_items: [{ product_id: 'workshop-single', is_custom: true, custom_config: { original_image_url: legacyOriginalUrl } }] };
  const leg4 = mockStore('supabase_legacy', []);
  const s4 = await runWorkshopRetentionPurge(fakeAdmin({ orders: [legacyOnly] }, []), nowDate, createWorkshopStorageAdapter({ gcs: null, legacy: leg4 }));
  assert('legacy-only order still purges with GCS unconfigured (current production)', s4.completed_orders_purged === 1 && leg4.removed.includes(ORIGINAL));

  const notYet = { ...order, completed_at: '2026-10-05T00:00:00.000Z' };
  const gcs5 = mockStore('gcs', []);
  const s5 = await runWorkshopRetentionPurge(fakeAdmin({ orders: [notYet] }, []), nowDate, createWorkshopStorageAdapter({ gcs: gcs5 as unknown as WorkshopGcsObjectStore, legacy: mockStore('supabase_legacy', []) }));
  assert('3-day eligibility preserved', s5.completed_orders_scanned === 0 && gcs5.removed.length === 0);

  const staleMs = nowDate.getTime() - 4 * 24 * 3600 * 1000;
  const abandonedPath = `originals/${UID}/${OBJ_C}.jpg`;
  const gcs6 = mockStore('gcs', [
    { path: abandonedPath, createdAtMs: staleMs, store: 'gcs' },
    { path: PREVIEW, createdAtMs: staleMs, store: 'gcs' },
    { path: `previews/${UID}/${OBJ_A}.jpg`, createdAtMs: nowDate.getTime() - 3600_000, store: 'gcs' },
  ]);
  const leg6 = mockStore('supabase_legacy', []);
  const s6 = await runWorkshopRetentionPurge(
    fakeAdmin({ orders: [{ ...order, status: 'PAID', completed_at: null }] }, []),
    nowDate,
    createWorkshopStorageAdapter({ gcs: gcs6 as unknown as WorkshopGcsObjectStore, legacy: leg6 }),
  );
  assert('abandoned GCS object purged from both stores', gcs6.removed.includes(abandonedPath) && leg6.removed.includes(abandonedPath));
  assert('abandoned pass protects active-order GCS path', !gcs6.removed.includes(PREVIEW));
  assert('abandoned pass keeps objects younger than 3 days', !gcs6.removed.includes(`previews/${UID}/${OBJ_A}.jpg`));
  assert('abandoned summary counts', s6.abandoned_objects_deleted === 1 && s6.abandoned_failed === 0);
}

// ---------------------------------------------------------------------------
section('O NEW4-7 GCS + Supabase dual delete');
{
  const legacyName = `previews/${UID}/1696000000000-abc.jpg`;
  function withdrawalAdmin(orderItems: unknown[]): SupabaseClient {
    return {
      from(table: string) {
        const data = table === 'orders' ? orderItems.map((ordered_items) => ({ ordered_items })) : [];
        const builder: Record<string, unknown> = new Proxy({}, {
          get(_t, prop: string) {
            if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
            return () => builder;
          },
        });
        return builder;
      },
    } as unknown as SupabaseClient;
  }
  const gcs = mockStore('gcs', [
    { path: ORIGINAL, createdAtMs: 1, store: 'gcs' },
    { path: PREVIEW, createdAtMs: 1, store: 'gcs' },
    { path: OTHER_PREVIEW, createdAtMs: 1, store: 'gcs' },
  ]);
  const legacy = mockStore('supabase_legacy', [{ path: legacyName, createdAtMs: 1, store: 'supabase_legacy' }]);
  const adapter = createWorkshopStorageAdapter({ gcs: gcs as unknown as WorkshopGcsObjectStore, legacy });
  const result = await removeUnorderedWorkshopAssets(
    withdrawalAdmin([[{ custom_config: { original_image_url: `${LEGACY_BASE}${ORIGINAL}` } }]]),
    adapter,
    UID,
  );
  assert('lists GCS + legacy with user scope only', gcs.scopes.every((s) => s.kind === 'user' && s.uid === UID) && legacy.scopes.every((s) => s.kind === 'user'));
  assert('active order asset protected in both stores', !gcs.removed.includes(ORIGINAL) && !legacy.removed.includes(ORIGINAL));
  assert('unordered GCS preview deleted from both stores', gcs.removed.includes(PREVIEW) && legacy.removed.includes(PREVIEW));
  assert('legacy non-UUID filename still deleted (legacy semantics)', gcs.removed.includes(legacyName) && legacy.removed.includes(legacyName));
  assert('other user objects untouched', !gcs.removed.includes(OTHER_PREVIEW));
  assert('removed count', result.ok === true && result.removed === 2);

  const failing = mockStore('gcs', [{ path: PREVIEW, createdAtMs: 1, store: 'gcs' }], () => 'fail_permanent');
  const failResult = await removeUnorderedWorkshopAssets(
    withdrawalAdmin([]),
    createWorkshopStorageAdapter({ gcs: failing as unknown as WorkshopGcsObjectStore, legacy: mockStore('supabase_legacy', []) }),
    UID,
  );
  assert('provider failure fails closed (withdrawal stays resumable)', failResult.ok === false);
}

// ---------------------------------------------------------------------------
section('P SEO / public leak rejection');
{
  for (const v of [
    PREVIEW,
    ORIGINAL,
    `${LEGACY_BASE}${PREVIEW}`,
    `workshop/${PREVIEW}`,
    FAKE_SIGNED(PREVIEW),
    `https://storage.googleapis.com/${WORKSHOP_GCS_APPROVED_BUCKET}/${PREVIEW}`,
    `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${PREVIEW}`,
  ]) {
    assert(`workshop/signed value flagged: ${v.slice(0, 48)}...`, isWorkshopMediaOrSignedValue(v));
  }
  assert('catalog product path not flagged', !isWorkshopMediaOrSignedValue('products/front.webp'));
  assert('catalog product URL not flagged',
    !isWorkshopMediaOrSignedValue(`https://${LEGACY_HOST}/storage/v1/object/public/products/front.webp`));
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const resolver = server.slice(server.indexOf('function resolvePublicImageUrl'), server.indexOf('type SeoPageKind'));
  assert('resolvePublicImageUrl returns null for Workshop media before any URL passthrough',
    resolver.indexOf('isWorkshopMediaOrSignedValue(trimmed)') > -1
      && resolver.indexOf('isWorkshopMediaOrSignedValue(trimmed)') < resolver.indexOf('startsWith("http://")'));
  assert('resolvePublicImageUrl no longer maps workshop/ to the public bucket', !/includes\("workshop\/"\)/.test(resolver));
  assert('OG/JSON-LD and RSS images go through resolvePublicImageUrl',
    /resolvePublicImageUrl\(product\.front_image\)/.test(server) && /resolvePublicImageUrl\(\s*product\.front_image \|\| product\.image/.test(server));
}

// ---------------------------------------------------------------------------
section('checkout normalization + migration + application state');
{
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert('claimMatchingCustomCartRow compares canonical identity', /const image = workshopRefIdentity\(/.test(server));
  assert('customRowImageUrls normalizes', /workshopRefIdentity\(customImageRef\(row\.custom_image\)/.test(server));
  assert('v1 original/preview distinctness uses canonical identity',
    /workshopRefIdentity\(original, workshopRefOptions\) === workshopRefIdentity\(preview, workshopRefOptions\)/.test(server));
  assert('snapshots never persist GCS/signed URLs', /function customImageRef/.test(server) && /x-goog-\(signature\|credential\)/.test(server));
  assert('legacy hosts come from the configured Supabase URL', /legacySupabaseHosts\(supabaseUrl\)/.test(server));

  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261007100000_new4_4d_path_validation.sql'), 'utf8');
  assert('migration marked not applied', /NOT applied by NEW4-4D-3/.test(migration));
  assert('helper workshop_ref_is_own_canonical', /FUNCTION public\.workshop_ref_is_own_canonical\(\s*p_ref text,\s*p_expected_kind text/.test(migration));
  assert('canonical uses auth.uid()', /auth\.uid\(\)\)::text/.test(migration));
  assert('rejects %, backslash, traversal, double slash, query, scheme',
    ["'%'", "'\\'", "'..'", "'//'", "'?'", "':'"].every((token) => migration.includes(`position(${token} IN p_ref)`)));
  assert('add_custom_cart_item validates both refs',
    /workshop_ref_is_accepted\(v_original, 'original'\)/.test(migration) && /workshop_ref_is_accepted\(v_preview, 'preview'\)/.test(migration));
  assert('cart_items + user_progress guards', /trg_cart_items_workshop_ref_guard/.test(migration) && /trg_user_progress_workshop_ref_guard/.test(migration));
  assert('UPDATE validates only changed values', /NOT p_is_insert AND p_new IS NOT DISTINCT FROM p_old/.test(migration));
  assert('legacy acceptance is exact production public-bucket prefix',
    migration.includes("'https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public/workshop/'"));
  assert('migration does not touch storage objects/buckets or existing rows',
    !/DELETE\s+FROM|UPDATE\s+public\.|storage\.(objects|buckets)\s/i.test(migration.replace(/^--.*$/gm, '')));
  assert('2B-5A migration unchanged (still has original add_custom_cart_item)',
    fs.readFileSync(path.join(root, 'supabase/migrations/20260921120000_2b5a_custom_m_price_trusted_snapshot.sql'), 'utf8').includes("RAISE EXCEPTION 'incomplete custom snapshot'"));

  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert('.env.example documents WORKSHOP_GCS_* names', ['WORKSHOP_GCS_BUCKET', 'WORKSHOP_GCS_ENDPOINT', 'WORKSHOP_GCS_SIGNER_SA'].every((n) => env.includes(n)));
  const freeze = fs.readFileSync(path.join(root, 'src/lib/publicPaymentFreeze.ts'), 'utf8');
  assert('payment freeze unchanged', /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true/.test(freeze));
}

// ---------------------------------------------------------------------------
section('release forward state (post D-5/D-6/D-7)');
{
  type Call = { url: string; init: RequestInit };
  const SIGNED_PUT = FAKE_SIGNED(ORIGINAL);
  const fakeApi = (opts: { putOk?: boolean; commitStatus?: number } = {}) => {
    const calls: Call[] = [];
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      blob: async () => new Blob(),
    });
    const api: WorkshopMediaApi = {
      getAccessToken: async () => 'synthetic-token',
      now: () => 0,
      fetch: async (url, init) => {
        calls.push({ url, init });
        if (url === WORKSHOP_MEDIA_ENDPOINTS.signUpload) {
          return reply(200, {
            path: ORIGINAL,
            upload: { method: 'PUT', url: SIGNED_PUT, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } },
            expiresAt: new Date(300_000).toISOString(),
          });
        }
        if (url === SIGNED_PUT) return reply(opts.putOk === false ? 403 : 200, null);
        if (url === WORKSHOP_MEDIA_ENDPOINTS.commit) {
          const status = opts.commitStatus ?? 200;
          return reply(status, status === 200 ? { path: ORIGINAL } : { error: 'commit_failed' });
        }
        if (url === WORKSHOP_MEDIA_ENDPOINTS.discard) return reply(200, { ok: true });
        return reply(404, null);
      },
    };
    return { api, calls };
  };
  const file = new File([new Uint8Array([1, 2, 3])], 'synthetic.png', { type: 'image/png' });

  assert('A endpoints are sign-upload / commit / discard',
    WORKSHOP_MEDIA_ENDPOINTS.signUpload === '/api/workshop-media/sign-upload'
    && WORKSHOP_MEDIA_ENDPOINTS.commit === '/api/workshop-media/commit'
    && WORKSHOP_MEDIA_ENDPOINTS.discard === '/api/workshop-media/discard');
  assert('A server registers sign-upload / commit / discard / sign-read',
    WORKSHOP_MEDIA_PATHS.signUpload === WORKSHOP_MEDIA_ENDPOINTS.signUpload
    && WORKSHOP_MEDIA_PATHS.commit === WORKSHOP_MEDIA_ENDPOINTS.commit
    && WORKSHOP_MEDIA_PATHS.discard === WORKSHOP_MEDIA_ENDPOINTS.discard);

  const ok = fakeApi();
  const committed = await uploadWorkshopOriginal(ok.api, file);
  assert('A upload order is sign-upload -> signed PUT -> commit',
    ok.calls.map((c) => c.url).join('|') === [WORKSHOP_MEDIA_ENDPOINTS.signUpload, SIGNED_PUT, WORKSHOP_MEDIA_ENDPOINTS.commit].join('|'));
  const signBody = JSON.parse(String(ok.calls[0]?.init.body ?? '{}'));
  assert('A sign-upload sends kind/contentType/size only',
    Object.keys(signBody).sort().join(',') === 'contentType,kind,sizeBytes' && signBody.kind === 'original' && signBody.sizeBytes === 3);
  const put = ok.calls[1]?.init;
  assert('A signed PUT targets the Seoul regional host without credentials/referrer',
    new URL(SIGNED_PUT).host === WORKSHOP_MEDIA_GCS_HOST && put?.method === 'PUT' && put?.credentials === 'omit'
    && put?.referrerPolicy === 'no-referrer' && put?.redirect === 'error');
  assert('A signed PUT is never sent with the Bearer token',
    !JSON.stringify(put?.headers ?? {}).includes('synthetic-token'));

  const failedCommit = fakeApi({ commitStatus: 500 });
  let commitError = '';
  try {
    await uploadWorkshopOriginal(failedCommit.api, file);
  } catch (error) {
    commitError = error instanceof WorkshopUploadError ? error.reason : 'other';
  }
  const discardCall = failedCommit.calls.find((c) => c.url === WORKSHOP_MEDIA_ENDPOINTS.discard);
  assert('A failed commit discards the uncommitted canonical path',
    commitError === 'commit_failed' && JSON.parse(String(discardCall?.init.body ?? '{}')).path === ORIGINAL);

  const failedPut = fakeApi({ putOk: false });
  let putError = '';
  try {
    await uploadWorkshopOriginal(failedPut.api, file);
  } catch (error) {
    putError = error instanceof WorkshopUploadError ? error.reason : 'other';
  }
  assert('A failed PUT never commits and discards each signed path',
    putError === 'upload_failed'
    && !failedPut.calls.some((c) => c.url === WORKSHOP_MEDIA_ENDPOINTS.commit)
    && failedPut.calls.filter((c) => c.url === WORKSHOP_MEDIA_ENDPOINTS.discard).length === 2);

  const sources: { rel: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        sources.push({ rel: path.relative(root, full).replace(/\\/g, '/'), text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(path.join(root, 'src'));
  const workshopBucketCall = /storage\s*\.\s*from\(\s*['"`]workshop['"`]\s*\)/;
  const directWorkshopStorage = sources.filter((s) => workshopBucketCall.test(s.text)).map((s) => s.rel);
  assert('B no src file calls supabase.storage.from(\'workshop\')', directWorkshopStorage.length === 0, directWorkshopStorage.join(', '));
  assert('B no src file uploads to the workshop bucket',
    !sources.some((s) => /from\(\s*['"`]workshop['"`]\s*\)\s*\.\s*upload/.test(s.text)));
  assert('B scanned the client tree', sources.some((s) => s.rel === 'src/lib/customComposition/durableHandoff.ts')
    && sources.some((s) => s.rel === 'src/components/Workshop/WorkshopView.tsx'));

  const publicUrlLines = sources.flatMap((s) =>
    s.text.split('\n').filter((line) => line.includes('getPublicUrl')).map((line) => ({ rel: s.rel, line })));
  const nonProductPublicUrl = publicUrlLines.filter((p) => !/storage\.from\('products'\)\.getPublicUrl/.test(p.line));
  assert('C getPublicUrl only on the products bucket', nonProductPublicUrl.length === 0,
    [...new Set(nonProductPublicUrl.map((p) => p.rel))].join(', '));
  assert('C Workshop modules never build public Storage URLs',
    sources.filter((s) => /workshop/i.test(s.rel)).every((s) => !/getPublicUrl|\/storage\/v1\/object\/public\/workshop\/\$\{/.test(s.text)));

  assert('D committed value is the bare canonical path', committed === ORIGINAL);
  assert('D committed value carries no host, query or signature',
    !committed.includes('://') && !committed.includes('?') && !/x-goog/i.test(committed));
  assert('D client and server agree the committed value is canonical',
    parseWorkshopMediaRef(committed)?.source === 'canonical' && normalizeWorkshopRef(committed) === committed);
  assert('D server builds canonical paths for new uploads',
    /^originals\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/.test(buildCanonicalWorkshopPath('original', UID, 'image/png') ?? '')
    && /^previews\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(buildCanonicalWorkshopPath('preview', UID, 'image/jpeg') ?? ''));
  assert('D signed URL is not a durable ref', normalizeWorkshopRef(SIGNED_PUT, opts) === null
    && parseWorkshopMediaRef(SIGNED_PUT, [LEGACY_HOST]) === null);

  const legacy = `${LEGACY_BASE}${ORIGINAL}`;
  const clientLegacy = parseWorkshopMediaRef(legacy, [LEGACY_HOST]);
  assert('E legacy Supabase public URL still parses on the client',
    clientLegacy?.source === 'legacy_supabase' && clientLegacy.path === ORIGINAL);
  assert('E legacy Supabase public URL still normalizes on the server', normalizeWorkshopRef(legacy, opts) === ORIGINAL);
  assert('E legacy and canonical refs share one identity',
    workshopRefIdentity(legacy, opts) === workshopRefIdentity(ORIGINAL, opts));
  const adapterSource = fs.readFileSync(path.join(root, 'src/lib/workshopStorage.ts'), 'utf8');
  assert('E legacy Supabase store remains in the adapter', /export function createSupabaseLegacyWorkshopStore/.test(adapterSource));
  const transitionMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261007100000_new4_4d_path_validation.sql'), 'utf8');
  assert('E path-validation migration still accepts own legacy Supabase refs',
    /FUNCTION public\.workshop_ref_is_own_legacy_supabase/.test(transitionMigration));

  const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy-candidate.ps1'), 'utf8');
  assert('F deploy script ships a zero-traffic candidate only', /"--no-traffic"/.test(deployScript) && /"--tag=candidate"/.test(deployScript));
  assert('F deploy script refuses a dirty worktree', /Working tree is not clean/.test(deployScript));
  assert('F deploy script does not bind WORKSHOP_GCS_* implicitly', !/WORKSHOP_GCS_/.test(deployScript));
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert('F .env.example carries no active WORKSHOP_GCS_* values',
    !/^\s*WORKSHOP_GCS_[A-Z_]+=\S/m.test(envExample));
  assert('F path-validation migration is still marked not applied', /NOT applied/.test(transitionMigration));
  const decision = fs.readFileSync(path.join(root, 'docs/decisions/NEW4-4D_workshop-private-gcs.md'), 'utf8');
  assert('F decision note keeps production cutover release-gated', /Production cutover: RELEASE-GATED/.test(decision));
}

// ---------------------------------------------------------------------------
const groups = [...new Set(results.map((r) => r.group))];
console.log('');
for (const g of groups) {
  const rows = results.filter((r) => r.group === g);
  console.log(`${g}: ${rows.filter((r) => r.pass).length}/${rows.length}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
