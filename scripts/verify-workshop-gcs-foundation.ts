/**
 * NEW4-4D — Workshop private GCS foundation + signed regional delivery proof.
 *
 * Synthetic data only (`_ops-smoke/<uuid>.jpg`). Never touches `originals/` or `previews/`.
 * Every object request uses the Seoul regional endpoint; any other host is refused.
 * Operator OAuth token comes from `gcloud auth print-access-token`; tokens, signed URLs and
 * signatures are never printed or persisted.
 *
 * Sections:
 *   FOUNDATION CONFIG      — always (bucket, IAM posture, dependency identity, OAuth mechanisms)
 *   SIGNED DELIVERY PROOF  — only with WORKSHOP_GCS_SMOKE_SIGNED=1, which requires a temporary
 *                            operator TokenCreator binding on the signer SA (removed afterwards).
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Storage } from '@google-cloud/storage';
import { Impersonated, OAuth2Client } from 'google-auth-library';

const PROJECT = 'metalora-auth';
const BUCKET = 'metalora-workshop-apne3';
const REGIONAL_HOST = 'storage.asia-northeast3.rep.googleapis.com';
const REGIONAL = `https://${REGIONAL_HOST}`;
const SIGNER_SA = `workshop-media-signer@${PROJECT}.iam.gserviceaccount.com`;
const RUNTIME_SA = '807497260135-compute@developer.gserviceaccount.com';
/** Pre-dates NEW4-4D; can sign as any project SA. Owner decision pending (see NEW4-4D decision note). */
const PREEXISTING_PROJECT_TOKEN_CREATOR = `serviceAccount:firebase-adminsdk-fbsvc@${PROJECT}.iam.gserviceaccount.com`;
const ALLOWED_ORIGIN = 'https://metalora.art';
const CACHE_CONTROL = 'private, no-store';
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const SMOKE_PREFIX = '_ops-smoke/';
const SIGNED_TTL_SECONDS = 300;
const SIGNED_MODE = process.env.WORKSHOP_GCS_SMOKE_SIGNED === '1';

type Section = 'FOUNDATION CONFIG' | 'SIGNED DELIVERY PROOF';
const results: { section: Section; name: string; pass: boolean }[] = [];
let section: Section = 'FOUNDATION CONFIG';

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ section, name, pass: condition });
  const suffix = !condition && detail ? ` - ${detail}` : '';
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${suffix}`);
}

function operatorToken(): string {
  return execSync('gcloud auth print-access-token', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function operatorPrincipal(): string {
  const account = execSync('gcloud config get-value account', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return `user:${account}`;
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

/** Synthetic JPEG-shaped bytes (SOI … EOI) with a marker byte. Not a customer image. */
function syntheticJpeg(size: number, marker = 0x00): Uint8Array {
  const out = new Uint8Array(size).fill(marker);
  out.set([0xff, 0xd8, 0xff, 0xe0], 0);
  out.set([0xff, 0xd9], size - 2);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Storage client whose signing identity must be the dedicated signer SA. */
function signerStorage(sourceToken: string): Storage {
  const sourceClient = new OAuth2Client();
  sourceClient.setCredentials({ access_token: sourceToken });
  const authClient = new Impersonated({
    sourceClient,
    targetPrincipal: SIGNER_SA,
    targetScopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    lifetime: SIGNED_TTL_SECONDS,
    delegates: [],
  });
  return new Storage({ projectId: PROJECT, apiEndpoint: REGIONAL, authClient });
}

async function assertSignerIdentity(storage: Storage): Promise<void> {
  const creds = await storage.authClient.getCredentials();
  if (creds.client_email !== SIGNER_SA) {
    throw new Error('effective signing identity is not the dedicated signer SA');
  }
}

async function signedUrl(
  storage: Storage,
  name: string,
  action: 'read' | 'write',
  extensionHeaders?: Record<string, string>,
): Promise<string> {
  await assertSignerIdentity(storage);
  const [url] = await storage.bucket(BUCKET).file(name).getSignedUrl({
    version: 'v4',
    action,
    expires: Date.now() + SIGNED_TTL_SECONDS * 1000,
    ...(action === 'write' ? { contentType: 'image/jpeg', extensionHeaders } : {}),
  });
  const parsed = new URL(url);
  const credential = parsed.searchParams.get('X-Goog-Credential') || '';
  if (parsed.host !== REGIONAL_HOST) throw new Error('signed URL host is not the Seoul regional endpoint');
  if (!credential.startsWith(`${SIGNER_SA}/`)) throw new Error('signed URL credential is not the signer SA');
  if (parsed.pathname !== `/${BUCKET}/${name}`) throw new Error('signed URL path is not bound to the object');
  if (parsed.searchParams.get('X-Goog-Expires') !== String(SIGNED_TTL_SECONDS)) throw new Error('unexpected expiry');
  return url;
}

function uploadHeaders(range: string): Record<string, string> {
  return {
    'cache-control': CACHE_CONTROL,
    'x-goog-content-length-range': range,
    'x-goog-if-generation-match': '0',
  };
}

async function signedPut(url: string, range: string, body: Uint8Array): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', ...uploadHeaders(range) },
    body,
  });
}

async function foundation(token: string, operator: string): Promise<void> {
  section = 'FOUNDATION CONFIG';
  console.log('\n== FOUNDATION CONFIG ==');

  const bucket = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}`, token);
  assert('bucket = metalora-workshop-apne3', bucket.name === BUCKET);
  assert('region = ASIA-NORTHEAST3 (Seoul), location type region', bucket.location === 'ASIA-NORTHEAST3' && bucket.locationType === 'region');
  assert('storage class = STANDARD', bucket.storageClass === 'STANDARD');
  assert('Public Access Prevention = enforced', bucket.iamConfiguration?.publicAccessPrevention === 'enforced');
  assert('Uniform Bucket-Level Access enabled', bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled === true);
  assert('soft delete = 0', String(bucket.softDeletePolicy?.retentionDurationSeconds) === '0');
  assert('versioning off, no retention, no hold, no lifecycle, no website',
    !bucket.versioning?.enabled && !bucket.retentionPolicy && !bucket.defaultEventBasedHold
      && !bucket.lifecycle?.rule?.length && !bucket.website);
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
  assert('no Cloud CDN / backend bucket for this bucket', !(backendBuckets.items || []).some((b: any) => b.bucketName === BUCKET));

  const signer = await getJson(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SIGNER_SA}`, token);
  assert('signer SA exists and is enabled', signer.email === SIGNER_SA && !signer.disabled);
  const signerKeys = await getJson(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SIGNER_SA}/keys?keyTypes=USER_MANAGED`,
    token,
  );
  assert('signer SA has no user-managed keys', !(signerKeys.keys || []).length);

  const bucketIam = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}/iam`, token);
  const bindings: { role: string; members: string[] }[] = bucketIam.bindings || [];
  const membersOf = (role: string) => bindings.filter((b) => b.role === role).flatMap((b) => b.members);
  assert('signer SA has bucket-level roles/storage.objectUser', membersOf('roles/storage.objectUser').includes(`serviceAccount:${SIGNER_SA}`));
  assert('no projectEditor legacy convenience binding on bucket', !bindings.some((b) => b.members.includes(`projectEditor:${PROJECT}`)));
  assert(
    'projectOwner legacy bucket/object owner retained',
    membersOf('roles/storage.legacyBucketOwner').includes(`projectOwner:${PROJECT}`)
      && membersOf('roles/storage.legacyObjectOwner').includes(`projectOwner:${PROJECT}`),
  );
  assert('no allUsers / allAuthenticatedUsers on bucket',
    !bindings.some((b) => b.members.some((m) => m === 'allUsers' || m === 'allAuthenticatedUsers')));

  const saIam = await getJson(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SIGNER_SA}:getIamPolicy`,
    token,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const tokenCreators: string[] = (saIam.bindings || [])
    .filter((b: any) => b.role === 'roles/iam.serviceAccountTokenCreator')
    .flatMap((b: any) => b.members);
  assert('runtime SA has TokenCreator on signer SA', tokenCreators.includes(`serviceAccount:${RUNTIME_SA}`));
  if (SIGNED_MODE) {
    assert('temporary operator TokenCreator present for signed proof', tokenCreators.includes(operator));
  } else {
    assert('no operator TokenCreator on signer SA', !tokenCreators.includes(operator));
  }
  assert('signer SA TokenCreator holders are only the approved principals',
    tokenCreators.every((m) => m === `serviceAccount:${RUNTIME_SA}` || (SIGNED_MODE && m === operator)));

  const projectIam = await getJson(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,
    token,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  const projectTokenCreators: string[] = (projectIam.bindings || [])
    .filter((b: any) => b.role === 'roles/iam.serviceAccountTokenCreator')
    .flatMap((b: any) => b.members);
  assert('no project-wide TokenCreator for runtime SA or operator',
    !projectTokenCreators.includes(`serviceAccount:${RUNTIME_SA}`) && !projectTokenCreators.includes(operator));
  assert(
    'project-wide TokenCreator holders limited to the documented pre-existing exception',
    projectTokenCreators.every((m) => m === PREEXISTING_PROJECT_TOKEN_CREATOR),
  );

  const storageRequire = createRequire(createRequire(import.meta.url).resolve('@google-cloud/storage'));
  const rootRequire = createRequire(import.meta.url);
  assert(
    'storage and app resolve the same google-auth-library module',
    storageRequire.resolve('google-auth-library') === rootRequire.resolve('google-auth-library'),
  );
  assert(
    'google-auth-library = 9.15.1',
    rootRequire('google-auth-library/package.json').version === '9.15.1',
  );
  const offline = signerStorage('offline-identity-check');
  const offlineCreds = await offline.authClient.getCredentials();
  assert('storage reports Impersonated target as signing identity (no runtime fallback)', offlineCreds.client_email === SIGNER_SA);

  const name = `${SMOKE_PREFIX}${randomUUID()}.jpg`;
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
    assert('OAuth regional PUT = 200', put.status === 200, `status ${put.status}`);
    const anon = await fetch(objectUrl);
    assert('anonymous GET denied', anon.status === 401 || anon.status === 403, `status ${anon.status}`);
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
      assert(`CORS preflight ${expectAllowed ? 'allows' : 'refuses'} ${origin}`, expectAllowed ? acao === origin : !acao, `status ${pre.status}`);
    }
  } finally {
    await fetch(objectUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
}

async function signedProof(token: string): Promise<void> {
  section = 'SIGNED DELIVERY PROOF';
  console.log('\n== SIGNED DELIVERY PROOF ==');
  const storage = signerStorage(token);
  await assertSignerIdentity(storage);
  assert('effective signer = workshop-media-signer (assertion enforced before every signature)', true);

  const valid = `${SMOKE_PREFIX}${randomUUID()}.jpg`;
  const oversize = `${SMOKE_PREFIX}${randomUUID()}.jpg`;
  const tampered = `${SMOKE_PREFIX}${randomUUID()}.jpg`;
  const created = [valid, oversize, tampered];
  const original = syntheticJpeg(16, 0x11);
  const range = '1,32';

  try {
    const bigUrl = await signedUrl(storage, oversize, 'write', uploadHeaders(range));
    assert('signed PUT URL: Seoul regional host, signer credential, 300 s, object-bound', true);
    const big = await signedPut(bigUrl, range, syntheticJpeg(64));
    assert('signed size range 1-32 rejects 64-byte PUT (400)', big.status === 400, `status ${big.status}`);
    const bigHead = await fetch(regionalObjectUrl(oversize), { method: 'HEAD', headers: { Authorization: `Bearer ${token}` } });
    assert('rejected oversize object not stored', bigHead.status === 404, `status ${bigHead.status}`);

    const tamperUrl = await signedUrl(storage, tampered, 'write', uploadHeaders(range));
    const tamper = await fetch(tamperUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', ...uploadHeaders('1,1048576') },
      body: syntheticJpeg(64),
    });
    assert('client cannot widen the signed size range (403)', tamper.status === 403, `status ${tamper.status}`);

    const putUrl = await signedUrl(storage, valid, 'write', uploadHeaders(range));
    const put = await signedPut(putUrl, range, original);
    assert('signed regional PUT (16 bytes, image/jpeg, private/no-store, create-only) = 200', put.status === 200, `status ${put.status}`);

    const meta = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(valid)}`, token);
    assert('stored object: contentType image/jpeg', meta.contentType === 'image/jpeg');
    assert('stored object: cacheControl private, no-store', meta.cacheControl === CACHE_CONTROL);
    assert('stored object: size 16', meta.size === '16');
    assert('stored object lives in the asia-northeast3 bucket', meta.bucket === BUCKET);

    const anon = await fetch(regionalObjectUrl(valid));
    assert('no public access to signed-uploaded object', anon.status === 401 || anon.status === 403, `status ${anon.status}`);

    const overwriteUrl = await signedUrl(storage, valid, 'write', uploadHeaders(range));
    const overwrite = await signedPut(overwriteUrl, range, syntheticJpeg(16, 0x22));
    assert('signed create-only rejects overwrite (412)', overwrite.status === 412, `status ${overwrite.status}`);

    const getUrl = await signedUrl(storage, valid, 'read');
    assert('signed GET URL: Seoul regional host, signer credential, 300 s, object-bound', true);
    const get = await fetch(getUrl);
    const got = new Uint8Array(await get.arrayBuffer());
    assert('signed regional GET = 200', get.status === 200, `status ${get.status}`);
    assert('signed GET returns original bytes (overwrite did not apply)', sameBytes(got, original));
    assert('signed GET Cache-Control = private, no-store', get.headers.get('cache-control') === CACHE_CONTROL);
    assert('signed GET content-type = image/jpeg', get.headers.get('content-type') === 'image/jpeg');
    assert('signed GET not served by Cloudflare', !get.headers.get('cf-ray') && !/cloudflare/i.test(get.headers.get('server') || ''));
  } finally {
    for (const name of created) {
      await fetch(regionalObjectUrl(name), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    }
  }

  const afterUrl = await signedUrl(storage, valid, 'read');
  const after = await fetch(afterUrl);
  assert('signed GET after delete = 404', after.status === 404, `status ${after.status}`);
}

async function main(): Promise<void> {
  const token = operatorToken();
  const operator = operatorPrincipal();
  await foundation(token, operator);
  if (SIGNED_MODE) await signedProof(token);

  section = SIGNED_MODE ? 'SIGNED DELIVERY PROOF' : 'FOUNDATION CONFIG';
  const left = await getJson(`${REGIONAL}/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(SMOKE_PREFIX)}`, token);
  assert('no _ops-smoke/ objects remain', !(left.items || []).length);

  const summary = (s: Section) => {
    const rows = results.filter((r) => r.section === s);
    return { passed: rows.filter((r) => r.pass).length, total: rows.length };
  };
  const f = summary('FOUNDATION CONFIG');
  const s = summary('SIGNED DELIVERY PROOF');
  console.log(`\nFOUNDATION CONFIG ${f.passed === f.total ? 'PASS' : 'FAIL'} (${f.passed}/${f.total})`);
  console.log(SIGNED_MODE
    ? `SIGNED DELIVERY PROOF ${s.passed === s.total ? 'PASS' : 'FAIL'} (${s.passed}/${s.total})`
    : 'SIGNED DELIVERY PROOF NOT RUN (requires WORKSHOP_GCS_SMOKE_SIGNED=1 and a temporary operator TokenCreator binding)');
  const passed = results.filter((r) => r.pass).length;
  console.log(`${passed}/${results.length} PASS`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(`FAIL: smoke aborted - ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
