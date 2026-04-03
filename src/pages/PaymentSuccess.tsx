import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Check, Loader2, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingScreen from '../components/LoadingScreen';
import { useCart } from '../context/CartContext';

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
  const { refreshCart } = useCart();
  const [isConfirming, setIsConfirming] = useState(true);
  const [copied, setCopied] = useState(false);
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
          .select('id, status, address, address_detail, shipping_address, user_custom_id, shipping_name, shipping_phone, total_price')
          .eq('order_number', orderId)
          .single();

        if (fetchError) throw fetchError;
        if (existingOrder?.status === 'PAID') {
          setIsConfirming(false);
          return;
        }

        // 2. 무결성 검증 (Integrity Check)
        // 클라이언트에서 전달된 결제 금액(amount)이 DB의 total_price와 일치하는지 확인
        if (existingOrder.total_price !== Number(totalAmount)) {
          // 보안 위반 발생 시 즉시 리포트 생성 및 결제 중단
          const mismatchError = new Error(`[SECURITY_ALERT] Amount mismatch detected. Order: ${orderId}`);
          console.error(mismatchError);
          
          // 디스코드 알림 발송 (보안 위반)
          const alertPayload = {
            content: `🚨 **[SECURITY_ALERT] 결제 금액 불일치 감지!**\n주문번호: ${orderId}\nDB 금액: ${existingOrder.total_price}원\n요청 금액: ${totalAmount}원`,
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
          total_price: Number(totalAmount),
          shipping_address: shippingAddress
        };

        const { data, error } = await supabase
          .from('orders')
          .update(updateData)
          .eq('order_number', orderId)
          .select('user_custom_id, shipping_address, shipping_name, shipping_phone, user_id'); // user_id 추가
            
        if (error) throw error;
        
        // 3.1. [추가] 회원 총 결제 금액(total_spent) 업데이트
        const order = data ? data[0] : null;
        if (order && order.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('total_spent')
            .eq('id', order.user_id)
            .single();
          
          if (profile) {
            await supabase
              .from('profiles')
              .update({ total_spent: (profile.total_spent || 0) + Number(totalAmount) })
              .eq('id', order.user_id);
          }
        }
        
        // 3.2. 디스코드 알림 발송 (즉시 실행)
        console.log("디스코드 알림 시도 중...");
        
        // 주문 품목 상세 정보 가져오기
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_title, option, quantity')
          .eq('order_id', existingOrder.id);

        const firstItemTitle = orderItems?.[0]?.product_title || '상품';
        const product_name_summary = orderItems && orderItems.length > 1 
          ? `${firstItemTitle} 외 ${orderItems.length - 1}건` 
          : firstItemTitle;

        const options_summary = orderItems?.map(item => `${item.option}(${item.quantity}개)`).join(', ') || '기본';

        const finalMethod = method || '정보 확인 중';
        const customer_name = order?.shipping_name || existingOrder?.shipping_name || '고객';
        const customer_phone = order?.shipping_phone || existingOrder?.shipping_phone || '연락처 없음';
        const shipping_address = existingOrder?.address || order?.shipping_address || existingOrder?.shipping_address || '주소 없음';
        const detail_address = existingOrder?.address_detail || '';
        
        const discordContent = `💰 어이 강사장! 돈 들어오는 소리 들린다! 노 저어라!! 🚣‍♂️

━━━ 🚀 **[METALORA] 새로운 주문 발생!** ━━━

📌 **주문 요약**
• **결제금액:** **${Number(totalAmount).toLocaleString()}원** (입금 완료)
• **주문번호:** \`${orderId}\`
• **결제수단:** ${finalMethod}

🛒 **주문 품목**
• **${product_name_summary}**
*(상세 옵션: ${options_summary})*

👤 **주문자 정보**
• **성함:** ${customer_name} 님
• **연락처:** ${customer_phone}
• **배송지:** ${shipping_address} ${detail_address}

━━━━━━━━━━━━━━━━━━━━━━━━`;

        const discordPayload = {
          content: discordContent
        };

        await sendDiscordNotification(discordPayload);
        
        // 4. 장바구니 비우기 (결제된 품목만)
        if (existingOrder) {
          const { data: orderItems } = await supabase
            .from('order_items')
            .select('product_id, product_title')
            .eq('order_id', existingOrder.id);

          if (orderItems && orderItems.length > 0) {
            const { data: userAuth } = await supabase.auth.getUser();
            const userId = userAuth.user?.id;
            
            if (userId) {
              // product_id가 있는 일반 상품들 (workshop-single 제외)
              const productIds = orderItems
                .map(item => item.product_id)
                .filter(id => id && id !== 'workshop-single');
                
              if (productIds.length > 0) {
                await supabase
                  .from('cart_items')
                  .delete()
                  .eq('user_id', userId)
                  .in('product_id', productIds);
              }
              
              // 커스텀 작품 (workshop-single) 삭제
              const hasWorkshopItem = orderItems.some(
                item => item.product_id === 'workshop-single' || item.product_title === '커스텀 포스터' || item.product_title === '커스텀 작품'
              );
              
              if (hasWorkshopItem) {
                await supabase
                  .from('cart_items')
                  .delete()
                  .eq('user_id', userId)
                  .eq('product_id', 'workshop-single');
              }
              
              // 5. 장바구니 상태 즉시 갱신
              await refreshCart();
            }
          }
        }
        
        setIsConfirming(false);
      } catch (error: any) {
        console.error('Payment confirmation error:', error);
        setErrorMessage("결제 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.");
        setIsConfirming(false);
      }
    };

    confirmPayment();
  }, [paymentKey, orderId, totalAmount, method, searchParams]);

  const handleCopy = () => {
    if (!orderId) return;
    navigator.clipboard.writeText(orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isConfirming) {
    return <LoadingScreen />;
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#0F0F11] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#1C1C1E] rounded-3xl p-8 text-center border border-red-500/20">
          <p className="text-red-500 font-bold mb-6">{errorMessage}</p>
          <button 
            onClick={() => navigate('/')}
            className="px-6 py-3 btn-cyberpunk rounded-2xl font-semibold text-white"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F11] text-white flex flex-col">
      {/* Step Indicator */}
      <div className="w-full max-w-2xl mx-auto px-8 pt-8 pb-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#1C1C1E] text-zinc-500 flex items-center justify-center text-xs font-bold">1</div>
          <span className="text-sm font-medium text-zinc-500 hidden sm:inline">내 컬렉션</span>
        </div>
        <div className="w-4 h-[1px] bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#1C1C1E] text-zinc-500 flex items-center justify-center text-xs font-bold">2</div>
          <span className="text-sm font-medium text-zinc-500 hidden sm:inline">주문서</span>
        </div>
        <div className="w-4 h-[1px] bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#3182F6] text-white flex items-center justify-center text-xs font-bold">3</div>
          <span className="text-sm font-medium text-white">결제완료</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center p-6 pt-4 md:pt-8">
        <div className="max-w-md w-full bg-[#1C1C1E] rounded-3xl p-6 md:p-8 text-center shadow-2xl">
          <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-6">
          <motion.svg 
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.circle 
              className="text-[#3182F6]" 
              strokeWidth="6" 
              stroke="currentColor" 
              fill="transparent" 
              r="47" cx="50" cy="50"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />
          </motion.svg>
          <motion.div
            className="absolute inset-0 flex items-center justify-center origin-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1, type: "spring", stiffness: 200, damping: 10 }}
          >
            <Check size={40} className="text-[#3182F6]" />
          </motion.div>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-8 tracking-tight">결제가 완료되었습니다</h1>
        
        <motion.div 
          className="bg-[#0F0F11] rounded-2xl p-5 md:p-6 mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-400 text-sm font-medium">주문번호</span>
            <div className="flex items-center gap-2">
              <span className="text-white font-mono whitespace-nowrap text-sm">{orderId}</span>
              <button 
                onClick={handleCopy}
                className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                title="주문번호 복사"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Check size={14} className="text-[#3182F6]" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <Copy size={14} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm font-medium">결제금액</span>
            <span className="text-[#3182F6] font-bold text-lg md:text-xl">{Number(totalAmount).toLocaleString()}원</span>
          </div>
        </motion.div>
        
        <motion.button
          onClick={() => navigate('/')}
          className="w-full h-14 btn-cyberpunk rounded-2xl font-bold text-lg text-white mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.7, duration: 0.5 }}
        >
          홈으로 돌아가기
        </motion.button>
      </div>
    </div>
  </div>
  );
}
