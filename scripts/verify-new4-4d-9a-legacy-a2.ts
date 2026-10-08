/**
 * NEW4-4D-9A — A2 Workshop consumers (ProductDetail preview, Workshop resume) route canonical AND
 * strict legacy refs through the shared resolver: local checks.
 * The real client resolver talks to the real server sign-read handler (D-9 legacy bridge) with an
 * in-memory GCS store and synthetic reference rows. No GCS / Supabase / network, no customer data.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_MEDIA_CACHE_CONTROL,
  handleSignRead,
  parseCanonicalWorkshopPath,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopMediaDeps,
  type WorkshopObjectMetadata,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import { createWorkshopMediaResolver } from '../src/lib/workshopMediaCore';
import { WORKSHOP_MEDIA_ENDPOINTS, loadWorkshopMediaAsObjectUrl } from '../src/lib/customComposition/durableHandoff';
import {
  initialWorkshopPreviewState,
  startWorkshopPreview,
  type WorkshopPreviewDeps,
  type WorkshopPreviewState,
} from '../src/components/pdp/workshopPreviewSource';
import {
  createWorkshopMediaDisplay,
  workshopDisplayRef,
  type WorkshopDisplayApi,
} from '../src/lib/workshopMediaDisplay';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../src/lib/publicPaymentFreeze';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = '0955689';
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const read = (rel: string) => lf(fs.readFileSync(path.join(root, rel), 'utf8'));
const readBaseline = (rel: string) =>
  lf(execFileSync('git', ['show', `${BASELINE}:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const sha = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();
const between = (s: string, start: string, end: string) => {
  const i = s.indexOf(start);
  if (i < 0) return '';
  const j = s.indexOf(end, i + start.length);
  return j < 0 ? '' : s.slice(i, j);
};

const results: { group: string; name: string; pass: boolean }[] = [];
let group = '';
function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ group, name, pass: condition });
  const suffix = !condition && detail ? ` - ${detail}` : '';
  process.stdout.write(`${condition ? 'PASS' : 'FAIL'}: [${group}] ${name}${suffix}\n`);
}
function section(label: string): void {
  group = label;
  process.stdout.write(`\n== ${label} ==\n`);
}

// Capture console and web-storage access for the whole run (S / T).
const consoleLines: string[] = [];
for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  console[method] = (...args: unknown[]) => {
    consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
}
const storageAccess: string[] = [];
for (const name of ['localStorage', 'sessionStorage', 'indexedDB'] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      storageAccess.push(name);
      return undefined;
    },
  });
}

// Synthetic identities (not customer data).
const UID = '0d9c1111-1111-4111-8111-111111111111';
const OBJ = (n: number) => `0d9d${String(n).padStart(4, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const HOSTS = [LEGACY_HOST];
const legacyUrl = (p: string) => `https://${LEGACY_HOST}/storage/v1/object/public/workshop/${p}`;
const PREVIEW = (n: number) => `previews/${UID}/${OBJ(n)}.jpg`;
const ORIGINAL = (n: number) => `originals/${UID}/${OBJ(n)}.png`;
const customer = { userId: UID, isAdmin: false };

type Clock = { t: number };
type World = {
  clock: Clock;
  objects: Map<string, WorkshopObjectMetadata>;
  rows: WorkshopCustomerRows;
  legacyFallback?: boolean;
  signReads: string[][];
  gets: { url: string; init: RequestInit }[];
  failGets: number;
  signSeq: number;
  blobs: number;
};

function makeWorld(rows: Partial<WorkshopCustomerRows>, legacyFallback?: boolean): World {
  return {
    clock: { t: Date.parse('2026-10-08T00:00:00Z') },
    objects: new Map(),
    rows: { cart: [], progress: [], orders: [], intents: [], ...rows },
    legacyFallback,
    signReads: [],
    gets: [],
    failGets: 0,
    signSeq: 0,
    blobs: 0,
  };
}

function verifiedCopy(world: World, p: string, legacyCopy: 'verified' | null): void {
  const parsed = parseCanonicalWorkshopPath(p)!;
  world.objects.set(p, {
    path: p,
    sizeBytes: 9,
    contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
    cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL,
    createdAtMs: world.clock.t,
    legacyCopy,
  });
}

function signedUrl(p: string, seq: number): string {
  return `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Expires=300&X-Goog-Signature=synthetic${seq}`;
}

function serverDeps(world: World): WorkshopMediaDeps {
  const gcs: WorkshopGcsObjectStore = {
    name: 'gcs',
    async listObjects() {
      return [];
    },
    async remove() {
      throw new Error('not used');
    },
    async head(p) {
      return world.objects.get(p) ?? null;
    },
    async signUpload() {
      throw new Error('not used');
    },
    async signRead(p) {
      world.signSeq += 1;
      return { url: signedUrl(p, world.signSeq), expiresAt: new Date(world.clock.t + 300_000).toISOString() };
    },
  };
  const references: WorkshopReferenceSource = {
    async customerRows() {
      return world.rows;
    },
    async adminOrderRows() {
      return [];
    },
  };
  return { gcs, references, legacyHosts: HOSTS, legacyFallback: world.legacyFallback, now: () => world.clock.t };
}

function makeResolver(world: World) {
  return createWorkshopMediaResolver({
    getSession: async () => ({ userId: UID, accessToken: 'synthetic-token' }),
    legacyHosts: HOSTS,
    now: () => world.clock.t,
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { refs: string[] };
      world.signReads.push(body.refs);
      const res = await handleSignRead(serverDeps(world), customer, body);
      return { ok: res.status === 200, status: res.status, json: async () => res.body };
    },
  });
}

type Timer = { fn: () => void; ms: number; cleared: boolean };
function previewHarness(world: World) {
  const resolver = makeResolver(world);
  const timers: Timer[] = [];
  const states: WorkshopPreviewState[] = [];
  const deps: WorkshopPreviewDeps = {
    normalize: (ref) => resolver.normalize(ref),
    resolve: (ref) => resolver.resolveOne(ref, { mode: 'customer' }),
    setTimer: (fn, ms) => {
      const t: Timer = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (handle) => {
      (handle as Timer).cleared = true;
    },
    now: () => world.clock.t,
  };
  return { resolver, timers, states, deps, emit: (s: WorkshopPreviewState) => void states.push(s) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const last = <T>(xs: T[]) => xs[xs.length - 1];

function blobDeps(world: World, resolver: ReturnType<typeof makeResolver>) {
  return {
    resolve: (ref: string) => resolver.resolveOne(ref, { mode: 'customer' }),
    retryAfterLoadError: (ref: string, failed: string) => resolver.retryAfterLoadError(ref, failed, { mode: 'customer' }),
    fetch: async (url: string, init: RequestInit) => {
      world.gets.push({ url, init });
      const fail = world.failGets > 0;
      if (fail) world.failGets -= 1;
      return {
        ok: !fail,
        status: fail ? 403 : 200,
        json: async () => ({}),
        blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      };
    },
    createObjectUrl: () => {
      world.blobs += 1;
      return `blob:https://metalora.art/${OBJ(900 + world.blobs)}`;
    },
  };
}

const SIGNED_MARKERS = ['X-Goog-Signature', 'X-Goog-Credential', 'synthetic-token', WORKSHOP_GCS_REGIONAL_HOST];
const hasSensitive = (s: string) => SIGNED_MARKERS.some((m) => s.includes(m)) || s.includes(UID) || s.includes(LEGACY_HOST);

async function main(): Promise<void> {
  const productDetail = read('src/components/ProductDetail.tsx');
  const helper = read('src/components/pdp/workshopPreviewSource.ts');
  const workshopView = read('src/components/Workshop/WorkshopView.tsx');
  const durable = read('src/lib/customComposition/durableHandoff.ts');
  const hookRegion = between(productDetail, 'const workshopPreviewDeps', 'function PdpStatusScreen');
  const resume = between(workshopView, 'const handleResume = async', 'const saveProgress');

  section('A ProductDetail canonical ref → resolver');
  {
    const ref = PREVIEW(1);
    const world = makeWorld({ cart: [{ custom_image: ref }] });
    verifiedCopy(world, ref, null);
    const h = previewHarness(world);
    assert('initial state is loading (no src)', JSON.stringify(initialWorkshopPreviewState(ref, h.deps.normalize)) === JSON.stringify({ ref, src: null, status: 'loading' }));
    const stop = startWorkshopPreview(ref, h.deps, h.emit);
    await settle();
    assert('sign-read called once with the canonical ref', world.signReads.length === 1 && world.signReads[0][0] === ref);
    assert('ready with the regional signed src', last(h.states)?.status === 'ready' && last(h.states)?.src?.startsWith(`https://${WORKSHOP_GCS_REGIONAL_HOST}/`) === true);
    stop();
    assert('stop clears the refresh timer', h.timers.length === 1 && h.timers[0].cleared);
    assert('ProductDetail wires the helper to resolveWorkshopMediaSrc (customer)', /resolve: \(ref\) => resolveWorkshopMediaSrc\(ref, \{ mode: 'customer' \}\)/.test(hookRegion) && /startWorkshopPreview\(ref, workshopPreviewDeps, setState\)/.test(hookRegion));
  }

  section('B/E ProductDetail strict legacy ref → resolver → GCS bridge');
  const legacyPreviewPath = PREVIEW(2);
  const legacyPreview = legacyUrl(legacyPreviewPath);
  {
    const cartItem = { custom_image: legacyPreview };
    const before = JSON.stringify(cartItem);
    const world = makeWorld({ cart: [{ custom_image: legacyPreview }] });
    verifiedCopy(world, legacyPreviewPath, 'verified');
    const rowsBefore = JSON.stringify(world.rows);
    const h = previewHarness(world);
    startWorkshopPreview(cartItem.custom_image, h.deps, h.emit);
    await settle();
    assert('B sign-read called with the exact legacy ref', world.signReads.length === 1 && world.signReads[0][0] === legacyPreview);
    const ready = last(h.states);
    assert('E src is the transient signed GCS URL', ready?.status === 'ready' && ready.src === signedUrl(legacyPreviewPath, 1));
    assert('E state keeps the durable legacy ref as its key', ready?.ref === legacyPreview);
    assert('E legacy public URL never emitted', !h.states.some((s) => s.src === legacyPreview));
    assert('F legacy durable value not rewritten (cart item object)', JSON.stringify(cartItem) === before);
    assert('F reference rows unchanged (no DB rewrite)', JSON.stringify(world.rows) === rowsBefore);

    section('I expiry refresh for bridged legacy → GCS');
    assert('refresh scheduled at 85% of the remaining lifetime', h.timers.length === 1 && Math.abs(h.timers[0].ms - 300_000 * 0.85) < 1);
    world.clock.t += h.timers[0].ms;
    h.timers[0].fn();
    await settle();
    assert('refresh re-signs through sign-read', world.signReads.length === 2 && world.signReads[1][0] === legacyPreview);
    assert('fresh signed src emitted for the same ref', last(h.states)?.src === signedUrl(legacyPreviewPath, 2) && last(h.states)?.ref === legacyPreview);
    assert('next refresh scheduled again', h.timers.length === 2 && !h.timers[1].cleared);
    assert('refresh logic is store-agnostic (no origin special-case)', !/legacy|supabase/i.test(helper.replace(/\/\*\*[\s\S]*?\*\//g, '')));
  }

  section('D ProductDetail transition result store=supabase_legacy');
  {
    const p = PREVIEW(3);
    const ref = legacyUrl(p);
    const world = makeWorld({ cart: [{ custom_image: ref }] });
    const h = previewHarness(world);
    startWorkshopPreview(ref, h.deps, h.emit);
    await settle();
    assert('sign-read still called (no client bypass)', world.signReads.length === 1 && world.signReads[0][0] === ref);
    assert('server-approved legacy src displayed', last(h.states)?.status === 'ready' && last(h.states)?.src === ref);
    assert('no expiry timer for a non-expiring legacy src', h.timers.length === 0);
  }

  section('C/G ProductDetail no raw shortcut; canonical not rewritten');
  {
    const p = PREVIEW(4);
    const ref = legacyUrl(p);
    const world = makeWorld({ cart: [{ custom_image: ref }] }, false);
    const h = previewHarness(world);
    startWorkshopPreview(ref, h.deps, h.emit);
    await settle();
    assert('C post-cutover miss (fallback=false, no copy) → failed, no src', last(h.states)?.status === 'failed' && h.states.every((s) => s.src === null));
    assert('C never falls back to the raw legacy URL', !h.states.some((s) => s.src === ref));
    assert('C no raw `src: ref` anywhere in the preview path', !/src: ref\b/.test(hookRegion + helper));
    assert('C ProductDetail no longer gates on canonical-only', !/isCanonicalWorkshopRef|isLegacyWorkshopRef/.test(productDetail));

    const canonical = PREVIEW(5);
    const w2 = makeWorld({ cart: [{ custom_image: canonical }] });
    verifiedCopy(w2, canonical, null);
    const item = { custom_image: canonical };
    const h2 = previewHarness(w2);
    startWorkshopPreview(item.custom_image, h2.deps, h2.emit);
    await settle();
    assert('G canonical durable value not rewritten', item.custom_image === canonical && last(h2.states)?.ref === canonical);
    assert('G ProductDetail durable ref comes from the cart item, src only in state', /cartItemFromState\.custom_image \|\| cartItemFromState\.image \|\| ''/.test(productDetail) && /image: workshopPreviewSrc,/.test(productDetail));
  }

  section('H invalid / external refs never become a Workshop src');
  {
    const world = makeWorld({});
    const h = previewHarness(world);
    const invalid = [
      'https://example.com/a.jpg',
      `https://${LEGACY_HOST}/storage/v1/object/public/products/${OBJ(6)}.jpg`,
      signedUrl(PREVIEW(6), 1),
      'blob:https://metalora.art/x',
      'data:image/png;base64,AAAA',
      `https://evil.supabase.co/storage/v1/object/public/workshop/${PREVIEW(6)}`,
      `https://${LEGACY_HOST}/storage/v1/object/public/workshop/previews/${UID}/not-a-uuid.jpg`,
      `http://${LEGACY_HOST}/storage/v1/object/public/workshop/${PREVIEW(6)}`,
    ];
    for (const ref of invalid) {
      const states: WorkshopPreviewState[] = [];
      startWorkshopPreview(ref, h.deps, (s) => void states.push(s));
      await settle();
      assert(`rejected: ${ref.slice(0, 48)}…`, states.length === 1 && states[0].status === 'failed' && states[0].src === null);
    }
    assert('no sign-read sent for any invalid ref', world.signReads.length === 0);
    assert('empty ref (catalog product) → ready, no src, no request', JSON.stringify(initialWorkshopPreviewState('', h.deps.normalize)) === JSON.stringify({ ref: '', src: null, status: 'ready' }));
  }

  section('J D-8A no-referrer retained');
  assert('policy set whenever a Workshop preview ref exists (canonical or legacy)', /const workshopImageReferrerPolicy = workshopPreviewRef \? \('no-referrer' as const\) : undefined;/.test(productDetail));
  for (const c of ['ProductTheatreStage', 'PdpStorySection', 'ProductTruthSection', 'ProductMountIncluded', 'ProductTheatreRoomPreview']) {
    assert(`${c} still receives the policy`, new RegExp(`<${c}[\\s\\S]*?imageReferrerPolicy=\\{workshopImageReferrerPolicy\\}[\\s\\S]*?/>`).test(productDetail));
  }
  for (const rel of [
    'src/components/pdp/ProductTheatreStage.tsx',
    'src/components/pdp/ProductTheatreRoomPreview.tsx',
    'src/components/pdp/ProductTruthSection.tsx',
    'src/components/pdp/ProductMountIncluded.tsx',
    'src/components/pdp/factualVisuals.tsx',
    'src/components/pdp/story/PdpStorySection.tsx',
    'src/components/pdp/story/PdpStoryStatic.tsx',
    'src/components/pdp/story/PdpStoryMobile.tsx',
  ]) {
    assert(`${rel} unchanged`, read(rel) === readBaseline(rel));
  }

  section('K/L/M Workshop resume → resolver for canonical and legacy');
  assert('K/L every valid ref goes through loadResumedWorkshopOriginal', /const objectUrl = normalizeWorkshopMediaRef\(ref\) \? await loadResumedWorkshopOriginal\(ref\) : null;/.test(resume));
  assert('K/L loader uses resolver + one re-sign in customer mode', /resolve: \(value\) => resolveWorkshopMediaSrc\(value, \{ mode: 'customer' \}\)/.test(workshopView) && /retryWorkshopMediaAfterLoadError\(value, failedSrc, \{ mode: 'customer' \}\)/.test(workshopView));
  assert('M no raw legacy display branch in resume', !/replaceUploadedImage\(ref\)|isCanonicalWorkshopRef|isLegacyWorkshopRef/.test(resume));
  assert('M editor only receives the local object URL', /replaceUploadedImage\(objectUrl\)/.test(resume) && (resume.match(/replaceUploadedImage\(/g) ?? []).length === 1);
  {
    const canonical = ORIGINAL(10);
    const world = makeWorld({ progress: [{ uploaded_image_url: canonical }] });
    verifiedCopy(world, canonical, null);
    const resolver = makeResolver(world);
    const url = await loadWorkshopMediaAsObjectUrl(canonical, blobDeps(world, resolver));
    assert('K canonical resume: sign-read with the canonical ref', world.signReads.length === 1 && world.signReads[0][0] === canonical);
    assert('K canonical resume: local blob URL', typeof url === 'string' && url.startsWith('blob:'));
  }

  section('N legacy resume → server-chosen source → local blob');
  {
    const p = ORIGINAL(11);
    const ref = legacyUrl(p);
    const world = makeWorld({ progress: [{ uploaded_image_url: ref }] });
    verifiedCopy(world, p, 'verified');
    const rowsBefore = JSON.stringify(world.rows);
    const resolver = makeResolver(world);
    const url = await loadWorkshopMediaAsObjectUrl(ref, blobDeps(world, resolver));
    assert('L legacy resume: sign-read with the exact legacy ref', world.signReads.length === 1 && world.signReads[0][0] === ref);
    assert('N bridged to GCS: bytes fetched from the signed URL', world.gets.length === 1 && world.gets[0].url === signedUrl(p, 1));
    assert('N GET is CORS, no-referrer, no credentials, no redirects', world.gets[0]?.init.mode === 'cors' && world.gets[0]?.init.referrerPolicy === 'no-referrer' && world.gets[0]?.init.credentials === 'omit' && world.gets[0]?.init.redirect === 'error');
    assert('N editor gets a local blob URL', typeof url === 'string' && url.startsWith('blob:') && !hasSensitive(url));
    assert('N progress row not rewritten', JSON.stringify(world.rows) === rowsBefore);

    const p2 = ORIGINAL(12);
    const ref2 = legacyUrl(p2);
    const w2 = makeWorld({ progress: [{ uploaded_image_url: ref2 }] });
    const r2 = makeResolver(w2);
    const url2 = await loadWorkshopMediaAsObjectUrl(ref2, blobDeps(w2, r2));
    assert('N transition (no copy): server-approved legacy URL fetched once', w2.signReads.length === 1 && w2.gets.length === 1 && w2.gets[0].url === ref2);
    assert('N transition: local blob URL', typeof url2 === 'string' && url2.startsWith('blob:'));
  }

  section('O failure leaves saved progress untouched');
  {
    const p = ORIGINAL(13);
    const ref = legacyUrl(p);
    const world = makeWorld({ progress: [{ uploaded_image_url: ref }] }, false);
    const rowsBefore = JSON.stringify(world.rows);
    const resolver = makeResolver(world);
    const url = await loadWorkshopMediaAsObjectUrl(ref, blobDeps(world, resolver));
    assert('post-cutover miss → null, no bytes fetched (no raw legacy GET)', url === null && world.gets.length === 0);
    assert('progress row unchanged', JSON.stringify(world.rows) === rowsBefore);
    const failBranch = between(resume, 'if (!objectUrl) {', 'return;');
    assert('failure branch shows the existing re-upload prompt', /showToast\('이전 이미지를 불러오지 못했습니다\. 사진을 다시 업로드해 주세요\.', 'error'\)/.test(failBranch) && /setCurrentStep\(1\)/.test(failBranch));
    assert('failure branch does not write / clear progress or the durable ref', failBranch.length > 0 && !/upsert|clearProgress|uploaded_image_url|setDurableOriginalRef|replaceUploadedImage/.test(failBranch));
    assert('invalid ref takes the same failure branch without any request', /normalizeWorkshopMediaRef\(ref\) \? await loadResumedWorkshopOriginal\(ref\) : null/.test(resume));
  }

  section('P one controlled retry only');
  {
    const p = ORIGINAL(14);
    const ref = legacyUrl(p);
    const world = makeWorld({ progress: [{ uploaded_image_url: ref }] });
    verifiedCopy(world, p, 'verified');
    world.failGets = 1;
    const url = await loadWorkshopMediaAsObjectUrl(ref, blobDeps(world, makeResolver(world)));
    assert('bridged legacy: one failed GET → one re-sign → success', typeof url === 'string' && world.signReads.length === 2 && world.gets.length === 2 && world.gets[1].url === signedUrl(p, 2));

    const w2 = makeWorld({ progress: [{ uploaded_image_url: ref }] });
    verifiedCopy(w2, p, 'verified');
    w2.failGets = 10;
    const url2 = await loadWorkshopMediaAsObjectUrl(ref, blobDeps(w2, makeResolver(w2)));
    assert('bridged legacy: persistent failure stops after one re-sign', url2 === null && w2.signReads.length === 2 && w2.gets.length === 2);

    const p3 = ORIGINAL(15);
    const ref3 = legacyUrl(p3);
    const w3 = makeWorld({ progress: [{ uploaded_image_url: ref3 }] });
    w3.failGets = 10;
    const url3 = await loadWorkshopMediaAsObjectUrl(ref3, blobDeps(w3, makeResolver(w3)));
    assert('transition legacy src: no re-sign (non-expiring), null after one GET', url3 === null && w3.signReads.length === 1 && w3.gets.length === 1);
  }

  section('Q/R new upload unchanged');
  assert('durableHandoff identical to baseline', durable === readBaseline('src/lib/customComposition/durableHandoff.ts'));
  assert('upload endpoints are sign-upload / commit / discard', WORKSHOP_MEDIA_ENDPOINTS.signUpload === '/api/workshop-media/sign-upload' && WORKSHOP_MEDIA_ENDPOINTS.commit === '/api/workshop-media/commit');
  assert('WorkshopView cart flow still uses persistWorkshopCartMedia', /persistWorkshopCartMedia\(\s*workshopMediaApi,/.test(workshopView));
  const cartFlow = (s: string) => between(s, 'const handoff = await persistWorkshopCartMedia', 'const { rpcData } = handoff.value;');
  assert('WorkshopView cart flow identical to baseline', cartFlow(workshopView).length > 0 && cartFlow(workshopView) === cartFlow(readBaseline('src/components/Workshop/WorkshopView.tsx')));
  assert('R no Supabase Storage in A2 Workshop paths', ![workshopView, productDetail, helper, durable].some((s) => /supabase\.storage|\.from\('workshop'\)|getPublicUrl/.test(s)));

  section('S/T no signed URL persistence / logging');
  assert('S no web-storage access during the flows', storageAccess.length === 0, storageAccess.join(','));
  assert('S helper has no storage / analytics / navigation / DB access', !/localStorage|sessionStorage|indexedDB|track\(|navigate\(|supabase|upsert|insert\(/.test(helper));
  const durableSets = workshopView.match(/setDurableOriginalRef\(([^)]*)\)/g) ?? [];
  assert('S durable ref only ever the persisted ref or null', durableSets.length > 0 && durableSets.every((s) => /setDurableOriginalRef\((ref|null)\)/.test(s)));
  assert('S progress saves the durable ref only', /saveProgress\(currentStep, materialType, size, durableOriginalRef\)/.test(workshopView));
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  const persistRe = /localStorage\.setItem|sessionStorage\.setItem|track\(|navigate\(|\.upsert\(|\.insert\(|\.update\(/g;
  for (const rel of ['src/components/ProductDetail.tsx', 'src/components/Workshop/WorkshopView.tsx']) {
    assert(`S ${rel}: no new storage / analytics / navigation / DB writes`, count(read(rel), persistRe) === count(readBaseline(rel), persistRe));
    assert(`T ${rel}: no new console calls`, count(read(rel), /console\.[a-z]+\(/g) === count(readBaseline(rel), /console\.[a-z]+\(/g));
  }
  assert('T helper never logs', !/console\./.test(helper));
  assert('T no console output with signed URLs, tokens, paths or hosts', !consoleLines.some(hasSensitive), String(consoleLines.length));

  section('U protected WIP untouched');
  const PROTECTED: Record<string, string> = {
    'src/components/InquiryModal.tsx': '05C2C01B7B312CB1B8CE7626B161D1031A74FB1A04243F16C4AC637887B68CFC',
    'src/components/OrdersModal.tsx': '6E75C6694582234211CDD1A0B91336D8F0D556406271FA3653BD49F93710B024',
    'src/components/ProfileEditModal.tsx': '48C34800559913E2CE3111FCD6608682C000E7A2C59A5B481E06201536F9B168',
    'src/components/ProfileOverlay.tsx': '12726DD97F4F42AF9285AA7D9E8AA155D363A822E3D33AA83F0D65E78E3D261C',
    'src/pages/ProfileComplete.tsx': '02B5FC09E53FAA92BB07D9C867DB97BC71395AC7BD632169AE7B526A0A56EF08',
  };
  for (const [rel, hash] of Object.entries(PROTECTED)) assert(`${rel} byte-identical`, sha(rel) === hash);

  section('V payment freeze + boundaries');
  assert('PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);
  for (const rel of [
    'src/lib/publicPaymentFreeze.ts',
    'src/lib/workshopMedia.ts',
    'src/lib/workshopMediaCore.ts',
    'src/lib/workshopStorage.ts',
    'src/components/Cart.tsx',
    'src/context/CartContext.tsx',
    'src/components/artwork3d/MetaloraArtwork3D.tsx',
    'src/components/pdp/PdpSpatialCanvas.tsx',
    'server.ts',
  ]) {
    assert(`${rel} identical to baseline`, read(rel) === readBaseline(rel));
  }

  // NEW4-4D-9C: the shared display layer changed intentionally in NEW4-4D-9B; its byte freeze was
  // replaced by the forward contract below (real controller ↔ real resolver ↔ real sign-read bridge).
  section('W post-D-9B shared display (workshopMediaDisplay / useWorkshopMediaDisplay)');
  {
    const displaySrc = read('src/lib/workshopMediaDisplay.ts');
    const hookSrc = read('src/hooks/useWorkshopMediaDisplay.ts');
    const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    const displayHarness = (world: World) => {
      const resolver = makeResolver(world);
      const timers: Timer[] = [];
      const api: WorkshopDisplayApi = {
        isCanonical: (v) => resolver.isCanonical(v),
        isLegacy: (v) => resolver.isLegacy(v),
        normalize: (v) => resolver.normalize(v),
        resolve: (refs, options) => resolver.resolve(refs, options),
        retryAfterLoadError: (ref, failedSrc, options) => resolver.retryAfterLoadError(ref, failedSrc, options),
        now: () => world.clock.t,
        setTimer: (fn, ms) => {
          const t: Timer = { fn, ms, cleared: false };
          timers.push(t);
          return t;
        },
        clearTimer: (handle) => {
          (handle as Timer).cleared = true;
        },
      };
      return { resolver, timers, display: createWorkshopMediaDisplay(api, 'customer', () => undefined) };
    };

    const canonical = PREVIEW(20);
    const bridgedPath = PREVIEW(21);
    const bridged = legacyUrl(bridgedPath);
    const transitional = legacyUrl(PREVIEW(22));
    const world = makeWorld({ cart: [{ custom_image: canonical }, { custom_image: bridged }, { custom_image: transitional }] });
    verifiedCopy(world, canonical, null);
    verifiedCopy(world, bridgedPath, 'verified');
    const rowsBefore = JSON.stringify(world.rows);
    const values = [canonical, bridged, transitional];
    const valuesBefore = JSON.stringify(values);
    const h = displayHarness(world);
    await h.display.setRefs(values);
    const sent = world.signReads.flat();
    assert('A canonical ref sent to sign-read', sent.includes(canonical));
    assert('A canonical ref → ready signed src', h.display.get(canonical).src?.startsWith(`https://${WORKSHOP_GCS_REGIONAL_HOST}/`) === true);
    assert('B strict legacy refs sent to sign-read too (one batch)', world.signReads.length === 1 && sent.includes(bridged) && sent.includes(transitional));
    assert('D legacy with verified copy → temporary signed GCS src', /X-Goog-Signature=synthetic\d+$/.test(h.display.get(bridged).src ?? '') && h.display.get(bridged).src !== bridged);
    assert('E transition (no copy) → server-approved legacy src only after sign-read', h.display.get(transitional).src === transitional && sent.includes(transitional));
    assert('G expiring results schedule one shared refresh', h.timers.length === 1 && !h.timers[0].cleared);

    const firstSrc = h.display.get(bridged).src!;
    await h.display.onLoadError(bridged, firstSrc);
    assert('G load error on bridged legacy → one re-sign via the shared resolver', world.signReads.length === 2 && h.display.get(bridged).src !== firstSrc && h.display.get(bridged).status === 'ready');
    const secondSrc = h.display.get(bridged).src!;
    await h.display.onLoadError(bridged, secondSrc);
    assert('G second load error → placeholder, no further re-sign, never the raw ref', world.signReads.length === 2 && h.display.get(bridged).status === 'failed' && h.display.get(bridged).src === null);
    await h.display.onLoadError(transitional, transitional);
    assert('G transitional legacy load error → placeholder (no re-sign of a non-expiring src)', world.signReads.length === 2 && h.display.get(transitional).src === null);

    assert('J durable values not rewritten', JSON.stringify(values) === valuesBefore);
    assert('J reference rows not rewritten', JSON.stringify(world.rows) === rowsBefore);
    h.display.dispose();
    assert('dispose drops temporary srcs and the refresh timer', h.display.get(canonical).src === null && h.timers[0].cleared);

    const cut = makeWorld({ orders: [{ ordered_items: [{ image: legacyUrl(PREVIEW(23)) }] }] }, false);
    const hc = displayHarness(cut);
    const missed = legacyUrl(PREVIEW(23));
    await hc.display.setRefs([missed]);
    assert('F post-cutover miss → failed, no src', cut.signReads.length === 1 && hc.display.get(missed).status === 'failed' && hc.display.get(missed).src === null);
    const down = makeWorld({});
    const hd = displayHarness(down);
    const unauth = legacyUrl(PREVIEW(24));
    await hd.display.setRefs([unauth]);
    assert('F unauthorized legacy ref → failed, never the raw input', down.signReads.length === 1 && hd.display.get(unauth).src === null);

    const inv = makeWorld({});
    const hi = displayHarness(inv);
    const invalid = [
      'https://example.com/a.jpg',
      `https://${LEGACY_HOST}/storage/v1/object/public/products/${OBJ(25)}.jpg`,
      signedUrl(PREVIEW(25), 1),
      'blob:https://metalora.art/x',
      'data:image/png;base64,AAAA',
      `https://evil.supabase.co/storage/v1/object/public/workshop/${PREVIEW(25)}`,
      `https://${LEGACY_HOST}/storage/v1/object/public/workshop/previews/${UID}/not-a-uuid.jpg`,
    ];
    await hi.display.setRefs(invalid);
    assert('I invalid / non-UUID / foreign refs → none, no sign-read', inv.signReads.length === 0 && invalid.every((v) => hi.display.get(v).src === null && workshopDisplayRef(v, { isCanonical: hi.resolver.isCanonical, isLegacy: hi.resolver.isLegacy, resolve: hi.resolver.resolve, retryAfterLoadError: hi.resolver.retryAfterLoadError }).kind === 'none'));

    assert('C shared layer returns only resolver-issued srcs', /const src = srcs\.get\(display\.ref\);/.test(displaySrc) && !/src: (display\.ref|trimmed|value|ref)\b/.test(code(displaySrc)) && !/kind: '(direct|legacy)'/.test(displaySrc));
    assert('C srcs map is written only from resolver results', (code(displaySrc).match(/srcs\.set\(/g) ?? []).length === 2 && /srcs\.set\(ref, media\.src\)/.test(displaySrc) && /srcs\.set\(display\.ref, media\.src\)/.test(displaySrc));
    assert('G hook binds the shared D-4 resolver (resolve + retry)', /resolve: resolveWorkshopMedia,/.test(hookSrc) && /retryAfterLoadError: retryWorkshopMediaAfterLoadError,/.test(hookSrc) && /from '\.\.\/lib\/workshopMedia'/.test(hookSrc));
    assert('H no second cache / TTL / sign-read in the shared layer', !/WORKSHOP_MEDIA_SIGNED_TTL|300_000|validUntil|refreshAt|fetch\(|sign-read|localStorage|sessionStorage/.test(code(displaySrc)) && /^import type \{[^}]*\} from '\.\/workshopMediaCore';/m.test(displaySrc) && !/^import \{[^}]*\} from '\.\/workshopMediaCore'/m.test(displaySrc));
    assert('I shared strict parser is the only acceptance authority', /isCanonical: isCanonicalWorkshopRef,/.test(hookSrc) && /isLegacy: isLegacyWorkshopRef,/.test(hookSrc) && /normalize: normalizeWorkshopMediaRef,/.test(hookSrc) && !/supabase\.co|\/storage\/v1|https?:\/\//.test(code(displaySrc)));
    assert('T shared layer never logs', !/console\./.test(displaySrc + hookSrc));
  }

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\nNEW4-4D-9A LEGACY A2: ${results.length - failed.length}/${results.length} PASS\n`);
  if (failed.length) process.exit(1);
}

void main();
