import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Frame, Trash2, Plus, Minus, ArrowRight, Loader2, ChevronRight, MapPin, CreditCard, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import ShippingModal from './ShippingModal';
import { loadTossPayments } from '@tosspayments/payment-sdk';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Cart({ isOpen, onClose }: CartProps) {
  const { cartItems, isLoading, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Cart, 2: Checkout, 3: Success
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('카드');

  const [shippingInfo, setShippingInfo] = useState({
    shipping_name: '',
    shipping_phone: '',
    zip_code: '',
    address: '',
    address_detail: ''
  });

  const shippingFee = totalPrice >= 50000 ? 0 : 3000;
  const finalPrice = totalPrice + shippingFee;

  // Auto-fill shipping info when entering checkout step
  useEffect(() => {
    if (step === 2 && profile && !isAutoFilled) {
      setShippingInfo({
        shipping_name: profile.full_name || '',
        shipping_phone: profile.phone_number || '',
        zip_code: profile.zip_code || '',
        address: profile.address || '',
        address_detail: profile.address_detail || ''
      });
      setIsAutoFilled(true);
      showToast('저장된 배송지 정보를 불러왔습니다.', 'success');
    }
  }, [step, profile, isAutoFilled, showToast]);

  const handleShippingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setShippingInfo(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressSearch = () => {
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.addressType === 'R') {
          if (data.bname !== '') {
            extraAddress += data.bname;
          }
          if (data.buildingName !== '') {
            extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
          }
          fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
        }

        setShippingInfo(prev => ({
          ...prev,
          zip_code: data.zonecode,
          address: fullAddress,
          address_detail: '' // Reset detail address when new address is picked
        }));
      }
    }).open();
  };

  const validateShipping = () => {
    if (!shippingInfo.shipping_name.trim()) {
      showToast('수령인 이름을 입력해주세요.', 'error');
      return false;
    }
    if (!shippingInfo.shipping_phone.trim()) {
      showToast('연락처를 입력해주세요.', 'error');
      return false;
    }
    if (!shippingInfo.address.trim()) {
      showToast('배송지 주소를 입력해주세요.', 'error');
      return false;
    }
    return true;
  };

  const triggerPayment = async () => {
    try {
      if (!user) {
        showToast('로그인이 필요합니다.', 'error');
        return;
      }

      // 1. 주문번호 생성: ML-YYYYMMDD-랜덤4자리
      const date = new Date();
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const random4 = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ML-${yyyy}${mm}${dd}-${random4}`;

      // 필수 필드 검증
      if (!shippingInfo.shipping_name || !shippingInfo.shipping_phone || !shippingInfo.zip_code || !shippingInfo.address) {
        throw new Error('배송지 정보가 누락되었습니다.');
      }
      if (!finalPrice || finalPrice <= 0) {
        throw new Error('결제 금액이 올바르지 않습니다.');
      }

      // 스키마 캐시 갱신 대응: 테이블 구조를 다시 한번 확인하고 데이터를 전송하도록 코드를 보강
      // Supabase(PostgREST) 스키마 캐시 이슈를 방지하기 위해 테이블을 명시적으로 터치
      // x-client-info 헤더는 src/lib/supabase.ts에서 글로벌하게 추가됨
      await supabase.from('orders').select('order_number').limit(1);

      // 1.5. 사용자 프로필 정보 (user_custom_id) 가져오기
      // 사장님이 관리자 페이지에서 주문자를 한눈에 식별할 수 있게 하기 위함
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_custom_id')
        .eq('id', user.id)
        .single();

      const userCustomId = profileData?.user_custom_id || user.email?.split('@')[0] || 'unknown';

      // 2. 임시 주문 생성 (Supabase)
      const orderedItemsJson = cartItems.map(item => {
        const option = item.product?.options?.find(opt => opt.id === item.selected_option);
        return {
          product_id: item.product_id,
          product_title: item.product?.title || 'Unknown Product',
          option_name: option?.name || '기본',
          quantity: item.quantity,
          price: option?.price || item.product?.price || 0
        };
      });

      const orderData = {
        order_number: orderNumber,
        user_id: user.id,
        user_custom_id: userCustomId, // 관리자 식별용 ID (son1, son8 등)
        total_price: Number(finalPrice) || 0, // 총액 (숫자 타입 보장, 0이라도 강제)
        total_amount: Number(finalPrice) || 0, // 중복 컬럼 대응
        status: '결제대기',
        shipping_name: String(shippingInfo.shipping_name).trim(), // 수령인명
        shipping_phone: String(shippingInfo.shipping_phone).trim(), // 연락처
        zip_code: String(shippingInfo.zip_code).trim(), // 우편번호
        address: String(shippingInfo.address || '').trim(), // 주소
        address_detail: String(shippingInfo.address_detail || '').trim(), // 상세주소
        ordered_items: orderedItemsJson, // JSON 배열 형식 (Not-Null 제약 조건 해결)
        shipping_info: {
          name: String(shippingInfo.shipping_name).trim(),
          phone: String(shippingInfo.shipping_phone).trim(),
          zip: String(shippingInfo.zip_code).trim(),
          address: String(shippingInfo.address || '').trim(),
          detail: String(shippingInfo.address_detail || '').trim()
        }
      };

      const { error: orderError } = await supabase
        .from('orders')
        .insert(orderData);

      if (orderError) {
        throw new Error(`주문 생성에 실패했습니다: ${orderError.message}`);
      }

      // 3. 토스페이먼츠 결제창 즉시 호출 (지체 없이 실행)
      // 지시: 사장님 전용 테스트 키를 코드에 직접(Hard-coded) 입력
      const CLIENT_KEY = 'test_ck_Poxy1XQL8R9nPR9Xn61Xr7nO5Wml';
      
      const tossPayments = await loadTossPayments(CLIENT_KEY);
      
      // 4. 상품 상세 내역 저장 (order_items 테이블 기록)
      // 지시: 주문 생성 시 order_items 테이블에도 각 상품 정보를 정확히 INSERT
      const orderItems = cartItems.map(item => {
        const option = item.product?.options?.find(opt => opt.id === item.selected_option);
        return {
          order_number: orderNumber,
          product_id: item.product_id,
          product_title: item.product?.title || 'Unknown Product',
          option: option?.name || '기본',
          quantity: item.quantity,
          price: option?.price || item.product?.price || 0
        };
      });

      // 결제창 호출 전에 데이터 기록 보장 (await 사용)
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);
      
      if (itemsError) {
        console.error('Order items creation error:', itemsError);
      }

      // 지시: 결제 요청 함수(requestPayment) 정밀 교정
      // method: 'CARD', orderName: 'METALORA 메탈 포스터 컬렉션', customerName: userCustomId (동적)
      
      await tossPayments.requestPayment('CARD', {
        amount: Number(finalPrice),
        orderId: orderNumber,
        orderName: 'METALORA 메탈 포스터 컬렉션',
        customerName: userCustomId, // 동적 사용자 식별 ID (son1 등)
        successUrl: window.location.origin + '/payment/success',
        failUrl: window.location.origin + '/payment/fail',
      });

    } catch (error: any) {
      console.error('Payment initiation failed:', error);
      showToast(error.message || '결제 초기화에 실패했습니다. 다시 시도해주세요.', 'error');
      setPaymentFailed(true);
      setIsProcessing(false);
    }
  };

  const handleResetCart = async () => {
    await clearCart();
    setStep(1);
    setIsAutoFilled(false);
    setShippingInfo({
      shipping_name: '',
      shipping_phone: '',
      zip_code: '',
      address: '',
      address_detail: ''
    });
    onClose();
    navigate('/');
  };

  const handleCheckout = async () => {
    if (step === 1) {
      if (!profile?.address || !profile?.phone_number) {
        setIsShippingModalOpen(true);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (validateShipping()) {
        setIsProcessing(true);
        setPaymentFailed(false);
        try {
          setIsUpdatingProfile(true);
          // Update profile with new shipping info
          const { error } = await supabase
            .from('profiles')
            .update({
              full_name: shippingInfo.shipping_name,
              phone_number: shippingInfo.shipping_phone,
              zip_code: shippingInfo.zip_code,
              address: shippingInfo.address || '',
              address_detail: shippingInfo.address_detail || '',
              updated_at: new Date().toISOString(),
            })
            .eq('id', user?.id);
            
          if (error) throw error;
          
          // Refresh profile context with new data
          if (typeof refreshProfile === 'function') {
            await refreshProfile();
          }
        } catch (err) {
          console.error('Failed to update profile shipping info:', err);
          // Proceed anyway
        } finally {
          setIsUpdatingProfile(false);
        }

        await triggerPayment();
      }
    } else {
      handleResetCart();
    }
  };

  const handleShippingSuccess = () => {
    setIsShippingModalOpen(false);
    setStep(2);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-[#121212] flex flex-col overflow-y-auto w-screen h-screen custom-scrollbar">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full min-h-full flex flex-col will-change-transform max-w-2xl mx-auto px-6 py-6 md:py-10"
          >
            {/* Header Section - Minimized Whitespace */}
            <div className="flex flex-col gap-2 mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-white tracking-tighter">내 컬렉션 큐레이션</h2>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-all active:scale-90"
                >
                  <X size={28} />
                </button>
              </div>
              
              {/* Order Steps - Tightened */}
              <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.2em]">
                <span className={step === 1 ? "text-white" : "text-zinc-700"}>01 내 컬렉션</span>
                <ChevronRight size={12} className="text-zinc-800" />
                <span className={step === 2 ? "text-white" : "text-zinc-700"}>02 주문서작성</span>
                <ChevronRight size={12} className="text-zinc-800" />
                <span className={step === 3 ? "text-white" : "text-zinc-700"}>03 주문완료</span>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1">
              {isLoading && cartItems.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="animate-spin text-zinc-700" size={32} />
                  <p className="text-zinc-600 font-bold tracking-tight">데이터를 불러오는 중...</p>
                </div>
              ) : cartItems.length === 0 && step !== 3 ? (
                <div className="py-20 flex flex-col items-center justify-center gap-8 text-center">
                  <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                    <Frame size={32} className="text-zinc-800" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">내 컬렉션이 비어있습니다</h3>
                    <p className="text-zinc-600 mt-1 text-sm tracking-tight">멋진 작품을 찾아보세요!</p>
                  </div>
                  <button
                    onClick={() => { onClose(); navigate('/'); }}
                    className="px-8 py-4 bg-white text-black font-black rounded-xl hover:bg-zinc-200 transition-all active:scale-95 text-base tracking-tight"
                  >
                    작품 보러가기
                  </button>
                </div>
              ) : (
                <div className="space-y-8 pb-32">
                  {step === 1 && (
                    <div className="space-y-4">
                      {cartItems.map((item) => {
                        const option = item.product?.options?.find(opt => opt.id === item.selected_option);
                        return (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#1C1C1E] rounded-2xl p-4 flex gap-5 border border-white/5 relative group"
                          >
                            {/* Product Image - Large & Rounded */}
                            <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-white/5">
                              <img 
                                src={item.product?.front_image || item.product?.image} 
                                alt={item.product?.title}
                                className="w-full h-full object-cover"
                              />
                            </div>

                            {/* Product Info */}
                            <div className="flex-1 flex flex-col justify-between py-0.5">
                              <div className="relative">
                                <h4 className="text-base font-semibold text-white tracking-tight pr-8">{item.product?.title}</h4>
                                <p className="text-xs text-zinc-500 mt-1 tracking-tight">
                                  {option?.name} • {option?.dimension}
                                </p>
                                <button 
                                  onClick={() => removeFromCart(item.id)}
                                  className="absolute top-0 right-0 text-zinc-700 hover:text-white transition-colors p-1"
                                >
                                  <X size={18} />
                                </button>
                              </div>

                              <div className="flex justify-between items-center mt-4">
                                {/* Modern Quantity Controls */}
                                <div className="flex items-center gap-1 bg-black/40 rounded-xl p-1 border border-white/5">
                                  <button 
                                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                    className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="w-8 text-center font-bold text-white text-sm">{item.quantity}</span>
                                  <button 
                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                    className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                                <div className="text-right">
                                  <span className="text-lg font-bold text-white tracking-tight">
                                    ₩{((option?.price || 0) * item.quantity).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {/* Shipping Info Form */}
                      <div className="space-y-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
                          <MapPin size={20} className="text-indigo-500" />
                          배송지 정보
                        </h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">수령인</label>
                              <input 
                                type="text" 
                                name="shipping_name"
                                value={shippingInfo.shipping_name}
                                onChange={handleShippingChange}
                                placeholder="이름"
                                className={`w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-5 text-white focus:outline-none focus:border-white/20 transition-all text-sm ${isAutoFilled ? 'ring-1 ring-indigo-500/30' : ''}`}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">연락처</label>
                              <input 
                                type="tel" 
                                name="shipping_phone"
                                value={shippingInfo.shipping_phone}
                                onChange={handleShippingChange}
                                placeholder="010-0000-0000"
                                className={`w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-5 text-white focus:outline-none focus:border-white/20 transition-all text-sm ${isAutoFilled ? 'ring-1 ring-indigo-500/30' : ''}`}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">주소</label>
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                name="zip_code"
                                value={shippingInfo.zip_code}
                                placeholder="우편번호"
                                readOnly
                                className={`w-32 h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-5 text-white focus:outline-none text-sm ${isAutoFilled ? 'ring-1 ring-indigo-500/30' : ''}`}
                              />
                              <button 
                                onClick={handleAddressSearch}
                                className="flex-1 h-14 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all text-sm"
                              >
                                주소 찾기
                              </button>
                            </div>
                            <input 
                              type="text" 
                              name="address"
                              value={shippingInfo.address}
                              placeholder="기본 주소"
                              readOnly
                              className={`w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-5 text-white focus:outline-none text-sm ${isAutoFilled ? 'ring-1 ring-indigo-500/30' : ''}`}
                            />
                            <input 
                              type="text" 
                              name="address_detail"
                              value={shippingInfo.address_detail}
                              onChange={handleShippingChange}
                              placeholder="상세 주소"
                              className={`w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-5 text-white focus:outline-none focus:border-white/20 transition-all text-sm ${isAutoFilled ? 'ring-1 ring-indigo-500/30' : ''}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
                          <CreditCard size={20} className="text-indigo-500" />
                          결제 수단
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {['카드', '카카오페이', '네이버페이', '토스페이', '삼성페이'].map((method) => (
                            <button
                              key={method}
                              onClick={() => setPaymentMethod(method)}
                              className={`h-14 font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${
                                paymentMethod === method
                                  ? 'bg-white text-black ring-2 ring-white ring-offset-2 ring-offset-[#121212]'
                                  : 'bg-[#1C1C1E] border border-white/5 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              {method}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="py-20 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                      <div className="w-24 h-24 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 mb-8">
                        <CheckCircle2 size={48} className="text-indigo-500" />
                      </div>
                      <h3 className="text-3xl font-black text-white tracking-tighter mb-4">주문이 완료되었습니다!</h3>
                      <p className="text-zinc-500 text-lg leading-relaxed max-w-xs mx-auto">
                        METALORA의 작품을 선택해주셔서 감사합니다.<br/>곧 배송이 시작됩니다.
                      </p>
                    </div>
                  )}

                  {/* Amount Summary Card - Modern UI */}
                  {step !== 3 && (
                    <div className="bg-[#1C1C1E] rounded-3xl p-8 border border-white/5 space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm font-bold">
                          <span className="text-zinc-500">총 주문금액</span>
                          <span className="text-white">₩{totalPrice.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-bold">
                          <span className="text-zinc-500">총 배송비</span>
                          <span className="text-white">₩{shippingFee.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="pt-6 border-t border-white/5 flex justify-between items-end">
                        <span className="text-zinc-500 font-black uppercase tracking-widest text-xs mb-1">최종 결제예정금액</span>
                        <span className="text-4xl font-black text-white tracking-tighter">₩{finalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Final CTA Button */}
            {cartItems.length > 0 && step !== 3 && (
              <div className="sticky bottom-0 left-0 right-0 pt-10 pb-4 bg-gradient-to-t from-[#121212] via-[#121212] to-transparent z-[80]">
                <motion.button
                  onClick={handleCheckout}
                  disabled={isUpdatingProfile || isProcessing}
                  whileTap={{ scale: 0.98 }}
                  className="w-full h-16 bg-white text-black font-black text-xl rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-2xl tracking-tight disabled:opacity-50"
                >
                  {isUpdatingProfile || isProcessing ? <Loader2 className="animate-spin" size={24} /> : null}
                  <span>
                    {step === 1 
                      ? '결제하기' 
                      : paymentFailed 
                        ? '다시 시도' 
                        : `₩${finalPrice.toLocaleString()} 결제하기`}
                  </span>
                  <ArrowRight size={24} />
                </motion.button>
                {step === 2 && (
                  <button 
                    onClick={handleBack}
                    disabled={isProcessing}
                    className="w-full py-4 text-zinc-600 hover:text-zinc-400 font-bold text-sm transition-colors disabled:opacity-50"
                  >
                    이전 단계로
                  </button>
                )}
              </div>
            )}
            
            {step === 3 && (
              <div className="sticky bottom-0 left-0 right-0 pt-10 pb-4 bg-gradient-to-t from-[#121212] via-[#121212] to-transparent z-[80]">
                <button
                  onClick={handleResetCart}
                  className="w-full h-16 bg-white text-black font-black text-xl rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-2xl tracking-tight"
                >
                  쇼핑 계속하기
                </button>
              </div>
            )}
          </motion.div>
          <ShippingModal
            isOpen={isShippingModalOpen}
            onClose={() => setIsShippingModalOpen(false)}
            onSuccess={handleShippingSuccess}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
