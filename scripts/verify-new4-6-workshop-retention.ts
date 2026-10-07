/**
 * NEW4-6 — Workshop retention pure-function checks.
 * No remote Supabase / Storage calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectWorkshopPaths,
  isCanonicalWorkshopObjectPath,
  isEligibleCompletedWorkshopOrder,
  isWorkshopOrderPayload,
  retentionJobAuthorized,
  stripWorkshopImageRefs,
  workshopStoragePathFromUrl,
  WORKSHOP_RETENTION_MIN_SECRET_LENGTH,
} from '../src/lib/workshopRetention';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results: { name: string; pass: boolean }[] = [];

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ name, pass: condition });
  const suffix = !condition && detail ? ` — ${detail}` : '';
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${suffix}`);
}

const uid = '11111111-1111-1111-1111-111111111111';
const originalPath = `originals/${uid}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`;
const previewPath = `previews/${uid}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg`;
const publicOriginal = `https://example.supabase.co/storage/v1/object/public/workshop/${originalPath}`;
const signedPreview = `https://example.supabase.co/storage/v1/object/sign/workshop/${previewPath}?token=secret-token`;
const catalogUrl = 'https://example.supabase.co/storage/v1/object/public/products/front.webp';

assert('parses public original path', workshopStoragePathFromUrl(publicOriginal) === originalPath);
assert('parses signed preview without token', workshopStoragePathFromUrl(signedPreview) === previewPath);
assert('parses already-canonical path', workshopStoragePathFromUrl(originalPath) === originalPath);
assert('rejects catalog product URL', workshopStoragePathFromUrl(catalogUrl) === null);
assert('rejects path traversal', isCanonicalWorkshopObjectPath('originals/../products/x') === false);
assert('rejects non-uuid folder', isCanonicalWorkshopObjectPath('originals/not-a-user/file.png') === false);

const orderedItems = [
  {
    product_id: 'workshop-single',
    title: '커스텀 포스터',
    option: 'M',
    quantity: 1,
    price: 49000,
    user_image_url: publicOriginal,
    image: signedPreview,
    front_image: null,
    is_custom: true,
    custom_config: {
      shaderType: '커스텀 제작',
      size: 'M',
      original_image_url: publicOriginal,
      preview_image_url: signedPreview,
      composition: { version: 1, zoom: 1, offsetX: 0, offsetY: 0 },
    },
  },
];

const paths = collectWorkshopPaths(orderedItems).sort();
assert('collects original + preview only', paths.join('|') === [originalPath, previewPath].sort().join('|'));
assert('workshop payload detected', isWorkshopOrderPayload(orderedItems) === true);
assert(
  'catalog payload rejected',
  isWorkshopOrderPayload([{ product_id: 'catalog', image: catalogUrl, quantity: 1, price: 1 }]) === false,
);

const stripped = stripWorkshopImageRefs(orderedItems) as typeof orderedItems;
assert('keeps quantity', stripped[0]?.quantity === 1);
assert('keeps price', stripped[0]?.price === 49000);
assert('keeps option', stripped[0]?.option === 'M');
assert('keeps composition zoom', (stripped[0]?.custom_config.composition as { zoom: number }).zoom === 1);
assert('nulls user_image_url', stripped[0]?.user_image_url === null);
assert('nulls original_image_url', stripped[0]?.custom_config.original_image_url === null);
assert('nulls preview_image_url', stripped[0]?.custom_config.preview_image_url === null);
assert('leaves catalog URL', stripWorkshopImageRefs(catalogUrl) === catalogUrl);

const now = new Date('2026-10-07T00:00:00.000Z');
const eligible = {
  id: 'order-1',
  order_number: 'ORD-1',
  status: 'COMPLETED' as const,
  completed_at: '2026-10-03T00:00:00.000Z',
  image_purged_at: null,
  ordered_items: orderedItems,
};
assert('eligible after 3 days', isEligibleCompletedWorkshopOrder(eligible, now) === true);
assert(
  'ineligible before 3 days',
  isEligibleCompletedWorkshopOrder({ ...eligible, completed_at: '2026-10-05T00:00:00.000Z' }, now) === false,
);
assert(
  'ineligible PAID',
  isEligibleCompletedWorkshopOrder({ ...eligible, status: 'PAID' }, now) === false,
);
assert(
  'ineligible PRODUCTION',
  isEligibleCompletedWorkshopOrder({ ...eligible, status: 'PRODUCTION' }, now) === false,
);
assert(
  'ineligible SHIPPING',
  isEligibleCompletedWorkshopOrder({ ...eligible, status: 'SHIPPING' }, now) === false,
);
assert(
  'ineligible without completed_at',
  isEligibleCompletedWorkshopOrder({ ...eligible, completed_at: null }, now) === false,
);
assert(
  'ineligible after successful purge',
  isEligibleCompletedWorkshopOrder({ ...eligible, image_purged_at: '2026-10-06T00:00:00.000Z' }, now) === false,
);
assert(
  'workshop markers remain after strip',
  isWorkshopOrderPayload(stripped) === true,
);

const secret = 'a'.repeat(WORKSHOP_RETENTION_MIN_SECRET_LENGTH);
assert('rejects missing secret', retentionJobAuthorized('Bearer x', undefined) === false);
assert('rejects short secret', retentionJobAuthorized('Bearer abcd', 'short') === false);
assert('rejects missing header', retentionJobAuthorized(undefined, secret) === false);
assert('rejects spoof header without bearer', retentionJobAuthorized(secret, secret) === false);
assert('accepts bearer secret', retentionJobAuthorized(`Bearer ${secret}`, secret) === true);
assert(
  'rejects wrong secret of same length',
  retentionJobAuthorized(`Bearer ${'b'.repeat(WORKSHOP_RETENTION_MIN_SECRET_LENGTH)}`, secret) === false,
);

const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261007070000_new4_6_workshop_retention.sql'),
  'utf8',
);
assert('migration is additive completed_at', /ADD COLUMN IF NOT EXISTS completed_at timestamptz/.test(migration));
assert('migration is additive image_purged_at', /ADD COLUMN IF NOT EXISTS image_purged_at timestamptz/.test(migration));
assert(
  'migration does not DELETE storage.objects',
  !/^\s*DELETE\s+FROM\s+storage\.objects/im.test(migration),
);
assert(
  'migration does not fabricate completed_at from payment time',
  !/completed_at\s*=\s*[^;]*payment_finalized_at/i.test(migration),
);
assert(
  'migration does not backfill historical COMPLETED',
  !/UPDATE\s+public\.orders/i.test(migration),
);

const new45 = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261006220000_new4_5_consent_ledger.sql'),
  'utf8',
);
const new45a = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261006223000_new4_5a_restrict_consent_rpc.sql'),
  'utf8',
);
assert('NEW4-5 consent migration preserved', new45.includes('record_policy_consent'));
assert('NEW4-5A RPC restriction preserved', new45a.includes('NEW4-5A'));

const policies = fs.readFileSync(path.join(root, 'src/constants/policies.tsx'), 'utf8');
const threeDayCopy =
  /배송완료[^\n<]{0,20}3일/.test(policies) || /3일이\s*지나면\s*순차\s*삭제/.test(policies);
const releaseGuardDoc = fs.existsSync(path.join(root, 'docs/decisions/NEW4-4_privacy-processors.md'))
  ? fs.readFileSync(path.join(root, 'docs/decisions/NEW4-4_privacy-processors.md'), 'utf8')
  : '';
assert(
  'public 3-day Workshop copy is backed by the NEW4-4 release guard',
  !threeDayCopy
    || (/WORKSHOP_RETENTION_JOB_SECRET/.test(releaseGuardDoc)
      && /hourly Workshop retention scheduler/.test(releaseGuardDoc)),
);
assert(
  'no incorrect Workshop retention wording',
  !/72시간|배송사가\s*배송완료|제작\s*직후\s*즉시\s*삭제/.test(policies) && !/completed_at/.test(policies),
);

const freeze = fs.readFileSync(path.join(root, 'src/lib/publicPaymentFreeze.ts'), 'utf8');
assert(
  'payment freeze unchanged',
  /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true/.test(freeze),
);

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
