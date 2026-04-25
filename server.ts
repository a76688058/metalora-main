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
      return res.status(400).json({ error: "필수 결제 정보가 누락되었습니다." });
    }

    if (!supabaseAdmin) {
      console.error("[CRITICAL] SUPABASE_SERVICE_ROLE_KEY is missing in server environment.");
      return res.status(500).json({ error: "서버 구성 오류: 관리자 키가 설정되지 않았습니다." });
    }

    const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
    if (!TOSS_SECRET_KEY) {
      console.error("[CRITICAL] TOSS_SECRET_KEY is missing in server environment.");
      return res.status(500).json({ error: "서버 구성 오류: 결제 비밀키가 설정되지 않았습니다." });
    }

    try {
      // 2. 토스 페이먼츠 승인 요청 (Server-to-Server)
      // 토스 API는 Basic Auth 사용 (Secret Key: )
      const encodedKey = Buffer.from(TOSS_SECRET_KEY + ":").toString("base64");
      
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
        console.error("Toss Error:", tossData);
        return res.status(tossResponse.status).json({ 
          error: "결제 승인에 실패했습니다.", 
          details: tossData.message || tossData 
        });
      }

      // 3. 결제 금액 무결성 검증 (Toss 리턴 데이터와 요청 데이터 비교)
      if (tossData.totalAmount !== Number(amount)) {
        return res.status(400).json({ error: "결제 금액 불일치가 감지되었습니다." });
      }

      // 4. DB 업데이트 (Service Role 권한으로 안전하게 수행)
      // 4.1. 이미 존재하는 주문인지 확인 (중복 처리 방지)
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('id, status')
        .eq('order_number', orderId)
        .single();

      if (existingOrder && existingOrder.status === 'PAID') {
        return res.json({ success: true, message: "이미 처리된 주문입니다.", orderId: existingOrder.id });
      }

      // 4.2. 주문 데이터 생성
      const newOrderData = { 
        ...pendingOrder,
        status: 'PAID',
        paymentKey,
        method: tossData.method || '카드',
        total_price: Number(amount),
        updated_at: new Date().toISOString()
      };

      const { data: insertedOrder, error: insertError } = await supabaseAdmin
        .from('orders')
        .insert([newOrderData])
        .select()
        .single();
          
      if (insertError) throw insertError;

      // 4.3. 주문 상품 데이터 생성
      if (insertedOrder && pendingItems && pendingItems.length > 0) {
        const orderItemsToInsert = pendingItems.map((item: any) => ({
          ...item,
          order_id: insertedOrder.id,
          order_number: orderId // RLS logic uses order_number
        }));

        const { error: itemsError } = await supabaseAdmin
          .from('order_items')
          .insert(orderItemsToInsert);

        if (itemsError) console.error('Order items insert error:', itemsError);
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
        const itemsList = pendingItems?.map((item: any) => {
          const isCustom = item.is_custom || item.product_id === 'workshop-single' || item.product_title?.includes('커스텀');
          const typeTag = isCustom ? '[커스텀]' : '[기성]';
          return `• **${typeTag} ${item.product_title}** (${item.option} | ${item.quantity}개)`;
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
      return res.status(500).json({ error: "결제 처리 중 서버 오류가 발생했습니다." });
    }
  });

  /**
   * 보안 설정 테스트 API
   * @description 관리자가 환경 변수(Toss, Supabase, Discord)가 올바르게 설정되었는지 테스트합니다.
   */
  app.get("/api/admin/security-test", async (req, res) => {
    const results = {
      toss: !!process.env.TOSS_SECRET_KEY,
      supabase: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      discord: !!process.env.DISCORD_WEBHOOK_URL,
      dbConnection: false,
      discordSent: false
    };

    try {
      // 1. Supabase Admin 연결 테스트
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from('products').select('id').limit(1);
        results.dbConnection = !error;
      }

      // 2. Discord 테스트 메시지 발송
      if (results.discord) {
        const testResponse = await fetch(process.env.DISCORD_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: "🛡️ **[보안 알림]** 서버 보안 설정 테스트가 정상적으로 완료되었습니다. (API Keys Connected)" 
          }),
        });
        results.discordSent = testResponse.ok;
      }

      res.json({ 
        msg: "Security Configuration Check",
        status: results.toss && results.dbConnection && results.discordSent ? "PASS" : "FAIL",
        details: results 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message, details: results });
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

