import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';

/**
 * METALORA PII(Personally Identifiable Information) 보호 모듈
 * @description 프리미엄 브랜드의 격에 맞는 정교한 마스킹 처리를 수행합니다.
 */
const MaskingUtil = {
  // 성명 마스킹 (예: 강동훈 -> 강*훈)
  name: (name: string) => {
    if (!name) return '알수없음';
    if (name.length <= 2) return name.replace(/^(.)(.+)$/, '$1*');
    return name.replace(/^(.)(.+)(.)$/, '$1*$3');
  },

  // 연락처 마스킹 (예: 010-1234-5678 -> 010-****-5678)
  phone: (phone: string) => {
    if (!phone) return '알수없음';
    return phone.replace(/^(\d{3})-(\d{4})-(\d{4})$/, '$1-****-$3');
  },

  // 주소 마스킹 (시/군/구까지만 노출)
  address: (address: string) => {
    if (!address) return '알수없음';
    const parts = address.split(' ');
    return parts.length > 2 ? `${parts[0]} ${parts[1]} ...` : address;
  }
};

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [isConfirming, setIsConfirming] = useState(true);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const totalAmount = searchParams.get('amount') || searchParams.get('totalAmount');
  const method = searchParams.get('method') || searchParams.get('paymentType');

  const WEBHOOK_URL = 'https://discord.com/api/webhooks/1483955729206611998/qaeJdohMjb4nVgTpcsbwRQwjhWwPAYWBct2N8Cwvyub61qfdaJ5hcmvv6vufjWH9U1cA';

  const isProcessing = React.useRef(false);

  const sendDiscordNotification = async (payload: any) => {
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Discord notification error:', error);
    }
  };

  useEffect(() => {
    const confirmPayment = async () => {
      if (isProcessing.current) return;
      if (!paymentKey || !orderId || !totalAmount) return;

      isProcessing.current = true;
      setIsConfirming(true);
      setErrorMessage(null);

      try {
        // 1. 주문 상태 확인 (중복 처리 방지) 및 Price Snapshot 호출
        const { data: existingOrder, error: fetchError } = await supabase
          .from('orders')
          .select('status, shipping_address, user_custom_id, shipping_name, shipping_phone, total_amount')
          .eq('order_number', orderId)
          .single();

        if (fetchError) throw fetchError;
        if (existingOrder?.status === 'PAID') {
          setIsConfirming(false);
          return;
        }

        // 2. 무결성 검증 (Integrity Check)
        // 클라이언트에서 전달된 결제 금액(amount)이 DB의 total_amount와 일치하는지 확인
        if (existingOrder.total_amount !== Number(totalAmount)) {
          // 보안 위반 발생 시 즉시 리포트 생성 및 결제 중단
          const mismatchError = new Error(`[SECURITY_ALERT] Amount mismatch detected. Order: ${orderId}`);
          console.error(mismatchError);
          
          // 디스코드 알림 발송 (보안 위반)
          const alertPayload = {
            content: `🚨 **[SECURITY_ALERT] 결제 금액 불일치 감지!**\n주문번호: ${orderId}\nDB 금액: ${existingOrder.total_amount}원\n요청 금액: ${totalAmount}원`,
            embeds: [{
              color: 0xff0000,
              fields: [
                { name: "주문자", value: MaskingUtil.name(existingOrder.shipping_name || '알수없음'), inline: true },
                { name: "연락처", value: MaskingUtil.phone(existingOrder.shipping_phone || '알수없음'), inline: true },
                { name: "상태", value: "결제 중단 및 리포트 생성 완료" }
              ]
            }]
          };
          await sendDiscordNotification(alertPayload);
          
          setErrorMessage("결제 금액이 일치하지 않아 결제가 중단되었습니다. (보안 위반 감지)");
          setIsConfirming(false);
          return;
        }

        // 3. DB 업데이트 (결제 성공 시 주문 상태 업데이트)
        const shippingAddress = searchParams.get('shipping_address') || existingOrder?.shipping_address;
        
        const updateData = { 
          status: 'PAID',
          paymentKey,
          method: method || '정보 확인 중',
          totalAmount: Number(totalAmount),
          shipping_address: shippingAddress
        };

        const { data, error } = await supabase
          .from('orders')
          .update(updateData)
          .eq('order_number', orderId)
          .select('user_custom_id, shipping_address, shipping_name, shipping_phone');
            
        if (error) throw error;
        
        // 3. 디스코드 알림 발송 (즉시 실행)
        console.log("디스코드 알림 시도 중...");
        const order = data ? data[0] : null;
        const finalShippingAddress = shippingAddress || order?.shipping_address || '주소 확인 중';
        const finalMethod = method || '정보 확인 중';
        const finalName = order?.shipping_name || existingOrder?.shipping_name || '고객';
        const finalPhone = order?.shipping_phone || existingOrder?.shipping_phone || '010-0000-0000';
        
        const discordPayload = {
          content: `🚀 **[METALORA] 새로운 주문 발생!**\n주문번호: ${orderId} / 결제금액: ${Number(totalAmount).toLocaleString()}원 / 결제수단: ${finalMethod}`,
          embeds: [{
            color: 0x4f46e5,
            fields: [
              { name: "주문자", value: MaskingUtil.name(finalName), inline: true },
              { name: "연락처", value: MaskingUtil.phone(finalPhone), inline: true },
              { name: "배송지", value: MaskingUtil.address(finalShippingAddress) }
            ]
          }]
        };

        await sendDiscordNotification(discordPayload);
        
        await clearCart();
        setIsConfirming(false);
      } catch (error: any) {
        console.error('Payment confirmation error:', error);
        setErrorMessage("결제 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.");
        setIsConfirming(false);
      }
    };

    confirmPayment();
  }, [paymentKey, orderId, totalAmount, method, clearCart, searchParams]);

  if (isConfirming) {
    return (
      <div className="min-h-screen pt-32 pb-20 px-6 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
        <p className="text-zinc-400 font-bold">결제 정보를 안전하게 기록 중입니다...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen pt-32 pb-20 px-6 flex items-center justify-center">
        <div className="max-w-md w-full glass rounded-3xl p-8 text-center">
          <p className="text-red-500 font-bold">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex items-center justify-center">
      <div className="max-w-md w-full glass rounded-3xl p-8 text-center">
        <div className="flex items-center justify-center w-24 h-24 mx-auto mb-8">
          <motion.svg 
            viewBox="0 0 100 100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.circle 
              className="text-indigo-500" 
              strokeWidth="6" 
              stroke="currentColor" 
              fill="transparent" 
              r="47" cx="50" cy="50"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />
            <motion.g
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1, type: "spring", stiffness: 200, damping: 10 }}
            >
              <CheckCircle2 size={48} className="text-indigo-500" />
            </motion.g>
          </motion.svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-8 tracking-tight">결제 완료</h1>
        
        <motion.div 
          className="bg-white/5 rounded-2xl p-6 mb-8 border border-white/10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          <div className="flex justify-between mb-4">
            <span className="text-zinc-400">주문번호</span>
            <span className="text-white font-mono">{orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">결제금액</span>
            <span className="text-white font-bold text-xl">₩{Number(totalAmount).toLocaleString()}</span>
          </div>
        </motion.div>
        
        <motion.button
          onClick={() => navigate('/')}
          className="w-full h-14 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:opacity-90 transition-all active:scale-95 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.7, duration: 0.5 }}
        >
          홈으로 돌아가기
        </motion.button>
      </div>
    </div>
  );
}
