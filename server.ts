import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { PRODUCTION_SUPABASE_URL } from "./src/lib/supabaseHosts";
import {
  PAYMENT_TEST_CROSS_WRITE_ERROR,
  PAYMENT_TEST_ENV_NAME,
  isTossTestSecret,
  missingPaymentTestEnv,
  refusePaymentTestProductionHost,
  refuseTossTestToProductionSupabase,
} from "./src/lib/paymentEnvGuard";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPaymentTestMode =
  process.env.METALORA_ENV === PAYMENT_TEST_ENV_NAME ||
  process.env.npm_lifecycle_event === "dev:payment-test";

if (isPaymentTestMode) {
  process.env.METALORA_ENV = PAYMENT_TEST_ENV_NAME;
  process.env.VITE_METALORA_ENV = PAYMENT_TEST_ENV_NAME;
  const paymentTestEnvPath = path.join(__dirname, ".env.payment-test.local");
  if (!fs.existsSync(paymentTestEnvPath)) {
    throw new Error(
      "Payment-test startup aborted: .env.payment-test.local is missing. Copy .env.payment-test.example and fill TEST values only.",
    );
  }
  const loaded = dotenv.config({ path: paymentTestEnvPath, override: true });
  if (loaded.error) {
    throw new Error(
      "Payment-test startup aborted: .env.payment-test.local could not be loaded. Copy .env.payment-test.example and fill TEST values only.",
    );
  }
} else {
  dotenv.config();
}

/**
 * Payment-test: fail closed if isolated config is missing or still points at production.
 * Logs variable NAMES only — never values.
 */
function assertPaymentTestEnvironment(): void {
  const missing = missingPaymentTestEnv(process.env);
  if (missing.length > 0) {
    throw new Error(
      `Payment-test startup aborted: missing required environment variable(s): ${missing.join(", ")}`,
    );
  }

  const url = (process.env.VITE_SUPABASE_URL ?? "").trim();
  const toss = (process.env.TOSS_SECRET_KEY ?? "").trim();

  if (
    refusePaymentTestProductionHost({
      metaloraEnv: PAYMENT_TEST_ENV_NAME,
      supabaseUrl: url,
    }).refuse
  ) {
    throw new Error(
      "Payment-test startup aborted: VITE_SUPABASE_URL must be the isolated test project, not production.",
    );
  }

  if (!isTossTestSecret(toss)) {
    throw new Error(
      "Payment-test startup aborted: TOSS_SECRET_KEY must be a Toss TEST secret (test_sk_ / test_gsk_).",
    );
  }

  if (
    refuseTossTestToProductionSupabase({
      tossSecretKey: toss,
      supabaseUrl: url,
    }).refuse
  ) {
    throw new Error(
      "Payment-test startup aborted: Toss TEST credentials cannot target production Supabase.",
    );
  }
}

if (isPaymentTestMode) {
  assertPaymentTestEnvironment();
}

// Supabase Configuration — payment-test never falls back to the production URL.
const supabaseUrl = isPaymentTestMode
  ? (process.env.VITE_SUPABASE_URL ?? "").trim()
  : (process.env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL);
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

// Use Service Role Client for secure operations if key is available
const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const supabasePublic = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Production-only: refuse to listen if payment/auth runtime secrets are blank.
 * Logs variable NAMES only — never values.
 */
function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const requiredNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "TOSS_SECRET_KEY",
    "VITE_SUPABASE_ANON_KEY",
  ] as const;

  const missing = requiredNames.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Production startup aborted: missing required environment variable(s): ${missing.join(", ")}`,
    );
  }
}

function paymentCrossWriteGuard(): { status: number; error: string } | null {
  const toss = (process.env.TOSS_SECRET_KEY ?? "").trim();
  if (
    refusePaymentTestProductionHost({
      metaloraEnv: isPaymentTestMode ? PAYMENT_TEST_ENV_NAME : (process.env.METALORA_ENV ?? ""),
      supabaseUrl,
    }).refuse
  ) {
    console.error("[PAYMENT_ENV_GUARD] payment-test mode refused production (or invalid) Supabase host.");
    return { status: 500, error: PAYMENT_TEST_CROSS_WRITE_ERROR };
  }
  if (
    refuseTossTestToProductionSupabase({
      tossSecretKey: toss,
      supabaseUrl,
    }).refuse
  ) {
    console.error("[PAYMENT_ENV_GUARD] Toss TEST credentials cannot write to production Supabase.");
    return { status: 500, error: PAYMENT_TEST_CROSS_WRITE_ERROR };
  }
  return null;
}

const PAYMENT_OPS_FAILURE_MESSAGE = "[PAYMENT_OPS_FAILURE]";
const PAYMENT_OPS_PROVIDER_CODE_RE = /^[A-Z0-9_]{1,64}$/;
const PAYMENT_OPS_ORDER_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

type PaymentOpsEvent =
  | "env_guard"
  | "config_missing"
  | "db_products_lookup"
  | "db_intent_insert"
  | "db_intent_lookup"
  | "db_finalize_rpc"
  | "provider_network"
  | "provider_http_error"
  | "provider_invalid_response"
  | "provider_not_done"
  | "recovery_required"
  | "integrity_amount_mismatch"
  | "integrity_intent_state"
  | "integrity_ownership"
  | "integrity_snapshot"
  | "integrity_provider_mismatch"
  | "internal_unhandled";

type PaymentOpsPhase =
  | "prepare"
  | "confirm"
  | "toss_confirm"
  | "toss_recovery"
  | "finalize";

type PaymentOpsFailureInput = {
  payment_event: PaymentOpsEvent;
  phase: PaymentOpsPhase;
  alert_eligible: boolean;
  request_id: string;
  order_id?: string | null;
  payment_intent_id?: string | null;
  http_status?: number | null;
  provider?: "toss" | null;
  provider_code?: string | null;
  recovery_required?: boolean;
  retryable?: boolean;
};

function newPaymentRequestId(): string {
  return randomUUID();
}

function paymentOpsOrderId(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!PAYMENT_OPS_ORDER_ID_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function paymentOpsProviderCode(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!PAYMENT_OPS_PROVIDER_CODE_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Canonical #20C payment operational failure signal.
 * One JSON line. Bounded fields only — no PII, secrets, bodies, or paymentKey.
 */
function logPaymentOpsFailure(input: PaymentOpsFailureInput): void {
  const payload: Record<string, unknown> = {
    severity: input.alert_eligible ? "ERROR" : "WARNING",
    message: PAYMENT_OPS_FAILURE_MESSAGE,
    ops_domain: "payment",
    payment_event: input.payment_event,
    phase: input.phase,
    alert_eligible: input.alert_eligible,
    request_id: input.request_id,
    recovery_required: input.recovery_required === true,
    retryable: input.retryable === true,
    deploy_sha:
      typeof process.env.DEPLOY_SHA === "string" && process.env.DEPLOY_SHA.trim()
        ? process.env.DEPLOY_SHA.trim()
        : null,
  };

  const orderId = paymentOpsOrderId(input.order_id);
  if (orderId) {
    payload.order_id = orderId;
  }
  const paymentIntentId = paymentOpsOrderId(input.payment_intent_id);
  if (paymentIntentId) {
    payload.payment_intent_id = paymentIntentId;
  }
  if (typeof input.http_status === "number" && Number.isInteger(input.http_status)) {
    payload.http_status = input.http_status;
  }
  if (input.provider === "toss") {
    payload.provider = "toss";
  }
  const providerCode = paymentOpsProviderCode(input.provider_code);
  if (providerCode) {
    payload.provider_code = providerCode;
  }

  console.error(JSON.stringify(payload));
}

/** Authoritative public SEO origin — never derive from request Host / *.run.app */
const CANONICAL_PUBLIC_ORIGIN = "https://metalora.art";
const DEFAULT_OG_IMAGE =
  "https://postfiles.pstatic.net/MjAyNjA0MjNfMjkx/MDAxNzc2OTMwMjQ2MTE5.UFl10atOBM5XVpMDDx2TKIb_0KMZda8VbKvbqrldr20g.xboRY7lXJwS-i6KDuIpCB44DJbbikiOOHXoaOHvjPgcg.PNG/thumbnail.og2.png?type=w966";
const ORG_LOGO_URL = `${CANONICAL_PUBLIC_ORIGIN}/logo/metalora-wordmark.webp`;
const STORAGE_PUBLIC_BASE =
  "https://qifloweuwyhvukabgnoa.supabase.co/storage/v1/object/public";
const PRODUCT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLICY_SITEMAP_PATHS = [
  "/policy/terms",
  "/policy/refund",
  "/policy/privacy",
  "/policy/cookie",
  "/policy/agreement",
] as const;

/**
 * Public SEO origin. BASE_URL is honored only when it is explicitly the apex
 * canonical host; otherwise always https://metalora.art.
 */
function getSeoOrigin(): string {
  const raw = typeof process.env.BASE_URL === "string" ? process.env.BASE_URL.trim() : "";
  if (!raw) return CANONICAL_PUBLIC_ORIGIN;
  try {
    const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
    const url = new URL(normalized);
    if (url.protocol === "https:" && url.hostname === "metalora.art") {
      return CANONICAL_PUBLIC_ORIGIN;
    }
  } catch {
    // ignore invalid BASE_URL
  }
  return CANONICAL_PUBLIC_ORIGIN;
}

function requestHostname(req: express.Request): string {
  const xf = req.headers["x-forwarded-host"];
  const fromXf = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
  const hostHeader = fromXf || (typeof req.headers.host === "string" ? req.headers.host : "");
  return hostHeader.split(":")[0].trim().toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForScript(value: unknown): string {
  // Prevent </script> (and related) breakout from JSON-LD script bodies.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Resolve product image paths the same way the client storefront does. */
function resolvePublicImageUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const cleanPath = trimmed.split("?")[0];
  const encodedPath = cleanPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (cleanPath.includes("workshop/") || cleanPath.includes("products/")) {
    return `${STORAGE_PUBLIC_BASE}/${encodedPath}`;
  }
  return `${STORAGE_PUBLIC_BASE}/products/${encodedPath}`;
}

type SeoPageKind = "home" | "product" | "product_missing" | "static" | "generic";

type SeoPayload = {
  kind: SeoPageKind;
  title: string;
  description: string;
  canonicalPath: string;
  ogType: string;
  ogImage: string;
  robots?: string;
  jsonLd: Record<string, unknown>[];
  rootHtml: string;
  status?: number;
};

function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "METALORA",
    url: getSeoOrigin(),
    logo: ORG_LOGO_URL,
    sameAs: [
      "https://www.instagram.com/metalora_official",
      "https://www.facebook.com/metalora",
    ],
  };
}

function websiteJsonLd(): Record<string, unknown> {
  const origin = getSeoOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "METALORA",
    url: `${origin}/`,
  };
}

function homeSeoPayload(): SeoPayload {
  const title = "메탈로라 | 프리미엄 커스텀 메탈 액자";
  const description =
    "클릭 한 번으로 당신의 소중한 순간을 영원히 빛나는 프리미엄 커스텀 메탈 액자로 만드세요. 변하지 않는 가치, 메탈로라.";
  return {
    kind: "home",
    title,
    description,
    canonicalPath: "/",
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: [organizationJsonLd(), websiteJsonLd()],
    rootHtml: `<main class="seo-shell">
  <div class="seo-shell__hero"></div>
  <div class="seo-shell__content">
    <header>
      <p>METALORA</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </header>
    <section>
      <h2>NOT A POSTER.</h2>
      <h2>ENGINEERED ART.</h2>
      <p>포스터가 아닙니다.<br/>엔지니어링 된 작품입니다.</p>
    </section>
    <section>
      <h2>벽에 상처를 남기지 마세요.</h2>
      <h2>오직 예술만 남기세요.</h2>
    </section>
  </div>
</main>`,
  };
}

type PublicProductRow = {
  id: string;
  title: string;
  description: string | null;
  front_image: string | null;
  options: Array<{
    id?: string;
    name?: string;
    price?: number;
    stock?: number;
    isActive?: boolean;
  }> | null;
};

function productOfferPriceAndAvailability(product: PublicProductRow): {
  price: number | null;
  availability: string;
} {
  const options = Array.isArray(product.options) ? product.options : [];
  const inStock = options.some(
    (opt) => opt && opt.isActive && typeof opt.stock === "number" && opt.stock > 0,
  );
  const priced =
    options.find((opt) => opt && opt.isActive && typeof opt.stock === "number" && opt.stock > 0) ||
    options.find((opt) => opt && typeof opt.price === "number") ||
    options[0];
  const price =
    priced && typeof priced.price === "number" && Number.isFinite(priced.price)
      ? priced.price
      : null;
  return {
    price,
    availability: inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  };
}

function productSeoPayload(product: PublicProductRow): SeoPayload {
  const origin = getSeoOrigin();
  const canonicalPath = `/product/${product.id}`;
  const canonicalUrl = `${origin}${canonicalPath}`;
  const title = `${product.title} | 메탈로라`;
  const description =
    (product.description && product.description.trim()) || product.title;
  const imageUrl = resolvePublicImageUrl(product.front_image) || DEFAULT_OG_IMAGE;
  const { price, availability } = productOfferPriceAndAvailability(product);

  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.title,
    image: [imageUrl],
    description,
    url: canonicalUrl,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "KRW",
      ...(price != null ? { price } : {}),
      availability,
    },
  };

  const breadcrumbLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: product.title,
        item: canonicalUrl,
      },
    ],
  };

  const priceBlock =
    price != null
      ? `<p>₩${escapeHtml(price.toLocaleString("ko-KR"))}</p>`
      : "";
  const availabilityLabel = availability.includes("InStock") ? "구매 가능" : "품절";

  return {
    kind: "product",
    title,
    description,
    canonicalPath,
    ogType: "product",
    ogImage: imageUrl,
    jsonLd: [organizationJsonLd(), productLd, breadcrumbLd],
    rootHtml: `<main class="seo-shell">
  <div class="seo-shell__hero"></div>
  <div class="seo-shell__content">
    <article>
      <h1>${escapeHtml(product.title)}</h1>
      ${priceBlock}
      <p>${escapeHtml(availabilityLabel)}</p>
      <h2>작품 설명</h2>
      <p>${escapeHtml(description)}</p>
    </article>
  </div>
</main>`,
  };
}

function missingProductSeoPayload(productId: string): SeoPayload {
  return {
    kind: "product_missing",
    title: "상품을 찾을 수 없습니다 | 메탈로라",
    description: "요청하신 상품을 찾을 수 없거나 현재 공개되지 않습니다.",
    canonicalPath: `/product/${productId}`,
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    robots: "noindex, nofollow",
    jsonLd: [organizationJsonLd()],
    rootHtml: `<main class="seo-shell">
  <div class="seo-shell__hero"></div>
  <div class="seo-shell__content">
    <h1>상품을 찾을 수 없습니다</h1>
    <p>요청하신 상품을 찾을 수 없거나 현재 공개되지 않습니다.</p>
    <p><a href="/">홈으로 돌아가기</a></p>
  </div>
</main>`,
    status: 404,
  };
}

/** Temporary infra failure — must not signal permanent absence to crawlers. */
function productLookupUnavailableSeoPayload(productId: string): SeoPayload {
  return {
    kind: "generic",
    title: "메탈로라 | 프리미엄 커스텀 메탈 액자",
    description: "상품 정보를 일시적으로 불러올 수 없습니다.",
    canonicalPath: `/product/${productId}`,
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: [organizationJsonLd()],
    rootHtml: `<main class="seo-shell">
  <div class="seo-shell__hero"></div>
  <div class="seo-shell__content">
    <h1>일시적으로 상품 정보를 불러올 수 없습니다</h1>
    <p>잠시 후 다시 시도해 주세요.</p>
    <p><a href="/">홈으로 돌아가기</a></p>
  </div>
</main>`,
    status: 503,
  };
}

/** Known removed dummy public URLs — hard 404, never indexable homepage shells. */
function removedPublicRouteSeoPayload(pathname: string): SeoPayload {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return {
    kind: "generic",
    title: "페이지를 찾을 수 없습니다 | 메탈로라",
    description: "요청하신 페이지를 찾을 수 없습니다.",
    canonicalPath: path,
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    robots: "noindex, nofollow",
    jsonLd: [organizationJsonLd()],
    rootHtml: `<main class="seo-shell">
  <div class="seo-shell__hero"></div>
  <div class="seo-shell__content">
    <h1>페이지를 찾을 수 없습니다</h1>
    <p>요청하신 페이지를 찾을 수 없습니다.</p>
    <p><a href="/">홈으로 돌아가기</a></p>
  </div>
</main>`,
    status: 404,
  };
}

function staticRouteSeoPayload(
  canonicalPath: string,
  title: string,
  description: string,
  rootHtml?: string,
): SeoPayload {
  return {
    kind: "static",
    title,
    description,
    canonicalPath,
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: [organizationJsonLd()],
    rootHtml:
      rootHtml ||
      `<main class="seo-shell">
  <div class="seo-shell__hero"></div>
  <div class="seo-shell__content">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
  </div>
</main>`,
  };
}

function replaceMetaByName(html: string, name: string, content: string): string {
  const re = new RegExp(
    `<meta\\s+name="${name}"\\s+content="[^"]*"\\s*/?>`,
    "gi",
  );
  const tag = `<meta name="${name}" content="${escapeHtml(content)}" />`;
  const stripped = html.replace(re, "");
  return stripped.replace("</head>", `    ${tag}\n  </head>`);
}

function replaceMetaByProperty(html: string, property: string, content: string): string {
  const re = new RegExp(
    `<meta\\s+property="${property}"\\s+content="[^"]*"\\s*/?>`,
    "gi",
  );
  const tag = `<meta property="${property}" content="${escapeHtml(content)}" />`;
  const stripped = html.replace(re, "");
  return stripped.replace("</head>", `    ${tag}\n  </head>`);
}

function replaceRootInnerHtml(html: string, inner: string): string {
  const startMatch = html.match(/<div id="root"(?:\s[^>]*)?>/i);
  if (!startMatch || startMatch.index == null) {
    return html;
  }
  const openTagEnd = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = openTagEnd;
  while (i < html.length && depth > 0) {
    const nextOpen = html.toLowerCase().indexOf("<div", i);
    const nextClose = html.toLowerCase().indexOf("</div>", i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return (
        html.slice(0, startMatch.index) +
        `<div id="root">\n${inner}\n    </div>` +
        html.slice(nextClose + "</div>".length)
      );
    }
    i = nextClose + "</div>".length;
  }
  return html;
}

function applySeoToHtml(template: string, seo: SeoPayload): string {
  const origin = getSeoOrigin();
  const canonicalUrl = `${origin}${seo.canonicalPath === "/" ? "/" : seo.canonicalPath}`;
  let html = template;

  html = html.replace(/<title>[^<]*<\/title>/gi, "");
  html = html.replace("</head>", `    <title>${escapeHtml(seo.title)}</title>\n  </head>`);
  html = replaceMetaByName(html, "description", seo.description);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/gi, "");
  html = html.replace(
    "</head>",
    `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />\n  </head>`,
  );

  html = replaceMetaByProperty(html, "og:title", seo.title);
  html = replaceMetaByProperty(html, "og:description", seo.description);
  html = replaceMetaByProperty(html, "og:image", seo.ogImage);
  html = replaceMetaByProperty(html, "og:url", canonicalUrl);
  html = replaceMetaByProperty(html, "og:type", seo.ogType);

  html = replaceMetaByName(html, "twitter:title", seo.title);
  html = replaceMetaByName(html, "twitter:description", seo.description);
  html = replaceMetaByName(html, "twitter:image", seo.ogImage);

  if (seo.robots) {
    html = replaceMetaByName(html, "robots", seo.robots);
  }

  const jsonLdBlock = seo.jsonLd
    .map(
      (block) =>
        `    <script type="application/ld+json">\n${escapeJsonForScript(block)}\n    </script>`,
    )
    .join("\n");

  // Replace existing JSON-LD script tags with route-specific blocks
  html = html.replace(
    /(?:\s*<!--\s*JSON-LD:[^>]*-->)?\s*<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi,
    "",
  );
  html = html.replace("</head>", `${jsonLdBlock}\n  </head>`);

  html = replaceRootInnerHtml(html, seo.rootHtml);

  return html;
}

type ProductSeoLookup =
  | { status: "found"; product: PublicProductRow }
  | { status: "not_found" }
  | { status: "unavailable" };

/**
 * Public storefront product for SEO only.
 * Visibility filter is mandatory even if service_role client is used as fallback.
 */
async function loadVisibleProductForSeo(
  productId: string,
): Promise<ProductSeoLookup> {
  const client = supabasePublic || supabaseAdmin;
  if (!client) {
    return { status: "unavailable" };
  }

  try {
    const { data, error } = await client
      .from("products")
      .select("id, title, description, front_image, options, is_visible")
      .eq("id", productId)
      .eq("is_visible", true)
      .maybeSingle();

    if (error) {
      console.error("[SEO product lookup] query failed");
      return { status: "unavailable" };
    }
    if (!data) {
      return { status: "not_found" };
    }
    return { status: "found", product: data as PublicProductRow };
  } catch {
    console.error("[SEO product lookup] unexpected failure");
    return { status: "unavailable" };
  }
}

async function resolveSeoForPath(pathname: string): Promise<SeoPayload> {
  if (pathname === "/" || pathname === "") {
    return homeSeoPayload();
  }

  const productMatch = pathname.match(/^\/product\/([^/]+)\/?$/);
  if (productMatch) {
    const productId = decodeURIComponent(productMatch[1]);
    if (!PRODUCT_ID_RE.test(productId)) {
      return missingProductSeoPayload(productId);
    }
    const lookup = await loadVisibleProductForSeo(productId);
    if (lookup.status === "unavailable") {
      return productLookupUnavailableSeoPayload(productId);
    }
    if (lookup.status === "not_found") {
      return missingProductSeoPayload(productId);
    }
    return productSeoPayload(lookup.product);
  }

  const policyMatch = pathname.match(/^\/policy\/([^/]+)\/?$/);
  if (policyMatch) {
    const type = policyMatch[1];
    const allowed = POLICY_SITEMAP_PATHS.map((p) => p.replace("/policy/", ""));
    if (allowed.includes(type)) {
      const titles: Record<string, string> = {
        terms: "이용약관 | 메탈로라",
        refund: "환불정책 | 메탈로라",
        privacy: "개인정보 처리방침 | 메탈로라",
        cookie: "쿠키 정책 | 메탈로라",
        agreement: "제작동의서 | 메탈로라",
      };
      return staticRouteSeoPayload(
        `/policy/${type}`,
        titles[type] || "정책 | 메탈로라",
        "메탈로라 서비스 정책.",
      );
    }
  }

  // Known removed dummy public URLs (#21A-2) — 404 + noindex, not 200 SPA shells
  if (pathname === "/brand-story" || pathname === "/collection") {
    return removedPublicRouteSeoPayload(pathname);
  }

  // Other SPA routes: keep shell bootable, but do not claim homepage canonical
  return {
    kind: "generic",
    title: "메탈로라 | 프리미엄 커스텀 메탈 액자",
    description:
      "클릭 한 번으로 당신의 소중한 순간을 영원히 빛나는 프리미엄 커스텀 메탈 액자로 만드세요. 변하지 않는 가치, 메탈로라.",
    canonicalPath: pathname.startsWith("/") ? pathname : `/${pathname}`,
    ogType: "website",
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: [organizationJsonLd()],
    rootHtml: `<main class="seo-shell"><div class="seo-shell__hero"></div><div class="seo-shell__content"><h1>메탈로라</h1></div></main>`,
  };
}

/** Workshop unit price — authoritative; never trust client custom_config.price */
const SERVER_WORKSHOP_UNIT_PRICE = 49000;

function isWorkshopPendingItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  // Cart workshop: product_id null + option_id null + shaderType marker (all required)
  if (item.product_id != null || item.option_id != null) return false;
  const cfg = item.custom_config;
  if (!cfg || typeof cfg !== 'object') return false;
  return cfg.shaderType === '커스텀 제작';
}

function parsePositiveIntQuantity(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

type ValidatedItemSnapshot = {
  product_id: string | null;
  product_title: string;
  title: string;
  option: string;
  quantity: number;
  price: number;
  image: string | null;
  user_image_url: string | null;
  orientation: string | null;
  custom_config: any | null;
  is_custom: boolean;
};

type CheckoutShipping = {
  name: string;
  phone: string;
  zip_code: string;
  address: string;
  address_detail: string;
};

type PaymentIntentSnapshot = {
  schema_version: 1;
  shipping: CheckoutShipping;
  ordered_items: ReturnType<typeof buildSanitizedOrderedItems>;
  order_items: ReturnType<typeof buildRpcOrderItems>;
  consents?: Record<string, unknown>;
};

type VerifiedPaymentUser = {
  verifiedUserId: string;
  verifiedUserCustomId: string;
};

type CheckoutValidationResult = {
  total: number;
  validatedSnapshots: ValidatedItemSnapshot[];
  sanitizedOrderedItems: ReturnType<typeof buildSanitizedOrderedItems>;
  rpcOrderItems: ReturnType<typeof buildRpcOrderItems>;
};

function trimNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function generatePaymentOrderNumber(): string {
  // Canonical DB/Toss order identity (idempotency key for finalize_paid_order).
  return `ORD-${randomUUID()}`;
}

function buildSanitizedOrderedItems(validatedSnapshots: ValidatedItemSnapshot[]) {
  return validatedSnapshots.map((snap) => ({
    product_id: snap.is_custom ? 'workshop-single' : snap.product_id,
    title: snap.title,
    product_title: snap.product_title,
    option: snap.option,
    quantity: snap.quantity,
    price: snap.price,
    image: snap.image,
    user_image_url: snap.user_image_url,
    front_image: snap.is_custom ? null : snap.image,
    orientation: snap.orientation,
    custom_config: snap.custom_config,
    is_custom: snap.is_custom,
  }));
}

function buildRpcOrderItems(validatedSnapshots: ValidatedItemSnapshot[]) {
  return validatedSnapshots.map((snap) => ({
    product_id: snap.is_custom ? null : snap.product_id,
    product_title: snap.product_title,
    quantity: snap.quantity,
    price: snap.price,
    option: snap.option,
    orientation: snap.orientation || null,
  }));
}

/** GA4-safe purchase line items — no PII, URLs, or raw snapshot blobs. */
type AnalyticsPurchaseItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  price: number;
  quantity: number;
};

function isWorkshopRpcOrderItem(productId: unknown): boolean {
  if (productId == null) return true;
  if (typeof productId !== 'string') return false;
  const trimmed = productId.trim();
  return trimmed === '' || trimmed === 'workshop-single';
}

function buildAnalyticsPurchaseItemsFromSnapshot(
  snapshot: PaymentIntentSnapshot,
): AnalyticsPurchaseItem[] {
  const items: AnalyticsPurchaseItem[] = [];

  for (const rawItem of snapshot.order_items) {
    const item = rawItem as {
      product_id?: string | null;
      product_title?: string;
      quantity?: unknown;
      price?: unknown;
      option?: string;
      orientation?: string | null;
    };

    const quantity = parsePositiveIntQuantity(item.quantity);
    if (quantity === null) {
      continue;
    }

    const unitPrice = typeof item.price === 'number' ? item.price : Number(item.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      continue;
    }

    const item_id = isWorkshopRpcOrderItem(item.product_id)
      ? 'workshop-single'
      : String(item.product_id).trim();

    const item_name = trimNonEmptyString(item.product_title) || '제품';

    const variantParts = [
      trimNonEmptyString(item.option),
      trimNonEmptyString(item.orientation),
    ].filter((part): part is string => Boolean(part));
    const item_variant =
      variantParts.length > 0 ? variantParts.join(' / ') : undefined;

    const analyticsItem: AnalyticsPurchaseItem = {
      item_id,
      item_name,
      price: unitPrice,
      quantity,
    };
    if (item_variant) {
      analyticsItem.item_variant = item_variant;
    }
    items.push(analyticsItem);
  }

  return items;
}

function buildPaymentConfirmSuccessPayload(input: {
  orderUuid: string;
  orderNumber: string;
  amount: number;
  snapshot: PaymentIntentSnapshot;
  alreadyFinalized: boolean;
  message?: string;
}): {
  success: true;
  orderId: string;
  order_number: string;
  amount: number;
  currency: 'KRW';
  already_finalized: boolean;
  items: AnalyticsPurchaseItem[];
  message?: string;
} {
  const payload = {
    success: true as const,
    orderId: input.orderUuid,
    order_number: input.orderNumber,
    amount: input.amount,
    currency: 'KRW' as const,
    already_finalized: input.alreadyFinalized,
    items: buildAnalyticsPurchaseItemsFromSnapshot(input.snapshot),
  };
  if (input.message) {
    return { ...payload, message: input.message };
  }
  return payload;
}

function validateShippingInput(shipping: unknown):
  | { ok: true; shipping: CheckoutShipping }
  | { ok: false; status: number; error: string } {
  if (!shipping || typeof shipping !== 'object') {
    return { ok: false, status: 400, error: '배송 정보를 모두 입력해 주세요.' };
  }

  const input = shipping as Record<string, unknown>;
  const name = trimNonEmptyString(input.name);
  const phone = trimNonEmptyString(input.phone);
  const zip_code = trimNonEmptyString(input.zip_code);
  const address = trimNonEmptyString(input.address);
  const address_detail = trimNonEmptyString(input.address_detail);

  if (!name || !phone || !zip_code || !address || !address_detail) {
    return { ok: false, status: 400, error: '배송 정보를 모두 입력해 주세요.' };
  }

  return { ok: true, shipping: { name, phone, zip_code, address, address_detail } };
}

function parsePaymentIntentSnapshot(raw: unknown):
  | { ok: true; snapshot: PaymentIntentSnapshot }
  | { ok: false; status: number; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 500, error: '주문 정보를 확인할 수 없습니다.' };
  }

  const value = raw as Record<string, unknown>;
  const shippingResult = validateShippingInput(value.shipping);
  if (shippingResult.ok === false) {
    return { ok: false, status: 500, error: '주문 정보를 확인할 수 없습니다.' };
  }

  if (!Array.isArray(value.ordered_items) || value.ordered_items.length === 0) {
    return { ok: false, status: 500, error: '주문 정보를 확인할 수 없습니다.' };
  }

  if (!Array.isArray(value.order_items) || value.order_items.length === 0) {
    return { ok: false, status: 500, error: '주문 정보를 확인할 수 없습니다.' };
  }

  if (value.ordered_items.length !== value.order_items.length) {
    return { ok: false, status: 500, error: '주문 정보를 확인할 수 없습니다.' };
  }

  const snapshot: PaymentIntentSnapshot = {
    schema_version: 1,
    shipping: shippingResult.shipping,
    ordered_items: value.ordered_items,
    order_items: value.order_items,
  };

  if (value.consents != null && typeof value.consents === 'object' && !Array.isArray(value.consents)) {
    snapshot.consents = value.consents as Record<string, unknown>;
  }

  return { ok: true, snapshot };
}

async function verifyPaymentBearer(
  authHeader: string | undefined,
): Promise<
  | { ok: true; user: VerifiedPaymentUser }
  | { ok: false; status: number; error: string }
> {
  if (!supabaseAdmin || !supabasePublic) {
    console.error("[CRITICAL] Supabase is not configured for payment endpoints.");
    return { ok: false, status: 500, error: "서버 구성 오류가 발생했습니다." };
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "인증이 필요합니다." };
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: "인증이 필요합니다." };
  }

  const { data: authData, error: authError } = await supabasePublic.auth.getUser(accessToken);
  if (authError || !authData.user) {
    console.error("[PAYMENT_AUTH_FAIL] Invalid or expired token.");
    return { ok: false, status: 401, error: "인증이 필요합니다." };
  }

  const { data: ownerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('user_custom_id')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !ownerProfile) {
    console.error("[PAYMENT_PROFILE_FAIL] Profile missing for verified user.");
    return { ok: false, status: 400, error: "회원 정보를 확인할 수 없습니다." };
  }

  const verifiedUserCustomId =
    typeof ownerProfile.user_custom_id === 'string' ? ownerProfile.user_custom_id.trim() : '';
  if (!verifiedUserCustomId) {
    console.error("[PAYMENT_PROFILE_FAIL] user_custom_id missing for verified user.");
    return { ok: false, status: 400, error: "회원 정보를 확인할 수 없습니다." };
  }

  return {
    ok: true,
    user: {
      verifiedUserId: authData.user.id,
      verifiedUserCustomId,
    },
  };
}

function getTossBasicAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(secretKey + ":").toString("base64")}`;
}

type TossPaymentObject = {
  paymentKey?: string;
  orderId?: string;
  status?: string;
  totalAmount?: number;
  method?: string;
  mId?: string;
  transactionKey?: string;
  lastTransactionKey?: string;
  [key: string]: unknown;
};

type TossLookupResult =
  | { ok: true; payment: TossPaymentObject }
  | { ok: false; reason: 'not_found' | 'api_error' | 'network' | 'invalid_body' };

/**
 * Toss GET /v1/payments/orders/{orderId} — recover already-approved payments.
 * Does not approve; only looks up existing payment state.
 */
async function lookupTossPaymentByOrderId(
  secretKey: string,
  orderId: string,
): Promise<TossLookupResult> {
  try {
    const encodedOrderId = encodeURIComponent(orderId);
    const response = await fetch(
      `https://api.tosspayments.com/v1/payments/orders/${encodedOrderId}`,
      {
        method: "GET",
        headers: {
          Authorization: getTossBasicAuthHeader(secretKey),
        },
      },
    );

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'invalid_body' };
    }

    if (!response.ok) {
      console.error("[PAYMENT_TOSS_LOOKUP] Non-OK lookup:", {
        orderId,
        status: response.status,
        code: body?.code,
      });
      if (response.status === 404) {
        return { ok: false, reason: 'not_found' };
      }
      return { ok: false, reason: 'api_error' };
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, reason: 'invalid_body' };
    }

    return { ok: true, payment: body as TossPaymentObject };
  } catch (error) {
    console.error("[PAYMENT_TOSS_LOOKUP] Network/lookup failure:", {
      orderId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, reason: 'network' };
  }
}

/**
 * Shared Toss Payment identity checks for both POST confirm and GET recovery.
 * Only status === 'DONE' may proceed to finalize for this site's card flow.
 */
function validateTossDonePayment(
  payment: TossPaymentObject,
  expected: { orderNumber: string; totalPrice: number; paymentKey: string },
): { ok: true } | { ok: false; reason: string } {
  if (payment.status !== 'DONE') {
    return { ok: false, reason: `status_not_done:${String(payment.status ?? 'missing')}` };
  }

  if (typeof payment.orderId !== 'string' || payment.orderId !== expected.orderNumber) {
    return { ok: false, reason: 'order_id_mismatch' };
  }

  const totalAmount = Number(payment.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount !== expected.totalPrice) {
    return { ok: false, reason: 'amount_mismatch' };
  }

  // paymentKey must be present on the Toss Payment and match the redirect key.
  if (typeof payment.paymentKey !== 'string' || payment.paymentKey.length === 0) {
    return { ok: false, reason: 'payment_key_missing' };
  }
  if (payment.paymentKey !== expected.paymentKey) {
    return { ok: false, reason: 'payment_key_mismatch' };
  }

  return { ok: true };
}

async function validateCheckoutItems(
  pendingItems: unknown,
  orderIdForLog: string,
): Promise<
  | { ok: true; checkout: CheckoutValidationResult }
  | { ok: false; status: number; error: string; payment_event?: PaymentOpsEvent }
> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 500,
      error: "서버 구성 오류가 발생했습니다.",
      payment_event: "config_missing",
    };
  }

  if (!Array.isArray(pendingItems) || pendingItems.length === 0) {
    console.error("[PAYMENT_ITEM_FAIL] pendingItems missing or empty:", { orderId: orderIdForLog });
    return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
  }

  const validatedSnapshots: ValidatedItemSnapshot[] = [];
  let serverExpectedTotal = 0;

  const standardProductIds = [
    ...new Set(
      pendingItems
        .filter((item: any) => !isWorkshopPendingItem(item))
        .map((item: any) => (typeof item?.product_id === 'string' ? item.product_id.trim() : ''))
        .filter((id: string) => id && id !== 'workshop-single'),
    ),
  ];

  let productMap = new Map<string, any>();
  if (standardProductIds.length > 0) {
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, title, front_image, is_visible, options')
      .in('id', standardProductIds);

    if (productsError) {
      console.error("[PAYMENT_ITEM_FAIL] Products lookup error:", productsError);
      return {
        ok: false,
        status: 500,
        error: "주문 상품 정보를 확인할 수 없습니다.",
        payment_event: "db_products_lookup",
      };
    }

    productMap = new Map((products || []).map((p: any) => [p.id, p]));
  }

  for (const item of pendingItems) {
    const quantity = parsePositiveIntQuantity(item?.quantity);
    if (quantity === null) {
      console.error("[PAYMENT_ITEM_FAIL] Invalid quantity:", { orderId: orderIdForLog });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }

    if (isWorkshopPendingItem(item)) {
      const unit = SERVER_WORKSHOP_UNIT_PRICE;
      serverExpectedTotal += unit * quantity;
      const customImage =
        (typeof item.user_image_url === 'string' && item.user_image_url) ||
        (typeof item.image === 'string' && item.image) ||
        null;
      const sizeLabel =
        (typeof item.custom_config?.size === 'string' && item.custom_config.size) ||
        (typeof item.option === 'string' && item.option) ||
        '커스텀';
      validatedSnapshots.push({
        product_id: 'workshop-single',
        product_title: '커스텀 포스터',
        title: '커스텀 포스터',
        option: sizeLabel,
        quantity,
        price: unit,
        image: customImage,
        user_image_url: customImage,
        orientation: item.orientation || item.custom_config?.orientation || null,
        custom_config: {
          shaderType: item.custom_config?.shaderType,
          material: item.custom_config?.material,
          size: item.custom_config?.size,
          orientation: item.custom_config?.orientation,
          ai_upscale: !!item.custom_config?.ai_upscale,
          ai_outpaint: !!item.custom_config?.ai_outpaint,
          ai_autofill: !!item.custom_config?.ai_autofill,
          serial_number: item.custom_config?.serial_number ?? null,
        },
        is_custom: true,
      });
      continue;
    }

    const productId = typeof item.product_id === 'string' ? item.product_id.trim() : '';
    const optionId = typeof item.option_id === 'string' ? item.option_id.trim() : '';
    if (!productId || productId === 'workshop-single' || !optionId) {
      console.error("[PAYMENT_ITEM_FAIL] Invalid standard item identity:", { orderId: orderIdForLog });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }

    const product = productMap.get(productId);
    if (!product) {
      console.error("[PAYMENT_ITEM_FAIL] Unknown product:", { orderId: orderIdForLog, productId });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }
    if (product.is_visible === false) {
      console.error("[PAYMENT_ITEM_FAIL] Product not visible:", { orderId: orderIdForLog, productId });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }

    const options = Array.isArray(product.options) ? product.options : [];
    const matchedOption = options.find((opt: any) => opt && String(opt.id) === optionId);
    if (!matchedOption) {
      console.error("[PAYMENT_ITEM_FAIL] Unknown option:", { orderId: orderIdForLog, productId });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }
    if (matchedOption.isActive === false) {
      console.error("[PAYMENT_ITEM_FAIL] Option inactive:", { orderId: orderIdForLog, productId });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }
    const unitPrice = Number(matchedOption.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      console.error("[PAYMENT_ITEM_FAIL] Invalid option price:", { orderId: orderIdForLog, productId });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }
    // Catalog availability flag only (JSONB options.stock). Not an inventory ledger:
    // not decremented, not row-locked, not re-checked after Toss DONE.
    const stock = Number(matchedOption.stock);
    if (Number.isFinite(stock) && stock <= 0) {
      console.error("[PAYMENT_ITEM_FAIL] Option sold out:", { orderId: orderIdForLog, productId });
      return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
    }

    serverExpectedTotal += unitPrice * quantity;
    const image =
      (typeof product.front_image === 'string' && product.front_image) || null;

    validatedSnapshots.push({
      product_id: product.id,
      product_title: product.title || '제품',
      title: product.title || '제품',
      option: matchedOption.name || '기본',
      quantity,
      price: unitPrice,
      image,
      user_image_url: null,
      orientation: item.orientation || null,
      custom_config: null,
      is_custom: false,
    });
  }

  if (serverExpectedTotal <= 0) {
    console.error("[PAYMENT_ITEM_FAIL] Non-positive checkout total:", { orderId: orderIdForLog });
    return { ok: false, status: 400, error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." };
  }

  return {
    ok: true,
    checkout: {
      total: serverExpectedTotal,
      validatedSnapshots,
      sanitizedOrderedItems: buildSanitizedOrderedItems(validatedSnapshots),
      rpcOrderItems: buildRpcOrderItems(validatedSnapshots),
    },
  };
}

async function startServer() {
  if (isPaymentTestMode) {
    assertPaymentTestEnvironment();
  } else {
    assertProductionEnvironment();
  }

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust Proxy for GCP environment
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  // Baseline security response headers (no CSP)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    next();
  });

  // www → apex (301). Method-preserving 308 is unnecessary for crawler GETs;
  // 301 is the standard permanent host-canonicalization signal for search engines.
  // *.run.app hosts: X-Robots-Tag only — never noindex metalora.art.
  app.use((req, res, next) => {
    const hostname = requestHostname(req);
    if (hostname === "www.metalora.art") {
      return res.redirect(301, `${CANONICAL_PUBLIC_ORIGIN}${req.originalUrl}`);
    }
    if (hostname.endsWith(".run.app")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    next();
  });

  // Middleware
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // RSS Feed for Naver Search Advisor
  app.get("/rss.xml", async (req, res) => {
    try {
      const client = supabasePublic || supabaseAdmin;
      if (!client) {
        throw new Error("Supabase is not configured.");
      }

      const { data: products, error } = await client
        .from('products')
        .select('*')
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      const baseUrl = getSeoOrigin();

      const rssItems = (products || []).map(product => {
        const productUrl = `${baseUrl}/product/${product.id}`;
        const pubDate = new Date(product.created_at || Date.now()).toUTCString();
        const imageUrl = resolvePublicImageUrl(product.front_image || product.image) || '';
        const imageHtml = imageUrl ? `<br/><img src="${imageUrl}" alt="${product.title}" />` : '';

        return `
    <item>
      <title><![CDATA[${product.title} - 프리미엄 메탈 액자]]></title>
      <link>${productUrl}</link>
      <description><![CDATA[${product.description || '최고급 커스텀 메탈 액자를 경험해보세요.'}${imageHtml}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid>${productUrl}</guid>
    </item>`;
      }).join('');

      const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>메탈로라 | 프리미엄 커스텀 메탈 액자</title>
    <link>${baseUrl}/</link>
    <description>메탈로라의 신규 메탈 액자 컬렉션 및 제품 소식입니다.</description>
    <language>ko-kr</language>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;

      res.header('Content-Type', 'application/xml');
      res.send(rssFeed);
    } catch (error) {
      console.error("[RSS Feed Error]", error);
      res.status(500).send("Feed Generation Error");
    }
  });

  // Dynamic Sitemap — all <loc> pinned to canonical public origin
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const client = supabasePublic || supabaseAdmin;
      const baseUrl = getSeoOrigin();

      let productUrls = "";

      if (client) {
        const { data: products, error } = await client
          .from("products")
          .select("id, created_at")
          .eq("is_visible", true);

        if (!error && products) {
          productUrls = products
            .map((product) => {
              const date = new Date(product.created_at || Date.now())
                .toISOString()
                .split("T")[0];
              return `
  <url>
    <loc>${baseUrl}/product/${product.id}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
            })
            .join("");
        }
      }

      const staticUrls = [
        { path: "/", changefreq: "daily", priority: "1.0" },
        ...POLICY_SITEMAP_PATHS.map((policyPath) => ({
          path: policyPath,
          changefreq: "yearly",
          priority: "0.3",
        })),
      ]
        .map(
          (entry) => `
  <url>
    <loc>${baseUrl}${entry.path === "/" ? "/" : entry.path}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
        )
        .join("");

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}${productUrls}
</urlset>`;

      res.header("Content-Type", "application/xml");
      res.send(sitemap);
    } catch (error) {
      console.error("[Sitemap Generation Error]", error);
      res.status(500).send("Sitemap Generation Error");
    }
  });

  /**
   * Toss payment webhook — acknowledgement only.
   * Card payment state is authoritative via /api/payment/confirm.
   * Do not mutate DB from unverified webhook payloads; add a verified flow if async methods are introduced.
   */
  app.post("/api/payment/webhook", (_req, res) => {
    return res.status(200).json({ received: true });
  });

  /**
   * 결제 준비 API — server-validated immutable payment_intents snapshot (#18B-2)
   */
  app.post("/api/payment/prepare", async (req, res) => {
    const requestId = newPaymentRequestId();
    const envGuard = paymentCrossWriteGuard();
    if (envGuard) {
      logPaymentOpsFailure({
        payment_event: "env_guard",
        phase: "prepare",
        alert_eligible: true,
        request_id: requestId,
        http_status: envGuard.status,
        retryable: false,
      });
      return res.status(envGuard.status).json({ error: envGuard.error });
    }

    const authResult = await verifyPaymentBearer(req.headers.authorization);
    if (authResult.ok === false) {
      if (authResult.status >= 500) {
        logPaymentOpsFailure({
          payment_event: "config_missing",
          phase: "prepare",
          alert_eligible: true,
          request_id: requestId,
          http_status: authResult.status,
          retryable: true,
        });
      }
      return res.status(authResult.status).json({ error: authResult.error });
    }
    const { verifiedUserId, verifiedUserCustomId } = authResult.user;

    const { items, shipping, consents } = req.body ?? {};

    const shippingResult = validateShippingInput(shipping);
    if (shippingResult.ok === false) {
      return res.status(shippingResult.status).json({ error: shippingResult.error });
    }

    const orderNumber = generatePaymentOrderNumber();

    try {
      const checkoutResult = await validateCheckoutItems(items, orderNumber);
      if (checkoutResult.ok === false) {
        if (checkoutResult.status >= 500) {
          logPaymentOpsFailure({
            payment_event: checkoutResult.payment_event ?? "internal_unhandled",
            phase: "prepare",
            alert_eligible: true,
            request_id: requestId,
            order_id: orderNumber,
            http_status: checkoutResult.status,
            retryable: checkoutResult.payment_event !== "config_missing",
          });
        }
        return res.status(checkoutResult.status).json({ error: checkoutResult.error });
      }

      const { total, sanitizedOrderedItems, rpcOrderItems } = checkoutResult.checkout;

      const validatedSnapshot: PaymentIntentSnapshot = {
        schema_version: 1,
        shipping: shippingResult.shipping,
        ordered_items: sanitizedOrderedItems,
        order_items: rpcOrderItems,
      };

      if (consents != null && typeof consents === 'object' && !Array.isArray(consents)) {
        validatedSnapshot.consents = consents as Record<string, unknown>;
      }

      const { error: insertError } = await supabaseAdmin!
        .from('payment_intents')
        .insert({
          order_number: orderNumber,
          user_id: verifiedUserId,
          user_custom_id: verifiedUserCustomId,
          total_price: total,
          validated_snapshot: validatedSnapshot,
        });

      if (insertError) {
        console.error("[PAYMENT_PREPARE_FAIL] payment_intents insert error:", insertError);
        logPaymentOpsFailure({
          payment_event: "db_intent_insert",
          phase: "prepare",
          alert_eligible: true,
          request_id: requestId,
          order_id: orderNumber,
          http_status: 500,
          retryable: true,
        });
        return res.status(500).json({ error: "결제 준비 중 오류가 발생했습니다." });
      }

      console.log(`[PAYMENT_PREPARE] Created intent ${orderNumber} for user ${verifiedUserId}`);
      return res.json({ orderId: orderNumber, amount: total });
    } catch (error) {
      console.error("[PAYMENT_PREPARE_ERROR]", error);
      logPaymentOpsFailure({
        payment_event: "internal_unhandled",
        phase: "prepare",
        alert_eligible: true,
        request_id: requestId,
        order_id: orderNumber,
        http_status: 500,
        retryable: true,
      });
      return res.status(500).json({ error: "결제 준비 중 오류가 발생했습니다." });
    }
  });

  /**
   * 결제 승인 API (Toss Payments 서버-대-서버 승인)
   * State: payment_intents → Toss DONE (POST confirm or GET recovery) → finalize_paid_order.
   * Idempotency: order_number (DB) + paymentKey (Toss). Completion: orders.payment_finalized_at.
   */
  app.post("/api/payment/confirm", async (req, res) => {
    const requestId = newPaymentRequestId();
    const envGuard = paymentCrossWriteGuard();
    if (envGuard) {
      logPaymentOpsFailure({
        payment_event: "env_guard",
        phase: "confirm",
        alert_eligible: true,
        request_id: requestId,
        http_status: envGuard.status,
        retryable: false,
      });
      return res.status(envGuard.status).json({ error: envGuard.error });
    }

    const { paymentKey, orderId, amount } = req.body;
    
    if (!paymentKey || !orderId || !amount) {
      console.error("[PAYMENT_FAIL] Missing required fields:", { paymentKey: !!paymentKey, orderId: !!orderId, amount: !!amount });
      return res.status(400).json({ error: "필수 결제 정보가 누락되었습니다." });
    }

    if (typeof paymentKey !== 'string' || typeof orderId !== 'string') {
      return res.status(400).json({ error: "필수 결제 정보가 누락되었습니다." });
    }

    const opsOrderId = paymentOpsOrderId(orderId);

    const authResult = await verifyPaymentBearer(req.headers.authorization);
    if (authResult.ok === false) {
      if (authResult.status >= 500) {
        logPaymentOpsFailure({
          payment_event: "config_missing",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: authResult.status,
          retryable: true,
        });
      }
      return res.status(authResult.status).json({ error: authResult.error });
    }
    const { verifiedUserId, verifiedUserCustomId } = authResult.user;

    let tossDoneEstablished = false;

    try {
      const { data: paymentIntent, error: intentError } = await supabaseAdmin!
        .from('payment_intents')
        .select('order_number, user_id, user_custom_id, total_price, validated_snapshot')
        .eq('order_number', orderId)
        .eq('user_id', verifiedUserId)
        .maybeSingle();

      if (intentError) {
        console.error("[PAYMENT_INTENT_FAIL] Lookup error:", intentError);
        logPaymentOpsFailure({
          payment_event: "db_intent_lookup",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 500,
          retryable: true,
        });
        return res.status(500).json({ error: "주문 정보를 확인할 수 없습니다." });
      }

      if (!paymentIntent) {
        console.error("[PAYMENT_INTENT_FAIL] No matching payment intent:", { orderId, verifiedUserId });
        return res.status(409).json({ error: "결제 준비 정보를 찾을 수 없습니다." });
      }

      if (paymentIntent.user_custom_id !== verifiedUserCustomId) {
        console.error("[PAYMENT_INTENT_FAIL] user_custom_id mismatch for payment intent:", { orderId });
        logPaymentOpsFailure({
          payment_event: "integrity_ownership",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 403,
          retryable: false,
        });
        return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
      }

      const intentTotal = Number(paymentIntent.total_price);
      if (!Number.isFinite(intentTotal) || intentTotal <= 0) {
        console.error("[PAYMENT_INTENT_FAIL] Invalid intent total_price:", { orderId });
        logPaymentOpsFailure({
          payment_event: "integrity_intent_state",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 500,
          retryable: false,
        });
        return res.status(500).json({ error: "주문 정보를 확인할 수 없습니다." });
      }

      if (Number(amount) !== intentTotal) {
        console.error("[PAYMENT_INTENT_FAIL] Request amount mismatch:", {
          orderId,
          expected: intentTotal,
          amount: Number(amount),
        });
        logPaymentOpsFailure({
          payment_event: "integrity_amount_mismatch",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 400,
          retryable: false,
        });
        return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
      }

      const snapshotResult = parsePaymentIntentSnapshot(paymentIntent.validated_snapshot);
      if (snapshotResult.ok === false) {
        console.error("[PAYMENT_INTENT_FAIL] Malformed validated_snapshot:", { orderId });
        logPaymentOpsFailure({
          payment_event: "integrity_snapshot",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: snapshotResult.status,
          retryable: false,
        });
        return res.status(snapshotResult.status).json({ error: snapshotResult.error });
      }
      const snapshot = snapshotResult.snapshot;

      // Pre-Toss idempotency (payment_finalized_at — not status alone)
      const { data: existingOrder } = await supabaseAdmin!
        .from('orders')
        .select('id, user_id, total_price, payment_finalized_at')
        .eq('order_number', orderId)
        .maybeSingle();

      if (existingOrder) {
        if (existingOrder.user_id && existingOrder.user_id !== verifiedUserId) {
          console.error("[PAYMENT_OWNERSHIP_FAIL] Existing order belongs to another user.");
          logPaymentOpsFailure({
            payment_event: "integrity_ownership",
            phase: "confirm",
            alert_eligible: true,
            request_id: requestId,
            order_id: opsOrderId,
            http_status: 403,
            retryable: false,
          });
          return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
        }
        if (existingOrder.payment_finalized_at != null) {
          if (Number(existingOrder.total_price) !== intentTotal) {
            console.error("[PAYMENT_FINALIZE_FAIL] Finalized order amount mismatch:", { orderId });
            logPaymentOpsFailure({
              payment_event: "integrity_amount_mismatch",
              phase: "confirm",
              alert_eligible: true,
              request_id: requestId,
              order_id: opsOrderId,
              http_status: 400,
              retryable: false,
            });
            return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
          }
          console.log(`[PAYMENT_SKIP] Order ${orderId} already finalized.`);
          return res.json(
            buildPaymentConfirmSuccessPayload({
              orderUuid: existingOrder.id,
              orderNumber: paymentIntent.order_number as string,
              amount: intentTotal,
              snapshot,
              alreadyFinalized: true,
              message: '이미 처리된 주문입니다.',
            }),
          );
        }
        console.error("[PAYMENT_RECOVERY_REQUIRED] Unfinalized existing order:", { orderId });
        logPaymentOpsFailure({
          payment_event: "recovery_required",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 409,
          recovery_required: true,
          retryable: false,
        });
        return res.status(409).json({ error: "주문 처리에 문제가 발생했습니다. 고객센터에 문의해 주세요." });
      }

      const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
      if (!TOSS_SECRET_KEY) {
        console.error("[CRITICAL] TOSS_SECRET_KEY is missing in server environment.");
        logPaymentOpsFailure({
          payment_event: "config_missing",
          phase: "confirm",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 500,
          retryable: true,
        });
        return res.status(500).json({ error: "서버 구성 오류가 발생했습니다." });
      }

      const expectedToss = {
        orderNumber: paymentIntent.order_number as string,
        totalPrice: intentTotal,
        paymentKey,
      };

      let verifiedPayment: TossPaymentObject | null = null;
      let establishSource: 'post_confirm' | 'get_recovery' | null = null;
      let lastTossHttpStatus: number | null = null;
      let lastTossProviderCode: string | null = null;

      // --- Establish Toss DONE: POST confirm, else GET recovery ---
      try {
        console.log(`[PAYMENT_START] Confirming amount ${intentTotal} for order ${orderId}`);

        const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
          method: "POST",
          headers: {
            Authorization: getTossBasicAuthHeader(TOSS_SECRET_KEY),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentKey,
            orderId: paymentIntent.order_number,
            amount: intentTotal,
          }),
        });

        lastTossHttpStatus = tossResponse.status;

        let tossData: any = null;
        try {
          tossData = await tossResponse.json();
        } catch {
          tossData = null;
        }
        lastTossProviderCode = paymentOpsProviderCode(tossData?.code);

        if (tossResponse.ok && tossData && typeof tossData === 'object') {
          const validation = validateTossDonePayment(tossData as TossPaymentObject, expectedToss);
          if (validation.ok === false) {
            console.error("[PAYMENT_TOSS_VALIDATE_FAIL] POST confirm payment invalid:", {
              orderId,
              reason: validation.reason,
            });
            const statusNotDone = validation.reason.startsWith("status_not_done");
            logPaymentOpsFailure({
              payment_event: statusNotDone ? "provider_not_done" : "integrity_provider_mismatch",
              phase: "toss_confirm",
              alert_eligible: true,
              request_id: requestId,
              order_id: opsOrderId,
              http_status: 400,
              provider: "toss",
              provider_code: lastTossProviderCode,
              recovery_required: !statusNotDone,
              retryable: false,
            });
            return res.status(400).json({ error: "결제 금액 불일치가 감지되었습니다." });
          }
          verifiedPayment = tossData as TossPaymentObject;
          establishSource = 'post_confirm';
          tossDoneEstablished = true;
        } else {
          console.error("[PAYMENT_TOSS_ERROR] POST confirm failed; attempting GET recovery:", {
            orderId,
            status: tossResponse.status,
            code: tossData?.code,
          });
        }
      } catch (postError) {
        console.error("[PAYMENT_TOSS_ERROR] POST confirm network/error; attempting GET recovery:", {
          orderId,
          message: postError instanceof Error ? postError.message : 'unknown',
        });
      }

      if (!verifiedPayment) {
        const lookup = await lookupTossPaymentByOrderId(TOSS_SECRET_KEY, paymentIntent.order_number);
        if (lookup.ok === false) {
          console.error("[PAYMENT_TOSS_RECOVERY_FAIL] Lookup did not yield payment:", {
            orderId,
            reason: lookup.reason,
          });
          const paymentEvent: PaymentOpsEvent =
            lookup.reason === "network"
              ? "provider_network"
              : lookup.reason === "invalid_body"
                ? "provider_invalid_response"
                : "provider_http_error";
          logPaymentOpsFailure({
            payment_event: paymentEvent,
            phase: "toss_recovery",
            alert_eligible: lookup.reason !== "not_found",
            request_id: requestId,
            order_id: opsOrderId,
            http_status: lastTossHttpStatus ?? 400,
            provider: "toss",
            provider_code: lastTossProviderCode,
            retryable: lookup.reason === "network" || lookup.reason === "api_error",
          });
          return res.status(400).json({ error: "결제 대행사 승인 실패" });
        }

        const validation = validateTossDonePayment(lookup.payment, expectedToss);
        if (validation.ok === false) {
          console.error("[PAYMENT_TOSS_RECOVERY_FAIL] Lookup payment not conclusively DONE:", {
            orderId,
            reason: validation.reason,
            status: lookup.payment.status,
          });
          const statusNotDone = validation.reason.startsWith("status_not_done");
          logPaymentOpsFailure({
            payment_event: statusNotDone ? "provider_not_done" : "integrity_provider_mismatch",
            phase: "toss_recovery",
            alert_eligible: !statusNotDone,
            request_id: requestId,
            order_id: opsOrderId,
            http_status: 400,
            provider: "toss",
            provider_code: paymentOpsProviderCode(
              typeof lookup.payment.status === "string" ? lookup.payment.status : null,
            ),
            recovery_required: !statusNotDone,
            retryable: false,
          });
          return res.status(400).json({ error: "결제 대행사 승인 실패" });
        }

        verifiedPayment = lookup.payment;
        establishSource = 'get_recovery';
        tossDoneEstablished = true;
        console.log(`[PAYMENT_TOSS_RECOVERY] Established DONE via GET for order ${orderId}`);
      }

      const confirmedAmount = Number(verifiedPayment.totalAmount);
      const shippingInfo = {
        ...(snapshot.consents ? { consents: snapshot.consents } : {}),
        payment_key: paymentKey,
        payment_method: (typeof verifiedPayment.method === 'string' && verifiedPayment.method) || '카드',
        confirmed_at: new Date().toISOString(),
        recovery_source: establishSource,
        toss_data: {
          mId: verifiedPayment.mId,
          transactionKey: verifiedPayment.transactionKey,
          lastTransactionKey: verifiedPayment.lastTransactionKey,
        },
      };

      console.log(`[DB_FINALIZE] Finalizing order ${orderId} via RPC (source=${establishSource})...`);

      const { data: finalizeRows, error: finalizeError } = await supabaseAdmin!.rpc('finalize_paid_order', {
        p_verified_user_id: verifiedUserId,
        p_user_custom_id: paymentIntent.user_custom_id,
        p_order_number: paymentIntent.order_number,
        p_total_price: intentTotal,
        p_paid_amount: confirmedAmount,
        p_shipping_name: snapshot.shipping.name,
        p_shipping_phone: snapshot.shipping.phone,
        p_zip_code: snapshot.shipping.zip_code,
        p_address: snapshot.shipping.address,
        p_address_detail: snapshot.shipping.address_detail,
        p_ordered_items: snapshot.ordered_items,
        p_shipping_info: shippingInfo,
        p_order_items: snapshot.order_items,
      });

      if (finalizeError) {
        console.error("[DB_FINALIZE_ERROR]", finalizeError);
        logPaymentOpsFailure({
          payment_event: "db_finalize_rpc",
          phase: "finalize",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 500,
          recovery_required: true,
          retryable: true,
        });
        return res.status(500).json({
          error: "주문 정보 저장 중 오류가 발생했습니다.",
        });
      }

      if (!Array.isArray(finalizeRows) || finalizeRows.length !== 1) {
        console.error("[DB_FINALIZE_ERROR] Unexpected RPC result row count:", {
          orderId,
          count: Array.isArray(finalizeRows) ? finalizeRows.length : null,
        });
        logPaymentOpsFailure({
          payment_event: "db_finalize_rpc",
          phase: "finalize",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 500,
          recovery_required: true,
          retryable: true,
        });
        return res.status(500).json({
          error: "주문 정보 저장 중 오류가 발생했습니다.",
        });
      }

      const finalizeResult = finalizeRows[0] as {
        order_id: string;
        order_number: string;
        already_finalized: boolean;
      };

      if (!finalizeResult?.order_id) {
        console.error("[DB_FINALIZE_ERROR] RPC result missing order_id:", { orderId });
        logPaymentOpsFailure({
          payment_event: "db_finalize_rpc",
          phase: "finalize",
          alert_eligible: true,
          request_id: requestId,
          order_id: opsOrderId,
          http_status: 500,
          recovery_required: true,
          retryable: true,
        });
        return res.status(500).json({
          error: "주문 정보 저장 중 오류가 발생했습니다.",
        });
      }

      const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
      if (WEBHOOK_URL && !finalizeResult.already_finalized) {
        const displayItems = snapshot.ordered_items;
        
        const itemsList = displayItems.map((item: any) => {
          const isCustom = item.is_custom || item.product_id === 'workshop-single';
          const typeTag = isCustom ? '[커스텀]' : '[기성]';
          const title = item.product_title || item.title || '제품';
          const option = item.option || '기본';
          const quantity = item.quantity || 1;
          
          let itemString = `• **${typeTag} ${title}** (${option} | ${quantity}개)`;
          
          if (isCustom && item.custom_config) {
            const aiOps = [];
            if (item.custom_config.ai_upscale) aiOps.push('AI 고화질');
            if (item.custom_config.ai_outpaint) aiOps.push('AI 비율복원');
            if (item.custom_config.ai_autofill) aiOps.push('AI 자동채우기');
            
            if (aiOps.length > 0) {
              itemString += `\n  └─ ✨ **옵션:** ${aiOps.join(', ')}`;
            }
          }
          
          return itemString;
        }).join('\n') || '• 상품 정보 없음';

        const discordContent = `💰💰💰💰💰💰💰💰💰💰
\n🚀 **[METALORA] 새로운 주문 발생! (서버 승인 완료)**
\n📌 **주문 요약**
• **결제금액:** **${confirmedAmount.toLocaleString()}원** (입금 완료)
• **주문번호:** \`${orderId}\`
• **결제수단:** ${shippingInfo.payment_method}
\n🛒 **주문 품목**
${itemsList}
\n👤 **주문자 정보**
• **성함:** ${snapshot.shipping.name || '고객'} 님
• **배송지:** ${snapshot.shipping.address || '주소 없음'} ${snapshot.shipping.address_detail || ''}`;

        void fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: discordContent }),
        }).catch((e) =>
          console.error(`[DISCORD_ERROR] orderId=${orderId}`, e instanceof Error ? e.message : 'unknown'),
        );
      }

      return res.json(
        buildPaymentConfirmSuccessPayload({
          orderUuid: finalizeResult.order_id,
          orderNumber: finalizeResult.order_number,
          amount: intentTotal,
          snapshot,
          alreadyFinalized: finalizeResult.already_finalized,
        }),
      );

    } catch (error: any) {
      console.error("Payment Confirmation API Error:", error);
      logPaymentOpsFailure({
        payment_event: "internal_unhandled",
        phase: tossDoneEstablished ? "finalize" : "confirm",
        alert_eligible: true,
        request_id: requestId,
        order_id: opsOrderId,
        http_status: 500,
        recovery_required: tossDoneEstablished,
        retryable: true,
      });
      let errorMessage = "결제 처리 중 서버 오류가 발생했습니다.";
      
      if (error.message?.includes("fetch")) {
        errorMessage = "결제 대행사(토스) 서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.";
      } else if (error.code === "PGRST116" || error.message?.includes("supabase")) {
        errorMessage = "데이터베이스 업데이트 중 오류가 발생했습니다. (관리자 문의)";
      }

      return res.status(500).json({ 
        error: errorMessage,
        debug: process.env.NODE_ENV !== "production" ? error.message : undefined
      });
    }
  });

  // Unregistered /api/* → JSON 404 (before Vite/static/SPA)
  app.use("/api", (_req, res) => {
    return res.status(404).json({ error: "API endpoint not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      mode: isPaymentTestMode ? PAYMENT_TEST_ENV_NAME : "development",
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Development SPA fallback
    app.get('*', async (req, res, next) => {
      // API 경로는 넘김
      if (req.originalUrl.startsWith('/api/') || req.originalUrl.includes('.')) {
        return next();
      }
      try {
        const url = req.originalUrl;
        const fs = await import('fs');
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production path setup
    const distPath = path.resolve(__dirname, "dist", "client");
    const indexHtmlPath = path.join(distPath, "index.html");

    // Read SPA shell once; mutate per-request for route-specific SEO (not React SSR)
    let indexHtmlTemplate: string | null = null;
    const getIndexHtmlTemplate = (): string => {
      if (!indexHtmlTemplate) {
        indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf-8");
      }
      return indexHtmlTemplate;
    };

    // Vite hashed build assets: assets/<name>-<hash>.<ext> (e.g. index-COl1YASV.js)
    const isHashedViteAsset = (filePath: string) => {
      const normalized = filePath.replace(/\\/g, "/");
      if (!normalized.includes("/assets/")) return false;
      const basename = path.basename(normalized);
      return /^.+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(basename);
    };

    // 1. Static files — Cache-Control decided per file (no global 1y immutable)
    app.use(express.static(distPath, {
      index: false, // index.html은 아래에서 수동 서빙
      setHeaders: (res, filePath) => {
        if (filePath.toLowerCase().endsWith(".avif")) {
          res.setHeader("Content-Type", "image/avif");
        }
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }
        if (isHashedViteAsset(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        // Fixed-name public assets (hero, env, logo, manifest, robots, …)
        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }));

    // 2. Catch-all: route-aware SEO HTML shell, then React mounts client-side
    app.get("*", async (req, res) => {
      if (req.originalUrl.startsWith("/api/")) {
        return res.status(404).json({ error: "Not found" });
      }

      try {
        const pathname = (req.path || "/").split("?")[0] || "/";
        const seo = await resolveSeoForPath(pathname);
        const html = applySeoToHtml(getIndexHtmlTemplate(), seo);
        res.status(seo.status ?? 200);
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
      } catch (err) {
        console.error("Error generating SEO HTML:", err);
        res.status(503);
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(
          "<!doctype html><html lang=\"ko\"><head><meta charset=\"UTF-8\" /><title>Service Temporarily Unavailable</title></head><body><p>Service Temporarily Unavailable</p></body></html>",
        );
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const deploySha =
      typeof process.env.DEPLOY_SHA === "string" && process.env.DEPLOY_SHA.trim()
        ? process.env.DEPLOY_SHA.trim()
        : "unknown";
    console.log(`[STARTUP] deploy_sha=${deploySha}`);
    console.log(`[STARTUP] metalora_env=${isPaymentTestMode ? PAYMENT_TEST_ENV_NAME : "default"}`);
    console.log(`Server started on port ${PORT}`);
  });
}

startServer();

