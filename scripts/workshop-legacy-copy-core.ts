/**
 * NEW4-4D-9 — legacy Supabase Workshop → private Seoul GCS copy (core, no I/O of its own).
 *
 * Copies only DB-referenced objects whose legacy path is already a strict canonical path, to the
 * same path in GCS, create-only, then verifies size + GCS MD5 + a SHA-256 re-read of the target
 * before marking the copy `verified` (the only state the sign-read bridge serves).
 *
 * Never deletes, never changes buckets or policies, never rewrites DB rows. Reports aggregate
 * counters only: no UID, order id, object path or URL ever leaves this module.
 */
import { createHash } from 'node:crypto';
import {
  WORKSHOP_LEGACY_COPY_METADATA,
  WORKSHOP_LEGACY_COPY_ORIGIN,
  WORKSHOP_MEDIA_CACHE_CONTROL,
  WORKSHOP_UPLOAD_CAPS,
  contentTypeForExtension,
  isBridgeableLegacyCopy,
  isWorkshopMediaOrSignedValue,
  parseCanonicalWorkshopPath,
  parseWorkshopRef,
  workshopStoragePathFromUrl,
  type ParsedWorkshopRef,
  type WorkshopLegacyCopyState,
} from '../src/lib/workshopStorage';

export const LEGACY_COPY_ROOTS = ['originals', 'previews'] as const;
export const LEGACY_COPY_PAGE_SIZE = 1000;
export const LEGACY_COPY_MAX_DEPTH = 6;
export const LEGACY_COPY_MAX_ATTEMPTS = 3;
export const LEGACY_COPY_PLACEHOLDER = '.emptyFolderPlaceholder';
export const PRODUCTION_SUPABASE_PROJECT_REF = 'qifloweuwyhvukabgnoa';
export const PAYMENT_TEST_SUPABASE_PROJECT_REF = 'bvihpoorwriejybixmoc';
/** Future dedicated job identity (not provisioned). */
export const LEGACY_COPY_JOB_SA = 'workshop-legacy-copy@metalora-auth.iam.gserviceaccount.com';

export const LEGACY_COPY_FLAGS = {
  dryRun: '--dry-run',
  apply: '--apply',
  confirm: '--confirm-production-copy',
  verifyBytes: '--verify-bytes',
  ackReadOnly: '--ack-readonly-production-inventory',
  concurrency: '--concurrency',
  metadataOnly: '--metadata-only',
} as const;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export class LegacyCopyError extends Error {
  constructor(
    readonly op: string,
    readonly retryable: boolean,
    readonly missing = false,
  ) {
    super(`legacy_copy_${op}_failed`);
  }
}

export type LegacySourceEntry = {
  name: string;
  isFolder: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
};

export type LegacySourceBucketInfo = {
  exists: boolean;
  public: boolean | null;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
};

/** Read-only view of the Supabase `workshop` bucket. No write/delete/policy methods by design. */
export interface LegacySource {
  list(prefix: string, offset: number, limit: number): Promise<LegacySourceEntry[]>;
  download(path: string, maxBytes: number): Promise<Uint8Array>;
  bucketInfo?(): Promise<LegacySourceBucketInfo>;
}

export type LegacyTargetInventory = { objects: number; markerVerified: number; markerWritten: number };

export type LegacyTargetObject = {
  sizeBytes: number;
  contentType: string | null;
  cacheControl: string | null;
  /** GCS `md5Hash` (base64 MD5 of the stored bytes; single-request uploads are non-composite). */
  md5Base64: string | null;
  copyState: WorkshopLegacyCopyState | null;
  sourceSha256: string | null;
  metageneration: string | null;
};

export type LegacyTargetWrite = { contentType: string; md5Base64: string; sha256Hex: string };

/** GCS target. Create-only writes and a metadata-only state change; no delete method by design. */
export interface LegacyTarget {
  head(path: string): Promise<LegacyTargetObject | null>;
  createOnly(path: string, bytes: Uint8Array, write: LegacyTargetWrite): Promise<'created' | 'exists'>;
  download(path: string, maxBytes: number): Promise<Uint8Array>;
  markVerified(path: string, metageneration: string | null): Promise<void>;
  /** Bucket-wide object count + copy-marker counts from listing metadata (no object bodies). */
  inventory?(): Promise<LegacyTargetInventory>;
}

export const LEGACY_REFERENCE_FIELDS = [
  'user_progress.uploaded_image_url',
  'cart_items.custom_image',
  'cart_items.custom_config.original_image_url',
  'cart_items.custom_config.preview_image_url',
  'orders.ordered_items',
  'payment_intents.validated_snapshot',
] as const;
export type LegacyReferenceField = (typeof LEGACY_REFERENCE_FIELDS)[number];
export type LegacyReferenceTable = 'user_progress' | 'cart_items' | 'orders' | 'payment_intents';

/** Read-only DB scan. Orders: `image_purged_at IS NULL` only (NEW4-6: purged evidence holds no images). */
export interface LegacyReferenceSource {
  scan(onValue: (field: LegacyReferenceField, value: unknown) => void): Promise<{ tablesAbsent: LegacyReferenceTable[] }>;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export type LegacyCopyMode = 'dry-run' | 'apply';
/**
 * `metadataOnly`: listing / DB / GCS metadata only. The run swaps every byte-read and write port for
 * a guard that throws, so no object body is fetched and nothing is written even if a branch tried.
 */
export type LegacyCopyArgs = { mode: LegacyCopyMode; verifyBytes: boolean; concurrency: number; metadataOnly?: boolean };

export function parseLegacyCopyArgs(
  argv: readonly string[],
  sourceProjectRef: string | null,
): { ok: true; args: LegacyCopyArgs } | { ok: false; reason: string } {
  let dryRun = false;
  let apply = false;
  let verifyBytes = false;
  let ack = false;
  let confirm: string | null = null;
  let concurrency = 4;
  let metadataOnly = false;
  for (const arg of argv) {
    if (arg === LEGACY_COPY_FLAGS.dryRun) dryRun = true;
    else if (arg === LEGACY_COPY_FLAGS.metadataOnly) metadataOnly = true;
    else if (arg === LEGACY_COPY_FLAGS.apply) apply = true;
    else if (arg === LEGACY_COPY_FLAGS.verifyBytes) verifyBytes = true;
    else if (arg === LEGACY_COPY_FLAGS.ackReadOnly) ack = true;
    else if (arg.startsWith(`${LEGACY_COPY_FLAGS.confirm}=`)) confirm = arg.slice(LEGACY_COPY_FLAGS.confirm.length + 1);
    else if (arg.startsWith(`${LEGACY_COPY_FLAGS.concurrency}=`)) {
      const n = Number(arg.slice(LEGACY_COPY_FLAGS.concurrency.length + 1));
      if (!Number.isInteger(n) || n < 1 || n > 8) return { ok: false, reason: 'invalid_concurrency' };
      concurrency = n;
    } else return { ok: false, reason: 'unknown_argument' };
  }
  if (!ack) return { ok: false, reason: 'readonly_ack_required' };
  if (sourceProjectRef === PAYMENT_TEST_SUPABASE_PROJECT_REF) return { ok: false, reason: 'payment_test_project_refused' };
  if (sourceProjectRef !== PRODUCTION_SUPABASE_PROJECT_REF) return { ok: false, reason: 'unexpected_source_project' };
  if (apply && dryRun) return { ok: false, reason: 'conflicting_modes' };
  if (metadataOnly) {
    if (apply || verifyBytes || confirm !== null) return { ok: false, reason: 'metadata_only_conflict' };
    return { ok: true, args: { mode: 'dry-run', verifyBytes: false, concurrency, metadataOnly: true } };
  }
  if (!apply) {
    if (confirm !== null) return { ok: false, reason: 'confirm_without_apply' };
    return { ok: true, args: { mode: 'dry-run', verifyBytes, concurrency } };
  }
  if (confirm !== PRODUCTION_SUPABASE_PROJECT_REF) return { ok: false, reason: 'apply_confirmation_required' };
  return { ok: true, args: { mode: 'apply', verifyBytes: true, concurrency } };
}

// ---------------------------------------------------------------------------
// Report (aggregate counters only)
// ---------------------------------------------------------------------------

export type LegacyCopyReport = {
  mode: LegacyCopyMode;
  byte_verified: boolean;
  // DB references
  reference_values_scanned: number;
  canonical_refs: number;
  referenced_legacy_total: number;
  legacy_ref_occurrences: number;
  malformed_referenced: number;
  foreign_host_referenced: number;
  unrecognized_referenced: number;
  tables_absent: number;
  // source inventory
  source_objects_total: number;
  source_bytes_total: number;
  placeholder_ignored: number;
  canonical_bridgeable: number;
  noncanonical_filename: number;
  noncanonical_referenced_source: number;
  unexpected_prefix: number;
  unsupported_extension: number;
  malformed_path: number;
  duplicate_target: number;
  oversize: number;
  referenced_source: number;
  unreferenced_source: number;
  // target state (referenced objects)
  target_matching: number;
  target_conflict: number;
  target_missing: number;
  target_unverified: number;
  target_promoted: number;
  copied_verified: number;
  content_signature_mismatch: number;
  source_size_mismatch: number;
  copy_failed_retryable: number;
  copy_failed_permanent: number;
  // gate inputs
  referenced_legacy_resolvable_from_gcs: number;
  referenced_missing_source: number;
  // errors
  list_errors: number;
  reference_lookup_errors: number;
  // metadata-only inventory (NEW4-4D-9D)
  metadata_only: boolean;
  byte_read_attempts: number;
  write_attempts: number;
  originals_total: number;
  previews_total: number;
  non_uuid_referenced: number;
  /** Occurrences per `<table.column>:<class>` (Workshop-media values only). */
  references_by_field: Record<string, number>;
  target_inventory_listed: boolean;
  target_inventory_errors: number;
  target_objects_total: number;
  target_marker_verified_total: number;
  target_marker_written_total: number;
  target_existing: number;
  /** Verified marker + metadata consistent. NOT byte-verified; never counted as resolvable. */
  target_metadata_match_candidate: number;
  target_metadata_conflict_candidate: number;
  /** Bucket facts from the Storage API (metadata-only runs). */
  source_bucket?: LegacySourceBucketInfo;
};

export function emptyLegacyCopyReport(mode: LegacyCopyMode, byteVerified: boolean, metadataOnly = false): LegacyCopyReport {
  return {
    mode,
    byte_verified: byteVerified,
    metadata_only: metadataOnly,
    byte_read_attempts: 0,
    write_attempts: 0,
    originals_total: 0,
    previews_total: 0,
    non_uuid_referenced: 0,
    references_by_field: {},
    target_inventory_listed: false,
    target_inventory_errors: 0,
    target_objects_total: 0,
    target_marker_verified_total: 0,
    target_marker_written_total: 0,
    target_existing: 0,
    target_metadata_match_candidate: 0,
    target_metadata_conflict_candidate: 0,
    reference_values_scanned: 0,
    canonical_refs: 0,
    referenced_legacy_total: 0,
    legacy_ref_occurrences: 0,
    malformed_referenced: 0,
    foreign_host_referenced: 0,
    unrecognized_referenced: 0,
    tables_absent: 0,
    source_objects_total: 0,
    source_bytes_total: 0,
    placeholder_ignored: 0,
    canonical_bridgeable: 0,
    noncanonical_filename: 0,
    noncanonical_referenced_source: 0,
    unexpected_prefix: 0,
    unsupported_extension: 0,
    malformed_path: 0,
    duplicate_target: 0,
    oversize: 0,
    referenced_source: 0,
    unreferenced_source: 0,
    target_matching: 0,
    target_conflict: 0,
    target_missing: 0,
    target_unverified: 0,
    target_promoted: 0,
    copied_verified: 0,
    content_signature_mismatch: 0,
    source_size_mismatch: 0,
    copy_failed_retryable: 0,
    copy_failed_permanent: 0,
    referenced_legacy_resolvable_from_gcs: 0,
    referenced_missing_source: 0,
    list_errors: 0,
    reference_lookup_errors: 0,
  };
}

export type LegacyCutoverGate = { pass: boolean; failed: string[] };

/** Machine gate for removing Supabase public access. Exceptions are never auto-adjudicated. */
export function evaluateLegacyCutoverGate(r: LegacyCopyReport): LegacyCutoverGate {
  const checks: [string, boolean][] = [
    ['byte_verified_run', r.byte_verified],
    ['inventory_complete', r.list_errors === 0 && r.reference_lookup_errors === 0],
    ['no_copy_failures', r.copy_failed_retryable === 0 && r.copy_failed_permanent === 0],
    ['referenced_all_resolvable_from_gcs', r.referenced_legacy_total === r.referenced_legacy_resolvable_from_gcs],
    ['no_target_conflict', r.target_conflict === 0],
    ['no_referenced_missing_source', r.referenced_missing_source === 0],
    ['no_malformed_referenced', r.malformed_referenced === 0],
    ['no_unrecognized_referenced', r.unrecognized_referenced === 0 && r.foreign_host_referenced === 0],
    ['no_duplicate_target', r.duplicate_target === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { pass: failed.length === 0, failed };
}

/**
 * Pre-copy readiness from a metadata-only run. Never a cutover PASS: without byte verification the
 * final gate is not evaluated.
 */
export function evaluateLegacyPreCopyInventory(r: LegacyCopyReport): { ready: boolean; blockers: string[] } {
  const checks: [string, boolean][] = [
    ['no_byte_or_write_attempt', r.byte_read_attempts === 0 && r.write_attempts === 0],
    ['inventory_complete', r.list_errors === 0 && r.reference_lookup_errors === 0 && r.tables_absent === 0
      && r.target_inventory_errors === 0 && r.copy_failed_retryable === 0 && r.copy_failed_permanent === 0],
    ['no_malformed_referenced', r.malformed_referenced === 0],
    ['no_unrecognized_referenced', r.unrecognized_referenced === 0 && r.foreign_host_referenced === 0],
    ['no_referenced_missing_source', r.referenced_missing_source === 0],
    ['no_target_metadata_conflict', r.target_metadata_conflict_candidate === 0 && r.target_unverified === 0],
    ['no_duplicate_target', r.duplicate_target === 0],
  ];
  const blockers = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { ready: blockers.length === 0, blockers };
}

/** Counters + gate only. Safe to print or store. */
export function formatLegacyCopyReport(r: LegacyCopyReport): string {
  if (r.metadata_only) {
    const pre = evaluateLegacyPreCopyInventory(r);
    return JSON.stringify({
      ...r,
      cutover_gate: 'NOT_EVALUATED',
      cutover_gate_reason: 'metadata_only_no_byte_verification',
      pre_copy_inventory: pre.ready ? 'READY' : 'BLOCKED',
      pre_copy_blockers: pre.blockers,
    }, null, 2);
  }
  const gate = evaluateLegacyCutoverGate(r);
  return JSON.stringify({ ...r, cutover_gate: gate.pass ? 'PASS' : 'FAIL', cutover_gate_failed: gate.failed }, null, 2);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([^.]+)$/;

export type LegacyObjectClass =
  | { kind: 'canonical'; parsed: ParsedWorkshopRef }
  | { kind: 'noncanonical_filename' }
  | { kind: 'unsupported_extension' }
  | { kind: 'malformed_path' }
  | { kind: 'unexpected_prefix' };

/** Classifies a full object path from the Supabase listing. */
export function classifyLegacyObjectPath(path: string): LegacyObjectClass {
  const segments = path.split('/');
  const root = segments[0];
  if (!(LEGACY_COPY_ROOTS as readonly string[]).includes(root)) return { kind: 'unexpected_prefix' };
  if (segments.length !== 3 || !UUID_RE.test(segments[1])) return { kind: 'malformed_path' };
  const file = UUID_FILE_RE.exec(segments[2]);
  if (!file) return { kind: 'noncanonical_filename' };
  const parsed = parseCanonicalWorkshopPath(path);
  if (!parsed) return { kind: 'unsupported_extension' };
  return { kind: 'canonical', parsed };
}

export type LegacyRefClass =
  | { kind: 'canonical' }
  | { kind: 'legacy'; path: string }
  | { kind: 'malformed'; permissivePath: string | null }
  | { kind: 'foreign_host' }
  | { kind: 'unrecognized' }
  | { kind: 'other' };

function urlHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** One stored string. `other` = not Workshop media at all (catalog images, text). */
export function classifyLegacyRefValue(value: string, legacyHosts: readonly string[]): LegacyRefClass {
  const opts = { legacyHosts };
  const parsed = parseWorkshopRef(value, opts);
  if (parsed) return parsed.source === 'canonical' ? { kind: 'canonical' } : { kind: 'legacy', path: parsed.path };
  const trimmed = value.trim();
  if (!isWorkshopMediaOrSignedValue(trimmed)) return { kind: 'other' };
  const host = urlHost(trimmed);
  const hosts = legacyHosts.map((h) => h.toLowerCase());
  if (host && !hosts.includes(host) && trimmed.toLowerCase().includes('/storage/v1/object/')) {
    return { kind: 'foreign_host' };
  }
  const permissive = workshopStoragePathFromUrl(trimmed);
  if (permissive) return { kind: 'malformed', permissivePath: permissive };
  return { kind: 'unrecognized' };
}

function forEachString(value: unknown, visit: (s: string) => void, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') return visit(value);
  if (Array.isArray(value)) {
    for (const item of value) forEachString(item, visit, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) forEachString(nested, visit, depth + 1);
  }
}

export type LegacyReferenceIndex = {
  /** canonical path → seen in source listing / resolvable from GCS */
  legacy: Map<string, { seenSource: boolean; resolvable: boolean }>;
  /** permissive paths of malformed refs (non-UUID filenames), to count matching source objects */
  malformed: Set<string>;
};

export async function buildLegacyReferenceIndex(
  source: LegacyReferenceSource,
  legacyHosts: readonly string[],
  report: LegacyCopyReport,
): Promise<LegacyReferenceIndex> {
  const index: LegacyReferenceIndex = { legacy: new Map(), malformed: new Set() };
  const malformedRefs = new Set<string>();
  const unrecognizedRefs = new Set<string>();
  const foreignRefs = new Set<string>();
  const canonicalRefs = new Set<string>();
  const nonUuidRefs = new Set<string>();
  const { tablesAbsent } = await source.scan((field, value) => {
    forEachString(value, (s) => {
      report.reference_values_scanned += 1;
      const c = classifyLegacyRefValue(s, legacyHosts);
      if (c.kind !== 'other') {
        const key = `${field}:${c.kind}`;
        report.references_by_field[key] = (report.references_by_field[key] ?? 0) + 1;
      }
      if (c.kind === 'legacy') {
        report.legacy_ref_occurrences += 1;
        if (!index.legacy.has(c.path)) index.legacy.set(c.path, { seenSource: false, resolvable: false });
      } else if (c.kind === 'canonical') {
        canonicalRefs.add(s.trim());
      } else if (c.kind === 'malformed') {
        malformedRefs.add(s.trim());
        if (c.permissivePath) {
          index.malformed.add(c.permissivePath);
          if (classifyLegacyObjectPath(c.permissivePath).kind === 'noncanonical_filename') nonUuidRefs.add(s.trim());
        }
      } else if (c.kind === 'foreign_host') {
        foreignRefs.add(s.trim());
      } else if (c.kind === 'unrecognized') {
        unrecognizedRefs.add(s.trim());
      }
    });
  });
  report.tables_absent = tablesAbsent.length;
  report.referenced_legacy_total = index.legacy.size;
  report.canonical_refs = canonicalRefs.size;
  report.malformed_referenced = malformedRefs.size;
  report.non_uuid_referenced = nonUuidRefs.size;
  report.foreign_host_referenced = foreignRefs.size;
  report.unrecognized_referenced = unrecognizedRefs.size;
  return index;
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

export function md5Base64(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('base64');
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Magic bytes must match the content type implied by the extension. */
export function bytesMatchContentType(bytes: Uint8Array, contentType: string): boolean {
  const at = (i: number) => bytes[i];
  if (contentType === 'image/jpeg') return bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (contentType === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 8 && sig.every((b, i) => at(i) === b);
  }
  if (contentType === 'image/webp') {
    const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
    return bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  }
  return false;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type LegacyCopyDeps = {
  source: LegacySource;
  target: LegacyTarget;
  references: LegacyReferenceSource;
  legacyHosts: readonly string[];
  args: LegacyCopyArgs;
  pageSize?: number;
  sleep?: (ms: number) => Promise<void>;
};

type ObjectOutcome =
  | 'matching'
  | 'promoted'
  | 'copied'
  | 'conflict'
  | 'missing'
  | 'unverified'
  | 'oversize'
  | 'signature_mismatch'
  | 'size_mismatch'
  | 'metadata_match_candidate'
  | 'metadata_conflict_candidate';

async function withRetry<T>(deps: LegacyCopyDeps, fn: () => Promise<T>): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt < LEGACY_COPY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!(error instanceof LegacyCopyError) || !error.retryable) throw error;
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

function targetMatchesSource(
  parsed: ParsedWorkshopRef,
  head: LegacyTargetObject,
  bytes: Uint8Array,
  sha: string,
): boolean {
  return (
    head.sizeBytes === bytes.length &&
    head.md5Base64 === md5Base64(bytes) &&
    head.sourceSha256 === sha &&
    head.contentType === contentTypeForExtension(parsed.ext) &&
    head.cacheControl === WORKSHOP_MEDIA_CACHE_CONTROL
  );
}

function bridgeReady(parsed: ParsedWorkshopRef, head: LegacyTargetObject | null): boolean {
  if (!head) return false;
  return isBridgeableLegacyCopy(parsed, {
    path: parsed.path,
    sizeBytes: head.sizeBytes,
    contentType: head.contentType,
    cacheControl: head.cacheControl,
    createdAtMs: null,
    legacyCopy: head.copyState,
  });
}

/** Re-read the target and compare SHA-256 with the source bytes. */
async function targetBytesMatch(deps: LegacyCopyDeps, parsed: ParsedWorkshopRef, sha: string, cap: number): Promise<boolean> {
  const bytes = await withRetry(deps, () => deps.target.download(parsed.path, cap));
  return sha256Hex(bytes) === sha;
}

async function verifyAndPromote(
  deps: LegacyCopyDeps,
  parsed: ParsedWorkshopRef,
  bytes: Uint8Array,
  sha: string,
  cap: number,
): Promise<boolean> {
  const head = await withRetry(deps, () => deps.target.head(parsed.path));
  if (!head || head.copyState !== 'written' || !targetMatchesSource(parsed, head, bytes, sha)) return false;
  if (!(await targetBytesMatch(deps, parsed, sha, cap))) return false;
  await withRetry(deps, () => deps.target.markVerified(parsed.path, head.metageneration));
  return bridgeReady(parsed, await withRetry(deps, () => deps.target.head(parsed.path)));
}

/** Metadata-only target classification. A match is a candidate, never proof of identical bytes. */
function metadataTargetOutcome(parsed: ParsedWorkshopRef, head: LegacyTargetObject | null, listedSize: number | null): ObjectOutcome {
  if (!head) return 'missing';
  if (head.copyState === 'written') return 'unverified';
  if (head.copyState === 'verified' && (listedSize == null || head.sizeBytes === listedSize) && bridgeReady(parsed, head)) {
    return 'metadata_match_candidate';
  }
  return 'metadata_conflict_candidate';
}

async function processReferencedObject(
  deps: LegacyCopyDeps,
  parsed: ParsedWorkshopRef,
  listedSize: number | null,
  raceRetry = false,
): Promise<ObjectOutcome> {
  const cap = WORKSHOP_UPLOAD_CAPS[parsed.kind];
  if (listedSize != null && listedSize > cap) return 'oversize';
  const contentType = contentTypeForExtension(parsed.ext)!;
  const head = await withRetry(deps, () => deps.target.head(parsed.path));
  if (deps.args.metadataOnly) return metadataTargetOutcome(parsed, head, listedSize);
  const needBytes = deps.args.mode === 'apply' || deps.args.verifyBytes;

  if (head) {
    if (head.copyState === null) return 'conflict';
    if (listedSize != null && head.sizeBytes !== listedSize) return 'conflict';
    if (head.copyState === 'verified' && !needBytes) return bridgeReady(parsed, head) ? 'matching' : 'conflict';
    if (head.copyState === 'written' && deps.args.mode !== 'apply') return 'unverified';
    const bytes = await withRetry(deps, () => deps.source.download(parsed.path, cap));
    const sha = sha256Hex(bytes);
    if (!targetMatchesSource(parsed, head, bytes, sha)) return 'conflict';
    if (head.copyState === 'verified') return bridgeReady(parsed, head) ? 'matching' : 'conflict';
    return (await verifyAndPromote(deps, parsed, bytes, sha, cap)) ? 'promoted' : 'conflict';
  }

  if (deps.args.mode !== 'apply') return 'missing';
  const bytes = await withRetry(deps, () => deps.source.download(parsed.path, cap));
  if (bytes.length < 1 || bytes.length > cap) return 'oversize';
  if (listedSize != null && bytes.length !== listedSize) return 'size_mismatch';
  if (!bytesMatchContentType(bytes, contentType)) return 'signature_mismatch';
  const sha = sha256Hex(bytes);
  const created = await withRetry(deps, () =>
    deps.target.createOnly(parsed.path, bytes, { contentType, md5Base64: md5Base64(bytes), sha256Hex: sha }),
  );
  if (created === 'exists') {
    if (raceRetry) return 'conflict';
    return processReferencedObject(deps, parsed, listedSize, true);
  }
  return (await verifyAndPromote(deps, parsed, bytes, sha, cap)) ? 'copied' : 'conflict';
}

function recordOutcome(report: LegacyCopyReport, outcome: ObjectOutcome): boolean {
  switch (outcome) {
    case 'matching':
      report.target_matching += 1;
      return true;
    case 'promoted':
      report.target_promoted += 1;
      return true;
    case 'copied':
      report.copied_verified += 1;
      return true;
    case 'conflict':
      report.target_conflict += 1;
      return false;
    case 'missing':
      report.target_missing += 1;
      return false;
    case 'unverified':
      report.target_unverified += 1;
      return false;
    case 'oversize':
      report.oversize += 1;
      return false;
    case 'signature_mismatch':
      report.content_signature_mismatch += 1;
      return false;
    case 'size_mismatch':
      report.source_size_mismatch += 1;
      return false;
    case 'metadata_match_candidate':
      report.target_metadata_match_candidate += 1;
      return false;
    case 'metadata_conflict_candidate':
      report.target_metadata_conflict_candidate += 1;
      return false;
  }
}

/** Every byte-read and write port throws (and is counted); only list / head / inventory remain. */
function metadataOnlyPorts(deps: LegacyCopyDeps, report: LegacyCopyReport): LegacyCopyDeps {
  const refuse = (counter: 'byte_read_attempts' | 'write_attempts') => async (): Promise<never> => {
    report[counter] += 1;
    throw new LegacyCopyError('metadata_only_violation', false);
  };
  const { source, target } = deps;
  return {
    ...deps,
    source: {
      list: (prefix, offset, limit) => source.list(prefix, offset, limit),
      download: refuse('byte_read_attempts'),
      bucketInfo: source.bucketInfo ? () => source.bucketInfo!() : undefined,
    },
    target: {
      head: (path) => target.head(path),
      inventory: target.inventory ? () => target.inventory!() : undefined,
      createOnly: refuse('write_attempts'),
      download: refuse('byte_read_attempts'),
      markVerified: refuse('write_attempts'),
    },
  };
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

type WorkItem = { parsed: ParsedWorkshopRef; listedSize: number | null };

async function listAll(deps: LegacyCopyDeps, prefix: string, onPage: (entries: LegacySourceEntry[]) => Promise<void>) {
  const pageSize = deps.pageSize ?? LEGACY_COPY_PAGE_SIZE;
  let offset = 0;
  while (true) {
    const page = await withRetry(deps, () => deps.source.list(prefix, offset, pageSize));
    if (page.length === 0) break;
    await onPage(page);
    if (page.length < pageSize) break;
    offset += page.length;
  }
}

export async function runLegacyCopy(inputDeps: LegacyCopyDeps): Promise<LegacyCopyReport> {
  const metadataOnly = inputDeps.args.metadataOnly === true;
  const report = emptyLegacyCopyReport(
    inputDeps.args.mode,
    !metadataOnly && (inputDeps.args.mode === 'apply' || inputDeps.args.verifyBytes),
    metadataOnly,
  );
  if (metadataOnly && (inputDeps.args.mode !== 'dry-run' || inputDeps.args.verifyBytes)) {
    throw new LegacyCopyError('metadata_only_args', false);
  }
  const deps = metadataOnly ? metadataOnlyPorts(inputDeps, report) : inputDeps;
  if (metadataOnly && deps.source.bucketInfo) {
    try {
      report.source_bucket = await withRetry(deps, () => deps.source.bucketInfo!());
    } catch {
      report.list_errors += 1;
    }
  }
  let index: LegacyReferenceIndex;
  try {
    index = await buildLegacyReferenceIndex(deps.references, deps.legacyHosts, report);
  } catch {
    report.reference_lookup_errors += 1;
    return report;
  }

  const seenTargets = new Set<string>();
  const seenIdentities = new Set<string>();

  const countObject = (entry: LegacySourceEntry, root: string | null) => {
    report.source_objects_total += 1;
    if (typeof entry.sizeBytes === 'number' && entry.sizeBytes > 0) report.source_bytes_total += entry.sizeBytes;
    if (root === 'originals') report.originals_total += 1;
    else if (root === 'previews') report.previews_total += 1;
  };
  const rootOf = (prefix: string) => prefix.split('/')[0];

  const processFile = async (path: string, entry: LegacySourceEntry, work: WorkItem[]) => {
    countObject(entry, rootOf(path));
    const c = classifyLegacyObjectPath(path);
    if (c.kind !== 'canonical') {
      if (c.kind === 'noncanonical_filename') {
        report.noncanonical_filename += 1;
        if (index.malformed.has(path)) report.noncanonical_referenced_source += 1;
      } else if (c.kind === 'unsupported_extension') report.unsupported_extension += 1;
      else if (c.kind === 'malformed_path') report.malformed_path += 1;
      else report.unexpected_prefix += 1;
      return;
    }
    report.canonical_bridgeable += 1;
    const identity = `${c.parsed.kind}/${c.parsed.uid}/${c.parsed.objectId}`;
    if (seenTargets.has(path) || seenIdentities.has(identity)) {
      report.duplicate_target += 1;
      return;
    }
    seenTargets.add(path);
    seenIdentities.add(identity);
    const ref = index.legacy.get(path);
    if (!ref) {
      report.unreferenced_source += 1;
      return;
    }
    ref.seenSource = true;
    report.referenced_source += 1;
    work.push({ parsed: c.parsed, listedSize: entry.sizeBytes });
  };

  const runWork = async (work: WorkItem[]) => {
    await runPool(work, deps.args.concurrency, async (item) => {
      try {
        const ok = recordOutcome(report, await processReferencedObject(deps, item.parsed, item.listedSize));
        if (ok) index.legacy.get(item.parsed.path)!.resolvable = true;
      } catch (error) {
        if (error instanceof LegacyCopyError && !error.retryable) report.copy_failed_permanent += 1;
        else report.copy_failed_retryable += 1;
      }
    });
  };

  /** Everything below an unexpected or malformed folder is counted, never processed. */
  const countSubtree = async (prefix: string, depth: number, bucket: 'unexpected_prefix' | 'malformed_path') => {
    if (depth > LEGACY_COPY_MAX_DEPTH) {
      report.list_errors += 1;
      return;
    }
    const folders: string[] = [];
    await listAll(deps, prefix, async (page) => {
      for (const entry of page) {
        if (entry.name === LEGACY_COPY_PLACEHOLDER) {
          report.placeholder_ignored += 1;
          continue;
        }
        if (entry.isFolder) folders.push(`${prefix}/${entry.name}`);
        else {
          countObject(entry, rootOf(prefix));
          report[bucket] += 1;
        }
      }
    });
    for (const folder of folders) await countSubtree(folder, depth + 1, bucket);
  };

  try {
    const rootFolders: string[] = [];
    await listAll(deps, '', async (page) => {
      for (const entry of page) {
        if (entry.name === LEGACY_COPY_PLACEHOLDER) {
          report.placeholder_ignored += 1;
          continue;
        }
        if (!entry.isFolder) {
          countObject(entry, null);
          report.unexpected_prefix += 1;
        } else rootFolders.push(entry.name);
      }
    });

    for (const root of rootFolders) {
      if (!(LEGACY_COPY_ROOTS as readonly string[]).includes(root)) {
        await countSubtree(root, 1, 'unexpected_prefix');
        continue;
      }
      const uidFolders: string[] = [];
      await listAll(deps, root, async (page) => {
        for (const entry of page) {
          if (entry.name === LEGACY_COPY_PLACEHOLDER) {
            report.placeholder_ignored += 1;
            continue;
          }
          if (entry.isFolder) uidFolders.push(entry.name);
          else {
            countObject(entry, root);
            report.malformed_path += 1;
          }
        }
      });
      for (const uidFolder of uidFolders) {
        const prefix = `${root}/${uidFolder}`;
        const nested: string[] = [];
        await listAll(deps, prefix, async (page) => {
          const work: WorkItem[] = [];
          for (const entry of page) {
            if (entry.name === LEGACY_COPY_PLACEHOLDER) {
              report.placeholder_ignored += 1;
              continue;
            }
            if (entry.isFolder) nested.push(`${prefix}/${entry.name}`);
            else await processFile(`${prefix}/${entry.name}`, entry, work);
          }
          await runWork(work);
        });
        for (const folder of nested) await countSubtree(folder, 3, 'malformed_path');
      }
    }
  } catch {
    report.list_errors += 1;
  }

  // Referenced paths with no source object: resolvable only if a verified copy already exists.
  for (const [path, ref] of index.legacy) {
    if (ref.seenSource) continue;
    const parsed = parseCanonicalWorkshopPath(path)!;
    try {
      const head = await withRetry(deps, () => deps.target.head(path));
      if (metadataOnly) {
        if (head) recordOutcome(report, metadataTargetOutcome(parsed, head, null));
        report.referenced_missing_source += 1;
        continue;
      }
      if (bridgeReady(parsed, head)) {
        ref.resolvable = true;
        continue;
      }
    } catch {
      report.copy_failed_retryable += 1;
      continue;
    }
    report.referenced_missing_source += 1;
  }

  for (const ref of index.legacy.values()) if (ref.resolvable) report.referenced_legacy_resolvable_from_gcs += 1;

  if (metadataOnly) {
    report.target_existing = report.target_metadata_match_candidate + report.target_metadata_conflict_candidate + report.target_unverified;
    if (deps.target.inventory) {
      try {
        const inv = await withRetry(deps, () => deps.target.inventory!());
        report.target_inventory_listed = true;
        report.target_objects_total = inv.objects;
        report.target_marker_verified_total = inv.markerVerified;
        report.target_marker_written_total = inv.markerWritten;
      } catch {
        report.target_inventory_errors += 1;
      }
    } else {
      report.target_inventory_errors += 1;
    }
  }
  return report;
}

/** GCS custom metadata the copy tool writes at create time (state flips to `verified` after checks). */
export function legacyCopyWriteMetadata(sha: string): Record<string, string> {
  return {
    [WORKSHOP_LEGACY_COPY_METADATA.origin]: WORKSHOP_LEGACY_COPY_ORIGIN,
    [WORKSHOP_LEGACY_COPY_METADATA.state]: 'written',
    [WORKSHOP_LEGACY_COPY_METADATA.sourceSha256]: sha,
  };
}
