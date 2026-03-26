import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import Poster3D from './Poster3D';
import LoginModal from './LoginModal';
import { Box, Check, Truck, ShieldCheck, ArrowLeft, AlertCircle, Loader2, RotateCw, Frame, RefreshCw } from 'lucide-react';
import Skeleton from './Skeleton';

declare global {
  interface Window {
    IMP: any;
  }
}

function CanvasLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="text-white/20 animate-spin" size={32} />
        <span className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Loading 3D Model...</span>
      </div>
    </div>
  );
}

class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Canvas Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="text-red-500/50" size={32} />
            <p className="text-white/60 text-xs font-light leading-relaxed">
              3D 모델을 불러오는 중 오류가 발생했습니다.<br />
              페이지를 새로고침하거나 나중에 다시 시도해주세요.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/80 text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { products, fetchProducts, isLoading, isError } = useProducts();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { addToCart, refreshCart } = useCart();
  const product = products.find((p) => p.id === id);
  const navigate = useNavigate();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [cartParticles, setCartParticles] = useState<{ id: number; x: number; y: number; img: string }[]>([]);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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

  if (isLoading && products.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-24 space-y-8">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-full h-[500px] flex flex-col items-center justify-center bg-black px-6 text-center">
        <div className="bg-zinc-900/50 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="text-red-400 w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">
            대표님, 서버 응답이 조금 늦네요.
          </h3>
          <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
            메타로라의 마스터피스 데이터를 불러오는 중<br/>
            일시적인 지연이 발생했습니다.
          </p>
          <button
            onClick={fetchProducts}
            className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-2xl transition-all transform active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
          >
            <RefreshCw size={18} />
            다시 불러오기
          </button>
        </div>
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
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        if (userError.message?.includes('Lock was stolen') || String(userError).includes('Lock was stolen')) {
          showToast('인증 세션 충돌이 발생했습니다. 다시 시도해주세요.', 'error');
          return;
        }
        throw userError;
      }

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
      
      // 파티클 애니메이션 실행
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const newParticle = { id: Date.now(), x: startX, y: startY, img: product.front_image || product.image };
        
        setCartParticles(prev => [...prev, newParticle]);
        
        setTimeout(() => {
          setCartParticles(prev => prev.filter(p => p.id !== newParticle.id));
        }, 1200);
      }

      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 3000);
      showToast('내 컬렉션에 안전하게 담겼습니다', 'success');
    } catch (error: any) {
      // 상세 에러 콘솔 출력
      console.error('Add to Collection Failed:', error.message || error);
      showToast('컬렉션 담기에 실패했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] pt-4 flex flex-col relative z-10">
      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 w-full pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Left Column: Image & Visuals */}
          <div className="space-y-6">
            <Link to="/" className="group inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-4 py-2 pr-4">
              <motion.div className="group-hover:-translate-x-1 transition-transform duration-300 ease-out">
                <ArrowLeft size={16} strokeWidth={1.5} />
              </motion.div>
              <span className="text-[10px] font-light uppercase tracking-[0.2em]">COLLECTION</span>
            </Link>

            <div className="py-0 -mx-4 sm:mx-0"> {/* Safe Scroll Area */}
              <div 
                ref={canvasContainerRef}
                className="relative aspect-square w-full md:w-[150%] md:-ml-[25%] lg:w-[150%] lg:-ml-[25%] overflow-visible bg-transparent cursor-grab active:cursor-grabbing"
              >
                <CanvasErrorBoundary>
                  <Canvas 
                    frameloop="always"
                    shadows 
                    dpr={[1, 2]} 
                    gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
                    camera={{ position: [0, 0, 3.5], fov: 40 }}
                    onPointerDown={() => setHasInteracted(true)}
                    onCreated={({ gl }) => {
                      gl.outputColorSpace = THREE.SRGBColorSpace;
                      gl.setClearColor(0x000000, 0); // Transparent background
                      window.dispatchEvent(new CustomEvent('3d-poster-loaded'));
                    }}
                    style={{ background: 'transparent' }}
                  >
                    <Suspense fallback={<Html center><CanvasLoader /></Html>}>
                      <Poster3D 
                        product={product}
                        scale={1.8}
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
                </CanvasErrorBoundary>
                
                <AnimatePresence>
                  {!hasInteracted && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none bg-transparent"
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

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none">
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
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="relative z-10"
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
                      disabled={isSoldOut || isAddingToCart || isAdded}
                      className={`flex-1 font-bold text-xl tracking-tight h-[64px] rounded-2xl transition-all active:scale-95 duration-150 shadow-2xl flex items-center justify-center gap-3 border-[0.5px] ${
                        isSoldOut 
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-transparent' 
                          : isAdded
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-white text-black hover:bg-zinc-100 shadow-white/10 border-white/20'
                      }`}
                    >
                      {isAddingToCart ? (
                        <>
                          <Loader2 className="animate-spin" size={24} />
                          <span className="ml-1">컬렉션에 담는 중...</span>
                        </>
                      ) : isAdded ? (
                        <>
                          <Check size={24} className="text-green-400" />
                          <span className="ml-1">컬렉션에 담겼습니다</span>
                        </>
                      ) : isSoldOut ? (
                        '품절'
                      ) : (
                        <div className="flex items-center justify-center gap-3">
                          <Frame size={24} />
                          <span>ADD TO COLLECTION</span>
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

      {/* SPECIFICATION Section */}
      <div className="w-full bg-[#000000] border-t border-white/5 pt-32 pb-48 relative z-10">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-center text-[10px] font-light tracking-[0.5em] text-zinc-500 mb-32 uppercase">SPECIFICATION</h2>
          
          <div className="space-y-40">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="text-center space-y-8"
            >
              <h3 className="text-4xl md:text-5xl font-extrabold text-white tracking-[-0.05em]">1.15mm의 두께</h3>
              <p className="text-zinc-400 text-lg md:text-xl font-light max-w-2xl mx-auto leading-relaxed break-keep">
                프리미엄 알루미늄이 선사하는 얇지만 강인한 물성. 공간을 차지하지 않으면서도 압도적인 존재감을 발산합니다.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="text-center space-y-8"
            >
              <h3 className="text-4xl md:text-5xl font-extrabold text-white tracking-[-0.05em]">200℃ 고온 승화전사</h3>
              <p className="text-zinc-400 text-lg md:text-xl font-light max-w-2xl mx-auto leading-relaxed break-keep">
                변색 없이 영원히 지속되는 8K 해상도의 선명함. 분자 속에 스며든 안료가 빛을 머금고 영원히 빛납니다.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="text-center space-y-8"
            >
              <h3 className="text-4xl md:text-5xl font-extrabold text-white tracking-[-0.05em]">마그네틱 마운트</h3>
              <p className="text-zinc-400 text-lg md:text-xl font-light max-w-2xl mx-auto leading-relaxed break-keep">
                못 없이 벽면에 밀착되는 혁신적인 설치 방식. 공간의 손상 없이 완벽한 갤러리를 완성합니다.
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Cart Particle Animation */}
      {cartParticles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: p.x - 20, y: p.y - 20, scale: 1, opacity: 1 }}
          animate={{ 
            x: window.innerWidth - 60, 
            y: 20, 
            scale: 0.5, 
            opacity: 0
          }}
          transition={{ 
            duration: 0.8,
            ease: [0.16, 1, 0.3, 1]
          }}
          className="fixed z-[100] pointer-events-none w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.8)]"
        >
          <Frame size={20} className="text-black" />
        </motion.div>
      ))}
    </div>
  );
}
