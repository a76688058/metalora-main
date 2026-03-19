import React, { useState, useEffect, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import Poster3D from './Poster3D';
import Payment from './Payment';
import ShippingModal from './ShippingModal';
import LoginModal from './LoginModal';
import { Box, Check, Truck, ShieldCheck, ArrowLeft, AlertCircle, Loader2, RotateCw, Frame } from 'lucide-react';
import Skeleton from './Skeleton';

declare global {
  interface Window {
    IMP: any;
  }
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { products, fetchProducts } = useProducts();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { addToCart, refreshCart } = useCart();
  const product = products.find((p) => p.id === id);
  const navigate = useNavigate();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Set initial selected option
  useEffect(() => {
    if (product?.options && product.options.length > 0) {
      const firstAvailable = product.options.find(opt => opt.isActive && opt.stock > 0) || product.options[0];
      setSelectedOptionId(firstAvailable.id);
    }
  }, [product]);

  if (products.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-24 space-y-8">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (!product) {
    return <div className="text-white text-center py-20">상품을 찾을 수 없습니다</div>;
  }

  const selectedOption = product.options?.find(opt => opt.id === selectedOptionId);
  const isSoldOut = !selectedOption || selectedOption.stock <= 0 || !selectedOption.isActive;
  const currentPrice = selectedOption ? selectedOption.price : 0;

  const handleAddToCart = async () => {
    // 1. 데이터 검증
    if (!product?.id || !selectedOptionId) {
      showToast('상품 옵션을 선택해주세요.', 'error');
      return;
    }

    // 2. 세션 체크
    if (!user) {
      showToast('로그인이 필요한 서비스입니다.', 'info');
      setIsLoginModalOpen(true);
      return;
    }

    try {
      setIsAddingToCart(true);
      
      // Get current user session explicitly
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        showToast('로그인이 필요한 서비스입니다.', 'info');
        setIsLoginModalOpen(true);
        return;
      }

      // 3. DB 삽입 (Supabase cart_items 테이블)
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('product_id', product.id)
        .eq('selected_option', selectedOptionId)
        .single();

      if (existingItem) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + 1 })
          .eq('id', existingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cart_items')
          .insert([
            {
              user_id: currentUser.id,
              product_id: product.id,
              selected_option: selectedOptionId,
              quantity: 1
            }
          ]);
        if (error) throw error;
      }

      // 4. 성공 피드백
      await refreshCart();
      showToast('내 컬렉션에 안전하게 담겼습니다', 'success');
    } catch (error: any) {
      // 상세 에러 콘솔 출력
      console.error('Add to Collection Failed:', error.message || error);
      showToast('컬렉션 담기에 실패했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handlePayment = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setErrorMsg('');
    
    try {
      setIsRedirecting(true); // 버튼 로딩 시작 (결제 준비 중...)
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsRedirecting(false);
        setIsLoginModalOpen(true);
        return; // 여기서 반드시 종료
      }

      if (isSoldOut) {
        setIsRedirecting(false);
        setErrorMsg('선택하신 사이즈는 품절되었습니다.');
        return;
      }

      // 1. 결제 버튼 클릭 시 제일 먼저 Supabase에서 현재 로그인한 유저의 profiles 데이터를 select 해옴.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      // PGRST116 (데이터 없음) 에러는 무시하고 진행
      if (error && error.code !== 'PGRST116') throw error;

      // ★ [핵심 방어] data가 null일 수 있으므로 반드시 옵셔널 체이닝(?.) 사용
      if (data?.address && data?.full_name) {
        setIsRedirecting(false); // ★ 모달을 띄우지 않을 거라면 여기서 반드시 로딩을 먼저 꺼야 함!
        showToast("배송지 확인 완료. 결제 모듈로 이동합니다.", "success"); 
        setIsPaymentOpen(true);
      } else {
        setIsRedirecting(false); // ★ 모달을 띄우기 전에도 버튼 로딩은 꺼야 함!
        setIsShippingModalOpen(true);
      }
    } catch (err: any) {
      console.error("결제 준비 중 오류:", err.message);
      setErrorMsg("결제 준비 중 오류: " + err.message);
      setIsRedirecting(false); // 에러 시 로딩 해제
      // 에러 시 안전하게 모달 띄우기
      setIsShippingModalOpen(true);
    }
  };

  const handleShippingSuccess = () => {
    setIsShippingModalOpen(false);
    setIsPaymentOpen(true);
  };

  return (
    <div className="min-h-screen bg-black pt-4 flex flex-col relative">
      {/* Shipping Info Modal */}
      <ShippingModal
        isOpen={isShippingModalOpen}
        onClose={() => setIsShippingModalOpen(false)}
        onSuccess={handleShippingSuccess}
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* Payment Modal */}
      <Payment 
        isOpen={isPaymentOpen} 
        onClose={() => setIsPaymentOpen(false)} 
        price={currentPrice} 
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 w-full pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Left Column: Image & Visuals */}
          <div className="space-y-6">
            <Link to="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4">
              <ArrowLeft size={16} />
              <span className="text-sm uppercase tracking-widest">컬렉션으로 돌아가기</span>
            </Link>

            <div className="py-8"> {/* Safe Scroll Area */}
              <div 
                className="relative aspect-square rounded-3xl overflow-hidden bg-[#121212] shadow-2xl shadow-black/50 border border-white/5 cursor-grab active:cursor-grabbing"
              >
                <Canvas 
                  shadows 
                  dpr={[1, 2]} 
                  gl={{ antialias: true, preserveDrawingBuffer: true }}
                  camera={{ position: [0, 0, 4.5], fov: 45 }}
                  onPointerDown={() => setHasInteracted(true)}
                  onCreated={({ gl }) => {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                  }}
                >
                  <Suspense fallback={null}>
                    <Poster3D 
                      imageUrl={product.front_image || product.image} 
                      backImageUrl={product.back_image || product.backImage}
                      scale={1.2}
                    />
                    <OrbitControls 
                      onStart={() => setHasInteracted(true)}
                      enablePan={false} 
                      enableZoom={true} 
                      minDistance={1.8}
                      maxDistance={10}
                      autoRotate={true}
                      autoRotateSpeed={0.5}
                      minPolarAngle={Math.PI / 4} 
                      maxPolarAngle={Math.PI / 1.5} 
                    />
                  </Suspense>
                </Canvas>
                
                <AnimatePresence>
                  {!hasInteracted && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/10 backdrop-blur-[2px]"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-white/60 text-xs font-light tracking-widest animate-pulse">
                          손가락으로 자유롭게 돌려보세요
                        </span>
                        <RotateCw className="text-white/40 animate-spin-slow" size={16} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute bottom-6 left-6 pointer-events-none">
                  <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                    <Box size={14} />
                    <span>Interactive 3D Experience</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-8 text-zinc-500">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                  <span className="text-sm font-bold text-zinc-400">1.15</span>
                </div>
                <span className="text-[10px] font-medium tracking-wider">1.15mm 두께</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                  <Box size={18} className="text-zinc-400" />
                </div>
                <span className="text-[10px] font-medium tracking-wider">마그네틱 마운트</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                  <ShieldCheck size={18} className="text-zinc-400" />
                </div>
                <span className="text-[10px] font-medium tracking-wider">양면 승화전사</span>
              </div>
            </div>
          </div>

          {/* Right Column: Product Info */}
          <div className="lg:pt-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-2">
                {product.limited && (
                  <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider border border-yellow-400/30 px-2 py-0.5 rounded bg-yellow-400/10">
                    한정판
                  </span>
                )}
                {product.created_at && (new Date().getTime() - new Date(product.created_at).getTime()) / (1000 * 3600 * 24) <= 7 && (
                  <span className="text-green-400 text-xs font-bold uppercase border border-green-500/30 px-2 py-0.5 rounded bg-green-500/10">
                    신상품
                  </span>
                )}
              </div>
              <h1 className="text-5xl font-extrabold text-white mb-10 tracking-tight leading-tight">{product.title}</h1>
              <div className="text-3xl font-extrabold text-white mb-10 tracking-tight">₩{currentPrice.toLocaleString()}</div>

              <div className="space-y-8 mb-10">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">작품 설명</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {product.description}
                    <br /><br />
                    METALORA의 모든 작품은 1.15mm 두께의 프리미엄 알루미늄 패널에 200℃ 이상의 고온에서 승화전사 방식으로 제작됩니다. 
                    변색 없이 영원히 지속되는 8K 해상도의 선명함을 경험하세요.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">옵션 선택</h3>
                  <div className="flex flex-col gap-3">
                    {product.options && product.options.length > 0 ? (
                      product.options.filter(opt => opt.isActive).map((option) => {
                        const isOptionSoldOut = option.stock <= 0;
                        
                        return (
                          <button
                            key={option.id}
                            onClick={() => setSelectedOptionId(option.id)}
                            disabled={isOptionSoldOut}
                            className={`flex justify-between items-center px-4 py-3 rounded-lg border text-sm transition-all relative w-full ${
                              selectedOptionId === option.id
                                ? 'border-white bg-white text-black font-bold'
                                : isOptionSoldOut 
                                  ? 'border-white/10 text-zinc-600 cursor-not-allowed bg-zinc-900'
                                  : 'border-white/20 text-zinc-400 hover:border-white/50 hover:text-white'
                            }`}
                          >
                            <div className="flex flex-col items-start">
                              <span>{option.name}</span>
                              <span className={`text-[10px] ${selectedOptionId === option.id ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                {option.dimension}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span>₩{option.price.toLocaleString()}</span>
                              {isOptionSoldOut && (
                                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">품절</span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-zinc-500 text-sm py-2">등록된 옵션이 없습니다.</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                    <ShieldCheck className="text-zinc-400 shrink-0" size={20} />
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">프리미엄 품질</h4>
                      <p className="text-xs text-zinc-400">1.15mm 알루미늄, 8K 초고해상도</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                    <Box className="text-zinc-400 shrink-0" size={20} />
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">마그네틱 마운트</h4>
                      <p className="text-xs text-zinc-400">못 없이 간편한 설치, 벽면 손상 없음</p>
                    </div>
                  </div>
                </div>

                {/* Purchase Button in Flow */}
                <div className="pt-6 space-y-4">
                  {errorMsg && (
                    <div className="text-center text-red-500 text-sm font-bold animate-pulse bg-red-500/10 py-2 rounded-xl backdrop-blur-md border border-red-500/20">
                      {errorMsg}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={handleAddToCart}
                      disabled={isSoldOut || isAddingToCart}
                      className={`flex-1 font-bold text-xl tracking-tight h-[64px] rounded-2xl transition-all active:scale-95 duration-150 shadow-2xl flex items-center justify-center gap-3 ${
                        isSoldOut 
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                          : 'bg-white text-black hover:bg-zinc-100 shadow-white/10'
                      }`}
                    >
                      {isAddingToCart ? (
                        <>
                          <Loader2 className="animate-spin" size={24} />
                          <span className="ml-1">컬렉션에 담는 중...</span>
                        </>
                      ) : isSoldOut ? (
                        '품절'
                      ) : (
                        <div className="flex items-center justify-center gap-3">
                          <Frame size={24} />
                          <span>내 컬렉션에 추가</span>
                        </div>
                      )}
                    </button>
                  </div>
                  
                  <p className="text-center text-zinc-400 text-[10px] font-bold mt-4 flex items-center justify-center gap-2 uppercase tracking-widest opacity-60">
                    <Truck size={14} />
                    5만원 이상 구매 시 무료 배송
                  </p>
                </div>
              </div>

            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
