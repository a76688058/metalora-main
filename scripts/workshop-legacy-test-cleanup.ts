/**
 * NEW4-4D-9E — one-shot deletion of the owner-confirmed legacy Workshop TEST uploads (A6).
 *
 * Scope is fixed in code: the 22 unreferenced root-level objects of the production Supabase
 * `workshop` bucket, identified by the NEW4-4D-9D-4A aggregate fingerprint. Flow, in one process:
 *   1. metadata-only pre-check (bucket listing + DB reference scan); the root-level file names are
 *      captured from that same listing;
 *   2. every pre-check condition AND the aggregate fingerprint of the captured set must match, else
 *      nothing is deleted;
 *   3. delete exactly the captured names (never a prefix, folder or anything listed later);
 *   4. metadata-only post-check.
 * No object body is read, no GCS access, nothing copied. Output: aggregate counters only.
 * Runs once as a Cloud Run Job with the service-role key injected as a secret reference; refuses any
 * argument and the payment-test project.
 */
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { WORKSHOP_BUCKET, legacySupabaseHosts } from '../src/lib/workshopStorage';
import {
  LEGACY_COPY_PLACEHOLDER,
  LegacyCopyError,
  PRODUCTION_SUPABASE_PROJECT_REF,
  emptyLegacySourceStructure,
  recordLegacySourceStructure,
  runLegacyCopy,
  type LegacyCopyReport,
  type LegacyReferenceSource,
  type LegacySource,
  type LegacySourceEntry,
  type LegacySourceStructure,
  type LegacyTarget,
} from './workshop-legacy-copy-core';
import { createSupabaseLegacyMetadataSource, createSupabaseLegacyReferenceSource } from './workshop-legacy-copy';

/** Owner-approved set (NEW4-4D-9D-4A aggregates). Any difference stops the run before deletion. */
export const TEST_CLEANUP_EXPECTED = {
  objects: 22,
  bytes: 39_808_349,
  extension: { jpeg: 11, jpg: 2, png: 8, webp: 1 },
  mime: { 'image/jpeg': 13, 'image/png': 8, 'image/webp': 1 },
} as const;

export type TestCleanupRemover = (names: string[]) => Promise<number>;

export type TestCleanupDeps = {
  source: LegacySource;
  references: LegacyReferenceSource;
  legacyHosts: readonly string[];
  remove: TestCleanupRemover;
  now?: () => number;
};

export type TestCleanupResult = {
  status: 'deleted' | 'refused_precheck' | 'delete_incomplete' | 'postcheck_mismatch';
  precheck_failed: string[];
  approved_set_size: number;
  deleted: number;
  post_source_objects_total: number | null;
  post_referenced_legacy_total: number | null;
  post_referenced_canonical_total: number | null;
  post_referenced_missing_source: number | null;
  post_inventory_complete: boolean | null;
  byte_read_attempts: number;
};

const sameCounts = (actual: Record<string, number>, expected: Record<string, number>) =>
  Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([k, n]) => actual[k] === n);

function fingerprintChecks(s: LegacySourceStructure, label: string): [string, boolean][] {
  const e = TEST_CLEANUP_EXPECTED;
  return [
    [`${label}_objects`, s.objects === e.objects],
    [`${label}_all_root_level`, s.depth.root_file === e.objects && s.root.root_file === e.objects],
    [`${label}_no_prefix`, s.depth.one_level === 0 && s.depth.two_level === 0 && s.depth.deeper === 0 && s.top_prefixes.distinct === 0],
    [`${label}_no_canonical`, s.root.canonical_root === 0],
    [`${label}_bytes`, s.size.total === e.bytes && s.size.unknown === 0],
    [`${label}_extensions`, sameCounts(s.extension, e.extension)],
    [`${label}_mime`, sameCounts(s.mime, e.mime)],
    [`${label}_age_90_365`, s.age.d90_365 === e.objects],
    [`${label}_unreferenced`, s.db_referenced === 0 && s.db_unreferenced === e.objects],
  ];
}

/** All conditions for deleting; returns the names of the failed checks (empty = pass). */
export function evaluateTestCleanupPrecheck(r: LegacyCopyReport, captured: LegacySourceStructure): string[] {
  const checks: [string, boolean][] = [
    ['reference_scan_complete', r.reference_scan_complete && r.reference_lookup_errors === 0 && r.tables_absent === 0],
    ['source_inventory_complete', r.source_inventory_complete && r.source_list_errors === 0],
    ['source_objects_total', r.source_objects_total === TEST_CLEANUP_EXPECTED.objects],
    ['canonical_originals_previews_zero', r.originals_total === 0 && r.previews_total === 0 && r.canonical_bridgeable === 0],
    ['referenced_legacy_total_zero', r.referenced_legacy_total === 0],
    ['referenced_canonical_total_zero', r.canonical_refs === 0],
    ['malformed_referenced_zero', r.malformed_referenced === 0],
    ['non_uuid_referenced_zero', r.non_uuid_referenced === 0],
    ['referenced_missing_source_zero', r.referenced_missing_source === 0],
    ['unrecognized_referenced_zero', r.unrecognized_referenced === 0 && r.foreign_host_referenced === 0],
    ['no_byte_read', r.byte_read_attempts === 0 && r.write_attempts === 0],
    ...fingerprintChecks(r.source_structure, 'inventory'),
    ...fingerprintChecks(captured, 'delete_set'),
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

/** No GCS in this flow: every target port refuses and there is no inventory. */
const NO_TARGET: LegacyTarget = {
  head: async () => null,
  createOnly: async () => { throw new LegacyCopyError('no_target', false); },
  download: async () => { throw new LegacyCopyError('no_target', false); },
  markVerified: async () => { throw new LegacyCopyError('no_target', false); },
};

async function metadataCheck(deps: TestCleanupDeps, source: LegacySource): Promise<LegacyCopyReport> {
  return runLegacyCopy({
    source,
    target: NO_TARGET,
    references: deps.references,
    legacyHosts: deps.legacyHosts,
    args: { mode: 'dry-run', verifyBytes: false, concurrency: 1, metadataOnly: true },
    now: deps.now,
  });
}

export async function runLegacyTestCleanup(deps: TestCleanupDeps): Promise<TestCleanupResult> {
  const nowMs = (deps.now ?? Date.now)();
  const rootFiles = new Map<string, LegacySourceEntry>();
  // Same listing as the pre-check: root-level file names are captured as they are counted.
  const capturing: LegacySource = {
    ...deps.source,
    async list(prefix, offset, limit) {
      const page = await deps.source.list(prefix, offset, limit);
      if (prefix === '') {
        for (const e of page) if (!e.isFolder && e.name !== LEGACY_COPY_PLACEHOLDER) rootFiles.set(e.name, e);
      }
      return page;
    },
  };
  const pre = await metadataCheck(deps, capturing);
  const captured = emptyLegacySourceStructure();
  const tracker = { top: new Set<string>(), second: new Set<string>() };
  for (const [name, entry] of rootFiles) recordLegacySourceStructure(captured, tracker, name, entry, false, nowMs);
  const result: TestCleanupResult = {
    status: 'refused_precheck',
    precheck_failed: evaluateTestCleanupPrecheck(pre, captured),
    approved_set_size: rootFiles.size,
    deleted: 0,
    post_source_objects_total: null,
    post_referenced_legacy_total: null,
    post_referenced_canonical_total: null,
    post_referenced_missing_source: null,
    post_inventory_complete: null,
    byte_read_attempts: pre.byte_read_attempts,
  };
  const names = [...rootFiles.keys()];
  if (names.some((n) => n.includes('/') || n.length === 0)) result.precheck_failed.push('delete_set_root_names');
  if (result.precheck_failed.length > 0) return result;

  try {
    result.deleted = await deps.remove(names);
  } catch {
    result.deleted = 0;
  }

  const post = await metadataCheck(deps, deps.source);
  result.byte_read_attempts += post.byte_read_attempts;
  result.post_source_objects_total = post.source_objects_total;
  result.post_referenced_legacy_total = post.referenced_legacy_total;
  result.post_referenced_canonical_total = post.canonical_refs;
  result.post_referenced_missing_source = post.referenced_missing_source;
  result.post_inventory_complete = post.reference_scan_complete && post.source_inventory_complete;
  if (result.deleted !== names.length) result.status = 'delete_incomplete';
  else if (!result.post_inventory_complete || post.source_objects_total !== 0 || post.referenced_legacy_total !== 0
    || post.canonical_refs !== 0 || post.referenced_missing_source !== 0) result.status = 'postcheck_mismatch';
  else result.status = 'deleted';
  return result;
}

/** Exact-name removal in one request; returns how many objects the Storage API reports deleted. */
export function createSupabaseTestCleanupRemover(admin: SupabaseClient): TestCleanupRemover {
  return async (names) => {
    const { data, error } = await admin.storage.from(WORKSHOP_BUCKET).remove(names);
    if (error) throw new LegacyCopyError('test_cleanup_remove', false);
    return (data ?? []).length;
  };
}

export const TEST_CLEANUP_EXIT = { deleted: 0, refused_precheck: 4, delete_incomplete: 5, postcheck_mismatch: 6 } as const;

export async function main(argv: readonly string[]): Promise<number> {
  if (argv.length > 0) {
    console.error(JSON.stringify({ status: 'refused', reason: 'arguments_not_accepted' }));
    return 2;
  }
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const hosts = legacySupabaseHosts(supabaseUrl);
  if (hosts[0] !== `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`) {
    console.error(JSON.stringify({ status: 'refused', reason: 'unexpected_source_project' }));
    return 2;
  }
  if (!serviceKey) {
    console.error(JSON.stringify({ status: 'refused', reason: 'missing_supabase_service_credential' }));
    return 2;
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await runLegacyTestCleanup({
    source: createSupabaseLegacyMetadataSource(admin),
    references: createSupabaseLegacyReferenceSource(admin),
    legacyHosts: hosts,
    remove: createSupabaseTestCleanupRemover(admin),
  });
  console.log(JSON.stringify(result, null, 2));
  return TEST_CLEANUP_EXIT[result.status];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    () => {
      console.error(JSON.stringify({ status: 'error', reason_class: 'unhandled' }));
      process.exit(1);
    },
  );
}
