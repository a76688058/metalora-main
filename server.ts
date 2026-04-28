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

// Use Service Role Client for secure operations if key is available
const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
      return res.status(500).json({ error: "서버 구성 오류: Supabase 관리자 키가 설정되지 않았습니다." });
    }

    const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
    if (!TOSS_SECRET_KEY) {
      console.error("[CRITICAL] TOSS_SECRET_KEY is missing in server environment.");
      return res.status(500).json({ error: "서버 구성 오류: 토스 결제 비밀키가 설정되지 않았습니다." });
    }

    try {
      // 2. 토스 페이먼츠 승인 요청 (Server-to-Server)
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

      // 3. 결제 금액 무결성 검증
      if (tossData.totalAmount !== Number(amount)) {
        console.error("[PAYMENT_FRAUD_DETECTED] Amount mismatch:", { toss: tossData.totalAmount, req: amount });
        return res.status(400).json({ error: "결제 금액 불일치가 감지되었습니다." });
      }

      // 4. DB 업데이트
      // 4.1. 중복 확인 (.maybeSingle()을 사용하여 데이터가 없어도 에러가 발생하지 않도록 수정)
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('id, status')
        .eq('order_number', orderId)
        .maybeSingle();

      if (existingOrder && existingOrder.status === 'PAID') {
        console.log(`[PAYMENT_SKIP] Order ${orderId} already processed.`);
        return res.json({ success: true, message: "이미 처리된 주문입니다.", orderId: existingOrder.id });
      }

      // 4.2. 주문 데이터 정제 및 생성
      // DB 스키마(supabase-schema.sql)에 정의된 컬럼만 정확히 매칭
      const isUUID = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
      const userId = pendingOrder?.user_id;

      // JSONB용 데이터 정제
      // pendingOrder.ordered_items가 클라이언트에서 더 풍부한 정보를 담고 있을 수 있으므로 우선 사용
      const rawItems = pendingOrder?.ordered_items || pendingItems || [];
      const sanitizedOrderedItems = rawItems.map((item: any) => ({
        ...item,
        title: item.product_title || item.title || '제품',
        product_title: item.product_title || item.title || '제품',
        image: item.image || item.user_image_url || item.front_image || item.custom_image || null,
        user_image_url: item.user_image_url || item.custom_image || item.image || null,
        product_id: (item.product_id === 'workshop-single' || !item.product_id) ? null : item.product_id,
      }));

      const saveOrderData: any = {
        order_number: orderId,
        user_id: (userId && isUUID(userId)) ? userId : null,
        user_custom_id: pendingOrder?.user_custom_id || null,
        status: 'PAID',
        total_price: Number(amount),
        shipping_name: pendingOrder?.shipping_name || '고객',
        shipping_phone: pendingOrder?.shipping_phone || '',
        zip_code: pendingOrder?.zip_code || '',
        address: pendingOrder?.address || '',
        address_detail: pendingOrder?.address_detail || '',
        ordered_items: sanitizedOrderedItems, // 정제된 리스트 저장
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
          error: `주문 정보 저장 중 오류가 발생했습니다: ${insertError.message}`, 
          details: insertError
        });
      }

      // 4.3. 개별 주문 상품 세부 저장 (order_items 테이블)
      if (insertedOrder && (pendingItems || pendingOrder?.ordered_items)) {
        try {
          // 기존 상품 삭제 (order_number 기준)
          await supabaseAdmin.from('order_items').delete().eq('order_number', orderId);

          const itemsToProcess = pendingItems || pendingOrder?.ordered_items || [];
          const orderItemsToInsert = itemsToProcess.map((item: any) => ({
            order_number: orderId, // order_id가 아니라 order_number를 참조함 (Schema line 71)
            product_id: (item.product_id === 'workshop-single' || !item.product_id) ? null : item.product_id,
            product_title: item.product_title || item.title || '제품',
            option: item.option || '기본',
            orientation: item.orientation || null,
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0,
            image: item.image || item.user_image_url || item.front_image || item.custom_image || null,
            created_at: new Date().toISOString()
          }));

          const { error: itemsError } = await supabaseAdmin
            .from('order_items')
            .insert(orderItemsToInsert);

          if (itemsError) console.error('[DB_ITEMS_ERROR] Order items insert failed:', itemsError);
        } catch (itemErr) {
          console.error('[DB_ITEMS_EXCEPTION] Failed to process order items:', itemErr);
        }
      }

      // 4.4. 유저 결제 통계 업데이트
      if (insertedOrder && insertedOrder.user_id) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('total_spent')
          .eq('id', insertedOrder.user_id)
          .single();
        
        if (profile) {
          await supabaseAdmin
            .from('profiles')
            .update({ total_spent: (profile.total_spent || 0) + Number(amount) })
            .eq('id', insertedOrder.user_id);
        }
      }

      // 5. 디스코드 알림 발송 (서버에서 수행하여 Webhook 숨김)
      const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
      if (WEBHOOK_URL) {
        // pendingOrder.ordered_items가 더 상세한 정보를 포함하고 있음 (custom_config 등)
        const displayItems = pendingOrder.ordered_items || pendingItems;
        
        const itemsList = displayItems?.map((item: any) => {
          const isCustom = item.is_custom || item.product_id === 'workshop-single' || item.product_title?.includes('커스텀') || item.title?.includes('커스텀');
          const typeTag = isCustom ? '[커스텀]' : '[기성]';
          const title = item.product_title || item.title || '제품';
          const option = item.option || '기본';
          const quantity = item.quantity || 1;
          
          let itemString = `• **${typeTag} ${title}** (${option} | ${quantity}개)`;
          
          // 커스텀 옵션 상세 추가 (AI 기능 등)
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
• **결제금액:** **${Number(amount).toLocaleString()}원** (입금 완료)
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist', 'client');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

