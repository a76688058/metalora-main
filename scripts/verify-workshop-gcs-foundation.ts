/**
 * NEW4-4D-2 — Workshop private GCS foundation smoke test.
 *
 * Synthetic data only (`_ops-smoke/<uuid>.jpg`). Never touches `originals/` or `previews/`.
 * Every object request uses the Seoul regional endpoint; the global endpoint is never used.
 * Operator OAuth token comes from `gcloud auth print-access-token` and is never printed.
 *
 * The signed-URL chain (runtime SA -> signBlob -> signer SA -> V4 URL) is NOT exercised here:
 * see docs/decisions/NEW4-4D_workshop-private-gcs.md for the blocker.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PROJECT = 'metalora-auth';
const BUCKET = 'metalora-workshop-apne3';
const REGIONAL_HOST = 'storage.asia-northeast3.rep.googleapis.com';
const REGIONAL = `https://${REGIONAL_HOST}`;
const SIGNER_SA = `workshop-media-signer@${PROJECT}.iam.gserviceaccount.com`;
const RUNTIME_SA = '807497260135-compute@developer.gserviceaccount.com';
const ALLOWED_ORIGIN = 'https://metalora.art';
const CACHE_CONTROL = 'private, no-store';
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const SMOKE_PREFIX = '_ops-smoke/';

const results: { name: string; pass: boolean }[] = [];

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ name, pass: condition });
  const suffix = !condition && detail ? ` — ${detail}` : '';
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${suffix}`);
}

function operatorToken(): string {
  return execSync('gcloud auth print-access-token', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function regionalObjectUrl(name: string): string {
  const url = `${REGIONAL}/${BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`;
  if (new URL(url).host !== REGIONAL_HOST) throw new Error('non-regional host refused');
  return url;
}

async function getJson(url: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

/** Minimal synthetic JPEG-shaped bytes (SOI … EOI). Not a customer image. */
function syntheticJpeg(size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set([0xff, 0xd8, 0xff, 0xe0], 0);
  out.set([0xff, 0xd9], size - 2);
  return out;
}

async function main(): Promise<void> {
  const token = operatorToken();
  assert('operator token obtained (not printed)', token.length > 20);

  // A–E: bucket configuration via the regional JSON API.
  const bucket = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}`, token);
  assert('A. bucket location = ASIA-NORTHEAST3 (region)', bucket.location === 'ASIA-NORTHEAST3' && bucket.locationType === 'region');
  assert('bucket storage class = STANDARD', bucket.storageClass === 'STANDARD');
  assert('B. Public Access Prevention = enforced', bucket.iamConfiguration?.publicAccessPrevention === 'enforced');
  assert('C. Uniform Bucket-Level Access enabled', bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled === true);
  assert('D. soft delete disabled (retentionDurationSeconds = 0)', String(bucket.softDeletePolicy?.retentionDurationSeconds) === '0');
  assert('versioning off', !bucket.versioning?.enabled);
  assert('no retention policy', !bucket.retentionPolicy);
  assert('no default event-based hold', !bucket.defaultEventBasedHold);
  assert('no lifecycle rules', !bucket.lifecycle?.rule?.length);
  assert('no website configuration', !bucket.website);
  const cors = bucket.cors || [];
  assert(
    'CORS = metalora.art only, GET/PUT, 300 s',
    cors.length === 1
      && JSON.stringify(cors[0].origin) === JSON.stringify([ALLOWED_ORIGIN])
      && JSON.stringify([...cors[0].method].sort()) === JSON.stringify(['GET', 'PUT'])
      && cors[0].maxAgeSeconds === 300,
  );

  const backendBuckets = await getJson(
    `https://compute.googleapis.com/compute/v1/projects/${PROJECT}/global/backendBuckets`,
    token,
  );
  const cdnFronted = (backendBuckets.items || []).some((b: any) => b.bucketName === BUCKET);
  assert('E. no Cloud CDN / load-balancer backend bucket for this bucket', !cdnFronted);

  // F–H: IAM.
  const signer = await getJson(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SIGNER_SA}`, token);
  assert('F. signer SA exists', signer.email === SIGNER_SA && !signer.disabled);
  const signerKeys = await getJson(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SIGNER_SA}/keys?keyTypes=USER_MANAGED`,
    token,
  );
  assert('signer SA has no user-managed keys', !(signerKeys.keys || []).length);

  const bucketIam = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}/iam`, token);
  const bindings: { role: string; members: string[] }[] = bucketIam.bindings || [];
  assert(
    'G. bucket-level roles/storage.objectUser for signer SA',
    bindings.some((b) => b.role === 'roles/storage.objectUser' && b.members.includes(`serviceAccount:${SIGNER_SA}`)),
  );
  assert(
    'no allUsers / allAuthenticatedUsers on bucket',
    !bindings.some((b) => b.members.some((m) => m === 'allUsers' || m === 'allAuthenticatedUsers')),
  );

  const saIam = await getJson(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SIGNER_SA}:getIamPolicy`,
    token,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  assert(
    'H. runtime SA -> signer SA roles/iam.serviceAccountTokenCreator',
    (saIam.bindings || []).some(
      (b: any) => b.role === 'roles/iam.serviceAccountTokenCreator'
        && b.members.includes(`serviceAccount:${RUNTIME_SA}`),
    ),
  );

  // I–O mechanisms on the regional XML API path (operator OAuth, NOT a signed URL).
  const name = `${SMOKE_PREFIX}${randomUUID()}.jpg`;
  const tooBig = `${SMOKE_PREFIX}${randomUUID()}.jpg`;
  const objectUrl = regionalObjectUrl(name);
  const body = syntheticJpeg(64);
  const putHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'image/jpeg',
    'Cache-Control': CACHE_CONTROL,
    'x-goog-content-length-range': `1,${PREVIEW_MAX_BYTES}`,
    'x-goog-if-generation-match': '0',
  };

  try {
    const put = await fetch(objectUrl, { method: 'PUT', headers: putHeaders, body });
    assert('I*. regional XML PUT (create-only, size range, type, cache-control) = 200', put.status === 200, `status ${put.status}`);
    assert('regional response not served by Cloudflare', !put.headers.get('cf-ray') && !/cloudflare/i.test(put.headers.get('server') || ''));

    const get = await fetch(objectUrl, { headers: { Authorization: `Bearer ${token}` } });
    const got = new Uint8Array(await get.arrayBuffer());
    assert('J*. regional XML GET = 200 with identical bytes', get.status === 200 && got.length === body.length && got.every((v, i) => v === body[i]));
    assert('content type = image/jpeg', get.headers.get('content-type') === 'image/jpeg');
    assert('K. Cache-Control = private, no-store', get.headers.get('cache-control') === CACHE_CONTROL, String(get.headers.get('cache-control')));

    const meta = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}`, token);
    assert('object metadata cacheControl = private, no-store', meta.cacheControl === CACHE_CONTROL);

    const anon = await fetch(objectUrl);
    assert('anonymous GET denied (PAP / private)', anon.status === 401 || anon.status === 403, `status ${anon.status}`);

    const overwrite = await fetch(objectUrl, { method: 'PUT', headers: putHeaders, body: syntheticJpeg(32) });
    assert('M. create-only x-goog-if-generation-match: 0 rejects overwrite (412)', overwrite.status === 412, `status ${overwrite.status}`);

    const big = await fetch(regionalObjectUrl(tooBig), {
      method: 'PUT',
      headers: { ...putHeaders, 'x-goog-content-length-range': '1,32' },
      body: syntheticJpeg(64),
    });
    assert('L. x-goog-content-length-range rejects oversize PUT (400)', big.status === 400, `status ${big.status}`);
    const bigAfter = await fetch(regionalObjectUrl(tooBig), { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } });
    assert('rejected oversize object was not stored', bigAfter.status === 404, `status ${bigAfter.status}`);

    for (const [origin, expectAllowed] of [
      [ALLOWED_ORIGIN, true],
      ['https://www.metalora.art', false],
      ['https://example.invalid', false],
    ] as const) {
      const pre = await fetch(objectUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type,cache-control,x-goog-content-length-range,x-goog-if-generation-match',
        },
      });
      const acao = pre.headers.get('access-control-allow-origin');
      assert(
        `CORS preflight ${expectAllowed ? 'allows' : 'refuses'} ${origin}`,
        expectAllowed ? acao === origin : !acao,
        `status ${pre.status}`,
      );
    }
  } finally {
    const del = await fetch(objectUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    assert('N. synthetic object deleted (204)', del.status === 204 || del.status === 404, `status ${del.status}`);
  }

  const after = await fetch(objectUrl, { headers: { Authorization: `Bearer ${token}` } });
  assert('O. GET after delete = 404', after.status === 404, `status ${after.status}`);
  const smokeLeft = await getJson(
    `${REGIONAL}/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(SMOKE_PREFIX)}`,
    token,
  );
  assert('no synthetic objects remain', !(smokeLeft.items || []).length);

  console.log('SIGNED CHAIN: NOT TESTED - operator has no signBlob on the signer SA (no extra IAM granted).');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} PASS`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(`FAIL: smoke aborted — ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
