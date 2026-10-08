/**
 * NEW4-4D-9E — legacy Workshop TEST-upload cleanup: local checks.
 * Synthetic data and in-memory mocks only. No Supabase / network, no customer data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LegacyReferenceField, LegacyReferenceSource, LegacySource, LegacySourceEntry } from './workshop-legacy-copy-core';
import { TEST_CLEANUP_EXIT, TEST_CLEANUP_EXPECTED, runLegacyTestCleanup } from './workshop-legacy-test-cleanup';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results: { name: string; pass: boolean }[] = [];
function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ name, pass: condition });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${!condition && detail ? ` - ${detail}` : ''}`);
}

const NOW = Date.parse('2026-10-08T00:00:00Z');
const AGE_200D = new Date(NOW - 200 * 86_400_000).toISOString();
const HOST = 'qifloweuwyhvukabgnoa.supabase.co';
const UID = '0e9a1111-1111-4111-8111-111111111111';
const NAME = (i: number, ext: string) => `test-upload-secret-${String(i).padStart(2, '0')}.${ext}`;

type Obj = { size: number; mime: string; createdAt: string };

/** Synthetic set matching the approved fingerprint: 22 root files, 39 808 349 bytes. */
function approvedSet(): Map<string, Obj> {
  const exts: [string, string][] = [
    ...Array.from({ length: 11 }, (): [string, string] => ['jpeg', 'image/jpeg']),
    ...Array.from({ length: 2 }, (): [string, string] => ['jpg', 'image/jpeg']),
    ...Array.from({ length: 8 }, (): [string, string] => ['png', 'image/png']),
    ['webp', 'image/webp'],
  ];
  const m = new Map<string, Obj>();
  let remaining = TEST_CLEANUP_EXPECTED.bytes;
  exts.forEach(([ext, mime], i) => {
    const size = i === exts.length - 1 ? remaining : 1_800_000;
    remaining -= size;
    m.set(NAME(i, ext), { size, mime, createdAt: AGE_200D });
  });
  return m;
}

function fakeBucket(objects: Map<string, Obj>, options: { removeLimit?: number; removeThrows?: boolean; addDuringDelete?: string } = {}) {
  const calls = { list: [] as string[], removed: [] as string[][], download: 0 };
  const source: LegacySource = {
    async list(prefix, offset, limit) {
      calls.list.push(prefix);
      const base = prefix ? `${prefix}/` : '';
      const children = new Map<string, LegacySourceEntry>();
      for (const [p, o] of objects) {
        if (!p.startsWith(base)) continue;
        const [head, ...tail] = p.slice(base.length).split('/');
        if (tail.length > 0) children.set(head, { name: head, isFolder: true, sizeBytes: null, mimeType: null });
        else children.set(head, { name: head, isFolder: false, sizeBytes: o.size, mimeType: o.mime, createdAt: o.createdAt });
      }
      return [...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit);
    },
    async download() { calls.download += 1; throw new Error('body read reached the adapter'); },
    async bucketInfo() { return { exists: true, public: true, fileSizeLimit: null, allowedMimeTypes: null }; },
  };
  const remove = async (names: string[]) => {
    calls.removed.push([...names]);
    if (options.removeThrows) throw new Error(`storage error for ${names[0]}`);
    let n = 0;
    for (const name of names.slice(0, options.removeLimit ?? names.length)) if (objects.delete(name)) n += 1;
    if (options.addDuringDelete) objects.set(options.addDuringDelete, { size: 10, mime: 'image/png', createdAt: new Date(NOW).toISOString() });
    return n;
  };
  return { source, remove, calls };
}

const refs = (values: [LegacyReferenceField, unknown][] = []): LegacyReferenceSource => ({
  async scan(onValue) {
    for (const [f, v] of values) onValue(f, v);
    return { tablesAbsent: [], failures: [], ordersPurgeColumnAbsent: true };
  },
});

async function runCase(objects: Map<string, Obj>, refSource = refs(), options = {}) {
  const b = fakeBucket(objects, options);
  const logs: string[] = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => logs.push(a.join(' '));
  console.error = console.log;
  try {
    const r = await runLegacyTestCleanup({ source: b.source, references: refSource, legacyHosts: [HOST], remove: b.remove, now: () => NOW });
    return { r, b, logs: logs.join('\n') };
  } finally {
    Object.assign(console, orig);
  }
}

// Happy path: exact set deleted, post-check 0.
{
  const set = approvedSet();
  const names = [...set.keys()];
  const { r, b, logs } = await runCase(set);
  assert('approved fingerprint -> status deleted, 22 deleted', r.status === 'deleted' && r.deleted === 22 && r.precheck_failed.length === 0, JSON.stringify(r));
  assert('one remove call with exactly the captured 22 root names', b.calls.removed.length === 1
    && b.calls.removed[0].length === 22 && names.every((n) => b.calls.removed[0].includes(n)));
  assert('post-check: 0 objects, references 0, complete', r.post_source_objects_total === 0 && r.post_referenced_legacy_total === 0
    && r.post_referenced_canonical_total === 0 && r.post_referenced_missing_source === 0 && r.post_inventory_complete === true);
  assert('no body read', b.calls.download === 0 && r.byte_read_attempts === 0);
  const printed = JSON.stringify(r);
  assert('result has no names / paths / UUID / URL', !/test-upload-secret|https?:|\//.test(printed) && !printed.includes(UID) && logs.trim() === '');
  const exits: number[] = Object.values(TEST_CLEANUP_EXIT);
  assert('exit code 0 only for deleted', TEST_CLEANUP_EXIT.deleted === 0 && exits.filter((c) => c === 0).length === 1);
}

// Every mismatch refuses before any deletion.
const mismatches: [string, (m: Map<string, Obj>) => void, LegacyReferenceSource?][] = [
  ['23 objects (new root file)', (m) => m.set('extra.png', { size: 1, mime: 'image/png', createdAt: AGE_200D })],
  ['21 objects', (m) => m.delete([...m.keys()][0])],
  ['object under originals/', (m) => m.set(`originals/${UID}/0e9b0001-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`, { size: 1, mime: 'image/png', createdAt: AGE_200D })],
  ['object in a subfolder', (m) => m.set('folder/x.png', { size: 1, mime: 'image/png', createdAt: AGE_200D })],
  ['bytes differ', (m) => { const [k, v] = [...m.entries()][0]; m.set(k, { ...v, size: v.size + 1 }); }],
  ['extension mix differs', (m) => { const k = [...m.keys()].find((n) => n.endsWith('.jpg'))!; const v = m.get(k)!; m.delete(k); m.set(k.replace('.jpg', '.jpeg'), v); }],
  ['MIME differs', (m) => { const [k, v] = [...m.entries()][0]; m.set(k, { ...v, mime: 'image/png' }); }],
  ['age differs (new object)', (m) => { const [k, v] = [...m.entries()][0]; m.set(k, { ...v, createdAt: new Date(NOW).toISOString() }); }],
  ['DB reference to a root object', () => undefined, refs([['cart_items.custom_image', `https://${HOST}/storage/v1/object/public/workshop/${NAME(0, 'jpeg')}`]])],
  ['DB reference to a canonical path', () => undefined, refs([['cart_items.custom_image', `previews/${UID}/0e9b0002-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`]])],
  ['legacy reference (missing source)', () => undefined, refs([['orders.ordered_items', `https://${HOST}/storage/v1/object/public/workshop/previews/${UID}/0e9b0003-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`]])],
  ['reference scan failure', () => undefined, { async scan() { return { tablesAbsent: [], failures: [{ table: 'orders', code: '57014' }] }; } }],
  ['reference source aborts', () => undefined, { async scan() { throw new Error('db down'); } }],
];
for (const [label, mutate, refSource] of mismatches) {
  const set = approvedSet();
  mutate(set);
  const before = set.size;
  const { r, b } = await runCase(set, refSource ?? refs());
  assert(`refuse + delete nothing: ${label}`, r.status === 'refused_precheck' && r.deleted === 0 && b.calls.removed.length === 0
    && set.size === before && r.precheck_failed.length > 0, JSON.stringify(r.precheck_failed));
}
{
  const set = approvedSet();
  const b = fakeBucket(set);
  const failing: LegacySource = { ...b.source, list: async () => { throw new Error('list failed'); } };
  const r = await runLegacyTestCleanup({ source: failing, references: refs(), legacyHosts: [HOST], remove: b.remove, now: () => NOW });
  assert('refuse + delete nothing: source listing failure', r.status === 'refused_precheck' && b.calls.removed.length === 0);
}

// Partial / failed deletion and post-check mismatch are reported, never retried or widened.
{
  const { r, b } = await runCase(approvedSet(), refs(), { removeLimit: 20 });
  assert('partial delete -> delete_incomplete, single call, remaining count reported',
    r.status === 'delete_incomplete' && r.deleted === 20 && r.post_source_objects_total === 2 && b.calls.removed.length === 1);
  const t = await runCase(approvedSet(), refs(), { removeThrows: true });
  assert('remove error -> delete_incomplete (0), error text not in result',
    t.r.status === 'delete_incomplete' && t.r.deleted === 0 && !JSON.stringify(t.r).includes('storage error') && t.b.calls.removed.length === 1);
  const n = await runCase(approvedSet(), refs(), { addDuringDelete: 'new-during-op.png' });
  assert('object appearing during the operation -> postcheck_mismatch, count reported, not deleted',
    n.r.status === 'postcheck_mismatch' && n.r.deleted === 22 && n.r.post_source_objects_total === 1 && n.b.calls.removed.length === 1
    && !n.b.calls.removed[0].includes('new-during-op.png'));
}

// Static: fixed entrypoint, no arguments, production only, no GCS, no other mutation.
{
  const src = fs.readFileSync(path.join(root, 'scripts/workshop-legacy-test-cleanup.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert('refuses any argument', /if \(argv\.length > 0\)/.test(code) && /main\(process\.argv\.slice\(2\)\)/.test(code));
  assert('production project only (payment-test refused by host pin)', /hosts\[0\] !== `\$\{PRODUCTION_SUPABASE_PROJECT_REF\}\.supabase\.co`/.test(code));
  assert('single mutation = Storage remove of the captured names',
    (code.match(/\.from\(WORKSHOP_BUCKET\)\.remove\(names\)/g) ?? []).length === 1 && (code.match(/\.remove\(/g) ?? []).length === 2
    && /await deps\.remove\(names\)/.test(code)
    && !/\.(upload|update|move|copy|insert|upsert|delete|rpc|createBucket|updateBucket|emptyBucket|deleteBucket)\(/.test(code));
  assert('no GCS client, no body download, no .env', !/@google-cloud\/storage|google-auth-library|\.download\(|dotenv/.test(code));
  assert('expected fingerprint pinned in code', /bytes: 39_808_349/.test(code) && /jpeg: 11, jpg: 2, png: 8, webp: 1/.test(code)
    && /'image\/jpeg': 13, 'image\/png': 8, 'image\/webp': 1/.test(code));
  assert('prints only the aggregate result', (code.match(/console\.(log|error)\(/g) ?? []).length === 5 && /console\.log\(JSON\.stringify\(result, null, 2\)\)/.test(code));
  const docker = fs.readFileSync(path.join(root, 'Dockerfile.workshop-test-cleanup'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert('image: fixed cleanup entrypoint, no CMD / ARG / secrets, only the needed sources',
    /ENTRYPOINT \["\.\/node_modules\/\.bin\/tsx", "scripts\/workshop-legacy-test-cleanup\.ts"\]/.test(docker) && !/^CMD |^ARG /m.test(docker)
    && !/SUPABASE|SERVICE_ROLE|KEY|TOKEN|SECRET/i.test(docker) && (docker.match(/^COPY /gm) ?? []).length === 3
    && !/server\.ts|dist|\.env|src\/components|COPY \. /.test(docker) && /USER node/.test(docker));
}

const failed = results.filter((r) => !r.pass);
console.log(`\nNEW4-4D-9E TEST CLEANUP: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
