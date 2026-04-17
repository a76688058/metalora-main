import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { X, ShoppingBag, ChevronRight, MapPin, CreditCard, CheckCircle2, Loader2, Trash2, Plus, Minus, Search, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import { loadScript } from '../lib/utils';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || 'test_ck_Poxy1XQL8R9nPR9Xn61Xr7nO5Wml';

const CONSENT_TEXTS = {
  content: {
    title: '콘텐츠 권리 책임 동의',
    items: [
      '업로드한 이미지의 <strong class="text-fuchsia-500">저작권 및 초상권</strong>은 본인에게 있습니다.',
      '권리자의 허가 없이 사용 시 발생하는 <strong class="text-fuchsia-500">모든 법적 책임</strong>은 본인에게 있습니다.'
    ]
  },
  refund: {
    title: '환불 정책 동의',
    items: [
      '<strong class="text-fuchsia-500">주문 제작 상품</strong>은 단순 변심에 의한 <strong class="text-fuchsia-500">환불이 제한</strong>됩니다.',
      '<strong class="text-fuchsia-500">하자 또는 오배송</strong> 시에만 재제작 또는 환불이 가능합니다.'
    ]
  },
  terms: {
    title: '전체 약관 동의',
    items: [
      '<strong class="text-fuchsia-500">이용약관, 개인정보처리방침, 쿠키 정책, 커스텀 제작 동의서</strong>를 모두 확인하였으며 이에 동의합니다.'
    ]
  }
};

export default function Cart() {
  const navigate = useNavigate();
  const { cartItems, removeFromCart, updateQuantity, totalPrice, isLoading: isCartLoading, isCartOpen, closeCart } = useCart();
  const { theme } = useTheme();
  const isOpen = isCartOpen;
  const onClose = closeCart;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const { user, adminUser, profile, adminProfile } = useAuth();
  const [step, setStep] = useState(1); // 1: List, 2: Order Form
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [displayPrice, setDisplayPrice] = useState(0);

  // Initialize selection: Select all by default
  useEffect(() => {
    if (isOpen && cartItems.length > 0) {
      setSelectedIds(new Set(cartItems.map(item => item.id)));
    }
  }, [isOpen, cartItems.length]);

  const selectedItems = React.useMemo(() => 
    cartItems.filter(item => selectedIds.has(item.id)),
    [cartItems, selectedIds]
  );

  const selectedTotalPrice = React.useMemo(() => 
    selectedItems.reduce((sum, item) => {
      const price = item.product_type === 'workshop' 
        ? (item.custom_config?.price || 0) 
        : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0);
      return sum + (price * item.quantity);
    }, 0),
    [selectedItems]
  );

  // Toss-style price animation
  useEffect(() => {
    const controls = animate(displayPrice, selectedTotalPrice, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setDisplayPrice(Math.floor(value)),
    });
    return () => controls.stop();
  }, [selectedTotalPrice]);

  const toggleSelectAll = () => {
    if (selectedIds.size === cartItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cartItems.map(item => item.id)));
    }
  };

  const toggleItemSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  
  // Shipping Form State
  const [shippingData, setShippingData] = useState({
    name: '',
    phone: '',
    zipCode: '',
    address: '',
    addressDetail: '',
  });
  
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const postcodeRef = useRef<HTMLDivElement>(null);

  // Consent State
  const [consents, setConsents] = useState({
    content: false,
    refund: false,
    terms: false,
  });
  const [consentModal, setConsentModal] = useState<{ isOpen: boolean; type: 'content' | 'refund' | 'terms' | null }>({
    isOpen: false,
    type: null,
  });

  // Reset consents when opening bottom sheet
  useEffect(() => {
    if (isBottomSheetOpen) {
      setConsents({ content: false, refund: false, terms: false });
    }
  }, [isBottomSheetOpen]);

  const hasWorkshopItems = React.useMemo(() => 
    selectedItems.some(item => item.product_type === 'workshop'),
    [selectedItems]
  );

  const isAllConsented = React.useMemo(() => 
    consents.refund && consents.terms && (!hasWorkshopItems || consents.content),
    [consents, hasWorkshopItems]
  );

  // Helper to get the correct supabase client based on active session
  const getClient = () => {
    return supabase;
  };

  // Initialize shipping data from profile
  useEffect(() => {
    if (profile && step === 2) {
      setShippingData({
        name: profile.full_name || '',
        phone: profile.phone_number || '',
        zipCode: profile.zip_code || '',
        address: profile.address || '',
        addressDetail: profile.address_detail || '',
      });
    }
  }, [profile, step]);

  // Daum Postcode Script Loading
  useEffect(() => {
    loadScript('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')
      .catch(err => console.error('Failed to load Daum Postcode script:', err));
  }, []);

  const handleOpenPostcode = () => {
    if (!(window as any).daum || !(window as any).daum.Postcode) {
      setErrorMsg('주소 서비스 로딩 중입니다. 잠시 후 다시 시도해주세요.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    
    setIsPostcodeOpen(true);
    setTimeout(() => {
      if (postcodeRef.current) {
        new (window as any).daum.Postcode({
          oncomplete: (data: any) => {
            let fullAddress = data.address;
            let extraAddress = '';

            if (data.addressType === 'R') {
              if (data.bname !== '') extraAddress += data.bname;
              if (data.buildingName !== '') {
                extraAddress += extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName;
              }
              fullAddress += extraAddress !== '' ? ` (${extraAddress})` : '';
            }

            setShippingData(prev => ({
              ...prev,
              zipCode: data.zonecode,
              address: fullAddress,
            }));
            setIsPostcodeOpen(false);
          },
          width: '100%',
          height: '100%',
        }).embed(postcodeRef.current);
      }
    }, 0);
  };

  const handlePayment = async () => {
    const currentUser = user || adminUser;
    if (!currentUser) return;
    if (!shippingData.name || !shippingData.phone || !shippingData.address || !shippingData.zipCode || !shippingData.addressDetail) {
      setErrorMsg('배송 정보를 모두 입력해 주세요.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    const phoneRegex = /^01([0|1|6|7|8|9])-?([0-9]{3,4})-?([0-9]{4})$/;
    if (!phoneRegex.test(shippingData.phone)) {
      setErrorMsg('올바른 연락처 형식이 아닙니다. (예: 010-0000-0000)');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    if (!isAllConsented) {
      setErrorMsg('필수 약관에 모두 동의해 주세요.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    try {
      setIsProcessing(true);
      const client = getClient();
      
      // 1. 무결성 검증 (Integrity Check)
      if (selectedTotalPrice <= 0) {
        throw new Error('결제 금액이 0원 이하입니다.');
      }
      
      if (selectedItems.length === 0) {
        throw new Error('선택된 상품이 없습니다.');
      }
      
      // 2. Prepare Order Data
      const orderId = crypto.randomUUID();
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${orderId.split('-')[0].toUpperCase()}`;
      
      const pendingOrderData = {
        order_number: orderNumber,
        user_id: currentUser.id,
        user_custom_id: profile?.user_custom_id || null,
        total_price: selectedTotalPrice,
        status: 'PENDING', // Create as PENDING first
        shipping_name: shippingData.name,
        shipping_phone: shippingData.phone,
        zip_code: shippingData.zipCode,
        address: shippingData.address,
        address_detail: shippingData.addressDetail,
        shipping_info: {
          consents: {
            ...consents,
            agreed_at: new Date().toISOString()
          }
        },
        ordered_items: selectedItems.map(item => ({
          product_id: item.product_id,
          title: item.product?.title || (item.product_id === 'workshop-single' ? '커스텀 포스터' : '제품'),
          option: item.product_id === 'workshop-single' ? item.custom_config?.size : item.selected_option,
          quantity: item.quantity,
          price: item.product_id === 'workshop-single' ? (item.custom_config?.price || 0) : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0),
          user_image_url: item.custom_image,
          front_image: item.product?.front_image || item.product?.image,
          custom_config: item.custom_config
        }))
      };

      // 2. Insert PENDING order to DB securely
      const { data: insertedOrder, error: insertError } = await client
        .from('orders')
        .insert([pendingOrderData])
        .select()
        .single();
        
      if (insertError) {
        console.error('Order creation error:', insertError);
        throw new Error('주문 생성에 실패했습니다.');
      }

      // 3. Prepare and Insert Order Items Data
      const pendingOrderItems = selectedItems.map(item => {
        // Calculate price based on item type
        let price = 0;
        let title = '';
        let optionName = '';

        if (item.product_id === 'workshop-single') {
          price = item.custom_config?.price || 0;
          title = item.product?.title || '커스텀 포스터';
          optionName = item.custom_config?.size || '커스텀';
        } else {
          const option = item.product?.options?.find(opt => opt.id === item.selected_option);
          price = option ? option.price : 0;
          title = item.product?.title || '제품';
          optionName = option ? option.name : (item.selected_option || '');
        }
        
        return {
          order_id: insertedOrder.id,
          product_id: item.product_id === 'workshop-single' ? null : item.product_id,
          product_title: title,
          option: optionName,
          quantity: item.quantity,
          price: price,
        };
      });

      const { error: itemsError } = await client
        .from('order_items')
        .insert(pendingOrderItems);

      if (itemsError) {
        console.error('Order items creation error:', itemsError);
        // We continue anyway as the main order is created, but log it
      }

      // 4. Initialize Toss Payments
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      
      const orderName = selectedItems.length > 1 
        ? `${selectedItems[0].product?.title || '커스텀 제품'} 외 ${selectedItems.length - 1}건`
        : (selectedItems[0].product?.title || '커스텀 제품');

      await tossPayments.requestPayment('카드', {
        amount: selectedTotalPrice,
        orderId: orderNumber,
        orderName: orderName,
        customerName: shippingData.name,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
      });

      setIsBottomSheetOpen(false);
    } catch (error: any) {
      console.error('Payment Error:', error);
      const errorMessage = error?.message || '결제 요청 중 오류가 발생했습니다.';
      setErrorMsg(errorMessage);
      setTimeout(() => setErrorMsg(''), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNextStep = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(2);
      setIsTransitioning(false);
    }, 600);
  };

  const handlePrevStep = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(1);
      setIsTransitioning(false);
    }, 600);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[30000] flex justify-end pointer-events-auto transform-gpu"
    >
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
      />

      {/* Cinematic Transition Overlay */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[40000] bg-black/40 backdrop-blur-xl flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 border-2 border-white/10 border-t-white rounded-full animate-spin" />
              <span className="text-white font-bold tracking-[0.3em] uppercase text-[10px]">Processing...</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`relative w-full max-w-lg h-full flex flex-col shadow-2xl pointer-events-auto transform-gpu will-change-transform transition-colors duration-500 ${
          theme === 'dark' ? 'bg-[#0F0F11]' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {step === 1 ? '내 컬렉션' : '주문하기'}
          </h2>
          <button 
            onClick={onClose}
            className={`p-2 rounded-full transition-all ${
              theme === 'dark' ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pb-4 flex items-center gap-3 text-base font-bold tracking-tighter">
          <span className={step === 1 ? (theme === 'dark' ? 'text-white' : 'text-black') : 'text-zinc-500'}>1. 내 컬렉션</span>
          <ChevronRight className="text-zinc-500/30" size={16} />
          <span className={step === 2 ? (theme === 'dark' ? 'text-white' : 'text-black') : 'text-zinc-500'}>2. 주문서</span>
          <ChevronRight className="text-zinc-500/30" size={16} />
          <span className="text-zinc-600">3. 결제확인</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain px-6">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="py-4 space-y-4"
              >
                {cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-zinc-500 space-y-4">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                      <ShoppingBag size={32} className="text-zinc-400" />
                    </div>
                    <p className={`text-lg font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>내 컬렉션이 비어있어요</p>
                    <button 
                      onClick={() => {
                        onClose();
                        navigate('/collection');
                      }}
                      className={`px-6 py-3 font-medium rounded-2xl transition-colors mt-2 ${
                        theme === 'dark' ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-black hover:bg-zinc-200'
                      }`}
                    >
                      상품 둘러보기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 pb-8">
                    {/* Select All Toggle */}
                    <div className="flex items-center justify-between px-1 mb-6">
                      <button 
                        onClick={toggleSelectAll}
                        className={`flex items-center gap-2 transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-500 hover:text-black'}`}
                      >
                        <span className={`text-sm font-bold tracking-tight ${selectedIds.size === cartItems.length ? 'text-fuchsia-500' : ''}`}>
                          전체 선택
                        </span>
                        <span className="text-xs text-zinc-500 font-medium">({selectedIds.size}/{cartItems.length})</span>
                      </button>
                    </div>

                    {cartItems.map((item) => {
                      const isWorkshop = item.product_type === 'workshop';
                      const title = isWorkshop ? (item.product?.title || '커스텀 포스터') : (item.product?.title || '제품');
                      const optionName = isWorkshop ? (item.custom_config?.size || '커스텀 옵션') : (item.product?.options?.find(opt => opt.id === item.selected_option)?.name || '기본 옵션');
                      const price = isWorkshop ? (item.custom_config?.price || 0) : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0);
                      const image = item.custom_image || item.product?.front_image || item.product?.image || undefined;
                      const isSelected = selectedIds.has(item.id);
                      
                      const handleItemClick = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        onClose();
                        if (isWorkshop) {
                          navigate(`/workshop/detail`, { state: { cartItem: item } });
                        } else {
                          navigate(`/product/${item.product_id}`);
                        }
                      };

                      return (
                        <div 
                          key={item.id} 
                          onClick={() => toggleItemSelection(item.id)}
                          className={`p-6 rounded-[32px] flex gap-6 transition-all cursor-pointer border-[1.5px] ${
                            theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-zinc-50'
                          } ${
                            isSelected 
                              ? 'border-fuchsia-500/60 bg-fuchsia-500/[0.08] shadow-[0_0_30px_rgba(217,70,239,0.08)]' 
                              : 'border-transparent'
                          }`}
                        >
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemClick(e);
                            }}
                            className={`w-24 h-24 rounded-2xl overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}
                          >
                            <img 
                              src={image} 
                              alt={title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </button>
                          <div className="flex-1 flex flex-col justify-between py-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className={`font-semibold text-lg leading-tight tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{title}</h3>
                                <p className="text-zinc-500 text-sm mt-2">{optionName}</p>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromCart(item.id);
                                }}
                                className={`p-2 -mr-2 -mt-2 rounded-full transition-colors ${theme === 'dark' ? 'text-zinc-600 hover:text-white hover:bg-zinc-800' : 'text-zinc-400 hover:text-black hover:bg-zinc-100'}`}
                              >
                                <X size={18} />
                              </button>
                            </div>
                            <div className="flex justify-between items-end mt-4">
                              <div className={`flex items-center rounded-full p-1 ${theme === 'dark' ? 'bg-zinc-900/80' : 'bg-zinc-200/80'}`}>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(item.id, item.quantity - 1);
                                  }}
                                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-black hover:bg-zinc-300'}`}
                                >
                                  <Minus size={16} />
                                </button>
                                <span className={`w-8 text-center text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{item.quantity}</span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateQuantity(item.id, item.quantity + 1);
                                  }}
                                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-black hover:bg-zinc-300'}`}
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              <p className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-black'}`}>₩{(price * item.quantity).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="py-4 space-y-8 pb-8"
              >
                <section>
                  <h3 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>주문 상품</h3>
                  <div className={`rounded-3xl p-5 space-y-3 ${theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-zinc-50'}`}>
                    {selectedItems.map(item => {
                      const isWorkshop = item.product_type === 'workshop';
                      const title = isWorkshop ? (item.product?.title || '커스텀 포스터') : (item.product?.title || '제품');
                      const price = isWorkshop ? (item.custom_config?.price || 0) : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0);
                      return (
                        <div key={item.id} className="flex justify-between items-center text-sm">
                          <div className="flex flex-col">
                            <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{title}</span>
                            <span className="text-zinc-500 text-xs">수량 {item.quantity}개</span>
                          </div>
                          <span className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>₩{(price * item.quantity).toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>배송지 정보</h3>
                  <div className={`rounded-3xl p-5 space-y-5 ${theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-zinc-50'}`}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2 ml-1">받는 사람</label>
                        <input 
                          type="text"
                          value={shippingData.name}
                          onChange={(e) => setShippingData({...shippingData, name: e.target.value})}
                          className={`w-full border-none rounded-2xl px-4 py-4 text-base md:text-sm placeholder:text-zinc-600 focus:ring-2 focus:ring-[#3182F6] transition-all ${
                            theme === 'dark' ? 'bg-zinc-800/50 text-white' : 'bg-zinc-200/50 text-black'
                          }`}
                          placeholder="이름을 입력해주세요"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-2 ml-1">연락처</label>
                        <input 
                          type="tel"
                          value={shippingData.phone}
                          onChange={(e) => setShippingData({...shippingData, phone: e.target.value})}
                          className={`w-full border-none rounded-2xl px-4 py-4 text-base md:text-sm placeholder:text-zinc-600 focus:ring-2 focus:ring-[#3182F6] transition-all ${
                            theme === 'dark' ? 'bg-zinc-800/50 text-white' : 'bg-zinc-200/50 text-black'
                          }`}
                          placeholder="010-0000-0000"
                        />
                      </div>
                    </div>
                    
                    <div className={`h-[1px] my-2 ${theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-200'}`} />
                    
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-zinc-400 mb-2 ml-1">주소</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          readOnly
                          value={shippingData.zipCode}
                          className={`w-28 border-none rounded-2xl px-4 py-4 text-base md:text-sm focus:ring-2 focus:ring-[#3182F6] transition-all ${
                            theme === 'dark' ? 'bg-zinc-800/50 text-white' : 'bg-zinc-200/50 text-black'
                          }`}
                          placeholder="우편번호"
                        />
                        <button 
                          onClick={handleOpenPostcode}
                          className={`px-6 font-medium rounded-2xl transition-all ${
                            theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-200 hover:bg-zinc-300 text-black'
                          }`}
                        >
                          주소 검색
                        </button>
                      </div>
                      
                      {isPostcodeOpen && (
                        <div className={`mt-4 border rounded-2xl overflow-hidden ${theme === 'dark' ? 'bg-white border-zinc-800' : 'bg-white border-zinc-200'}`}>
                          <div className={`flex justify-between items-center p-3 border-b ${theme === 'dark' ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-50 border-zinc-200'}`}>
                            <span className="text-sm font-bold text-zinc-800">우편번호 검색</span>
                            <button onClick={() => setIsPostcodeOpen(false)} className="text-zinc-500 hover:text-zinc-800 p-1"><X size={18} /></button>
                          </div>
                          <div ref={postcodeRef} className="w-full h-[400px]" />
                        </div>
                      )}
                      
                      <input 
                        type="text"
                        readOnly
                        value={shippingData.address}
                        className={`w-full border-none rounded-2xl px-4 py-4 text-base md:text-sm focus:ring-2 focus:ring-[#3182F6] transition-all ${
                          theme === 'dark' ? 'bg-zinc-800/50 text-white' : 'bg-zinc-200/50 text-black'
                        }`}
                        placeholder="기본 주소"
                      />
                      <input 
                        type="text"
                        value={shippingData.addressDetail}
                        onChange={(e) => setShippingData({...shippingData, addressDetail: e.target.value})}
                        className={`w-full border-none rounded-2xl px-4 py-4 text-base md:text-sm placeholder:text-zinc-600 focus:ring-2 focus:ring-[#3182F6] transition-all ${
                          theme === 'dark' ? 'bg-zinc-800/50 text-white' : 'bg-zinc-200/50 text-black'
                        }`}
                        placeholder="상세 주소를 입력해주세요"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <h3 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>결제 수단</h3>
                  <div className={`relative rounded-2xl p-6 border-2 shadow-[0_0_15px_rgba(217,70,239,0.15)] transition-all cursor-pointer group overflow-hidden ${
                    theme === 'dark' ? 'bg-[#1C1C1E] border-fuchsia-500/50' : 'bg-zinc-50 border-fuchsia-500/30'
                  }`}>
                    {/* Subtle gradient background for active state */}
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 pointer-events-none" />
                    
                    <div className="relative z-10 flex justify-between items-start">
                      <div className="flex flex-col">
                        <p className={`font-extrabold text-xl tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>간편 결제</p>
                        <p className={`text-sm font-medium mt-1 ${theme === 'dark' ? 'text-white/60' : 'text-black/60'}`}>신용/체크카드 및 간편 결제 지원</p>
                      </div>
                      <CheckCircle2 className="text-fuchsia-500 drop-shadow-[0_0_8px_rgba(217,70,239,0.5)]" size={24} />
                    </div>

                    <div className="relative z-10 flex items-center gap-3 mt-6">
                      <div className="w-11 h-11 bg-[#3182F6] rounded-full flex items-center justify-center text-white font-bold text-xs italic border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                        toss
                      </div>
                      <div className="w-11 h-11 bg-[#FEE500] rounded-full flex items-center justify-center text-[#191919] font-bold text-xs border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                        pay
                      </div>
                      <div className="w-11 h-11 bg-[#03C75A] rounded-full flex items-center justify-center text-white font-bold text-xs border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                        N
                      </div>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`px-6 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))] border-t transition-colors duration-500 ${theme === 'dark' ? 'bg-[#0F0F11] border-white/5' : 'bg-white border-black/5'}`}>
          <div className="flex justify-between items-end mb-6 px-2">
            <span className="text-zinc-400 font-medium">총 결제 금액</span>
            <span className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>₩{displayPrice.toLocaleString()}</span>
          </div>
          
          {errorMsg && (
            <div className="text-center text-red-500 text-sm font-bold animate-pulse bg-red-500/10 py-2 rounded-xl backdrop-blur-md border border-red-500/20 mb-4">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-3">
            {step === 2 && (
              <button 
                onClick={handlePrevStep}
                className={`w-1/3 h-14 font-semibold rounded-2xl transition-all ${
                  theme === 'dark' ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-black hover:bg-zinc-200'
                }`}
              >
                이전
              </button>
            )}
            <button 
              onClick={step === 1 ? handleNextStep : () => setIsBottomSheetOpen(true)}
              disabled={selectedItems.length === 0 || isProcessing}
              className={`flex-1 h-14 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-2 transition-all ${
                selectedItems.length === 0 || isProcessing
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'btn-cyberpunk'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                step === 1 ? (selectedIds.size === 0 ? '상품을 선택해주세요' : '주문하기') : '결제하기'
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Consent Detail Modal */}
      <AnimatePresence>
        {consentModal.isOpen && consentModal.type && (
          <div className="fixed inset-0 z-[100003] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConsentModal({ isOpen: false, type: null })}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-md rounded-[32px] overflow-hidden border shadow-2xl transition-colors duration-500 ${
                theme === 'dark' ? 'bg-[#1C1C1E] border-white/10' : 'bg-white border-black/5'
              }`}
            >
              <div className={`p-6 border-b flex justify-between items-center ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                <h4 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{CONSENT_TEXTS[consentModal.type].title}</h4>
                <button 
                  onClick={() => setConsentModal({ isOpen: false, type: null })}
                  className={`p-2 transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-black'}`}
                >
                  <X size={20} />
                </button>
              </div>
              <div className={`p-8 max-h-[60vh] overflow-y-auto overscroll-contain space-y-6 ${theme === 'dark' ? 'bg-black' : 'bg-zinc-50'}`}>
                {CONSENT_TEXTS[consentModal.type].items.map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="mt-2 w-1.5 h-1.5 rounded-full bg-fuchsia-500 shrink-0 shadow-[0_0_8px_rgba(217,70,239,0.5)]" />
                    <p 
                      className={`text-base leading-relaxed tracking-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}
                      dangerouslySetInnerHTML={{ __html: item }}
                    />
                  </div>
                ))}
              </div>
              <div className={`p-6 ${theme === 'dark' ? 'bg-zinc-900/50' : 'bg-zinc-100'}`}>
                <button 
                  onClick={() => setConsentModal({ isOpen: false, type: null })}
                  className={`w-full h-12 font-bold rounded-xl transition-colors ${
                    theme === 'dark' ? 'bg-white text-black hover:bg-zinc-200' : 'bg-black text-white hover:bg-zinc-800'
                  }`}
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toss-style Consent Bottom Sheet */}
      <AnimatePresence>
        {isBottomSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBottomSheetOpen(false)}
              className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed bottom-0 left-0 right-0 z-[10002] rounded-t-[32px] border-t shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-hidden transition-colors duration-500 ${
                theme === 'dark' ? 'bg-[#1C1C1E] border-white/10' : 'bg-white border-black/5'
              }`}
            >
              {/* Handle Bar */}
              <div className="w-full flex justify-center pt-3 pb-2">
                <div className={`w-12 h-1.5 rounded-full ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
              </div>
              
              <div className="px-6 pb-16 pt-4">
                <div className="flex justify-between items-center mb-8">
                  <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>최종 동의</h3>
                  <button 
                    onClick={() => setIsBottomSheetOpen(false)}
                    className={`p-2 transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-black'}`}
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6 mb-10">
                  {hasWorkshopItems && (
                    <div className="flex items-center justify-between group">
                      <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                        <div 
                          onClick={() => setConsents(prev => ({ ...prev, content: !prev.content }))}
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                            consents.content ? 'bg-fuchsia-500 border-fuchsia-500' : (theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400')
                          }`}
                        >
                          {consents.content && <Check size={16} className="text-white" />}
                        </div>
                        <span className={`text-base font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          <span className="text-fuchsia-500 mr-1">(필수)</span>
                          콘텐츠 권리 책임 동의
                        </span>
                      </label>
                      <button 
                        onClick={() => setConsentModal({ isOpen: true, type: 'content' })}
                        className={`text-sm underline underline-offset-4 px-3 py-2 transition-colors ${
                          theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                        }`}
                      >
                        보기
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between group">
                    <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                      <div 
                        onClick={() => setConsents(prev => ({ ...prev, refund: !prev.refund }))}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          consents.refund ? 'bg-fuchsia-500 border-fuchsia-500' : (theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400')
                        }`}
                      >
                        {consents.refund && <Check size={16} className="text-white" />}
                      </div>
                      <span className={`text-base font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        <span className="text-fuchsia-500 mr-1">(필수)</span>
                        환불 정책 동의
                      </span>
                    </label>
                    <button 
                      onClick={() => setConsentModal({ isOpen: true, type: 'refund' })}
                      className={`text-sm underline underline-offset-4 px-3 py-2 transition-colors ${
                        theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      보기
                    </button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                      <div 
                        onClick={() => setConsents(prev => ({ ...prev, terms: !prev.terms }))}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          consents.terms ? 'bg-fuchsia-500 border-fuchsia-500' : (theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400')
                        }`}
                      >
                        {consents.terms && <Check size={16} className="text-white" />}
                      </div>
                      <span className={`text-base font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        <span className="text-fuchsia-500 mr-1">(필수)</span>
                        전체 약관 동의
                      </span>
                    </label>
                    <button 
                      onClick={() => setConsentModal({ isOpen: true, type: 'terms' })}
                      className={`text-sm underline underline-offset-4 px-3 py-2 transition-colors ${
                        theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                    >
                      보기
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={handlePayment}
                  disabled={!isAllConsented || isProcessing}
                  className={`w-full h-16 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-2 transition-all ${
                    !isAllConsented || isProcessing
                      ? (theme === 'dark' ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-200 text-zinc-400') + ' cursor-not-allowed'
                      : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 shadow-[0_0_20px_rgba(217,70,239,0.3)] active:scale-[0.98]'
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    '동의하고 결제하기'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
