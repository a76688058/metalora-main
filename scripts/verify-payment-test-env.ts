/**
 * Static #18C checks. Never prints secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  missingPaymentTestEnv,
  refusePaymentTestProductionHost,
  refuseTossTestToProductionSupabase,
} from "../src/lib/paymentEnvGuard";
import { PRODUCTION_SUPABASE_URL, classifyPostgresConnection, isUsableSupabaseDbUrl } from "../src/lib/supabaseHosts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const tossTestToProd = refuseTossTestToProductionSupabase({
  tossSecretKey: "test_sk_PLACEHOLDER_NOT_A_REAL_SECRET",
  supabaseUrl: PRODUCTION_SUPABASE_URL,
});
assert(tossTestToProd.refuse === true, "Toss TEST + production host must be refused");

const tossTestToIsolated = refuseTossTestToProductionSupabase({
  tossSecretKey: "test_sk_PLACEHOLDER_NOT_A_REAL_SECRET",
  supabaseUrl: "https://example-payment-test.supabase.co",
});
assert(tossTestToIsolated.refuse === false, "Toss TEST + non-production host must be allowed by this guard");

const liveToProd = refuseTossTestToProductionSupabase({
  tossSecretKey: "live_sk_PLACEHOLDER_NOT_A_REAL_SECRET",
  supabaseUrl: PRODUCTION_SUPABASE_URL,
});
assert(liveToProd.refuse === false, "live Toss prefix is not this TEST-cross-write guard");

const paymentTestProd = refusePaymentTestProductionHost({
  metaloraEnv: "payment-test",
  supabaseUrl: PRODUCTION_SUPABASE_URL,
});
assert(paymentTestProd.refuse === true, "payment-test mode + production host must be refused");

const paymentTestEmpty = refusePaymentTestProductionHost({
  metaloraEnv: "payment-test",
  supabaseUrl: "",
});
assert(paymentTestEmpty.refuse === true, "payment-test mode + missing URL must fail closed");

const paymentTestIsolated = refusePaymentTestProductionHost({
  metaloraEnv: "payment-test",
  supabaseUrl: "https://example-payment-test.supabase.co",
});
assert(paymentTestIsolated.refuse === false, "payment-test mode + isolated host must pass host guard");

const defaultModeProd = refusePaymentTestProductionHost({
  metaloraEnv: "",
  supabaseUrl: PRODUCTION_SUPABASE_URL,
});
assert(defaultModeProd.refuse === false, "default mode is not the payment-test host guard");

const missing = missingPaymentTestEnv({});
assert(
  missing.join(",") === "VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,TOSS_SECRET_KEY",
  "payment-test must fail closed when required env names are absent",
);

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
assert(gitignore.includes(".env*"), ".gitignore must ignore .env*");
assert(gitignore.includes("!.env.example"), ".gitignore must keep .env.example tracked");
assert(
  gitignore.includes("!.env.payment-test.example"),
  ".gitignore must keep .env.payment-test.example tracked",
);
assert(
  gitignore.includes("!.env.payment-test.db.example"),
  ".gitignore must keep .env.payment-test.db.example tracked",
);
assert(
  gitignore.includes(".supabase-live-schema.local.sql"),
  ".gitignore must ignore local schema dumps",
);

const serverSrc = fs.readFileSync(path.join(root, "server.ts"), "utf8");
assert(serverSrc.includes("isPaymentTestMode"), "server.ts must detect payment-test mode");
assert(
  serverSrc.includes("assertPaymentTestEnvironment"),
  "server.ts must fail-closed assert payment-test env",
);
assert(
  /const supabaseUrl = isPaymentTestMode/.test(serverSrc),
  "server.ts must not use the production URL fallback in payment-test mode",
);
assert(
  serverSrc.includes("paymentCrossWriteGuard"),
  "server.ts must guard payment prepare/confirm",
);

const clientSrc = fs.readFileSync(path.join(root, "src/lib/supabase.ts"), "utf8");
assert(
  clientSrc.includes("payment-test"),
  "client supabase init must have a payment-test path",
);
assert(
  clientSrc.includes("VITE_SUPABASE_URL"),
  "payment-test client must require VITE_SUPABASE_URL",
);

const examplePath = path.join(root, ".env.payment-test.example");
assert(fs.existsSync(examplePath), ".env.payment-test.example must exist");
const example = fs.readFileSync(examplePath, "utf8");
assert(example.includes("VITE_SUPABASE_URL="), "example must include VITE_SUPABASE_URL");
assert(example.includes("TOSS_SECRET_KEY="), "example must include TOSS_SECRET_KEY");
assert(example.includes("PHONE_IDENTITY_KEY="), "example must include PHONE_IDENTITY_KEY");
assert(example.includes("OTP_PEPPER="), "example must include OTP_PEPPER");
assert(example.includes("SMS_ADAPTER="), "example must include SMS_ADAPTER");
assert(!/test_sk_[A-Za-z0-9]{8,}/.test(example), "example must not contain a Toss secret value");
assert(!/eyJ[A-Za-z0-9_-]+\./.test(example), "example must not contain a JWT");
assert(!/[0-9a-f]{64}/.test(example), "example must not contain a 64-char hex secret");

const dbExamplePath = path.join(root, ".env.payment-test.db.example");
assert(fs.existsSync(dbExamplePath), ".env.payment-test.db.example must exist");
const dbExample = fs.readFileSync(dbExamplePath, "utf8");
assert(dbExample.includes("LIVE_DB_URL="), "db example must include LIVE_DB_URL");
assert(dbExample.includes("PAYMENT_TEST_DB_URL="), "db example must include PAYMENT_TEST_DB_URL");
assert(!/postgres(?:ql)?:\/\/[^\s]+/.test(dbExample), "db example must not contain a Postgres URI value");

const livePg = classifyPostgresConnection(
  "postgresql://postgres.qifloweuwyhvukabgnoa:placeholder@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres",
);
assert(livePg.parseable && livePg.isProductionRef, "pooler URI with production ref must classify as production");

const testPg = classifyPostgresConnection(
  "postgresql://postgres:placeholder@db.exampletestproj.supabase.co:5432/postgres",
);
assert(testPg.parseable && !testPg.isProductionRef, "direct URI with non-production ref must not classify as production");

const prodDirect = classifyPostgresConnection(
  "postgresql://postgres:placeholder@db.qifloweuwyhvukabgnoa.supabase.co:5432/postgres",
);
assert(prodDirect.parseable && prodDirect.isProductionRef, "direct URI with production ref must classify as production");

assert(
  isUsableSupabaseDbUrl("postgresql://postgres:placeholder@db.qifloweuwyhvukabgnoa.supabase.co:5432/postgres"),
  "full supabase URI must be usable",
);
assert(
  !isUsableSupabaseDbUrl("postgresql://USER:PASSWORD@HOST"),
  "short placeholder URI must be rejected",
);

if (failures.length > 0) {
  console.error("verify-payment-test-env FAIL:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("verify-payment-test-env PASS (no secret values printed)");
