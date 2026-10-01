/**
 * P0.9B-R1 READ-ONLY production schema_migrations fact check.
 * Classifies LIVE_DB_URL, then SELECT version/count only. Never mutates.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  classifyPostgresConnection,
  isUsableSupabaseDbUrl,
  PRODUCTION_SUPABASE_REF,
} from "../src/lib/supabaseHosts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]");
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
  const enc = (part: string): string => {
    try {
      return encodeURIComponent(decodeURIComponent(part));
    } catch {
      return encodeURIComponent(part);
    }
  };
  return `${scheme}${enc(userinfo.slice(0, colon))}:${enc(userinfo.slice(colon + 1))}@${hostpart}`;
}

function q(dbUrl: string, label: string, sql: string): string {
  const tmp = path.join(os.tmpdir(), `metalora-ledger-${randomBytes(6).toString("hex")}.sql`);
  fs.writeFileSync(tmp, sql.endsWith(";") ? sql : `${sql};`, "utf8");
  try {
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["--yes", "supabase", "db", "query", "--db-url", dbUrl, "--file", tmp],
      {
        encoding: "utf8",
        windowsHide: true,
        shell: process.platform === "win32",
        env: process.env,
        maxBuffer: 8_000_000,
      },
    );
    const out = redact((result.stdout || result.stderr || "").trim());
    console.log(`--- ${label} ---`);
    if (result.status !== 0) {
      console.log(`QUERY_FAIL status=${result.status}`);
      console.log(out.slice(0, 800));
      return "";
    }
    console.log(out || "(empty)");
    return out;
  } finally {
    fs.unlinkSync(tmp);
  }
}

const live =
  (process.env.LIVE_DB_URL ?? "").trim() ||
  (parseEnvFile(path.join(root, ".env.payment-test.db.local")).LIVE_DB_URL ?? "").trim();
if (!live) {
  console.log("STATUS=PRODUCTION DB SECURE ACCESS REQUIRED");
  process.exit(2);
}
const cls = classifyPostgresConnection(live);
console.log("LIVE_DB_URL=PRESENT");
console.log(`LIVE_REF=${cls.ref ?? "NONE"}`);
console.log(`LIVE_IS_PRODUCTION=${cls.isProductionRef ? "YES" : "NO"}`);
if (!cls.isProductionRef || cls.ref !== PRODUCTION_SUPABASE_REF || !isUsableSupabaseDbUrl(live)) {
  console.log("STATUS=BLOCKED not proven production");
  process.exit(2);
}
console.log("TARGET=qifloweuwyhvukabgnoa CONFIRMED");
console.log("MODE=READ_ONLY");
const dbUrl = encodeDbUrl(live);

q(
  dbUrl,
  "schema_migrations tables",
  `SELECT n.nspname AS schema_name, c.relname AS table_name
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r' AND c.relname = 'schema_migrations'
   ORDER BY 1, 2`,
);
q(
  dbUrl,
  "supabase_migrations schema exists",
  `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'supabase_migrations'`,
);
q(
  dbUrl,
  "to_regclass",
  `SELECT COALESCE(to_regclass('supabase_migrations.schema_migrations')::text, 'NULL') AS name`,
);
q(
  dbUrl,
  "ledger columns",
  `SELECT column_name AS name
   FROM information_schema.columns
   WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
   ORDER BY ordinal_position`,
);
q(
  dbUrl,
  "ledger row count",
  `SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations`,
);
q(
  dbUrl,
  "ledger versions",
  `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
);
