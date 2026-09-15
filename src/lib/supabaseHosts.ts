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

/**
 * Classify a Postgres URI without returning userinfo/password.
 * Direct: db.<ref>.supabase.co — Pooler: user postgres.<ref> @ *.pooler.supabase.com
 */
export function classifyPostgresConnection(raw: string): {
  parseable: boolean;
  host: string | null;
  ref: string | null;
  isProductionRef: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { parseable: false, host: null, ref: null, isProductionRef: false };
  }

  try {
    const normalized = trimmed.replace(/^postgres(ql)?:/i, "http:");
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const user = decodeURIComponent(url.username);

    const hostRef = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    const userRef = user.match(/^postgres\.([a-z0-9]+)$/);
    const ref = hostRef?.[1] ?? userRef?.[1] ?? null;

    return {
      parseable: true,
      host,
      ref,
      isProductionRef: ref === PRODUCTION_SUPABASE_REF,
    };
  } catch {
    const lower = trimmed.toLowerCase();
    const hostMatch = lower.match(/db\.([a-z0-9]+)\.supabase\.co/);
    const userMatch = lower.match(/postgres\.([a-z0-9]+)[:@]/);
    const ref = hostMatch?.[1] ?? userMatch?.[1] ?? null;
    const host = hostMatch
      ? `db.${hostMatch[1]}.supabase.co`
      : lower.includes("pooler.supabase.com")
        ? "pooler.supabase.com"
        : null;
    return {
      parseable: false,
      host,
      ref,
      isProductionRef: ref === PRODUCTION_SUPABASE_REF,
    };
  }
}

/** Full Dashboard URI only — rejects short placeholders. Never log the raw value. */
export function isUsableSupabaseDbUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 60) return false;
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  return lower.includes("supabase.co") || lower.includes("pooler.supabase.com");
}
