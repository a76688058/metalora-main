/**
 * #18C-1 payment-test schema bootstrap preflight + optional dump/restore.
 * Never prints passwords, JWTs, or full connection URIs.
 *
 * Default: preflight only (no remote dump/restore).
 * Apply:   npm run bootstrap:payment-test-schema -- --apply
 * Preferred engine: `npx supabase db query --db-url` (no Docker, no psql).
 * `supabase db dump` requires Docker and is not used unless that is the only tool.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  classifyPostgresConnection,
  isProductionSupabaseHost,
  isUsableSupabaseDbUrl,
  supabaseHostFromUrl,
  supabaseRefFromApiHost,
} from "../src/lib/supabaseHosts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDumpPath = path.join(root, ".supabase-live-schema.local.sql");
const triggerDumpPath = path.join(root, ".supabase-live-auth-trigger.local.sql");
const verifySqlPath = path.join(root, "scripts/sql/verify-payment-test-schema.sql");
const extractPublicSqlPath = path.join(root, "scripts/sql/extract-live-public-ddl.sql");
const extractTriggerSqlPath = path.join(root, "scripts/sql/extract-live-auth-trigger.sql");
const applyRequested = process.argv.includes("--apply");

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, "[jwt]");
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

function commandPresent(command: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { encoding: "utf8" });
  return result.status === 0;
}

function resolveDbUrl(name: "LIVE_DB_URL" | "PAYMENT_TEST_DB_URL"): string {
  const file = parseEnvFile(path.join(root, ".env.payment-test.db.local"));
  const fromFile = file[name] ?? "";
  const fromEnv = (process.env[name] ?? "").trim();
  return fromEnv || fromFile;
}

function toolStatus(): { supabaseNpx: boolean; docker: boolean; pgDump: boolean; psql: boolean } {
  return {
    supabaseNpx: commandPresent("npx"),
    docker: commandPresent("docker"),
    pgDump: commandPresent("pg_dump"),
    psql: commandPresent("psql"),
  };
}

const paymentTestApi = parseEnvFile(path.join(root, ".env.payment-test.local"));
const apiUrl = paymentTestApi.VITE_SUPABASE_URL ?? "";
const apiHost = supabaseHostFromUrl(apiUrl);
const testRef = supabaseRefFromApiHost(apiHost);
const liveUrl = resolveDbUrl("LIVE_DB_URL");
const testUrl = resolveDbUrl("PAYMENT_TEST_DB_URL");
const tools = toolStatus();
const dumpTool = tools.supabaseNpx
  ? "supabase-query"
  : tools.docker
    ? "supabase-docker"
    : tools.pgDump && tools.psql
      ? "libpq"
      : null;
const blockers: string[] = [];

function dbUrlClass(url: string): string {
  if (!url) return "EMPTY";
  if (!isUsableSupabaseDbUrl(url)) return "INVALID";
  const classified = classifyPostgresConnection(url);
  if (classified.isProductionRef) return "PRODUCTION";
  if (classified.ref) return "NON_PRODUCTION";
  return "INVALID";
}

if (!apiUrl || !apiHost || isProductionSupabaseHost(apiHost) || !testRef) {
  blockers.push("VITE_SUPABASE_URL in .env.payment-test.local must be the isolated test API host");
}
if (!liveUrl) blockers.push("LIVE_DB_URL missing (.env.payment-test.db.local or process env)");
if (!testUrl) blockers.push("PAYMENT_TEST_DB_URL missing (.env.payment-test.db.local or process env)");
if (liveUrl && !isUsableSupabaseDbUrl(liveUrl)) {
  blockers.push("LIVE_DB_URL is present but is not a full Supabase Postgres URI (Dashboard → Database → URI, Direct or Session)");
}
if (testUrl && !isUsableSupabaseDbUrl(testUrl)) {
  blockers.push("PAYMENT_TEST_DB_URL is present but is not a full Supabase Postgres URI (Dashboard → Database → URI, Direct or Session)");
}
if (isUsableSupabaseDbUrl(liveUrl) && !classifyPostgresConnection(liveUrl).isProductionRef) {
  blockers.push("LIVE_DB_URL must target production project ref qifloweuwyhvukabgnoa");
}
if (isUsableSupabaseDbUrl(testUrl) && classifyPostgresConnection(testUrl).isProductionRef) {
  blockers.push("PAYMENT_TEST_DB_URL must NOT target production");
}
if (isUsableSupabaseDbUrl(testUrl) && testRef) {
  const testDbRef = classifyPostgresConnection(testUrl).ref;
  if (testDbRef && testDbRef !== testRef) {
    blockers.push("PAYMENT_TEST_DB_URL project ref does not match .env.payment-test.local API host");
  }
}
if (!dumpTool) {
  blockers.push("Need npx supabase (db query, no Docker) OR Docker+dump OR pg_dump+psql");
}

console.log("bootstrap-payment-test-schema PREFLIGHT");
console.log("apply_requested=" + (applyRequested ? "yes" : "no"));
console.log("payment_test_api_host_class=" + (isProductionSupabaseHost(apiHost) ? "PRODUCTION" : "NON_PRODUCTION"));
console.log("payment_test_api_ref=" + (testRef ?? "UNKNOWN"));
console.log("LIVE_DB_URL=" + (liveUrl ? "PRESENT" : "EMPTY"));
console.log("PAYMENT_TEST_DB_URL=" + (testUrl ? "PRESENT" : "EMPTY"));
console.log("live_db_ref_class=" + dbUrlClass(liveUrl));
console.log("test_db_ref_class=" + dbUrlClass(testUrl));
console.log("docker=" + (tools.docker ? "PRESENT" : "ABSENT"));
console.log("pg_dump=" + (tools.pgDump ? "PRESENT" : "ABSENT"));
console.log("psql=" + (tools.psql ? "PRESENT" : "ABSENT"));
console.log("dump_restore_tool=" + (dumpTool ?? "NONE"));

if (blockers.length > 0) {
  console.log("PREFLIGHT_FAIL");
  for (const blocker of blockers) console.log("- " + blocker);
  process.exit(2);
}

console.log("PREFLIGHT_PASS");

if (!applyRequested) {
  console.log("STOP: dump/restore not started. Re-run with --apply after reviewing preflight.");
  process.exit(0);
}

function run(command: string, args: string[]): string {
  const bin = command === "npx" && process.platform === "win32" ? "npx.cmd" : command;
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  });
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(redact(combined.trim() || `${command} exited ${result.status}`));
  }
  return result.stdout ?? "";
}

function collectDdlStatements(value: unknown, acc: { stmt_no: number; ddl: string }[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDdlStatements(item, acc);
    return;
  }
  if (!value || typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  if (typeof rec.ddl === "string" && rec.ddl.trim() && rec.class !== "bundle") {
    acc.push({
      stmt_no: typeof rec.stmt_no === "number" ? rec.stmt_no : acc.length + 1,
      ddl: rec.ddl,
    });
    return;
  }
  if (typeof rec.function_ddl === "string" && rec.function_ddl.trim()) {
    acc.push({ stmt_no: acc.length + 1, ddl: rec.function_ddl });
    return;
  }
  for (const nested of Object.values(rec)) collectDdlStatements(nested, acc);
}

function sqlFromPublicExtract(stdout: string): string {
  const trimmed = stdout.trim();
  try {
    const rows: { stmt_no: number; ddl: string }[] = [];
    collectDdlStatements(JSON.parse(trimmed), rows);
    if (rows.length > 0) {
      rows.sort((a, b) => a.stmt_no - b.stmt_no);
      return rows.map((row) => row.ddl).join("\n");
    }
  } catch {
    // fall through
  }
  return findMarkedSql(trimmed, "-- metalora-live-public-ddl");
}

function findMarkedSql(stdout: string, marker: string): string {
  const findIn = (value: unknown): string | null => {
    if (typeof value === "string" && value.includes(marker)) return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findIn(item);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        const found = findIn(nested);
        if (found) return found;
      }
    }
    return null;
  };

  const trimmed = stdout.trim();
  try {
    const fromJson = findIn(JSON.parse(trimmed));
    if (fromJson) return fromJson;
  } catch {
    // CLI may wrap JSON or print a table; fall through to marker scan.
  }
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) return trimmed.slice(idx);
  throw new Error(`Could not parse CLI output for ${marker}`);
}

function supabaseQuery(dbUrl: string, filePath: string): string {
  return run("npx", ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", filePath]);
}

function assertSchemaOnly(sql: string): void {
  if (/COPY\s+public\.(profiles|orders|order_items|payment_intents)\b/i.test(sql)) {
    throw new Error("Extract contains COPY data for customer/payment tables; aborting");
  }
  if (/^INSERT INTO\s+public\.(profiles|orders|order_items|payment_intents)\b/im.test(sql)) {
    throw new Error("Extract contains INSERT data for customer/payment tables; aborting");
  }
  if (sql.includes("원좉컼") || sql.includes("湲곕낯")) {
    throw new Error("Extract contains mojibake Korean literals; aborting");
  }
  if (!sql.includes("고객") || !sql.includes("제품") || !sql.includes("기본")) {
    throw new Error("Extract missing live finalize_paid_order Korean literals; aborting");
  }
}

if (fs.existsSync(schemaDumpPath)) {
  fs.unlinkSync(schemaDumpPath);
}

console.log("EXTRACT public schema-only from live (no data, no Docker dump)");
if (dumpTool === "supabase-query") {
  const extracted = sqlFromPublicExtract(supabaseQuery(liveUrl, extractPublicSqlPath));
  fs.writeFileSync(schemaDumpPath, extracted, "utf8");
} else if (dumpTool === "supabase-docker") {
  run("npx", [
    "--yes",
    "supabase",
    "db",
    "dump",
    "--db-url",
    liveUrl,
    "--schema",
    "public",
    "-f",
    schemaDumpPath,
  ]);
} else {
  run("pg_dump", [
    "--schema-only",
    "--schema=public",
    "--no-owner",
    "--file",
    schemaDumpPath,
    liveUrl,
  ]);
}

if (!fs.existsSync(schemaDumpPath) || fs.statSync(schemaDumpPath).size < 100) {
  throw new Error("Schema extract file missing or too small");
}

const dumpText = fs.readFileSync(schemaDumpPath, "utf8");
assertSchemaOnly(dumpText);

console.log("APPLY public DDL onto payment-test only");
if (dumpTool === "libpq") {
  run("psql", [
    "--single-transaction",
    "--variable",
    "ON_ERROR_STOP=1",
    "--file",
    schemaDumpPath,
    "--dbname",
    testUrl,
  ]);
} else {
  supabaseQuery(testUrl, schemaDumpPath);
}

console.log("READ live auth.users trigger metadata");
let triggerSql = "";
if (dumpTool === "libpq") {
  const triggerDef = run("psql", [
    "--tuples-only",
    "--no-align",
    "--file",
    extractTriggerSqlPath,
    "--dbname",
    liveUrl,
  ]);
  triggerSql = findMarkedSql(triggerDef, "-- metalora-live-auth-trigger");
} else {
  triggerSql = findMarkedSql(
    supabaseQuery(liveUrl, extractTriggerSqlPath),
    "-- metalora-live-auth-trigger",
  );
}

if (!/ON\s+auth\.users/i.test(triggerSql) || !/handle_new_user/i.test(triggerSql)) {
  throw new Error("Live trigger definition did not target auth.users / handle_new_user");
}

const triggerApply =
  "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;\n" +
  triggerSql.replace(/^[\s\S]*?(CREATE\s+(?:CONSTRAINT\s+)?TRIGGER)/i, "$1");
fs.writeFileSync(triggerDumpPath, triggerApply, "utf8");

console.log("APPLY auth trigger on payment-test only");
if (dumpTool === "libpq") {
  run("psql", [
    "--single-transaction",
    "--variable",
    "ON_ERROR_STOP=1",
    "--file",
    triggerDumpPath,
    "--dbname",
    testUrl,
  ]);
} else {
  supabaseQuery(testUrl, triggerDumpPath);
}

console.log("VERIFY payment-test schema (SELECT only)");
let verifyOut = "";
if (dumpTool === "libpq") {
  verifyOut = run("psql", ["--tuples-only", "--no-align", "--file", verifySqlPath, "--dbname", testUrl]);
} else {
  verifyOut = supabaseQuery(testUrl, verifySqlPath);
}
console.log(redact(verifyOut.trim()));
console.log("bootstrap-payment-test-schema APPLY_DONE");
