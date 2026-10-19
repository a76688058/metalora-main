/**
 * NEW2 P0.5 — Docker runner must contain server.ts's local src/lib runtime graph.
 * Structural only. Does not deploy, migrate, or print secrets.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type TestResult = { name: string; pass: boolean };
const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail = ""): void {
  results.push({ name, pass: condition });
  const suffix = !condition && detail ? ` — ${detail}` : "";
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}${suffix}`);
}

function localSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:from|import)\s*['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    specs.push(match[1]);
  }
  return specs;
}

function resolveLocal(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function collectRuntimeGraph(entryRel: string): string[] {
  const entry = path.join(root, entryRel);
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const source = fs.readFileSync(current, "utf8");
    for (const spec of localSpecifiers(source)) {
      const resolved = resolveLocal(current, spec);
      if (!resolved) {
        throw new Error(`unresolved local import ${spec} from ${path.relative(root, current)}`);
      }
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].map((abs) => path.relative(root, abs).replaceAll("\\", "/")).sort();
}

function runnerStage(dockerfile: string): string {
  const marker = "AS runner";
  const idx = dockerfile.lastIndexOf(marker);
  if (idx < 0) return dockerfile;
  return dockerfile.slice(idx);
}

const graph = collectRuntimeGraph("server.ts");
const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
const runner = runnerStage(dockerfile);
const dockerignore = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");

assert("server.ts runtime graph collected", graph.includes("server.ts") && graph.length > 1);

const authEntries = [
  "src/lib/otpAuthHandlers.ts",
  "src/lib/passwordAuthHandlers.ts",
  "src/lib/socialAuthHandlers.ts",
  "src/lib/smsAdapter.ts",
  "src/lib/solapiSmsAdapter.ts",
  "src/lib/paymentMemberAuth.ts",
  "src/lib/trustedClientIp.ts",
  "src/lib/supabaseHosts.ts",
  "src/lib/paymentEnvGuard.ts",
];
for (const file of authEntries) {
  assert(`graph includes ${file}`, graph.includes(file));
}

const transitive = [
  "src/lib/authIntegrity.ts",
  "src/lib/authRateLimit.ts",
  "src/lib/otpCrypto.ts",
  "src/lib/phoneHmac.ts",
  "src/lib/phoneNormalize.ts",
  "src/lib/accountKind.ts",
  "src/lib/authSecurityEvents.ts",
  "src/lib/memberUsername.ts",
  "src/lib/passwordPolicy.ts",
  "src/lib/internalSocialUsername.ts",
  "src/lib/trustedSocialProviders.ts",
];
for (const file of transitive) {
  assert(`graph includes ${file}`, graph.includes(file));
}

const allowedOutsideLib = ["src/types/reviews.ts"];
const nested = graph.filter(
  (file) => file !== "server.ts"
    && !/^src\/lib\/[^/]+\.tsx?$/.test(file)
    && !allowedOutsideLib.includes(file),
);
assert(
  "runtime graph stays in src/lib/*.ts plus src/types/reviews.ts",
  nested.length === 0,
  nested.join(", "),
);
assert("graph includes src/types/reviews.ts", graph.includes("src/types/reviews.ts"));

assert(
  "runner copies src/lib/*.ts",
  /COPY\s+src\/lib\/\*\.ts\s+\.\/src\/lib\//.test(runner),
);
assert(
  "runner copies src/types/reviews.ts",
  /COPY\s+src\/types\/reviews\.ts\s+\.\/src\/types\/reviews\.ts/.test(runner),
);
assert(
  "runner no longer copies only two lib files",
  !/COPY\s+src\/lib\/supabaseHosts\.ts\s+src\/lib\/paymentEnvGuard\.ts/.test(runner),
);
assert("runner still copies server.ts", /COPY\s+server\.ts\s+\.\//.test(runner));
assert("runner still uses tsx server.ts", /tsx",\s*"server\.ts"/.test(runner) || /tsx server\.ts/.test(runner));
assert("runner does not copy .env", !/COPY[^\n]*\.env/.test(runner));
assert("dockerignore excludes .env", /^\.env$/m.test(dockerignore));
assert("dockerignore excludes .env.*", /^\.env\.\*$/m.test(dockerignore));
assert(
  "dockerignore does not un-ignore payment-test secrets",
  !dockerignore.includes("!.env.payment-test.local"),
);

const copiedTopLevel = fs
  .readdirSync(path.join(root, "src/lib"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => `src/lib/${entry.name}`);
const missingFromGlob = graph.filter(
  (file) => file !== "server.ts"
    && !copiedTopLevel.includes(file)
    && !allowedOutsideLib.includes(file),
);
assert(
  "src/lib/*.ts glob covers the runtime graph",
  missingFromGlob.length === 0,
  missingFromGlob.join(", "),
);

const libGraph = graph.filter((file) => file.startsWith("src/lib/"));
let importError = "";
try {
  for (const file of libGraph) {
    await import(pathToFileURL(path.join(root, file)).href);
  }
} catch (error) {
  importError = error instanceof Error ? error.message : String(error);
}
assert(
  "runtime import of src/lib graph modules",
  importError === "",
  importError || `${libGraph.length} modules`,
);

const layout = fs.mkdtempSync(path.join(os.tmpdir(), "metalora-runner-"));
try {
  fs.mkdirSync(path.join(layout, "src/lib"), { recursive: true });
  fs.mkdirSync(path.join(layout, "src/types"), { recursive: true });
  fs.copyFileSync(path.join(root, "server.ts"), path.join(layout, "server.ts"));
  fs.copyFileSync(path.join(root, "package.json"), path.join(layout, "package.json"));
  for (const file of copiedTopLevel) {
    fs.copyFileSync(path.join(root, file), path.join(layout, file));
  }
  fs.copyFileSync(
    path.join(root, "src/types/reviews.ts"),
    path.join(layout, "src/types/reviews.ts"),
  );
  fs.symlinkSync(path.join(root, "node_modules"), path.join(layout, "node_modules"), "junction");
  fs.writeFileSync(
    path.join(layout, "src/lib/runnerResolveProbe.ts"),
    [
      "import { reviewRequestBlocked, REVIEW_READ_API_READY, REVIEW_WRITE_API_READY } from \"../types/reviews\";",
      "import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from \"./publicPaymentFreeze\";",
      "import \"./reviewImageRoutes\";",
      "if (REVIEW_READ_API_READY !== false || REVIEW_WRITE_API_READY !== false) throw new Error(\"review flags\");",
      "if (PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 !== true) throw new Error(\"payment freeze\");",
      "if (!reviewRequestBlocked(\"read\") || !reviewRequestBlocked(\"write\")) throw new Error(\"review gate\");",
      "console.log(\"RUNNER_RESOLVE=PASS\");",
    ].join("\n"),
    "utf8",
  );
  const resolved = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/lib/runnerResolveProbe.ts"],
    { cwd: layout, encoding: "utf8", windowsHide: true },
  );
  const resolveOut = `${resolved.stdout ?? ""}\n${resolved.stderr ?? ""}`;
  assert(
    "runner layout resolves extensionless review import",
    resolved.status === 0 && resolveOut.includes("RUNNER_RESOLVE=PASS"),
    resolveOut.slice(0, 500),
  );
} finally {
  fs.rmSync(layout, { recursive: true, force: true });
}

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
