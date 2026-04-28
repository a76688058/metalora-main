import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import Poster3D, { Poster3DWithFallback } from './Poster3D';
import LoginModal from './LoginModal';
import { Box, Check, Truck, ShieldCheck, ArrowLeft, AlertCircle, Loader2, RotateCw, Frame, RefreshCw, Package, Maximize, X } from 'lucide-react';
import Skeleton from './Skeleton';
import { getFullImageUrl } from '../lib/utils';
import BrandStorySection from './BrandStorySection';
import ProductExperience from './ProductExperience';
import { useTheme } from '../context/ThemeContext';

import LoadingScreen from './LoadingScreen';

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
        <span className="text-white/80 text-[12px] font-bold uppercase tracking-[0.2em]">Loading 3D Model...</span>
      </div>
    </div>
  );
}

class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode, fallback?: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode, fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // Suppress logging here as we already patched console.error
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="text-red-500/50" size={32} />
            <p className="text-white/80 text-[13px] font-light leading-relaxed">
              3D 모델을 불러올 수 없습니다.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const cartItemFromState = location.state?.cartItem;
  const { products, fetchProducts, isLoading, isError } = useProducts();
  const { user, adminUser, profile } = useAuth();
  const { showToast } = useToast();
  const { addToCart, openCart } = useCart();
  const { theme } = useTheme();
  
  const currentUser = user || adminUser;
  let product = products.find((p) => p.id === id);

  // Handle workshop-single from cart state
  if (!product && id === 'workshop-single' && cartItemFromState) {
    product = {
      id: 'workshop-single',
      title: '커스텀 작품',
      artist: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'METALORA Artist',
      image: cartItemFromState.custom_image || '',
      front_image: cartItemFromState.custom_image || '',
      description: 'METALORA 워크숍에서 제작된 세상에 단 하나뿐인 커스텀 작품입니다.',
      limited: true,
      options: [
        {
          id: 'custom',
          name: cartItemFromState.custom_config?.size || '커스텀 옵션',
          price: cartItemFromState.custom_config?.price || 0,
          stock: 1,
          isActive: true,
          dimension: cartItemFromState.custom_config?.size || 'A4'
        }
      ]
    };
  }

  const navigate = useNavigate();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [selectedOrientation, setSelectedOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [cartParticles, setCartParticles] = useState<{ id: number; x: number; y: number; img: string }[]>([]);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  // Set initial selected option and orientation
  useEffect(() => {
    if (product?.options && product.options.length > 0) {
      const firstAvailable = product.options.find(opt => opt.isActive && opt.stock > 0) || product.options[0];
      setSelectedOptionId(firstAvailable.id);
    }
    if (product?.supported_orientations && product.supported_orientations.length > 0) {
      setSelectedOrientation(product.supported_orientations.includes('portrait') ? 'portrait' : 'landscape');
    } else {
      setSelectedOrientation('portrait');
    }
  }, [product]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = 'https://picsum.photos/seed/metalora_fallback/210/297';
    e.currentTarget.onerror = null;
  };

  if (isLoading && products.length === 0) {
    return <LoadingScreen />;
  }

  if (isError) {
    return (
      <div className={`w-full h-[500px] flex flex-col items-center justify-center px-6 text-center ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
        <div className={`backdrop-blur-md border p-8 rounded-3xl max-w-md w-full shadow-[0_0_30px_rgba(0,0,0,0.5)] ${
          theme === 'dark' ? 'bg-zinc-900/50 border-white/10' : 'bg-zinc-100/50 border-black/10'
        }`}>
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="text-red-400 w-8 h-8" />
          </div>
          <h3 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            대표님, 서버 응답이 조금 늦네요.
          </h3>
          <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
            메탈로라의 마스터피스 데이터를 불러오는 중<br/>
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
    return <div className={`text-center py-20 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>상품을 찾을 수 없습니다</div>;
  }

  const selectedOption = product.options?.find(opt => opt.id === selectedOptionId);
  const isSoldOut = !selectedOption || selectedOption.stock <= 0 || !selectedOption.isActive;
  const currentPrice = selectedOption ? selectedOption.price : 0;

  // JSON-LD Product Schema for SEO
  useEffect(() => {
    if (!product) return;
    
    // Product Schema
    const productSchema = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.title,
      "image": [getFullImageUrl(product.front_image || product.image)],
      "description": "변하지 않는 가치, 프리미엄 커스텀 메탈 액자 페널",
      "sku": product.id,
      "brand": {
        "@type": "Brand",
        "name": "METALORA"
      },
      "offers": {
        "@type": "Offer",
        "url": `https://metalora.art/product/${product.id}`,
        "priceCurrency": "KRW",
        "price": currentPrice.toString(),
        "itemCondition": "https://schema.org/NewCondition",
        "availability": "https://schema.org/InStock",
        "seller": {
          "@type": "Organization",
          "name": "METALORA"
        }
      }
    };
    
    const scriptId = 'product-json-ld';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(productSchema);
    
    return () => {
      const existingScript = document.getElementById(scriptId);
      if (existingScript) existingScript.remove();
    };
  }, [product, currentPrice]);

  const handleAddToCart = async () => {
    if (!currentUser) {
      setIsLoginModalOpen(true);
      return;
    }

    if (!product?.id || !selectedOptionId) {
      showToast('상품 옵션을 선택해주세요.', 'error');
      return;
    }

    try {
      setIsAddingToCart(true);
      
      await addToCart(product.id, selectedOptionId, 1, undefined, undefined, selectedOrientation);

      // 파티클 애니메이션 실행
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        const newParticle = { id: Date.now(), x: startX, y: startY, img: selectedOrientation === 'landscape' && product.landscape_image ? product.landscape_image : (product.front_image || product.image) };
        
        setCartParticles(prev => [...prev, newParticle]);
        
        setTimeout(() => {
          setCartParticles(prev => prev.filter(p => p.id !== newParticle.id));
        }, 1200);
      }

      setIsAdded(true);
      
      // 장바구니 열기
      setTimeout(() => {
        openCart();
      }, 800);
    } catch (error: any) {
      console.error('Add to Cart Failed:', error.message || error);
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col relative transition-colors duration-500 ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => setIsLoginModalOpen(false)}
      />

      {/* 3D Interactive Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[50000] backdrop-blur-xl flex flex-col pointer-events-auto transition-colors duration-500 ${
              theme === 'dark' ? 'bg-black/95' : 'bg-white/95'
            }`}
          >
            <div className="absolute top-0 left-0 w-full h-20 flex items-center justify-center px-6 z-20">
              <div className="absolute left-6 flex flex-col">
                <span className="text-[12px] text-cyan-400 font-bold tracking-[0.3em] uppercase mb-1">Interactive</span>
                <h3 className={`font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>3D 프리뷰</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  theme === 'dark' ? 'bg-white/5 border border-white/10 text-white hover:bg-white/10' : 'bg-black/5 border border-black/10 text-black hover:bg-black/10'
                }`}
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 relative">
              <CanvasErrorBoundary fallback={
                <div className="w-full h-full flex items-center justify-center p-8">
                  <img src={getFullImageUrl(selectedOrientation === 'landscape' && product?.landscape_image ? product.landscape_image : (product?.front_image || product?.image)) || undefined} alt="Preview" className="max-w-full max-h-full object-contain" />
                </div>
              }>
                <Canvas shadows camera={{ position: [0, 0, 3], fov: 45 }}>
                  <Suspense fallback={null}>
                    <Poster3D 
                      product={product}
                      interactive={true}
                      scale={1.2}
                      orientation={selectedOrientation}
                    />
                    <OrbitControls 
                      enablePan={false}
                      enableZoom={true}
                      minDistance={1.5}
                      maxDistance={6}
                    />
                    <Environment preset={theme === 'dark' ? "studio" : "city"} environmentIntensity={0.3} />
                  </Suspense>
                  <ContactShadows position={[0, -1.2, 0]} opacity={0.4} scale={6} blur={2.5} far={2} color={theme === 'dark' ? "#000000" : "#333333"} />
                </Canvas>
              </CanvasErrorBoundary>

              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-3 w-full px-6">
                <div className={`px-6 py-3 backdrop-blur-md rounded-full border flex items-center gap-3 whitespace-nowrap ${
                  theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'
                }`}>
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className={`text-[13px] font-bold tracking-wider ${theme === 'dark' ? 'text-white' : 'text-black'}`}>이리저리 자유롭게 돌려보세요</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 w-full pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Left Column: Image & Visuals */}
          <div className="space-y-6">
            <button onClick={handleBack} className={`group inline-flex items-center gap-2 transition-colors mb-4 py-2 pr-4 transform-gpu ${theme === 'dark' ? 'text-white/70 hover:text-white' : 'text-black/70 hover:text-black'}`}>
              <motion.div className="group-hover:-translate-x-1 transition-transform duration-300 ease-out transform-gpu">
                <ArrowLeft size={16} strokeWidth={1.5} />
              </motion.div>
              <span className="text-[12px] font-light uppercase tracking-[0.2em]">SHOP</span>
            </button>

            <div className="py-0 -mx-4 sm:mx-0 transform-gpu"> {/* Safe Scroll Area */}
              <div 
                ref={canvasContainerRef}
                className="relative aspect-square w-full lg:w-[110%] lg:-ml-[5%] overflow-visible bg-transparent transform-gpu"
              >
                <div className={`absolute top-4 left-4 z-10 px-3 py-1.5 backdrop-blur-md rounded-full border text-[12px] tracking-widest font-bold uppercase flex items-center gap-2.5 ${
                  theme === 'dark' ? 'bg-black/60 border-white/20 text-white' : 'bg-white/80 border-black/10 text-black'
                }`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live 3D Preview
                </div>
                
                <motion.button 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  onClick={() => setIsModalOpen(true)}
                  className={`absolute top-4 right-4 p-3 backdrop-blur-md rounded-full border z-10 transition-colors ${
                    theme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-black/5 border-black/10 hover:bg-black/10'
                  }`}
                >
                  <Maximize size={18} className={theme === 'dark' ? 'text-white' : 'text-black'} />
                </motion.button>

                <CanvasErrorBoundary fallback={
                  <div className="w-full h-full flex items-center justify-center p-8">
                    {getFullImageUrl(selectedOrientation === 'landscape' && product.landscape_image ? product.landscape_image : (product.front_image || product.image)) ? (
                      <img 
                        src={getFullImageUrl(selectedOrientation === 'landscape' && product.landscape_image ? product.landscape_image : (product.front_image || product.image)) || undefined} 
                        alt={`${product.title} - 프리미엄 커스텀 메탈 액자 상세 이미지`} 
                        onError={handleImageError}
                        className="w-full h-full object-contain drop-shadow-2xl" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-800">
                        <Package size={64} />
                      </div>
                    )}
                  </div>
                }>
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
                    style={{ background: 'transparent', pointerEvents: 'none' }}
                  >
                    <Poster3DWithFallback 
                      product={product} 
                      interactive={false} 
                      autoRotate={true}
                      scale={1.8}
                      orientation={selectedOrientation}
                    />
                  </Canvas>
                </CanvasErrorBoundary>
                
                <AnimatePresence>
                  {/* Interaction guide removed from main view as it's now view-only */}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-8 text-zinc-500">
              <div className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-zinc-100 border-black/5'}`}>
                  <span className="text-sm font-bold text-zinc-400">1.15</span>
                </div>
                <span className="text-[12px] font-medium tracking-wider">1.15mm 두께</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-zinc-100 border-black/5'}`}>
                  <Box size={18} className="text-zinc-400" />
                </div>
                <span className="text-[12px] font-medium tracking-wider">마그네틱 마운트</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${theme === 'dark' ? 'bg-zinc-900 border-white/5' : 'bg-zinc-100 border-black/5'}`}>
                  <ShieldCheck size={18} className="text-zinc-400" />
                </div>
                <span className="text-[12px] font-medium tracking-wider">양면 승화전사</span>
              </div>
            </div>
          </div>

          {/* Right Column: Product Info */}
          <div className="lg:pt-4 transform-gpu">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="relative z-10 transform-gpu will-change-transform"
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
              <h1 className={`text-5xl font-extrabold mb-10 tracking-tight leading-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{product.title}</h1>
              <div className={`text-3xl font-extrabold mb-10 tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>₩{currentPrice.toLocaleString()}</div>

              <div className="space-y-8 mb-10">
                <div>
                  <h2 className={`text-sm font-bold uppercase tracking-wider mb-3 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>작품 설명</h2>
                  <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm leading-relaxed`}>
                    {product.description}
                    <br /><br />
                    METALORA의 모든 작품은 1.15mm 두께의 프리미엄 알루미늄 패널에 180℃ 이상의 고온에서 승화전사 방식으로 제작됩니다. 
                    변색 없이 영원히 지속되는 4K 해상도의 선명함을 경험하세요.
                  </p>
                </div>

                <div>
                  <h2 className={`text-sm font-bold uppercase tracking-wider mb-3 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>옵션 선택</h2>
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
                                ? theme === 'dark' ? 'border-white bg-white text-black font-bold' : 'border-black bg-black text-white font-bold'
                                : isOptionSoldOut 
                                  ? theme === 'dark' ? 'border-white/10 text-zinc-600 cursor-not-allowed bg-zinc-900' : 'border-black/10 text-zinc-400 cursor-not-allowed bg-zinc-100'
                                  : theme === 'dark' ? 'border-white/20 text-zinc-400 hover:border-white/50 hover:text-white' : 'border-black/20 text-zinc-600 hover:border-black/50 hover:text-black'
                            }`}
                          >
                            <div className="flex flex-col items-start">
                              <span>{option.name}</span>
                              <span className={`text-[12px] mt-0.5 ${selectedOptionId === option.id ? (theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700') : (theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500')}`}>
                                {(() => {
                                  if (selectedOrientation === 'landscape' && option.dimension.toLowerCase().includes('x')) {
                                    const parts = option.dimension.toLowerCase().split('x');
                                    if (parts.length === 2) {
                                      const cleanH = parts[0].replace(/cm/g, '').trim();
                                      const cleanW = parts[1].replace(/cm/g, '').trim();
                                      return `${cleanW}cm (가로) x ${cleanH}cm (세로)`;
                                    }
                                  } else {
                                    const parts = option.dimension.toLowerCase().split('x');
                                    if (parts.length === 2) {
                                      const cleanW = parts[0].replace(/cm/g, '').trim();
                                      const cleanH = parts[1].replace(/cm/g, '').trim();
                                      return `${cleanW}cm (가로) x ${cleanH}cm (세로)`;
                                    }
                                  }
                                  return option.dimension;
                                })()}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span>₩{option.price.toLocaleString()}</span>
                              {isOptionSoldOut && (
                                <span className="bg-red-500 text-white text-[12px] px-1.5 py-0.5 rounded-full">품절</span>
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

                {/* 제작 지원 방향 선택 */}
                {(() => {
                  const supportedOrientations = product?.supported_orientations?.length ? product.supported_orientations : ['portrait'];
                  return (
                  <div>
                    <h2 className={`text-sm font-bold uppercase tracking-wider mb-3 mt-8 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>제품 방향 (Orientation)</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedOrientation('portrait')}
                        disabled={!supportedOrientations.includes('portrait')}
                        className={`flex justify-center items-center gap-2 px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none ${
                          selectedOrientation === 'portrait'
                            ? theme === 'dark' ? 'border-white bg-white text-black font-bold' : 'border-black bg-black text-white font-bold'
                            : !supportedOrientations.includes('portrait')
                              ? theme === 'dark' ? 'border-white/10 text-zinc-600 cursor-not-allowed bg-zinc-900/50' : 'border-black/10 text-zinc-400 cursor-not-allowed bg-zinc-100/50'
                              : theme === 'dark' ? 'border-white/20 text-zinc-400 hover:border-white/50 hover:text-white' : 'border-black/20 text-zinc-600 hover:border-black/50 hover:text-black'
                        }`}
                      >
                        <div className={`w-3 h-4 border-2 rounded-[2px] ${selectedOrientation === 'portrait' ? (theme === 'dark' ? 'border-black' : 'border-white') : 'border-current'}`} />
                        <span>세로형</span>
                      </button>
                      <button
                        onClick={() => setSelectedOrientation('landscape')}
                        disabled={!supportedOrientations.includes('landscape')}
                        className={`flex justify-center items-center gap-2 px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none ${
                          selectedOrientation === 'landscape'
                            ? theme === 'dark' ? 'border-white bg-white text-black font-bold' : 'border-black bg-black text-white font-bold'
                            : !supportedOrientations.includes('landscape')
                              ? theme === 'dark' ? 'border-white/10 text-zinc-600 cursor-not-allowed bg-zinc-900/50' : 'border-black/10 text-zinc-400 cursor-not-allowed bg-zinc-100/50'
                              : theme === 'dark' ? 'border-white/20 text-zinc-400 hover:border-white/50 hover:text-white' : 'border-black/20 text-zinc-600 hover:border-black/50 hover:text-black'
                        }`}
                      >
                        <div className={`w-4 h-3 border-2 rounded-[2px] ${selectedOrientation === 'landscape' ? (theme === 'dark' ? 'border-black' : 'border-white') : 'border-current'}`} />
                        <span>가로형</span>
                      </button>
                    </div>
                  </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`flex items-start gap-3 p-4 rounded-xl border ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                    <ShieldCheck className="text-zinc-400 shrink-0" size={20} />
                    <div>
                      <h3 className={`text-sm font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>프리미엄 품질</h3>
                      <p className="text-xs text-zinc-400">1.15mm 알루미늄, 8K 초고해상도</p>
                    </div>
                  </div>
                  <div className={`flex items-start gap-3 p-4 rounded-xl border ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-black/5 border-black/5'}`}>
                    <Box className="text-zinc-400 shrink-0" size={20} />
                    <div>
                      <h3 className={`text-sm font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>마그네틱 마운트</h3>
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
                    {id === 'workshop-single' && cartItemFromState ? (
                      <button
                        onClick={() => openCart()}
                        className={`flex-1 font-bold text-xl tracking-tight h-[64px] rounded-2xl transition-all active:scale-95 duration-150 shadow-2xl flex items-center justify-center gap-3 border-[0.5px] ${
                          theme === 'dark'
                            ? 'bg-white text-black hover:bg-zinc-100 shadow-white/10 border-white/20'
                            : 'bg-black text-white hover:bg-zinc-800 shadow-black/10 border-black/20'
                        }`}
                      >
                        <ArrowLeft size={24} />
                        <span className="tracking-[-0.02em]">내 컬렉션으로</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleAddToCart}
                        disabled={isSoldOut || isAddingToCart || isAdded}
                        className={`flex-1 font-bold text-xl tracking-tight h-[64px] rounded-2xl transition-all active:scale-95 duration-150 shadow-2xl flex items-center justify-center gap-3 border-[0.5px] ${
                          isSoldOut 
                            ? theme === 'dark' ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-transparent' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed border-transparent'
                            : isAdded
                              ? theme === 'dark' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-green-50 text-green-600 border-green-200'
                              : theme === 'dark' ? 'bg-white text-black hover:bg-zinc-100 shadow-white/10 border-white/20' : 'bg-black text-white hover:bg-zinc-800 shadow-black/10 border-black/20'
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
                            <span>내 컬렉션에 담기</span>
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                  
                  <p className={`text-center text-[13px] font-bold mt-6 flex items-center justify-center gap-2 tracking-tight ${theme === 'dark' ? 'text-[#FFFFFF]' : 'text-[#111111]'}`}>
                    <Truck size={14} strokeWidth={1.5} />
                    전 작품 안전 패키징 & 전 지역 무료 배송
                  </p>
                </div>
              </div>

            </motion.div>
          </div>
        </div>
      </div>

      {/* New Interactive Product Experience */}
      <ProductExperience productImage={product.front_image || product.image} />

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
          className="fixed z-[100] pointer-events-none w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.8)] transform-gpu will-change-transform"
        >
          <Frame size={20} className="text-black" />
        </motion.div>
      ))}
    </div>
  );
}
