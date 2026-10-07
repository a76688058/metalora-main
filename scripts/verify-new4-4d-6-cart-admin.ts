/**
 * NEW4-4D-6 — Cart / CartContext / admin Workshop media consumers: local checks.
 * The display controller runs on the shared resolver core against the real server sign-read
 * handler with a mocked GCS signer and mocked DB references. Synthetic refs only.
 * No GCS / Supabase / network calls, no customer data, no writes.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_SIGNED_URL_TTL_SECONDS,
  handleSignRead,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopMediaCaller,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import {
  WORKSHOP_MEDIA_BATCH_MAX,
  WORKSHOP_MEDIA_SIGN_READ_PATH,
  createWorkshopMediaResolver,
} from '../src/lib/workshopMediaCore';
import {
  canonicalWorkshopRefs,
  createWorkshopMediaDisplay,
  hasOnlyDurableWorkshopRefs,
  workshopDisplayRef,
  workshopOrderItemThumbRef,
  type WorkshopDisplayApi,
} from '../src/lib/workshopMediaDisplay';
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

const PROTECTED_WIP = [
  'src/components/InquiryModal.tsx',
  'src/components/OrdersModal.tsx',
  'src/components/ProfileEditModal.tsx',
  'src/components/ProfileOverlay.tsx',
  'src/pages/ProfileComplete.tsx',
];
const hashFile = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
const wipBefore = new Map(PROTECTED_WIP.map((rel) => [rel, hashFile(rel)]));
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const distStatusBefore = git('status', '--porcelain', '--', 'dist');

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

const realNetwork: string[] = [];
globalThis.fetch = (async (input: unknown) => {
  realNetwork.push(String(input));
  throw new Error('network disabled in verifier');
}) as typeof fetch;

// Synthetic identities (not customer data).
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const objectId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const prev = (n: number, uid = UID) => `previews/${uid}/${objectId(n)}.jpg`;
const orig = (n: number, uid = UID) => `originals/${uid}/${objectId(n)}.png`;
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const LEGACY_BASE = `https://${LEGACY_HOST}/storage/v1/object/public/workshop/`;
const legacy = (n: number) => `${LEGACY_BASE}${prev(n)}`;
const CATALOG = `https://${LEGACY_HOST}/storage/v1/object/public/products/catalog-front.webp`;
const SIGNED_MARKERS = ['X-Goog-Signature', 'X-Goog-Credential', WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com'];
const hasSignedMarker = (value: unknown) => {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return SIGNED_MARKERS.some((m) => s.includes(m));
};

const TOKENS: Record<string, WorkshopMediaCaller> = {
  'token-customer': { userId: UID, isAdmin: false },
  'token-admin': { userId: ADMIN, isAdmin: true },
};

type Timer = { fn: () => void; ms: number; cleared: boolean };
type World = {
  clock: { t: number };
  session: { userId: string; accessToken: string } | null;
  customerRows: WorkshopCustomerRows;
  adminOrders: { uid: string; ordered_items: unknown[] }[];
  requests: { refs: string[]; init: RequestInit }[];
  signCount: number;
  forceStatus: number | null;
  timers: Timer[];
};

function makeWorld(): World {
  return {
    clock: { t: Date.parse('2026-10-07T00:00:00.000Z') },
    session: { userId: UID, accessToken: 'token-customer' },
    customerRows: { cart: [], progress: [], orders: [], intents: [] },
    adminOrders: [],
    requests: [],
    signCount: 0,
    forceStatus: null,
    timers: [],
  };
}

function gcsStore(world: World): WorkshopGcsObjectStore {
  return {
    name: 'gcs',
    async signRead(p: string) {
      world.signCount += 1;
      const url = `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Expires=${WORKSHOP_SIGNED_URL_TTL_SECONDS}&X-Goog-Signature=synthetic${world.signCount}`;
      return { url, expiresAt: new Date(world.clock.t + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
    },
  } as unknown as WorkshopGcsObjectStore;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeApi(world: World): WorkshopDisplayApi {
  const references: WorkshopReferenceSource = {
    customerRows: async (uid) =>
      uid === UID ? world.customerRows : { cart: [], progress: [], orders: [], intents: [] },
    adminOrderRows: async (uids) => world.adminOrders.filter((o) => uids.includes(o.uid)),
  };
  const deps = { gcs: gcsStore(world), references, legacyHosts: [LEGACY_HOST], now: () => world.clock.t };
  const resolver = createWorkshopMediaResolver({
    legacyHosts: [LEGACY_HOST],
    now: () => world.clock.t,
    getSession: async () => world.session,
    fetch: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { refs: string[] };
      world.requests.push({ refs: body.refs, init });
      if (url !== WORKSHOP_MEDIA_SIGN_READ_PATH) return jsonResponse(404, {});
      if (world.forceStatus) return jsonResponse(world.forceStatus, {});
      const auth = ((init.headers ?? {}) as Record<string, string>).Authorization ?? '';
      const caller = TOKENS[auth.replace(/^Bearer /, '')];
      if (!caller) return jsonResponse(401, { error: 'unauthorized' });
      const result = await handleSignRead(deps, caller, body);
      return jsonResponse(result.status, result.body);
    },
  });
  return {
    isCanonical: resolver.isCanonical,
    isLegacy: resolver.isLegacy,
    resolve: resolver.resolve,
    retryAfterLoadError: resolver.retryAfterLoadError,
    now: () => world.clock.t,
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      world.timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as Timer).cleared = true;
    },
  };
}

const isSignedSrc = (src: string | null) =>
  typeof src === 'string' && src.startsWith(`https://${WORKSHOP_GCS_REGIONAL_HOST}/`) && src.includes('X-Goog-Signature');
const sentRefs = (world: World) => world.requests.flatMap((r) => r.refs);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const cartSrc = read('src/components/Cart.tsx');
const cartContextSrc = read('src/context/CartContext.tsx');
const displaySrc = read('src/lib/workshopMediaDisplay.ts');
const hookSrc = read('src/hooks/useWorkshopMediaDisplay.ts');
const adminOrdersSrc = read('src/components/admin/adminOrders.ts');
const adminOrdersPageSrc = read('src/pages/AdminOrders.tsx');
const bestSellersSrc = read('src/components/admin/adminBestSellers.ts');
const bestSellersPageSrc = read('src/pages/AdminBestSellers.tsx');
const dashboardSrc = read('src/components/admin/adminDashboard.ts');
const dashboardPageSrc = read('src/pages/AdminDashboard.tsx');
const D6_FILES: Record<string, string> = {
  'src/components/Cart.tsx': cartSrc,
  'src/context/CartContext.tsx': cartContextSrc,
  'src/lib/workshopMediaDisplay.ts': displaySrc,
  'src/hooks/useWorkshopMediaDisplay.ts': hookSrc,
  'src/components/admin/adminOrders.ts': adminOrdersSrc,
  'src/pages/AdminOrders.tsx': adminOrdersPageSrc,
  'src/components/admin/adminBestSellers.ts': bestSellersSrc,
  'src/pages/AdminBestSellers.tsx': bestSellersPageSrc,
};

async function main(): Promise<void> {
  // ---------------------------------------------------------------- A
  section('A cart canonical ref');
  {
    const world = makeWorld();
    world.customerRows.cart = [
      { custom_image: prev(1), custom_config: { preview_image_url: prev(1), original_image_url: orig(1) } },
    ];
    const api = makeApi(world);
    let changes = 0;
    const display = createWorkshopMediaDisplay(api, 'customer', () => (changes += 1));
    assert('loading before resolve', display.get(prev(1)).status === 'failed');
    const pending = display.setRefs([prev(1)]);
    assert('loading while resolving', display.get(prev(1)).status === 'loading' && display.get(prev(1)).src === null);
    await pending;
    const state = display.get(prev(1));
    assert('resolved to signed regional src', state.status === 'ready' && isSignedSrc(state.src));
    assert('one sign-read request with the canonical ref', world.requests.length === 1 && world.requests[0].refs.join() === prev(1));
    assert('preview only (original not requested)', !sentRefs(world).includes(orig(1)));
    assert('change notified', changes >= 1);
    assert('refresh scheduled before expiry', display.hasPendingRefresh() && world.timers.at(-1)!.ms < WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000);
  }

  // ---------------------------------------------------------------- B
  section('B cart legacy URL');
  {
    const world = makeWorld();
    const api = makeApi(world);
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await display.setRefs([legacy(2)]);
    const state = display.get(legacy(2));
    assert('legacy URL renders exactly as stored', state.status === 'ready' && state.src === legacy(2));
    assert('legacy URL not sent to sign-read', world.requests.length === 0);
    const oldName = `${LEGACY_BASE}${UID}/1700000000000.png`;
    assert('pre-UUID legacy public URL renders as stored', display.get(oldName).src === oldName);
    assert('pre-UUID legacy URL is not a trusted ref', api.isLegacy(oldName) === false && !api.isCanonical(oldName));
  }

  // ---------------------------------------------------------------- C
  section('C catalog images unchanged');
  {
    const world = makeWorld();
    const api = makeApi(world);
    assert('catalog URL is not a Workshop display ref', workshopDisplayRef(CATALOG, api).kind === 'none');
    assert('catalog URL never sent to resolver', canonicalWorkshopRefs([CATALOG], api).length === 0);
    assert(
      'Cart catalog branch unchanged',
      (cartSrc.match(/: \(item\.product\?\.front_image \|\| item\.product\?\.image \|\| ''\)\);/g) ?? []).length === 2,
    );
    assert('Cart resolves Workshop rows only', /cartItems\.filter\(isCustomCartRow\)\.map\(\(item\) => item\.custom_image\)/.test(cartSrc));
    assert('Cart resolves only while open', /isOpen \? cartItems\.filter\(isCustomCartRow\)/.test(cartSrc));
  }

  // ---------------------------------------------------------------- D
  section('D CartContext durable persistence');
  {
    const world = makeWorld();
    const resolver = createWorkshopMediaResolver({
      legacyHosts: [LEGACY_HOST],
      getSession: async () => null,
      fetch: async () => jsonResponse(500, {}),
    });
    void world;
    const ok = (img: unknown, cfg?: unknown) => hasOnlyDurableWorkshopRefs(img, cfg, resolver.normalize);
    const signed = `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${prev(1)}?X-Goog-Signature=x`;
    assert('canonical preview accepted', ok(prev(1), { preview_image_url: prev(1), original_image_url: orig(1) }));
    assert('legacy URL accepted unchanged', ok(legacy(2), { preview_image_url: legacy(2) }));
    assert('catalog add (no media) accepted', ok(undefined, undefined) && ok('', null));
    assert('signed GCS URL refused', !ok(signed));
    assert('blob: refused', !ok('blob:https://metalora.art/abc'));
    assert('data: refused', !ok('data:image/jpeg;base64,AAAA'));
    assert('arbitrary external URL refused', !ok('https://evil.example/a.jpg'));
    assert('signed original in custom_config refused', !ok(prev(1), { original_image_url: signed }));
    assert('blob preview in custom_config refused', !ok(prev(1), { preview_image_url: 'blob:x' }));
    const addToCart = strip(cartContextSrc).slice(strip(cartContextSrc).indexOf('const addToCart'));
    assert(
      'addToCart guard runs before any cart_items write',
      addToCart.indexOf('hasOnlyDurableWorkshopRefs(') > -1 &&
        addToCart.indexOf('hasOnlyDurableWorkshopRefs(') < addToCart.indexOf(".from('cart_items')"),
    );
    assert('CartContext never resolves srcs', !/resolveWorkshopMedia|retryWorkshopMediaAfterLoadError/.test(cartContextSrc));
    assert('CartContext stores custom_image as given (no URL building)', !/getFullImageUrl|getOptimizedImageUrl|deriveVariantUrl/.test(cartContextSrc));
  }

  // ---------------------------------------------------------------- E / F
  section('E transient src');
  {
    const world = makeWorld();
    world.customerRows.cart = [{ custom_image: prev(1) }];
    const api = makeApi(world);
    const row = { id: 'row-1', product_id: 'workshop-single', custom_image: prev(1), custom_config: { preview_image_url: prev(1) } };
    const snapshot = JSON.stringify(row);
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await display.setRefs([row.custom_image]);
    assert('src available for render', isSignedSrc(display.get(row.custom_image).src));
    assert('cart row object unchanged (no src written)', JSON.stringify(row) === snapshot && !hasSignedMarker(row));
    display.dispose();
    assert('dispose drops temporary src', display.get(row.custom_image).src === null);
    assert('dispose cancels refresh', !display.hasPendingRefresh() && world.timers.every((t) => t.cleared));
  }

  section('F invalid ref, no fallback');
  {
    const world = makeWorld();
    world.customerRows.cart = [{ custom_image: legacy(5) }];
    const api = makeApi(world);
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    const invalid = [
      `previews/${UID}/not-a-uuid.jpg`,
      `workshop/${prev(1)}`,
      `/${prev(1)}`,
      `${prev(1)}?x=1`,
      'blob:https://metalora.art/abc',
      'data:image/jpeg;base64,AAAA',
      `https://evil.example/storage/v1/object/public/workshop/${prev(1)}`,
      `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${prev(1)}?X-Goog-Signature=x`,
      `${LEGACY_BASE}${prev(1)}?token=x`,
    ];
    await display.setRefs([...invalid, prev(9, OTHER), prev(5)]);
    assert('invalid values never sent', invalid.every((v) => !sentRefs(world).includes(v.trim())));
    assert('invalid values render placeholder (no src)', invalid.every((v) => display.get(v).status === 'failed' && display.get(v).src === null));
    assert('cross-user canonical denied, no src', display.get(prev(9, OTHER)).src === null && display.get(prev(9, OTHER)).status === 'failed');
    assert('canonical whose DB value is legacy: no minted Supabase URL', display.get(prev(5)).src === null);
    assert('getFullImageUrl returns null for canonical-like values', [prev(1), `workshop/${prev(1)}`, `/${prev(1)}`].every((v) => getFullImageUrl(v, true) === null));
  }

  // ---------------------------------------------------------------- G
  section('G no-referrer');
  {
    const world = makeWorld();
    world.customerRows.cart = [{ custom_image: prev(1) }];
    const display = createWorkshopMediaDisplay(makeApi(world), 'customer', () => undefined);
    await display.setRefs([prev(1)]);
    assert('sign-read request uses no-referrer', world.requests.every((r) => r.init.referrerPolicy === 'no-referrer'));
    const cartImgs = cartSrc.match(/<img[\s\S]*?\/>/g) ?? [];
    assert('every Cart <img> has referrerPolicy="no-referrer"', cartImgs.length === 2 && cartImgs.every((t) => t.includes('referrerPolicy="no-referrer"')));
    const ordersWorkshopImg = adminOrdersPageSrc.match(/isWorkshop \? \(\s*<img[\s\S]*?\/>/)?.[0] ?? '';
    assert('AdminOrders Workshop <img> has no-referrer', ordersWorkshopImg.includes('referrerPolicy="no-referrer"'));
    const bestImg = bestSellersPageSrc.match(/<img[\s\S]*?\/>/)?.[0] ?? '';
    assert('AdminBestSellers <img> has no-referrer', bestImg.includes('referrerPolicy="no-referrer"'));
    assert('no crossOrigin added (plain <img>, no canvas)', !Object.values(D6_FILES).some((s) => /crossOrigin/.test(s)));
  }

  // ---------------------------------------------------------------- H
  section('H shared retry (once)');
  {
    const world = makeWorld();
    world.customerRows.cart = [{ custom_image: prev(1) }];
    const api = makeApi(world);
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await display.setRefs([prev(1), legacy(2)]);
    const first = display.get(prev(1)).src!;
    await display.onLoadError(prev(1), first);
    const second = display.get(prev(1)).src;
    assert('first load error re-signs once', isSignedSrc(second) && second !== first && world.signCount === 2);
    await display.onLoadError(prev(1), second!);
    assert('second load error shows placeholder', display.get(prev(1)).src === null && display.get(prev(1)).status === 'failed');
    assert('no further sign after second failure', world.signCount === 2);
    const before = world.requests.length;
    await display.onLoadError(legacy(2), legacy(2));
    assert('legacy load error: placeholder, no sign-read', display.get(legacy(2)).src === null && world.requests.length === before);
    assert('stale failed src ignored', (await display.onLoadError(prev(1), 'https://stale.example/x'), world.signCount === 2));
    assert('Cart / admin use controller retry', [cartSrc, adminOrdersPageSrc, bestSellersPageSrc].every((s) => s.includes('workshopMedia.onLoadError(')));
    assert('controller retry uses shared resolver retry', /api\.retryAfterLoadError\(/.test(displaySrc) && /retryWorkshopMediaAfterLoadError/.test(hookSrc));
  }

  section('H2 refresh before expiry');
  {
    const world = makeWorld();
    world.customerRows.cart = [{ custom_image: prev(1) }];
    const display = createWorkshopMediaDisplay(makeApi(world), 'customer', () => undefined);
    await display.setRefs([prev(1)]);
    const first = display.get(prev(1)).src;
    const timer = world.timers.at(-1)!;
    world.clock.t += timer.ms;
    timer.fn();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const next = display.get(prev(1)).src;
    assert('refreshed src replaces expiring one', isSignedSrc(next) && next !== first);
  }

  // ---------------------------------------------------------------- I
  section('I no duplicate cache');
  {
    const world = makeWorld();
    world.customerRows.cart = [{ custom_image: prev(1) }];
    const api = makeApi(world);
    const a = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    const b = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await a.setRefs([prev(1)]);
    await b.setRefs([prev(1)]);
    assert('second view reuses resolver cache (one request)', world.requests.length === 1);
    assert('same src from shared cache', a.get(prev(1)).src === b.get(prev(1)).src);
    assert('controller stores no resolver results outside memory', !/localStorage|sessionStorage|indexedDB|caches\./.test(displaySrc + hookSrc));
    assert('hook binds the shared resolver (no new resolver instance)', !/createWorkshopMediaResolver/.test(displaySrc + hookSrc) && /from '\.\.\/lib\/workshopMedia'/.test(hookSrc));
  }

  // ---------------------------------------------------------------- J–N admin
  section('J admin canonical');
  const adminItem = (n: number, uid = UID) => ({
    product_id: null,
    title: '나만의 커스텀 포스터',
    quantity: 1,
    price: 1000,
    image: prev(n, uid),
    user_image_url: prev(n, uid),
    custom_config: { preview_image_url: prev(n, uid), original_image_url: orig(n, uid) },
  });
  {
    const world = makeWorld();
    world.session = { userId: ADMIN, accessToken: 'token-admin' };
    world.adminOrders = [{ uid: UID, ordered_items: [adminItem(3)] }];
    const api = makeApi(world);
    const thumb = workshopOrderItemThumbRef(adminItem(3), api);
    assert('order item thumb prefers preview ref', thumb === prev(3));
    const display = createWorkshopMediaDisplay(api, 'admin', () => undefined);
    await display.setRefs([thumb]);
    assert('admin resolves customer order preview', isSignedSrc(display.get(thumb).src));
    assert('mode is not sent (server decides privilege)', world.requests.every((r) => !String(r.init.body).includes('mode')));
    assert('AdminOrders uses admin mode', /useWorkshopMediaDisplay\(visibleWorkshopRefs\(orders, selectedOrder\), 'admin'\)/.test(adminOrdersPageSrc));
    assert('admin data layer keeps durable ref', /imageUrl: isWorkshop \? imagePath \|\| null/.test(adminOrdersSrc) && /workshopOrderItemThumbRef\(item, workshopDisplayApi\)/.test(adminOrdersSrc));
    assert('admin data layer does not resolve', !/resolveWorkshopMedia/.test(adminOrdersSrc + bestSellersSrc));
  }

  section('K admin legacy');
  {
    const world = makeWorld();
    world.session = { userId: ADMIN, accessToken: 'token-admin' };
    const api = makeApi(world);
    const item = { product_id: null, image: legacy(4), user_image_url: legacy(4) };
    const thumb = workshopOrderItemThumbRef(item, api);
    const display = createWorkshopMediaDisplay(api, 'admin', () => undefined);
    await display.setRefs([thumb]);
    assert('legacy order item renders as stored', thumb === legacy(4) && display.get(thumb).src === legacy(4));
    assert('legacy order item: no sign-read', world.requests.length === 0);
    const relative = { product_id: null, image: `${UID}/old.png` };
    assert('relative legacy path: placeholder, no public URL built', display.get(workshopOrderItemThumbRef(relative, api)).src === null);
  }

  section('L admin authorization failure');
  {
    const world = makeWorld();
    world.session = { userId: UID, accessToken: 'token-customer' };
    world.adminOrders = [{ uid: OTHER, ordered_items: [adminItem(6, OTHER)] }];
    const api = makeApi(world);
    const display = createWorkshopMediaDisplay(api, 'admin', () => undefined);
    await display.setRefs([prev(6, OTHER)]);
    assert('non-admin with admin mode is refused (placeholder)', display.get(prev(6, OTHER)).src === null && display.get(prev(6, OTHER)).status === 'failed');
    for (const status of [401, 403, 500]) {
      const w = makeWorld();
      w.session = { userId: ADMIN, accessToken: 'token-admin' };
      w.adminOrders = [{ uid: UID, ordered_items: [adminItem(7)] }];
      w.forceStatus = status;
      const d = createWorkshopMediaDisplay(makeApi(w), 'admin', () => undefined);
      await d.setRefs([prev(7)]);
      assert(`HTTP ${status}: placeholder, no Supabase URL`, d.get(prev(7)).src === null);
    }
    const signedOut = makeWorld();
    signedOut.session = null;
    const d = createWorkshopMediaDisplay(makeApi(signedOut), 'admin', () => undefined);
    await d.setRefs([prev(7)]);
    assert('signed out: placeholder, nothing sent', d.get(prev(7)).src === null && signedOut.requests.length === 0);
    assert('admin placeholder copy unchanged', adminOrdersPageSrc.includes('이미지 없음'));
  }

  section('M admin batching');
  {
    const world = makeWorld();
    world.session = { userId: ADMIN, accessToken: 'token-admin' };
    world.adminOrders = Array.from({ length: 25 }, (_, i) => ({ uid: UID, ordered_items: [adminItem(100 + i)] }));
    const display = createWorkshopMediaDisplay(makeApi(world), 'admin', () => undefined);
    const refs = world.adminOrders.map((o) => workshopOrderItemThumbRef(o.ordered_items[0], makeApi(world)));
    await display.setRefs([...refs, ...refs]);
    const sizes = world.requests.map((r) => r.refs.length).sort((a, b) => b - a);
    assert('25 refs → 2 requests (20 + 5)', sizes.join(',') === '20,5', sizes.join(','));
    assert(`every request ≤ ${WORKSHOP_MEDIA_BATCH_MAX} refs`, world.requests.every((r) => r.refs.length <= WORKSHOP_MEDIA_BATCH_MAX));
    assert('duplicates de-duplicated', new Set(sentRefs(world)).size === sentRefs(world).length);
    assert('all 25 resolved', refs.every((r) => isSignedSrc(display.get(r).src)));
    assert('AdminOrders resolves list + detail in one hook', (adminOrdersPageSrc.match(/useWorkshopMediaDisplay\(/g) ?? []).length === 1);
  }

  section('N originals only where required');
  {
    const world = makeWorld();
    const api = makeApi(world);
    assert('original-only item → no thumb', workshopOrderItemThumbRef({ product_id: null, custom_config: { original_image_url: orig(8) } }, api) === null);
    assert('canonical original in image field skipped', workshopOrderItemThumbRef({ product_id: null, image: orig(8), user_image_url: prev(8) }, api) === prev(8));
    const consumers = adminOrdersSrc + adminOrdersPageSrc + bestSellersSrc + bestSellersPageSrc + cartSrc;
    assert('no A3 display reads original_image_url', !/original_image_url/.test(consumers));
  }

  // ---------------------------------------------------------------- O / P / Q
  section('O best sellers');
  {
    assert('best-seller thumb uses preview-first ref', /if \(isWorkshop\) return workshopOrderItemThumbRef\(item, workshopDisplayApi\);/.test(bestSellersSrc));
    assert('best-seller page resolves Workshop in admin mode', /useWorkshopMediaDisplay\(\s*displayedItems\.filter\(\(item\) => item\.isWorkshop\)\.map\(\(item\) => item\.image\),\s*'admin',\s*\)/.test(bestSellersPageSrc));
    assert('getFullImageUrl only for catalog rows', /item\.isWorkshop\s*\? workshopMedia\.get\(item\.image\)\.src\s*: getFullImageUrl\(item\.image\)/.test(bestSellersPageSrc));
    assert('Workshop download never opens the signed URL', /if \(!workshop\) window\.open\(url, '_blank'\)/.test(bestSellersPageSrc));
    assert('Workshop download: no referrer, no credentials, no-store', /referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store'/.test(bestSellersPageSrc));
  }

  section('P dashboard');
  {
    const dash = dashboardSrc + dashboardPageSrc;
    assert('dashboard renders no Workshop media', !/<img|getFullImageUrl|getOptimizedImageUrl|custom_image|preview_image_url|original_image_url/.test(dash));
  }

  section('Q catalog unchanged (admin)');
  {
    assert('admin catalog image path order unchanged', /: asString\(item\.image\) \|\|\s*asString\(item\.user_image_url\) \|\|\s*asString\(item\.front_image\) \|\|\s*asString\(item\.custom_image\) \|\|\s*asString\(item\.preview_url\)/.test(adminOrdersSrc));
    assert('admin catalog URL via getFullImageUrl', /imagePath \? getFullImageUrl\(imagePath\) : null/.test(adminOrdersSrc));
    assert('catalog <img> in AdminOrders unchanged', adminOrdersPageSrc.includes('<img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />'));
    const diff = git('diff', '--name-only', 'HEAD', '--', 'src/pages/AdminProducts.tsx', 'src/components/admin/adminCatalog.ts', 'src/components/admin/AdminProductForm.tsx');
    assert('admin catalog files untouched', diff.trim() === '');
  }

  // ---------------------------------------------------------------- R
  section('R no public URL builder for canonical refs');
  {
    for (const [file, src] of Object.entries(D6_FILES)) {
      const code = strip(src);
      assert(`${file}: no getFullImageUrl(..., true)`, !/getFullImageUrl\([^)]*,\s*(true|isWorkshop|item\.isWorkshop)\)/.test(code));
      assert(`${file}: no Workshop variant URLs`, !/getOptimizedImageUrl|deriveVariantUrl/.test(code));
      if (file !== 'src/lib/workshopMediaDisplay.ts') {
        assert(`${file}: no public Workshop URL literal`, !code.includes('/storage/v1/object/public/workshop'));
      }
    }
    assert('display module only recognizes the legacy prefix (no string building)', !/`[^`]*\$\{[^}]*\}[^`]*storage\/v1/.test(displaySrc) && !/LEGACY_PUBLIC_PREFIX\s*\+|\+\s*LEGACY_PUBLIC_PREFIX/.test(displaySrc));
  }

  // ---------------------------------------------------------------- S–V
  section('S-V no signed URL persistence / logging');
  {
    assert('no console output contains signed markers', !consoleLines.some(hasSignedMarker));
    assert('no storage API touched during run', storageAccess.length === 0, storageAccess.join(','));
    assert('display module / hook have no console, storage, analytics, navigation', !/console\.|localStorage|sessionStorage|track\(|navigate\(|window\.open|location\./.test(strip(displaySrc + hookSrc)));
    const cartCode = strip(cartSrc);
    const pendingBlock = cartCode.slice(cartCode.indexOf('const prepareItems'), cartCode.indexOf("sessionStorage.setItem('pendingOrder'") + 200);
    assert('checkout payload / pendingOrder built from durable refs only', pendingBlock.length > 200 && !pendingBlock.includes('workshopMedia'));
    assert('checkout payload keeps user_image_url: item.custom_image', /user_image_url: item\.custom_image \|\| null/.test(pendingBlock));
    assert('Cart Workshop src only used for <img> rendering', (cartCode.match(/workshopMedia\.get\(/g) ?? []).length === 2);
    assert('Cart navigation passes the durable row, not src', /navigate\(`\/product\/workshop-single`, \{ state: \{ cartItem: item \} \}\)/.test(cartCode));
    assert('admin pages keep src out of React state setters', !/set[A-Z]\w*\([^)]*workshopMedia\.get/.test(strip(adminOrdersPageSrc + bestSellersPageSrc)));
    assert('no track() call references Workshop media', !/track\([^)]*(workshopMedia|custom_image)/.test(strip(cartSrc + cartContextSrc)));
  }

  // ---------------------------------------------------------------- W–AA
  section('W payment freeze');
  assert('PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 is true', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);
  assert('Cart still gates on the freeze', /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7/.test(cartSrc));

  section('X OrdersModal (migrated in NEW4-4D-7B handoff)');
  const ordersModalStagedClean = () => {
    const staged = git('diff', '--cached', '--', 'src/components/OrdersModal.tsx');
    return !/^[+-].*(loadError|zClass|orders-title|role="dialog")/m.test(staged);
  };
  {
    const ordersModal = read('src/components/OrdersModal.tsx');
    assert('OrdersModal uses the shared D-6 display helpers only', /useWorkshopMediaDisplay\(/.test(ordersModal) && !/createWorkshopMediaResolver|resolveWorkshopMedia\(/.test(ordersModal));
    assert('OrdersModal protected WIP never staged', ordersModalStagedClean());
  }

  section('Y protected WIP unchanged');
  {
    const staged = git('diff', '--cached', '--name-only').split(/\r?\n/);
    for (const rel of PROTECTED_WIP) {
      assert(`${rel} hash unchanged during run`, hashFile(rel) === wipBefore.get(rel));
      if (rel === 'src/components/OrdersModal.tsx') assert(`${rel} WIP not staged`, ordersModalStagedClean());
      else assert(`${rel} not staged`, !staged.includes(rel));
    }
  }

  section('Z dist untouched');
  {
    const after = git('status', '--porcelain', '--', 'dist');
    assert('dist status unchanged during run', after === distStatusBefore);
    assert('dist has no tracked modifications', after.split(/\r?\n/).filter(Boolean).every((l) => l.startsWith('??')));
  }

  section('AA no remote access');
  assert('no real network request', realNetwork.length === 0, realNetwork.join(','));
  assert('D-6 helpers have no Supabase / DB access', !/from '[^']*supabase'|\.from\(|\.rpc\(|\.storage\b/.test(strip(displaySrc + hookSrc)));

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\nNEW4-4D-6 CART / ADMIN: ${results.length - failed.length}/${results.length} PASS\n`);
  if (failed.length) {
    for (const f of failed) process.stdout.write(`  FAIL [${f.group}] ${f.name}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stdout.write(`VERIFIER ERROR: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
});
