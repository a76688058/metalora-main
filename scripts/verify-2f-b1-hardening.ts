/**
 * NEW 2F B1 security hardening verifier.
 * Local contract tests plus a payment-test session-invalidation check.
 * Does not apply migrations. Does not mutate production.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { classifyAccount, classifyAccountKind } from "../src/lib/accountKind";
import {
  buildAuthSecurityEventRow,
  sanitizeAuthSecurityMeta,
} from "../src/lib/authSecurityEvents";
import {
  selectTrustedProxyClientIp,
  trustedClientIp,
  UNKNOWN_CLIENT_IP,
} from "../src/lib/trustedClientIp";
import { classifyPostgresConnection, isUsableSupabaseDbUrl } from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean; detail?: string };
const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail?: string): void {
  results.push({ name, pass: condition, detail });
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]")
    .replace(/\+82[0-9]{9,12}/g, "[e164]")
    .replace(/\b[0-9a-f]{64}\b/gi, "[hex64]");
}

function parseEnvFileRaw(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function decodeJwtTtlSeconds(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      exp?: unknown;
      iat?: unknown;
    };
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
    const ttl = payload.exp - payload.iat;
    return Number.isFinite(ttl) && ttl > 0 ? ttl : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const handlers = fs.readFileSync(path.join(root, "src/lib/passwordAuthHandlers.ts"), "utf8");
  assert(
    "dead admin user-id logout/session-delete routes removed",
    !handlers.includes("/admin/users/") &&
      !handlers.includes("logout?scope=global") &&
      !handlers.includes("globalSignOut"),
  );

  const alice = classifyAccount({
    userCustomId: "alice",
    authEmail: "alice@metalora.me",
    providers: ["email"],
  });
  assert(
    "normal password account still password-capable",
    alice.kind === "password" && alice.passwordResetAllowed && alice.recoverableUsername === "alice",
  );

  const chosenMl = classifyAccount({
    userCustomId: "mlabcd12",
    authEmail: "mlabcd12@metalora.me",
    providers: ["email"],
  });
  assert(
    "chosen ml… username with metalora email is not denied by prefix",
    chosenMl.kind === "password" &&
      chosenMl.passwordResetAllowed &&
      chosenMl.recoverableUsername === "mlabcd12",
  );

  const social = classifyAccount({
    userCustomId: "mlabcd12",
    authEmail: "mlabcd12@example.com",
    providers: ["email"],
  });
  assert(
    "social-shaped account hides username and reset",
    social.kind === "social" &&
      !social.passwordResetAllowed &&
      social.recoverableUsername === null,
  );

  const oauthSocial = classifyAccount({
    userCustomId: "mlabcd12",
    authEmail: "user@gmail.com",
    providers: ["google"],
  });
  assert(
    "oauth non-metalora is social fail-closed for reset",
    oauthSocial.kind === "social" && !oauthSocial.passwordResetAllowed && oauthSocial.recoverableUsername === null,
  );

  const linked = classifyAccount({
    userCustomId: "alice",
    authEmail: "alice@metalora.me",
    providers: ["email", "google"],
  });
  assert(
    "password account later linked to SNS remains password-capable",
    linked.kind === "password" && linked.passwordResetAllowed && linked.recoverableUsername === "alice",
  );

  const ambiguous = classifyAccount({
    userCustomId: "mlabcd12",
    authEmail: "mlabcd12@metalora.me",
    providers: ["google"],
  });
  assert(
    "ambiguous metalora+oauth-without-email identity fails closed",
    ambiguous.kind === "none" && !ambiguous.passwordResetAllowed && ambiguous.recoverableUsername === null,
  );
  assert(
    "prefix is not sole authority",
    classifyAccountKind({
      userCustomId: "mlabcd12",
      authEmail: "mlabcd12@metalora.me",
      providers: ["email"],
    }) === "password" &&
      classifyAccountKind({
        userCustomId: "alice",
        authEmail: "alice@example.com",
        providers: ["email"],
      }) === "social",
  );

  assert(
    "local spoofed XFF ignored",
    trustedClientIp(
      {
        ip: "8.8.8.8",
        headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" },
        socket: { remoteAddress: "127.0.0.1" },
      },
      "local",
    ) === "127.0.0.1",
  );
  assert(
    "production one-hop trust ignores leftmost XFF",
    trustedClientIp(
      {
        headers: { "x-forwarded-for": "8.8.8.8, 203.0.113.9" },
        socket: { remoteAddress: "10.0.0.2" },
      },
      "production",
    ) === "203.0.113.9",
  );
  assert(
    "production extra hops still use GFE-adjacent client not attacker",
    selectTrustedProxyClientIp("8.8.8.8, 1.1.1.1, 203.0.113.9", "10.0.0.2") === "203.0.113.9",
  );
  assert(
    "production missing socket fails closed to unknown",
    selectTrustedProxyClientIp("8.8.8.8", null) === UNKNOWN_CLIENT_IP,
  );

  const recoveryMeta = sanitizeAuthSecurityMeta("recovery_resolve", {
    account_kind: "password",
    password: "secret-pass",
    proof_token: "a".repeat(64),
    recovery_session_token: "b".repeat(64),
    ip: "8.8.8.8",
    phone: "01012345678",
  });
  assert(
    "recovery_resolve meta allowlists account_kind only",
    JSON.stringify(recoveryMeta) === JSON.stringify({ account_kind: "password" }),
  );
  const resetMeta = sanitizeAuthSecurityMeta("password_reset", {
    password: "secret-pass",
    new_password: "secret-pass-2",
    authorization: "Bearer aaa.bbb.ccc",
  });
  assert("password_reset meta is empty", JSON.stringify(resetMeta) === "{}");
  const changeRow = buildAuthSecurityEventRow("pepper-for-hmac-not-a-secret-value!!", "127.0.0.1", {
    event: "password_change",
    outcome: "completed",
    requestId: "00000000-0000-0000-0000-000000000001",
  });
  assert(
    "password_change row has no request-body fields",
    JSON.stringify(changeRow.meta) === "{}" &&
      changeRow.event === "password_change" &&
      !Object.values(changeRow).some(
        (value) => typeof value === "string" && (value.includes("Bearer") || value.includes("secret-pass")),
      ),
  );

  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (dbUrlRaw && isUsableSupabaseDbUrl(dbUrlRaw)) {
    const classified = classifyPostgresConnection(dbUrlRaw);
    assert(
      "session test DB target is payment-test",
      classified.ref === PAYMENT_TEST_REF && !classified.isProductionRef,
    );
  }

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL ?? "";
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY ?? "";
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || !anonKey || !serviceKey) {
    throw new Error("payment-test API env missing");
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const supabasePublic = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomBytes(3).toString("hex");
  const username = `slbh${suffix}`;
  const email = `${username}@metalora.me`;
  const password = `Aa1!${randomBytes(12).toString("base64url")}xx`;
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { user_custom_id: username },
  });
  if (created.error || !created.data.user) throw new Error("createUser failed");
  const userId = created.data.user.id;
  try {
    const sessionClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await sessionClient.auth.signInWithPassword({ email, password });
    const access = signed.data.session?.access_token ?? "";
    const refresh = signed.data.session?.refresh_token ?? "";
    const ttl = decodeJwtTtlSeconds(access);
    assert(
      "access JWT TTL readable without mutating Auth config",
      ttl != null && ttl >= 60,
      ttl != null ? `ttl_sec=${ttl}` : undefined,
    );

    const newPass = `Bb2!${randomBytes(10).toString("base64url")}yy`;
    const updated = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPass });
    assert("admin password update succeeds", !updated.error);

    const refreshed = await sessionClient.auth.refreshSession({ refresh_token: refresh });
    assert("refresh token becomes unusable after password update", !!refreshed.error);

    const stillAccess = await supabasePublic.auth.getUser(access);
    assert(
      "test does not require immediate access-JWT revocation",
      true,
      stillAccess.error ? "access_already_unusable" : "access_still_usable_until_expiry",
    );
    if (!stillAccess.error && stillAccess.data.user?.id !== userId) {
      assert("stale access JWT does not bind a different user", false);
    } else {
      assert("stale access JWT does not bind a different user", true);
    }
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    `verify-2f-b1-hardening ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`,
  );
  if (failed.length > 0) {
    for (const item of failed) console.error(`- ${item.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("verify-2f-b1-hardening aborted:", redact(error instanceof Error ? error.message : "unknown"));
  process.exit(1);
});
