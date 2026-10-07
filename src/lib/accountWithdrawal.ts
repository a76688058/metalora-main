import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  collectWorkshopPaths,
  defaultWorkshopStorageAdapter,
  isCanonicalWorkshopObjectPath,
  type WorkshopStorageAdapter,
} from './workshopStorage';

export const ACCOUNT_WITHDRAWAL_ADMIN_PATH = '/api/admin/account-withdrawal';
export const WITHDRAWN_EMAIL_DOMAIN = 'users.invalid';
export const AUTH_BAN_DURATION = '876000h';

export type WithdrawalSource = 'admin_assisted' | 'self_service';
export type WithdrawalStatus = 'in_progress' | 'withdrawn';

export type WithdrawalPrecheckCode =
  | 'ok'
  | 'already_withdrawn'
  | 'in_progress'
  | 'invalid_target'
  | 'not_found'
  | 'target_is_admin'
  | 'actor_not_admin'
  | 'actor_mismatch';

export type WithdrawalResult = {
  ok: boolean;
  status?: WithdrawalStatus;
  already_complete?: boolean;
  resumed?: boolean;
  active_order_count?: number;
  workshop_objects_removed?: number;
  reason_class?: WithdrawalPrecheckCode | 'auth_disable_failed' | 'db_failed' | 'config';
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIVE_FULFILLMENT = new Set(['PAID', 'PRODUCTION', 'SHIPPING']);

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function withdrawnEmailForUser(userId: string): string {
  return `withdrawn.${userId.toLowerCase()}@${WITHDRAWN_EMAIL_DOMAIN}`;
}

export function parseWithdrawalSource(value: unknown): WithdrawalSource | null {
  if (value === 'admin_assisted' || value === 'self_service') return value;
  return null;
}

export function isAdminProfile(profile: { is_admin?: boolean | null; withdrawn_at?: string | null } | null): boolean {
  if (!profile || profile.is_admin !== true) return false;
  if (typeof profile.withdrawn_at === 'string' && profile.withdrawn_at.trim()) return false;
  return true;
}

export function evaluateWithdrawalAuthorization(input: {
  actorUserId: string;
  targetUserId: string;
  source: WithdrawalSource;
  actorIsAdmin: boolean;
}): WithdrawalPrecheckCode {
  if (!isUuid(input.actorUserId) || !isUuid(input.targetUserId)) return 'invalid_target';
  if (input.source === 'self_service') {
    if (input.actorUserId !== input.targetUserId) return 'actor_mismatch';
    return 'ok';
  }
  if (!input.actorIsAdmin) return 'actor_not_admin';
  return 'ok';
}

type TargetProfile = {
  id: string;
  is_admin: boolean | null;
  withdrawn_at: string | null;
};

function logWithdrawal(
  stage: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  console.error('[ACCOUNT_WITHDRAWAL]', { stage, ...fields });
}

async function loadTargetProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<TargetProfile | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, is_admin, withdrawn_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error('profile_lookup_failed');
  if (!data?.id) return null;
  return {
    id: data.id as string,
    is_admin: data.is_admin === true,
    withdrawn_at: typeof data.withdrawn_at === 'string' ? data.withdrawn_at : null,
  };
}

export async function precheckAccountWithdrawal(
  admin: SupabaseClient,
  targetUserId: string,
): Promise<{ code: WithdrawalPrecheckCode; profile: TargetProfile | null; activeOrderCount: number }> {
  if (!isUuid(targetUserId)) {
    return { code: 'invalid_target', profile: null, activeOrderCount: 0 };
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(targetUserId);
  if (authError || !authUser.user?.id) {
    return { code: 'not_found', profile: null, activeOrderCount: 0 };
  }

  const profile = await loadTargetProfile(admin, targetUserId);
  if (profile?.is_admin) {
    return { code: 'target_is_admin', profile, activeOrderCount: 0 };
  }

  const { count, error: orderError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', targetUserId)
    .in('status', [...ACTIVE_FULFILLMENT]);
  if (orderError) throw new Error('order_lookup_failed');
  const activeOrderCount = count ?? 0;

  if (profile?.withdrawn_at) {
    return { code: 'already_withdrawn', profile, activeOrderCount };
  }

  const { data: existing } = await admin
    .from('account_withdrawals')
    .select('status')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (existing?.status === 'withdrawn') {
    return { code: 'already_withdrawn', profile, activeOrderCount };
  }
  if (existing?.status === 'in_progress') {
    return { code: 'in_progress', profile, activeOrderCount };
  }

  return { code: 'ok', profile, activeOrderCount };
}

async function markInProgress(
  admin: SupabaseClient,
  targetUserId: string,
  actorUserId: string,
  source: WithdrawalSource,
): Promise<void> {
  const { data: existing, error: readError } = await admin
    .from('account_withdrawals')
    .select('id, status')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (readError) throw new Error('withdrawal_row_failed');
  if (existing?.status === 'withdrawn') return;
  if (existing?.id) {
    const { error } = await admin
      .from('account_withdrawals')
      .update({
        status: 'in_progress',
        source,
        actor_user_id: actorUserId,
        failure_reason_class: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', 'in_progress');
    if (error) throw new Error('withdrawal_row_failed');
    return;
  }
  const { error } = await admin.from('account_withdrawals').insert({
    user_id: targetUserId,
    status: 'in_progress',
    source,
    actor_user_id: actorUserId,
  });
  if (error) throw new Error('withdrawal_row_failed');
}

async function markWithdrawn(admin: SupabaseClient, targetUserId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('account_withdrawals')
    .update({
      status: 'withdrawn',
      completed_at: nowIso,
      failure_reason_class: null,
      updated_at: nowIso,
    })
    .eq('user_id', targetUserId)
    .select('id');
  if (error || !data || data.length !== 1) return false;
  return true;
}

async function markFailure(
  admin: SupabaseClient,
  targetUserId: string,
  reasonClass: string,
): Promise<void> {
  await admin
    .from('account_withdrawals')
    .update({
      failure_reason_class: reasonClass,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', targetUserId)
    .eq('status', 'in_progress');
}

async function unlinkIdentities(admin: SupabaseClient, userId: string): Promise<void> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const identities = data.user?.identities ?? [];
  const base = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!base || !serviceKey) return;
  for (const identity of identities) {
    const identityId = identity.id;
    if (!identityId) continue;
    try {
      const response = await fetch(`${base}/auth/v1/admin/users/${userId}/identities/${identityId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      });
      if (!response.ok && response.status !== 404) {
        logWithdrawal('identity_unlink_failed', { reason_class: 'auth_disable_failed' });
      }
    } catch {
      logWithdrawal('identity_unlink_failed', { reason_class: 'auth_disable_failed' });
    }
  }
}

async function disableAuthAccount(admin: SupabaseClient, userId: string): Promise<boolean> {
  const password = `Wd-${randomBytes(24).toString('base64url')}!aA1`;
  const { data: current } = await admin.auth.admin.getUserById(userId);
  const attributes: {
    email: string;
    email_confirm: boolean;
    password: string;
    ban_duration: string;
    user_metadata: Record<string, never>;
    app_metadata: { withdrawn: true };
    phone?: string;
  } = {
    email: withdrawnEmailForUser(userId),
    email_confirm: true,
    password,
    ban_duration: AUTH_BAN_DURATION,
    user_metadata: {},
    app_metadata: { withdrawn: true },
  };
  if (current.user?.phone) {
    attributes.phone = '';
  }
  const { error } = await admin.auth.admin.updateUserById(userId, attributes);
  if (error) {
    logWithdrawal('auth_disable_failed', { reason_class: 'auth_disable_failed' });
    return false;
  }
  await unlinkIdentities(admin, userId);
  return true;
}

async function deleteWorkingState(admin: SupabaseClient, userId: string): Promise<boolean> {
  const tables = ['cart_items', 'user_progress', 'collections'] as const;
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error && table !== 'collections') {
      logWithdrawal('working_state_delete_failed', { reason_class: 'db_failed' });
      return false;
    }
  }
  return true;
}

async function deleteIdentityWorkingRows(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { error: otpError } = await admin.from('otp_challenges').delete().eq('user_id', userId);
  if (otpError) {
    logWithdrawal('otp_delete_failed', { reason_class: 'db_failed' });
    return false;
  }
  const { error: ticketError } = await admin
    .from('phone_verification_tickets')
    .delete()
    .eq('user_id', userId);
  if (ticketError) {
    logWithdrawal('ticket_delete_failed', { reason_class: 'db_failed' });
    return false;
  }
  const { error: recoveryError } = await admin.from('recovery_sessions').delete().eq('user_id', userId);
  if (recoveryError) {
    logWithdrawal('recovery_delete_failed', { reason_class: 'db_failed' });
    return false;
  }
  const { error: resetError } = await admin
    .from('password_reset_tickets')
    .delete()
    .eq('user_id', userId);
  if (resetError) {
    logWithdrawal('reset_delete_failed', { reason_class: 'db_failed' });
    return false;
  }
  return true;
}

async function protectedWorkshopPathsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const protectedPaths = new Set<string>();
  const { data, error } = await admin
    .from('orders')
    .select('ordered_items')
    .eq('user_id', userId)
    .is('image_purged_at', null);
  if (error) throw new Error('order_lookup_failed');
  for (const row of data ?? []) {
    for (const path of collectWorkshopPaths(row.ordered_items)) protectedPaths.add(path);
  }
  const { data: intents, error: intentError } = await admin
    .from('payment_intents')
    .select('validated_snapshot')
    .eq('user_id', userId);
  if (intentError) throw new Error('intent_lookup_failed');
  for (const row of intents ?? []) {
    for (const path of collectWorkshopPaths(row.validated_snapshot)) protectedPaths.add(path);
  }
  return protectedPaths;
}

/** GCS `originals|previews/{uid}/` ∪ Supabase legacy `originals|previews/{uid}`. */
async function listUserWorkshopPaths(adapter: WorkshopStorageAdapter, userId: string): Promise<string[]> {
  const listed = await adapter.listCustomerObjects({ kind: 'user', uid: userId.toLowerCase() });
  return [...new Set(listed.map((object) => object.path).filter(isCanonicalWorkshopObjectPath))];
}

export async function removeUnorderedWorkshopAssets(
  admin: SupabaseClient,
  adapter: WorkshopStorageAdapter,
  userId: string,
): Promise<{ ok: boolean; removed: number }> {
  const protectedPaths = await protectedWorkshopPathsForUser(admin, userId);
  const listed = await listUserWorkshopPaths(adapter, userId);
  const toDelete = listed.filter((path) => !protectedPaths.has(path));
  let removed = 0;
  for (const path of toDelete) {
    const outcome = await adapter.removePath(path);
    if (outcome.ok === false) {
      logWithdrawal('workshop_unordered_delete_failed', {
        reason_class: 'db_failed',
        store: outcome.store,
        retryable: outcome.retryable,
      });
      return { ok: false, removed };
    }
    removed += 1;
  }
  return { ok: true, removed };
}

async function anonymizeProfile(admin: SupabaseClient, userId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: null,
      phone_number: null,
      verified_phone_e164: null,
      verified_phone_fingerprint: null,
      phone_verified_at: null,
      zip_code: null,
      address: null,
      address_detail: null,
      user_custom_id: null,
      password_login_enabled: false,
      social_login_enabled: false,
      withdrawn_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', userId);
  if (error) {
    logWithdrawal('profile_anonymize_failed', { reason_class: 'db_failed' });
    return false;
  }
  return true;
}

export async function verifyAdminCaller(
  supabaseAdmin: SupabaseClient,
  supabasePublic: SupabaseClient,
  authorizationHeader: string | undefined,
): Promise<{ ok: true; actorUserId: string } | { ok: false; status: number; reason_class: string }> {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, reason_class: 'unauthorized' };
  }
  const token = authorizationHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, reason_class: 'unauthorized' };
  const { data, error } = await supabasePublic.auth.getUser(token);
  if (error || !data.user?.id) {
    return { ok: false, status: 401, reason_class: 'unauthorized' };
  }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, is_admin, withdrawn_at')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !isAdminProfile(profile)) {
    return { ok: false, status: 403, reason_class: 'actor_not_admin' };
  }
  return { ok: true, actorUserId: data.user.id };
}

export async function runAccountWithdrawal(
  admin: SupabaseClient,
  input: {
    targetUserId: string;
    actorUserId: string;
    source: WithdrawalSource;
    actorIsAdmin: boolean;
  },
  adapter?: WorkshopStorageAdapter,
): Promise<WithdrawalResult> {
  const authz = evaluateWithdrawalAuthorization(input);
  if (authz !== 'ok') {
    return { ok: false, reason_class: authz };
  }

  const precheck = await precheckAccountWithdrawal(admin, input.targetUserId);
  if (precheck.code === 'already_withdrawn') {
    return {
      ok: true,
      status: 'withdrawn',
      already_complete: true,
      active_order_count: precheck.activeOrderCount,
      workshop_objects_removed: 0,
    };
  }
  if (precheck.code === 'invalid_target' || precheck.code === 'not_found' || precheck.code === 'target_is_admin') {
    return { ok: false, reason_class: precheck.code };
  }
  if (precheck.code !== 'ok' && precheck.code !== 'in_progress') {
    return { ok: false, reason_class: precheck.code };
  }

  const resumed = precheck.code === 'in_progress';
  await markInProgress(admin, input.targetUserId, input.actorUserId, input.source);

  const authDisabled = await disableAuthAccount(admin, input.targetUserId);
  if (!authDisabled) {
    await markFailure(admin, input.targetUserId, 'auth_disable_failed');
    return { ok: false, reason_class: 'auth_disable_failed', resumed };
  }

  const workingOk = await deleteWorkingState(admin, input.targetUserId);
  if (!workingOk) {
    await markFailure(admin, input.targetUserId, 'db_failed');
    return { ok: false, reason_class: 'db_failed', resumed };
  }

  const identityOk = await deleteIdentityWorkingRows(admin, input.targetUserId);
  if (!identityOk) {
    await markFailure(admin, input.targetUserId, 'db_failed');
    return { ok: false, reason_class: 'db_failed', resumed };
  }

  const workshop = await removeUnorderedWorkshopAssets(
    admin,
    adapter ?? defaultWorkshopStorageAdapter(admin),
    input.targetUserId,
  );
  if (!workshop.ok) {
    await markFailure(admin, input.targetUserId, 'db_failed');
    return { ok: false, reason_class: 'db_failed', resumed };
  }

  const profileOk = await anonymizeProfile(admin, input.targetUserId);
  if (!profileOk) {
    await markFailure(admin, input.targetUserId, 'db_failed');
    return { ok: false, reason_class: 'db_failed', resumed };
  }

  const stamped = await markWithdrawn(admin, input.targetUserId);
  if (!stamped) {
    await markFailure(admin, input.targetUserId, 'db_failed');
    return { ok: false, reason_class: 'db_failed', resumed };
  }

  console.log('[ACCOUNT_WITHDRAWAL]', {
    stage: 'completed',
    active_order_count: precheck.activeOrderCount,
    workshop_objects_removed: workshop.removed,
    resumed,
  });

  return {
    ok: true,
    status: 'withdrawn',
    already_complete: false,
    resumed,
    active_order_count: precheck.activeOrderCount,
    workshop_objects_removed: workshop.removed,
  };
}

export function httpStatusForWithdrawal(result: WithdrawalResult): number {
  if (result.ok) return 200;
  switch (result.reason_class) {
    case 'actor_not_admin':
    case 'actor_mismatch':
      return 403;
    case 'invalid_target':
      return 400;
    case 'not_found':
      return 404;
    case 'target_is_admin':
      return 409;
    default:
      return 500;
  }
}
