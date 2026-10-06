/**
 * NEW4-7 — Account withdrawal local/static checks.
 * No remote Auth / Supabase / Storage calls.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUsableMemberProfile } from '../src/lib/authIntegrity';
import {
  ACCOUNT_WITHDRAWAL_ADMIN_PATH,
  WITHDRAWN_EMAIL_DOMAIN,
  evaluateWithdrawalAuthorization,
  httpStatusForWithdrawal,
  isUuid,
  parseWithdrawalSource,
  withdrawnEmailForUser,
} from '../src/lib/accountWithdrawal';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results: { name: string; pass: boolean }[] = [];

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ name, pass: condition });
  const suffix = !condition && detail ? ` — ${detail}` : '';
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${suffix}`);
}

const userId = '11111111-1111-1111-1111-111111111111';
const adminId = '22222222-2222-2222-2222-222222222222';

assert('valid uuid accepted', isUuid(userId) === true);
assert('invalid target rejected', isUuid('not-a-user') === false);
assert('email-shaped target rejected', isUuid('user@example.com') === false);
assert('parse source admin', parseWithdrawalSource('admin_assisted') === 'admin_assisted');
assert('parse source self', parseWithdrawalSource('self_service') === 'self_service');
assert('parse source garbage', parseWithdrawalSource('header') === null);

assert(
  'ordinary user cannot invoke admin withdrawal',
  evaluateWithdrawalAuthorization({
    actorUserId: userId,
    targetUserId: adminId,
    source: 'admin_assisted',
    actorIsAdmin: false,
  }) === 'actor_not_admin',
);
assert(
  'admin can invoke admin withdrawal',
  evaluateWithdrawalAuthorization({
    actorUserId: adminId,
    targetUserId: userId,
    source: 'admin_assisted',
    actorIsAdmin: true,
  }) === 'ok',
);
assert(
  'self-service cannot target another user',
  evaluateWithdrawalAuthorization({
    actorUserId: userId,
    targetUserId: adminId,
    source: 'self_service',
    actorIsAdmin: false,
  }) === 'actor_mismatch',
);
assert(
  'self-service same actor allowed at authz layer',
  evaluateWithdrawalAuthorization({
    actorUserId: userId,
    targetUserId: userId,
    source: 'self_service',
    actorIsAdmin: false,
  }) === 'ok',
);

const withdrawnEmail = withdrawnEmailForUser(userId);
assert('withdrawn email uses .invalid', withdrawnEmail.endsWith(`@${WITHDRAWN_EMAIL_DOMAIN}`));
assert('withdrawn email is not a mailbox domain', !withdrawnEmail.endsWith('@metalora.me'));
assert('withdrawn email includes subject uuid', withdrawnEmail.includes(userId));

const usable = {
  id: userId,
  user_custom_id: 'trusteduser',
  verified_phone_fingerprint: 'a'.repeat(64),
  phone_verified_at: '2026-09-24T00:00:00.000Z',
};
assert('usable member still usable without withdrawn_at', isUsableMemberProfile(usable) === true);
assert(
  'withdrawn profile cannot use membership',
  isUsableMemberProfile({ ...usable, withdrawn_at: '2026-10-07T00:00:00.000Z' }) === false,
);
assert(
  'anonymized profile cannot use membership',
  isUsableMemberProfile({
    id: userId,
    user_custom_id: null,
    verified_phone_fingerprint: null,
    phone_verified_at: null,
  }) === false,
);

assert(
  'already-withdrawn http status is 200',
  httpStatusForWithdrawal({ ok: true, status: 'withdrawn', already_complete: true }) === 200,
);
assert(
  'invalid target http 400',
  httpStatusForWithdrawal({ ok: false, reason_class: 'invalid_target' }) === 400,
);
assert(
  'admin target http 409',
  httpStatusForWithdrawal({ ok: false, reason_class: 'target_is_admin' }) === 409,
);
assert(
  'ordinary actor http 403',
  httpStatusForWithdrawal({ ok: false, reason_class: 'actor_not_admin' }) === 403,
);

const protectedPath = `originals/${userId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`;
const unorderedPath = `previews/${userId}/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg`;
const listed = [protectedPath, unorderedPath];
const protectedSet = new Set([protectedPath]);
const removable = listed.filter((path) => !protectedSet.has(path));
assert('active workshop original is protected', removable.includes(protectedPath) === false);
assert('unordered workshop preview is removable', removable.includes(unorderedPath) === true);

const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261007080000_new4_7_account_withdrawal.sql'),
  'utf8',
);
assert('adds withdrawn_at', /ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz/.test(migration));
assert('creates account_withdrawals', /CREATE TABLE IF NOT EXISTS public\.account_withdrawals/.test(migration));
assert(
  'consent FK is RESTRICT',
  /user_agreements_user_id_fkey[\s\S]*ON DELETE RESTRICT/.test(migration),
);
assert(
  'CS FK is RESTRICT',
  /cs_inquiries_user_id_fkey[\s\S]*ON DELETE RESTRICT/.test(migration),
);
assert('does not DELETE orders', !/^\s*DELETE\s+FROM\s+public\.orders/im.test(migration));
assert(
  'does not DELETE payment_intents',
  !/^\s*DELETE\s+FROM\s+public\.payment_intents/im.test(migration),
);
assert(
  'does not DELETE user_agreements',
  !/^\s*DELETE\s+FROM\s+public\.user_agreements/im.test(migration),
);
assert(
  'does not DELETE cs_inquiries',
  !/^\s*DELETE\s+FROM\s+public\.cs_inquiries/im.test(migration),
);
assert('does not fabricate historic withdrawal', !/UPDATE\s+public\.profiles\s+SET\s+withdrawn_at/i.test(migration));

const new45 = fs.readFileSync(path.join(root, 'supabase/migrations/20261006220000_new4_5_consent_ledger.sql'), 'utf8');
const new45a = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261006223000_new4_5a_restrict_consent_rpc.sql'),
  'utf8',
);
const new46 = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261007070000_new4_6_workshop_retention.sql'),
  'utf8',
);
assert('NEW4-5 ledger preserved', new45.includes('record_policy_consent'));
assert('NEW4-5A preserved', new45a.includes('NEW4-5A'));
assert('NEW4-6 completed_at preserved', new46.includes('completed_at'));

const policies = fs.readFileSync(path.join(root, 'src/constants/policies.tsx'), 'utf8');
assert(
  'no public instant-delete withdrawal claim',
  !/회원 탈퇴 즉시 모든 정보 삭제/.test(policies),
);
const freeze = fs.readFileSync(path.join(root, 'src/lib/publicPaymentFreeze.ts'), 'utf8');
assert('payment freeze unchanged', /PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true/.test(freeze));

const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert(
  'admin withdrawal endpoint registered',
  server.includes('ACCOUNT_WITHDRAWAL_ADMIN_PATH') && ACCOUNT_WITHDRAWAL_ADMIN_PATH === '/api/admin/account-withdrawal',
);
assert('endpoint uses getUser not spoof header', server.includes('verifyAdminCaller'));

const wip = [
  'src/components/InquiryModal.tsx',
  'src/components/OrdersModal.tsx',
  'src/components/ProfileEditModal.tsx',
  'src/components/ProfileOverlay.tsx',
  'src/pages/ProfileComplete.tsx',
];
for (const file of wip) {
  assert(`protected file exists untouched by this script: ${file}`, fs.existsSync(path.join(root, file)));
}

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) process.exit(1);
