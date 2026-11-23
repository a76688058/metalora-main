/**
 * Contract checks for purchased custom composition snapshots and admin media access.
 * No network, no Supabase, no production orders.
 */
import { readFileSync } from 'node:fs';
import {
  mapAdminOrderItem,
  readStoredPurchasedUnitPrice,
  readStoredSourcePixels,
  storedCustomLineAmount,
} from '../src/components/admin/adminOrderMapping';
import { imageSizeInFrame } from '../src/lib/customComposition/math';
import {
  canonicalOutputMillimeters,
  readPurchasedComposition,
} from '../src/lib/customComposition/productionSnapshot';
import type { CustomComposition, CustomSource } from '../src/lib/customComposition/types';
import type { WorkshopDisplayApi } from '../src/lib/workshopMediaDisplay';
import {
  buildAdminReferenceIndex,
  buildCustomerReferenceIndex,
  handleSignRead,
  parseWorkshopRef,
  type WorkshopCustomerRows,
  type WorkshopMediaDeps,
} from '../src/lib/workshopStorage';

let failed = 0;
function assert(name: string, condition: boolean): void {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${name}`);
    return;
  }
  console.log(`PASS ${name}`);
}

const source: CustomSource = { url: 'fixture', width: 960, height: 640 };
const portrait: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1.35, offsetX: 0.22, offsetY: -0.12 };
const shifted: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1.85, offsetX: -0.28, offsetY: 0.2 };
const landscape: CustomComposition = { version: 1, orientation: 'landscape', zoom: 1.55, offsetX: -0.2, offsetY: 0.14 };

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const buyer = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const original = `originals/${buyer}/${buyer}.jpg`;
const previewA = `previews/${buyer}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`;
const previewB = `previews/${buyer}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg`;

function config(
  composition: CustomComposition,
  preview: string,
  millimeters: { width: number; height: number } | null = composition.orientation === 'landscape'
    ? { width: 283, height: 200 }
    : { width: 200, height: 283 },
) {
  return {
    size: 'M',
    orientation: composition.orientation,
    composition,
    source_width: source.width,
    source_height: source.height,
    ...(millimeters
      ? { output_width_mm: millimeters.width, output_height_mm: millimeters.height }
      : {}),
    price: 1,
    preview_image_url: preview,
    original_image_url: original,
  };
}

const portraitRead = readPurchasedComposition(config(portrait, previewA), 'portrait');
const landscapeRead = readPurchasedComposition(config(landscape, previewB), 'landscape');
const shiftedRead = readPurchasedComposition(config(shifted, previewB), 'portrait');
const storedOdd = readPurchasedComposition(config(portrait, previewA, { width: 999, height: 1 }), 'portrait');
const missingMm = readPurchasedComposition(config(portrait, previewA, null), 'portrait');
assert('portrait millimetres are the stored values', portraitRead.status === 'ready' && portraitRead.widthMm === 200 && portraitRead.heightMm === 283);
assert('landscape millimetres are the stored values', landscapeRead.status === 'ready' && landscapeRead.widthMm === 283 && landscapeRead.heightMm === 200);
assert('stored non-canonical millimetres are not rewritten', storedOdd.status === 'ready' && storedOdd.widthMm === 999 && storedOdd.heightMm === 1);
assert('missing historical millimetres stay missing', missingMm.status === 'ready' && missingMm.widthMm === null && missingMm.heightMm === null && canonicalOutputMillimeters('portrait')?.width === 200);
assert('zoom and offsets survive', portraitRead.status === 'ready' && portraitRead.zoom === 1.35 && portraitRead.offsetX === 0.22 && portraitRead.offsetY === -0.12);
assert('two compositions stay distinct', shiftedRead.status === 'ready' && portraitRead.status === 'ready' && shiftedRead.offsetX !== portraitRead.offsetX && shiftedRead.previewRef === previewB);
assert('mismatched orientation is incomplete', readPurchasedComposition(config(portrait, previewA), 'landscape').status === 'incomplete');
assert('legacy item without composition is incomplete', readPurchasedComposition({ shaderType: '커스텀 제작', preview_image_url: previewA }, 'portrait').status === 'incomplete');

const placed = imageSizeInFrame(source, portrait);
const placedShift = imageSizeInFrame(source, shifted);
const placedWide = imageSizeInFrame(source, landscape);
assert('zoom above cover enlarges the image', placedShift.width > placed.width);
assert('horizontal offset changes the draw center', portrait.offsetX !== shifted.offsetX);
assert('vertical offset is retained', shifted.offsetY !== portrait.offsetY && shiftedRead.status === 'ready' && shiftedRead.offsetY === 0.2);
assert('portrait and landscape frames differ', placedWide.width !== placed.width && landscape.orientation !== portrait.orientation);

const thumbApi: WorkshopDisplayApi = {
  isCanonical: (value) => parseWorkshopRef(value)?.source === 'canonical',
  isLegacy: (value) => parseWorkshopRef(value)?.source === 'legacy_supabase',
  normalize: (value) => parseWorkshopRef(value)?.path ?? null,
  resolve: async () => new Map(),
  retryAfterLoadError: async () => null,
};

const mapped = mapAdminOrderItem({
  product_id: 'workshop-single',
  id: 'line-1',
  title: '커스텀 포스터',
  image: original,
  user_image_url: original,
  custom_config: config(portrait, previewA),
  orientation: 'portrait',
}, thumbApi);
assert('admin final ref is the composed preview', mapped.imageUrl === previewA);
assert('admin keeps the original separately', mapped.originalRef === original && mapped.originalRef !== mapped.imageUrl);
assert('admin keeps the line id', mapped.lineId === 'line-1');

const emptyRows: WorkshopCustomerRows = { cart: [], progress: [], orders: [], intents: [] };
const orderRows = {
  orders: [{
    ordered_items: [{
      product_id: 'workshop-single',
      image: previewA,
      user_image_url: previewA,
      custom_config: config(portrait, previewA),
    }],
  }],
  cart: [],
  progress: [],
  intents: [],
};
const customerIndex = buildCustomerReferenceIndex(orderRows, {});
assert('customer order index omits the original', !customerIndex.originals.has(original));
assert('customer order index keeps the preview', customerIndex.previews.has(previewA));
const adminIndex = buildAdminReferenceIndex(orderRows.orders, {});
assert('admin index includes the original', adminIndex.has(original));
assert('admin index includes the preview', adminIndex.has(previewA));
assert('empty customer rows authorize nothing', buildCustomerReferenceIndex(emptyRows, {}).originals.size === 0);

const deps = {
  gcs: {
    signRead: async (path: string) => ({ url: `https://signed.invalid/${path}`, expiresAt: 1 }),
  },
  references: {
    customerRows: async () => orderRows,
    adminOrderRows: async () => orderRows.orders,
  },
  legacyHosts: [],
} as unknown as WorkshopMediaDeps;

const customerRead = await handleSignRead(deps, { userId: buyer, isAdmin: false }, { refs: [original] });
const strangerRead = await handleSignRead(deps, { userId: owner, isAdmin: false }, { refs: [previewA] });
const adminRead = await handleSignRead(deps, { userId: owner, isAdmin: true }, { refs: [original, previewA] });
const customerItems = customerRead.body.items as { ok: boolean; reason?: string }[] | undefined;
const strangerItems = strangerRead.body.items as { ok: boolean; reason?: string }[] | undefined;
const adminItems = adminRead.body.items as { ok: boolean; src?: string }[] | undefined;
assert('buyer cannot sign the purchased original', customerItems?.[0]?.ok === false && customerItems[0]?.reason === 'not_authorized');
assert('another customer cannot sign the preview', strangerItems?.[0]?.ok === false && strangerItems[0]?.reason === 'not_authorized');
assert('admin can sign original and final', adminItems?.length === 2 && adminItems.every((item) => item.ok && typeof item.src === 'string' && item.src.startsWith('https://signed.invalid/')));

const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
assert('order snapshot derives millimetres', server.includes('canonicalOutputMillimeters(orientation)'));
assert('order snapshot does not copy client millimetres', !server.includes('src.output_width_mm') && !server.includes('src.output_height_mm'));
assert('order snapshot price is the server unit', /price: unitPrice,/.test(server));

const priced = {
  ...config(portrait, previewA),
  price: 59000,
  price_snapshot: 59000,
  source_width: 3000,
  source_height: 4000,
};
assert('stored unit price is the order line price', readStoredPurchasedUnitPrice(59000, priced) === 59000);
assert('zero unit price stays zero', readStoredPurchasedUnitPrice(0, { price: 59000, price_snapshot: 59000 }) === 0);
assert('absent line price uses a matching stored pair', readStoredPurchasedUnitPrice(null, priced) === 59000);
assert('disagreeing stored prices stay missing', readStoredPurchasedUnitPrice(null, { price: 1000, price_snapshot: 59000 }) === null);
assert('malformed line price is not replaced', readStoredPurchasedUnitPrice(59.5, priced) === null);
assert('negative line price is missing', readStoredPurchasedUnitPrice(-1, priced) === null);
assert('source pixels are the stored pair', readStoredSourcePixels(priced)?.width === 3000 && readStoredSourcePixels(priced)?.height === 4000);
assert('one missing source axis stays missing', readStoredSourcePixels({ source_width: 3000 }) === null);
assert('legacy config without pixels stays missing', readStoredSourcePixels({ shaderType: '커스텀 제작' }) === null);
assert('quantity above one keeps unit and line apart', storedCustomLineAmount(59000, 2) === 118000 && storedCustomLineAmount(59000, 2) !== 59000);
assert('missing quantity does not invent a line amount', storedCustomLineAmount(59000, 0) === null);
assert('zero unit still multiplies when quantity is stored', storedCustomLineAmount(0, 2) === 0);

const secondArtwork = mapAdminOrderItem({
  product_id: 'workshop-single',
  id: 'line-2',
  quantity: 3,
  price: 10000,
  orientation: 'landscape',
  custom_config: config(landscape, previewB, { width: 283, height: 200 }),
}, thumbApi);
assert('each custom line keeps its own unit price', secondArtwork.price === 10000 && mapped.price == null);
const secondRead = readPurchasedComposition(secondArtwork.customConfig, 'landscape');
assert('second line keeps its own stored millimetres', secondRead.status === 'ready' && secondRead.widthMm === 283);
const catalog = mapAdminOrderItem({
  product_id: 'poster-1',
  title: '작품',
  quantity: 1,
  price: 42000,
  image: '/catalog/poster.jpg',
}, thumbApi);
assert('catalog order stays outside custom inspection data', catalog.isWorkshop === false && catalog.customConfig === null);

if (failed > 0) {
  console.error(`CUSTOM_ORDER_SNAPSHOT=FAIL ${failed}`);
  process.exit(1);
}
console.log('CUSTOM_ORDER_SNAPSHOT=PASS');
