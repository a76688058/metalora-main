/** Known production Supabase project ref / host. Not a secret. */
export const PRODUCTION_SUPABASE_REF = "qifloweuwyhvukabgnoa";

export const PRODUCTION_SUPABASE_HOST = `${PRODUCTION_SUPABASE_REF}.supabase.co`;

export const PRODUCTION_SUPABASE_URL = `https://${PRODUCTION_SUPABASE_HOST}`;

export function supabaseHostFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isProductionSupabaseHost(host: string | null | undefined): boolean {
  return host === PRODUCTION_SUPABASE_HOST;
}

export function supabaseRefFromApiHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const match = host.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/);
  return match ? match[1] : null;
}

const DIRECT_DB_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/;
const POOLER_SUFFIX = ".pooler.supabase.com";

function postgresUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed.replace(/^postgres(ql)?:/i, "http:"));
  } catch {
    return null;
  }
}

function strictSupabaseDbHost(hostname: string): "direct" | "pooler" | null {
  const host = hostname.toLowerCase();
  if (!host || host.endsWith(".") || host.startsWith(".") || host.includes("..")) return null;
  if (host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  const labels = host.split(".");
  if (labels.some((label) => !/^[a-z0-9-]+$/.test(label) || label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }
  if (host === "pooler.supabase.com" || host.endsWith(POOLER_SUFFIX)) return "pooler";
  if (DIRECT_DB_HOST.test(host)) return "direct";
  return null;
}

/**
 * Classify a Postgres URI without returning userinfo/password.
 * Direct: db.<ref>.supabase.co with username postgres, port 5432.
 * Session pooler: pooler.supabase.com or *.pooler.supabase.com with username postgres.<ref>, port 5432.
 * The hostname is the parsed URL hostname. A project ref is never taken from a lookalike host.
 */
export function classifyPostgresConnection(raw: string): {
  parseable: boolean;
  host: string | null;
  ref: string | null;
  isProductionRef: boolean;
} {
  const empty = { parseable: false, host: null, ref: null, isProductionRef: false };
  const url = postgresUrl(raw);
  if (!url) return empty;
  const host = url.hostname.toLowerCase();
  if (url.port !== "" && url.port !== "5432") return { ...empty, host };
  const kind = strictSupabaseDbHost(host);
  if (!kind) return { ...empty, host };
  let user = "";
  try {
    user = decodeURIComponent(url.username).toLowerCase();
  } catch {
    return { ...empty, host };
  }
  if (kind === "direct") {
    if (user !== "postgres") return { ...empty, host };
    const ref = host.match(DIRECT_DB_HOST)?.[1] ?? null;
    if (!ref) return { ...empty, host };
    return { parseable: true, host, ref, isProductionRef: ref === PRODUCTION_SUPABASE_REF };
  }
  const ref = user.match(/^postgres\.([a-z0-9]+)$/)?.[1] ?? null;
  if (!ref) return { ...empty, host };
  return { parseable: true, host, ref, isProductionRef: ref === PRODUCTION_SUPABASE_REF };
}

/** Full Dashboard URI only — rejects short placeholders. Never log the raw value. */
export function isUsableSupabaseDbUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 60) return false;
  const classified = classifyPostgresConnection(trimmed);
  return classified.parseable && classified.ref !== null;
}
