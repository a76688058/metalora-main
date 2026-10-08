/**
 * NEW4-4D-9 — legacy Workshop copy CLI (A6). Not run by NEW4-4D-9.
 *
 *   npx tsx scripts/workshop-legacy-copy.ts --ack-readonly-production-inventory --metadata-only
 *   npx tsx scripts/workshop-legacy-copy.ts --ack-readonly-production-inventory [--dry-run] [--verify-bytes]
 *   npx tsx scripts/workshop-legacy-copy.ts --ack-readonly-production-inventory --apply \
 *     --confirm-production-copy=<supabase project ref>
 *
 * `--metadata-only`: listing, bucket settings, DB scan, GCS object metadata and listing counts; the
 * adapters have no object-body or write implementation (ADC also requests a read-only scope). Any
 * authorized GCS identity (ADC or the operator's gcloud login); no copy-job SA needed.
 * Dry run is the default (listing + DB scan + GCS metadata only; `--verify-bytes` also reads and
 * hashes source bytes). Apply needs the exact production project ref. Runs only with env injected by
 * the approved job (no `.env` loading): VITE_SUPABASE_URL or SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * WORKSHOP_GCS_BUCKET, WORKSHOP_GCS_ENDPOINT. GCS identity = ADC, must be the copy job SA.
 *
 * Output: aggregate counters + cutover gate only. Never prints paths, UIDs, URLs or secrets.
 */
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Storage, type File } from '@google-cloud/storage';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import {
  WORKSHOP_BUCKET,
  WORKSHOP_GCS_APPROVED_BUCKET,
  WORKSHOP_GCS_ENV,
  WORKSHOP_GCS_PROJECT,
  WORKSHOP_GCS_REGIONAL_HOST,
  WORKSHOP_LEGACY_COPY_METADATA,
  WORKSHOP_MEDIA_CACHE_CONTROL,
  legacyCopyStateOf,
  legacySupabaseHosts,
  resolveRegionalEndpointHost,
} from '../src/lib/workshopStorage';
import {
  LEGACY_COPY_JOB_SA,
  LegacyCopyError,
  formatLegacyCopyReport,
  legacyCopyWriteMetadata,
  parseLegacyCopyArgs,
  runLegacyCopy,
  type LegacyReferenceField,
  type LegacyReferenceSource,
  type LegacyReferenceTable,
  type LegacySource,
  type LegacyTarget,
  type LegacyTargetObject,
} from './workshop-legacy-copy-core';

const DB_PAGE = 1000;

function projectRefOf(supabaseUrl: string): string | null {
  const host = legacySupabaseHosts(supabaseUrl)[0];
  return host ? host.slice(0, -'.supabase.co'.length) : null;
}

function httpStatus(error: unknown): number | null {
  const rec = error as { code?: unknown; status?: unknown; statusCode?: unknown } | null;
  for (const value of [rec?.code, rec?.status, rec?.statusCode]) {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n === 'number' && Number.isInteger(n)) return n;
  }
  return null;
}

function retryableStatus(status: number | null): boolean {
  return status == null || status === 408 || status === 429 || status >= 500;
}

async function listSourceEntries(admin: SupabaseClient, prefix: string, offset: number, limit: number) {
  const { data, error } = await admin.storage
    .from(WORKSHOP_BUCKET)
    .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new LegacyCopyError('source_list', true);
  return (data ?? []).map((entry) => {
    const meta = (entry.metadata ?? null) as { size?: unknown; mimetype?: unknown } | null;
    return {
      name: entry.name,
      isFolder: entry.id == null,
      sizeBytes: typeof meta?.size === 'number' ? meta.size : null,
      mimeType: typeof meta?.mimetype === 'string' ? meta.mimetype : null,
    };
  });
}

type GcsObjectMeta = {
  size?: unknown;
  contentType?: unknown;
  cacheControl?: unknown;
  md5Hash?: unknown;
  metageneration?: unknown;
  metadata?: unknown;
};

function toTargetObject(meta: GcsObjectMeta): LegacyTargetObject {
  const custom = (meta.metadata ?? {}) as Record<string, unknown>;
  const sha = custom[WORKSHOP_LEGACY_COPY_METADATA.sourceSha256];
  return {
    sizeBytes: Number(meta.size),
    contentType: typeof meta.contentType === 'string' ? meta.contentType : null,
    cacheControl: typeof meta.cacheControl === 'string' ? meta.cacheControl : null,
    md5Base64: typeof meta.md5Hash === 'string' ? meta.md5Hash : null,
    copyState: legacyCopyStateOf(custom),
    sourceSha256: typeof sha === 'string' ? sha : null,
    metageneration: meta.metageneration != null ? String(meta.metageneration) : null,
  };
}

async function headTargetObject(storage: Storage, bucketName: string, path: string): Promise<LegacyTargetObject | null> {
  try {
    const [meta] = await storage.bucket(bucketName).file(path).getMetadata();
    return toTargetObject(meta as GcsObjectMeta);
  } catch (error) {
    const status = httpStatus(error);
    if (status === 404) return null;
    throw new LegacyCopyError('target_head', retryableStatus(status));
  }
}

const metadataOnlyRefusal = async (): Promise<never> => {
  throw new LegacyCopyError('metadata_only_violation', false);
};

/** METADATA-ONLY source: listing + bucket settings. Has no object-body or write implementation. */
export function createSupabaseLegacyMetadataSource(admin: SupabaseClient): LegacySource {
  return {
    list: (prefix, offset, limit) => listSourceEntries(admin, prefix, offset, limit),
    download: metadataOnlyRefusal,
    async bucketInfo() {
      const { data, error } = await admin.storage.getBucket(WORKSHOP_BUCKET);
      if (error || !data) {
        if (httpStatus(error) === 404 || /not.?found/i.test(String((error as { message?: unknown } | null)?.message ?? ''))) {
          return { exists: false, public: null, fileSizeLimit: null, allowedMimeTypes: null };
        }
        throw new LegacyCopyError('source_bucket', true);
      }
      const limit = (data as { file_size_limit?: unknown }).file_size_limit;
      const mimes = (data as { allowed_mime_types?: unknown }).allowed_mime_types;
      return {
        exists: true,
        public: typeof data.public === 'boolean' ? data.public : null,
        fileSizeLimit: typeof limit === 'number' ? limit : null,
        allowedMimeTypes: Array.isArray(mimes) ? mimes.filter((m): m is string => typeof m === 'string') : null,
      };
    },
  };
}

/**
 * METADATA-ONLY target: one paged bucket listing (`storage.objects.list` only, which grants no body
 * read); `head` answers from that listing, so no per-object GET is ever issued. Listing metadata
 * stays in memory and is never printed. Has no object-body or write implementation.
 */
export function createGcsLegacyMetadataTarget(storage: Storage, bucketName: string): LegacyTarget {
  let listing: Promise<Map<string, LegacyTargetObject>> | null = null;
  const loadListing = async (): Promise<Map<string, LegacyTargetObject>> => {
    const objects = new Map<string, LegacyTargetObject>();
    let pageToken: string | undefined;
    do {
      let files: File[];
      let next: { pageToken?: string } | null;
      try {
        [files, next] = (await storage.bucket(bucketName).getFiles({ autoPaginate: false, maxResults: 1000, pageToken })) as unknown as [
          File[],
          { pageToken?: string } | null,
        ];
      } catch (error) {
        throw new LegacyCopyError('target_list', retryableStatus(httpStatus(error)));
      }
      for (const f of files) objects.set(f.name, toTargetObject((f.metadata ?? {}) as GcsObjectMeta));
      pageToken = next?.pageToken;
    } while (pageToken);
    return objects;
  };
  const listed = () => {
    listing ??= loadListing().catch((error) => {
      listing = null;
      throw error;
    });
    return listing;
  };
  return {
    head: async (path) => (await listed()).get(path) ?? null,
    createOnly: metadataOnlyRefusal,
    download: metadataOnlyRefusal,
    markVerified: metadataOnlyRefusal,
    async inventory() {
      const result = { objects: 0, customerPrefix: 0, markerVerified: 0, markerWritten: 0 };
      for (const [name, obj] of await listed()) {
        result.objects += 1;
        if (name.startsWith('originals/') || name.startsWith('previews/')) result.customerPrefix += 1;
        if (obj.copyState === 'verified') result.markerVerified += 1;
        else if (obj.copyState === 'written') result.markerWritten += 1;
      }
      return result;
    },
  };
}

export function createSupabaseLegacySource(admin: SupabaseClient): LegacySource {
  const bucket = admin.storage.from(WORKSHOP_BUCKET);
  return {
    list: (prefix, offset, limit) => listSourceEntries(admin, prefix, offset, limit),
    async download(path, maxBytes) {
      // Authenticated Storage API object read (service role), not the public URL.
      const { data, error } = await bucket.download(path);
      if (error || !data) {
        const status = httpStatus(error);
        throw new LegacyCopyError('source_download', retryableStatus(status), status === 400 || status === 404);
      }
      if (data.size > maxBytes) throw new LegacyCopyError('source_too_large', false);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

export function createGcsLegacyTarget(storage: Storage, bucketName: string): LegacyTarget {
  const file = (path: string): File => storage.bucket(bucketName).file(path);
  return {
    head: (path) => headTargetObject(storage, bucketName, path),
    async createOnly(path, bytes, write) {
      try {
        await file(path).save(Buffer.from(bytes), {
          resumable: false,
          validation: 'md5',
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: write.contentType,
            cacheControl: WORKSHOP_MEDIA_CACHE_CONTROL,
            md5Hash: write.md5Base64,
            metadata: legacyCopyWriteMetadata(write.sha256Hex),
          },
        });
        return 'created';
      } catch (error) {
        const status = httpStatus(error);
        if (status === 412) return 'exists';
        throw new LegacyCopyError('target_create', retryableStatus(status));
      }
    },
    async download(path, maxBytes) {
      try {
        const [buffer] = await file(path).download();
        if (buffer.length > maxBytes) throw new LegacyCopyError('target_too_large', false);
        return new Uint8Array(buffer);
      } catch (error) {
        if (error instanceof LegacyCopyError) throw error;
        throw new LegacyCopyError('target_download', retryableStatus(httpStatus(error)));
      }
    },
    async markVerified(path, metageneration) {
      if (metageneration == null) throw new LegacyCopyError('target_mark', false);
      try {
        await file(path).setMetadata(
          { metadata: { [WORKSHOP_LEGACY_COPY_METADATA.state]: 'verified' } },
          { ifMetagenerationMatch: Number(metageneration) },
        );
      } catch (error) {
        const status = httpStatus(error);
        throw new LegacyCopyError('target_mark', status !== 412 && retryableStatus(status));
      }
    },
  };
}

const TABLE_SCANS: {
  table: LegacyReferenceTable;
  key: string;
  columns: string;
  purgedFilter?: boolean;
  fields: (row: Record<string, unknown>) => [LegacyReferenceField, unknown][];
}[] = [
  {
    table: 'user_progress',
    key: 'user_id',
    columns: 'user_id, uploaded_image_url',
    fields: (row) => [['user_progress.uploaded_image_url', row.uploaded_image_url]],
  },
  {
    table: 'cart_items',
    key: 'id',
    columns: 'id, custom_image, custom_config',
    fields: (row) => {
      const cfg = (row.custom_config ?? {}) as Record<string, unknown>;
      return [
        ['cart_items.custom_image', row.custom_image],
        ['cart_items.custom_config.original_image_url', cfg.original_image_url],
        ['cart_items.custom_config.preview_image_url', cfg.preview_image_url],
      ];
    },
  },
  {
    table: 'orders',
    key: 'id',
    columns: 'id, ordered_items',
    purgedFilter: true,
    fields: (row) => [['orders.ordered_items', row.ordered_items]],
  },
  {
    table: 'payment_intents',
    key: 'order_number',
    columns: 'order_number, validated_snapshot',
    fields: (row) => [['payment_intents.validated_snapshot', row.validated_snapshot]],
  },
];

function tableAbsent(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** Keyset-paged, read-only. */
export function createSupabaseLegacyReferenceSource(admin: SupabaseClient): LegacyReferenceSource {
  return {
    async scan(onValue) {
      const tablesAbsent: LegacyReferenceTable[] = [];
      for (const spec of TABLE_SCANS) {
        let last: unknown = null;
        while (true) {
          let query = admin.from(spec.table).select(spec.columns).order(spec.key, { ascending: true }).limit(DB_PAGE);
          if (spec.purgedFilter) query = query.is('image_purged_at', null);
          if (last !== null) query = query.gt(spec.key, last);
          const { data, error } = await query;
          if (error) {
            if (last === null && tableAbsent(error)) {
              tablesAbsent.push(spec.table);
              break;
            }
            throw new LegacyCopyError('reference_scan', true);
          }
          const rows = (data ?? []) as unknown as Record<string, unknown>[];
          for (const row of rows) for (const [field, value] of spec.fields(row)) onValue(field, value);
          if (rows.length < DB_PAGE) break;
          last = rows[rows.length - 1][spec.key];
        }
      }
      return { tablesAbsent };
    },
  };
}

const READ_ONLY_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';

async function metadataOnlyGcsAuthClient(): Promise<unknown | null> {
  try {
    return await new GoogleAuth({ scopes: [READ_ONLY_SCOPE] }).getClient();
  } catch {
    // No ADC: operator gcloud login, token kept in memory only. That token is not scope-narrowed; the
    // metadata-only adapters (no body / write methods) are what keep this path read-only.
  }
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!token) return null;
    const oauth = new OAuth2Client();
    oauth.setCredentials({ access_token: token });
    return oauth;
  } catch {
    return null;
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const parsed = parseLegacyCopyArgs(argv, projectRefOf(supabaseUrl));
  if (parsed.ok === false) {
    console.error(JSON.stringify({ status: 'refused', reason: parsed.reason }));
    return 2;
  }
  if (!serviceKey) {
    console.error(JSON.stringify({ status: 'refused', reason: 'missing_supabase_service_credential' }));
    return 2;
  }
  if (
    (process.env[WORKSHOP_GCS_ENV.bucket] ?? '').trim() !== WORKSHOP_GCS_APPROVED_BUCKET ||
    resolveRegionalEndpointHost(process.env[WORKSHOP_GCS_ENV.endpoint]) !== WORKSHOP_GCS_REGIONAL_HOST
  ) {
    console.error(JSON.stringify({ status: 'refused', reason: 'gcs_target_not_approved' }));
    return 2;
  }

  const metadataOnly = parsed.args.metadataOnly === true;
  let client: unknown;
  if (metadataOnly) {
    // Metadata-only: read-only scope, any authorized identity (ADC, else the operator's gcloud login).
    client = await metadataOnlyGcsAuthClient();
    if (!client) {
      console.error(JSON.stringify({ status: 'refused', reason: 'gcs_auth_unavailable' }));
      return 2;
    }
  } else {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
    client = await auth.getClient();
    const credentials = await auth.getCredentials();
    if (credentials.client_email !== LEGACY_COPY_JOB_SA) {
      console.error(JSON.stringify({ status: 'refused', reason: 'unexpected_gcs_identity' }));
      return 2;
    }
  }
  const storage = new Storage({
    projectId: WORKSHOP_GCS_PROJECT,
    apiEndpoint: `https://${WORKSHOP_GCS_REGIONAL_HOST}`,
    authClient: client as never,
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const report = await runLegacyCopy({
    source: metadataOnly ? createSupabaseLegacyMetadataSource(admin) : createSupabaseLegacySource(admin),
    target: metadataOnly
      ? createGcsLegacyMetadataTarget(storage, WORKSHOP_GCS_APPROVED_BUCKET)
      : createGcsLegacyTarget(storage, WORKSHOP_GCS_APPROVED_BUCKET),
    references: createSupabaseLegacyReferenceSource(admin),
    legacyHosts: legacySupabaseHosts(supabaseUrl),
    args: parsed.args,
  });
  console.log(formatLegacyCopyReport(report));
  return 0;
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
