/**
 * NEW4-4D-9B — shared display legacy-ref routing (A3 consumers): local checks.
 * The shared display controller runs on the resolver core against the real server sign-read
 * handler (D-9 legacy bridge) with a mocked GCS store / DB refs. Synthetic refs only.
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
  WORKSHOP_MEDIA_CACHE_CONTROL,
  WORKSHOP_SIGNED_URL_TTL_SECONDS,
  handleSignRead,
  parseCanonicalWorkshopPath,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopMediaCaller,
  type WorkshopObjectMetadata,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import { WORKSHOP_MEDIA_SIGN_READ_PATH, createWorkshopMediaResolver } from '../src/lib/workshopMediaCore';
import {
  createWorkshopMediaDisplay,
  resolvableWorkshopRefs,
  workshopDisplayRef,
  workshopOrderItemThumbRef,
  type WorkshopDisplayApi,
} from '../src/lib/workshopMediaDisplay';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../src/lib/publicPaymentFreeze';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const results: { group: string; name: string; pass: boolean }[] = [];
let group = '';

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ group, name, pass: condition });
  process.stdout.write(`${condition ? 'PASS' : 'FAIL'}: [${group}] ${name}${!condition && detail ? ` - ${detail}` : ''}\n`);
}
function section(label: string): void {
  group = label;
  process.stdout.write(`\n== ${label} ==\n`);
}

/** SHA-256 of protected WIP at the D-9B baseline (must stay byte-identical). */
const PROTECTED: Record<string, string> = {
  'src/components/OrdersModal.tsx': '6E75C6694582234211CDD1A0B91336D8F0D556406271FA3653BD49F93710B024',
  'src/components/InquiryModal.tsx': '05C2C01B7B312CB1B8CE7626B161D1031A74FB1A04243F16C4AC637887B68CFC',
  'src/components/ProfileEditModal.tsx': '48C34800559913E2CE3111FCD6608682C000E7A2C59A5B481E06201536F9B168',
  'src/components/ProfileOverlay.tsx': '12726DD97F4F42AF9285AA7D9E8AA155D363A822E3D33AA83F0D65E78E3D261C',
  'src/pages/ProfileComplete.tsx': '02B5FC09E53FAA92BB07D9C867DB97BC71395AC7BD632169AE7B526A0A56EF08',
};
const sha = (rel: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').toUpperCase();
const distBefore = git('status', '--porcelain', '--', 'dist');

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
const legacyOf = (p: string, mode = 'public') => `https://${LEGACY_HOST}/storage/v1/object/${mode}/workshop/${p}`;
const legacy = (n: number, uid = UID) => legacyOf(prev(n, uid));
const legacyOrig = (n: number) => legacyOf(orig(n));
const CATALOG = `https://${LEGACY_HOST}/storage/v1/object/public/products/catalog-front.webp`;
const SIGNED_MARKERS = ['X-Goog-Signature', 'X-Goog-Credential', WORKSHOP_GCS_REGIONAL_HOST, 'storage.googleapis.com'];
const hasSigned = (v: unknown) => SIGNED_MARKERS.some((m) => (typeof v === 'string' ? v : JSON.stringify(v ?? null)).includes(m));
const isSignedSrc = (src: string | null) =>
  typeof src === 'string' && src.startsWith(`https://${WORKSHOP_GCS_REGIONAL_HOST}/`) && src.includes('X-Goog-Signature');

const TOKENS: Record<string, WorkshopMediaCaller> = {
  'token-customer': { userId: UID, isAdmin: false },
  'token-admin': { userId: ADMIN, isAdmin: true },
};

type World = {
  t: number;
  session: { userId: string; accessToken: string } | null;
  rows: WorkshopCustomerRows;
  adminOrders: { uid: string; ordered_items: unknown[] }[];
  objects: Map<string, WorkshopObjectMetadata>;
  legacyFallback: boolean;
  headThrows: boolean;
  forceStatus: number | null;
  requests: { refs: string[]; body: string }[];
  signCount: number;
  headCount: number;
};

function makeWorld(): World {
  return {
    t: Date.parse('2026-10-07T00:00:00.000Z'),
    session: { userId: UID, accessToken: 'token-customer' },
    rows: { cart: [], progress: [], orders: [], intents: [] },
    adminOrders: [],
    objects: new Map(),
    legacyFallback: true,
    headThrows: false,
    forceStatus: null,
    requests: [],
    signCount: 0,
    headCount: 0,
  };
}

/** A GCS copy written and verified by the D-9 legacy copy tool. */
function verifiedCopy(world: World, p: string, state: 'verified' | null = 'verified'): void {
  const parsed = parseCanonicalWorkshopPath(p)!;
  world.objects.set(p, {
    path: p,
    sizeBytes: 9,
    contentType: parsed.ext === 'png' ? 'image/png' : 'image/jpeg',
    cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL,
    createdAtMs: world.t,
    legacyCopy: state,
  });
}

function makeApi(world: World): WorkshopDisplayApi {
  const gcs = {
    name: 'gcs',
    async head(p: string) {
      world.headCount += 1;
      if (world.headThrows) throw new Error('synthetic gcs error');
      return world.objects.get(p) ?? null;
    },
    async signRead(p: string) {
      world.signCount += 1;
      return {
        url: `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Expires=${WORKSHOP_SIGNED_URL_TTL_SECONDS}&X-Goog-Signature=s${world.signCount}`,
        expiresAt: new Date(world.t + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      };
    },
  } as unknown as WorkshopGcsObjectStore;
  const references: WorkshopReferenceSource = {
    customerRows: async (uid) => (uid === UID ? world.rows : { cart: [], progress: [], orders: [], intents: [] }),
    adminOrderRows: async (uids) => world.adminOrders.filter((o) => uids.includes(o.uid)),
  };
  const resolver = createWorkshopMediaResolver({
    legacyHosts: [LEGACY_HOST],
    now: () => world.t,
    getSession: async () => world.session,
    fetch: async (url, init) => {
      const body = String(init.body);
      world.requests.push({ refs: (JSON.parse(body) as { refs: string[] }).refs, body });
      if (url !== WORKSHOP_MEDIA_SIGN_READ_PATH) return { ok: false, status: 404, json: async () => ({}) };
      if (world.forceStatus) return { ok: false, status: world.forceStatus, json: async () => ({}) };
      const auth = ((init.headers ?? {}) as Record<string, string>).Authorization ?? '';
      const caller = TOKENS[auth.replace(/^Bearer /, '')];
      if (!caller) return { ok: false, status: 401, json: async () => ({}) };
      const deps = { gcs, references, legacyHosts: [LEGACY_HOST], legacyFallback: world.legacyFallback, now: () => world.t };
      const res = await handleSignRead(deps, caller, JSON.parse(body));
      return { ok: res.status === 200, status: res.status, json: async () => res.body };
    },
  });
  return {
    isCanonical: resolver.isCanonical,
    isLegacy: resolver.isLegacy,
    normalize: resolver.normalize,
    resolve: resolver.resolve,
    retryAfterLoadError: resolver.retryAfterLoadError,
    now: () => world.t,
    setTimer: () => null,
    clearTimer: () => undefined,
  };
}

const sent = (world: World) => world.requests.flatMap((r) => r.refs);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const displaySrc = read('src/lib/workshopMediaDisplay.ts');
const hookSrc = read('src/hooks/useWorkshopMediaDisplay.ts');
const cartSrc = read('src/components/Cart.tsx');
const cartContextSrc = read('src/context/CartContext.tsx');
const adminOrdersPageSrc = read('src/pages/AdminOrders.tsx');
const adminOrdersSrc = read('src/components/admin/adminOrders.ts');
const bestSellersPageSrc = read('src/pages/AdminBestSellers.tsx');
const bestSellersSrc = read('src/components/admin/adminBestSellers.ts');
const ordersModalSrc = read('src/components/OrdersModal.tsx');
const displayCode = strip(displaySrc);
const CONSUMERS: Record<string, string> = {
  'src/components/Cart.tsx': strip(cartSrc),
  'src/pages/AdminOrders.tsx': strip(adminOrdersPageSrc),
  'src/pages/AdminBestSellers.tsx': strip(bestSellersPageSrc),
  'src/components/OrdersModal.tsx': strip(ordersModalSrc),
};

async function resolveOne(world: World, ref: string, mode: 'customer' | 'admin' = 'customer') {
  const display = createWorkshopMediaDisplay(makeApi(world), mode, () => undefined);
  await display.setRefs([ref]);
  return { display, state: display.get(ref) };
}

async function main(): Promise<void> {
  section('A canonical refs call the resolver');
  {
    const world = makeWorld();
    world.rows.cart = [{ custom_image: prev(1) }];
    const { state } = await resolveOne(world, prev(1));
    assert('canonical ref classified as resolve/canonical', workshopDisplayRef(prev(1), makeApi(world)).kind === 'resolve');
    assert('canonical ref sent to sign-read', sent(world).join() === prev(1));
    assert('canonical ref renders signed src', state.status === 'ready' && isSignedSrc(state.src));
  }

  section('B strict legacy refs also call the resolver');
  {
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(2) }];
    const api = makeApi(world);
    const d = workshopDisplayRef(legacy(2), api);
    assert('legacy ref classified as resolve/legacy_supabase', d.kind === 'resolve' && d.source === 'legacy_supabase' && d.ref === legacy(2));
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    const pending = display.setRefs([legacy(2)]);
    assert('legacy ref is loading (no raw src) while resolving', display.get(legacy(2)).status === 'loading' && display.get(legacy(2)).src === null);
    await pending;
    assert('legacy ref sent to sign-read exactly as stored', sent(world).join() === legacy(2));
    for (const mode of ['authenticated', 'sign']) {
      const ref = legacyOf(prev(2), mode) + (mode === 'sign' ? '?token=synthetic' : '');
      assert(`legacy /${mode}/ ref also resolve-routed`, resolvableWorkshopRefs([ref], api).join() === ref);
    }
  }

  section('C client raw-legacy shortcut removed');
  {
    assert('no legacy prefix constant / detector in display module', !/LEGACY_PUBLIC_PREFIX|isLegacyPublicWorkshopUrl|PRODUCTION_SUPABASE_HOST/.test(displaySrc));
    assert("no kind: 'legacy' display branch", !/kind: 'legacy'|kind === 'legacy'/.test(displayCode));
    assert('no storage/v1 URL knowledge in display module', !/storage\/v1/.test(displayCode));
    assert('display never returns its input as src', !/src: (value|trimmed|ref|display\.ref)\b/.test(displayCode));
    assert('no brokenLegacy bypass set', !/brokenLegacy/.test(displayCode));
    assert('only resolver results become src (srcs map written from resolve())', /srcs\.set\(ref, result\.src\)|srcs\.set\(\w+, \w+\.src\)/.test(displayCode));
  }

  section('D legacy ref, verified GCS copy → signed src (store=gcs)');
  {
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(3) }];
    verifiedCopy(world, prev(3));
    const { state } = await resolveOne(world, legacy(3));
    assert('legacy ref renders server-signed GCS src', state.status === 'ready' && isSignedSrc(state.src));
    assert('signed src is for the same canonical path', state.src!.includes(`/${WORKSHOP_GCS_APPROVED_BUCKET}/${prev(3)}?`));
    assert('server bridge consulted (head + sign)', world.headCount === 1 && world.signCount === 1);
    assert('raw legacy URL not rendered', state.src !== legacy(3));
  }

  section('E legacy ref, transition fallback → server-approved src (store=supabase_legacy)');
  {
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(4) }];
    const { state } = await resolveOne(world, legacy(4));
    assert('src is the server-approved legacy URL', state.status === 'ready' && state.src === legacy(4));
    assert('approval came from sign-read (one request)', world.requests.length === 1);
    const unverified = makeWorld();
    unverified.rows.cart = [{ custom_image: legacy(4) }];
    verifiedCopy(unverified, prev(4), null);
    const r2 = await resolveOne(unverified, legacy(4));
    assert('unverified copy is not served; fallback src used', r2.state.src === legacy(4) && unverified.signCount === 0);
  }

  section('F resolver failure → no raw fallback');
  {
    for (const status of [401, 403, 500, 503]) {
      const world = makeWorld();
      world.rows.cart = [{ custom_image: legacy(5) }];
      world.forceStatus = status;
      const { state } = await resolveOne(world, legacy(5));
      assert(`HTTP ${status}: placeholder, raw URL not used`, state.status === 'failed' && state.src === null);
    }
    const signedOut = makeWorld();
    signedOut.session = null;
    const so = await resolveOne(signedOut, legacy(5));
    assert('no session: placeholder, no request', so.state.src === null && signedOut.requests.length === 0);
    const unauthorized = makeWorld();
    const ua = await resolveOne(unauthorized, legacy(5));
    assert('not referenced by caller: placeholder', ua.state.src === null && ua.state.status === 'failed');
  }

  section('G post-cutover (fallback disabled) → unavailable → placeholder');
  {
    const world = makeWorld();
    world.legacyFallback = false;
    world.rows.cart = [{ custom_image: legacy(6) }];
    const { state } = await resolveOne(world, legacy(6));
    assert('no verified copy: placeholder', state.status === 'failed' && state.src === null);
    const copied = makeWorld();
    copied.legacyFallback = false;
    copied.rows.cart = [{ custom_image: legacy(6) }];
    verifiedCopy(copied, prev(6));
    const c = await resolveOne(copied, legacy(6));
    assert('verified copy still renders signed src after cutover', isSignedSrc(c.state.src));
    const broken = makeWorld();
    broken.legacyFallback = false;
    broken.headThrows = true;
    broken.rows.cart = [{ custom_image: legacy(6) }];
    const b = await resolveOne(broken, legacy(6));
    assert('GCS error after cutover: placeholder, no raw URL', b.state.src === null);
  }

  section('H Cart canonical + legacy via resolver');
  {
    const code = CONSUMERS['src/components/Cart.tsx'];
    assert('Cart passes durable custom_image refs to shared hook', /useWorkshopMediaDisplay\(\s*isOpen \? cartItems\.filter\(isCustomCartRow\)\.map\(\(item\) => item\.custom_image\) : \[\],\s*'customer',?\s*\)/.test(code));
    assert('Cart Workshop src only from workshopMedia.get(...).src', (code.match(/workshopMedia\.get\(item\.custom_image\)\.src/g) ?? []).length === 2);
    assert('Cart has no legacy-specific branch', !/isLegacyWorkshopRef|isLegacy\(|storage\/v1\/object\/public\/workshop/.test(code));
    const world = makeWorld();
    world.rows.cart = [{ custom_image: prev(7) }, { custom_image: legacy(8) }];
    const display = createWorkshopMediaDisplay(makeApi(world), 'customer', () => undefined);
    await display.setRefs(resolvableWorkshopRefs([prev(7), legacy(8)], makeApi(world)));
    assert('mixed cart batch: one request with both refs', world.requests.length === 1 && [...world.requests[0].refs].sort().join() === [prev(7), legacy(8)].sort().join(), JSON.stringify(world.requests.map((r) => r.refs.length)));
    assert('both cart rows render resolver output', isSignedSrc(display.get(prev(7)).src) && display.get(legacy(8)).src === legacy(8));
  }

  section('I AdminOrders canonical + legacy via resolver');
  {
    const code = CONSUMERS['src/pages/AdminOrders.tsx'];
    assert("AdminOrders uses shared hook in 'admin' mode", /useWorkshopMediaDisplay\(visibleWorkshopRefs\(orders, selectedOrder\), 'admin'\)/.test(code));
    assert('AdminOrders has no legacy-specific branch', !/isLegacyWorkshopRef|storage\/v1\/object\/public\/workshop/.test(code));
    const world = makeWorld();
    world.session = { userId: ADMIN, accessToken: 'token-admin' };
    const legacyItem = { product_id: null, image: legacy(9), user_image_url: legacy(9) };
    const canonItem = { product_id: null, image: prev(10), custom_config: { preview_image_url: prev(10), original_image_url: orig(10) } };
    world.adminOrders = [{ uid: UID, ordered_items: [legacyItem, canonItem] }];
    verifiedCopy(world, prev(9));
    const api = makeApi(world);
    const refs = [legacyItem, canonItem].map((i) => workshopOrderItemThumbRef(i, api)!);
    const display = createWorkshopMediaDisplay(api, 'admin', () => undefined);
    await display.setRefs(refs);
    assert('admin legacy order item → bridged signed src', isSignedSrc(display.get(legacy(9)).src));
    assert('admin canonical order item → signed src', isSignedSrc(display.get(prev(10)).src));
    assert('mode not sent (server decides privilege)', world.requests.every((r) => !r.body.includes('mode')));
    const other = makeWorld();
    other.session = { userId: ADMIN, accessToken: 'token-admin' };
    const o = await resolveOne(other, legacy(11, OTHER), 'admin');
    assert('admin legacy ref without an order row: placeholder', o.state.src === null);
  }

  section('J AdminBestSellers canonical + legacy via resolver');
  {
    const code = CONSUMERS['src/pages/AdminBestSellers.tsx'];
    assert("BestSellers uses shared hook in 'admin' mode for Workshop items", /useWorkshopMediaDisplay\(\s*displayedItems\.filter\(\(item\) => item\.isWorkshop\)\.map\(\(item\) => item\.image\),\s*'admin',?\s*\)/.test(code));
    assert('BestSellers Workshop image = resolver src', /item\.isWorkshop\s*\?\s*workshopMedia\.get\(item\.image\)\.src\s*:\s*getFullImageUrl\(item\.image\)/.test(code));
    assert('BestSellers data layer keeps durable ref and does not resolve', !/resolveWorkshopMedia|storage\/v1\/object\/public\/workshop/.test(strip(bestSellersSrc)));
    const world = makeWorld();
    world.session = { userId: ADMIN, accessToken: 'token-admin' };
    world.adminOrders = [{ uid: UID, ordered_items: [{ product_id: null, image: legacy(12) }] }];
    const { state } = await resolveOne(world, legacy(12), 'admin');
    assert('best-seller legacy item renders server-approved src', state.src === legacy(12) && world.requests.length === 1);
  }

  section('K OrdersModal canonical + legacy via resolver (no OrdersModal edit)');
  {
    const code = CONSUMERS['src/components/OrdersModal.tsx'];
    assert('OrdersModal Workshop src = workshopMedia.get(workshopRef).src', /isWorkshop\s*\?\s*workshopMedia\.get\(workshopRef\)\.src\s*:/.test(code));
    assert('OrdersModal ref via shared helper', code.includes('workshopOrderItemThumbRef(ji, workshopDisplayApi)'));
    assert('OrdersModal has no legacy-specific branch', !/isLegacyWorkshopRef|storage\/v1\/object\/public\/workshop/.test(code));
    const world = makeWorld();
    const item = { product_id: 'workshop-single', image: legacy(13), user_image_url: legacy(13) };
    world.rows.orders = [{ ordered_items: [item] }];
    verifiedCopy(world, prev(13));
    const api = makeApi(world);
    const ref = workshopOrderItemThumbRef(item, api)!;
    const { state } = await resolveOne(world, ref);
    assert('legacy order item resolves via bridge', ref === legacy(13) && isSignedSrc(state.src));
    const origOnly = { product_id: 'workshop-single', image: legacyOrig(14) };
    assert('legacy original URL never chosen as thumb', workshopOrderItemThumbRef(origOnly, api) === null);
    const mixed = { product_id: 'workshop-single', image: legacyOrig(14), user_image_url: legacy(14) };
    assert('legacy preview preferred over legacy original', workshopOrderItemThumbRef(mixed, api) === legacy(14));
  }

  section('L best-seller download uses resolved src only');
  {
    const code = CONSUMERS['src/pages/AdminBestSellers.tsx'];
    assert('download fetch: no-referrer, credentials omit, no-store', /fetch\(url, \{ referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' \}\)/.test(code));
    assert('download passes imageUrl (resolved src) for Workshop items', /downloadImage\(imageUrl,[^)]*item\.isWorkshop\)/.test(code) || /downloadImage\(\s*imageUrl/.test(code));
    assert('no window.open fallback for Workshop download', /if \(!workshop\) window\.open\(url, '_blank'\)/.test(code));
    assert('download does not read item.image directly for Workshop', !/downloadImage\(item\.image/.test(code));
  }

  section('M catalog unchanged');
  {
    const api = makeApi(makeWorld());
    assert('catalog product bucket URL is not a Workshop ref', workshopDisplayRef(CATALOG, api).kind === 'none');
    assert('catalog URL never sent to resolver', resolvableWorkshopRefs([CATALOG], api).length === 0);
    assert('Cart catalog branch unchanged', (CONSUMERS['src/components/Cart.tsx'].match(/: \(item\.product\?\.front_image \|\| item\.product\?\.image \|\| ''\)\);/g) ?? []).length === 2);
    assert('OrdersModal catalog branch unchanged', CONSUMERS['src/components/OrdersModal.tsx'].includes(': getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop);'));
  }

  section('N durable refs not rewritten');
  {
    const world = makeWorld();
    const item = { product_id: 'workshop-single', image: legacy(15), user_image_url: legacy(15) };
    world.rows.orders = [{ ordered_items: [item] }];
    verifiedCopy(world, prev(15));
    const snapshot = JSON.stringify(item);
    const { display } = await resolveOne(world, legacy(15));
    assert('order item unchanged after bridged resolve', JSON.stringify(item) === snapshot && !hasSigned(item));
    assert('display keyed by durable legacy ref', isSignedSrc(display.get(legacy(15)).src) && display.get(prev(15)).src === null);
    assert('rows unchanged (no DB rewrite)', JSON.stringify(world.rows.orders) === JSON.stringify([{ ordered_items: [item] }]));
    assert('CartContext still persists durable refs only', /hasOnlyDurableWorkshopRefs\(/.test(cartContextSrc));
    assert('no DB access in display module / hook', !/lib\/supabase|supabase\.|\.from\(|\.update\(|\.insert\(|\.upsert\(|\.rpc\(/.test(strip(displaySrc + hookSrc)));
  }

  section('O signed URLs not persisted / logged');
  {
    assert('no console output contains signed markers', !consoleLines.some(hasSigned));
    assert('no storage API touched during run', storageAccess.length === 0, storageAccess.join(','));
    assert('display / hook: no console, storage, analytics, navigation', !/console\.|localStorage|sessionStorage|indexedDB|track\(|window\.open|location\./.test(strip(displaySrc + hookSrc)));
  }

  section('P no-referrer on Workshop images');
  {
    assert('Cart: both Workshop <img> no-referrer', (CONSUMERS['src/components/Cart.tsx'].match(/referrerPolicy="no-referrer"/g) ?? []).length >= 2);
    assert('AdminOrders: Workshop <img> no-referrer', /referrerPolicy="no-referrer"/.test(CONSUMERS['src/pages/AdminOrders.tsx']));
    assert('AdminBestSellers: Workshop <img> no-referrer', /referrerPolicy=\{item\.isWorkshop \? 'no-referrer' : undefined\}|referrerPolicy="no-referrer"/.test(CONSUMERS['src/pages/AdminBestSellers.tsx']));
    assert('OrdersModal: Workshop <img> no-referrer', /referrerPolicy="no-referrer"/.test(CONSUMERS['src/components/OrdersModal.tsx']));
    assert('no crossOrigin on Workshop images', Object.values(CONSUMERS).every((c) => !/crossOrigin/.test(c)));
  }

  section('Q same retry policy for legacy and canonical (one retry)');
  {
    for (const [label, ref, copy] of [
      ['canonical', prev(16), false],
      ['legacy bridged', legacy(17), true],
    ] as const) {
      const world = makeWorld();
      world.rows.cart = [{ custom_image: ref }];
      if (copy) verifiedCopy(world, prev(17));
      const { display } = await resolveOne(world, ref);
      const first = display.get(ref).src!;
      await display.onLoadError(ref, first);
      const second = display.get(ref).src;
      await display.onLoadError(ref, second!);
      assert(`${label}: one re-sign then placeholder`, isSignedSrc(first) && isSignedSrc(second) && second !== first && display.get(ref).src === null && world.signCount === 2);
      await display.onLoadError(ref, first);
      assert(`${label}: no further sign after placeholder`, world.signCount === 2);
    }
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(18) }];
    const { display } = await resolveOne(world, legacy(18));
    const before = world.requests.length;
    await display.onLoadError(legacy(18), legacy(18));
    assert('supabase_legacy load error: placeholder, no re-sign, no raw retry', display.get(legacy(18)).src === null && world.requests.length === before);
  }

  section('R invalid / external refs rejected');
  {
    const world = makeWorld();
    const api = makeApi(world);
    const rejects: [string, string][] = [
      ['external host', `https://evil.example/storage/v1/object/public/workshop/${prev(19)}`],
      ['unknown Supabase project', `https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/workshop/${prev(19)}`],
      ['product bucket', CATALOG],
      ['raw GCS signed URL', `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${prev(19)}?X-Goog-Signature=x`],
      ['blob:', 'blob:https://metalora.example/abc'],
      ['data:', 'data:image/png;base64,AAAA'],
      ['malformed legacy path', legacyOf(`previews/${UID}/not-a-uuid.jpg`)],
      ['pre-UUID legacy name', legacyOf(`${UID}/1700000000000.png`)],
      ['http legacy', legacy(19).replace('https://', 'http://')],
      ['traversal', legacyOf(`previews/${UID}/../${objectId(19)}.jpg`)],
    ];
    for (const [label, value] of rejects) {
      assert(`${label}: not resolvable, placeholder`, workshopDisplayRef(value, api).kind === 'none' && resolvableWorkshopRefs([value], api).length === 0);
    }
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await display.setRefs(resolvableWorkshopRefs(rejects.map(([, v]) => v), api));
    assert('rejected refs never reach sign-read', world.requests.length === 0);
    assert('rejected refs render no src', rejects.every(([, v]) => display.get(v).src === null));
  }

  section('S payment freeze');
  assert('PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 is true', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);

  section('T OrdersModal seven WIP hunks preserved');
  {
    const diff = git('diff', 'HEAD', '--', 'src/components/OrdersModal.tsx');
    const added = diff.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
    const wip: [string, RegExp][] = [
      ['1 cn / zClass imports', /\+import \{ cn \} from '\.\.\/lib\/cn';\n\+import \{ zClass \} from '\.\.\/constants\/overlays';/],
      ['2 loadError state', /\+\s+const \[loadError, setLoadError\] = useState\(false\);/],
      ['3 Escape effect', /\+\s+if \(event\.key !== 'Escape'\) return;/],
      ['4 setLoadError in fetchOrders', /\+\s+setLoadError\(false\);[\s\S]*\+\s+setLoadError\(true\);/],
      ['5 dialog / backdrop', /\+\s+role="dialog"[\s\S]*\+\s+aria-modal="true"[\s\S]*zClass\('sheet'\)[\s\S]*\+\s+<button/],
      ['6 panel / header / back button / id', /max-w-lg[\s\S]*\+\s+aria-label=[\s\S]*focus-ring[\s\S]*id="orders-title"/],
      ['7 retry UI', /\+\s+\) : loadError && orders\.length === 0 \? \(/],
    ];
    for (const [name, re] of wip) assert(`WIP ${name} still uncommitted`, re.test(added));
    assert('OrdersModal not staged', git('diff', '--cached', '--name-only', '--', 'src/components/OrdersModal.tsx').trim() === '');
  }

  section('U protected files byte-identical');
  for (const [rel, hash] of Object.entries(PROTECTED)) assert(`${rel} byte-identical to D-9B baseline`, sha(rel) === hash);

  section('V hook / controller wiring (single shared cache)');
  {
    assert('hook collects refs with resolvableWorkshopRefs', /resolvableWorkshopRefs\(values, workshopDisplayApi\)/.test(hookSrc) && !/canonicalWorkshopRefs/.test(hookSrc));
    assert('hook API binds shared resolver incl. normalize', /normalize: normalizeWorkshopMediaRef/.test(hookSrc) && /resolve: resolveWorkshopMedia/.test(hookSrc) && /retryAfterLoadError: retryWorkshopMediaAfterLoadError/.test(hookSrc));
    assert('no new resolver / cache instance', !/createWorkshopMediaResolver|new Map<string, \{/.test(strip(hookSrc)) && /from '\.\.\/lib\/workshopMedia'/.test(hookSrc));
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(20) }];
    const api = makeApi(world);
    const a = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    const b = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await a.setRefs([legacy(20)]);
    await b.setRefs([legacy(20)]);
    assert('legacy ref shares resolver cache across views (one request)', world.requests.length === 1);
  }

  section('W consumers have no own resolver / legacy parsing');
  for (const [file, code] of Object.entries(CONSUMERS)) {
    assert(`${file}: no own resolver`, !/createWorkshopMediaResolver|resolveWorkshopMedia\(/.test(code));
  }
  assert('admin data layers use shared thumb helper', /workshopOrderItemThumbRef\(item, workshopDisplayApi\)/.test(adminOrdersSrc));

  section('X server decides store per ref');
  {
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(21) }, { custom_image: legacy(22) }];
    verifiedCopy(world, prev(21));
    const display = createWorkshopMediaDisplay(makeApi(world), 'customer', () => undefined);
    await display.setRefs([legacy(21), legacy(22)]);
    assert('copied legacy → gcs, uncopied legacy → fallback, same batch', isSignedSrc(display.get(legacy(21)).src) && display.get(legacy(22)).src === legacy(22) && world.requests.length === 1);
  }

  section('Y cutover toggle changes outcome without client change');
  {
    const world = makeWorld();
    world.rows.cart = [{ custom_image: legacy(23) }];
    const on = await resolveOne(world, legacy(23));
    const off = makeWorld();
    off.legacyFallback = false;
    off.rows.cart = [{ custom_image: legacy(23) }];
    const after = await resolveOne(off, legacy(23));
    assert('fallback on: server-approved legacy src; off: placeholder', on.state.src === legacy(23) && after.state.src === null);
  }

  section('Z no remote access');
  assert('no real network', realNetwork.length === 0, realNetwork.join(','));
  assert('dist unchanged during run', git('status', '--porcelain', '--', 'dist') === distBefore);

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\nNEW4-4D-9B LEGACY A3: ${results.length - failed.length}/${results.length} PASS\n`);
  if (failed.length) {
    for (const f of failed) process.stdout.write(`  FAIL [${f.group}] ${f.name}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stdout.write(`VERIFIER ERROR: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
});
