import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Check, Loader2, Copy, Factory, Printer, Package, Truck, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingScreen from '../components/LoadingScreen';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

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
  const { theme } = useTheme();
  const [isConfirming, setIsConfirming] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simulationStep, setSimulationStep] = useState(0);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [isSimulationComplete, setIsSimulationComplete] = useState(false);

  const SIMULATION_STEPS = [
    { icon: <Factory size={18} />, text: "메탈로라 팩토리 제작 준비 중", duration: 2500 },
    { icon: <ShieldCheck size={18} />, text: "1.15mm 프리미엄 알루미늄 패널 검수", duration: 3500 },
    { icon: <Printer size={18} />, text: "180℃ 이상 고온 승화전사 4K 프린팅", duration: 4500 },
    { icon: <Package size={18} />, text: "무타공 패키지 및 패널 안전 패키징", duration: 2500 },
    { icon: <Truck size={18} />, text: "배송 파트너사 전달 대기", duration: 2000 },
  ];

  useEffect(() => {
    if (!isConfirming && !errorMessage) {
      let current = 0;
      const runSimulation = () => {
        if (current < SIMULATION_STEPS.length - 1) {
          setTimeout(() => {
            current++;
            setSimulationStep(current);
            runSimulation();
          }, SIMULATION_STEPS[current].duration);
        } else {
          setIsSimulationComplete(true);
        }
      };
      runSimulation();
    }
  }, [isConfirming, errorMessage]);

  const activeStep = selectedStep !== null ? selectedStep : simulationStep;
  
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const totalAmount = searchParams.get('amount') || searchParams.get('totalAmount');
  const method = searchParams.get('method') || searchParams.get('paymentType');

  const isProcessing = React.useRef(false);

  useEffect(() => {
    const confirmPayment = async () => {
      if (isProcessing.current) return;
      if (!paymentKey || !orderId || !totalAmount) return;

      isProcessing.current = true;
      setIsConfirming(true);
      setErrorMessage(null);

      try {
        // 1. 세션 스토리지에서 대기 중인 주문 정보 가져오기
        const pendingOrderStr = sessionStorage.getItem('pendingOrder');
        if (!pendingOrderStr) {
          // 세션 스토리지에 없으면 이미 처리된 주문인지 DB 확인
          const { data: existingOrder } = await supabase
            .from('orders')
            .select('id, status')
            .eq('order_number', orderId)
            .single();
            
          if (existingOrder && existingOrder.status === 'PAID') {
            setIsConfirming(false);
            return;
          }
          throw new Error('결제 대기 중인 주문 정보를 찾을 수 없습니다.');
        }
        
        const pendingOrderData = JSON.parse(pendingOrderStr);
        const { order: pendingOrder, items: pendingItems } = pendingOrderData;

        // 2. 서버에 결제 승인 요청 (보안 강화: Server-side Verification)
        const response = await fetch('/api/payment/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: totalAmount,
            pendingOrder,
            pendingItems
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || '결제 승인 중 오류가 발생했습니다.');
        }

        // 3. 장바구니 비우기 (결제된 품목만)
        if (pendingItems && pendingItems.length > 0) {
          const { data: userAuth } = await supabase.auth.getUser();
          const userId = userAuth.user?.id;
          
          if (userId) {
            // product_id가 있는 일반 상품들 (workshop-single 제외)
            const productIds = pendingItems
              .map((item: any) => item.product_id)
              .filter((id: any) => id && id !== 'workshop-single');
              
            if (productIds.length > 0) {
              await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', userId)
                .in('product_id', productIds);
            }
            
            // 커스텀 작품 (workshop-single) 삭제
            const hasWorkshopItem = pendingItems.some(
              (item: any) => item.product_id === 'workshop-single' || item.product_title?.includes('커스텀') || item.product_id === null
            );
            
            if (hasWorkshopItem) {
              await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', userId)
                .eq('product_id', 'workshop-single');
            }
            
            // 4. 장바구니 상태 즉시 갱신
            await refreshCart();
          }
        }
        
        sessionStorage.removeItem('pendingOrder');
        setIsConfirming(false);
      } catch (error: any) {
        console.error('Payment confirmation error:', error);
        setErrorMessage(error.message || "결제 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.");
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
      <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F0F11]' : 'bg-white'}`}>
        <div className={`max-w-md w-full rounded-3xl p-8 text-center border shadow-2xl ${theme === 'dark' ? 'bg-[#1C1C1E] border-red-500/20' : 'bg-zinc-50 border-red-500/10'}`}>
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
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F0F11] text-white' : 'bg-white text-black'}`}>
      {/* Step Indicator */}
      <div className="w-full max-w-2xl mx-auto px-8 pt-8 pb-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${theme === 'dark' ? 'bg-[#1C1C1E] text-zinc-300' : 'bg-zinc-100 text-zinc-800'}`}>1</div>
          <span className="text-sm font-medium text-zinc-500 hidden sm:inline">내 컬렉션</span>
        </div>
        <div className={`w-4 h-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${theme === 'dark' ? 'bg-[#1C1C1E] text-zinc-300' : 'bg-zinc-100 text-zinc-800'}`}>2</div>
          <span className="text-sm font-medium text-zinc-500 hidden sm:inline">주문서</span>
        </div>
        <div className={`w-4 h-[1px] ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#3182F6] text-white flex items-center justify-center text-[12px] font-bold">3</div>
          <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>결제확인</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center p-6 pt-4 md:pt-8">
        <div className={`max-w-md w-full rounded-3xl p-6 md:p-8 text-center shadow-2xl transform-gpu will-change-transform border transition-colors duration-500 ${
          theme === 'dark' ? 'bg-[#1C1C1E] border-white/5' : 'bg-zinc-50 border-black/5'
        }`}>
          <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-6 transform-gpu">
            <motion.svg 
              className="absolute inset-0 w-full h-full transform-gpu"
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
              className="absolute inset-0 flex items-center justify-center origin-center transform-gpu"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1, type: "spring", stiffness: 200, damping: 10 }}
            >
              <Check size={40} className="text-[#3182F6]" />
            </motion.div>
          </div>
          <h1 className={`text-2xl md:text-3xl font-bold mb-8 tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>결제가 완료되었습니다</h1>
          
          <motion.div 
            className={`rounded-2xl p-5 md:p-6 mb-8 transform-gpu will-change-transform transition-colors duration-500 ${
              theme === 'dark' ? 'bg-[#0F0F11]' : 'bg-white border border-black/5 shadow-sm'
            }`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
          >
            <div className="flex justify-between items-center mb-4">
              <span className="text-zinc-400 text-sm font-medium">주문번호</span>
              <div className="flex items-center gap-2">
                <span className={`font-mono whitespace-nowrap text-sm ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{orderId}</span>
                <button 
                  onClick={handleCopy}
                  className={`p-1.5 rounded-md transition-colors ${
                    theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
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

          {/* Real-time Delivery Simulation (Toss UI Redesign) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
            className="mb-10 text-left transform-gpu will-change-transform"
          >
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-300 uppercase tracking-[0.15em]">Production Status</h3>
              <span className="text-[12px] font-medium text-[#3182F6] bg-[#3182F6]/10 px-2 py-0.5 rounded-full">Live</span>
            </div>

            <div className={`rounded-[28px] p-6 border relative overflow-hidden shadow-inner transition-colors duration-500 ${
              theme === 'dark' ? 'bg-[#0F0F11] border-white/5' : 'bg-white border-black/5'
            }`}>
              {/* Current Step Highlight */}
              <div className="flex items-center gap-5 mb-8">
                <motion.div 
                  key={activeStep}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-14 h-14 rounded-2xl bg-[#3182F6] flex items-center justify-center text-white shadow-[0_8px_24px_rgba(49,130,246,0.25)]"
                >
                  {SIMULATION_STEPS[activeStep].icon}
                </motion.div>
                <div>
                  <motion.p 
                    key={`text-${activeStep}`}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className={`text-lg font-bold tracking-tight leading-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}
                  >
                    {SIMULATION_STEPS[activeStep].text}
                  </motion.p>
                  <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1 font-medium">
                    {isSimulationComplete && selectedStep !== null ? '상세 공정 확인 중' : '메탈로라 프리미엄 공정 진행 중'}
                  </p>
                </div>
              </div>

              {/* Horizontal Step Map */}
              <div className="relative pt-2 pb-1">
                {/* Background Line */}
                <div className={`absolute top-[18px] left-0 w-full h-[3px] rounded-full ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                
                {/* Progress Line */}
                <motion.div 
                  className="absolute top-[18px] left-0 h-[3px] bg-[#3182F6] rounded-full shadow-[0_0_12px_rgba(49,130,246,0.6)]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${(simulationStep / (SIMULATION_STEPS.length - 1)) * 100}%` }}
                  transition={{ duration: 0.8, ease: "circOut" }}
                />

                <div className="relative flex justify-between items-center">
                  {SIMULATION_STEPS.map((step, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => isSimulationComplete && setSelectedStep(idx)}
                      disabled={!isSimulationComplete}
                      className={`flex flex-col items-center group relative outline-none transition-all ${isSimulationComplete ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div 
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 z-10 border-4 ${
                          theme === 'dark' ? 'border-[#0F0F11]' : 'border-white'
                        } ${
                          idx <= simulationStep 
                            ? (activeStep === idx ? (theme === 'dark' ? 'bg-white text-[#3182F6] scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-black text-white scale-110 shadow-[0_0_15px_rgba(0,0,0,0.1)]') : 'bg-[#3182F6] text-white') 
                            : (theme === 'dark' ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-300')
                        }`}
                      >
                        {idx < simulationStep && activeStep !== idx ? (
                          <Check size={14} strokeWidth={3} />
                        ) : (
                          <div className={`w-1.5 h-1.5 rounded-full ${idx === simulationStep && !isSimulationComplete ? (theme === 'dark' ? 'bg-white' : 'bg-black') + ' animate-pulse' : (activeStep === idx ? (theme === 'dark' ? 'bg-[#3182F6]' : 'bg-white') : 'bg-current')}`} />
                        )}
                      </div>
                      {/* Tooltip-like text for desktop, hidden on mobile if too crowded */}
                      <span className={`absolute -bottom-6 text-[12px] font-bold whitespace-nowrap transition-all duration-300 ${
                        activeStep === idx ? (theme === 'dark' ? 'text-white opacity-100' : 'text-black opacity-100') : 'text-zinc-500 opacity-0 group-hover:opacity-100'
                      }`}>
                        STEP {idx + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              
              {isSimulationComplete && selectedStep === null && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-[12px] text-zinc-800 dark:text-zinc-200 mt-10 font-medium"
                >
                  공정 단계를 클릭하면 상세 내용을 다시 볼 수 있습니다.
                </motion.p>
              )}
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
