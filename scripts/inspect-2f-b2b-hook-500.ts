/**
 * READ-ONLY payment-test diagnostic after B2b hook still returns 500.
 * Does not CREATE OR REPLACE the hook or handle_new_user.
 * Never prints secrets, OTP, e164, fingerprints, or DB URIs.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { classifyPostgresConnection, isUsableSupabaseDbUrl } from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]")
    .replace(/\+82[0-9]{9,12}/g, "[e164]")
    .replace(/\b[0-9a-f]{64}\b/gi, "[hex64]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
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

function encodeDbUrl(raw: string): string {
  const schemeIdx = raw.indexOf("://");
  if (schemeIdx < 0) return raw;
  const scheme = raw.slice(0, schemeIdx + 3);
  const rest = raw.slice(schemeIdx + 3);
  const at = rest.lastIndexOf("@");
  if (at < 0) return raw;
  const userinfo = rest.slice(0, at);
  const hostpart = rest.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon < 0) return raw;
  const encodePart = (part: string): string => {
    try {
      return encodeURIComponent(decodeURIComponent(part));
    } catch {
      return encodeURIComponent(part);
    }
  };
  return `${scheme}${encodePart(userinfo.slice(0, colon))}:${encodePart(userinfo.slice(colon + 1))}@${hostpart}`;
}

function dbQuery(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-b2b-ins-${randomBytes(6).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql.endsWith(";") ? sql : `${sql};`, "utf8");
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const result = fs.existsSync(npxCli)
    ? spawnSync(
        process.execPath,
        [npxCli, "--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", tmp],
        { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true, env: process.env },
      )
    : spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", tmp],
        {
          encoding: "utf8",
          maxBuffer: 10_000_000,
          windowsHide: true,
          shell: process.platform === "win32",
          env: process.env,
        },
      );
  fs.unlinkSync(tmp);
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "db query failed"));
  }
  return result.stdout ?? "";
}

function clip(raw: string): string {
  return redact(raw).replace(/\s+/g, " ").slice(0, 1400);
}

async function main(): Promise<void> {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.ref !== PAYMENT_TEST_REF || classified.isProductionRef) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  const dbUrl = encodeDbUrl(dbUrlRaw);

  const hookDef = dbQuery(dbUrl, `SELECT pg_get_functiondef('public.hook_before_user_created(jsonb)'::regprocedure) AS def`);
  console.log(`hook_def_has_http_code=${hookDef.includes("http_code")}`);
  console.log(`hook_def_has_raise=${/\bRAISE\b/.test(hookDef)}`);
  console.log(`hook_def_has_preferred_msg=${hookDef.includes("Public password signup is not allowed.")}`);

  const handleDef = dbQuery(dbUrl, `SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS def`);
  console.log(
    `handle_new_user_has_metalora_raise=${handleDef.includes("member signup requires non-blank user_custom_id metadata")}`,
  );
  console.log(`handle_new_user_has_metalora_me=${handleDef.toLowerCase().includes("@metalora.me")}`);

  const trig = dbQuery(
    dbUrl,
    `SELECT t.tgname
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal`,
  );
  console.log(`auth_users_triggers=${clip(trig)}`);

  const acl = dbQuery(
    dbUrl,
    `SELECT pg_catalog.pg_get_userbyid(p.proowner) AS owner,
            p.prosecdef AS security_definer,
            p.proacl::text AS acl
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hook_before_user_created'`,
  );
  console.log(`hook_acl=${clip(acl)}`);

  const grants = dbQuery(
    dbUrl,
    `SELECT grantee, privilege_type
     FROM information_schema.routine_privileges
     WHERE specific_schema = 'public' AND routine_name = 'hook_before_user_created'`,
  );
  console.log(`hook_grants=${clip(grants)}`);

  for (const role of [
    "supabase_auth_admin",
    "anon",
    "authenticated",
    "authenticator",
    "service_role",
    "supabase_admin",
  ]) {
    const out = dbQuery(
      dbUrl,
      `SELECT has_function_privilege('${role}', 'public.hook_before_user_created(jsonb)', 'EXECUTE') AS ok`,
    );
    console.log(`exec_${role}=${clip(out)}`);
  }

  const leftover = dbQuery(
    dbUrl,
    `SELECT count(*)::int AS n FROM auth.users WHERE created_at > now() - interval '2 hours'`,
  );
  console.log(`auth_users_created_last_2h_count=${clip(leftover)}`);

  const token = (
    apiEnv.SUPABASE_ACCESS_TOKEN ??
    apiEnv.SUPABASE_MANAGEMENT_TOKEN ??
    dbEnv.SUPABASE_ACCESS_TOKEN ??
    dbEnv.SUPABASE_MANAGEMENT_TOKEN ??
    process.env.SUPABASE_ACCESS_TOKEN ??
    process.env.SUPABASE_MANAGEMENT_TOKEN ??
    ""
  ).trim();
  console.log(`management_token=${token ? "present" : "absent"}`);

  if (token) {
    const start = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const end = new Date().toISOString();
    const cfgRes = await fetch(`https://api.supabase.com/v1/projects/${PAYMENT_TEST_REF}/config/auth`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    console.log(`auth_config_status=${cfgRes.status}`);
    const pgLogs = await fetch(
      `https://api.supabase.com/v1/projects/${PAYMENT_TEST_REF}/analytics/endpoints/logs.postgres?iso_timestamp_start=${encodeURIComponent(start)}&iso_timestamp_end=${encodeURIComponent(end)}`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
    );
    console.log(`postgres_logs_status=${pgLogs.status}`);
    const authLogs = await fetch(
      `https://api.supabase.com/v1/projects/${PAYMENT_TEST_REF}/analytics/endpoints/logs.auth?iso_timestamp_start=${encodeURIComponent(start)}&iso_timestamp_end=${encodeURIComponent(end)}`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
    );
    console.log(`auth_logs_status=${authLogs.status}`);
    if (pgLogs.ok) {
      const body = await pgLogs.text();
      const interesting = body.match(
        /user_custom_id|hook_before_user_created|saving new user|Public password signup|permission denied|ERROR.{0,180}/gi,
      );
      console.log(`postgres_logs_hits=${interesting ? interesting.slice(0, 12).join(" | ") : "none"}`);
    }
    if (authLogs.ok) {
      const body = await authLogs.text();
      const interesting = body.match(/unexpected_failure|saving new user|Public password signup|hook|403|500.{0,80}/gi);
      console.log(`auth_logs_hits=${interesting ? interesting.slice(0, 12).join(" | ") : "none"}`);
    }
  } else {
    const pgLogs = await fetch(
      `https://api.supabase.com/v1/projects/${PAYMENT_TEST_REF}/analytics/endpoints/logs.postgres`,
    );
    const cfgRes = await fetch(`https://api.supabase.com/v1/projects/${PAYMENT_TEST_REF}/config/auth`);
    console.log(`unauth_postgres_logs_status=${pgLogs.status} unauth_auth_config_status=${cfgRes.status}`);
  }

  if ((process.env.INSPECT_SKIP_SIGNUP ?? "").trim() === "1") {
    return;
  }

  const supabaseUrl = apiEnv.VITE_SUPABASE_URL;
  const anonKey = apiEnv.VITE_SUPABASE_ANON_KEY;
  const serviceKey = apiEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl.includes(PAYMENT_TEST_REF)) throw new Error("VITE_SUPABASE_URL is not payment-test");

  const suffix = randomBytes(3).toString("hex");
  const password8 = `Aa1!${randomBytes(8).toString("base64url")}xx`;
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const raw = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: `b2bins${suffix}@metalora.me`,
      password: password8,
    }),
  });
  const rawText = await raw.text();
  console.log(`direct_signup_metalora status=${raw.status} body=${clip(rawText)}`);

  const other = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: `b2bins${suffix}@example.com`,
      password: password8,
    }),
  });
  const otherText = await other.text();
  console.log(`direct_signup_nonmember status=${other.status} body=${clip(otherText)}`);
  try {
    const parsed = JSON.parse(otherText) as { id?: string; user?: { id?: string } };
    const id = parsed.id ?? parsed.user?.id;
    if (typeof id === "string" && id) {
      await admin.auth.admin.deleteUser(id);
      console.log("direct_signup_nonmember leftover_deleted=yes");
    } else {
      console.log("direct_signup_nonmember leftover_deleted=n/a");
    }
  } catch {
    console.log("direct_signup_nonmember leftover_deleted=parse_skip");
  }

  const sdk = await publicClient.auth.signUp({
    email: `b2bins2${suffix}@metalora.me`,
    password: password8,
  });
  const err = sdk.error as { name?: string; code?: string; status?: number; message?: string } | null;
  console.log(
    `sdk_signup_metalora name=${err?.name ?? "none"} code=${err?.code ?? ""} status=${err?.status ?? ""} message=${redact(err?.message ?? "")}`,
  );
  if (sdk.data.user?.id) {
    await admin.auth.admin.deleteUser(sdk.data.user.id);
    console.log("sdk leftover deleted");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? redact(err.message) : "inspect failed");
  process.exit(1);
});
