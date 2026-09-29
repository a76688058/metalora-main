/**
 * C2-0 READ-ONLY inspect of live Naver Auth identity/profile after OAuth.
 * Does not print emails, phones, ids, tokens, subjects, or usernames.
 * Payment-test only. Does not mutate production. Does not activate members.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { isUsableMemberProfile } from "../src/lib/authIntegrity";
import { GENERATED_SOCIAL_USERNAME_RE } from "../src/lib/memberUsername";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]")
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
  const tmp = path.join(os.tmpdir(), `metalora-c20live-${randomBytes(8).toString("hex")}.sql`);
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

async function main(): Promise<void> {
  const apiEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const dbEnv = parseEnvFileRaw(path.join(root, ".env.payment-test.db.local"));
  const supabaseUrl = (apiEnv.VITE_SUPABASE_URL ?? "").trim();
  const serviceKey = (apiEnv.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  console.log(`api_target_host=${new URL(supabaseUrl).host}`);

  const listed = await fetch(`${supabaseUrl}/auth/v1/admin/custom-providers`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: "application/json",
    },
  });
  console.log(`custom_providers_status=${listed.status}`);
  const listedJson: unknown = listed.ok ? await listed.json() : null;
  const list = Array.isArray(listedJson)
    ? listedJson
    : listedJson && typeof listedJson === "object" && Array.isArray((listedJson as { providers?: unknown }).providers)
      ? ((listedJson as { providers: unknown[] }).providers)
      : listedJson && typeof listedJson === "object" && Array.isArray((listedJson as { data?: unknown }).data)
        ? ((listedJson as { data: unknown[] }).data)
        : listedJson
          ? [listedJson]
          : [];
  const naverProv = list.find((item) => {
    if (!item || typeof item !== "object") return false;
    const id = String((item as { identifier?: string }).identifier ?? "").toLowerCase();
    return id === "custom:naver";
  }) as Record<string, unknown> | undefined;
  if (!naverProv) {
    console.log("custom_naver_provider=ABSENT");
  } else {
    const issuer = naverProv.issuer;
    console.log(`custom_naver identifier=${String(naverProv.identifier ?? "")}`);
    console.log(`custom_naver provider_type=${String(naverProv.provider_type ?? naverProv.type ?? "")}`);
    console.log(`custom_naver enabled=${String(naverProv.enabled)}`);
    console.log(`custom_naver email_optional=${String(naverProv.email_optional)}`);
    console.log(`custom_naver issuer=${issuer == null || String(issuer).trim() === "" ? "ABSENT" : "PRESENT"}`);
    console.log(`custom_naver authorization_url=${String(naverProv.authorization_url ?? "")}`);
    console.log(`custom_naver userinfo_url=${String(naverProv.userinfo_url ?? "")}`);
    const tokenUrl = String(naverProv.token_url ?? "");
    try {
      console.log(`custom_naver token_host=${tokenUrl ? new URL(tokenUrl).host : "ABSENT"}`);
    } catch {
      console.log("custom_naver token_host=UNPARSEABLE");
    }
  }
  const dbUrlRaw = (process.env.PAYMENT_TEST_DB_URL ?? dbEnv.PAYMENT_TEST_DB_URL ?? "").trim();
  if (!isUsableSupabaseDbUrl(dbUrlRaw)) throw new Error("PAYMENT_TEST_DB_URL missing");
  const classified = classifyPostgresConnection(dbUrlRaw);
  if (classified.isProductionRef || classified.ref !== PAYMENT_TEST_REF) {
    throw new Error("PAYMENT_TEST_DB_URL is not payment-test");
  }
  const dbUrl = encodeDbUrl(dbUrlRaw);
  console.log(`db_target_ref=${classified.ref}`);
  console.log(`auth_users_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.users;`))}`);
  console.log(`auth_identities_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities;`))}`);
  console.log(`identity_google_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'google';`))}`);
  console.log(`identity_kakao_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'kakao';`))}`);
  console.log(`identity_email_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'email';`))}`);
  console.log(`identity_custom_naver_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'custom:naver';`))}`);
  console.log(`identity_naver_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'naver';`))}`);
  console.log(`identity_custom_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE provider = 'custom';`))}`);
  console.log(`users_created_12h_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.users WHERE created_at > now() - interval '12 hours';`))}`);
  console.log(`identities_created_12h_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE created_at > now() - interval '12 hours';`))}`);
  console.log(`identities_updated_12h_n=${parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE updated_at > now() - interval '12 hours';`))}`);
  const distinctProviders = dbQuerySql(
    dbUrl,
    `SELECT coalesce(json_agg(provider ORDER BY provider)::text, '[]') AS n FROM (SELECT DISTINCT provider FROM auth.identities) t;`,
  );
  const distinctMatch = distinctProviders.match(/"n"\s*:\s*"(\[[^\]]*\])"/) ?? distinctProviders.match(/\[[^\]]*\]/);
  console.log(`distinct_identity_providers=${distinctMatch ? (distinctMatch[1] ?? distinctMatch[0]) : "UNPARSED"}`);

  const providerRows = [
    ...dbQuerySql(
      dbUrl,
      `SELECT provider, count(*)::int AS n FROM auth.identities GROUP BY provider ORDER BY provider;`,
    ).matchAll(/"provider"\s*:\s*"([^"]+)"[\s\S]{0,80}?"n"\s*:\s*(\d+)/g),
  ];
  for (const row of providerRows) {
    console.log(`identity_provider=${row[1]} n=${row[2]}`);
  }

  const naverWhere = `(lower(provider) LIKE '%naver%' OR lower(provider) LIKE 'custom:%')`;
  const naverWhereN = `(lower(n.provider) LIKE '%naver%' OR lower(n.provider) LIKE 'custom:%')`;
  const naverProvidersRaw = dbQuerySql(
    dbUrl,
    `SELECT provider, count(*)::int AS n
     FROM auth.identities
     WHERE ${naverWhere}
     GROUP BY provider
     ORDER BY provider;`,
  );
  const naverRows = [...naverProvidersRaw.matchAll(/"provider"\s*:\s*"([^"]+)"[\s\S]{0,80}?"n"\s*:\s*(\d+)/g)];
  if (naverRows.length === 0) {
    console.log("naver_or_custom_identity=NONE");
  } else {
    for (const row of naverRows) console.log(`naver_or_custom_provider=${row[1]} n=${row[2]}`);
  }

  const userIdsSql = `SELECT DISTINCT user_id FROM auth.identities WHERE ${naverWhere}`;
  const userCount = parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM (${userIdsSql}) t;`));
  const identityCount = parseCount(dbQuerySql(dbUrl, `SELECT count(*)::int AS n FROM auth.identities WHERE ${naverWhere};`));
  console.log(`naver_or_custom_identities=${identityCount}`);
  console.log(`naver_or_custom_users=${userCount}`);

  const subjectN = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities
       WHERE ${naverWhere}
         AND (
           coalesce(identity_data->>'sub','') <> ''
           OR coalesce(identity_data->>'id','') <> ''
           OR coalesce(provider_id,'') <> ''
         );`,
    ),
  );
  const emailN = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities
       WHERE ${naverWhere} AND coalesce(identity_data->>'email','') <> '';`,
    ),
  );
  const emailVerifiedN = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities
       WHERE ${naverWhere}
         AND lower(coalesce(identity_data->>'email_verified','false')) IN ('true','t','1');`,
    ),
  );
  const metadataN = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities
       WHERE ${naverWhere} AND identity_data IS NOT NULL AND identity_data <> '{}'::jsonb;`,
    ),
  );
  console.log(`naver_subject=${subjectN > 0 ? "PRESENT" : "ABSENT"} n=${subjectN}`);
  console.log(`naver_identity_email=${emailN > 0 ? "PRESENT" : "ABSENT"} n=${emailN}`);
  console.log(`naver_identity_email_verified_true_n=${emailVerifiedN}`);
  console.log(`naver_identity_metadata=${metadataN > 0 ? "YES" : "NO"} n=${metadataN}`);

  const linkedGoogle = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities n
       JOIN auth.identities g ON g.user_id = n.user_id AND g.provider = 'google'
       WHERE ${naverWhereN};`,
    ),
  );
  const linkedKakao = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities n
       JOIN auth.identities k ON k.user_id = n.user_id AND k.provider = 'kakao'
       WHERE ${naverWhereN};`,
    ),
  );
  const linkedEmail = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n FROM auth.identities n
       JOIN auth.identities e ON e.user_id = n.user_id AND e.provider = 'email'
       WHERE ${naverWhereN};`,
    ),
  );
  console.log(`same_user_google_identity=${linkedGoogle}`);
  console.log(`same_user_kakao_identity=${linkedKakao}`);
  console.log(`same_user_email_identity=${linkedEmail}`);

  const hookProviderRaw = dbQuerySql(
    dbUrl,
    `SELECT coalesce(u.raw_app_meta_data->>'provider','') AS provider, count(*)::int AS n
     FROM auth.users u
     WHERE u.id IN (${userIdsSql})
     GROUP BY 1
     ORDER BY 1;`,
  );
  const hookRows = [...hookProviderRaw.matchAll(/"provider"\s*:\s*"([^"]*)"[\s\S]{0,80}?"n"\s*:\s*(\d+)/g)];
  if (hookRows.length === 0) {
    console.log("hook_facing_provider=NONE_OR_UNPARSED");
  } else {
    for (const row of hookRows) console.log(`hook_facing_provider=${row[1] || "EMPTY"} n=${row[2]}`);
  }

  if (userCount === 0) {
    console.log("live_profile_inspect=SKIPPED");
    return;
  }
  if (userCount !== 1) {
    console.log("live_profile_inspect=MULTI_USER_COUNTS_ONLY");
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const idRaw = dbQuerySql(dbUrl, `${userIdsSql} LIMIT 1;`);
  const uuid = idRaw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!uuid) {
    console.log("live_user_id=UNPARSED");
    return;
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(uuid);
  if (userError || !userData.user) {
    console.log(`admin_get_user=FAIL class=${redact(userError?.message ?? "missing")}`);
    return;
  }
  const user = userData.user;
  const providers = (user.identities ?? []).map((identity) => (identity.provider ?? "").trim());
  console.log(`auth_identity_providers=${providers.join(",") || "none"}`);
  const metaProvider =
    typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider.trim() : "";
  console.log(`app_metadata_provider=${metaProvider || "ABSENT"}`);
  console.log(`auth_email=${user.email ? "PRESENT" : "ABSENT"}`);
  const confirmed = user.email_confirmed_at ? "VERIFIED" : user.email ? "UNVERIFIED" : "UNKNOWN";
  console.log(`auth_email_confirmed=${confirmed}`);
  const identities = user.identities ?? [];
  for (const identity of identities) {
    const provider = (identity.provider ?? "").trim();
    const data = (identity.identity_data ?? {}) as Record<string, unknown>;
    const emailPresent = typeof data.email === "string" && data.email.trim().length > 0;
    const emailVerified = data.email_verified;
    const subPresent = typeof data.sub === "string" && data.sub.trim().length > 0;
    const idPresent = typeof data.id === "string" && String(data.id).trim().length > 0;
    console.log(
      `identity ${provider} email=${emailPresent ? "PRESENT" : "ABSENT"} email_verified=${
        emailVerified === true ? "true" : emailVerified === false ? "false" : "UNKNOWN"
      } sub=${subPresent ? "PRESENT" : "ABSENT"} id=${idPresent ? "PRESENT" : "ABSENT"}`,
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select(
      "id, user_custom_id, verified_phone_fingerprint, phone_verified_at, password_login_enabled, social_login_enabled",
    )
    .eq("id", uuid)
    .maybeSingle();
  if (profileError) {
    console.log(`profile_read=FAIL class=${redact(profileError.message)}`);
    return;
  }
  console.log(`profile_row=${profile ? "PRESENT" : "ABSENT"}`);
  const username = typeof profile?.user_custom_id === "string" ? profile.user_custom_id.trim() : "";
  console.log(`username=${username ? (GENERATED_SOCIAL_USERNAME_RE.test(username) ? "GENERATED_ML" : "NONBLANK") : "ABSENT"}`);
  console.log(`fingerprint=${profile?.verified_phone_fingerprint?.trim() ? "PRESENT" : "ABSENT"}`);
  console.log(`phone_verified_at=${profile?.phone_verified_at ? "PRESENT" : "ABSENT"}`);
  console.log(`password_login_enabled=${profile?.password_login_enabled === true ? "true" : "false"}`);
  console.log(`social_login_enabled=${profile?.social_login_enabled === true ? "true" : "false"}`);
  const usable = isUsableMemberProfile(profile);
  console.log(`usable_member=${usable ? "YES" : "NO"}`);
  console.log(`payment_gate_expected=${usable ? "ISSUE" : "REJECTED"}`);

  const googleSameEmail = parseCount(
    dbQuerySql(
      dbUrl,
      `SELECT count(*)::int AS n
       FROM auth.identities n
       JOIN auth.identities g
         ON g.user_id = n.user_id AND g.provider = 'google'
       WHERE lower(n.provider) LIKE '%naver%' OR lower(n.provider) LIKE 'custom:%';`,
    ),
  );
  console.log(`same_user_google_identity=${googleSameEmail}`);
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : "inspect failed"));
  process.exit(1);
});
