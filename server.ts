import express from "express";
import path from "path";
import { fileURLToPath } from "url";
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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust Proxy for GCP environment
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  // Baseline security response headers (no CSP/HSTS yet)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
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
   * 결제 승인 API (Toss Payments 서버-대-서버 승인)
   * @description 클라이언트에서 받은 결제 정보를 토스 라이브 서버에서 최종 확인하고 DB를 업데이트합니다.
   */
  app.post("/api/payment/confirm", async (req, res) => {
    const { paymentKey, orderId, amount, pendingOrder, pendingItems } = req.body;
    
    // 1. 기본 유효성 검사
    if (!paymentKey || !orderId || !amount) {
      console.error("[PAYMENT_FAIL] Missing required fields:", { paymentKey: !!paymentKey, orderId: !!orderId, amount: !!amount });
      return res.status(400).json({ error: "필수 결제 정보가 누락되었습니다." });
    }

    if (!pendingOrder || !pendingItems) {
      console.error("[PAYMENT_FAIL] Missing pending order data in request body.");
      return res.status(400).json({ error: "결제 대기 중인 주문 정보(pendingOrder/Items)가 누락되었습니다." });
    }

    if (!supabaseAdmin) {
      console.error("[CRITICAL] SUPABASE_SERVICE_ROLE_KEY is missing in server environment.");
      return res.status(500).json({ error: "서버 구성 오류가 발생했습니다." });
    }

    if (!supabasePublic) {
      console.error("[CRITICAL] VITE_SUPABASE_ANON_KEY is missing in server environment.");
      return res.status(500).json({ error: "서버 구성 오류가 발생했습니다." });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "인증이 필요합니다." });
    }
    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) {
      return res.status(401).json({ error: "인증이 필요합니다." });
    }

    const { data: authData, error: authError } = await supabasePublic.auth.getUser(accessToken);
    if (authError || !authData.user) {
      console.error("[PAYMENT_AUTH_FAIL] Invalid or expired token.");
      return res.status(401).json({ error: "인증이 필요합니다." });
    }
    const verifiedUserId = authData.user.id;

    const claimedUserId = pendingOrder?.user_id;
    if (claimedUserId != null && claimedUserId !== verifiedUserId) {
      console.error("[PAYMENT_OWNERSHIP_FAIL] Claimed user_id does not match verified auth user.");
      return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
    }

    const { data: ownerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_custom_id')
      .eq('id', verifiedUserId)
      .maybeSingle();

    if (profileError || !ownerProfile) {
      console.error("[PAYMENT_PROFILE_FAIL] Profile missing for verified user.");
      return res.status(400).json({ error: "회원 정보를 확인할 수 없습니다." });
    }

    const verifiedUserCustomId =
      typeof ownerProfile.user_custom_id === 'string' ? ownerProfile.user_custom_id.trim() : '';
    if (!verifiedUserCustomId) {
      console.error("[PAYMENT_PROFILE_FAIL] user_custom_id missing for verified user.");
      return res.status(400).json({ error: "회원 정보를 확인할 수 없습니다." });
    }

    try {
      // 1b. Idempotent early return for already-PAID (skip catalog + Toss)
      const { data: existingPaidOrder } = await supabaseAdmin
        .from('orders')
        .select('id, status, user_id')
        .eq('order_number', orderId)
        .maybeSingle();

      if (existingPaidOrder) {
        if (existingPaidOrder.user_id && existingPaidOrder.user_id !== verifiedUserId) {
          console.error("[PAYMENT_OWNERSHIP_FAIL] Existing order belongs to another user.");
          return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
        }
        if (existingPaidOrder.status === 'PAID') {
          console.log(`[PAYMENT_SKIP] Order ${orderId} already processed.`);
          return res.json({ success: true, message: "이미 처리된 주문입니다.", orderId: existingPaidOrder.id });
        }
      }

      const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
      if (!TOSS_SECRET_KEY) {
        console.error("[CRITICAL] TOSS_SECRET_KEY is missing in server environment.");
        return res.status(500).json({ error: "서버 구성 오류가 발생했습니다." });
      }

      // 2. Server-authoritative cart validation (BEFORE Toss confirm; non-PAID only)
      if (!Array.isArray(pendingItems) || pendingItems.length === 0) {
        console.error("[PAYMENT_ITEM_FAIL] pendingItems missing or empty:", { orderId });
        return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
      }

      type ValidatedSnapshot = {
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

      const validatedSnapshots: ValidatedSnapshot[] = [];
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
          return res.status(500).json({ error: "주문 상품 정보를 확인할 수 없습니다." });
        }

        productMap = new Map((products || []).map((p: any) => [p.id, p]));
      }

      for (const item of pendingItems) {
        const quantity = parsePositiveIntQuantity(item?.quantity);
        if (quantity === null) {
          console.error("[PAYMENT_ITEM_FAIL] Invalid quantity:", { orderId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
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
          console.error("[PAYMENT_ITEM_FAIL] Invalid standard item identity:", { orderId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
        }

        const product = productMap.get(productId);
        if (!product) {
          console.error("[PAYMENT_ITEM_FAIL] Unknown product:", { orderId, productId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
        }
        if (product.is_visible === false) {
          console.error("[PAYMENT_ITEM_FAIL] Product not visible:", { orderId, productId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
        }

        const options = Array.isArray(product.options) ? product.options : [];
        const matchedOption = options.find((opt: any) => opt && String(opt.id) === optionId);
        if (!matchedOption) {
          console.error("[PAYMENT_ITEM_FAIL] Unknown option:", { orderId, productId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
        }
        if (matchedOption.isActive === false) {
          console.error("[PAYMENT_ITEM_FAIL] Option inactive:", { orderId, productId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
        }
        const unitPrice = Number(matchedOption.price);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          console.error("[PAYMENT_ITEM_FAIL] Invalid option price:", { orderId, productId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
        }
        const stock = Number(matchedOption.stock);
        if (Number.isFinite(stock) && stock <= 0) {
          console.error("[PAYMENT_ITEM_FAIL] Option sold out:", { orderId, productId });
          return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
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

      if (serverExpectedTotal !== Number(amount)) {
        console.error("[PAYMENT_ITEM_FAIL] Pre-confirm total mismatch:", {
          orderId,
          expected: serverExpectedTotal,
          amount: Number(amount),
        });
        return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
      }

      // 3. 토스 페이먼츠 승인 요청 (Server-to-Server) — only after item/amount validation
      const encodedKey = Buffer.from(TOSS_SECRET_KEY + ":").toString("base64");

      console.log(`[PAYMENT_START] Confirming amount ${amount} for order ${orderId}`);

      const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          Authorization: `Basic ${encodedKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
      });

      const tossData = await tossResponse.json();

      if (!tossResponse.ok) {
        console.error("[PAYMENT_TOSS_ERROR]", tossData);
        return res.status(tossResponse.status).json({
          error: "결제 대행사 승인 실패",
          details: tossData.message || "토스 API 응답 오류",
          code: tossData.code
        });
      }

      // 4. Post-confirm amount integrity (client amount === server expected === Toss)
      if (tossData.totalAmount !== Number(amount)) {
        console.error("[PAYMENT_FRAUD_DETECTED] Amount mismatch:", { toss: tossData.totalAmount, req: amount });
        return res.status(400).json({ error: "결제 금액 불일치가 감지되었습니다." });
      }

      if (serverExpectedTotal !== Number(tossData.totalAmount)) {
        console.error("[PAYMENT_ITEM_FAIL] Post-confirm total mismatch:", {
          orderId,
          expected: serverExpectedTotal,
          toss: tossData.totalAmount,
        });
        return res.status(400).json({ error: "주문 상품 정보와 결제 금액이 일치하지 않습니다." });
      }

      // 5. DB 업데이트
      // 5.1. Race re-check: concurrent confirms may both pass pre-confirm PAID miss
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('id, status, user_id')
        .eq('order_number', orderId)
        .maybeSingle();

      if (existingOrder) {
        if (existingOrder.user_id && existingOrder.user_id !== verifiedUserId) {
          console.error("[PAYMENT_OWNERSHIP_FAIL] Existing order belongs to another user (post-confirm race).");
          return res.status(403).json({ error: "주문 정보가 일치하지 않습니다." });
        }
        if (existingOrder.status === 'PAID') {
          console.log(`[PAYMENT_SKIP] Order ${orderId} already processed (post-confirm race).`);
          return res.json({ success: true, message: "이미 처리된 주문입니다.", orderId: existingOrder.id });
        }
      }

      // 5.2. 주문 데이터 정제 및 생성
      // DB 스키마(supabase-schema.sql)에 정의된 컬럼만 정확히 매칭
      const sanitizedOrderedItems = validatedSnapshots.map((snap) => ({
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

      const saveOrderData: any = {
        order_number: orderId,
        user_id: verifiedUserId,
        user_custom_id: verifiedUserCustomId,
        status: 'PAID',
        total_price: Number(tossData.totalAmount),
        shipping_name: pendingOrder?.shipping_name || '고객',
        shipping_phone: pendingOrder?.shipping_phone || '',
        zip_code: pendingOrder?.zip_code || '',
        address: pendingOrder?.address || '',
        address_detail: pendingOrder?.address_detail || '',
        ordered_items: sanitizedOrderedItems,
        shipping_info: {
          ...(pendingOrder?.shipping_info || {}),
          payment_key: paymentKey,
          payment_method: tossData.method || '카드',
          confirmed_at: new Date().toISOString(),
          toss_data: {
            mId: tossData.mId,
            transactionKey: tossData.transactionKey,
            lastTransactionKey: tossData.lastTransactionKey
          }
        }
      };

      console.log(`[DB_UPSERT] Saving order ${orderId} to Supabase... Content keys:`, Object.keys(saveOrderData));

      // 중복 방지를 위한 upsert (order_number 기준)
      const { data: insertedOrder, error: insertError } = await supabaseAdmin
        .from('orders')
        .upsert(saveOrderData, { onConflict: 'order_number' })
        .select()
        .single();
          
      if (insertError) {
        console.error("[DB_INSERT_ERROR] Details:", insertError);
        return res.status(500).json({ 
          error: "주문 정보 저장 중 오류가 발생했습니다."
        });
      }

      // 5.3. 개별 주문 상품 세부 저장 (order_items 테이블)
      // Schema: order_id → orders.id (FK); no order_number / image columns
      if (insertedOrder?.id && validatedSnapshots.length > 0) {
        try {
          await supabaseAdmin.from('order_items').delete().eq('order_id', insertedOrder.id);

          const orderItemsToInsert = validatedSnapshots.map((snap) => ({
            order_id: insertedOrder.id,
            product_id: snap.is_custom ? null : snap.product_id,
            product_title: snap.product_title,
            quantity: snap.quantity,
            price: snap.price,
            created_at: new Date().toISOString(),
            option: snap.option,
            orientation: snap.orientation || null,
          }));

          const { error: itemsError } = await supabaseAdmin
            .from('order_items')
            .insert(orderItemsToInsert);

          if (itemsError) console.error('[DB_ITEMS_ERROR] Order items insert failed:', itemsError);
        } catch (itemErr) {
          console.error('[DB_ITEMS_EXCEPTION] Failed to process order items:', itemErr);
        }
      }

      // 5.4. 유저 결제 통계 업데이트
      const { data: spentProfile } = await supabaseAdmin
        .from('profiles')
        .select('total_spent')
        .eq('id', verifiedUserId)
        .single();

      if (spentProfile) {
        await supabaseAdmin
          .from('profiles')
          .update({ total_spent: (spentProfile.total_spent || 0) + Number(tossData.totalAmount) })
          .eq('id', verifiedUserId);
      }

      // 6. 디스코드 알림 발송 (서버에서 수행하여 Webhook 숨김)
      const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
      if (WEBHOOK_URL) {
        const displayItems = validatedSnapshots;
        
        const itemsList = displayItems.map((item) => {
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
• **결제금액:** **${Number(tossData.totalAmount).toLocaleString()}원** (입금 완료)
• **주문번호:** \`${orderId}\`
• **결제수단:** ${tossData.method || '카드'}
\n🛒 **주문 품목**
${itemsList}
\n👤 **주문자 정보**
• **성함:** ${pendingOrder.shipping_name || '고객'} 님
• **배송지:** ${pendingOrder.address || '주소 없음'} ${pendingOrder.address_detail || ''}`;

        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: discordContent }),
        }).catch(e => console.error("Discord send error:", e));
      }

      return res.json({ success: true, orderId: insertedOrder.id });

    } catch (error: any) {
      console.error("Payment Confirmation API Error:", error);
      // 구체적인 에러 메시지 전달 (보안상 민감한 정보 제외)
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

