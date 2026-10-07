/**
 * NEW4-4D-7B — OrdersModal Workshop media (protected-WIP handoff): local checks.
 * Static checks on OrdersModal plus the shared display controller run on the resolver core
 * against the real server sign-read handler with mocked signer / DB refs. Synthetic refs only.
 * No GCS / Supabase / network calls, no writes.
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
} from '../src/lib/workshopStorage';
import { WORKSHOP_MEDIA_SIGN_READ_PATH, createWorkshopMediaResolver } from '../src/lib/workshopMediaCore';
import {
  createWorkshopMediaDisplay,
  workshopOrderItemThumbRef,
  type WorkshopDisplayApi,
} from '../src/lib/workshopMediaDisplay';
import { getFullImageUrl } from '../src/lib/utils';
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

/** SHA-256 of the other protected WIP files at the D-7B handoff (must stay byte-identical). */
const OTHER_PROTECTED: Record<string, string> = {
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

const UID = '11111111-1111-4111-8111-111111111111';
const objectId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const prev = (n: number) => `previews/${UID}/${objectId(n)}.jpg`;
const orig = (n: number) => `originals/${UID}/${objectId(n)}.png`;
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const legacy = (n: number) => `https://${LEGACY_HOST}/storage/v1/object/public/workshop/${prev(n)}`;
const SIGNED_MARKERS = ['X-Goog-Signature', 'X-Goog-Credential', WORKSHOP_GCS_REGIONAL_HOST];
const hasSigned = (v: unknown) => SIGNED_MARKERS.some((m) => JSON.stringify(v ?? null).includes(m));
const isSignedSrc = (src: string | null) =>
  typeof src === 'string' && src.startsWith(`https://${WORKSHOP_GCS_REGIONAL_HOST}/`) && src.includes('X-Goog-Signature');

type World = { rows: WorkshopCustomerRows; requests: string[][]; signCount: number; t: number };

function makeApi(world: World): WorkshopDisplayApi {
  const gcs = {
    name: 'gcs',
    async head() {
      return null;
    },
    async signRead(p: string) {
      world.signCount += 1;
      return {
        url: `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Signature=s${world.signCount}`,
        expiresAt: new Date(world.t + WORKSHOP_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      };
    },
  } as unknown as WorkshopGcsObjectStore;
  const deps = {
    gcs,
    legacyHosts: [LEGACY_HOST],
    now: () => world.t,
    references: { customerRows: async () => world.rows, adminOrderRows: async () => [] },
  };
  const caller: WorkshopMediaCaller = { userId: UID, isAdmin: false };
  const resolver = createWorkshopMediaResolver({
    legacyHosts: [LEGACY_HOST],
    now: () => world.t,
    getSession: async () => ({ userId: UID, accessToken: 'token' }),
    fetch: async (url, init) => {
      const body = JSON.parse(String(init.body)) as { refs: string[] };
      world.requests.push(body.refs);
      if (url !== WORKSHOP_MEDIA_SIGN_READ_PATH) return { ok: false, status: 404, json: async () => ({}) };
      const res = await handleSignRead(deps, caller, body);
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

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const modal = read('src/components/OrdersModal.tsx');
const code = strip(modal);
const itemBlock = code.slice(code.indexOf('(order.ordered_items as any[])?.map('), code.indexOf('<div className="flex-1 min-w-0">'));
const workshopImg = itemBlock.match(/\{displayImageUrl && isWorkshop \? \(\s*(<img[\s\S]*?\/>)/)?.[1] ?? '';
const catalogImg = itemBlock.match(/\) : displayImageUrl \? \(\s*(<img[\s\S]*?\/>)/)?.[1] ?? '';

async function main(): Promise<void> {
  section('A/B canonical Workshop');
  {
    assert('Workshop branch resolves through workshopMedia.get(workshopRef).src', /isWorkshop\s*\?\s*workshopMedia\.get\(workshopRef\)\.src\s*:\s*getFullImageUrl\(/.test(itemBlock));
    assert('Workshop ref from shared helper', /const workshopRef = isWorkshop \? workshopOrderItemThumbRef\(ji, workshopDisplayApi\) : null;/.test(itemBlock));
    assert('imports shared D-6 abstraction', /import \{ useWorkshopMediaDisplay, workshopDisplayApi \} from '\.\.\/hooks\/useWorkshopMediaDisplay';/.test(modal) && /import \{ workshopOrderItemThumbRef \} from '\.\.\/lib\/workshopMediaDisplay';/.test(modal));
    assert('no own resolver / cache / TTL', !/createWorkshopMediaResolver|resolveWorkshopMedia|WORKSHOP_MEDIA_SIGNED_TTL|setTimeout\([^)]*resolve/.test(code));
    const world: World = { rows: { cart: [], progress: [], intents: [], orders: [] }, requests: [], signCount: 0, t: Date.parse('2026-10-07T00:00:00Z') };
    const item = { product_id: 'workshop-single', image: prev(1), user_image_url: prev(1), custom_config: { preview_image_url: prev(1), original_image_url: orig(1) } };
    world.rows.orders = [{ ordered_items: [item] }];
    const api = makeApi(world);
    const ref = workshopOrderItemThumbRef(item, api);
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await display.setRefs([ref]);
    assert('canonical preview resolves to signed src', ref === prev(1) && isSignedSrc(display.get(ref).src));
    assert('original never requested for order history', !world.requests.flat().includes(orig(1)));
    assert('getFullImageUrl returns null for canonical refs (not usable as fallback)', getFullImageUrl(prev(1), true) === null);
  }

  section('C legacy Workshop (resolver-mediated, NEW4-4D-9B)');
  {
    const world: World = { rows: { cart: [], progress: [], intents: [], orders: [] }, requests: [], signCount: 0, t: 0 };
    const item = { product_id: 'workshop-single', user_image_url: legacy(2), image: legacy(2) };
    world.rows.orders = [{ ordered_items: [item] }];
    const api = makeApi(world);
    const ref = workshopOrderItemThumbRef(item, api);
    const display = createWorkshopMediaDisplay(api, 'customer', () => undefined);
    await display.setRefs([ref]);
    assert('legacy URL renders the server-approved src (transition fallback)', display.get(ref).src === legacy(2));
    assert('legacy URL sent to sign-read', world.requests.length === 1 && world.requests[0].join() === legacy(2));
  }

  section('D/K catalog unchanged');
  {
    assert('catalog expression unchanged', itemBlock.includes(': getFullImageUrl(ji.user_image_url || ji.front_image, isWorkshop);'));
    assert('catalog <img> unchanged (picsum fallback kept)', catalogImg.includes("onError={(e) => (e.currentTarget.src = 'https://picsum.photos/seed/error/200/200')}") && !catalogImg.includes('referrerPolicy'));
    assert('Workshop classification unchanged', (code.match(/product_id === 'workshop-single'/g) ?? []).length === 2 && !/product_id == null|product_id === ''/.test(code));
    assert('existing <Image> placeholder kept', /\) : <Image className=\{`w-full h-full p-4/.test(itemBlock));
  }

  section('E/F/G transient src, no rewrite, no persistence');
  {
    const world: World = { rows: { cart: [], progress: [], intents: [], orders: [] }, requests: [], signCount: 0, t: 0 };
    const item = { product_id: 'workshop-single', user_image_url: prev(3), image: prev(3) };
    world.rows.orders = [{ ordered_items: [item] }];
    const snapshot = JSON.stringify(item);
    const display = createWorkshopMediaDisplay(makeApi(world), 'customer', () => undefined);
    await display.setRefs([prev(3)]);
    assert('order item unchanged after resolve', JSON.stringify(item) === snapshot && !hasSigned(item));
    assert('src not written into orders state', !/setOrders\([^)]*workshopMedia|\b(ji|order)\.\w+\s*=(?!=)/.test(code));
    assert('no DB write added (orders read only)', !/\.update\(|\.insert\(|\.upsert\(|\.delete\(|\.rpc\(/.test(code));
    assert('no storage / analytics / navigation with src', !/localStorage|sessionStorage|track\(|window\.open/.test(code) && !/navigate\([^)]*displayImageUrl/.test(code));
    assert('no console output of src', !/console\.\w+\([^)]*(displayImageUrl|workshopMedia|workshopRef)/.test(code) && !consoleLines.some(hasSigned));
    assert('no storage touched during run', storageAccess.length === 0);
  }

  section('H/I/J Workshop <img>');
  {
    assert('Workshop <img> has referrerPolicy="no-referrer"', workshopImg.includes('referrerPolicy="no-referrer"'));
    assert('Workshop <img> onError uses shared retry', workshopImg.includes('onError={() => void workshopMedia.onLoadError(workshopRef, displayImageUrl)}'));
    assert('Workshop <img> has no picsum fallback', !workshopImg.includes('picsum'));
    assert('no crossOrigin added', !/crossOrigin/.test(code));
    const world: World = { rows: { cart: [], progress: [], intents: [], orders: [] }, requests: [], signCount: 0, t: 0 };
    world.rows.orders = [{ ordered_items: [{ product_id: 'workshop-single', image: prev(4) }] }];
    const display = createWorkshopMediaDisplay(makeApi(world), 'customer', () => undefined);
    await display.setRefs([prev(4)]);
    const first = display.get(prev(4)).src!;
    await display.onLoadError(prev(4), first);
    const second = display.get(prev(4)).src!;
    await display.onLoadError(prev(4), second);
    assert('one retry, then placeholder (src null)', second !== first && display.get(prev(4)).src === null && world.signCount === 2);
  }

  section('L/M hook placement');
  {
    const hookAt = code.indexOf('const workshopMedia = useWorkshopMediaDisplay(');
    const returnAt = code.indexOf('if (!isOpen) return null;');
    const realtimeAt = code.indexOf('}, [user, isOpen]);');
    assert('hook after realtime effect, before early return', hookAt > realtimeAt && realtimeAt > 0 && hookAt < returnAt);
    const before = code.slice(code.indexOf('export default function OrdersModal'), hookAt);
    const depth = [...before].reduce((d, ch) => d + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);
    assert('hook at component top level (not conditional)', depth === 1);
    assert('closed modal passes no refs', /useWorkshopMediaDisplay\(\s*isOpen\s*\?[\s\S]*?:\s*\[\],\s*'customer',\s*\)/.test(code));
    assert('single hook call', (code.match(/useWorkshopMediaDisplay\(/g) ?? []).length === 1);
  }

  section('N seven WIP hunks still uncommitted');
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
    for (const [name, re] of wip) assert(`WIP ${name} present vs HEAD`, re.test(added));
    const committed = git('show', 'HEAD:src/components/OrdersModal.tsx');
    const headMigrated = committed.includes('useWorkshopMediaDisplay(');
    if (headMigrated) {
      assert('HEAD has no WIP lines', !/loadError|zClass|orders-title|role="dialog"/.test(committed));
      assert('working-tree diff has no Workshop lines (all committed)', !/workshopMedia|workshopRef|workshopOrderItemThumbRef/.test(added));
    } else {
      const staged = git('diff', '--cached', '--', 'src/components/OrdersModal.tsx');
      const stagedAdded = staged.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).join('\n');
      assert('pre-commit: staged OrdersModal diff has no WIP lines', !/loadError|zClass|orders-title|role="dialog"|Escape|max-w-lg/.test(stagedAdded));
    }
  }

  section('O other protected files');
  for (const [rel, hash] of Object.entries(OTHER_PROTECTED)) assert(`${rel} byte-identical`, sha(rel) === hash);

  section('P payment freeze');
  assert('PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 is true', PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 === true);

  section('Q no public Workshop URL reconstruction');
  assert('no public Workshop URL literal', !code.includes('/storage/v1/object/public/workshop'));
  assert('getFullImageUrl only in catalog branch', (code.match(/getFullImageUrl\(/g) ?? []).length === 1);
  assert('no variant helpers', !/getOptimizedImageUrl|deriveVariantUrl/.test(code));

  section('R no remote access');
  assert('no real network', realNetwork.length === 0);
  assert('dist unchanged during run', git('status', '--porcelain', '--', 'dist') === distBefore);

  const failed = results.filter((r) => !r.pass);
  process.stdout.write(`\nNEW4-4D-7B ORDERSMODAL: ${results.length - failed.length}/${results.length} PASS\n`);
  if (failed.length) {
    for (const f of failed) process.stdout.write(`  FAIL [${f.group}] ${f.name}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stdout.write(`VERIFIER ERROR: ${error instanceof Error ? error.message : 'unknown'}\n`);
  process.exitCode = 1;
});
