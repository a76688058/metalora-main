import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WORKSHOP_STORAGE_LIST_PAGE,
  collectGcsEraPaths,
  collectWorkshopPaths,
  defaultWorkshopStorageAdapter,
  isCanonicalWorkshopObjectPath,
  workshopStoragePathFromUrl,
  type WorkshopListedObject,
  type WorkshopStorageAdapter,
} from './workshopStorage';

export {
  WORKSHOP_BUCKET,
  collectWorkshopPaths,
  isCanonicalWorkshopObjectPath,
  workshopStoragePathFromUrl,
} from './workshopStorage';

export const WORKSHOP_RETENTION_DAYS = 3;
export const WORKSHOP_RETENTION_JOB_ENV = 'WORKSHOP_RETENTION_JOB_SECRET';
export const WORKSHOP_RETENTION_PURGE_PATH = '/api/internal/workshop-retention/purge';
export const WORKSHOP_RETENTION_MIN_SECRET_LENGTH = 32;
export const COMPLETED_PURGE_BATCH = 25;
/** Bounded candidate page while skipping non-Workshop COMPLETED rows (keyset, not offset). */
export const COMPLETED_CANDIDATE_PAGE = 100;
export const STORAGE_LIST_PAGE = WORKSHOP_STORAGE_LIST_PAGE;

export type CompletedOrderCursor = {
  completed_at: string;
  id: string;
};
export const CUSTOM_SHADER_TYPE = '커스텀 제작';
export const WORKSHOP_PRODUCT_ID = 'workshop-single';

export type OrderRetentionRow = {
  id: string;
  order_number: string;
  status: string;
  completed_at: string | null;
  image_purged_at: string | null;
  ordered_items: unknown;
};

export type RetentionJobSummary = {
  completed_orders_scanned: number;
  completed_orders_purged: number;
  completed_orders_failed: number;
  abandoned_objects_attempted: number;
  abandoned_objects_deleted: number;
  abandoned_failed: number;
};

type StorageListedObject = {
  path: string;
  createdAtMs: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function retentionCutoffIso(now: Date, days = WORKSHOP_RETENTION_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function stripWorkshopImageRefs(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') {
    return workshopStoragePathFromUrl(value) ? null : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripWorkshopImageRefs(item, depth + 1));
  }
  const rec = asRecord(value);
  if (!rec) return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(rec)) {
    out[key] = stripWorkshopImageRefs(nested, depth + 1);
  }
  return out;
}

export function isWorkshopLineItem(item: unknown): boolean {
  const rec = asRecord(item);
  if (!rec) return false;
  if (rec.is_custom === true) return true;
  if (rec.product_id === WORKSHOP_PRODUCT_ID) return true;
  const cfg = asRecord(rec.custom_config);
  if (!cfg) return false;
  if (cfg.shaderType === CUSTOM_SHADER_TYPE) return true;
  return 'original_image_url' in cfg || 'preview_image_url' in cfg;
}

export function isWorkshopOrderPayload(orderedItems: unknown): boolean {
  if (collectWorkshopPaths(orderedItems).length > 0) return true;
  if (!Array.isArray(orderedItems)) return false;
  return orderedItems.some(isWorkshopLineItem);
}

export function isEligibleCompletedWorkshopOrder(row: OrderRetentionRow, now: Date): boolean {
  if (row.status !== 'COMPLETED') return false;
  if (row.image_purged_at) return false;
  if (!row.completed_at) return false;
  const completedMs = Date.parse(row.completed_at);
  if (!Number.isFinite(completedMs)) return false;
  if (completedMs > now.getTime() - WORKSHOP_RETENTION_DAYS * 24 * 60 * 60 * 1000) return false;
  return isWorkshopOrderPayload(row.ordered_items);
}

export function completedOrderCursorOf(
  row: Pick<OrderRetentionRow, 'id' | 'completed_at'>,
): CompletedOrderCursor | null {
  if (!row.completed_at) return null;
  return { completed_at: row.completed_at, id: row.id };
}

/** Strict keyset: (completed_at ASC, id ASC). Cursor row itself is excluded. */
export function isAfterCompletedOrderCursor(
  row: Pick<OrderRetentionRow, 'id' | 'completed_at'>,
  cursor: CompletedOrderCursor | null,
): boolean {
  if (!cursor) return true;
  if (!row.completed_at) return false;
  if (row.completed_at > cursor.completed_at) return true;
  if (row.completed_at < cursor.completed_at) return false;
  return row.id > cursor.id;
}

function quotePostgrestFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Walk COMPLETED candidates oldest-first, skipping catalog rows, until `limit` Workshop
 * orders are collected or pages are exhausted. Each fetch is bounded; cursor is keyset
 * so skipped catalog rows cannot occupy a permanent LIMIT 25 window.
 */
export async function loadEligibleCompletedWorkshopOrders(
  fetchPage: (cursor: CompletedOrderCursor | null) => Promise<OrderRetentionRow[]>,
  now: Date,
  limit = COMPLETED_PURGE_BATCH,
  pageSize = COMPLETED_CANDIDATE_PAGE,
): Promise<OrderRetentionRow[]> {
  const eligible: OrderRetentionRow[] = [];
  let cursor: CompletedOrderCursor | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length === 0) break;
    for (const row of page) {
      if (!isEligibleCompletedWorkshopOrder(row, now)) continue;
      eligible.push(row);
      if (eligible.length >= limit) return eligible;
    }
    if (page.length < pageSize) break;
    const next = completedOrderCursorOf(page[page.length - 1]!);
    if (!next) break;
    if (cursor && next.completed_at === cursor.completed_at && next.id === cursor.id) break;
    cursor = next;
  }
  return eligible;
}

export function isConfiguredRetentionSecret(secret: string | undefined): boolean {
  return typeof secret === 'string' && secret.trim().length >= WORKSHOP_RETENTION_MIN_SECRET_LENGTH;
}

export function retentionJobAuthorized(
  authorizationHeader: string | undefined,
  secret: string | undefined,
): boolean {
  if (!isConfiguredRetentionSecret(secret)) return false;
  const expected = Buffer.from(`Bearer ${secret!.trim()}`, 'utf8');
  const got = Buffer.from(typeof authorizationHeader === 'string' ? authorizationHeader : '', 'utf8');
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** Dual-store removal: a path counts as removed only when every configured store removed it or never had it. */
export async function removeWorkshopObjects(
  adapter: WorkshopStorageAdapter,
  paths: string[],
): Promise<{ ok: boolean; removed: number; failed: number }> {
  const unique = [...new Set(paths.filter(isCanonicalWorkshopObjectPath))];
  if (unique.length === 0) return { ok: true, removed: 0, failed: 0 };

  let removed = 0;
  let failed = 0;
  for (const path of unique) {
    const outcome = await adapter.removePath(path);
    if (outcome.ok === false) {
      failed += 1;
      console.error('[WORKSHOP_RETENTION] storage_remove_failed', {
        reason_class: 'storage_error',
        store: outcome.store,
        retryable: outcome.retryable,
      });
      continue;
    }
    removed += 1;
  }
  return { ok: failed === 0, removed, failed };
}

export async function listWorkshopCustomerObjects(
  adapter: WorkshopStorageAdapter,
): Promise<StorageListedObject[]> {
  const listed: WorkshopListedObject[] = await adapter.listCustomerObjects({ kind: 'all' });
  return listed
    .filter((object): object is WorkshopListedObject & { createdAtMs: number } => object.createdAtMs != null)
    .map((object) => ({ path: object.path, createdAtMs: object.createdAtMs }));
}

async function selectAllRows<T>(
  query: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const page = 200;
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query(from, from + page - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return rows;
}

async function loadProtectedWorkshopPaths(
  admin: SupabaseClient,
  now: Date,
): Promise<Set<string>> {
  const protectedPaths = new Set<string>();
  const cutoffIso = retentionCutoffIso(now);

  const unpurgedOrders = await selectAllRows<Pick<OrderRetentionRow, 'ordered_items'>>(
    async (from, to) => {
      const { data, error } = await admin
        .from('orders')
        .select('ordered_items')
        .is('image_purged_at', null)
        .range(from, to);
      return { data: (data ?? null) as Pick<OrderRetentionRow, 'ordered_items'>[] | null, error };
    },
  );
  for (const row of unpurgedOrders) {
    for (const path of collectWorkshopPaths(row.ordered_items)) protectedPaths.add(path);
  }

  const { data: cartRows, error: cartError } = await admin
    .from('cart_items')
    .select('custom_image, custom_config, created_at')
    .gt('created_at', cutoffIso);
  if (cartError) throw new Error('cart_lookup_failed');
  for (const row of cartRows ?? []) {
    for (const path of collectWorkshopPaths(row)) protectedPaths.add(path);
  }

  const { data: progressRows, error: progressError } = await admin
    .from('user_progress')
    .select('uploaded_image_url, updated_at')
    .gt('updated_at', cutoffIso);
  if (progressError) throw new Error('progress_lookup_failed');
  for (const row of progressRows ?? []) {
    for (const path of collectWorkshopPaths(row.uploaded_image_url)) protectedPaths.add(path);
  }

  const { data: recentIntents, error: intentError } = await admin
    .from('payment_intents')
    .select('validated_snapshot, created_at')
    .gt('created_at', cutoffIso);
  if (intentError) throw new Error('intent_lookup_failed');
  for (const row of recentIntents ?? []) {
    for (const path of collectWorkshopPaths(row.validated_snapshot)) protectedPaths.add(path);
  }

  return protectedPaths;
}

async function cleanReferencesForPaths(
  admin: SupabaseClient,
  paths: Set<string>,
  order?: OrderRetentionRow,
): Promise<boolean> {
  if (order) {
    const strippedItems = stripWorkshopImageRefs(order.ordered_items);
    const { error } = await admin
      .from('orders')
      .update({ ordered_items: strippedItems })
      .eq('id', order.id)
      .eq('status', 'COMPLETED')
      .is('image_purged_at', null);
    if (error) {
      console.error('[WORKSHOP_RETENTION] order_ref_cleanup_failed', {
        order_number: order.order_number,
        reason_class: 'db_error',
      });
      return false;
    }

    const { data: intent, error: intentReadError } = await admin
      .from('payment_intents')
      .select('order_number, validated_snapshot')
      .eq('order_number', order.order_number)
      .maybeSingle();
    if (intentReadError) {
      console.error('[WORKSHOP_RETENTION] intent_ref_cleanup_failed', {
        order_number: order.order_number,
        reason_class: 'db_error',
      });
      return false;
    }
    if (intent) {
      const strippedSnapshot = stripWorkshopImageRefs(intent.validated_snapshot);
      const { error: intentWriteError } = await admin
        .from('payment_intents')
        .update({ validated_snapshot: strippedSnapshot })
        .eq('order_number', order.order_number);
      if (intentWriteError) {
        console.error('[WORKSHOP_RETENTION] intent_ref_cleanup_failed', {
          order_number: order.order_number,
          reason_class: 'db_error',
        });
        return false;
      }
    }
  }

  const { data: cartRows, error: cartError } = await admin
    .from('cart_items')
    .select('id, product_id, custom_image, custom_config');
  if (cartError) {
    console.error('[WORKSHOP_RETENTION] cart_ref_cleanup_failed', { reason_class: 'db_error' });
    return false;
  }
  for (const row of cartRows ?? []) {
    const rowPaths = collectWorkshopPaths(row);
    if (!rowPaths.some((path) => paths.has(path))) continue;
    if (row.product_id === WORKSHOP_PRODUCT_ID) {
      const { error } = await admin.from('cart_items').delete().eq('id', row.id);
      if (error) {
        console.error('[WORKSHOP_RETENTION] cart_ref_cleanup_failed', { reason_class: 'db_error' });
        return false;
      }
      continue;
    }
    const { error } = await admin
      .from('cart_items')
      .update({
        custom_image: null,
        custom_config: stripWorkshopImageRefs(row.custom_config),
      })
      .eq('id', row.id);
    if (error) {
      console.error('[WORKSHOP_RETENTION] cart_ref_cleanup_failed', { reason_class: 'db_error' });
      return false;
    }
  }

  const { data: progressRows, error: progressError } = await admin
    .from('user_progress')
    .select('user_id, uploaded_image_url');
  if (progressError) {
    console.error('[WORKSHOP_RETENTION] progress_ref_cleanup_failed', { reason_class: 'db_error' });
    return false;
  }
  for (const row of progressRows ?? []) {
    const path = workshopStoragePathFromUrl(row.uploaded_image_url);
    if (!path || !paths.has(path)) continue;
    const { error } = await admin
      .from('user_progress')
      .update({ uploaded_image_url: null, updated_at: new Date().toISOString() })
      .eq('user_id', row.user_id);
    if (error) {
      console.error('[WORKSHOP_RETENTION] progress_ref_cleanup_failed', { reason_class: 'db_error' });
      return false;
    }
  }

  if (!order) {
    const { data: intents, error: intentError } = await admin
      .from('payment_intents')
      .select('order_number, validated_snapshot');
    if (intentError) {
      console.error('[WORKSHOP_RETENTION] intent_ref_cleanup_failed', { reason_class: 'db_error' });
      return false;
    }
    for (const intent of intents ?? []) {
      const intentPaths = collectWorkshopPaths(intent.validated_snapshot);
      if (!intentPaths.some((path) => paths.has(path))) continue;
      const { error } = await admin
        .from('payment_intents')
        .update({ validated_snapshot: stripWorkshopImageRefs(intent.validated_snapshot) })
        .eq('order_number', intent.order_number);
      if (error) {
        console.error('[WORKSHOP_RETENTION] intent_ref_cleanup_failed', { reason_class: 'db_error' });
        return false;
      }
    }
  }

  return true;
}

async function markOrderPurged(admin: SupabaseClient, order: OrderRetentionRow): Promise<boolean> {
  const { error, data } = await admin
    .from('orders')
    .update({ image_purged_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('status', 'COMPLETED')
    .is('image_purged_at', null)
    .select('id');
  if (error || !data || data.length !== 1) {
    console.error('[WORKSHOP_RETENTION] purge_stamp_failed', {
      order_number: order.order_number,
      reason_class: 'db_error',
    });
    return false;
  }
  return true;
}

async function fetchCompletedCandidatePage(
  admin: SupabaseClient,
  cutoffIso: string,
  cursor: CompletedOrderCursor | null,
): Promise<OrderRetentionRow[]> {
  let query = admin
    .from('orders')
    .select('id, order_number, status, completed_at, image_purged_at, ordered_items')
    .eq('status', 'COMPLETED')
    .is('image_purged_at', null)
    .not('completed_at', 'is', null)
    .lte('completed_at', cutoffIso)
    .order('completed_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(COMPLETED_CANDIDATE_PAGE);

  if (cursor) {
    query = query.or(
      `completed_at.gt.${quotePostgrestFilterValue(cursor.completed_at)},and(completed_at.eq.${quotePostgrestFilterValue(cursor.completed_at)},id.gt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('[WORKSHOP_RETENTION] completed_lookup_failed', { reason_class: 'db_error' });
    throw new Error('completed_lookup_failed');
  }
  return (data ?? []) as OrderRetentionRow[];
}

async function purgeCompletedOrders(
  admin: SupabaseClient,
  adapter: WorkshopStorageAdapter,
  now: Date,
): Promise<Pick<RetentionJobSummary, 'completed_orders_scanned' | 'completed_orders_purged' | 'completed_orders_failed'>> {
  const cutoffIso = retentionCutoffIso(now);
  const scannedRows = await loadEligibleCompletedWorkshopOrders(
    (cursor) => fetchCompletedCandidatePage(admin, cutoffIso, cursor),
    now,
  );
  let purged = 0;
  let failed = 0;

  for (const order of scannedRows) {
    const paths = collectWorkshopPaths(order.ordered_items);
    if (!adapter.gcs && collectGcsEraPaths(order.ordered_items).length > 0) {
      failed += 1;
      console.error('[WORKSHOP_RETENTION] completed_purge_deferred', {
        order_number: order.order_number,
        attempted: paths.length,
        deleted: 0,
        failed: paths.length,
        reason_class: 'gcs_not_configured',
      });
      continue;
    }
    const removal = await removeWorkshopObjects(adapter, paths);
    if (!removal.ok) {
      failed += 1;
      console.error('[WORKSHOP_RETENTION] completed_purge_deferred', {
        order_number: order.order_number,
        attempted: paths.length,
        deleted: removal.removed,
        failed: removal.failed,
        reason_class: 'storage_error',
      });
      continue;
    }
    const refsOk = await cleanReferencesForPaths(admin, new Set(paths), order);
    if (!refsOk) {
      failed += 1;
      continue;
    }
    const stamped = await markOrderPurged(admin, order);
    if (!stamped) {
      failed += 1;
      continue;
    }
    purged += 1;
    console.log('[WORKSHOP_RETENTION] completed_purge_ok', {
      order_number: order.order_number,
      attempted: paths.length,
      deleted: removal.removed,
    });
  }

  return {
    completed_orders_scanned: scannedRows.length,
    completed_orders_purged: purged,
    completed_orders_failed: failed,
  };
}

async function purgeAbandonedUploads(
  admin: SupabaseClient,
  adapter: WorkshopStorageAdapter,
  now: Date,
): Promise<Pick<RetentionJobSummary, 'abandoned_objects_attempted' | 'abandoned_objects_deleted' | 'abandoned_failed'>> {
  const protectedPaths = await loadProtectedWorkshopPaths(admin, now);
  const objects = await listWorkshopCustomerObjects(adapter);
  const cutoffMs = now.getTime() - WORKSHOP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const abandoned = objects.filter(
    (object) => object.createdAtMs <= cutoffMs && !protectedPaths.has(object.path),
  );

  if (abandoned.length === 0) {
    return { abandoned_objects_attempted: 0, abandoned_objects_deleted: 0, abandoned_failed: 0 };
  }

  const paths = abandoned.map((object) => object.path);
  const removal = await removeWorkshopObjects(adapter, paths);
  if (!removal.ok) {
    console.error('[WORKSHOP_RETENTION] abandoned_purge_deferred', {
      attempted: paths.length,
      deleted: removal.removed,
      failed: removal.failed,
      reason_class: 'storage_error',
    });
    return {
      abandoned_objects_attempted: paths.length,
      abandoned_objects_deleted: removal.removed,
      abandoned_failed: removal.failed,
    };
  }

  const refsOk = await cleanReferencesForPaths(admin, new Set(paths));
  if (!refsOk) {
    return {
      abandoned_objects_attempted: paths.length,
      abandoned_objects_deleted: removal.removed,
      abandoned_failed: 1,
    };
  }

  console.log('[WORKSHOP_RETENTION] abandoned_purge_ok', {
    attempted: paths.length,
    deleted: removal.removed,
  });
  return {
    abandoned_objects_attempted: paths.length,
    abandoned_objects_deleted: removal.removed,
    abandoned_failed: 0,
  };
}

export async function runWorkshopRetentionPurge(
  admin: SupabaseClient,
  now: Date = new Date(),
  adapter: WorkshopStorageAdapter = defaultWorkshopStorageAdapter(admin),
): Promise<RetentionJobSummary> {
  const completed = await purgeCompletedOrders(admin, adapter, now);
  try {
    const abandoned = await purgeAbandonedUploads(admin, adapter, now);
    return { ...completed, ...abandoned };
  } catch {
    console.error('[WORKSHOP_RETENTION] abandoned_pass_failed', { reason_class: 'job_error' });
    return {
      ...completed,
      abandoned_objects_attempted: 0,
      abandoned_objects_deleted: 0,
      abandoned_failed: 1,
    };
  }
}
