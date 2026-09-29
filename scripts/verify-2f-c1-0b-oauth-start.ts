/**
 * C1-0B payment-test OAuth start URLs (Google / Kakao).
 * Does not complete OAuth. Does not print provider secrets.
 * Does not mutate production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_SUPABASE_REF } from "../src/lib/supabaseHosts";

const PAYMENT_TEST_REF = "bvihpoorwriejybixmoc";
const REDIRECT_TO = "http://127.0.0.1:3000/auth/callback";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function summarize(label: string, url: string | undefined, error: { status?: number; message?: string } | null): void {
  if (error) {
    console.log(`${label}_error status=${error.status ?? ""} message=${error.message ?? ""}`);
    return;
  }
  if (!url) {
    console.log(`${label}_url=ABSENT`);
    return;
  }
  const parsed = new URL(url);
  console.log(`${label}_url_host=${parsed.host}`);
  console.log(`${label}_url_path=${parsed.pathname}`);
  console.log(`${label}_url=${url}`);
}

async function main(): Promise<void> {
  const env = parseEnvFileRaw(path.join(root, ".env.payment-test.local"));
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!supabaseUrl.includes(PAYMENT_TEST_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error("VITE_SUPABASE_URL is not payment-test");
  }
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const google = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
  });
  const kakao = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
  });
  summarize("google", google.data.url, google.error);
  summarize("kakao", kakao.data.url, kakao.error);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "oauth start failed");
  process.exit(1);
});
