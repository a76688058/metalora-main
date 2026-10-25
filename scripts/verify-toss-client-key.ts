/**
 * Offline Toss client-key separation checks. No network and no secret values.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { resolveTossClientKey } from "../src/lib/tossClientKey";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

const testKey = "test_ck_unitkey";
const liveKey = "live_ck_unitkey";

function failureReason(raw: string | null | undefined, purpose: "production-checkout" | "payment-test" | "screening"): string {
  const decision = resolveTossClientKey({ purpose, raw });
  if ("reason" in decision) return decision.reason;
  return "ok";
}

assert(failureReason(undefined, "production-checkout") === "absent", "missing production key fails closed");
assert(failureReason("   ", "production-checkout") === "absent", "blank production key is absent");
assert(failureReason(testKey, "production-checkout") === "test_key_refused", "production checkout refuses a test client key");
assert(resolveTossClientKey({ purpose: "production-checkout", raw: liveKey }).ok === true, "production checkout accepts a live client prefix");
assert(failureReason(liveKey, "payment-test") === "live_key_refused", "payment-test refuses a live client key");
assert(resolveTossClientKey({ purpose: "payment-test", raw: testKey }).ok === true, "payment-test accepts a test client prefix");
assert(failureReason(liveKey, "screening") === "live_key_refused", "screening refuses a live client key");
assert(failureReason(undefined, "screening") === "absent", "screening does not invent a test key");
assert(failureReason("test_ck_bad live_ck_hidden", "payment-test") !== "ok", "mixed key material is refused");
assert(failureReason("live_ck_bad test_sk_hidden", "production-checkout") === "test_key_refused", "production checkout refuses test secret material");

const cartSrc = fs.readFileSync(path.join(root, "src/components/Cart.tsx"), "utf8");
assert(!/test_ck_[A-Za-z0-9]+/.test(cartSrc), "Cart.tsx must not contain a test client key literal");
assert(!/live_ck_[A-Za-z0-9]+/.test(cartSrc), "Cart.tsx must not contain a live client key literal");
assert(!cartSrc.includes("|| import.meta.env.VITE_TOSS_TEST_CLIENT_KEY"), "production checkout must not fall back to the test client key");
assert(cartSrc.includes("PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7") , "cart must still consult the freeze");

const freezeSrc = fs.readFileSync(path.join(root, "src/lib/publicPaymentFreeze.ts"), "utf8");
assert(freezeSrc.includes("PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true"), "freeze source must stay true");
const screeningSrc = fs.readFileSync(path.join(root, "src/lib/cardScreeningTest.ts"), "utf8");
assert(screeningSrc.includes("CARD_SCREENING_TEST_ENABLED = false"), "screening source must stay false");
assert(screeningSrc.includes("assertTossTestClientKey"), "screening helper must still reject a non-test key");

const docker = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
assert(docker.startsWith("# syntax=docker/dockerfile:1.4"), "Dockerfile must select syntax 1.4, which supports secret mounts");
assert(
  docker.includes("RUN --mount=type=secret,id=toss_live_client_key,required=false"),
  "Vite build must mount the optional BuildKit secret",
);
assert(docker.includes("scripts/docker-vite-live-client-key.mjs"), "Vite build must validate the secret before use");
assert(docker.includes("npm run build"), "production client bundle must still come from vite build");
assert(!/^ARG /m.test(docker), "Dockerfile must not take the client key as a build arg");
assert(!/^ENV .*(VITE_TOSS_|TOSS_SECRET_KEY)/m.test(docker), "Dockerfile must not persist a Toss key as image ENV");
assert(!docker.includes("VITE_TOSS_TEST_CLIENT_KEY"), "production image build must not read the test client key");
assert(!docker.includes("TOSS_SECRET_KEY"), "production image build must not read the private Toss secret");
assert(!/live_ck_[A-Za-z0-9]{8,}/.test(docker), "Dockerfile must not hard-code a live client key");
assert(!/test_ck_[A-Za-z0-9]{8,}/.test(docker), "Dockerfile must not hard-code a test client key");

const activation = fs.readFileSync(path.join(root, "scripts/build-toss-live-activation-image.ps1"), "utf8");
assert(activation.includes("Read-Host -AsSecureString"), "activation script must mask the client key");
assert(activation.includes('^live_ck_[A-Za-z0-9]+$'), "activation script must validate the live client prefix");
assert(activation.includes("test_(ck|sk|gsk)|live_(sk|gsk)"), "activation script must reject test keys and private secret prefixes");
assert(activation.includes('id=toss_live_client_key'), "activation script must pass a BuildKit secret id");
assert(activation.includes("--secret"), "activation script must use a BuildKit secret mount");
assert(!activation.includes("--build-arg"), "activation script must not pass the key as a Docker build arg");
assert(/finally\s*\{[\s\S]*Remove-Item\s+-LiteralPath\s+\$temp\s+-Force/.test(activation), "activation script must delete the temporary file in finally");
assert(/finally\s*\{[\s\S]*Remove-Item\s+-LiteralPath\s+\$work\s+-Recurse\s+-Force/.test(activation), "activation script must delete the temporary build context in finally");
const finallyAt = activation.search(/finally\s*\{/);
const finallyBody = finallyAt >= 0 ? activation.slice(finallyAt) : "";
const resetAt = finallyBody.indexOf("icacls $temp /reset");
const deleteTempAt = finallyBody.search(/Remove-Item\s+-LiteralPath\s+\$temp\s+-Force/);
assert(resetAt >= 0 && deleteTempAt > resetAt, "finally must reset the temporary key ACL before deleting it");
assert(activation.includes("$activationError = $_"), "original activation error must be preserved");
assert(activation.includes("throw $activationError"), "original activation error must be rethrown after cleanup");
assert(
  activation.includes("Temporary activation files could not be removed."),
  "cleanup failure must be reported without the key",
);
assert(activation.includes("temporary freeze assignment was not unique"), "activation script must fail closed when the freeze declaration is ambiguous");
assert(activation.includes('PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = false'), "activation context must disable the freeze");
assert(activation.includes("repository freeze file changed"), "activation script must detect a change to the repository freeze file");
assert(activation.includes("activation context must stay outside the repository"), "activation context must be outside the repository");
const dockerAt = activation.indexOf("& docker build");
const dockerCmd = dockerAt >= 0 ? activation.slice(dockerAt, activation.indexOf("if ($LASTEXITCODE", dockerAt)) : "";
assert(dockerCmd.includes("\n        $context") || dockerCmd.includes("\r\n        $context"), "docker build context must be the temporary activation directory");
assert(!dockerCmd.includes("$repoRoot"), "docker build must not use the repository root as its context");
assert(activation.includes('[System.IO.Path]::GetTempPath()'), "temporary key file must be outside the repository");
assert(activation.includes("icacls"), "temporary key file must receive a restrictive ACL");
assert(activation.includes('Type PUSH'), "image push must require explicit confirmation");
assert(!activation.includes("gcloud"), "activation script must not deploy through gcloud");
assert(!activation.includes("run deploy") && !activation.includes("update-traffic"), "activation script must not change Cloud Run");
assert(
  activation.includes("us-west1-docker.pkg.dev/metalora-auth/cloud-run-source-deploy/metalora-direct:"),
  "activation image must use the existing Artifact Registry name",
);
assert(!/live_ck_[A-Za-z0-9]{8,}/.test(activation), "activation script must not hard-code a live client key");

function assertRestrictiveAclCanBeCleared(): void {
  if (process.platform !== "win32") {
    failures.push("temporary key ACL cleanup was not executed because this verifier is not running on Windows");
    return;
  }
  const probe = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
$ErrorActionPreference = 'Stop'
$dir = Join-Path ([System.IO.Path]::GetTempPath()) ('metalora-acl-probe-' + [guid]::NewGuid().ToString('n'))
$file = Join-Path $dir 'probe.key'
$original = $null
try {
  New-Item -ItemType Directory -Path $dir | Out-Null
  [System.IO.File]::WriteAllText($file, 'probe')
  $account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $file /inheritance:r "/grant:r" "\${account}:(R)" *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 2 }
  try { Remove-Item -LiteralPath $file -Force -ErrorAction Stop } catch { }
  if (-not (Test-Path -LiteralPath $file)) { exit 3 }
  try { throw 'original-failure' } catch { $original = $_ }
} finally {
  try {
    if (Test-Path -LiteralPath $file) {
      & icacls $file /reset *>&1 | Out-Null
      Remove-Item -LiteralPath $file -Force
    }
    if (Test-Path -LiteralPath $dir) {
      Remove-Item -LiteralPath $dir -Recurse -Force
    }
  } catch { exit 4 }
}
if (Test-Path -LiteralPath $file) { exit 5 }
if (Test-Path -LiteralPath $dir) { exit 6 }
if ($null -eq $original -or $original.Exception.Message -ne 'original-failure') { exit 7 }
exit 0
`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (probe.status !== 0) {
    failures.push(`temporary key ACL reset did not allow deletion (exit ${probe.status ?? "none"})`);
  }
}
if (process.env.METALORA_ACTIVATION_CHILD !== "1") {
  assertRestrictiveAclCanBeCleared();
}

const deploy = fs.readFileSync(path.join(root, "scripts/deploy-candidate.ps1"), "utf8");
assert(deploy.includes('builds", "submit"'), "candidate deploy must still build the image from the repository");
assert(!deploy.includes("VITE_TOSS_"), "deploy script must not inject a Vite client key");
assert(!deploy.includes("toss_live_client_key"), "deploy script must not receive the activation secret");
assert(!deploy.includes("--secret"), "deploy script must not mount a BuildKit secret");
assert(deploy.includes("--update-env-vars=DEPLOY_SHA=$fullSha"), "Cloud Run env update remains DEPLOY_SHA only");
assert(
  deploy.includes("us-west1-docker.pkg.dev/metalora-auth/cloud-run-source-deploy/metalora-direct"),
  "candidate deploy keeps the existing image name",
);

const example = fs.readFileSync(path.join(root, ".env.payment-test.example"), "utf8");
assert(example.includes("VITE_TOSS_TEST_CLIENT_KEY="), "payment-test example must name the test client key");
assert(!example.includes("VITE_TOSS_LIVE_CLIENT_KEY"), "payment-test example must not name the live client key");
assert(!/live_ck_[A-Za-z0-9]+/.test(example), "payment-test example must not contain a live client key");
assert(!/test_ck_[A-Za-z0-9]{8,}/.test(example), "payment-test example must not contain a client key value");

const srcText = [
  "src/lib/tossClientKey.ts",
  "src/components/Cart.tsx",
  "src/lib/publicPaymentFreeze.ts",
  "src/lib/cardScreeningTest.ts",
].map((relative) => fs.readFileSync(path.join(root, relative), "utf8")).join("\n");
assert(!/live_ck_[A-Za-z0-9]{8,}/.test(srcText), "changed payment source must not hard-code a live client key");

const helper = path.join(root, "scripts/docker-vite-live-client-key.mjs");
const fakeLive = "live_ck_offlinevalidation";
const fakeTest = "test_ck_offlinevalidation";
const helperDir = fs.mkdtempSync(path.join(os.tmpdir(), "metalora-toss-secret-"));

function sanitize(text: string): string {
  return text
    .replace(/live_ck_[A-Za-z0-9]+/g, "live_ck_[redacted]")
    .replace(/test_(ck|sk|gsk)_[A-Za-z0-9]+/g, "test_[redacted]")
    .replace(/live_(sk|gsk)_[A-Za-z0-9]+/g, "live_secret_[redacted]")
    .slice(0, 400);
}

function runHelper(secretPath: string, envPath: string) {
  return spawnSync(process.execPath, ["--import", "tsx", helper, secretPath, envPath], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
}

try {
  const missingSecret = path.join(helperDir, "missing.key");
  const missingEnv = path.join(helperDir, "missing.env");
  const missing = runHelper(missingSecret, missingEnv);
  assert(missing.status === 0 && !fs.existsSync(missingEnv), "a missing secret keeps the Vite build keyless");

  const emptySecret = path.join(helperDir, "empty.key");
  const emptyEnv = path.join(helperDir, "empty.env");
  fs.writeFileSync(emptySecret, "   \n");
  const empty = runHelper(emptySecret, emptyEnv);
  assert(empty.status === 1 && !fs.existsSync(emptyEnv), "a blank LIVE key fails closed");

  const testSecret = path.join(helperDir, "test.key");
  const testEnv = path.join(helperDir, "test.env");
  fs.writeFileSync(testSecret, fakeTest);
  const testResult = runHelper(testSecret, testEnv);
  assert(testResult.status === 1 && !fs.existsSync(testEnv), "a TEST client key is rejected for the production build");

  const secretShaped = path.join(helperDir, "secret.key");
  const secretEnv = path.join(helperDir, "secret.env");
  fs.writeFileSync(secretShaped, "live_sk_offlinevalidation");
  const secretResult = runHelper(secretShaped, secretEnv);
  assert(secretResult.status === 1 && !fs.existsSync(secretEnv), "a private Toss secret prefix is rejected");

  const liveSecret = path.join(helperDir, "live.key");
  const liveEnv = path.join(helperDir, "live.env");
  fs.writeFileSync(liveSecret, fakeLive);
  const liveResult = runHelper(liveSecret, liveEnv);
  const liveEnvText = fs.existsSync(liveEnv) ? fs.readFileSync(liveEnv, "utf8") : "";
  assert(
    liveResult.status === 0 && liveEnvText === `VITE_TOSS_LIVE_CLIENT_KEY=${fakeLive}\n`,
    "a valid public LIVE client key is exported only as the Vite variable",
  );
  for (const result of [missing, empty, testResult, secretResult, liveResult]) {
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert(!combined.includes(fakeLive) && !combined.includes(fakeTest) && !combined.includes("live_sk_"), "helper output must not print key material");
  }
} finally {
  fs.rmSync(helperDir, { recursive: true, force: true });
}

const envNames = ["VITE_TOSS_LIVE_CLIENT_KEY", "VITE_TOSS_TEST_CLIENT_KEY", "TOSS_SECRET_KEY"] as const;
const distDir = path.join(root, "dist");
const distStamp = fs.existsSync(distDir) ? fs.statSync(distDir).mtimeMs : null;
let frozenBundleStatus: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";
let activationIncludeStatus: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";
let activationForbiddenStatus: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";

type BundleCheck = {
  text: string;
  liveEnvIsSuppliedKey: boolean;
  cartInlinedSuppliedKey: boolean;
  cartStillNamesEnv: boolean;
};

async function clientBundle(env: Partial<Record<(typeof envNames)[number], string>>): Promise<BundleCheck> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "metalora-toss-bundle-"));
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "metalora-toss-envdir-"));
  assert(!outDir.startsWith(root), "validation bundle must stay outside the repository");
  const saved = new Map(envNames.map((name) => [name, process.env[name]]));
  const observed: BundleCheck = {
    text: "",
    liveEnvIsSuppliedKey: false,
    cartInlinedSuppliedKey: false,
    cartStillNamesEnv: false,
  };
  try {
    for (const name of envNames) {
      const value = env[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await build({
      root,
      configFile: path.join(root, "vite.config.ts"),
      envDir,
      mode: "production",
      logLevel: "silent",
      plugins: [
        {
          name: "toss-client-key-observation",
          enforce: "post",
          configResolved(config) {
            observed.liveEnvIsSuppliedKey = config.env.VITE_TOSS_LIVE_CLIENT_KEY === fakeLive;
          },
          transform(code, id) {
            if (id.replaceAll("\\", "/").endsWith("/src/components/Cart.tsx")) {
              observed.cartInlinedSuppliedKey = code.includes(fakeLive);
              observed.cartStillNamesEnv = code.includes("import.meta.env.VITE_TOSS_LIVE_CLIENT_KEY");
            }
          },
        },
      ],
      build: {
        outDir,
        emptyOutDir: true,
        reportCompressedSize: false,
      },
    });
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(outDir);
    observed.text = files
      .filter((file) => /\.(?:js|css|html|json|mjs|cjs)$/.test(file))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    return observed;
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(envDir, { recursive: true, force: true });
  }
}

function copyProject(destination: string) {
  fs.cpSync(root, destination, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      if (parts[0] === ".git" || parts[0] === "dist" || parts[0] === "node_modules" || parts[0] === "coverage") {
        return false;
      }
      if (parts[0] === "docs" && parts[1] === "evidence") return false;
      if (parts[0] === "supabase" && parts[1] === ".temp") return false;
      const base = parts[parts.length - 1];
      if (base === ".env" || base.startsWith(".env")) return false;
      if (base.endsWith(".pem") || base.endsWith(".key") || base === "credentials.json") return false;
      return true;
    },
  });
}

async function activationBundle(): Promise<{ jsCount: number; includesLive: boolean; forbiddenAbsent: boolean }> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "metalora-activation-"));
  const project = path.join(work, "project");
  const emptyEnvDir = path.join(work, "envdir");
  const secretPath = path.join(work, "client-key.txt");
  const envPath = path.join(work, "vite-live.env");
  const outDir = path.join(work, "activation-client");
  const saved = new Map(envNames.map((name) => [name, process.env[name]]));
  let junction: string | null = null;
  const outsideRepo = path.relative(root, work).startsWith("..");
  if (!outsideRepo) throw new Error("activation workspace was created inside the repository");
  try {
    fs.mkdirSync(emptyEnvDir);
    copyProject(project);
    const modulesLink = path.join(project, "node_modules");
    fs.symlinkSync(path.join(root, "node_modules"), modulesLink, "junction");
    junction = modulesLink;
    if (!fs.existsSync(path.join(modulesLink, "vite", "package.json"))) {
      throw new Error("temporary project could not reuse the local Vite installation");
    }

    const freezeCopy = path.join(project, "src", "lib", "publicPaymentFreeze.ts");
    const realFreeze = fs.realpathSync(path.join(root, "src", "lib", "publicPaymentFreeze.ts"));
    if (fs.realpathSync(freezeCopy) === realFreeze) {
      throw new Error("temporary freeze file resolved to the repository file");
    }
    const freezeText = fs.readFileSync(freezeCopy, "utf8");
    const assignment = "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true";
    if (freezeText.split(assignment).length !== 2) {
      throw new Error("temporary freeze assignment was not unique");
    }
    fs.writeFileSync(freezeCopy, freezeText.replace(assignment, "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = false"));
    if (fs.readFileSync(realFreeze, "utf8") !== freezeSrc) {
      throw new Error("repository freeze file changed while preparing the temporary copy");
    }

    fs.writeFileSync(secretPath, fakeLive, { mode: 0o600 });
    const helperResult = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(project, "scripts", "docker-vite-live-client-key.mjs"), secretPath, envPath],
      { cwd: project, encoding: "utf8", windowsHide: true },
    );
    if (helperResult.status !== 0 || !fs.existsSync(envPath)) {
      throw new Error(`activation key helper failed: ${sanitize(`${helperResult.stdout ?? ""}\n${helperResult.stderr ?? ""}`)}`);
    }
    const exported = fs.readFileSync(envPath, "utf8").trim();
    const prefix = "VITE_TOSS_LIVE_CLIENT_KEY=";
    if (!exported.startsWith(prefix) || exported.slice(prefix.length) !== fakeLive) {
      throw new Error("activation helper did not export the supplied public client key");
    }
    fs.rmSync(secretPath, { force: true });
    fs.rmSync(envPath, { force: true });

    for (const name of envNames) delete process.env[name];
    process.env.VITE_TOSS_LIVE_CLIENT_KEY = exported.slice(prefix.length);
    await build({
      root: project,
      configFile: path.join(project, "vite.config.ts"),
      envDir: emptyEnvDir,
      mode: "production",
      logLevel: "silent",
      build: {
        outDir,
        emptyOutDir: true,
        reportCompressedSize: false,
      },
    });

    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js")) files.push(full);
      }
    };
    walk(outDir);
    const text = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    const liveMatches = text.match(/live_ck_[A-Za-z0-9]+/g) ?? [];
    const testMatches = text.match(/test_ck_[A-Za-z0-9]+/g) ?? [];
    const privatePresent = /live_sk_|test_sk_|live_gsk_|test_gsk_/.test(text);
    return {
      jsCount: files.length,
      includesLive: liveMatches.length > 0 && liveMatches.every((match) => match === fakeLive),
      forbiddenAbsent: testMatches.length === 0 && !privatePresent && !text.includes(fakeTest),
    };
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (junction && fs.existsSync(junction)) {
      const stat = fs.lstatSync(junction);
      if (!stat.isSymbolicLink()) {
        throw new Error("temporary node_modules link was not a junction; cleanup stopped");
      }
      fs.unlinkSync(junction);
    }
    if (!fs.existsSync(path.join(root, "node_modules", "vite", "package.json"))) {
      throw new Error("local node_modules was removed during activation cleanup");
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function runActivationChild(): { jsCount: number; includesLive: boolean; forbiddenAbsent: boolean } {
  const child = spawnSync(
    process.execPath,
    ["--max-old-space-size=4096", "--import", "tsx", fileURLToPath(import.meta.url)],
    {
      cwd: root,
      env: { ...process.env, METALORA_ACTIVATION_CHILD: "1" },
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const raw = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  const countLine = raw.match(/ACTIVATION_JS_COUNT=(\d+)/);
  const includeLine = raw.match(/ACTIVATION_INCLUDES_LIVE=(PASS|FAIL)/);
  const forbiddenLine = raw.match(/ACTIVATION_FORBIDDEN=(PASS|FAIL)/);
  if (!countLine || !includeLine || !forbiddenLine) {
    throw new Error(`activation child did not finish: ${sanitize(raw)}`);
  }
  return {
    jsCount: Number(countLine[1]),
    includesLive: includeLine[1] === "PASS",
    forbiddenAbsent: forbiddenLine[1] === "PASS",
  };
}

if (process.env.METALORA_ACTIVATION_CHILD === "1") {
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${sanitize(failure)}`);
    process.exit(1);
  }
  try {
    const activation = await activationBundle();
    console.log(`ACTIVATION_JS_COUNT=${activation.jsCount}`);
    console.log(`ACTIVATION_INCLUDES_LIVE=${activation.includesLive ? "PASS" : "FAIL"}`);
    console.log(`ACTIVATION_FORBIDDEN=${activation.forbiddenAbsent ? "PASS" : "FAIL"}`);
    process.exit(activation.jsCount > 0 && activation.includesLive && activation.forbiddenAbsent ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${sanitize(message)}`);
    process.exit(1);
  }
}

if (failures.length === 0) {
  try {
    const withLive = await clientBundle({ VITE_TOSS_LIVE_CLIENT_KEY: fakeLive });
    assert(withLive.liveEnvIsSuppliedKey, "Vite build receives the supplied public LIVE client key");
    assert(withLive.cartInlinedSuppliedKey, "Vite inlines the public LIVE client key into Cart");
    assert(!withLive.cartStillNamesEnv, "Vite replaces the LIVE client-key env reference");
    assert(!withLive.text.includes("test_ck_"), "LIVE bundle must not contain a test client key");
    assert(!/live_sk_|test_sk_|live_gsk_|test_gsk_/.test(withLive.text), "LIVE bundle must not contain a private Toss secret");
    if (freezeSrc.includes("PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true")) {
      const frozenOmits = !withLive.text.includes(fakeLive);
      assert(frozenOmits, "frozen production bundle removes the unreachable Toss client key");
      frozenBundleStatus = frozenOmits ? "PASS" : "FAIL";
    } else {
      assert(withLive.text.includes(fakeLive), "production bundle keeps the public LIVE client key when checkout can reach Toss");
      frozenBundleStatus = "FAIL";
    }

    const keyless = await clientBundle({});
    assert(!keyless.liveEnvIsSuppliedKey, "keyless build does not receive a LIVE client key");
    assert(!keyless.cartInlinedSuppliedKey, "keyless build does not inline a LIVE client key");
    assert(!keyless.text.includes("live_ck_") && !keyless.text.includes("test_ck_"), "keyless bundle must not contain a Toss client key");
    assert(!/live_sk_|test_sk_|live_gsk_|test_gsk_/.test(keyless.text), "keyless bundle must not contain a private Toss secret");
    const activation = runActivationChild();
    activationIncludeStatus = activation.includesLive ? "PASS" : "FAIL";
    activationForbiddenStatus = activation.forbiddenAbsent ? "PASS" : "FAIL";
    assert(activation.jsCount > 0, "activation build produced no JavaScript bundle");
    assert(activation.includesLive, "activation bundle did not contain the supplied public client key");
    assert(activation.forbiddenAbsent, "activation bundle contained a test or private key sentinel");
    assert(
      fs.readFileSync(path.join(root, "src/lib/publicPaymentFreeze.ts"), "utf8") === freezeSrc,
      "repository freeze file changed during the activation simulation",
    );
    if (distStamp !== null) {
      assert(fs.statSync(distDir).mtimeMs === distStamp, "validation must not modify the existing dist directory");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`client bundle validation failed: ${sanitize(message)}`);
  }
}

console.log(`FROZEN_BUNDLE_OMITS_LIVE_KEY=${frozenBundleStatus}`);
console.log(`ACTIVATION_BUNDLE_INCLUDES_LIVE_KEY=${activationIncludeStatus}`);
console.log(`ACTIVATION_BUNDLE_FORBIDDEN_SENTINELS=${activationForbiddenStatus}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${sanitize(failure)}`);
  process.exit(1);
}

console.log("TOSS_CLIENT_KEY_SEPARATION=PASS");
console.log("PRODUCTION_FALLBACK=NONE");
console.log("BUILDKIT_SECRET=OPTIONAL");
console.log("CLOUD_BUILD_INJECTION=ABSENT");
console.log("VITE_INLINE=PASS");
console.log("FROZEN_BUNDLE_KEEPS_LIVE_KEY=NO");
console.log("PAYMENT_FREEZE=TRUE");
console.log("SCREENING=DISABLED");
