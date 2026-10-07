/**
 * NEW4-4D-9 — legacy read bridge + legacy copy tool: local checks.
 * Synthetic data and in-memory mocks only. No GCS / Supabase / network, no customer data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Storage } from '@google-cloud/storage';
import {
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_GCS_SIGNER_SA,
  WORKSHOP_LEGACY_COPY_METADATA,
  WORKSHOP_LEGACY_COPY_ORIGIN,
  WORKSHOP_LEGACY_FALLBACK_ENV,
  WORKSHOP_MEDIA_CACHE_CONTROL,
  WorkshopStorageError,
  createGcsWorkshopStore,
  handleDiscard,
  handleSignRead,
  isBridgeableLegacyCopy,
  parseCanonicalWorkshopPath,
  readWorkshopLegacyFallback,
  type WorkshopCustomerRows,
  type WorkshopGcsObjectStore,
  type WorkshopMediaDeps,
  type WorkshopObjectMetadata,
  type WorkshopReferenceSource,
} from '../src/lib/workshopStorage';
import { createWorkshopMediaResolver } from '../src/lib/workshopMediaCore';
import {
  LEGACY_COPY_JOB_SA,
  LegacyCopyError,
  PAYMENT_TEST_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_PROJECT_REF,
  classifyLegacyObjectPath,
  classifyLegacyRefValue,
  evaluateLegacyCutoverGate,
  formatLegacyCopyReport,
  parseLegacyCopyArgs,
  runLegacyCopy,
  type LegacyCopyArgs,
  type LegacyCopyReport,
  type LegacyReferenceField,
  type LegacyReferenceSource,
  type LegacySource,
  type LegacySourceEntry,
  type LegacyTarget,
  type LegacyTargetObject,
} from './workshop-legacy-copy-core';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results: { group: string; name: string; pass: boolean }[] = [];
let group = '';

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ group, name, pass: condition });
  const suffix = !condition && detail ? ` - ${detail}` : '';
  console.log(`${condition ? 'PASS' : 'FAIL'}: [${group}] ${name}${suffix}`);
}

function section(label: string): void {
  group = label;
  console.log(`\n== ${label} ==`);
}

/** Runs fn while capturing console output (restored afterwards). */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ value: T; logs: string }> {
  const lines: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const sink = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  console.log = sink;
  console.error = sink;
  console.warn = sink;
  console.info = sink;
  try {
    const value = await fn();
    return { value, logs: lines.join('\n') };
  } finally {
    Object.assign(console, original);
  }
}

// Synthetic identities (not customer data).
const UID = '0d9a1111-1111-4111-8111-111111111111';
const OTHER = '0d9a2222-2222-4222-8222-222222222222';
const OBJ = (n: number) => `0d9b${String(n).padStart(4, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const LEGACY_HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const LEGACY_BASE = `https://${LEGACY_HOST}/storage/v1/object/public/workshop/`;
const HOSTS = [LEGACY_HOST];
const PREVIEW = (uid: string, n: number) => `previews/${uid}/${OBJ(n)}.jpg`;
const ORIGINAL = (uid: string, n: number, ext = 'png') => `originals/${uid}/${OBJ(n)}.${ext}`;
const legacyUrl = (p: string) => `${LEGACY_BASE}${p}`;
const FAKE_SIGNED = (p: string) =>
  `https://${WORKSHOP_GCS_REGIONAL_HOST}/${WORKSHOP_GCS_APPROVED_BUCKET}/${p}?X-Goog-Credential=${encodeURIComponent(`${WORKSHOP_GCS_SIGNER_SA}/x`)}&X-Goog-Expires=300&X-Goog-Signature=synthetic`;

const JPEG = (seed: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed & 0xff, (seed >> 8) & 0xff, 1, 2, 3]);
const PNG = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed & 0xff, 7]);
const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('base64');
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------------------
// Bridge mocks
// ---------------------------------------------------------------------------

type GcsMockObject = WorkshopObjectMetadata;

function mockGcs(objects: Map<string, GcsMockObject>, options: { headError?: boolean } = {}) {
  const calls = { head: [] as string[], sign: [] as string[], remove: [] as string[] };
  const store: WorkshopGcsObjectStore = {
    name: 'gcs',
    async listObjects() {
      return [];
    },
    async remove(p) {
      calls.remove.push(p);
      return objects.delete(p) ? 'removed' : 'absent';
    },
    async head(p) {
      calls.head.push(p);
      if (options.headError) throw new WorkshopStorageError('gcs', 'head', true);
      return objects.get(p) ?? null;
    },
    async signUpload() {
      throw new Error('not used');
    },
    async signRead(p) {
      calls.sign.push(p);
      return { url: FAKE_SIGNED(p), expiresAt: new Date(Date.now() + 300_000).toISOString() };
    },
  };
  return { store, calls };
}

function verifiedCopy(p: string, overrides: Partial<GcsMockObject> = {}): GcsMockObject {
  const parsed = parseCanonicalWorkshopPath(p)!;
  return {
    path: p,
    sizeBytes: 9,
    contentType: parsed.ext === 'png' ? 'image/png' : parsed.ext === 'webp' ? 'image/webp' : 'image/jpeg',
    cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL,
    createdAtMs: Date.now(),
    legacyCopy: 'verified',
    ...overrides,
  };
}

function refsFor(rows: Partial<WorkshopCustomerRows>, adminOrders: { ordered_items: unknown }[] = []) {
  const full: WorkshopCustomerRows = { cart: [], progress: [], orders: [], intents: [], ...rows };
  const snapshot = JSON.stringify(full);
  const source: WorkshopReferenceSource = {
    async customerRows() {
      return full;
    },
    async adminOrderRows() {
      return adminOrders;
    },
  };
  return { source, unchanged: () => JSON.stringify(full) === snapshot };
}

const customer = { userId: UID, isAdmin: false };

async function signRead(deps: WorkshopMediaDeps, refs: string[], caller = customer) {
  const res = await handleSignRead(deps, caller, { refs });
  return { status: res.status, items: (res.body.items ?? []) as Record<string, unknown>[] };
}

// ---------------------------------------------------------------------------
section('bridge A-D: canonical + verified legacy copy');
{
  const canonical = PREVIEW(UID, 1);
  const legacyPath = PREVIEW(UID, 2);
  const legacyRef = legacyUrl(legacyPath);
  const gcs = mockGcs(new Map([[canonical, verifiedCopy(canonical, { legacyCopy: null })], [legacyPath, verifiedCopy(legacyPath)]]));
  const refs = refsFor({ cart: [{ custom_image: canonical }], orders: [{ ordered_items: [{ image: legacyRef }] }] });
  const deps: WorkshopMediaDeps = { gcs: gcs.store, references: refs.source, legacyHosts: HOSTS };

  const a = await signRead(deps, [canonical]);
  assert('A authorized canonical ref -> gcs signed src', a.items[0]?.store === 'gcs' && a.items[0]?.src === FAKE_SIGNED(canonical));

  const b = await signRead(deps, [legacyRef]);
  assert('B authorized legacy ref + verified copy -> gcs signed src',
    b.status === 200 && b.items[0]?.ok === true && b.items[0]?.store === 'gcs' && b.items[0]?.src === FAKE_SIGNED(legacyPath));
  assert('B signed only after a HEAD of the same canonical path', gcs.calls.head.includes(legacyPath) && gcs.calls.sign.includes(legacyPath));
  assert('C response ref is the exact legacy request', b.items[0]?.ref === legacyRef);
  const c2 = await signRead(deps, [legacyPath]);
  assert('C canonical-form request for a DB legacy ref maps back to its own ref',
    c2.items[0]?.ref === legacyPath && c2.items[0]?.store === 'gcs');
  assert('D reference rows are not rewritten', refs.unchanged());
  assert('D reference source exposes no write method', Object.keys(refs.source).sort().join(',') === 'adminOrderRows,customerRows');

  const resolver = createWorkshopMediaResolver({
    getSession: async () => ({ userId: UID, accessToken: 'synthetic' }),
    legacyHosts: HOSTS,
    fetch: async (_url, init) => {
      const res = await handleSignRead(deps, customer, JSON.parse(String(init.body)));
      return { ok: res.status === 200, status: res.status, json: async () => res.body };
    },
  });
  const resolved = await resolver.resolveOne(legacyRef);
  assert('C existing client resolver accepts gcs for a legacy input (no contract change)',
    resolved?.store === 'gcs' && resolved.src === FAKE_SIGNED(legacyPath) && resolved.ref === legacyRef);
}

// ---------------------------------------------------------------------------
section('bridge E-F: transition fallback and post-cutover mode');
{
  const legacyPath = PREVIEW(UID, 3);
  const legacyRef = legacyUrl(legacyPath);
  const refs = refsFor({ orders: [{ ordered_items: [{ user_image_url: legacyRef }] }] });
  const empty = mockGcs(new Map());
  const e1 = await signRead({ gcs: empty.store, references: refs.source, legacyHosts: HOSTS }, [legacyRef]);
  assert('E legacy + GCS absent, default mode -> supabase_legacy', e1.items[0]?.store === 'supabase_legacy' && !('src' in e1.items[0]));
  const e2 = await signRead({ gcs: empty.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: true }, [legacyRef]);
  assert('E legacy + GCS absent, fallback=true -> supabase_legacy', e2.items[0]?.store === 'supabase_legacy');

  const f1 = await signRead({ gcs: empty.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: false }, [legacyRef]);
  assert('F fallback=false + GCS absent -> unavailable (no legacy URL)',
    f1.status === 200 && f1.items[0]?.ok === false && f1.items[0]?.reason === 'unavailable');
  const copied = mockGcs(new Map([[legacyPath, verifiedCopy(legacyPath)]]));
  const f2 = await signRead({ gcs: copied.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: false }, [legacyRef]);
  assert('F fallback=false + verified copy -> gcs', f2.items[0]?.store === 'gcs');

  const broken = mockGcs(new Map(), { headError: true });
  const { value: f3, logs } = await captureLogs(() =>
    signRead({ gcs: broken.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: false }, [legacyRef]));
  assert('F fallback=false + GCS error -> 503, never downgraded', f3.status === 503);
  const { value: e3, logs: e3logs } = await captureLogs(() =>
    signRead({ gcs: broken.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: true }, [legacyRef]));
  assert('E fallback=true + GCS error -> supabase_legacy (Supabase still authoritative)', e3.items[0]?.store === 'supabase_legacy');
  assert('E fallback downgrade is logged with a reason class', /legacy_fallback_gcs_error/.test(e3logs));
  assert('F GCS failure log carries no path or ref', !logs.includes(UID) && !e3logs.includes(UID) && !e3logs.includes(LEGACY_HOST));

  const resolver = createWorkshopMediaResolver({
    getSession: async () => ({ userId: UID, accessToken: 'synthetic' }),
    legacyHosts: HOSTS,
    fetch: async (_url, init) => {
      const res = await handleSignRead({ gcs: empty.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: false },
        customer, JSON.parse(String(init.body)));
      return { ok: res.status === 200, status: res.status, json: async () => res.body };
    },
  });
  assert('F client gets no src for unavailable (placeholder), never the dead public URL',
    (await resolver.resolveOne(legacyRef)) === null);

  assert('F mode parser: absent -> enabled', JSON.stringify(readWorkshopLegacyFallback({})) === '{"state":"ready","enabled":true}');
  assert('F mode parser: "true" -> enabled', readWorkshopLegacyFallback({ [WORKSHOP_LEGACY_FALLBACK_ENV]: 'true' }).state === 'ready');
  assert('F mode parser: "FALSE" -> disabled',
    JSON.stringify(readWorkshopLegacyFallback({ [WORKSHOP_LEGACY_FALLBACK_ENV]: ' FALSE ' })) === '{"state":"ready","enabled":false}');
  assert('F mode parser: other values fail closed',
    ['1', 'yes', 'off', 'disabled'].every((v) => readWorkshopLegacyFallback({ [WORKSHOP_LEGACY_FALLBACK_ENV]: v }).state === 'invalid'));
}

// ---------------------------------------------------------------------------
section('bridge G-I: authorization, malformed refs, no identity confusion');
{
  const own = PREVIEW(UID, 4);
  const foreign = PREVIEW(OTHER, 5);
  const gcs = mockGcs(new Map([[own, verifiedCopy(own)], [foreign, verifiedCopy(foreign)]]));
  const refs = refsFor({ orders: [{ ordered_items: [{ image: legacyUrl(own) }] }] });
  const deps: WorkshopMediaDeps = { gcs: gcs.store, references: refs.source, legacyHosts: HOSTS };

  const g = await signRead(deps, [legacyUrl(foreign)]);
  assert('G unauthorized legacy ref (other UID, not in DB) -> not_authorized', g.items[0]?.reason === 'not_authorized');
  assert('G unauthorized ref never reaches GCS', !gcs.calls.head.includes(foreign) && !gcs.calls.sign.includes(foreign));
  const ownUnreferenced = PREVIEW(UID, 6);
  const g2 = await signRead(deps, [legacyUrl(ownUnreferenced)]);
  assert('G own-UID path without a DB reference -> not_authorized', g2.items[0]?.reason === 'not_authorized');

  const h = await signRead(deps, [
    `https://evil.example/storage/v1/object/public/workshop/${own}`,
    `https://bvihpoorwriejybixmoc.supabase.co/storage/v1/object/public/workshop/${own}`,
    `${LEGACY_BASE}previews/${UID}/photo-1.jpg`,
    `${LEGACY_BASE}${own}?download=1`,
    'data:image/png;base64,AAAA',
  ]);
  assert('H malformed / external refs -> invalid_ref', h.items.length === 5 && h.items.every((i) => i.reason === 'invalid_ref'));

  const cases: [string, Partial<GcsMockObject>][] = [
    ['no copy marker (foreign object at the path)', { legacyCopy: null }],
    ['copy written but not verified', { legacyCopy: 'written' }],
    ['content type does not match extension', { contentType: 'image/png' }],
    ['cache control not private', { cacheControl: 'public, max-age=3600' }],
    ['empty object', { sizeBytes: 0 }],
  ];
  for (const [label, overrides] of cases) {
    const store = mockGcs(new Map([[own, verifiedCopy(own, overrides)]]));
    const pre = await captureLogs(() => signRead({ gcs: store.store, references: refs.source, legacyHosts: HOSTS }, [legacyUrl(own)]));
    const post = await signRead({ gcs: store.store, references: refs.source, legacyHosts: HOSTS, legacyFallback: false }, [legacyUrl(own)]);
    assert(`I ${label}: never served from GCS`,
      pre.value.items[0]?.store === 'supabase_legacy' && post.items[0]?.reason === 'unavailable' && store.calls.sign.length === 0);
  }
  const parsed = parseCanonicalWorkshopPath(own)!;
  assert('I metadata for another path is never bridgeable', !isBridgeableLegacyCopy(parsed, verifiedCopy(PREVIEW(UID, 7))));
  assert('I null metadata is never bridgeable', !isBridgeableLegacyCopy(parsed, null));

  const admin = { userId: OTHER, isAdmin: true };
  const adminRefs = refsFor({}, [{ ordered_items: [{ image: legacyUrl(own) }] }]);
  const adminRead = await signRead({ gcs: gcs.store, references: adminRefs.source, legacyHosts: HOSTS }, [legacyUrl(own)], admin);
  assert('G admin: legacy ref inside an unpurged order -> gcs copy', adminRead.items[0]?.store === 'gcs');
}

// ---------------------------------------------------------------------------
section('bridge J-K: regional signing, no logging, discard guard, real store metadata');
{
  const own = PREVIEW(UID, 8);
  const gcs = mockGcs(new Map([[own, verifiedCopy(own)]]));
  const refs = refsFor({ orders: [{ ordered_items: [{ image: legacyUrl(own) }] }] });
  const { value, logs } = await captureLogs(() => signRead({ gcs: gcs.store, references: refs.source, legacyHosts: HOSTS }, [legacyUrl(own)]));
  const src = String(value.items[0]?.src ?? '');
  assert('J bridged src is on the Seoul regional host only', new URL(src).host === WORKSHOP_GCS_REGIONAL_HOST);
  assert('K bridged signed URL / path / UID not logged',
    !logs.includes('X-Goog') && !logs.includes(UID) && !logs.includes(own) && !logs.includes(LEGACY_HOST));

  const recent = PREVIEW(UID, 9);
  const discardStore = mockGcs(new Map([[recent, verifiedCopy(recent, { createdAtMs: Date.now() - 1000 })]]));
  const discard = await handleDiscard({ gcs: discardStore.store, references: refsFor({}).source, legacyHosts: HOSTS }, customer, { path: recent });
  assert('discard refuses copied legacy objects (retention owns them)', discard.status === 409 && discardStore.calls.remove.length === 0);
  const fresh = PREVIEW(UID, 10);
  const freshStore = mockGcs(new Map([[fresh, verifiedCopy(fresh, { legacyCopy: null, createdAtMs: Date.now() - 1000 })]]));
  const freshDiscard = await handleDiscard({ gcs: freshStore.store, references: refsFor({}).source, legacyHosts: HOSTS }, customer, { path: fresh });
  assert('discard of a fresh own upload is unchanged', freshDiscard.status === 200 && freshStore.calls.remove.length === 1);

  const metaFor = (custom: Record<string, string> | undefined) => {
    const fake = {
      authClient: { getCredentials: async () => ({ client_email: WORKSHOP_GCS_SIGNER_SA }) },
      bucket: () => ({
        file: () => ({
          getMetadata: async () => [{ size: '9', contentType: 'image/jpeg', cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL, timeCreated: new Date().toISOString(), metadata: custom }],
        }),
      }),
    } as unknown as Storage;
    return createGcsWorkshopStore(
      { bucket: WORKSHOP_GCS_APPROVED_BUCKET, endpointHost: WORKSHOP_GCS_REGIONAL_HOST, signerSa: WORKSHOP_GCS_SIGNER_SA },
      { storageFactory: async () => fake },
    ).head(own);
  };
  const verified = await metaFor({ [WORKSHOP_LEGACY_COPY_METADATA.origin]: WORKSHOP_LEGACY_COPY_ORIGIN, [WORKSHOP_LEGACY_COPY_METADATA.state]: 'verified' });
  const wrongOrigin = await metaFor({ [WORKSHOP_LEGACY_COPY_METADATA.origin]: 'client', [WORKSHOP_LEGACY_COPY_METADATA.state]: 'verified' });
  const none = await metaFor(undefined);
  assert('GCS store head maps the copy marker', verified?.legacyCopy === 'verified');
  assert('GCS store head ignores a marker without the exact origin', wrongOrigin?.legacyCopy === null && none?.legacyCopy === null);

  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert('server reads the legacy mode once from env', /readWorkshopLegacyFallback\(process\.env\)/.test(server));
  assert('server fails closed on an invalid legacy mode', /workshop_legacy_mode_invalid/.test(server));
  assert('server passes the mode to the media handlers', /legacyFallback: workshopLegacyFallback\.enabled/.test(server));
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert('.env.example documents the mode name, commented', /^# WORKSHOP_LEGACY_SUPABASE_FALLBACK_ENABLED=/m.test(envExample)
    && !/^WORKSHOP_LEGACY_SUPABASE_FALLBACK_ENABLED=/m.test(envExample));
}

// ---------------------------------------------------------------------------
// Copy tool mocks
// ---------------------------------------------------------------------------

type SourceObject = { bytes: Uint8Array; mime: string | null; listedSize?: number | null };

function mockSource(objects: Map<string, SourceObject>, options: { failDownloads?: number } = {}) {
  const calls = { list: [] as { prefix: string; offset: number; limit: number }[], download: [] as string[] };
  let failures = options.failDownloads ?? 0;
  const source: LegacySource = {
    async list(prefix, offset, limit) {
      calls.list.push({ prefix, offset, limit });
      const base = prefix ? `${prefix}/` : '';
      const children = new Map<string, LegacySourceEntry>();
      for (const [p, obj] of objects) {
        if (!p.startsWith(base)) continue;
        const rest = p.slice(base.length);
        const [head, ...tail] = rest.split('/');
        if (tail.length > 0) children.set(head, { name: head, isFolder: true, sizeBytes: null, mimeType: null });
        else children.set(head, { name: head, isFolder: false, sizeBytes: obj.listedSize === undefined ? obj.bytes.length : obj.listedSize, mimeType: obj.mime });
      }
      return [...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit);
    },
    async download(p, maxBytes) {
      calls.download.push(p);
      if (failures > 0) {
        failures -= 1;
        throw new LegacyCopyError('source_download', true);
      }
      const obj = objects.get(p);
      if (!obj) throw new LegacyCopyError('source_download', false, true);
      if (obj.bytes.length > maxBytes) throw new LegacyCopyError('source_too_large', false);
      return obj.bytes;
    },
  };
  return { source, calls };
}

type TargetStored = { bytes: Uint8Array; contentType: string; cacheControl: string; md5: string; custom: Record<string, string>; metageneration: number };

function mockTarget(objects: Map<string, TargetStored>, options: { corruptWrites?: boolean } = {}) {
  const calls = { create: [] as string[], mark: [] as string[], head: [] as string[] };
  const target: LegacyTarget = {
    async head(p): Promise<LegacyTargetObject | null> {
      calls.head.push(p);
      const o = objects.get(p);
      if (!o) return null;
      const origin = o.custom[WORKSHOP_LEGACY_COPY_METADATA.origin];
      const state = o.custom[WORKSHOP_LEGACY_COPY_METADATA.state];
      return {
        sizeBytes: o.bytes.length,
        contentType: o.contentType,
        cacheControl: o.cacheControl,
        md5Base64: o.md5,
        copyState: origin === WORKSHOP_LEGACY_COPY_ORIGIN && (state === 'written' || state === 'verified') ? state : null,
        sourceSha256: o.custom[WORKSHOP_LEGACY_COPY_METADATA.sourceSha256] ?? null,
        metageneration: String(o.metageneration),
      };
    },
    async createOnly(p, bytes, write) {
      calls.create.push(p);
      if (objects.has(p)) return 'exists';
      const stored = options.corruptWrites ? new Uint8Array([...bytes, 0]) : new Uint8Array(bytes);
      objects.set(p, {
        bytes: stored,
        contentType: write.contentType,
        cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL,
        md5: md5(stored),
        custom: {
          [WORKSHOP_LEGACY_COPY_METADATA.origin]: WORKSHOP_LEGACY_COPY_ORIGIN,
          [WORKSHOP_LEGACY_COPY_METADATA.state]: 'written',
          [WORKSHOP_LEGACY_COPY_METADATA.sourceSha256]: write.sha256Hex,
        },
        metageneration: 1,
      });
      return 'created';
    },
    async download(p) {
      const o = objects.get(p);
      if (!o) throw new LegacyCopyError('target_download', false);
      return o.bytes;
    },
    async markVerified(p, metageneration) {
      calls.mark.push(p);
      const o = objects.get(p)!;
      if (String(o.metageneration) !== metageneration) throw new LegacyCopyError('target_mark', false);
      o.custom = { ...o.custom, [WORKSHOP_LEGACY_COPY_METADATA.state]: 'verified' };
      o.metageneration += 1;
    },
  };
  return { target, calls };
}

function mockRefs(values: [LegacyReferenceField, unknown][], absent: ('orders' | 'payment_intents')[] = []): LegacyReferenceSource {
  return {
    async scan(onValue) {
      for (const [field, value] of values) onValue(field, value);
      return { tablesAbsent: absent };
    },
  };
}

const DRY: LegacyCopyArgs = { mode: 'dry-run', verifyBytes: false, concurrency: 2 };
const VERIFY: LegacyCopyArgs = { mode: 'dry-run', verifyBytes: true, concurrency: 2 };
const APPLY: LegacyCopyArgs = { mode: 'apply', verifyBytes: true, concurrency: 3 };
const noSleep = async () => undefined;

async function run(
  source: LegacySource,
  target: LegacyTarget,
  refs: LegacyReferenceSource,
  args: LegacyCopyArgs,
  pageSize = 2,
): Promise<{ report: LegacyCopyReport; logs: string }> {
  const { value, logs } = await captureLogs(() =>
    runLegacyCopy({ source, target, references: refs, legacyHosts: HOSTS, args, pageSize, sleep: noSleep }));
  return { report: value, logs };
}

// ---------------------------------------------------------------------------
section('copy args: dry-run default and apply guard');
{
  const ack = '--ack-readonly-production-inventory';
  const p = (argv: string[], ref: string | null = PRODUCTION_SUPABASE_PROJECT_REF) => parseLegacyCopyArgs(argv, ref);
  const dflt = p([ack]);
  assert('dry-run is the default', dflt.ok === true && dflt.args.mode === 'dry-run' && dflt.args.verifyBytes === false);
  assert('explicit --dry-run accepted', p([ack, '--dry-run']).ok === true);
  assert('read-only acknowledgement required for any run', JSON.stringify(p([])) === '{"ok":false,"reason":"readonly_ack_required"}');
  assert('--apply without confirmation refused', JSON.stringify(p([ack, '--apply'])) === '{"ok":false,"reason":"apply_confirmation_required"}');
  assert('--apply with a wrong confirmation refused', p([ack, '--apply', '--confirm-production-copy=yes']).ok === false);
  const apply = p([ack, '--apply', `--confirm-production-copy=${PRODUCTION_SUPABASE_PROJECT_REF}`]);
  assert('--apply with the exact project ref accepted and always byte-verifies',
    apply.ok === true && apply.args.mode === 'apply' && apply.args.verifyBytes === true);
  assert('--apply plus --dry-run refused', p([ack, '--apply', '--dry-run', `--confirm-production-copy=${PRODUCTION_SUPABASE_PROJECT_REF}`]).ok === false);
  assert('confirmation without --apply refused', p([ack, `--confirm-production-copy=${PRODUCTION_SUPABASE_PROJECT_REF}`]).ok === false);
  assert('payment-test project refused', JSON.stringify(p([ack], PAYMENT_TEST_SUPABASE_PROJECT_REF)) === '{"ok":false,"reason":"payment_test_project_refused"}');
  assert('unknown source project refused', p([ack], 'otherproject').ok === false && p([ack], null).ok === false);
  assert('unknown argument refused', p([ack, '--delete-source']).ok === false && p([ack, '--force']).ok === false);
  assert('concurrency bounded 1..8', p([ack, '--concurrency=8']).ok === true && p([ack, '--concurrency=9']).ok === false && p([ack, '--concurrency=0']).ok === false);
}

// ---------------------------------------------------------------------------
section('copy classification: canonical / non-UUID / prefix / extension / malformed');
{
  const cls = (p: string) => classifyLegacyObjectPath(p).kind;
  assert('canonical original', cls(ORIGINAL(UID, 1)) === 'canonical' && cls(ORIGINAL(UID, 1, 'jpeg')) === 'canonical' && cls(ORIGINAL(UID, 1, 'webp')) === 'canonical');
  assert('canonical preview', cls(PREVIEW(UID, 1)) === 'canonical');
  assert('non-UUID filename', cls(`originals/${UID}/1696000000000-ab12cd34.png`) === 'noncanonical_filename' && cls(`previews/${UID}/preview.jpg`) === 'noncanonical_filename');
  assert('uppercase object UUID is non-canonical', cls(`previews/${UID}/${OBJ(1).toUpperCase()}.jpg`) === 'noncanonical_filename');
  assert('unsupported extension', cls(`previews/${UID}/${OBJ(1)}.png`) === 'unsupported_extension' && cls(`originals/${UID}/${OBJ(1)}.heic`) === 'unsupported_extension');
  assert('uppercase extension is unsupported', cls(`originals/${UID}/${OBJ(1)}.PNG`) === 'unsupported_extension');
  assert('unexpected prefix', cls(`uploads/${UID}/${OBJ(1)}.jpg`) === 'unexpected_prefix' && cls('readme.txt') === 'unexpected_prefix');
  assert('malformed UID folder', cls(`originals/not-a-uuid/${OBJ(1)}.png`) === 'malformed_path' && cls(`originals/${UID.toUpperCase()}/${OBJ(1)}.png`) === 'malformed_path');
  assert('malformed depth', cls(`originals/${OBJ(1)}.png`) === 'malformed_path' && cls(`originals/${UID}/x/${OBJ(1)}.png`) === 'malformed_path');

  const ref = (v: string) => classifyLegacyRefValue(v, HOSTS).kind;
  assert('ref: canonical path', ref(PREVIEW(UID, 1)) === 'canonical');
  assert('ref: legacy public URL', ref(legacyUrl(PREVIEW(UID, 1))) === 'legacy');
  assert('ref: legacy non-UUID filename -> malformed (CUTOVER BLOCKER)', ref(`${LEGACY_BASE}originals/${UID}/1696000000000-ab12cd34.png`) === 'malformed');
  assert('ref: other Supabase project -> foreign_host', ref(`https://${PAYMENT_TEST_SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/workshop/${PREVIEW(UID, 1)}`) === 'foreign_host');
  assert('ref: workshop-like but unparseable -> unrecognized', ref(`workshop/${PREVIEW(UID, 1)}`) !== 'other' && ref(FAKE_SIGNED(PREVIEW(UID, 1))) === 'unrecognized');
  assert('ref: catalog / non-media strings ignored', ref('https://example.com/a.jpg') === 'other' && ref('workshop-single') === 'other' && ref('hello') === 'other');
}

// ---------------------------------------------------------------------------
section('copy dry-run inventory: pagination + aggregate classes');
{
  const objects = new Map<string, SourceObject>();
  for (let i = 1; i <= 7; i += 1) objects.set(PREVIEW(UID, i), { bytes: JPEG(i), mime: 'image/jpeg' });
  objects.set(ORIGINAL(OTHER, 20), { bytes: PNG(20), mime: 'image/png' });
  objects.set(`originals/${UID}/1696000000000-ab12cd34.png`, { bytes: PNG(21), mime: 'image/png' });
  objects.set(`previews/${UID}/${OBJ(22)}.png`, { bytes: PNG(22), mime: 'image/png' });
  objects.set(`uploads/${UID}/${OBJ(23)}.jpg`, { bytes: JPEG(23), mime: 'image/jpeg' });
  objects.set(`originals/not-a-uuid/${OBJ(24)}.png`, { bytes: PNG(24), mime: 'image/png' });
  objects.set(`originals/${UID}/nested/${OBJ(25)}.png`, { bytes: PNG(25), mime: 'image/png' });
  objects.set(`previews/${UID}/.emptyFolderPlaceholder`, { bytes: new Uint8Array(), mime: null });
  const total = objects.size - 1;
  const src = mockSource(objects);
  const tgt = mockTarget(new Map());
  const refs = mockRefs([
    ['cart_items.custom_image', legacyUrl(PREVIEW(UID, 1))],
    ['orders.ordered_items', [{ image: legacyUrl(PREVIEW(UID, 2)), custom_config: { preview_image_url: legacyUrl(PREVIEW(UID, 2)) } }]],
    ['payment_intents.validated_snapshot', { ordered_items: [{ user_image_url: legacyUrl(PREVIEW(UID, 3)) }] }],
    ['user_progress.uploaded_image_url', `${LEGACY_BASE}originals/${UID}/1696000000000-ab12cd34.png`],
    ['cart_items.custom_config.original_image_url', ORIGINAL(UID, 40)],
    ['cart_items.custom_config.preview_image_url', legacyUrl(PREVIEW(UID, 99))],
  ]);
  const { report: r, logs } = await run(src.source, tgt.target, refs, DRY);
  assert('pagination: every page requested until a short page', src.calls.list.some((c) => c.offset > 0) && src.calls.list.every((c) => c.limit === 2));
  assert('all objects counted (placeholder excluded)', r.source_objects_total === total && r.placeholder_ignored === 1, JSON.stringify(r));
  assert('A canonical_bridgeable', r.canonical_bridgeable === 8);
  assert('B noncanonical_filename + referenced', r.noncanonical_filename === 1 && r.noncanonical_referenced_source === 1);
  assert('C unexpected_prefix', r.unexpected_prefix === 1);
  assert('D unsupported_extension', r.unsupported_extension === 1);
  assert('E malformed_path (bad UID folder + nesting)', r.malformed_path === 2);
  assert('refs: legacy unique paths and occurrences', r.referenced_legacy_total === 4 && r.legacy_ref_occurrences === 5);
  assert('refs: malformed referenced counted', r.malformed_referenced === 1);
  assert('refs: canonical refs counted separately', r.canonical_refs === 1);
  assert('I target_missing for referenced uncopied objects', r.target_missing === 3 && r.referenced_source === 3);
  assert('unreferenced canonical objects are not copied', r.unreferenced_source === 5);
  assert('referenced_missing_source counted', r.referenced_missing_source === 1);
  assert('dry-run performs no writes and reads no bytes', tgt.calls.create.length === 0 && tgt.calls.mark.length === 0 && src.calls.download.length === 0);
  assert('dry-run gate FAILS with named conditions',
    !evaluateLegacyCutoverGate(r).pass && ['byte_verified_run', 'referenced_all_resolvable_from_gcs', 'no_malformed_referenced', 'no_referenced_missing_source']
      .every((n) => evaluateLegacyCutoverGate(r).failed.includes(n)));

  const printed = formatLegacyCopyReport(r);
  const parsedOut = JSON.parse(printed) as Record<string, unknown>;
  assert('output: counters, mode and gate fields only',
    Object.entries(parsedOut).every(([k, v]) => typeof v === 'number' || typeof v === 'boolean'
      || (k === 'mode' && typeof v === 'string') || (k === 'cutover_gate' && (v === 'PASS' || v === 'FAIL'))
      || (k === 'cutover_gate_failed' && Array.isArray(v))));
  const secrets = [UID, OTHER, OBJ(1), LEGACY_HOST, 'previews/', 'originals/', 'https://', '1696000000000'];
  assert('output contains no UID / path / URL / filename', secrets.every((s) => !printed.includes(s)));
  assert('no logs emitted during the run', logs.trim() === '');

  const abs = await run(mockSource(new Map()).source, mockTarget(new Map()).target, mockRefs([], ['payment_intents']), DRY);
  assert('absent tables are counted, not fatal', abs.report.tables_absent === 1 && abs.report.reference_lookup_errors === 0);
  const failingRefs: LegacyReferenceSource = { async scan() { throw new LegacyCopyError('reference_scan', true); } };
  const fr = await run(mockSource(new Map()).source, mockTarget(new Map()).target, failingRefs, DRY);
  assert('reference scan failure -> gate inventory_complete fails', fr.report.reference_lookup_errors === 1
    && evaluateLegacyCutoverGate(fr.report).failed.includes('inventory_complete'));
}

// ---------------------------------------------------------------------------
section('copy apply: create-only, size/hash verification, conflicts');
{
  const fresh = PREVIEW(UID, 1);
  const identical = PREVIEW(UID, 2);
  const differing = PREVIEW(UID, 3);
  const foreign = PREVIEW(UID, 4);
  const sized = PREVIEW(UID, 5);
  const fake = PREVIEW(UID, 6);
  const original = ORIGINAL(UID, 7);
  const objects = new Map<string, SourceObject>([
    [fresh, { bytes: JPEG(1), mime: 'image/jpeg' }],
    [identical, { bytes: JPEG(2), mime: 'image/jpeg' }],
    [differing, { bytes: JPEG(3), mime: 'image/jpeg' }],
    [foreign, { bytes: JPEG(4), mime: 'image/jpeg' }],
    [sized, { bytes: JPEG(5), mime: 'image/jpeg', listedSize: 999 }],
    [fake, { bytes: PNG(6), mime: 'image/jpeg' }],
    [original, { bytes: PNG(7), mime: 'image/png' }],
  ]);
  const stored = (bytes: Uint8Array, state: string, contentType = 'image/jpeg', origin = WORKSHOP_LEGACY_COPY_ORIGIN): TargetStored => ({
    bytes, contentType, cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL, md5: md5(bytes), metageneration: 2,
    custom: { [WORKSHOP_LEGACY_COPY_METADATA.origin]: origin, [WORKSHOP_LEGACY_COPY_METADATA.state]: state, [WORKSHOP_LEGACY_COPY_METADATA.sourceSha256]: sha(bytes) },
  });
  const foreignBytes = JPEG(44);
  const targetObjects = new Map<string, TargetStored>([
    [identical, stored(JPEG(2), 'verified')],
    [differing, stored(JPEG(33), 'verified')],
    [foreign, { ...stored(foreignBytes, 'verified'), custom: {} }],
  ]);
  const refs = mockRefs([...objects.keys()].map((p) => ['orders.ordered_items', [{ image: legacyUrl(p) }]] as [LegacyReferenceField, unknown]));
  const src = mockSource(objects);
  const tgt = mockTarget(targetObjects);
  const { report: r, logs } = await run(src.source, tgt.target, refs, APPLY);
  assert('fresh objects copied and verified (preview + original)', r.copied_verified === 2, JSON.stringify(r));
  assert('G existing identical verified copy -> matching, not rewritten', r.target_matching === 1 && !tgt.calls.create.includes(identical));
  assert('H differing verified copy -> conflict, never overwritten',
    targetObjects.get(differing)!.bytes[4] === 33 && !tgt.calls.create.includes(differing));
  assert('H foreign object without marker -> conflict, bytes untouched',
    targetObjects.get(foreign)!.bytes === foreignBytes && !tgt.calls.create.includes(foreign));
  assert('conflicts counted', r.target_conflict === 2);
  assert('size verification: listed vs downloaded mismatch -> not copied', r.source_size_mismatch === 1 && !targetObjects.has(sized));
  assert('content signature mismatch -> not copied', r.content_signature_mismatch === 1 && !targetObjects.has(fake));
  const copied = targetObjects.get(fresh)!;
  assert('copy metadata: content type from extension, private no-store',
    copied.contentType === 'image/jpeg' && copied.cacheControl === WORKSHOP_MEDIA_CACHE_CONTROL
    && targetObjects.get(original)!.contentType === 'image/png');
  assert('copy marked verified only after checks', copied.custom[WORKSHOP_LEGACY_COPY_METADATA.state] === 'verified'
    && copied.custom[WORKSHOP_LEGACY_COPY_METADATA.sourceSha256] === sha(JPEG(1)));
  assert('copy is at the same canonical path', targetObjects.has(fresh) && targetObjects.has(original));
  assert('resolvable count excludes conflicts and failures', r.referenced_legacy_resolvable_from_gcs === 3);
  assert('gate FAILS while conflicts exist', evaluateLegacyCutoverGate(r).failed.includes('no_target_conflict'));
  assert('no logs emitted during apply', logs.trim() === '');

  const corruptObjects = new Map<string, TargetStored>();
  const corrupt = mockTarget(corruptObjects, { corruptWrites: true });
  const cr = await run(mockSource(new Map([[fresh, { bytes: JPEG(1), mime: 'image/jpeg' }]])).source, corrupt.target,
    mockRefs([['cart_items.custom_image', legacyUrl(fresh)]]), APPLY);
  assert('hash verification: corrupted target never marked verified',
    cr.report.copied_verified === 0 && cr.report.target_conflict === 1
    && corruptObjects.get(fresh)!.custom[WORKSHOP_LEGACY_COPY_METADATA.state] === 'written' && corrupt.calls.mark.length === 0);

  const oversizeRef = mockRefs([['cart_items.custom_image', legacyUrl(fresh)]]);
  const big = new Uint8Array(5 * 1024 * 1024 + 1);
  big.set([0xff, 0xd8, 0xff]);
  const ov = await run(mockSource(new Map([[fresh, { bytes: big, mime: 'image/jpeg' }]])).source, mockTarget(new Map()).target, oversizeRef, APPLY);
  assert('preview over 5 MiB -> oversize, not copied', ov.report.oversize === 1 && ov.report.copied_verified === 0);
}

// ---------------------------------------------------------------------------
section('copy retry, idempotency, interrupted state, delta pass');
{
  const a = PREVIEW(UID, 1);
  const b = ORIGINAL(UID, 2, 'jpg');
  const objects = new Map<string, SourceObject>([[a, { bytes: JPEG(1), mime: 'image/jpeg' }], [b, { bytes: JPEG(2), mime: 'image/jpeg' }]]);
  const targetObjects = new Map<string, TargetStored>();
  const refValues: [LegacyReferenceField, unknown][] = [
    ['orders.ordered_items', [{ image: legacyUrl(a) }]],
    ['user_progress.uploaded_image_url', legacyUrl(b)],
  ];
  const src = mockSource(objects, { failDownloads: 2 });
  const tgt = mockTarget(targetObjects);
  const first = await run(src.source, tgt.target, mockRefs(refValues), APPLY);
  assert('transient download failures are retried', first.report.copied_verified === 2 && first.report.copy_failed_retryable === 0);
  assert('first apply: gate PASS', evaluateLegacyCutoverGate(first.report).pass, evaluateLegacyCutoverGate(first.report).failed.join(','));

  const creates = tgt.calls.create.length;
  const second = await run(src.source, tgt.target, mockRefs(refValues), APPLY);
  assert('re-run is idempotent: all matching, zero new writes', second.report.target_matching === 2 && tgt.calls.create.length === creates);

  const c = PREVIEW(UID, 3);
  objects.set(c, { bytes: JPEG(3), mime: 'image/jpeg' });
  refValues.push(['cart_items.custom_image', legacyUrl(c)]);
  const deltaDry = await run(src.source, tgt.target, mockRefs(refValues), VERIFY);
  assert('delta dry-run (verify bytes) finds exactly one new referenced object', deltaDry.report.target_missing === 1 && deltaDry.report.target_matching === 2);
  assert('delta dry-run gate FAILS until copied', !evaluateLegacyCutoverGate(deltaDry.report).pass);
  const delta = await run(src.source, tgt.target, mockRefs(refValues), APPLY);
  assert('delta apply copies only the new object', delta.report.copied_verified === 1 && delta.report.target_matching === 2);
  const finalDry = await run(src.source, tgt.target, mockRefs(refValues), VERIFY);
  assert('final verify-bytes dry-run: gate PASS', evaluateLegacyCutoverGate(finalDry.report).pass,
    evaluateLegacyCutoverGate(finalDry.report).failed.join(','));
  const metaOnly = await run(src.source, tgt.target, mockRefs(refValues), DRY);
  assert('metadata-only dry-run can never pass the gate', evaluateLegacyCutoverGate(metaOnly.report).failed.join(',') === 'byte_verified_run');

  const d = PREVIEW(UID, 4);
  const dBytes = JPEG(4);
  const half = new Map<string, TargetStored>([[d, {
    bytes: dBytes, contentType: 'image/jpeg', cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL, md5: md5(dBytes), metageneration: 1,
    custom: { [WORKSHOP_LEGACY_COPY_METADATA.origin]: WORKSHOP_LEGACY_COPY_ORIGIN, [WORKSHOP_LEGACY_COPY_METADATA.state]: 'written', [WORKSHOP_LEGACY_COPY_METADATA.sourceSha256]: sha(dBytes) },
  }]]);
  const halfSrc = mockSource(new Map([[d, { bytes: dBytes, mime: 'image/jpeg' }]]));
  const halfRefs = mockRefs([['cart_items.custom_image', legacyUrl(d)]]);
  const hDry = await run(halfSrc.source, mockTarget(half).target, halfRefs, DRY);
  assert('interrupted copy (written) -> dry-run reports unverified, not resolvable',
    hDry.report.target_unverified === 1 && hDry.report.referenced_legacy_resolvable_from_gcs === 0);
  const hApply = await run(halfSrc.source, mockTarget(half).target, halfRefs, APPLY);
  assert('interrupted copy -> apply verifies bytes and promotes', hApply.report.target_promoted === 1
    && half.get(d)!.custom[WORKSHOP_LEGACY_COPY_METADATA.state] === 'verified');

  const gone = PREVIEW(UID, 5);
  const goneBytes = JPEG(5);
  const kept = new Map<string, TargetStored>([[gone, {
    bytes: goneBytes, contentType: 'image/jpeg', cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL, md5: md5(goneBytes), metageneration: 3,
    custom: { [WORKSHOP_LEGACY_COPY_METADATA.origin]: WORKSHOP_LEGACY_COPY_ORIGIN, [WORKSHOP_LEGACY_COPY_METADATA.state]: 'verified', [WORKSHOP_LEGACY_COPY_METADATA.sourceSha256]: sha(goneBytes) },
  }]]);
  const goneRun = await run(mockSource(new Map()).source, mockTarget(kept).target, mockRefs([['orders.ordered_items', [{ image: legacyUrl(gone) }]]]), VERIFY);
  assert('referenced object already copied, source gone -> resolvable, not missing',
    goneRun.report.referenced_legacy_resolvable_from_gcs === 1 && goneRun.report.referenced_missing_source === 0);
}

// ---------------------------------------------------------------------------
section('copy semantics: active orders, withdrawal, retention, bridge readiness');
{
  const oldOrder = PREVIEW(UID, 1);
  const withdrawnOrder = PREVIEW(OTHER, 2);
  const withdrawnCart = PREVIEW(OTHER, 3);
  const purgedLeftover = PREVIEW(UID, 4);
  const objects = new Map<string, SourceObject>([
    [oldOrder, { bytes: JPEG(1), mime: 'image/jpeg' }],
    [withdrawnOrder, { bytes: JPEG(2), mime: 'image/jpeg' }],
    [withdrawnCart, { bytes: JPEG(3), mime: 'image/jpeg' }],
    [purgedLeftover, { bytes: JPEG(4), mime: 'image/jpeg' }],
  ]);
  // Scan contents = rows that exist: withdrawn user's cart rows were deleted by NEW4-7; purged orders are filtered (image_purged_at IS NULL).
  const refs = mockRefs([
    ['orders.ordered_items', [{ image: legacyUrl(oldOrder) }]],
    ['payment_intents.validated_snapshot', { ordered_items: [{ image: legacyUrl(withdrawnOrder) }] }],
  ]);
  const targetObjects = new Map<string, TargetStored>();
  const tgt = mockTarget(targetObjects);
  const { report: r } = await run(mockSource(objects).source, tgt.target, refs, APPLY);
  assert('active order reference copied regardless of object age', targetObjects.has(oldOrder));
  assert('withdrawn account: retained transaction evidence stays bridgeable', targetObjects.has(withdrawnOrder));
  assert('withdrawn account: deleted cart asset not resurrected', !targetObjects.has(withdrawnCart));
  assert('purged-order leftovers not copied (retention domain)', !targetObjects.has(purgedLeftover) && r.unreferenced_source === 2);

  const gcsStore: WorkshopGcsObjectStore = {
    name: 'gcs',
    async listObjects() { return []; },
    async remove() { throw new Error('not used'); },
    async signUpload() { throw new Error('not used'); },
    async head(p) {
      const h = await tgt.target.head(p);
      return h ? { path: p, sizeBytes: h.sizeBytes, contentType: h.contentType, cacheControl: h.cacheControl, createdAtMs: null, legacyCopy: h.copyState } : null;
    },
    async signRead(p) {
      return { url: FAKE_SIGNED(p), expiresAt: new Date(Date.now() + 300_000).toISOString() };
    },
  };
  const readiness = await signRead(
    { gcs: gcsStore, references: refsFor({ orders: [{ ordered_items: [{ image: legacyUrl(oldOrder) }] }] }).source, legacyHosts: HOSTS, legacyFallback: false },
    [legacyUrl(oldOrder)],
  );
  assert('post-copy bridge readiness: copied legacy ref resolves from GCS with fallback off', readiness.items[0]?.store === 'gcs');
}

// ---------------------------------------------------------------------------
section('copy tool static safety');
{
  const core = fs.readFileSync(path.join(root, 'scripts/workshop-legacy-copy-core.ts'), 'utf8');
  const cli = fs.readFileSync(path.join(root, 'scripts/workshop-legacy-copy.ts'), 'utf8');
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const both = code(core) + code(cli);
  assert('no delete / remove / move capability', !/\.(remove|delete|move|deleteFiles|rename)\(/.test(both));
  assert('no bucket, IAM or storage-policy mutation',
    !/(updateBucket|setIamPolicy|\.iam\.(setPolicy|getPolicy)|makePrivate|makePublic|setStorageClass|createBucket|deleteBucket|\.bucket\([^)]*\)\.setMetadata|storage\.objects|create policy|drop policy|alter policy)/i.test(both));
  assert('no SQL / DB writes in the CLI', !/\.(insert|update|upsert|rpc)\(/.test(code(cli)));
  assert('core has no Supabase / GCS client of its own', !/@supabase\/supabase-js|@google-cloud\/storage/.test(core));
  assert('create-only write (ifGenerationMatch 0)', /preconditionOpts: \{ ifGenerationMatch: 0 \}/.test(cli));
  assert('upload validated by MD5 and single-request', /validation: 'md5'/.test(cli) && /resumable: false/.test(cli));
  assert('metadata change guarded by metageneration', /ifMetagenerationMatch/.test(cli));
  assert('source read via authenticated Storage download, never a public URL', /bucket\.download\(path\)/.test(cli) && !/getPublicUrl|\/object\/public\//.test(code(cli)));
  assert('no .env loading; no filesystem manifest', !/dotenv/.test(cli) && !/from 'node:fs'|from 'fs'/.test(core + cli));
  assert('GCS identity pinned to the copy job SA', /credentials\.client_email !== LEGACY_COPY_JOB_SA/.test(cli) && LEGACY_COPY_JOB_SA.startsWith('workshop-legacy-copy@'));
  assert('GCS target pinned to approved bucket + Seoul regional endpoint', /WORKSHOP_GCS_APPROVED_BUCKET/.test(cli) && /resolveRegionalEndpointHost/.test(cli));
  assert('CLI prints only the aggregate report or reason codes',
    (cli.match(/console\.(log|error)\(/g) ?? []).length === 6 && /console\.log\(formatLegacyCopyReport\(report\)\)/.test(cli));
  assert('orders scan excludes purged orders', /purgedFilter: true/.test(cli) && /is\('image_purged_at', null\)/.test(cli));
  assert('reference scan uses keyset paging', /\.gt\(spec\.key, last\)/.test(cli));
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert('no manifest path exists in the repo', !fs.existsSync(path.join(root, 'workshop-legacy-copy-manifest.json')) && typeof gitignore === 'string');
}

// ---------------------------------------------------------------------------
const groups = [...new Set(results.map((r) => r.group))];
console.log('');
for (const g of groups) {
  const rows = results.filter((r) => r.group === g);
  console.log(`${g}: ${rows.filter((r) => r.pass).length}/${rows.length}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\nNEW4-4D-9 LEGACY COPY + BRIDGE: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
