/**
 * NEW4-4D-4 — Shared Workshop media resolver: local checks.
 * The resolver runs against the real server `handleSignRead` with mocked GCS / DB references.
 * Synthetic refs only. No GCS / Supabase / network calls, no customer data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_MEDIA_PATHS,
  WORKSHOP_SIGN_READ_BATCH_MAX,
  WORKSHOP_SIGNED_URL_TTL_SECONDS,
  handleSignRead,
  parseWorkshopRef,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopMediaCaller,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import {
  WORKSHOP_MEDIA_BATCH_MAX,
  WORKSHOP_MEDIA_GCS_HOST,
  WORKSHOP_MEDIA_REFRESH_RATIO,
  WORKSHOP_MEDIA_SIGN_READ_PATH,
  WORKSHOP_MEDIA_SIGNED_TTL_MS,
  createWorkshopMediaResolver,
  isCanonicalWorkshopPathLike,
  parseWorkshopMediaRef,
  type WorkshopMediaResolver,
  type WorkshopMediaSession,
} from '../src/lib/workshopMediaCore';
import { STORAGE_BASE_URL, getFullImageUrl, getOptimizedImageUrl } from '../src/lib/utils';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

// Everything the code under test prints is captured (assert output bypasses console).
const consoleLines: string[] = [];
for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  console[method] = (...args: unknown[]) => {
    consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
}

// Any browser persistence access is counted.
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
const ADMIN = '33333333-3333-4333-8333-333333333333';
const objectId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const LEGACY_BASE = `https://${LEGACY_HOST}/storage/v1/object/public/workshop/`;
const TOKENS: Record<string, WorkshopMediaCaller> = {
  'token-customer': { userId: UID, isAdmin: false },
  'token-other': { userId: OTHER, isAdmin: false },
  'token-admin': { userId: ADMIN, isAdmin: true },
};
const SESSION_CUSTOMER: WorkshopMediaSession = { userId: UID, accessToken: 'token-customer' };
const SESSION_ADMIN: WorkshopMediaSession = { userId: ADMIN, accessToken: 'token-admin' };

const ORIGINAL = `originals/${UID}/${objectId(1)}.png`;
const PREVIEW = `previews/${UID}/${objectId(2)}.jpg`;
const LEGACY_PREVIEW_PATH = `previews/${UID}/${objectId(3)}.jpg`;
const LEGACY_PREVIEW_URL = `${LEGACY_BASE}${LEGACY_PREVIEW_PATH}`;
const UNREFERENCED = `previews/${UID}/${objectId(4)}.jpg`;
const OTHER_PREVIEW = `previews/${OTHER}/${objectId(5)}.jpg`;
const MANY = Array.from({ length: 45 }, (_, i) => `previews/${UID}/${objectId(100 + i)}.jpg`);

type Mode = 'normal' | 'throw' | 'status503' | 'status401' | 'malformed' | 'bad_host';

type World = {
  clock: { t: number };
  mode: Mode;
  session: WorkshopMediaSession | null;
  signCount: number;
  requests: { url: string; init: RequestInit; body: unknown }[];
  customer: Map<string, WorkshopCustomerRows>;
  orders: { user_id: string; ordered_items: unknown }[];
  onFetch?: () => void;
};

function emptyRows(): WorkshopCustomerRows {
  return { cart: [], progress: [], orders: [], intents: [] };
}

function makeWorld(): World {
  const customer = new Map<string, WorkshopCustomerRows>();
  customer.set(UID, {
    cart: [
      { custom_image: PREVIEW, custom_config: { preview_image_url: PREVIEW, original_image_url: ORIGINAL } },
      { custom_image: LEGACY_PREVIEW_URL, custom_config: { preview_image_url: LEGACY_PREVIEW_URL } },
      ...MANY.map((p) => ({ custom_image: p, custom_config: { preview_image_url: p } })),
    ],
    progress: [],
    orders: [],
    intents: [],
  });
  customer.set(OTHER, emptyRows());
  return {
    clock: { t: Date.parse('2026-10-07T00:00:00.000Z') },
    mode: 'normal',
    session: SESSION_CUSTOMER,
    signCount: 0,
    requests: [],
    customer,
    orders: [{ user_id: OTHER, ordered_items: [{ product_id: 'workshop-single', image: OTHER_PREVIEW, user_image_url: OTHER_PREVIEW }] }],
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeResolver(world: World): WorkshopMediaResolver {
  const gcs = {
    name: 'gcs',
    async signRead(p: string) {
      world.signCount += 1;
      return {
        url: `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Expires=${WORKSHOP_SIGNED_URL_TTL_SECONDS}&X-Goog-Signature=synthetic${world.signCount}`,
        expiresAt: new Date(world.clock.t + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      };
    },
  } as unknown as WorkshopGcsObjectStore;
  const references: WorkshopReferenceSource = {
    customerRows: async (uid) => world.customer.get(uid) ?? emptyRows(),
    adminOrderRows: async (uids) => world.orders.filter((o) => uids.includes(o.user_id)),
  };
  return createWorkshopMediaResolver({
    legacyHosts: [LEGACY_HOST],
    now: () => world.clock.t,
    getSession: async () => world.session,
    fetch: async (url, init) => {
      const body = JSON.parse(String(init.body));
      world.requests.push({ url, init, body });
      world.onFetch?.();
      if (world.mode === 'throw') throw new TypeError('network');
      if (world.mode === 'status503') return jsonResponse(503, { error: 'workshop_gcs_not_configured' });
      if (world.mode === 'status401') return jsonResponse(401, { error: 'unauthorized' });
      const auth = (init.headers as Record<string, string>).Authorization ?? '';
      const caller = TOKENS[auth.replace(/^Bearer /, '')];
      if (!caller) return jsonResponse(401, { error: 'unauthorized' });
      const result = await handleSignRead({ gcs, references, legacyHosts: [LEGACY_HOST] }, caller, body);
      if (world.mode === 'malformed') return jsonResponse(200, { items: [{ nope: true }] });
      if (world.mode === 'bad_host' && Array.isArray(result.body.items)) {
        for (const item of result.body.items as Record<string, unknown>[]) {
          if (typeof item.src === 'string') item.src = item.src.replace(WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com');
        }
      }
      return jsonResponse(result.status, result.body);
    },
  });
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------
  section('A-E normalization');
  {
    const r = makeResolver(makeWorld());
    assert('A canonical original accepted', r.isCanonical(ORIGINAL) && r.normalize(ORIGINAL) === ORIGINAL);
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      assert(`A original .${ext} accepted`, r.isCanonical(`originals/${UID}/${objectId(9)}.${ext}`));
    }
    assert('B canonical preview accepted', r.isCanonical(PREVIEW) && r.normalize(PREVIEW) === PREVIEW);
    assert('C legacy production Supabase URL recognized',
      r.isLegacy(LEGACY_PREVIEW_URL) && !r.isCanonical(LEGACY_PREVIEW_URL) && r.normalize(LEGACY_PREVIEW_URL) === LEGACY_PREVIEW_PATH);
    assert('C legacy signed (token-only) URL recognized',
      r.isLegacy(`https://${LEGACY_HOST}/storage/v1/object/sign/workshop/${LEGACY_PREVIEW_PATH}?token=t`));
    const external = [
      `https://evil.example/storage/v1/object/public/workshop/${PREVIEW}`,
      `https://other.supabase.co/storage/v1/object/public/workshop/${PREVIEW}`,
      `http://${LEGACY_HOST}/storage/v1/object/public/workshop/${PREVIEW}`,
      `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${PREVIEW}?X-Goog-Signature=x`,
      `https://${LEGACY_HOST}/storage/v1/object/public/products/${PREVIEW}`,
      'https://picsum.photos/seed/x/210/297',
    ];
    assert('D external / other-host / GCS / products URLs rejected', external.every((v) => r.normalize(v) === null));
    const malformed = [
      `originals/${UID}/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.png`,
      `originals/${UID}/${objectId(1)}.gif`,
      `previews/${UID}/${objectId(1)}.png`,
      `previews/${UID}/not-a-uuid.jpg`,
      `originals/${UID}/../${objectId(1)}.png`,
      `originals/${UID}/%2e%2e.png`,
      `${PREVIEW}?x=1`,
      `/${PREVIEW}`,
      `workshop/${PREVIEW}`,
      `previews//${UID}/${objectId(1)}.jpg`,
      `${LEGACY_PREVIEW_URL}?download=1`,
      `${LEGACY_PREVIEW_URL}#frag`,
      'blob:https://metalora.art/x',
      'data:image/png;base64,AAAA',
      '',
      'x'.repeat(2049),
    ];
    assert('E malformed refs rejected', malformed.every((v) => r.normalize(v) === null));
    assert('E non-string refs rejected', [null, undefined, 42, {}, []].every((v) => r.normalize(v) === null));

    const parity = [ORIGINAL, PREVIEW, LEGACY_PREVIEW_URL, ...external, ...malformed, `  ${PREVIEW}  `,
      `https://${LEGACY_HOST}/storage/v1/object/authenticated/workshop/${ORIGINAL}`,
      `https://${LEGACY_HOST}/storage/v1/object/sign/workshop/${PREVIEW}?token=a&x=b`,
      `https://${LEGACY_HOST}:443/storage/v1/object/public/workshop/${PREVIEW}`,
      `https://user@${LEGACY_HOST}/storage/v1/object/public/workshop/${PREVIEW}`];
    const mismatches = parity.filter((v) => {
      const s = parseWorkshopRef(v, { legacyHosts: [LEGACY_HOST] });
      const c = parseWorkshopMediaRef(v, [LEGACY_HOST]);
      return (s?.path ?? null) !== (c?.path ?? null) || (s?.kind ?? null) !== (c?.kind ?? null) || (s?.source ?? null) !== (c?.source ?? null);
    });
    assert(`client parser matches server parseWorkshopRef (${parity.length} inputs)`, mismatches.length === 0, `${mismatches.length} mismatches`);
  }

  // ---------------------------------------------------------------------------
  section('F/Q getFullImageUrl');
  {
    const canonicalForms = [ORIGINAL, PREVIEW, `workshop/${PREVIEW}`, `/${PREVIEW}`, `${PREVIEW}?v=1`, `  ${ORIGINAL} `];
    assert('F canonical path → null (isWorkshop=true)', canonicalForms.every((v) => getFullImageUrl(v, true) === null));
    assert('F canonical path → null (isWorkshop=false)', canonicalForms.every((v) => getFullImageUrl(v, false) === null));
    assert('F getOptimizedImageUrl(canonical) → undefined', canonicalForms.every((v) => getOptimizedImageUrl(v) === undefined));
    assert('F isCanonicalWorkshopPathLike covers prefixed/query forms', canonicalForms.every(isCanonicalWorkshopPathLike));
    const resolverSrc = ['src/lib/workshopMediaCore.ts', 'src/lib/workshopMedia.ts']
      .map((f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, ''))
      .join('\n');
    assert('F resolver never builds /object/public/ URLs or imports getFullImageUrl',
      !/STORAGE_BASE_URL|getPublicUrl|getFullImageUrl/.test(resolverSrc)
      && (resolverSrc.match(/object\/public/g) ?? []).length === 1
      && resolverSrc.includes("'/storage/v1/object/public/workshop/',"));

    const expected: [string | null | undefined, boolean, string | null][] = [
      [null, false, null],
      [undefined, false, null],
      ['', false, null],
      ['front.webp', false, `${STORAGE_BASE_URL}/products/front.webp`],
      ['products/a b(1).png', false, `${STORAGE_BASE_URL}/products/a%20b(1).png`],
      ['folder/x.jpg?type=w3840', false, `${STORAGE_BASE_URL}/products/folder/x.jpg`],
      ['https://shop-phinf.pstatic.net/x.jpg?type=w860', false, 'https://shop-phinf.pstatic.net/x.jpg?type=w860'],
      ['blob:https://metalora.art/abc', false, 'blob:https://metalora.art/abc'],
      ['data:image/png;base64,AAAA', false, 'data:image/png;base64,AAAA'],
      [LEGACY_PREVIEW_URL, true, LEGACY_PREVIEW_URL],
      [LEGACY_PREVIEW_URL, false, LEGACY_PREVIEW_URL],
      ['workshop/legacy name.png', false, `${STORAGE_BASE_URL}/workshop/legacy%20name.png`],
      ['legacy/file.png', true, `${STORAGE_BASE_URL}/workshop/legacy/file.png`],
      [`originals/${UID}/not-uuid.png`, true, `${STORAGE_BASE_URL}/workshop/originals/${UID}/not-uuid.png`],
    ];
    const wrong = expected.filter(([input, ws, out]) => getFullImageUrl(input, ws) !== out);
    assert(`Q ordinary product / legacy behavior unchanged (${expected.length} cases)`, wrong.length === 0,
      wrong.map(([i]) => String(i)).join(', '));
    assert('Q product list helper unchanged', getOptimizedImageUrl('front.png', 300) === `${STORAGE_BASE_URL}/products/front__thumb.webp`
      && getOptimizedImageUrl('front.png', 600) === `${STORAGE_BASE_URL}/products/front__medium.webp`);
  }

  // ---------------------------------------------------------------------------
  section('Contract');
  {
    assert('client path matches server route', WORKSHOP_MEDIA_SIGN_READ_PATH === WORKSHOP_MEDIA_PATHS.signRead);
    assert('client batch max matches server cap', WORKSHOP_MEDIA_BATCH_MAX === WORKSHOP_SIGN_READ_BATCH_MAX && WORKSHOP_MEDIA_BATCH_MAX === 20);
    assert('client TTL matches server TTL', WORKSHOP_MEDIA_SIGNED_TTL_MS === WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000);
    assert('client GCS host matches server regional host', WORKSHOP_MEDIA_GCS_HOST === WORKSHOP_GCS_REGIONAL_HOST);

    const world = makeWorld();
    const r = makeResolver(world);
    const out = await r.resolve([PREVIEW, ORIGINAL]);
    const req = world.requests[0];
    const headers = req?.init.headers as Record<string, string> | undefined;
    assert('POST to sign-read', req?.url === WORKSHOP_MEDIA_PATHS.signRead && req.init.method === 'POST');
    assert('Bearer token from session only in Authorization header',
      headers?.Authorization === 'Bearer token-customer' && !String(req?.init.body).includes('token-customer'));
    assert('request no-store, same-origin credentials, no-referrer',
      req?.init.cache === 'no-store' && req.init.credentials === 'same-origin' && req.init.referrerPolicy === 'no-referrer');
    const media = out.get(PREVIEW);
    assert('GCS ref → signed regional src + expiry', !!media && media.store === 'gcs'
      && new URL(media.src).host === WORKSHOP_GCS_REGIONAL_HOST && media.expiresAt === world.clock.t + WORKSHOP_MEDIA_SIGNED_TTL_MS);
    assert('own original resolves', out.get(ORIGINAL)?.store === 'gcs');

    const bad = makeWorld();
    bad.mode = 'bad_host';
    assert('non-regional signed src rejected', (await makeResolver(bad).resolve([PREVIEW])).size === 0);
  }

  // ---------------------------------------------------------------------------
  section('G batching');
  {
    for (const [count, requests, sizes] of [[1, 1, [1]], [20, 1, [20]], [21, 2, [20, 1]], [45, 3, [20, 20, 5]]] as const) {
      const world = makeWorld();
      const out = await makeResolver(world).resolve(MANY.slice(0, count));
      const got = world.requests.map((q) => (q.body as { refs: string[] }).refs.length);
      assert(`${count} refs → ${requests} request(s) [${sizes.join('+')}], all resolved`,
        world.requests.length === requests && got.join() === sizes.join() && out.size === count, `sizes ${got.join('+')} resolved ${out.size}`);
    }
    const world = makeWorld();
    const r = makeResolver(world);
    const [a, b] = await Promise.all([r.resolve(MANY.slice(0, 10)), r.resolve(MANY.slice(10, 25))]);
    assert('concurrent callers coalesce into batches of ≤20', world.requests.length === 2
      && world.requests.every((q) => (q.body as { refs: string[] }).refs.length <= 20) && a.size === 10 && b.size === 15);
    const mixed = makeWorld();
    const mixedOut = await makeResolver(mixed).resolve([PREVIEW, OTHER_PREVIEW, UNREFERENCED, ORIGINAL]);
    assert('partial authorization: allowed refs resolve, denied absent, one request',
      mixed.requests.length === 1 && mixedOut.has(PREVIEW) && mixedOut.has(ORIGINAL) && !mixedOut.has(OTHER_PREVIEW) && !mixedOut.has(UNREFERENCED));
    const invalidMix = makeWorld();
    const invalidOut = await makeResolver(invalidMix).resolve([PREVIEW, 'https://evil.example/a.jpg', `previews/${UID}/x.png`]);
    assert('client-invalid refs never sent (no whole-batch 400)', invalidMix.requests.length === 1
      && (invalidMix.requests[0].body as { refs: string[] }).refs.join() === PREVIEW && invalidOut.size === 1);
  }

  // ---------------------------------------------------------------------------
  section('H dedupe');
  {
    const world = makeWorld();
    const out = await makeResolver(world).resolve([PREVIEW, PREVIEW, `  ${PREVIEW}`, 'https://evil.example/x.jpg', ORIGINAL]);
    const sent = (world.requests[0]?.body as { refs: string[] }).refs;
    assert('duplicate / whitespace variants sent once', world.requests.length === 1 && sent.length === 2 && sent.includes(PREVIEW));
    assert('every input key maps to the same result', out.get(PREVIEW)?.src === out.get(`  ${PREVIEW}`)?.src && !!out.get(PREVIEW));
    assert('invalid input absent from map', !out.has('https://evil.example/x.jpg'));
    const w2 = makeWorld();
    const r2 = makeResolver(w2);
    await Promise.all([r2.resolveOne(PREVIEW), r2.resolveOne(PREVIEW), r2.resolve([PREVIEW])]);
    assert('in-flight dedupe: concurrent same ref → one sign', w2.requests.length === 1 && w2.signCount === 1);
  }

  // ---------------------------------------------------------------------------
  section('I/J cache + expiry');
  {
    const world = makeWorld();
    const r = makeResolver(world);
    const first = await r.resolveOne(PREVIEW);
    await r.resolveOne(PREVIEW);
    assert('I second resolve served from memory', world.requests.length === 1 && r.cacheSize() === 1);
    const refreshMs = WORKSHOP_MEDIA_SIGNED_TTL_MS * WORKSHOP_MEDIA_REFRESH_RATIO;
    assert('J refresh threshold is 240 s of 300 s', refreshMs === 240_000);
    world.clock.t += refreshMs - 1000;
    await r.resolveOne(PREVIEW);
    assert('J 239 s: reuse', world.requests.length === 1);
    world.clock.t += 2000;
    const refreshed = await r.resolveOne(PREVIEW);
    assert('J 241 s: re-signed', world.requests.length === 2 && !!refreshed && refreshed.src !== first?.src);

    world.clock.t += refreshMs + 1000;
    world.mode = 'status503';
    const nearing = await r.resolveOne(PREVIEW);
    assert('J nearing expiry + server down: still-valid URL kept', nearing?.src === refreshed?.src);
    world.clock.t += 60_000;
    const expired = await r.resolveOne(PREVIEW);
    assert('J expired + server down: no src (expired URL never reused)', expired === null && r.cacheSize() === 0);
    world.mode = 'normal';
    const back = await r.resolveOne(PREVIEW);
    assert('J expired: re-signed before use', !!back && back.expiresAt! > world.clock.t);

    // Server clock behind the client: expiresAt already "past" on the local clock.
    const skew = makeWorld();
    const skewed = createWorkshopMediaResolver({
      legacyHosts: [LEGACY_HOST],
      now: () => skew.clock.t,
      getSession: async () => SESSION_CUSTOMER,
      fetch: async (_u, init) => {
        const refs = (JSON.parse(String(init.body)) as { refs: string[] }).refs;
        skew.requests.push({ url: _u, init, body: { refs } });
        return jsonResponse(200, { items: refs.map((ref) => ({
          ref, ok: true, store: 'gcs',
          src: `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${ref}?X-Goog-Signature=s`,
          expiresAt: new Date(skew.clock.t - 60_000).toISOString(),
        })) });
      },
    });
    const once = await skewed.resolveOne(PREVIEW);
    await skewed.resolveOne(PREVIEW);
    assert('J skewed/past expiresAt: usable once, never cached', !!once && skew.requests.length === 2);
  }

  // ---------------------------------------------------------------------------
  section('K persistence');
  {
    assert('K no localStorage / sessionStorage / indexedDB access during all flows', storageAccess.length === 0, storageAccess.join(','));
    const src = ['src/lib/workshopMediaCore.ts', 'src/lib/workshopMedia.ts']
      .map((f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, ''))
      .join('\n');
    assert('K source has no browser persistence APIs', !/localStorage|sessionStorage|indexedDB|caches\.open|document\.cookie/.test(src));
    assert('K source never writes Supabase tables', !/\.from\(|\.insert\(|\.upsert\(|\.update\(/.test(src));
  }

  // ---------------------------------------------------------------------------
  section('L legacy');
  {
    const world = makeWorld();
    const r = makeResolver(world);
    const out = await r.resolve([LEGACY_PREVIEW_URL]);
    const media = out.get(LEGACY_PREVIEW_URL);
    assert('L legacy ref → exact input URL, store supabase_legacy',
      media?.src === LEGACY_PREVIEW_URL && media.store === 'supabase_legacy' && media.expiresAt === null);
    assert('L nothing signed for legacy', world.signCount === 0);
    const asPath = await r.resolve([LEGACY_PREVIEW_PATH]);
    assert('L canonical path whose DB value is legacy → no src (never mints a Supabase URL)', asPath.size === 0);
    assert('L DB rows unchanged', JSON.stringify(world.customer.get(UID)!.cart[1]) ===
      JSON.stringify({ custom_image: LEGACY_PREVIEW_URL, custom_config: { preview_image_url: LEGACY_PREVIEW_URL } }));
    const upgraded = makeWorld();
    upgraded.customer.get(UID)!.cart.push({ custom_image: LEGACY_PREVIEW_PATH, custom_config: { preview_image_url: LEGACY_PREVIEW_PATH } });
    const viaGcs = await makeResolver(upgraded).resolve([LEGACY_PREVIEW_URL]);
    assert('L legacy URL whose DB value is canonical → server-signed GCS src', viaGcs.get(LEGACY_PREVIEW_URL)?.store === 'gcs');
  }

  // ---------------------------------------------------------------------------
  section('M invalid / unauthorized');
  {
    const world = makeWorld();
    const r = makeResolver(world);
    const out = await r.resolve([OTHER_PREVIEW, UNREFERENCED, `https://evil.example/${PREVIEW}`, 'not a ref']);
    assert('M cross-user / unreferenced → no src', out.size === 0);
    assert('M only client-valid refs reached the server', (world.requests[0].body as { refs: string[] }).refs.length === 2);
    const cases: [Mode, string][] = [['status401', 'unauthenticated'], ['status503', 'gcs not configured'], ['throw', 'network error'], ['malformed', 'malformed body']];
    for (const [mode, label] of cases) {
      const w = makeWorld();
      w.mode = mode;
      const res = await makeResolver(w).resolve([PREVIEW]);
      assert(`M ${label} → no src, input never echoed as src`, res.size === 0);
    }
    const noSession = makeWorld();
    noSession.session = null;
    const ns = await makeResolver(noSession).resolve([PREVIEW]);
    assert('M signed out → no request, no src', ns.size === 0 && noSession.requests.length === 0);
    const purged = makeWorld();
    purged.customer.set(UID, emptyRows());
    assert('M purged / no longer referenced → no src', (await makeResolver(purged).resolve([PREVIEW, LEGACY_PREVIEW_URL])).size === 0);
  }

  // ---------------------------------------------------------------------------
  section('N retry / invalidation');
  {
    const world = makeWorld();
    const r = makeResolver(world);
    const first = (await r.resolveOne(PREVIEW))!;
    const second = await r.retryAfterLoadError(PREVIEW, first.src);
    assert('N first load error → one re-sign', !!second && second.src !== first.src && world.requests.length === 2);
    const third = await r.retryAfterLoadError(PREVIEW, second!.src);
    assert('N second load error → null, no further request', third === null && world.requests.length === 2);
    const stale = await r.resolveOne(PREVIEW);
    assert('N later resolve starts fresh (bounded by caller)', !!stale && world.requests.length === 3);
    const current = await r.retryAfterLoadError(PREVIEW, 'https://old.example/src');
    assert('N error for an outdated src → current src, no request', current?.src === stale?.src && world.requests.length === 3);
    const legacy = await r.resolveOne(LEGACY_PREVIEW_URL);
    const legacyRetry = await r.retryAfterLoadError(LEGACY_PREVIEW_URL, legacy!.src);
    assert('N legacy load error → null, no re-sign', legacyRetry === null && world.signCount === 3);
    assert('N retry on uncached ref → null', (await r.retryAfterLoadError(UNREFERENCED, 'x')) === null);
    const beforeInvalidate = world.requests.length;
    await r.resolveOne(PREVIEW);
    assert('N cached ref reused before invalidate', world.requests.length === beforeInvalidate);
    r.invalidate(PREVIEW);
    await r.resolveOne(PREVIEW);
    assert('N invalidate forces re-sign', world.requests.length === beforeInvalidate + 1);

    const racing = makeWorld();
    const rr = makeResolver(racing);
    racing.onFetch = () => rr.clear();
    const raced = await rr.resolveOne(ORIGINAL);
    assert('N clear() during in-flight request: result returned once, not cached', !!raced && rr.cacheSize() === 0);
  }

  // ---------------------------------------------------------------------------
  section('O mode');
  {
    const world = makeWorld();
    world.session = SESSION_ADMIN;
    const r = makeResolver(world);
    const asAdmin = await r.resolve([OTHER_PREVIEW], { mode: 'admin' });
    const body = world.requests[0].body as Record<string, unknown>;
    assert('O body is exactly {refs} (mode not sent; server has no mode field)', Object.keys(body).join() === 'refs');
    assert('O admin caller resolves order ref', asAdmin.get(OTHER_PREVIEW)?.store === 'gcs');
    await r.resolve([OTHER_PREVIEW], { mode: 'customer' });
    assert('O customer / admin cached separately', world.requests.length === 2);
    const fake = makeWorld();
    fake.session = SESSION_CUSTOMER;
    const forged = await makeResolver(fake).resolve([OTHER_PREVIEW], { mode: 'admin' });
    assert('O client mode is not privilege (non-admin + mode admin → no src)', forged.size === 0);
    const other = makeWorld();
    const ro = makeResolver(other);
    await ro.resolve([PREVIEW]);
    other.session = { userId: OTHER, accessToken: 'token-other' };
    const crossSession = await ro.resolve([PREVIEW]);
    assert('O cache keyed by session user (no cross-user reuse)', crossSession.size === 0 && other.requests.length === 2);
  }

  // ---------------------------------------------------------------------------
  section('P logging');
  {
    const leaked = consoleLines.filter((line) =>
      /X-Goog|googleapis|Bearer|token-(customer|admin|other)/i.test(line) || line.includes(UID) || line.includes(OTHER));
    assert('P no signed URL / JWT / user path in any console output', leaked.length === 0, `${leaked.length} lines`);
    const src = fs.readFileSync(path.join(root, 'src/lib/workshopMediaCore.ts'), 'utf8')
      + fs.readFileSync(path.join(root, 'src/lib/workshopMedia.ts'), 'utf8');
    assert('P resolver source has no console calls', !/console\./.test(src));
  }

  // ---------------------------------------------------------------------------
  section('R scope');
  {
    const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
    const orders = read('src/components/OrdersModal.tsx');
    assert('R OrdersModal still on getFullImageUrl (not switched)', orders.includes('getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop)'));
    const listSource = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return listSource(rel);
        return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
      });
    const sources = listSource('src').map((f) => ({ f, text: read(f) }));

    const protectedFiles = [
      'src/components/InquiryModal.tsx', 'src/components/OrdersModal.tsx', 'src/components/ProfileEditModal.tsx',
      'src/components/ProfileOverlay.tsx', 'src/pages/ProfileComplete.tsx',
    ];
    assert('R protected WIP files do not import the resolver (OrdersModal = known unmigrated consumer)',
      protectedFiles.every((f) => !/workshopMedia/.test(read(f))));
    const coreImporters = sources.filter(({ text }) => /from ['"][^'"]*workshopMediaCore['"]/.test(text)).map(({ f }) => f).sort();
    assert('R only the shared layers import workshopMediaCore (display consumers use workshopMedia / display helpers)',
      coreImporters.join() === [
        'src/lib/customComposition/durableHandoff.ts', 'src/lib/utils.ts', 'src/lib/workshopMedia.ts', 'src/lib/workshopMediaDisplay.ts',
      ].join(), coreImporters.join(', '));
    const supabaseWorkshop = sources.filter(({ f, text }) =>
      /storage\.from\(\s*['"]workshop['"]\s*\)/.test(text) ||
      (f !== 'src/lib/workshopStorage.ts' && /storage\.from\(\s*WORKSHOP_BUCKET\s*\)/.test(text)) ||
      /storage\.from\(\s*WORKSHOP_BUCKET\s*\)\s*\.(upload|getPublicUrl|createSignedUrl)/.test(text));
    assert('R no source uploads to or builds URLs on the Supabase workshop bucket',
      supabaseWorkshop.length === 0, supabaseWorkshop.map(({ f }) => f).join(', '));

    const handoff = read('src/lib/customComposition/durableHandoff.ts');
    assert('R source Workshop upload = sign-upload → signed PUT (regional host) → commit, discard on failure',
      handoff.includes(`'${WORKSHOP_MEDIA_PATHS.signUpload}'`) && handoff.includes(`'${WORKSHOP_MEDIA_PATHS.commit}'`)
      && handoff.includes(`'${WORKSHOP_MEDIA_PATHS.discard}'`) && /WORKSHOP_MEDIA_GCS_HOST/.test(handoff));
    const note = read('docs/decisions/NEW4-4D_workshop-private-gcs.md');
    assert('R production cutover stays release-gated (server deploy with WORKSHOP_GCS_* before migration / client upload)',
      /1\. Deploy NEW4-4D-3 server code with `WORKSHOP_GCS_\*` bound/.test(note) && /2\. Apply this migration/.test(note));
    assert('R payment freeze unchanged', /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true/.test(read('src/lib/publicPaymentFreeze.ts')));
  }

  const groups = [...new Set(results.map((r) => r.group))];
  process.stdout.write('\n');
  for (const g of groups) {
    const rows = results.filter((r) => r.group === g);
    process.stdout.write(`${g}: ${rows.filter((r) => r.pass).length}/${rows.length}\n`);
  }
  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} PASS\n`);
  if (failed.length > 0) process.exit(1);
}

main().catch(() => {
  process.stdout.write('verifier crashed\n');
  process.exit(1);
});
