/**
 * NEW4-4D-5 — Workshop client media flow: local checks.
 * The client helpers run against the real server handlers (sign-upload / commit / discard /
 * sign-read) with a mocked GCS store and mocked DB references. Synthetic refs only.
 * No GCS / Supabase / network calls, no customer data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_SIGNED_URL_TTL_SECONDS,
  WORKSHOP_UPLOAD_CAPS,
  handleCommit,
  handleDiscard,
  handleSignRead,
  handleSignUpload,
  workshopUploadHeaders,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopMediaCaller,
  type WorkshopMediaResponse,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import { createWorkshopMediaResolver, parseWorkshopMediaRef } from '../src/lib/workshopMediaCore';
import {
  WORKSHOP_MEDIA_ENDPOINTS,
  WORKSHOP_UPLOAD_LIMITS,
  WorkshopUploadError,
  loadWorkshopMediaAsObjectUrl,
  persistWorkshopCartMedia,
  uploadWorkshopOriginal,
  uploadWorkshopPreview,
  verifyTrustedCustomCartRow,
  workshopOriginalContentType,
  type WorkshopMediaApi,
} from '../src/lib/customComposition/durableHandoff';
import { getFullImageUrl } from '../src/lib/utils';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../src/lib/publicPaymentFreeze';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
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
      return new Proxy({}, { get: () => () => undefined });
    },
  });
}

// Synthetic identities (not customer data).
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const objectId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const LEGACY_BASE = `https://${LEGACY_HOST}/storage/v1/object/public/workshop/`;
const TOKENS: Record<string, WorkshopMediaCaller> = {
  'token-customer': { userId: UID, isAdmin: false },
  'token-other': { userId: OTHER, isAdmin: false },
};
const GCS_ORIGIN = `https://${WORKSHOP_GCS_REGIONAL_HOST}`;
const SIGNED_MARKERS = ['X-Goog-Signature', 'X-Goog-Credential', WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com'];

type Req = { url: string; method: string; init: RequestInit; body: unknown };
type StoredObject = { contentType: string | null; cacheControl: string | null; sizeBytes: number; createdAtMs: number };
type Issued = { path: string; headers: Record<string, string>; expiresAtMs: number; method: 'PUT' | 'GET'; used: boolean };

type World = {
  clock: { t: number };
  token: string | null;
  requests: Req[];
  objects: Map<string, StoredObject>;
  issued: Map<string, Issued>;
  rows: WorkshopCustomerRows;
  signCount: number;
  serverRemoves: string[];
  putFailures: number;
  failPutKinds: Set<'original' | 'preview'>;
  failGetCount: number;
  signReadHost: string;
  commitStatus: number | null;
  createdObjectUrls: number;
};

function makeWorld(): World {
  return {
    clock: { t: Date.parse('2026-10-07T00:00:00.000Z') },
    token: 'token-customer',
    requests: [],
    objects: new Map(),
    issued: new Map(),
    rows: { cart: [], progress: [], orders: [], intents: [] },
    signCount: 0,
    serverRemoves: [],
    putFailures: 0,
    failPutKinds: new Set(),
    failGetCount: 0,
    signReadHost: WORKSHOP_GCS_REGIONAL_HOST,
    commitStatus: null,
    createdObjectUrls: 0,
  };
}

function gcsStore(world: World): WorkshopGcsObjectStore {
  const sign = (p: string, method: 'PUT' | 'GET', headers: Record<string, string>, host: string) => {
    world.signCount += 1;
    const url = `https://${host}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Expires=${WORKSHOP_SIGNED_URL_TTL_SECONDS}&X-Goog-Signature=synthetic${world.signCount}`;
    const expiresAtMs = world.clock.t + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000;
    world.issued.set(url, { path: p, headers, expiresAtMs, method, used: false });
    return { url, expiresAt: new Date(expiresAtMs).toISOString() };
  };
  return {
    name: 'gcs',
    async listObjects() {
      return [];
    },
    async remove(p: string) {
      world.serverRemoves.push(p);
      return world.objects.delete(p) ? 'removed' : 'absent';
    },
    async head(p: string) {
      const o = world.objects.get(p);
      return o ? { path: p, ...o } : null;
    },
    async signUpload(p: string, contentType: string, maxBytes: number) {
      const headers = workshopUploadHeaders(contentType, maxBytes);
      const signed = sign(p, 'PUT', headers, WORKSHOP_GCS_REGIONAL_HOST);
      return { url: signed.url, method: 'PUT' as const, headers, expiresAt: signed.expiresAt };
    },
    async signRead(p: string) {
      return sign(p, 'GET', {}, world.signReadHost);
    },
  } as unknown as WorkshopGcsObjectStore;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([]),
  };
}

function headersEqual(a: Record<string, string>, b: unknown): boolean {
  if (!b || typeof b !== 'object') return false;
  const rb = b as Record<string, string>;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(rb).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === rb[k]);
}

function makeFetch(world: World) {
  const references: WorkshopReferenceSource = {
    customerRows: async (uid) => (uid === UID ? world.rows : { cart: [], progress: [], orders: [], intents: [] }),
    adminOrderRows: async () => [],
  };
  const deps = { gcs: gcsStore(world), references, legacyHosts: [LEGACY_HOST], now: () => world.clock.t };
  const handlers: Record<string, (d: typeof deps, c: WorkshopMediaCaller, b: unknown) => Promise<WorkshopMediaResponse>> = {
    [WORKSHOP_MEDIA_ENDPOINTS.signUpload]: handleSignUpload,
    [WORKSHOP_MEDIA_ENDPOINTS.commit]: handleCommit,
    [WORKSHOP_MEDIA_ENDPOINTS.discard]: handleDiscard,
    '/api/workshop-media/sign-read': handleSignRead,
  };

  return async (url: string, init: RequestInit) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const isJson = typeof init.body === 'string';
    world.requests.push({ url, method, init, body: isJson ? JSON.parse(init.body as string) : init.body });

    if (url.startsWith('/api/')) {
      const handler = handlers[url];
      if (!handler || method !== 'POST') return jsonResponse(404, { error: 'not_found' });
      const auth = ((init.headers ?? {}) as Record<string, string>).Authorization ?? '';
      const caller = TOKENS[auth.replace(/^Bearer /, '')];
      if (!caller) return jsonResponse(401, { error: 'unauthorized' });
      if (url === WORKSHOP_MEDIA_ENDPOINTS.commit && world.commitStatus) {
        return jsonResponse(world.commitStatus, { error: 'content_type_not_allowed' });
      }
      const result = await handler(deps, caller, JSON.parse(String(init.body)));
      return jsonResponse(result.status, result.body);
    }

    const issued = world.issued.get(url);
    if (!url.startsWith(`${GCS_ORIGIN}/`) || !issued) return jsonResponse(403, {});
    if (world.clock.t >= issued.expiresAtMs) return jsonResponse(400, {});

    if (method === 'PUT' && issued.method === 'PUT') {
      const kind = issued.path.startsWith('originals/') ? 'original' : 'preview';
      if (world.putFailures > 0) {
        world.putFailures -= 1;
        return jsonResponse(400, {});
      }
      if (world.failPutKinds.has(kind)) return jsonResponse(503, {});
      if (!headersEqual(issued.headers, init.headers)) return jsonResponse(403, {});
      const body = init.body as Blob;
      const max = Number(issued.headers['x-goog-content-length-range'].split(',')[1]);
      if (!(body.size >= 1 && body.size <= max)) return jsonResponse(400, {});
      if (world.objects.has(issued.path)) return jsonResponse(412, {});
      world.objects.set(issued.path, {
        contentType: issued.headers['Content-Type'],
        cacheControl: issued.headers['Cache-Control'],
        sizeBytes: body.size,
        createdAtMs: world.clock.t,
      });
      issued.used = true;
      return jsonResponse(200, {});
    }

    if (method === 'GET' && issued.method === 'GET') {
      if (world.failGetCount > 0) {
        world.failGetCount -= 1;
        return jsonResponse(403, {});
      }
      const o = world.objects.get(issued.path);
      if (!o) return jsonResponse(404, {});
      return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob([new Uint8Array(o.sizeBytes)]) };
    }
    return jsonResponse(403, {});
  };
}

function makeApi(world: World): WorkshopMediaApi {
  return { fetch: makeFetch(world), getAccessToken: async () => world.token, now: () => world.clock.t };
}

function makeResolver(world: World) {
  return createWorkshopMediaResolver({
    legacyHosts: [LEGACY_HOST],
    now: () => world.clock.t,
    getSession: async () => (world.token ? { userId: UID, accessToken: world.token } : null),
    fetch: makeFetch(world),
  });
}

function blobDeps(world: World, resolver: ReturnType<typeof makeResolver>) {
  return {
    resolve: (ref: string) => resolver.resolveOne(ref, { mode: 'customer' }),
    retryAfterLoadError: (ref: string, failed: string) => resolver.retryAfterLoadError(ref, failed, { mode: 'customer' }),
    fetch: makeFetch(world),
    createObjectUrl: () => {
      world.createdObjectUrls += 1;
      return `blob:https://metalora.art/${objectId(900 + world.createdObjectUrls)}`;
    },
  };
}

const file = (bytes: number, type: string, name: string) => new File([new Uint8Array(bytes)], name, { type });
const jpegBlob = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
const byUrl = (world: World, endpoint: string) => world.requests.filter((r) => r.url === endpoint);
const hasSignedMarker = (value: unknown) => {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return SIGNED_MARKERS.some((m) => s.includes(m));
};
const isCanonical = (value: unknown, kind: 'original' | 'preview') => {
  const p = parseWorkshopMediaRef(value);
  return !!p && p.source === 'canonical' && p.kind === kind && p.path === value;
};
async function rejectsWith(fn: () => Promise<unknown>, reason: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof WorkshopUploadError && error.reason === reason && !hasSignedMarker(error.message);
  }
}

function between(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  if (i < 0) return '';
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}

async function main(): Promise<void> {
  const workshopView = read('src/components/Workshop/WorkshopView.tsx');
  const durable = read('src/lib/customComposition/durableHandoff.ts');
  const productDetail = read('src/components/ProductDetail.tsx');
  const previewSource = read('src/components/pdp/workshopPreviewSource.ts');
  const rasterize = read('src/lib/customComposition/rasterize.ts');
  const artwork3d = read('src/components/artwork3d/MetaloraArtwork3D.tsx');

  section('A. sign-upload request (original)');
  {
    const world = makeWorld();
    const ref = await uploadWorkshopOriginal(makeApi(world), file(1234, 'image/png', 'photo.png'));
    const signReq = byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.signUpload)[0];
    const body = signReq?.body as Record<string, unknown>;
    assert('body is exactly {kind, contentType, sizeBytes}', JSON.stringify(Object.keys(body ?? {}).sort()) === '["contentType","kind","sizeBytes"]');
    assert('kind original / image/png / size', body?.kind === 'original' && body?.contentType === 'image/png' && body?.sizeBytes === 1234);
    assert('no client path / uid in body', !('path' in (body ?? {})) && !('uid' in (body ?? {})));
    const init = signReq?.init;
    assert('Bearer token, no-store, no-referrer', ((init?.headers ?? {}) as Record<string, string>).Authorization === 'Bearer token-customer' && init?.cache === 'no-store' && init?.referrerPolicy === 'no-referrer');
    assert('returns committed canonical original', isCanonical(ref, 'original') && ref.startsWith(`originals/${UID}/`) && ref.endsWith('.png'));
    assert('octet-stream .jpg → image/jpeg', workshopOriginalContentType({ type: 'application/octet-stream', name: 'a.JPG' }) === 'image/jpeg');
    assert('image/jpg → image/jpeg; webp kept', workshopOriginalContentType({ type: 'image/jpg', name: 'x' }) === 'image/jpeg' && workshopOriginalContentType({ type: 'image/webp', name: 'x' }) === 'image/webp');
    const w2 = makeWorld();
    assert('gif / heic refused locally (no request)', (await rejectsWith(() => uploadWorkshopOriginal(makeApi(w2), file(10, 'image/gif', 'a.gif')), 'unsupported_type')) && (await rejectsWith(() => uploadWorkshopOriginal(makeApi(w2), file(10, 'image/heic', 'a.heic')), 'unsupported_type')) && w2.requests.length === 0);
  }

  section('B. original 25 MiB boundary');
  {
    const cap = WORKSHOP_UPLOAD_CAPS.original;
    assert('client cap equals server cap (25 MiB)', WORKSHOP_UPLOAD_LIMITS.original === cap && cap === 25 * 1024 * 1024);
    const world = makeWorld();
    const ref = await uploadWorkshopOriginal(makeApi(world), file(cap, 'image/jpeg', 'max.jpg'));
    assert('exactly 25 MiB uploads + commits', isCanonical(ref, 'original') && world.objects.get(ref)?.sizeBytes === cap);
    const w2 = makeWorld();
    assert('25 MiB + 1 → too_large, nothing sent', (await rejectsWith(() => uploadWorkshopOriginal(makeApi(w2), file(cap + 1, 'image/jpeg', 'big.jpg')), 'too_large')) && w2.requests.length === 0);
    const w3 = makeWorld();
    assert('empty file refused, nothing sent', (await rejectsWith(() => uploadWorkshopOriginal(makeApi(w3), file(0, 'image/jpeg', 'e.jpg')), 'upload_failed')) && w3.requests.length === 0);
    assert('WorkshopView rejects > 25 MiB at file pick', /file\.size > WORKSHOP_UPLOAD_LIMITS\.original/.test(workshopView));
  }

  section('C. preview 5 MiB boundary');
  {
    const cap = WORKSHOP_UPLOAD_CAPS.preview;
    assert('client cap equals server cap (5 MiB)', WORKSHOP_UPLOAD_LIMITS.preview === cap && cap === 5 * 1024 * 1024);
    const world = makeWorld();
    const ref = await uploadWorkshopPreview(makeApi(world), jpegBlob(cap));
    const body = byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.signUpload)[0]?.body as Record<string, unknown>;
    assert('exactly 5 MiB uploads + commits', isCanonical(ref, 'preview') && world.objects.get(ref)?.sizeBytes === cap);
    assert('preview requests image/jpeg', body?.kind === 'preview' && body?.contentType === 'image/jpeg');
    const w2 = makeWorld();
    assert('5 MiB + 1 → too_large, nothing sent', (await rejectsWith(() => uploadWorkshopPreview(makeApi(w2), jpegBlob(cap + 1)), 'too_large')) && w2.requests.length === 0);
    const w3 = makeWorld();
    const untyped = await uploadWorkshopPreview(makeApi(w3), new Blob([new Uint8Array(50)]));
    assert('untyped preview blob stored as image/jpeg', w3.objects.get(untyped)?.contentType === 'image/jpeg');
  }

  section('D/E/F. signed PUT + commit');
  {
    const world = makeWorld();
    const ref = await uploadWorkshopOriginal(makeApi(world), file(77, 'image/webp', 'w.webp'));
    const put = world.requests.find((r) => r.method === 'PUT');
    const issued = put ? world.issued.get(put.url) : undefined;
    assert('D. PUT to the exact server-issued URL', !!issued && issued.method === 'PUT' && issued.path === ref);
    assert('D. headers identical to server-required headers', !!issued && headersEqual(issued.headers, put?.init.headers));
    assert('D. headers include signed range + create-only', !!issued && issued.headers['x-goog-if-generation-match'] === '0' && issued.headers['Cache-Control'] === 'private, no-store');
    assert('E. PUT referrerPolicy no-referrer', put?.init.referrerPolicy === 'no-referrer');
    assert('E. PUT credentials omit, redirect error, no-store', put?.init.credentials === 'omit' && put?.init.redirect === 'error' && put?.init.cache === 'no-store');
    const order = world.requests.map((r) => (r.method === 'PUT' ? 'PUT' : r.url));
    assert('F. order sign-upload → PUT → commit', JSON.stringify(order) === JSON.stringify([WORKSHOP_MEDIA_ENDPOINTS.signUpload, 'PUT', WORKSHOP_MEDIA_ENDPOINTS.commit]));
    const commitBody = byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.commit)[0]?.body as Record<string, unknown>;
    assert('F. commit body {path, kind}', commitBody?.path === ref && commitBody?.kind === 'original' && Object.keys(commitBody).length === 2);
    assert('F. committed object has server-validated metadata', world.objects.get(ref)?.contentType === 'image/webp');

    const w2 = makeWorld();
    w2.commitStatus = 422;
    const failed = await rejectsWith(() => uploadWorkshopOriginal(makeApi(w2), file(10, 'image/jpeg', 'a.jpg')), 'commit_failed');
    assert('commit failure → commit_failed + discard of that path', failed && byUrl(w2, WORKSHOP_MEDIA_ENDPOINTS.discard).length === 1 && w2.objects.size === 0);

    const w3 = makeWorld();
    const api3 = makeApi(w3);
    const globalFetch = api3.fetch;
    api3.fetch = async (url, init) => {
      const res = await globalFetch(url, init);
      if (url === WORKSHOP_MEDIA_ENDPOINTS.signUpload) {
        const body = (await res.json()) as Record<string, any>;
        body.upload.url = String(body.upload.url).replace(WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com');
        return jsonResponse(200, body);
      }
      return res;
    };
    const refusedGlobal = await rejectsWith(() => uploadWorkshopOriginal(api3, file(10, 'image/jpeg', 'a.jpg')), 'sign_failed');
    assert('global/non-regional signed URL refused, never PUT', refusedGlobal && !w3.requests.some((r) => r.method === 'PUT'));
  }

  section('Retry (expired / failed PUT)');
  {
    const world = makeWorld();
    world.putFailures = 1;
    const ref = await uploadWorkshopOriginal(makeApi(world), file(10, 'image/jpeg', 'a.jpg'));
    const signs = byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.signUpload);
    const puts = world.requests.filter((r) => r.method === 'PUT');
    assert('one failed PUT → one fresh sign-upload', signs.length === 2 && puts.length === 2);
    assert('retry uses a NEW path + new URL', puts[0].url !== puts[1].url && world.issued.get(puts[0].url)?.path !== ref);
    assert('retry succeeds with committed canonical path', isCanonical(ref, 'original') && world.objects.has(ref));

    const w2 = makeWorld();
    w2.putFailures = 5;
    const exhausted = await rejectsWith(() => uploadWorkshopOriginal(makeApi(w2), file(10, 'image/jpeg', 'a.jpg')), 'upload_failed');
    assert('at most one retry (2 signs, 2 PUTs)', exhausted && byUrl(w2, WORKSHOP_MEDIA_ENDPOINTS.signUpload).length === 2 && w2.requests.filter((r) => r.method === 'PUT').length === 2);

    const w3 = makeWorld();
    const api3 = makeApi(w3);
    let first = true;
    api3.now = () => {
      if (first && byUrl(w3, WORKSHOP_MEDIA_ENDPOINTS.signUpload).length === 1) {
        first = false;
        return w3.clock.t + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000 + 1;
      }
      return w3.clock.t;
    };
    const ref3 = await uploadWorkshopOriginal(api3, file(10, 'image/jpeg', 'a.jpg'));
    const puts3 = w3.requests.filter((r) => r.method === 'PUT');
    assert('locally expired signature is never used (re-signed instead)', puts3.length === 1 && isCanonical(ref3, 'original') && byUrl(w3, WORKSHOP_MEDIA_ENDPOINTS.signUpload).length === 2);
  }

  section('G/H. canonical persistence');
  {
    const world = makeWorld();
    let persisted: unknown = null;
    const result = await persistWorkshopCartMedia(
      makeApi(world),
      { originalFile: file(20, 'image/png', 'a.png'), existingOriginalRef: null, previewBlob: jpegBlob(30) },
      async (refs) => {
        persisted = refs;
        return { ok: 1 };
      },
    );
    const refs = persisted as { originalRef: string; previewRef: string } | null;
    assert('G. persisted original is canonical path', !!refs && isCanonical(refs.originalRef, 'original'));
    assert('H. persisted preview is canonical path', !!refs && isCanonical(refs.previewRef, 'preview'));
    assert('G/H. no URL / signed / blob / data value persisted', !!refs && !JSON.stringify(refs).includes('://') && !hasSignedMarker(refs) && !/blob:|data:/.test(JSON.stringify(refs)));
    assert('persist ran after both commits', result.ok === true && byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.commit).length === 2);
    assert('no discard on success', byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.discard).length === 0 && world.objects.size === 2);
    assert('WorkshopView passes refs to add_custom_cart_item', /p_original_image_url: originalRef/.test(workshopView) && /p_preview_image_url: previewRef/.test(workshopView));
    assert('trusted-row check uses shared normalizer', /verifyTrustedCustomCartRow\(row, handoff\.refs\.previewRef, normalizeWorkshopMediaRef\)/.test(workshopView));
  }

  section('I. preview failure → original discard');
  {
    const world = makeWorld();
    world.failPutKinds.add('preview');
    let persistCalls = 0;
    const result = await persistWorkshopCartMedia(
      makeApi(world),
      { originalFile: file(20, 'image/jpeg', 'a.jpg'), existingOriginalRef: null, previewBlob: jpegBlob(30) },
      async () => {
        persistCalls += 1;
        return { ok: 1 };
      },
    );
    const discards = byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.discard).map((r) => (r.body as { path: string }).path);
    const originalPath = [...world.issued.values()].find((i) => i.path.startsWith('originals/'))?.path;
    assert('result upload_failed, persist not called', result.ok === false && result.reason === 'upload_failed' && persistCalls === 0);
    assert('committed original discarded via /discard', !!originalPath && discards.includes(originalPath) && !world.objects.has(originalPath));
    assert('server-side removal only (via discard handler)', !!originalPath && world.serverRemoves.includes(originalPath));
  }

  section('J. persistence failure → unprotected cleanup');
  {
    const world = makeWorld();
    const r1 = await persistWorkshopCartMedia(
      makeApi(world),
      { originalFile: file(20, 'image/jpeg', 'a.jpg'), existingOriginalRef: null, previewBlob: jpegBlob(30) },
      async () => null,
    );
    assert('persist null → not_persisted, both discarded', r1.ok === false && r1.reason === 'not_persisted' && byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.discard).length === 2 && world.objects.size === 0);

    const w2 = makeWorld();
    const r2 = await persistWorkshopCartMedia(
      makeApi(w2),
      { originalFile: file(20, 'image/jpeg', 'a.jpg'), existingOriginalRef: null, previewBlob: jpegBlob(30) },
      async () => {
        throw new Error('rpc network');
      },
    );
    assert('persist throws → both discarded', r2.ok === false && w2.objects.size === 0);

    const w3 = makeWorld();
    const r3 = await persistWorkshopCartMedia(
      makeApi(w3),
      { originalFile: file(20, 'image/jpeg', 'a.jpg'), existingOriginalRef: null, previewBlob: jpegBlob(30) },
      async (refs) => {
        w3.rows.cart.push({ custom_image: refs.previewRef, custom_config: { preview_image_url: refs.previewRef, original_image_url: refs.originalRef } });
        throw new Error('response lost after commit');
      },
    );
    const discards = byUrl(w3, WORKSHOP_MEDIA_ENDPOINTS.discard);
    assert('referenced row → server 409, objects kept (not fought)', r3.ok === false && w3.objects.size === 2 && discards.length === 2 && w3.serverRemoves.length === 0);

    const w4 = makeWorld();
    const legacyOriginal = `${LEGACY_BASE}originals/${UID}/${objectId(7)}.jpg`;
    await persistWorkshopCartMedia(
      makeApi(w4),
      { originalFile: null, existingOriginalRef: legacyOriginal, previewBlob: jpegBlob(30) },
      async () => null,
    );
    const paths = byUrl(w4, WORKSHOP_MEDIA_ENDPOINTS.discard).map((r) => (r.body as { path: string }).path);
    assert('existing (resumed) original is never discarded', paths.length === 1 && paths[0].startsWith('previews/'));
  }

  section('K. no direct delete');
  {
    const all: Req[] = [];
    for (const setup of [
      (w: World) => w.failPutKinds.add('preview'),
      (w: World) => (w.putFailures = 1),
      (w: World) => (w.commitStatus = 422),
    ]) {
      const w = makeWorld();
      setup(w);
      await persistWorkshopCartMedia(
        makeApi(w),
        { originalFile: file(20, 'image/jpeg', 'a.jpg'), existingOriginalRef: null, previewBlob: jpegBlob(30) },
        async () => null,
      );
      all.push(...w.requests);
    }
    assert('no DELETE requests from the client', !all.some((r) => r.method === 'DELETE'));
    assert('GCS host only receives PUT', all.filter((r) => r.url.startsWith('https://')).every((r) => r.method === 'PUT'));
    assert('never the global storage.googleapis.com endpoint', !all.some((r) => r.url.includes('storage.googleapis.com')));
    assert('durableHandoff has no Supabase Storage (upload/getPublicUrl/remove)', !/supabase/.test(durable) && !/getPublicUrl|\.storage\.|\.remove\(/.test(durable));
    assert('WorkshopView has no Supabase Storage calls', !/supabase\.storage/.test(workshopView) && !/removeWorkshopPaths/.test(workshopView));
  }

  section('L. legacy refs stay legacy');
  {
    const world = makeWorld();
    const legacyOriginal = `${LEGACY_BASE}originals/${UID}/${objectId(8)}.jpg`;
    let refs: { originalRef: string; previewRef: string } | null = null;
    await persistWorkshopCartMedia(
      makeApi(world),
      { originalFile: null, existingOriginalRef: legacyOriginal, previewBlob: jpegBlob(30) },
      async (r) => {
        refs = r;
        return 1;
      },
    );
    const signBodies = byUrl(world, WORKSHOP_MEDIA_ENDPOINTS.signUpload).map((r) => (r.body as { kind: string }).kind);
    assert('legacy original passed through unchanged', (refs as { originalRef: string } | null)?.originalRef === legacyOriginal);
    assert('legacy original not re-uploaded', JSON.stringify(signBodies) === '["preview"]');

    const normalize = (v: unknown) => parseWorkshopMediaRef(v, [LEGACY_HOST])?.path ?? null;
    const preview = `previews/${UID}/${objectId(9)}.jpg`;
    const cfg = { price_snapshot_version: '1', price_snapshot_source: 'custom_m_price', price_snapshot: 59000 };
    assert('trusted row: canonical echo matches', verifyTrustedCustomCartRow({ custom_image: preview, custom_config: cfg }, preview, normalize).ok === true);
    assert('trusted row: legacy URL ≡ its canonical path', verifyTrustedCustomCartRow({ custom_image: `${LEGACY_BASE}${preview}`, custom_config: cfg }, preview, normalize).ok === true);
    assert('trusted row: different object refused', verifyTrustedCustomCartRow({ custom_image: `previews/${UID}/${objectId(10)}.jpg`, custom_config: cfg }, preview, normalize).ok === false);
    assert('trusted row: arbitrary / other-host URL refused', verifyTrustedCustomCartRow({ custom_image: `https://evil.example/storage/v1/object/public/workshop/${preview}`, custom_config: cfg }, preview, normalize).ok === false);
    assert('trusted row: signed GCS URL refused', verifyTrustedCustomCartRow({ custom_image: `${GCS_ORIGIN}/${WORKSHOP_GCS_APPROVED_BUCKET}/${preview}?X-Goog-Signature=x`, custom_config: cfg }, preview, normalize).ok === false);
    assert('trusted row: price checks unchanged', verifyTrustedCustomCartRow({ custom_image: preview, custom_config: { ...cfg, price_snapshot: 0 } }, preview, normalize).ok === false);
  }

  section('M/V. canonical resume via shared resolver');
  {
    const world = makeWorld();
    const original = `originals/${UID}/${objectId(11)}.jpg`;
    world.objects.set(original, { contentType: 'image/jpeg', cacheControl: 'private, no-store', sizeBytes: 40, createdAtMs: world.clock.t });
    world.rows.progress.push({ uploaded_image_url: original });
    const resolver = makeResolver(world);
    const objectUrl = await loadWorkshopMediaAsObjectUrl(original, blobDeps(world, resolver));
    const signReads = byUrl(world, '/api/workshop-media/sign-read');
    const gets = world.requests.filter((r) => r.method === 'GET');
    assert('M. sign-read called with the canonical ref', signReads.length === 1 && JSON.stringify((signReads[0].body as { refs: string[] }).refs) === JSON.stringify([original]));
    assert('M. bytes fetched once from regional signed URL', gets.length === 1 && gets[0].url.startsWith(`${GCS_ORIGIN}/`));
    assert('M. GET is CORS, no-referrer, no credentials, no redirects', gets[0]?.init.mode === 'cors' && gets[0]?.init.referrerPolicy === 'no-referrer' && gets[0]?.init.credentials === 'omit' && gets[0]?.init.redirect === 'error');
    assert('M. editor receives a local blob: URL', typeof objectUrl === 'string' && objectUrl.startsWith('blob:') && !hasSignedMarker(objectUrl));
    assert('M. WorkshopView resume uses resolver in customer mode', /resolveWorkshopMediaSrc\(value, \{ mode: 'customer' \}\)/.test(workshopView) && /normalizeWorkshopMediaRef\(ref\) \? await loadResumedWorkshopOriginal\(ref\) : null/.test(workshopView));

    const w2 = makeWorld();
    w2.objects.set(original, { contentType: 'image/jpeg', cacheControl: 'private, no-store', sizeBytes: 40, createdAtMs: w2.clock.t });
    w2.rows.progress.push({ uploaded_image_url: original });
    w2.failGetCount = 1;
    const r2 = makeResolver(w2);
    const url2 = await loadWorkshopMediaAsObjectUrl(original, blobDeps(w2, r2));
    assert('V. load error → exactly one re-sign, then success', typeof url2 === 'string' && byUrl(w2, '/api/workshop-media/sign-read').length === 2 && w2.requests.filter((r) => r.method === 'GET').length === 2);

    const w3 = makeWorld();
    w3.objects.set(original, { contentType: 'image/jpeg', cacheControl: 'private, no-store', sizeBytes: 40, createdAtMs: w3.clock.t });
    w3.rows.progress.push({ uploaded_image_url: original });
    w3.failGetCount = 5;
    const r3 = makeResolver(w3);
    const url3 = await loadWorkshopMediaAsObjectUrl(original, blobDeps(w3, r3));
    assert('V. second failure → null, no further retries', url3 === null && byUrl(w3, '/api/workshop-media/sign-read').length === 2 && w3.requests.filter((r) => r.method === 'GET').length === 2);
  }

  section('N/O. legacy resume + resolver failure');
  {
    const resume = between(workshopView, 'const handleResume = async', 'const saveProgress');
    // NEW4-4D-9A: strict legacy refs are resolver-mediated like canonical refs (no raw legacy display).
    assert('N. legacy resume is resolver-mediated (no raw legacy display branch)', resume.length > 0 && !/replaceUploadedImage\(ref\)|isCanonicalWorkshopRef|isLegacyWorkshopRef/.test(resume));
    assert('N. resume never re-uploads; durable ref stays the persisted ref', !/uploadWorkshop|persistWorkshop|sign-upload/.test(resume) && /setDurableOriginalRef\(ref\)/.test(resume));
    const failBranch = between(resume, 'if (!objectUrl) {', 'return;');
    assert('O. failure branch shows re-upload prompt', /showToast\('이전 이미지를 불러오지 못했습니다/.test(failBranch));
    assert('O. failure branch does not write/clear progress', failBranch.length > 0 && !/upsert|clearProgress|uploaded_image_url|setDurableOriginalRef/.test(failBranch));

    const world = makeWorld();
    const original = `originals/${UID}/${objectId(12)}.jpg`;
    const resolver = makeResolver(world);
    const out = await loadWorkshopMediaAsObjectUrl(original, blobDeps(world, resolver));
    assert('O. unreferenced canonical ref → null, no bytes fetched', out === null && !world.requests.some((r) => r.method === 'GET'));
    assert('O. no write endpoints touched on failure', !world.requests.some((r) => r.url !== '/api/workshop-media/sign-read'));
  }

  section('P. canvas / crossOrigin');
  {
    const loadHtml = between(rasterize, 'function loadHtmlImage', 'export async function');
    const co = loadHtml.indexOf("image.crossOrigin = 'anonymous'");
    const src = loadHtml.indexOf('image.src = url');
    assert('rasterize sets crossOrigin before src for remote URLs', co > 0 && src > co);
    assert('resumed canonical media reaches canvas as same-origin blob:', /replaceUploadedImage\(objectUrl\)/.test(workshopView));
    assert('A4 TextureLoader sets crossOrigin anonymous', /loader\.setCrossOrigin\('anonymous'\)/.test(artwork3d));
  }

  section('Q/R/S. ProductDetail');
  {
    const hook = between(productDetail, 'const workshopPreviewDeps', 'function PdpStatusScreen');
    assert('Q. Workshop preview resolved via resolveWorkshopMediaSrc (customer)', /resolveWorkshopMediaSrc\(ref, \{ mode: 'customer' \}\)/.test(hook));
    // NEW4-4D-9A: gate is the strict shared normalizer (canonical + trusted legacy), not canonical-only.
    assert('Q. resolver gated by the shared strict normalizer', /normalize: normalizeWorkshopMediaRef/.test(hook) && /status: normalize\(ref\) \? 'loading' : 'failed'/.test(previewSource));
    assert('Q. re-resolve scheduled before expiry', /\(media\.expiresAt - deps\.now\(\)\) \* REFRESH_FRACTION/.test(previewSource) && /const REFRESH_FRACTION = 0\.85;/.test(previewSource));
    assert('Q. workshop product image = resolved src state', /image: workshopPreviewSrc/.test(productDetail) && /front_image: workshopPreviewSrc/.test(productDetail));
    assert('Q. no raw ref used as display src', !/src: ref\b/.test(hook + previewSource));
    assert('R. resolver used nowhere else in ProductDetail', (productDetail.match(/resolveWorkshopMediaSrc\(/g) ?? []).length === 1);
    assert('R. catalog factual image path unchanged', /getFullImageUrl\(\s*selectedOrientation === 'landscape' && product\.landscape_image/.test(productDetail));
    assert('R. resolver only for workshop-single', /id === 'workshop-single' && cartItemFromState\s*\?\s*cartItemFromState\.custom_image/.test(productDetail));
    const canonicalPreview = `previews/${UID}/${objectId(13)}.jpg`;
    assert('S. getFullImageUrl(canonical) → null (never a public URL)', getFullImageUrl(canonicalPreview, true) === null && getFullImageUrl(`workshop/${canonicalPreview}`) === null);
    assert('S. ProductDetail never passes the Workshop ref to getFullImageUrl', !/getFullImageUrl\([^)]*workshopPreviewRef/.test(productDetail) && !/getFullImageUrl\([^)]*custom_image/.test(productDetail));
    const signed = `${GCS_ORIGIN}/${WORKSHOP_GCS_APPROVED_BUCKET}/${canonicalPreview}?X-Goog-Signature=x`;
    assert('S. resolved signed src passes downstream unchanged (no public mapping)', getFullImageUrl(signed) === signed);
  }

  section('T/U/W. no signed URL persisted / logged / stored');
  {
    assert('T. saveProgress receives durable ref only', /saveProgress\(currentStep, materialType, size, durableOriginalRef\)/.test(workshopView));
    const durableSets = workshopView.match(/setDurableOriginalRef\(([^)]*)\)/g) ?? [];
    assert('T. durable ref only ever set to persisted ref or null', durableSets.length > 0 && durableSets.every((s) => /setDurableOriginalRef\((ref|null)\)/.test(s)));
    assert('T. no Supabase write of display src (uploadedImage) in progress', !/uploaded_image_url: uploadedImage/.test(workshopView));
    assert('T. ProductDetail keeps resolved src in React state only', !/(localStorage|sessionStorage|navigate\()[^\n]*workshopPreview/.test(productDetail));
    assert('U. no console output contains signed URLs or tokens', !consoleLines.some((l) => hasSignedMarker(l) || l.includes('Bearer') || l.includes('token-customer')));
    assert('U. durableHandoff never logs', !/console\./.test(durable));
    assert('U. WorkshopView RPC error logs code only', /console\.error\('add_custom_cart_item failed:', \{ code: error\.code \}\)/.test(workshopView));
    assert('W. no localStorage / sessionStorage / IndexedDB access in flows', storageAccess.length === 0, storageAccess.join(','));
    assert('W. durableHandoff / ProductDetail hook do not touch web storage', !/localStorage|sessionStorage|indexedDB/.test(durable) && !/localStorage|sessionStorage/.test(between(productDetail, 'const workshopPreviewDeps', 'function PdpStatusScreen') + previewSource));
    const setItems = workshopView.match(/(local|session)Storage\.setItem\([^)]*\)/g) ?? [];
    assert('W. WorkshopView web-storage writes are flags only', setItems.every((s) => /'(force_new_start|workshop_just_finished)', 'true'/.test(s)));
    const analytics = between(workshopView, "track('add_to_cart'", '});');
    assert('analytics payload carries no image ref/src', analytics.length > 0 && !/originalRef|previewRef|uploadedImage|durableOriginalRef|previewObjectUrl|handoff\.refs/.test(analytics));
  }

  section('X/Y. boundaries');
  {
    const protectedFiles = ['InquiryModal', 'OrdersModal', 'ProfileEditModal', 'ProfileOverlay', 'ProfileComplete'];
    assert('X. D-5 sources do not import protected WIP', protectedFiles.every((name) => ![workshopView, durable, productDetail].some((s) => new RegExp(`from ['"][^'"]*${name}['"]`).test(s))));
    assert('X. no A4 artwork3d/hero code imported into D-5 sources', ![durable, productDetail, workshopView].some((s) => /artwork3d|components\/hero/.test(s)));
    assert('Y. payment freeze unchanged (true)', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);
    assert('Y. D-5 sources do not reference payment prepare/Toss', ![durable, productDetail, workshopView].some((s) => /payment\/prepare|tosspayments|requestPayment/i.test(s)));
  }

  const passed = results.filter((r) => r.pass).length;
  process.stdout.write(`\nNEW4-4D-5 WORKSHOP CLIENT: ${passed}/${results.length} ${passed === results.length ? 'PASS' : 'FAIL'}\n`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  process.stdout.write(`FATAL: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exit(1);
});
