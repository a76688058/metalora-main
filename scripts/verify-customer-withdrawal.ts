/**
 * Local customer withdrawal checks. No production, SMS, accounts, or payments.
 */
import express from "express";
import type { Server } from "node:http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerCustomerWithdrawalRoutes } from "../src/lib/accountWithdrawal.ts";
import { registerOtpAuthRoutes } from "../src/lib/otpAuthHandlers.ts";
import { DevCaptureSmsAdapter } from "../src/lib/smsAdapter.ts";
import { otpCodeHmac, otpTicketHmac } from "../src/lib/otpCrypto.ts";
import { phoneFingerprint } from "../src/lib/phoneHmac.ts";

const pepper = "p".repeat(32);
const identityKey = "k".repeat(32);
const env = {
  OTP_PEPPER: pepper,
  PHONE_IDENTITY_KEY: identityKey,
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-test",
};
const fp = phoneFingerprint("+821012345678", identityKey);
const otherFp = phoneFingerprint("+821099988877", identityKey);

const ids = {
  password: "11111111-1111-4111-8111-111111111111",
  google: "22222222-2222-4222-8222-222222222222",
  kakao: "33333333-3333-4333-8333-333333333333",
  naver: "44444444-4444-4444-8444-444444444444",
  admin: "55555555-5555-4555-8555-555555555555",
  other: "66666666-6666-4666-8666-666666666666",
};

const profiles = new Map();
const orders = [];
const captures = [];
const cancellations = [];
const withdrawals = [];
const tickets = [];
const deleted = [];
let authUpdates = 0;
const revoked = [];

function seedProfile(id, extra) {
  profiles.set(id, {
    id,
    is_admin: false,
    withdrawn_at: null,
    password_login_enabled: false,
    verified_phone_fingerprint: fp,
    user_custom_id: "member",
    ...extra,
  });
}

function reset() {
  profiles.clear();
  orders.length = 0;
  captures.length = 0;
  cancellations.length = 0;
  withdrawals.length = 0;
  tickets.length = 0;
  deleted.length = 0;
  authUpdates = 0;
  revoked.length = 0;
  seedProfile(ids.password, { password_login_enabled: true, user_custom_id: "passworduser" });
  seedProfile(ids.google, { user_custom_id: "googleuser" });
  seedProfile(ids.kakao, { user_custom_id: "kakaouser" });
  seedProfile(ids.naver, { user_custom_id: "naveruser" });
  seedProfile(ids.admin, { is_admin: true, password_login_enabled: true, user_custom_id: "adminuser" });
  seedProfile(ids.other, { verified_phone_fingerprint: otherFp, user_custom_id: "otheruser", password_login_enabled: true });
}

function matches(row, filters) {
  return filters.every((filter) => {
    if (filter[0] === "eq") return row[filter[1]] === filter[2];
    if (filter[0] === "in") return filter[2].includes(row[filter[1]]);
    if (filter[0] === "gt") return String(row[filter[1]]) > String(filter[2]);
    if (filter[0] === "or") {
      return row.user_id == null || filter[1].includes(String(row.user_id));
    }
    return false;
  });
}

function rowsFor(table) {
  if (table === "profiles") return [...profiles.values()];
  if (table === "orders") return orders;
  if (table === "payment_provider_captures") return captures;
  if (table === "payment_cancellations") return cancellations;
  if (table === "account_withdrawals") return withdrawals;
  if (table === "phone_verification_tickets") return tickets;
  return [];
}

function from(table) {
  const state = { filters: [], head: false, op: "select", patch: null };
  const run = () => {
    const all = rowsFor(table);
    const found = all.filter((row) => matches(row, state.filters));
    if (state.op === "delete") {
      deleted.push(table);
      return { error: null, data: null };
    }
    if (state.op === "update") {
      if (table === "profiles") {
        for (const row of found) Object.assign(row, state.patch);
      }
      if (table === "phone_verification_tickets") {
        for (const row of found) Object.assign(row, state.patch);
      }
      if (table === "account_withdrawals") {
        for (const row of found) Object.assign(row, state.patch);
      }
      return { error: null, data: found.map((row) => ({ id: row.id ?? "row" })) };
    }
    if (state.head) return { error: null, count: found.length, data: null };
    return { error: null, data: found };
  };
  const builder = {
    select(_columns, options) {
      state.head = options?.head === true;
      return builder;
    },
    eq(column, value) { state.filters.push(["eq", column, value]); return builder; },
    in(column, value) { state.filters.push(["in", column, value]); return builder; },
    gt(column, value) { state.filters.push(["gt", column, value]); return builder; },
    or(value) { state.filters.push(["or", value]); return builder; },
    is() { return builder; },
    update(patch) { state.op = "update"; state.patch = patch; return builder; },
    delete() { state.op = "delete"; return builder; },
    insert(row) {
      if (table === "account_withdrawals") withdrawals.push({ id: "wd", status: "in_progress", ...row });
      return Promise.resolve({ error: null });
    },
    maybeSingle: async () => {
      const result = run();
      return { data: result.data?.[0] ?? null, error: result.error };
    },
    then(ok, fail) { return Promise.resolve(run()).then(ok, fail); },
  };
  return builder;
}

const tokens = {
  [ids.password]: "password-token",
  [ids.google]: "google-token",
  [ids.kakao]: "kakao-token",
  [ids.naver]: "naver-token",
  [ids.admin]: "admin-token",
};
const providers = {
  [ids.password]: "email",
  [ids.google]: "google",
  [ids.kakao]: "kakao",
  [ids.naver]: "custom:naver",
  [ids.admin]: "email",
};

function userByToken(token) {
  const id = Object.entries(tokens).find(([, value]) => value === token)?.[0];
  if (!id) return null;
  return { id, email: `${providers[id]}@metalora.me` };
}

const admin = {
  from,
  rpc: async (name) => {
    if (name === "auth_rate_limit_hit") return { data: 1, error: null };
    if (name === "otp_create_active_challenge") return { data: { ok: true }, error: null };
    if (name === "otp_verify_and_issue_ticket") return { data: { ok: false }, error: null };
    return { data: null, error: null };
  },
  auth: {
    admin: {
      getUserById: async (id) => ({ data: { user: { id, identities: [{ provider: providers[id] ?? "email" }] } }, error: null }),
      updateUserById: async () => {
        authUpdates += 1;
        return { error: null };
      },
      signOut: async () => ({ error: null }),
    },
    getUser: async (token) => {
      const user = userByToken(token);
      return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "missing" } };
    },
  },
};

const adapter = new DevCaptureSmsAdapter();
const app = express();
app.use(express.json());
const client = admin as unknown as SupabaseClient;
registerOtpAuthRoutes(app, { supabaseAdmin: client, supabasePublic: client, getEnv: () => env, smsAdapter: adapter });
registerCustomerWithdrawalRoutes(app, {
  supabaseAdmin: client,
  supabasePublic: client,
  getEnv: () => env,
  verifyPassword: async ({ password, userId }) => password === "password1" && userId === ids.password,
  revokeSessions: async (jwt) => { revoked.push(jwt); },
  workshopAdapter: {
    gcs: null,
    stores: [],
    listCustomerObjects: async () => [],
    removePath: async () => ({ ok: true }),
  },
});

const results = [];
function assert(name, condition) {
  results.push(Boolean(condition));
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}`);
}

function listen(serverApp: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const running = serverApp.listen(0, "127.0.0.1", () => resolve(running));
  });
}

function issue(userId, status, expires) {
  const token = `${userId.replaceAll("-", "").slice(0, 32)}${"ab".repeat(16)}`.slice(0, 64);
  tickets.push({
    id: `ticket-${userId}`,
    ticket_hmac: otpTicketHmac(pepper, token),
    purpose: "withdrawal",
    status,
    user_id: userId,
    phone_fingerprint: fp,
    expires_at: expires,
  });
  return token;
}

const server = await listen(app);
const address = server.address();
const port = address && typeof address === "object" ? address.port : 0;
const base = `http://127.0.0.1:${port}`;
async function call(method, path, token, body) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json() };
}

reset();
const wrongPassword = await call("POST", "/api/account/withdrawal", "password-token", { password: "nope" });
assert("invalid password rejected", wrongPassword.status === 403 && authUpdates === 0 && profiles.get(ids.password).withdrawn_at == null);

reset();
const noOrders = await call("POST", "/api/account/withdrawal", "password-token", { password: "password1" });
assert("password account with no orders withdraws", noOrders.status === 200 && noOrders.json.ok === true && profiles.get(ids.password).withdrawn_at && profiles.get(ids.password).verified_phone_fingerprint == null);
assert("session revocation requested", revoked.includes("password-token"));
assert("phone no longer reserved", ![...profiles.values()].some((row) => row.verified_phone_fingerprint === fp && row.id === ids.password));
const again = await call("POST", "/api/account/withdrawal", "password-token", { password: "password1" });
assert("duplicate withdrawal is idempotent", again.status === 200 && again.json.already_complete === true && authUpdates === 1);

reset();
orders.push({ id: "order-refunded", user_id: ids.password, status: "CANCELLED" });
captures.push({ user_id: ids.password, status: "finalized" });
cancellations.push({ order_id: "order-refunded", status: "confirmed" });
const refunded = await call("POST", "/api/account/withdrawal", "password-token", { password: "password1" });
assert("refunded history can withdraw and stays on the original account", refunded.status === 200 && orders[0].user_id === ids.password && orders[0].status === "CANCELLED");
assert("financial tables were not deleted", !deleted.includes("orders") && !deleted.includes("payment_provider_captures") && !deleted.includes("payment_cancellations"));
assert("other customer unchanged", profiles.get(ids.other).user_custom_id === "otheruser" && profiles.get(ids.other).verified_phone_fingerprint === otherFp);

reset();
orders.push({ id: "order-active", user_id: ids.password, status: "PRODUCTION" });
const active = await call("POST", "/api/account/withdrawal", "password-token", { password: "password1" });
assert("active order blocks withdrawal", active.status === 409 && active.json.reason_class === "financial_hold" && authUpdates === 0);

reset();
captures.push({ user_id: ids.password, status: "confirm_submitted" });
const openCapture = await call("POST", "/api/account/withdrawal", "password-token", { password: "password1" });
assert("unresolved capture blocks withdrawal", openCapture.status === 409 && openCapture.json.reason_class === "financial_hold" && authUpdates === 0);

reset();
orders.push({ id: "order-cancel", user_id: ids.password, status: "CANCELLED" });
cancellations.push({ order_id: "order-cancel", status: "pending" });
const openCancel = await call("POST", "/api/account/withdrawal", "password-token", { password: "password1" });
assert("incomplete cancellation blocks withdrawal", openCancel.status === 409 && authUpdates === 0);

reset();
const adminTry = await call("POST", "/api/account/withdrawal", "admin-token", { password: "password1" });
assert("administrator withdrawal rejected", adminTry.status === 409 && adminTry.json.reason_class === "target_is_admin" && authUpdates === 0);

for (const [id, token, label] of [[ids.google, "google-token", "google"], [ids.kakao, "kakao-token", "kakao"], [ids.naver, "naver-token", "naver"]]) {
  reset();
  const proof = issue(id, "issued", "2099-01-01T00:00:00.000Z");
  const social = await call("POST", "/api/account/withdrawal", token, { proof_token: proof });
  assert(`${label} withdrawal accepted once`, social.status === 200 && profiles.get(id).withdrawn_at && tickets.find((row) => row.user_id === id).status === "consumed");
}

reset();
const expired = issue(ids.google, "issued", "2000-01-01T00:00:00.000Z");
const expiredResult = await call("POST", "/api/account/withdrawal", "google-token", { proof_token: expired });
assert("expired otp proof rejected", expiredResult.status === 403 && profiles.get(ids.google).withdrawn_at == null);

reset();
const used = issue(ids.kakao, "consumed", "2099-01-01T00:00:00.000Z");
const usedResult = await call("POST", "/api/account/withdrawal", "kakao-token", { proof_token: used });
assert("reused otp proof rejected", usedResult.status === 403 && authUpdates === 0);

reset();
const mismatch = await call("POST", "/api/auth/otp/send", "google-token", { purpose: "withdrawal", phone: "01099998888" });
assert("unregistered phone cannot start withdrawal otp", mismatch.status === 400);
const registered = await call("POST", "/api/auth/otp/send", "google-token", { purpose: "withdrawal", phone: "01012345678" });
assert("registered phone can start withdrawal otp", registered.status === 200 && registered.json.ok === true);

server.close();
const failed = results.filter((item) => !item).length;
console.log(`WITHDRAWAL_FAILURES=${failed}`);
if (failed) process.exit(1);
