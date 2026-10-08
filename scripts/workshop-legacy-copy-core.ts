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
  /** Listing `created_at` (ISO), for aggregate age buckets only. */
  createdAt?: string | null;
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

export type LegacyTargetInventory = { objects: number; customerPrefix: number; markerVerified: number; markerWritten: number };

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
export const LEGACY_REFERENCE_TABLES = ['user_progress', 'cart_items', 'orders', 'payment_intents'] as const;
export type LegacyReferenceTable = (typeof LEGACY_REFERENCE_TABLES)[number];

/** Sanitized per-table failure: logical table + DB / PostgREST code only (never message, SQL or URL). */
export type LegacyReferenceFailure = { table: LegacyReferenceTable; code: string };

export type LegacyReferenceScanResult = {
  tablesAbsent: LegacyReferenceTable[];
  /** Tables whose scan failed; every other table was scanned independently. */
  failures?: LegacyReferenceFailure[];
  /** Pre-NEW4-6 schema: orders scanned without the purge filter (safe superset). */
  ordersPurgeColumnAbsent?: boolean;
};

/**
 * Read-only DB scan; each table is scanned independently. Orders: `image_purged_at IS NULL` only
 * (NEW4-6: purged evidence holds no images); all orders if that column does not exist yet.
 */
export interface LegacyReferenceSource {
  scan(onValue: (field: LegacyReferenceField, value: unknown) => void): Promise<LegacyReferenceScanResult>;
}

const ERROR_CODE_RE = /^[A-Za-z0-9_]{1,16}$/;

/** A code that is safe to print: a short token, otherwise `unknown`. */
export function sanitizeLegacyErrorCode(code: unknown): string {
  return typeof code === 'string' && ERROR_CODE_RE.test(code) ? code : 'unknown';
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
  target_list_errors: number;
  // phase completeness (NEW4-4D-9D-3): a phase that is not complete has no measured zeros
  bucket_facts_complete: boolean;
  reference_scan_complete: boolean;
  source_inventory_complete: boolean;
  target_inventory_complete: boolean;
  source_list_errors: number;
  reference_sources: Record<string, 'ok' | 'absent' | 'failed' | 'not_attempted'>;
  /** `<table>` → sanitized DB / PostgREST code. */
  reference_failures: Record<string, string>;
  orders_purge_column_absent: boolean;
  target_objects_total: number;
  target_customer_prefix_objects: number;
  target_marker_verified_total: number;
  target_marker_written_total: number;
  target_existing: number;
  /** Verified marker + metadata consistent. NOT byte-verified; never counted as resolvable. */
  target_metadata_match_candidate: number;
  target_metadata_conflict_candidate: number;
  /** Bucket facts from the Storage API (metadata-only runs). */
  source_bucket?: LegacySourceBucketInfo;
  /** Structural category counts of every listed source object (NEW4-4D-9D-4). No names. */
  source_structure: LegacySourceStructure;
};

// ---------------------------------------------------------------------------
// Source structure (aggregate categories only; no prefix, path or filename is ever kept in output)
// ---------------------------------------------------------------------------

/** Printable extension / MIME classes; anything else is counted as `other` so no free text leaves. */
const STRUCTURE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff', 'svg', 'pdf', 'json', 'txt'] as const;
const STRUCTURE_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff',
  'image/svg+xml', 'application/pdf', 'application/json', 'application/octet-stream', 'text/plain',
] as const;
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_LIKE_RE = /^\d{10,13}(?:[-_.]|$)/;
const DAY_MS = 86_400_000;

export type LegacySourceStructure = {
  objects: number;
  depth: { root_file: number; one_level: number; two_level: number; deeper: number };
  root: { canonical_root: number; other_root: number; root_file: number };
  /** Distinct folder counts by name shape (names themselves are discarded). */
  top_prefixes: { distinct: number; uuid_like: number; non_uuid_like: number };
  second_level_prefixes: { distinct: number; uuid_like: number; non_uuid_like: number };
  filename: { uuid_like: number; timestamp_like: number; other: number };
  extension: Record<string, number>;
  mime: Record<string, number>;
  size: {
    total: number; min: number | null; max: number | null; unknown: number;
    lt_100kb: number; lt_1mb: number; lt_5mb: number; lt_20mb: number; gte_20mb: number;
  };
  age: { lt_30d: number; d30_90: number; d90_365: number; gt_365d: number; unknown: number };
  db_referenced: number;
  db_unreferenced: number;
};

export function emptyLegacySourceStructure(): LegacySourceStructure {
  return {
    objects: 0,
    depth: { root_file: 0, one_level: 0, two_level: 0, deeper: 0 },
    root: { canonical_root: 0, other_root: 0, root_file: 0 },
    top_prefixes: { distinct: 0, uuid_like: 0, non_uuid_like: 0 },
    second_level_prefixes: { distinct: 0, uuid_like: 0, non_uuid_like: 0 },
    filename: { uuid_like: 0, timestamp_like: 0, other: 0 },
    extension: {},
    mime: {},
    size: { total: 0, min: null, max: null, unknown: 0, lt_100kb: 0, lt_1mb: 0, lt_5mb: 0, lt_20mb: 0, gte_20mb: 0 },
    age: { lt_30d: 0, d30_90: 0, d90_365: 0, gt_365d: 0, unknown: 0 },
    db_referenced: 0,
    db_unreferenced: 0,
  };
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function extensionClass(file: string): string {
  const dot = file.lastIndexOf('.');
  if (dot <= 0 || dot === file.length - 1) return 'none';
  const ext = file.slice(dot + 1).toLowerCase();
  return (STRUCTURE_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'other';
}

function mimeClass(mime: string | null): string {
  if (!mime) return 'unknown';
  const m = mime.toLowerCase().split(';')[0].trim();
  return (STRUCTURE_MIMES as readonly string[]).includes(m) ? m : 'other';
}

/** Distinct-folder tracker: names are held in memory only to dedupe, never output. */
export type LegacyStructureTracker = { top: Set<string>; second: Set<string> };

export function recordLegacySourceStructure(
  s: LegacySourceStructure,
  tracker: LegacyStructureTracker,
  path: string,
  entry: LegacySourceEntry,
  referenced: boolean,
  nowMs: number,
): void {
  const segments = path.split('/');
  const file = segments[segments.length - 1];
  s.objects += 1;
  if (segments.length === 1) s.depth.root_file += 1;
  else if (segments.length === 2) s.depth.one_level += 1;
  else if (segments.length === 3) s.depth.two_level += 1;
  else s.depth.deeper += 1;
  if (segments.length === 1) s.root.root_file += 1;
  else if ((LEGACY_COPY_ROOTS as readonly string[]).includes(segments[0])) s.root.canonical_root += 1;
  else s.root.other_root += 1;
  if (segments.length >= 2 && !tracker.top.has(segments[0])) {
    tracker.top.add(segments[0]);
    s.top_prefixes.distinct += 1;
    if (UUID_LIKE_RE.test(segments[0])) s.top_prefixes.uuid_like += 1;
    else s.top_prefixes.non_uuid_like += 1;
  }
  if (segments.length >= 3) {
    const key = `${segments[0]}/${segments[1]}`;
    if (!tracker.second.has(key)) {
      tracker.second.add(key);
      s.second_level_prefixes.distinct += 1;
      if (UUID_LIKE_RE.test(segments[1])) s.second_level_prefixes.uuid_like += 1;
      else s.second_level_prefixes.non_uuid_like += 1;
    }
  }
  const stem = file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file;
  if (UUID_LIKE_RE.test(stem)) s.filename.uuid_like += 1;
  else if (TIMESTAMP_LIKE_RE.test(file)) s.filename.timestamp_like += 1;
  else s.filename.other += 1;
  bump(s.extension, extensionClass(file));
  bump(s.mime, mimeClass(entry.mimeType));
  const size = entry.sizeBytes;
  if (typeof size !== 'number' || size < 0) s.size.unknown += 1;
  else {
    s.size.total += size;
    s.size.min = s.size.min === null ? size : Math.min(s.size.min, size);
    s.size.max = s.size.max === null ? size : Math.max(s.size.max, size);
    if (size < 100 * 1024) s.size.lt_100kb += 1;
    else if (size < 1024 * 1024) s.size.lt_1mb += 1;
    else if (size < 5 * 1024 * 1024) s.size.lt_5mb += 1;
    else if (size < 20 * 1024 * 1024) s.size.lt_20mb += 1;
    else s.size.gte_20mb += 1;
  }
  const created = entry.createdAt ? Date.parse(entry.createdAt) : Number.NaN;
  if (!Number.isFinite(created)) s.age.unknown += 1;
  else {
    const days = (nowMs - created) / DAY_MS;
    if (days < 30) s.age.lt_30d += 1;
    else if (days < 90) s.age.d30_90 += 1;
    else if (days < 365) s.age.d90_365 += 1;
    else s.age.gt_365d += 1;
  }
  if (referenced) s.db_referenced += 1;
  else s.db_unreferenced += 1;
}

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
    target_list_errors: 0,
    bucket_facts_complete: false,
    reference_scan_complete: false,
    source_inventory_complete: false,
    target_inventory_complete: false,
    source_list_errors: 0,
    reference_sources: Object.fromEntries(LEGACY_REFERENCE_TABLES.map((t) => [t, 'not_attempted'])),
    reference_failures: {},
    orders_purge_column_absent: false,
    source_structure: emptyLegacySourceStructure(),
    target_objects_total: 0,
    target_customer_prefix_objects: 0,
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
    ['inventory_complete', r.list_errors === 0 && r.reference_lookup_errors === 0 && r.reference_scan_complete && r.source_inventory_complete],
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
    ['inventory_complete', legacyInventoryComplete(r) && r.list_errors === 0 && r.reference_lookup_errors === 0
      && r.tables_absent === 0 && r.target_list_errors === 0 && r.copy_failed_retryable === 0 && r.copy_failed_permanent === 0],
    ['no_malformed_referenced', r.malformed_referenced === 0],
    ['no_unrecognized_referenced', r.unrecognized_referenced === 0 && r.foreign_host_referenced === 0],
    ['no_referenced_missing_source', r.referenced_missing_source === 0],
    ['no_target_metadata_conflict', r.target_metadata_conflict_candidate === 0 && r.target_unverified === 0],
    ['no_duplicate_target', r.duplicate_target === 0],
  ];
  const blockers = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { ready: blockers.length === 0, blockers };
}

/** Every phase the run requires finished: metadata-only needs all four, copy modes references + source. */
export function legacyInventoryComplete(r: LegacyCopyReport): boolean {
  if (!r.reference_scan_complete || !r.source_inventory_complete) return false;
  return !r.metadata_only || (r.bucket_facts_complete && r.target_inventory_complete);
}

/** Process exit status: printed report first, then non-zero when the inventory is incomplete. */
export function legacyInventoryExitCode(r: LegacyCopyReport): number {
  return legacyInventoryComplete(r) ? 0 : 3;
}

type Measurement = 'MEASURED' | 'PARTIAL' | 'NOT_MEASURED';

/** Phase labels for metadata-only output; the critical three are null unless measured. */
function legacyMeasurement(r: LegacyCopyReport) {
  const refsTouched = Object.values(r.reference_sources).some((s) => s === 'ok') || r.reference_values_scanned > 0;
  const references: Measurement = r.reference_scan_complete ? 'MEASURED' : refsTouched ? 'PARTIAL' : 'NOT_MEASURED';
  const source: Measurement = r.source_inventory_complete ? 'MEASURED' : r.source_objects_total > 0 ? 'PARTIAL' : 'NOT_MEASURED';
  const criticalMeasured = r.reference_scan_complete && r.source_inventory_complete;
  const critical = {
    non_uuid_referenced: criticalMeasured ? r.non_uuid_referenced : null,
    malformed_referenced: criticalMeasured ? r.malformed_referenced : null,
    referenced_missing_source: criticalMeasured ? r.referenced_missing_source : null,
  };
  const complete = legacyInventoryComplete(r);
  const blocker = r.non_uuid_referenced > 0 || r.malformed_referenced > 0 || r.referenced_missing_source > 0;
  return {
    inventory_status: complete ? 'COMPLETE' : 'INCOMPLETE',
    measurement: {
      bucket: r.bucket_facts_complete ? 'MEASURED' : 'NOT_MEASURED',
      references,
      source,
      target: r.target_inventory_complete ? 'MEASURED' : 'NOT_MEASURED',
      critical_counters: criticalMeasured ? 'MEASURED' : 'NOT_MEASURED',
    },
    critical_counters: critical,
    data_shape_assessment: !complete ? 'INVENTORY_INCOMPLETE' : blocker ? 'CUTOVER_DATA_BLOCKER' : 'NO_DATA_SHAPE_BLOCKER',
  };
}

/** Counters + gate only. Safe to print or store. */
export function formatLegacyCopyReport(r: LegacyCopyReport): string {
  if (r.metadata_only) {
    const pre = evaluateLegacyPreCopyInventory(r);
    return JSON.stringify({
      ...r,
      ...legacyMeasurement(r),
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
  const finish = () => {
    report.referenced_legacy_total = index.legacy.size;
    report.canonical_refs = canonicalRefs.size;
    report.malformed_referenced = malformedRefs.size;
    report.non_uuid_referenced = nonUuidRefs.size;
    report.foreign_host_referenced = foreignRefs.size;
    report.unrecognized_referenced = unrecognizedRefs.size;
  };
  const onValue = (field: LegacyReferenceField, value: unknown) => {
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
  };
  let result: LegacyReferenceScanResult;
  try {
    result = await source.scan(onValue);
  } catch {
    // The source itself aborted: no table can be trusted as scanned.
    report.reference_lookup_errors += 1;
    report.reference_failures.reference_source = 'aborted';
    for (const t of LEGACY_REFERENCE_TABLES) report.reference_sources[t] = 'failed';
    finish();
    return index;
  }
  const known = (t: string): t is LegacyReferenceTable => (LEGACY_REFERENCE_TABLES as readonly string[]).includes(t);
  const absent = new Set(result.tablesAbsent.filter(known));
  const failures = (result.failures ?? []).filter((f) => known(f.table));
  for (const t of LEGACY_REFERENCE_TABLES) report.reference_sources[t] = absent.has(t) ? 'absent' : 'ok';
  for (const f of failures) {
    report.reference_sources[f.table] = 'failed';
    report.reference_failures[f.table] = sanitizeLegacyErrorCode(f.code);
  }
  report.reference_lookup_errors += failures.length;
  report.tables_absent = absent.size;
  report.orders_purge_column_absent = result.ordersPurgeColumnAbsent === true;
  report.reference_scan_complete = failures.length === 0 && absent.size === 0;
  finish();
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
  now?: () => number;
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
  let deps = metadataOnly ? metadataOnlyPorts(inputDeps, report) : inputDeps;
  if (metadataOnly && deps.source.bucketInfo) {
    try {
      report.source_bucket = await withRetry(deps, () => deps.source.bucketInfo!());
      report.bucket_facts_complete = true;
    } catch {
      report.list_errors += 1;
    }
  }
  // Each phase runs on its own; a failed phase only marks itself incomplete.
  const index = await buildLegacyReferenceIndex(deps.references, deps.legacyHosts, report);
  // Copy modes never act on a partial reference set.
  if (!metadataOnly && report.reference_lookup_errors > 0) return report;

  if (metadataOnly) {
    const target = deps.target;
    if (target.inventory) {
      try {
        const inv = await withRetry(deps, () => target.inventory!());
        report.target_inventory_listed = true;
        report.target_objects_total = inv.objects;
        report.target_customer_prefix_objects = inv.customerPrefix;
        report.target_marker_verified_total = inv.markerVerified;
        report.target_marker_written_total = inv.markerWritten;
      } catch {
        report.target_list_errors += 1;
      }
    } else {
      report.target_list_errors += 1;
    }
    if (!report.target_inventory_listed) {
      // No listing: target state is unknown, so no head is attempted (and no listing is retried per object).
      deps = { ...deps, target: { ...target, head: async () => { throw new LegacyCopyError('target_unavailable', false); } } };
    }
  }

  const seenTargets = new Set<string>();
  const seenIdentities = new Set<string>();

  const tracker: LegacyStructureTracker = { top: new Set(), second: new Set() };
  const nowMs = (deps.now ?? Date.now)();
  const countObject = (entry: LegacySourceEntry, path: string) => {
    report.source_objects_total += 1;
    if (typeof entry.sizeBytes === 'number' && entry.sizeBytes > 0) report.source_bytes_total += entry.sizeBytes;
    const root = path.includes('/') ? path.split('/')[0] : null;
    if (root === 'originals') report.originals_total += 1;
    else if (root === 'previews') report.previews_total += 1;
    const referenced = index.legacy.has(path) || index.malformed.has(path);
    recordLegacySourceStructure(report.source_structure, tracker, path, entry, referenced, nowMs);
  };

  const processFile = async (path: string, entry: LegacySourceEntry, work: WorkItem[]) => {
    countObject(entry, path);
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
      report.source_list_errors += 1;
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
          countObject(entry, `${prefix}/${entry.name}`);
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
          countObject(entry, entry.name);
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
            countObject(entry, `${root}/${entry.name}`);
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
    report.source_list_errors += 1;
  }
  report.source_inventory_complete = report.source_list_errors === 0;

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
    report.target_inventory_complete = report.target_inventory_listed && report.target_list_errors === 0
      && report.copy_failed_retryable === 0 && report.copy_failed_permanent === 0;
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
