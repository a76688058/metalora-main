/**
 * C2-0 READ-ONLY payment-test Naver Hosted custom OAuth feasibility inspect.
 * Does not create users. Does not complete OAuth. Does not print secrets,
 * emails, phones, ids, tokens, or provider subjects. Does not mutate
 * production. Does not PATCH Hosted Auth config.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const REDIRECT_TO = "http://127.0.0.1:3000/auth/callback";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]")
    .replace(/sbp_[A-Za-z0-9]+/g, "[sbp]")
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

function presence(value: string | undefined): "PRESENT" | "ABSENT" | "EMPTY" {
  if (value == null) return "ABSENT";
  if (!value.trim()) return "EMPTY";
  return "PRESENT";
}

function summarizeSecretish(value: unknown): string {
  if (value == null) return "ABSENT";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `array_len=${value.length}`;
  if (typeof value === "object") return `object_keys=${Object.keys(value as object).join(",") || "none"}`;
  const text = String(value);
  if (!text.trim()) return "EMPTY";
  if (/secret|token|key|password|jwt/i.test(text) && text.length > 12) return `PRESENT len=${text.length}`;
  if (text.length > 80) return `PRESENT len=${text.length}`;
  return text;
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

function dbQueryFile(dbUrl: string, filePath: string): string {
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const result = fs.existsSync(npxCli)
    ? spawnSync(
        process.execPath,
        [npxCli, "--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
        { encoding: "utf8", maxBuffer: 10_000_000, windowsHide: true, env: process.env, cwd: root },
      )
    : spawnSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath],
        {
          encoding: "utf8",
          maxBuffer: 10_000_000,
          windowsHide: true,
          shell: process.platform === "win32",
          env: process.env,
          cwd: root,
        },
      );
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || "db query failed"));
  }
  return result.stdout ?? "";
}

function dbQuerySql(dbUrl: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-c20-${randomBytes(8).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    return dbQueryFile(dbUrl, tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function parseCount(raw: string): number {
  const json = raw.match(/"n"\s*:\s*(\d+)/);
  if (json) return Number(json[1]);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  if (lines.length === 1) return Number(lines[0]);
  return -1;
}

function hookAllows(raw: string): boolean {
  const trimmed = raw.replace(/\s+/g, "");
  return trimmed.includes("{}") && !trimmed.includes('"error"');
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function printExternalSettings(json: unknown): void {
  if (!json || typeof json !== "object") {
    console.log("auth_settings=UNPARSEABLE");
    return;
  }
  const rec = json as Record<string, unknown>;
  const external = rec.external;
  if (!external || typeof external !== "object") {
    console.log("auth_settings.external=ABSENT");
  } else {
    const entries = Object.entries(external as Record<string, unknown>)
      .filter(([, value]) => value === true || value === false)
      .sort(([a], [b]) => a.localeCompare(b));
    const enabled = entries.filter(([, value]) => value === true).map(([key]) => key);
    console.log(`auth_settings.external_enabled=${enabled.join(",") || "none"}`);
    const naverish = entries.filter(([key]) => /naver|custom/i.test(key));
    console.log(
      `auth_settings.naver_or_custom_flags=${
        naverish.length ? naverish.map(([k, v]) => `${k}=${String(v)}`).join(",") : "none"
      }`,
    );
  }
  for (const key of ["disable_signup", "mailer_autoconfirm", "sms_autoconfirm", "external_anonymous_users"]) {
    if (key in rec) console.log(`auth_settings.${key}=${summarizeSecretish(rec[key])}`);
  }
}

function printAuthConfigKeys(cfg: Record<string, unknown> | null): void {
  if (!cfg) {
    console.log("management_auth_config=UNAVAILABLE");
    return;
  }
  const interesting = Object.keys(cfg)
    .filter((key) =>
      /external|oauth|custom|redirect|site_url|uri_allow|hook_before|email_optional|kakao|google|naver/i.test(
        key,
      ),
    )
    .sort();
  console.log(`management_auth_config_interesting_keys=${interesting.join(",") || "none"}`);
  for (const key of interesting) {
    const lower = key.toLowerCase();
    if (/secret|client_id|clientid|private|token|key/i.test(lower) && !/enabled|allow|uri|url|hook/i.test(lower)) {
      console.log(`${key}=${presence(String(cfg[key] ?? ""))}`);
      continue;
    }
    console.log(`${key}=${summarizeSecretish(cfg[key])}`);
  }
}

function summarizeCustomProvider(raw: unknown, index: number): void {
  if (!raw || typeof raw !== "object") {
    console.log(`custom_provider_${index}=UNPARSEABLE`);
    return;
  }
  const rec = raw as Record<string, unknown>;
  const identifier = typeof rec.identifier === "string" ? rec.identifier : typeof rec.id === "string" ? rec.id : "";
  const name = typeof rec.name === "string" ? rec.name : "";
  const type = typeof rec.provider_type === "string" ? rec.provider_type : typeof rec.type === "string" ? rec.type : "";
  const enabled = rec.enabled;
  console.log(
    `custom_provider_${index} identifier=${identifier || "ABSENT"} type=${type || "ABSENT"} enabled=${summarizeSecretish(enabled)} name_len=${name.length}`,
  );
  for (const key of [
    "authorization_url",
    "token_url",
    "userinfo_url",
    "issuer",
    "scopes",
    "email_optional",
    "pkce_enabled",
    "callback_url",
    "redirect_uri",
  ]) {
    if (key in rec) console.log(`custom_provider_${index}.${key}=${summarizeSecretish(rec[key])}`);
  }
  const secretKeys = Object.keys(rec).filter((key) => /secret|client_id|clientid|token/i.test(key));
  for (const key of secretKeys) {
    console.log(`custom_provider_${index}.${key}=${presence(typeof rec[key] === "string" ? rec[key] : rec[key] == null ? "" : "x")}`);
  }
}

async function main(): Promise<void> {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const supabaseUrl = (apiEnv.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = (apiEnv.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const serviceKey = (apiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  console.log(`target_ref=${PAYMENT_TEST_REF}`);
  console.log(`supabase_url_host=${new URL(supabaseUrl).host}`);
  console.log(`anon_key=${presence(anonKey)}`);
  console.log(`service_role_key=${presence(serviceKey)}`);
  console.log(`management_token=${presence(
    apiEnv.SUPABASE_ACCESS_TOKEN ||
      apiEnv.SUPABASE_MANAGEMENT_TOKEN ||
      dbEnv.SUPABASE_ACCESS_TOKEN ||
      dbEnv.SUPABASE_MANAGEMENT_TOKEN ||
      process.env.SUPABASE_ACCESS_TOKEN ||
      process.env.SUPABASE_MANAGEMENT_TOKEN,
  )}`);

  const expectedCallback = `https://${PAYMENT_TEST_REF}.supabase.co/auth/v1/callback`;
  console.log(`expected_supabase_callback=${expectedCallback}`);
  console.log(`app_redirect_c1_contract=${REDIRECT_TO}`);
  console.log("app_redirect_origin_relative=/auth/callback (oauthCallbackUrl + window.location.origin)");

  const settings = await fetchJson(`${supabaseUrl}/auth/v1/settings`, {
    apikey: anonKey,
    accept: "application/json",
  });
  console.log(`auth_settings_status=${settings.status}`);
  printExternalSettings(settings.json);

  const adminHeaders = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    accept: "application/json",
  };
  const customEndpoints = [
    "/auth/v1/admin/custom-providers",
    "/auth/v1/admin/oauth/custom-providers",
    "/auth/v1/admin/sso/providers",
  ];
  for (const endpoint of customEndpoints) {
    const result = await fetchJson(`${supabaseUrl}${endpoint}`, adminHeaders);
    console.log(`admin${endpoint}_status=${result.status}`);
    if (result.status >= 200 && result.status < 300 && result.json != null) {
      const payload = result.json as Record<string, unknown> | unknown[];
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as Record<string, unknown>).providers)
          ? ((payload as Record<string, unknown>).providers as unknown[])
          : Array.isArray((payload as Record<string, unknown>).data)
            ? ((payload as Record<string, unknown>).data as unknown[])
            : [payload];
      console.log(`admin${endpoint}_count=${list.length}`);
      list.forEach((item, index) => summarizeCustomProvider(item, index));
    } else if (result.json && typeof result.json === "object") {
      const msg = (result.json as { msg?: unknown; error?: unknown; message?: unknown }).msg
        ?? (result.json as { error?: unknown }).error
        ?? (result.json as { message?: unknown }).message;
      console.log(`admin${endpoint}_class=${typeof msg === "string" ? msg.slice(0, 120) : "no_message"}`);
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const customAdmin = (admin.auth.admin as unknown as {
    customProviders?: { listProviders?: () => Promise<{ data: unknown; error: { message?: string } | null }> };
  }).customProviders;
  console.log(`admin.customProviders_api=${customAdmin?.listProviders ? "PRESENT" : "ABSENT"}`);
  if (customAdmin?.listProviders) {
    const listed = await customAdmin.listProviders();
    if (listed.error) {
      console.log(`admin.customProviders_error=${listed.error.message ?? "error"}`);
    } else if (Array.isArray(listed.data)) {
      console.log(`admin.customProviders_count=${listed.data.length}`);
      listed.data.forEach((item, index) => summarizeCustomProvider(item, index));
    } else {
      summarizeCustomProvider(listed.data, 0);
    }
  }

  const managementToken = (
    apiEnv.SUPABASE_ACCESS_TOKEN ??
    apiEnv.SUPABASE_MANAGEMENT_TOKEN ??
    dbEnv.SUPABASE_ACCESS_TOKEN ??
    dbEnv.SUPABASE_MANAGEMENT_TOKEN ??
    process.env.SUPABASE_ACCESS_TOKEN ??
    process.env.SUPABASE_MANAGEMENT_TOKEN ??
    ""
  ).trim();
  if (managementToken) {
    const cfgRes = await fetch(`https://api.supabase.com/v1/projects/${PAYMENT_TEST_REF}/config/auth`, {
      headers: { authorization: `Bearer ${managementToken}`, accept: "application/json" },
    });
    console.log(`management_auth_config_status=${cfgRes.status}`);
    if (cfgRes.ok) {
      printAuthConfigKeys((await cfgRes.json()) as Record<string, unknown>);
    }
  } else {
    console.log("management_auth_config=NO_TOKEN");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const probeProviders = ["google", "kakao", "naver", "custom", "custom:naver"] as const;
  for (const provider of probeProviders) {
    const result = await supabase.auth.signInWithOAuth({
      provider: provider as "google",
      options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
    });
    if (result.error) {
      console.log(
        `oauth_start_${provider.replace(":", "_")} status=${(result.error as { status?: number }).status ?? ""} message=${result.error.message ?? ""}`,
      );
      continue;
    }
    const url = result.data.url;
    if (!url) {
      console.log(`oauth_start_${provider.replace(":", "_")} url=ABSENT`);
      continue;
    }
    const parsed = new URL(url);
    const label = provider.replace(":", "_");
    console.log(`oauth_start_${label} host=${parsed.host} path=${parsed.pathname}`);
    const providerParam = parsed.searchParams.get("provider");
    if (providerParam) console.log(`oauth_start_${label} query_provider=${providerParam}`);
    const probe = await fetch(url, { redirect: "manual" });
    const location = probe.headers.get("location");
    let locationHost = "ABSENT";
    let locationPath = "ABSENT";
    let locationError = "ABSENT";
    let locationErrorCode = "ABSENT";
    if (location) {
      try {
        const next = new URL(location, url);
        locationHost = next.host;
        locationPath = next.pathname;
        locationError = next.searchParams.get("error") ?? "ABSENT";
        locationErrorCode = next.searchParams.get("error_code") ?? "ABSENT";
      } catch {
        locationHost = "UNPARSEABLE";
      }
    }
    let bodyClass = "NONE";
    if (probe.status >= 400) {
      const bodyText = (await probe.text()).slice(0, 240);
      const msg = bodyText.match(/"error_code"\s*:\s*"([^"]+)"/)?.[1]
        ?? bodyText.match(/"error_description"\s*:\s*"([^"]+)"/)?.[1]
        ?? bodyText.match(/"msg"\s*:\s*"([^"]+)"/)?.[1]
        ?? bodyText.match(/"error"\s*:\s*"([^"]+)"/)?.[1]
        ?? "unparsed";
      bodyClass = msg.slice(0, 120);
    }
    console.log(
      `oauth_start_${label} follow_status=${probe.status} location_host=${locationHost} location_path=${locationPath} error=${locationError} error_code=${locationErrorCode} body_class=${bodyClass}`,
    );
  }

  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  const dbUrl = encodeDbUrl(dbUrlRaw);
  console.log(`db_target_ref=${classified.ref}`);

  const providersRaw = dbQuerySql(
    dbUrl,
    `SELECT provider, count(*)::int AS n FROM auth.identities GROUP BY provider ORDER BY provider;`,
  );
  const providerRows = [...providersRaw.matchAll(/"provider"\s*:\s*"([^"]+)"[\s\S]{0,80}?"n"\s*:\s*(\d+)/g)];
  if (providerRows.length === 0) {
    console.log(`identity_providers_raw_redacted=${redact(providersRaw).slice(0, 400)}`);
  } else {
    for (const row of providerRows) {
      console.log(`identity_provider=${row[1]} n=${row[2]}`);
    }
  }
  const kakaoN = parseCount(
    dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao';`),
  );
  const naverLike = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities WHERE lower(provider) LIKE '%naver%' OR lower(provider) LIKE 'custom:%';`,
    ),
  );
  console.log(`identity_kakao_n=${kakaoN}`);
  console.log(`identity_naver_or_custom_n=${naverLike}`);

  const hookDef = dbQuerySql(
    dbUrl,
    `SELECT pg_get_functiondef('public.hook_before_user_created(jsonb)'::regprocedure) AS def;`,
  );
  const allowsNonEmail =
    /provider = 'email' OR provider = 'anonymous' OR provider = ''/.test(hookDef) &&
    /RETURN '\{\}'::jsonb/.test(hookDef);
  const hasExplicitNaver = /provider = 'naver'|provider = 'custom:naver'/.test(hookDef);
  const hasExplicitGoogleKakaoOnly =
    /provider = 'google'/.test(hookDef) && /provider = 'kakao'/.test(hookDef) && !allowsNonEmail;
  console.log(`hook_non_email_allow_all=${allowsNonEmail ? "YES" : "NO"}`);
  console.log(`hook_explicit_naver_string=${hasExplicitNaver ? "YES" : "NO"}`);
  console.log(`hook_explicit_google_kakao_only=${hasExplicitGoogleKakaoOnly ? "YES" : "NO"}`);

  const hookProbes: Array<[string, string]> = [
    ["email", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"email"}}}'],
    ["google", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"google"}}}'],
    ["kakao", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"kakao"}}}'],
    ["naver", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"naver"}}}'],
    ["custom_naver", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"custom:naver"}}}'],
    ["custom_star", '{"user":{"is_anonymous":false,"app_metadata":{"provider":"custom:anything"}}}'],
  ];
  for (const [label, payload] of hookProbes) {
    const raw = dbQuerySql(dbUrl, `SELECT public.hook_before_user_created('${payload}'::jsonb);`);
    console.log(`hook_probe_${label}=${hookAllows(raw) ? "ALLOW" : "REJECT"}`);
  }
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : "inspect failed"));
  process.exit(1);
});
