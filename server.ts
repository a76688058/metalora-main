import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://qifloweuwyhvukabgnoa.supabase.co';
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
  | { ok: false; status: number; error: string }
> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "서버 구성 오류가 발생했습니다." };
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
      return { ok: false, status: 500, error: "주문 상품 정보를 확인할 수 없습니다." };
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
  assertProductionEnvironment();

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

      // Use BASE_URL from env or dynamically from request
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = process.env.BASE_URL || req.headers.host || 'metalora.art';
      const baseUrl = host.startsWith('http') ? host : `${protocol}://${host}`;

      const rssItems = (products || []).map(product => {
        const productUrl = `${baseUrl}/product/${product.id}`;
        const pubDate = new Date(product.created_at || Date.now()).toUTCString();
        const rawImageUrl = product.front_image || product.image || '';
        const imageUrl = rawImageUrl.startsWith('http') ? rawImageUrl : (rawImageUrl.startsWith('/') ? `${baseUrl}${rawImageUrl}` : rawImageUrl);
        
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
    <link>${baseUrl}</link>
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

  // Dynamic Sitemap
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const client = supabasePublic || supabaseAdmin;
      
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = process.env.BASE_URL || req.headers.host || 'metalora.art';
      const baseUrl = host.startsWith('http') ? host : `${protocol}://${host}`;

      let productUrls = "";
      
      if (client) {
        const { data: products, error } = await client
          .from('products')
          .select('id, created_at')
          .eq('is_visible', true);
          
        if (!error && products) {
          productUrls = products.map(product => {
            const date = new Date(product.created_at || Date.now()).toISOString().split('T')[0];
            return `
  <url>
    <loc>${baseUrl}/product/${product.id}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
          }).join('');
        }
      }

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${productUrls}
</urlset>`;

      res.header('Content-Type', 'application/xml');
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
    const authResult = await verifyPaymentBearer(req.headers.authorization);
    if (authResult.ok === false) {
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
        return res.status(500).json({ error: "결제 준비 중 오류가 발생했습니다." });
      }

      console.log(`[PAYMENT_PREPARE] Created intent ${orderNumber} for user ${verifiedUserId}`);
      return res.json({ orderId: orderNumber, amount: total });
    } catch (error) {
      console.error("[PAYMENT_PREPARE_ERROR]", error);
      return res.status(500).json({ error: "결제 준비 중 오류가 발생했습니다." });
    }
  });

  /**
   * 결제 승인 API (Toss Payments 서버-대-서버 승인)
   * @description 클라이언트에서 받은 결제 정보를 토스에서 확인하고 DB를 업데이트합니다.
   * Reentrant: POST confirm 실패 시 GET /orders/{orderId} 로 DONE 결제 복구 후 finalize.
   */
  app.post("/api/payment/confirm", async (req, res) => {
    const { paymentKey, orderId, amount } = req.body;
    
    if (!paymentKey || !orderId || !amount) {
      console.error("[PAYMENT_FAIL] Missing required fields:", { paymentKey: !!paymentKey, orderId: !!orderId, amount: !!amount });
      return res.status(400).json({ error: "필수 결제 정보가 누락되었습니다." });
    }

    if (typeof paymentKey !== 'string' || typeof orderId !== 'string') {
      return res.status(400).json({ error: "필수 결제 정보가 누락되었습니다." });
    }

    const authResult = await verifyPaymentBearer(req.headers.authorization);
    if (authResult.ok === false) {
      return res.status(authResult.status).json({ error: authResult.error });
    }
    const { verifiedUserId, verifiedUserCustomId } = authResult.user;

    try {
      const { data: paymentIntent, error: intentError } = await supabaseAdmin!
        .from('payment_intents')
        .select('order_number, user_id, user_custom_id, total_price, validated_snapshot')
        .eq('order_number', orderId)
        .eq('user_id', verifiedUserId)
        .maybeSingle();

      if (intentError) {
        console.error("[PAYMENT_INTENT_FAIL] Lookup error:", intentError);
        return res.status(500).json({ error: "주문 정보를 확인할 수 없습니다." });
      }

      if (!paymentIntent) {
        console.error("[PAYMENT_INTENT_FAIL] No matching payment intent:", { orderId, verifiedUserId });
        return res.status(409).json({ error: "결제 준비 정보를 찾을 수 없습니다." });
      }

      if (paymentIntent.user_custom_id !== verifiedUserCustomId) {
        console.error("[PAYMENT_INTENT_FAIL] user_custom_id mismatch for payment intent:", { orderId });
        return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
      }

      const intentTotal = Number(paymentIntent.total_price);
      if (!Number.isFinite(intentTotal) || intentTotal <= 0) {
        console.error("[PAYMENT_INTENT_FAIL] Invalid intent total_price:", { orderId });
        return res.status(500).json({ error: "주문 정보를 확인할 수 없습니다." });
      }

      if (Number(amount) !== intentTotal) {
        console.error("[PAYMENT_INTENT_FAIL] Request amount mismatch:", {
          orderId,
          expected: intentTotal,
          amount: Number(amount),
        });
        return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
      }

      const snapshotResult = parsePaymentIntentSnapshot(paymentIntent.validated_snapshot);
      if (snapshotResult.ok === false) {
        console.error("[PAYMENT_INTENT_FAIL] Malformed validated_snapshot:", { orderId });
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
          return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
        }
        if (existingOrder.payment_finalized_at != null) {
          if (Number(existingOrder.total_price) !== intentTotal) {
            console.error("[PAYMENT_FINALIZE_FAIL] Finalized order amount mismatch:", { orderId });
            return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
          }
          console.log(`[PAYMENT_SKIP] Order ${orderId} already finalized.`);
          return res.json({ success: true, message: "이미 처리된 주문입니다.", orderId: existingOrder.id });
        }
        console.error("[PAYMENT_RECOVERY_REQUIRED] Unfinalized existing order:", { orderId });
        return res.status(409).json({ error: "주문 처리에 문제가 발생했습니다. 고객센터에 문의해 주세요." });
      }

      const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
      if (!TOSS_SECRET_KEY) {
        console.error("[CRITICAL] TOSS_SECRET_KEY is missing in server environment.");
        return res.status(500).json({ error: "서버 구성 오류가 발생했습니다." });
      }

      const expectedToss = {
        orderNumber: paymentIntent.order_number as string,
        totalPrice: intentTotal,
        paymentKey,
      };

      let verifiedPayment: TossPaymentObject | null = null;
      let establishSource: 'post_confirm' | 'get_recovery' | null = null;

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

        let tossData: any = null;
        try {
          tossData = await tossResponse.json();
        } catch {
          tossData = null;
        }

        if (tossResponse.ok && tossData && typeof tossData === 'object') {
          const validation = validateTossDonePayment(tossData as TossPaymentObject, expectedToss);
          if (validation.ok === false) {
            console.error("[PAYMENT_TOSS_VALIDATE_FAIL] POST confirm payment invalid:", {
              orderId,
              reason: validation.reason,
            });
            return res.status(400).json({ error: "결제 금액 불일치가 감지되었습니다." });
          }
          verifiedPayment = tossData as TossPaymentObject;
          establishSource = 'post_confirm';
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
          return res.status(400).json({ error: "결제 대행사 승인 실패" });
        }

        const validation = validateTossDonePayment(lookup.payment, expectedToss);
        if (validation.ok === false) {
          console.error("[PAYMENT_TOSS_RECOVERY_FAIL] Lookup payment not conclusively DONE:", {
            orderId,
            reason: validation.reason,
            status: lookup.payment.status,
          });
          return res.status(400).json({ error: "결제 대행사 승인 실패" });
        }

        verifiedPayment = lookup.payment;
        establishSource = 'get_recovery';
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
        return res.status(500).json({
          error: "주문 정보 저장 중 오류가 발생했습니다.",
        });
      }

      if (!Array.isArray(finalizeRows) || finalizeRows.length !== 1) {
        console.error("[DB_FINALIZE_ERROR] Unexpected RPC result row count:", {
          orderId,
          count: Array.isArray(finalizeRows) ? finalizeRows.length : null,
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

        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: discordContent }),
        }).catch(e => console.error("Discord send error:", e));
      }

      return res.json({ success: true, orderId: finalizeResult.order_id });

    } catch (error: any) {
      console.error("Payment Confirmation API Error:", error);
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

    // 2. Catch-all: 모든 경로에 대해 index.html 서빙 (SPA 필수)
    app.get('*', (req, res) => {
      // API 경로는 여기서 처리하지 않음 (위에서 이미 처리됨)
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
          console.error("Error sending index.html:", err);
          res.status(500).send("Server Error");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on port ${PORT}`);
  });
}

startServer();

