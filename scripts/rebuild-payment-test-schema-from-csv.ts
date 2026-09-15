/**
 * #18C-1E — Rebuild payment-test public schema SQL from exported CSV.
 * Authoritative payload: ddl_utf8_b64. Never uses the human-readable ddl column.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = path.join(root, "metalora-live-public-ddl.csv");
const outPath = path.join(root, "scripts/sql/generated/metalora-payment-test-public-schema.sql");

type CsvRow = Record<string, string>;

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n") || ch === "\r") {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const body = rows.slice(1).map((cells) => {
    const rec: CsvRow = {};
    headers.forEach((header, idx) => {
      rec[header] = cells[idx] ?? "";
    });
    return rec;
  });
  return { headers, rows: body };
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const blockers: string[] = [];
const notes: string[] = [];

if (!fs.existsSync(csvPath)) {
  console.log("CSV_ABSENT");
  process.exit(2);
}

const raw = fs.readFileSync(csvPath);
const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
const text = hasBom ? raw.subarray(3).toString("utf8") : raw.toString("utf8");
const parsed = parseCsv(text);
const expectedHeaders = ["stmt_no", "class", "object_name", "ddl", "ddl_sha256_utf8", "ddl_utf8_b64"];
if (parsed.headers.join(",") !== expectedHeaders.join(",")) {
  blockers.push(`Unexpected headers: ${parsed.headers.join("|")}`);
}

const stmtNos = parsed.rows.map((row) => Number(row.stmt_no));
const unique = new Set(stmtNos);
if (unique.size !== stmtNos.length) blockers.push("stmt_no is not unique");
const sorted = [...stmtNos].sort((a, b) => a - b);
if (sorted[0] !== 1) blockers.push(`first stmt_no is ${sorted[0]}, expected 1`);
for (let i = 1; i < sorted.length; i += 1) {
  if (sorted[i] !== sorted[i - 1] + 1) {
    blockers.push(`stmt_no gap or disorder around ${sorted[i - 1]} -> ${sorted[i]}`);
    break;
  }
}
const orderedByFile = stmtNos.every((n, i) => i === 0 || n >= stmtNos[i - 1]);
if (!orderedByFile) notes.push("CSV row physical order is not nondecreasing stmt_no; will concatenate by stmt_no anyway");

const decodedByStmt = new Map<number, { class: string; objectName: string; sql: string; bytes: Buffer }>();
let hashFail = 0;
let decodeFail = 0;
const mojibakeHits: string[] = [];
const mojibakeNeedles = ["원좉컼", "湲곕낯", "쒗뭹"];

for (const row of parsed.rows) {
  const stmtNo = Number(row.stmt_no);
  const b64 = (row.ddl_utf8_b64 ?? "").replace(/\s+/g, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0 && b64.length > 0) throw new Error("empty decode");
  } catch {
    decodeFail += 1;
    blockers.push(`stmt_no ${stmtNo} base64 decode failed`);
    continue;
  }
  const hex = sha256Hex(bytes);
  if (hex !== row.ddl_sha256_utf8.trim().toLowerCase()) {
    hashFail += 1;
    blockers.push(`stmt_no ${stmtNo} (${row.object_name}) SHA256 mismatch`);
  }
  const sql = bytes.toString("utf8");
  for (const needle of mojibakeNeedles) {
    if (sql.includes(needle)) {
      mojibakeHits.push(`${stmtNo}:${row.object_name}:${needle}`);
    }
  }
  decodedByStmt.set(stmtNo, {
    class: row.class,
    objectName: row.object_name,
    sql,
    bytes,
  });
}

if (decodeFail > 0) blockers.push(`base64 decode failures: ${decodeFail}`);
if (hashFail > 0) blockers.push(`hash mismatches: ${hashFail}`);
if (mojibakeHits.length > 0) {
  blockers.push(`mojibake present: ${mojibakeHits.slice(0, 8).join("; ")}`);
}

const concatParts: Buffer[] = [];
for (const stmtNo of sorted) {
  const item = decodedByStmt.get(stmtNo);
  if (!item) continue;
  concatParts.push(item.bytes);
  concatParts.push(Buffer.from("\n", "utf8"));
}
const generated = Buffer.concat(concatParts);
const generatedText = generated.toString("utf8");

const finalizeFns = [...decodedByStmt.values()].filter(
  (item) => item.class === "function" && item.objectName === "finalize_paid_order",
);
const finalizeSql = finalizeFns.map((item) => item.sql).join("\n");
const literalPass =
  finalizeSql.includes("고객") && finalizeSql.includes("제품") && finalizeSql.includes("기본");
if (finalizeFns.length === 0) blockers.push("finalize_paid_order function statement missing");
if (!literalPass) blockers.push("finalize_paid_order missing intended Korean literals");

const topLevelSeed: string[] = [];
for (const stmtNo of sorted) {
  const item = decodedByStmt.get(stmtNo);
  if (!item) continue;
  const lead = item.sql.trim();
  if (/^(INSERT|COPY)\b/i.test(lead)) {
    topLevelSeed.push(`${stmtNo}:${item.class}:${item.objectName}:${lead.slice(0, 80)}`);
  }
}
const seedInsert = topLevelSeed.some((line) => /:INSERT/i.test(line));
const copyData = topLevelSeed.some((line) => /:COPY/i.test(line));
if (topLevelSeed.length > 0) {
  blockers.push(`Top-level INSERT/COPY present: ${topLevelSeed.slice(0, 5).join("; ")}`);
}

const profilesCreate = [...decodedByStmt.values()].find(
  (item) => item.class === "table" && item.objectName === "profiles",
)?.sql ?? "";
const updateUserInfo = [...decodedByStmt.values()].find(
  (item) => item.class === "function" && item.objectName === "update_user_info",
)?.sql ?? "";

function columnPresent(createSql: string, column: string): boolean {
  const re = new RegExp(`\\b${column}\\b`, "i");
  return re.test(createSql);
}

const profilesHasShippingName = columnPresent(profilesCreate, "shipping_name");
const profilesHasShippingPhone = columnPresent(profilesCreate, "shipping_phone");
const profilesHasFullName = columnPresent(profilesCreate, "full_name");
const profilesHasPhoneNumber = columnPresent(profilesCreate, "phone_number");
const updateRefsShippingName = /\bshipping_name\b/.test(updateUserInfo);
const updateRefsShippingPhone = /\bshipping_phone\b/.test(updateUserInfo);
const updateRefsFullName = /\bfull_name\b/.test(updateUserInfo);
const updateRefsPhoneNumber = /\bphone_number\b/.test(updateUserInfo);

let updateCompatPass = true;
if (updateUserInfo) {
  updateCompatPass = false;
  blockers.push("update_user_info is present; #18C-1F requires it ABSENT before bootstrap");
  if (updateRefsShippingName && !profilesHasShippingName) {
    blockers.push("update_user_info references shipping_name but profiles CREATE TABLE does not include shipping_name");
  }
  if (updateRefsShippingPhone && !profilesHasShippingPhone) {
    blockers.push("update_user_info references shipping_phone but profiles CREATE TABLE does not include shipping_phone");
  }
}

const classOrder = [...decodedByStmt.values()].map((item) => item.class);
const firstTable = classOrder.indexOf("table");
const firstFunction = classOrder.indexOf("function");
const firstConstraint = classOrder.findIndex((c) => c === "constraint");
if (firstFunction !== -1 && firstTable !== -1 && firstFunction < firstTable) {
  blockers.push("dependency order: a function appears before any table");
}
if (firstConstraint !== -1 && firstTable !== -1 && firstConstraint < firstTable) {
  blockers.push("dependency order: a constraint appears before any table");
}

const classes = new Map<string, number>();
for (const item of decodedByStmt.values()) {
  classes.set(item.class, (classes.get(item.class) ?? 0) + 1);
}

console.log("csv_bytes=" + raw.length);
console.log("csv_bom=" + (hasBom ? "YES" : "NO"));
console.log("headers=" + parsed.headers.join(","));
console.log("row_count=" + parsed.rows.length);
console.log("stmt_first=" + sorted[0]);
console.log("stmt_last=" + sorted[sorted.length - 1]);
console.log("stmt_unique=" + unique.size);
console.log("hash_fail_count=" + hashFail);
console.log("decode_fail_count=" + decodeFail);
console.log("hash_verification=" + (hashFail === 0 && decodeFail === 0 ? "PASS" : "FAIL"));
console.log("utf8_mojibake=" + (mojibakeHits.length === 0 ? "PASS" : "FAIL"));
console.log("finalize_literals=" + (literalPass ? "PASS" : "FAIL"));
console.log("finalize_fn_count=" + finalizeFns.length);
console.log("seed_insert=" + (seedInsert ? "PRESENT" : "ABSENT"));
console.log("copy_data=" + (copyData ? "PRESENT" : "ABSENT"));
console.log("classes=" + [...classes.entries()].map(([k, v]) => `${k}:${v}`).join(","));
console.log("profiles_has_shipping_name=" + (profilesHasShippingName ? "YES" : "NO"));
console.log("profiles_has_shipping_phone=" + (profilesHasShippingPhone ? "YES" : "NO"));
console.log("profiles_has_full_name=" + (profilesHasFullName ? "YES" : "NO"));
console.log("profiles_has_phone_number=" + (profilesHasPhoneNumber ? "YES" : "NO"));
console.log("update_user_info_present=" + (updateUserInfo ? "YES" : "NO"));
console.log("update_user_info_absent=" + (updateUserInfo ? "FAIL" : "PASS"));
console.log("update_user_info_refs_shipping_name=" + (updateRefsShippingName ? "YES" : "NO"));
console.log("update_user_info_refs_shipping_phone=" + (updateRefsShippingPhone ? "YES" : "NO"));
console.log("update_user_info_refs_full_name=" + (updateRefsFullName ? "YES" : "NO"));
console.log("update_user_info_refs_phone_number=" + (updateRefsPhoneNumber ? "YES" : "NO"));
console.log("update_user_info_compat=" + (updateCompatPass ? "PASS" : "FAIL"));
console.log("generated_bytes=" + generated.length);
console.log("generated_sha256=" + sha256Hex(generated));

if (notes.length > 0) {
  console.log("NOTES");
  for (const note of notes) console.log("- " + note);
}

if (blockers.length > 0) {
  console.log("BLOCKERS");
  for (const blocker of blockers) console.log("- " + blocker);
  console.log("APPLY_READY=NO");
  process.exit(2);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const header =
  "-- Generated #18C-1E-R2 from metalora-live-public-ddl.csv\n" +
  "-- Payload: ddl_utf8_b64 decoded in stmt_no order. Do not apply to production.\n" +
  "-- Apply only to empty metalora-payment-test after UTF-8/hash verification.\n\n";
const headerBuf = Buffer.from(header, "utf8");
const fileBytes = Buffer.concat([headerBuf, generated]);
fs.writeFileSync(outPath, fileBytes);
console.log("generated_path=" + path.relative(root, outPath).replaceAll("\\", "/"));
console.log("generated_file_sha256=" + sha256Hex(fileBytes));
console.log("APPLY_READY=YES");
