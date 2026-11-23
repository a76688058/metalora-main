/**
 * Commerce integrity checks for cart identity, submission capture, and payment baseline.
 * No network, no Supabase, no payment API, no production orders.
 */
import { readFileSync } from 'node:fs';
import { buildCompleteV1Config } from '../src/lib/customComposition/durableHandoff';
import {
  customCartRetryAction,
  customCheckoutCartItemId,
  freezeCustomSubmission,
  persistedCustomCartItemId,
} from '../src/lib/customComposition/submitCustomCart';
import type { CustomComposition, CustomSource } from '../src/lib/customComposition/types';

let failed = 0;
function assert(name: string, condition: boolean): void {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${name}`);
    return;
  }
  console.log(`PASS ${name}`);
}

const source: CustomSource = { url: 'blob:customer', width: 1200, height: 800 };
const portrait: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1.25, offsetX: 0.12, offsetY: -0.08 };
const liveSource = { ...source };
const liveComposition = { ...portrait };
const frozen = freezeCustomSubmission(liveSource, liveComposition);
liveSource.width = 10;
liveComposition.zoom = 4;
liveComposition.offsetX = 0.9;
const saved = buildCompleteV1Config(frozen.source, frozen.composition);
const savedComposition = saved.composition as CustomComposition;

assert('frozen source ignores a later editor resize', frozen.source.width === 1200 && frozen.source.height === 800);
assert('frozen crop ignores a later editor change', frozen.composition.zoom === 1.25 && frozen.composition.offsetX === 0.12);
assert('saved config uses the frozen crop', savedComposition.zoom === 1.25 && savedComposition.offsetX === 0.12 && savedComposition.offsetY === -0.08);
assert('saved config keeps source pixels', saved.source_width === 1200 && saved.source_height === 800);
assert('saved config keeps version and orientation', savedComposition.version === 1 && savedComposition.orientation === 'portrait');
assert('client config still has no price', saved.price == null && saved.price_snapshot == null);

const sharedImage = 'previews/buyer/same.jpg';
const first = { id: 'row-a', product_id: 'workshop-single', custom_image: sharedImage };
const second = { id: 'row-b', product_id: 'workshop-single', custom_image: sharedImage };
assert('custom checkout id is the cart row', customCheckoutCartItemId(first) === 'row-a');
assert('same image with another row keeps a different id', customCheckoutCartItemId(second) === 'row-b' && customCheckoutCartItemId(first) !== customCheckoutCartItemId(second));
assert('standard cart item sends no custom id', customCheckoutCartItemId({ id: 'catalog-1', product_id: 'poster-1' }) === null);
assert('blank custom id is not invented', customCheckoutCartItemId({ id: '  ', product_id: 'workshop-single' }) === null);
assert('a saved id refreshes', customCartRetryAction('row-a') === 'refresh');
assert('no saved id creates', customCartRetryAction(null) === 'create');
assert('rpc id is read from the row', persistedCustomCartItemId([{ id: 'row-a' }]) === 'row-a');
assert('image url is not a cart id', persistedCustomCartItemId([{ custom_image: sharedImage }]) === null);

const root = new URL('..', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const cart = read('src/components/Cart.tsx');
const workshop = read('src/components/Workshop/WorkshopView.tsx');
const server = read('server.ts');
const guard = read('src/lib/paymentEnvGuard.ts');
const freeze = read('src/lib/publicPaymentFreeze.ts');
const admin = read('src/components/admin/AdminCustomProduction.tsx');
const cancellation = read('src/lib/paymentCaptureCancellation.ts');

assert('prepare payload can carry cart_item_id', cart.includes('customCheckoutCartItemId') && cart.includes('cart_item_id: cartItemId'));
assert('card request stays requestPayment(\'카드\')', cart.includes("requestPayment('카드'"));
assert('workshop captures one submission snapshot', workshop.includes('captureSubmissionSnapshot'));
assert('workshop remembers a saved row when refresh fails', workshop.includes('CART_REFRESH_FAILED_MESSAGE') && workshop.includes('persistedCartReceiptRef'));
assert('server still matches cart_item_id before the image', server.indexOf('item?.cart_item_id') < server.indexOf('customRowImageUrls(row)'));
assert('server still stamps canonical millimetres', server.includes('canonicalOutputMillimeters(orientation)') && !server.includes('src.output_width_mm'));
assert('server still checks accepted checkout methods', server.includes('isAcceptedTossCheckoutMethod(verifiedPayment.method)'));
assert('accepted methods remain card and easy pay', guard.includes('["카드", "CARD", "간편결제", "EASY_PAY"]'));
assert('payment freeze stays false', /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = false/.test(freeze));
assert('cancellation module is still present', cancellation.includes('runCaptureCancel'));
assert('admin shows only stored dimensions', admin.includes('저장된 치수가 없습니다.') && admin.includes('composition.widthMm'));
assert('admin shows stored unit price and source pixels', admin.includes('개당 구매가') && admin.includes('원본 픽셀') && admin.includes('readStoredPurchasedUnitPrice') && admin.includes('readStoredSourcePixels'));

if (failed > 0) {
  console.error(`custom commerce integrity failures: ${failed}`);
  process.exit(1);
}
console.log('CUSTOM_COMMERCE_INTEGRITY=PASS');
