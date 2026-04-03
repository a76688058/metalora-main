import React, { useState, useRef, Suspense, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { Upload, Image as ImageIcon, Check, ChevronLeft, Maximize, X, User, Loader2, ShoppingBag } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import Header from '../Header';
import LoadingScreen from '../LoadingScreen';
import ErrorBoundary from '../ErrorBoundary';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

// --- Animated Price Component (Toss Style Count Up) ---
function AnimatedPrice({ value }: { value: number }) {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

// Default placeholder image (Premium Abstract/Graffiti vibe)
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop";

// --- Constants & Pricing ---
const STEPS = [
  { id: 1, title: '재질 확인 및 사이즈 선택' },
  { id: 2, title: '이미지 업로드 및 3D 프리뷰' },
  { id: 3, title: '최종 확인 및 주문' },
];

type SizeType = 'A4' | 'Custom';

// --- 3D Poster Component (Ported from Main Landing) ---
function WorkshopPoster3D({ 
  imageUrl, 
  materialType, 
  interactive = false, 
  size = 'A4',
  autoRotate = false 
}: { 
  imageUrl: string | null, 
  materialType: string, 
  interactive?: boolean, 
  size?: SizeType,
  autoRotate?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const targetRotation = useRef({ x: 0, y: 0 });
  
  const textureUrl = imageUrl || DEFAULT_IMAGE;
  const texture = useTexture(textureUrl);

  const targetAspect = useMemo(() => {
    if (size === 'A4') return 1 / 1.414;
    return 1 / 1.414; // Default or Custom
  }, [size]);

  useMemo(() => {
    if (!texture || !texture.image) return;
    const img = texture.image as HTMLImageElement;
    const imageAspect = img.width / img.height;
    
    if (imageAspect > targetAspect) {
      texture.repeat.set(targetAspect / imageAspect, 1);
      texture.offset.set((1 - targetAspect / imageAspect) / 2, 0);
    } else {
      texture.repeat.set(1, imageAspect / targetAspect);
      texture.offset.set(0, (1 - imageAspect / targetAspect) / 2);
    }
    
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }, [texture, targetAspect]);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (!interactive && !autoRotate && e.beta !== null && e.gamma !== null) {
        const maxTilt = Math.PI / 12;
        const tiltX = THREE.MathUtils.clamp((e.beta - 45) * (Math.PI / 180), -maxTilt, maxTilt);
        const tiltY = THREE.MathUtils.clamp(e.gamma * (Math.PI / 180), -maxTilt, maxTilt);
        targetRotation.current = { x: tiltX, y: tiltY };
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [interactive, autoRotate]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (interactive) {
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 5);
      } else if (autoRotate) {
        meshRef.current.rotation.y += delta * 0.35; // ~20 degrees per second
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
      } else {
        let targetX = targetRotation.current.x;
        let targetY = targetRotation.current.y;

        if (hovered && !("ontouchstart" in window)) {
          targetY = (state.mouse.x * Math.PI) / 8;
          targetX = -(state.mouse.y * Math.PI) / 8;
        }

        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetY, delta * 5);
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetX, delta * 5);
      }
    }
  });

  const materials = useMemo(() => {
    const isAluminum = materialType === 'aluminum';
    const roughness = isAluminum ? 0.3 : 0.85;
    const metalness = isAluminum ? 0.7 : 0.1;

    const fallbackMaterialProps = {
      color: '#1a1a1a',
      roughness,
      metalness,
    };

    return [
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ 
        ...fallbackMaterialProps,
        map: texture, 
        emissiveMap: texture,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: isAluminum ? 1.0 : 0.05,
        color: '#ffffff',
        toneMapped: false
      }), 
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
    ];
  }, [texture, materialType]);

  const isAluminum = materialType === 'aluminum';
  const depth = isAluminum ? 0.008 : 0.04;

  const geometryArgs = useMemo(() => {
    const width = 1;
    const height = size === 'A4' ? 1.414 : 1.414;
    return [width, height, depth] as [number, number, number];
  }, [size, depth]);

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} castShadow={false} />
      <directionalLight position={[-5, -5, -5]} intensity={0.2} />
      <pointLight position={[2, 2, 2]} intensity={0.2} color="#ffffff" />
      <Environment preset="studio" environmentIntensity={0.3} />
      
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          material={materials}
          castShadow
          receiveShadow
        >
          <boxGeometry args={geometryArgs} /> 
        </mesh>
      </group>
    </>
  );
}

interface WorkshopViewProps {
  onBack?: () => void;
  onClose?: () => void;
  hideHeader?: boolean;
}

export default function WorkshopView({ onBack, onClose, hideHeader = false }: WorkshopViewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { addToCart, openCart } = useCart();
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const totalSteps = STEPS.length;

  // Workshop State
  const [materialType, setMaterialType] = useState<'aluminum'>('aluminum');
  const [size, setSize] = useState<SizeType>('A4');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<any>(null);
  const [isResumingImage, setIsResumingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Auto Resume Logic ---
  useEffect(() => {
    const fetchProgress = async () => {
      if (!user) {
        setIsRestoring(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_progress')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          if (error.code !== 'PGRST116') {
            console.error('Fetch failed:', error);
          }
          setIsRestoring(false);
          return;
        }

        if (
          data && 
          data.uploaded_image_url && 
          typeof data.uploaded_image_url === 'string' && 
          data.uploaded_image_url.trim().length > 0 && 
          data.uploaded_image_url !== 'null' &&
          localStorage.getItem('force_new_start') !== 'true'
        ) {
          setPendingProgress(data);
          setShowResumeModal(true);
          setIsRestoring(false);
        } else {
          setIsRestoring(false);
          if (localStorage.getItem('force_new_start') === 'true') {
             localStorage.removeItem('force_new_start');
          }
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err);
        setIsRestoring(false);
      }
    };

    fetchProgress();
  }, [user]);

  const handleStartNew = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setShowResumeModal(false);
    setUploadedImage(null);
    setPendingProgress(null);
    setMaterialType('aluminum');
    setSize('A4');
    
    localStorage.removeItem('temp_image_url');
    localStorage.removeItem('workshop_draft');
    sessionStorage.removeItem('temp_image_url');
    sessionStorage.removeItem('workshop_draft');
    localStorage.setItem('force_new_start', 'true');

    if (user) {
      try {
        const { error } = await supabase.from('user_progress').delete().eq('user_id', user.id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to clear progress in Supabase:', err);
      }
    }
    
    setCurrentStep(1);
  };

  const handleResume = () => {
    if (pendingProgress) {
      setMaterialType(pendingProgress.selected_material as 'aluminum');
      setSize(pendingProgress.selected_size as SizeType);
      if (pendingProgress.uploaded_image_url) {
        setUploadedImage(pendingProgress.uploaded_image_url);
        setIsResumingImage(true);
        setTimeout(() => setIsResumingImage(false), 800);
      }
      setCurrentStep(pendingProgress.current_step);
    }
    setShowResumeModal(false);
  };

  const saveProgress = useCallback(async (step: number, mat: string, sz: string, imgUrl: string | null) => {
    if (!user) return;

    const urlToSave = imgUrl?.startsWith('blob:') ? null : imgUrl;
    if (!urlToSave) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('user_progress')
          .upsert({
            user_id: user.id,
            current_step: step,
            selected_material: mat,
            selected_size: sz,
            uploaded_image_url: urlToSave,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) {
          console.error('Save failed:', error);
        }
      } catch (err) {
        console.error('Save failed (exception):', err);
      }
    }, 1500);
  }, [user]);

  useEffect(() => {
    if (!isRestoring && !showResumeModal && uploadedImage) {
      saveProgress(currentStep, materialType, size, uploadedImage);
    }
  }, [currentStep, materialType, size, uploadedImage, isRestoring, showResumeModal, saveProgress]);

  const clearProgress = async () => {
    if (!user) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      await supabase.from('user_progress').delete().eq('user_id', user.id);
      setUploadedImage(null);
      localStorage.removeItem('temp_image_url');
      localStorage.removeItem('workshop_draft');
      sessionStorage.removeItem('temp_image_url');
      sessionStorage.removeItem('workshop_draft');
      localStorage.setItem('force_new_start', 'true');
    } catch (err) {
      console.error('Failed to clear progress:', err);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep === 1) {
      if (onBack) {
        onBack();
      } else {
        navigate('/mypage');
      }
    } else {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleActionClick = async () => {
    if (currentStep === totalSteps) {
      setIsUploading(true);
      
      try {
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !currentUser) {
          showToast("로그인이 필요합니다.", "error");
          setIsUploading(false);
          return;
        }

        await addToCart(
          'workshop-single', 
          size, 
          1, 
          uploadedImage || undefined,
          {
            shaderType: '싱글 제작',
            material: materialType,
            size: size,
            price: 49000,
            serial_number: `WS-${Date.now()}`
          }
        );

        setIsFlashing(true);
        await clearProgress();
        setUploadedImage(null);
        setPendingProgress(null);
        localStorage.removeItem('temp_image_url');
        localStorage.removeItem('workshop_draft');
        sessionStorage.removeItem('temp_image_url');
        sessionStorage.removeItem('workshop_draft');
        
        setIsFlashing(false);
        setIsUploading(false);
        showToast('내 컬렉션에 안전하게 담겼습니다', 'success');
        
        if (onClose) {
          onClose();
        } else {
          navigate('/my-collection');
        }
        setTimeout(() => openCart(), 100);
      } catch (err: any) {
        console.error('Failed to save to collection:', err);
        const errorMsg = err.message || err.details || JSON.stringify(err);
        showToast(`컬렉션 저장 중 오류가 발생했습니다: ${errorMsg}`, "error");
        setIsUploading(false);
      }
    } else {
      handleNext();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    if (!user) {
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
      setIsUploading(false);
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('workshop')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        const url = URL.createObjectURL(file);
        setUploadedImage(url);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('workshop')
          .getPublicUrl(fileName);
        setUploadedImage(publicUrl);
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
    } finally {
      setIsUploading(false);
    }
  };

  const isButtonDisabled = (currentStep === 2 && !uploadedImage) || isUploading;

  if (isRestoring) {
    return <LoadingScreen />;
  }

  return (
    <div className={`w-full bg-black text-white flex flex-col font-sans overflow-x-hidden pointer-events-auto ${hideHeader ? 'h-full' : 'min-h-screen'}`}>
      {/* Custom Workshop Header */}
      <header className={`${hideHeader ? 'relative' : 'fixed top-0 left-0'} w-full z-[100] bg-black/80 backdrop-blur-md border-b border-white/5 h-16 flex items-center px-6`}>
        <div className="flex-1 flex justify-start">
          <button 
            onClick={handleBack}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
        </div>
        
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase mb-0.5">
            Step {currentStep} / {totalSteps}
          </div>
          <h1 className="text-sm font-bold text-white tracking-tight">
            {STEPS[currentStep - 1].title}
          </h1>
        </div>

        <div className="flex-1 flex justify-end items-center gap-4">
          <button 
            onClick={() => onClose ? onClose() : navigate('/mypage')}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X size={22} />
          </button>
          {!onClose && (
            <button 
              onClick={() => navigate('/mypage')}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <User size={22} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      {/* Resume Confirmation Modal */}
      <AnimatePresence>
        {showResumeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10001] flex items-center justify-center px-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-zinc-900 rounded-[24px] p-8 text-center shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-2">이전에 작업한 이미지가 있습니다.</h3>
              <p className="text-zinc-400 text-sm mb-8">불러오시겠습니까?</p>
              <div className="flex gap-3">
                <button
                  onClick={handleStartNew}
                  className="bg-zinc-800 text-zinc-400 py-4 rounded-[18px] font-semibold flex-1 active:scale-95 transition-transform"
                >
                  새로 시작
                </button>
                <button
                  onClick={handleResume}
                  className="bg-purple-600 text-white py-4 rounded-[18px] font-bold flex-1 active:scale-95 transition-transform shadow-lg shadow-purple-900/20"
                >
                  불러오기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex-1 flex flex-col pt-8 pb-12 overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y">
        {/* Step Progress Bar (Minimal) */}
        <div className="max-w-xl mx-auto w-full px-6 mb-8">
            <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
                transition={{ duration: 0.5, ease: "circOut" }}
                className="h-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
              />
            </div>
          </div>

        {/* Content Area */}
        <div className="flex-1 max-w-xl mx-auto w-full px-6 relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -20 : 20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {/* --- STEP 1: Material & Size Selection --- */}
              {currentStep === 1 && (
                <div className="flex flex-col gap-8">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-4">재질 확인</h3>
                    <div className="flex flex-col gap-4">
                      <div 
                        className="p-6 rounded-3xl border text-left transition-all bg-cyan-500/10 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)] cursor-default relative overflow-hidden"
                      >
                        <h3 className="text-xl font-bold text-white mb-2">메탈릭 알루미늄</h3>
                        <p className="text-zinc-400 text-sm">METALORA Signature: 얇고 매끄러운 표면. 빛이 금속 특유의 광택으로 반사되어 미래지향적인 색감을 구현합니다.</p>
                        <div className="mt-4 pt-4 border-t border-cyan-500/20 text-xs font-medium text-cyan-400 flex items-center gap-1.5">
                          <Check size={14} />
                          METALORA 시그니처 재질로 확정되었습니다
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white mb-4">사이즈 선택</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSize('A4')}
                        className={`py-4 rounded-2xl border text-center transition-all ${size === 'A4' ? 'bg-purple-500/10 border-purple-400 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:border-white/20'}`}
                      >
                        <div className="font-bold">A4 (210x297mm)</div>
                      </button>
                      <button
                        disabled
                        className="py-4 rounded-2xl border text-center transition-all bg-zinc-900/20 border-white/5 text-zinc-600 cursor-not-allowed relative overflow-hidden"
                      >
                        <div className="font-bold">맞춤 사이즈 제작</div>
                        <div className="absolute top-0 right-0 bg-zinc-800 text-zinc-400 text-[10px] px-2 py-1 rounded-bl-lg border-b border-l border-zinc-700">준비 중</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* --- STEP 2: Image Upload & 3D Preview --- */}
              {currentStep === 2 && (
                <div className="flex flex-col gap-6">
                  <div className="w-full aspect-[3/4] max-w-sm mx-auto rounded-3xl overflow-hidden bg-[#000000] border border-white/10 relative shadow-2xl">
                    <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-[10px] tracking-widest text-white font-bold uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      Live 3D Preview
                    </div>
                    
                    <motion.button 
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      onClick={() => setIsModalOpen(true)}
                      className="absolute top-4 right-4 p-3 bg-white/5 backdrop-blur-md rounded-full border border-white/10 z-10 hover:bg-white/10 transition-colors"
                    >
                      <Maximize size={18} className="text-white" />
                    </motion.button>
                    
                    {isResumingImage && uploadedImage && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                          <span className="text-cyan-400 font-bold text-sm tracking-widest animate-pulse">이미지를 불러오는 중...</span>
                        </div>
                      </div>
                    )}

                    <ErrorBoundary fallback={
                      <div className="w-full h-full flex items-center justify-center p-8">
                        {uploadedImage && <img src={uploadedImage} alt="Preview" className="max-w-full max-h-full object-contain" />}
                      </div>
                    }>
                      <Canvas shadows camera={{ position: [0, 0, 2.5], fov: 45 }} style={{ pointerEvents: 'none' }}>
                        <Suspense fallback={null}>
                          <WorkshopPoster3D 
                            imageUrl={uploadedImage} 
                            materialType={materialType} 
                            interactive={false}
                            size={size}
                          />
                        </Suspense>
                        <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={5} blur={2} far={2} color="#000000" />
                      </Canvas>
                    </ErrorBoundary>
                  </div>

                  <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 text-white">
                      <Upload size={28} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">고객님의 이미지를 업로드하세요.</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                      고해상도 이미지일수록 알루미늄의 광택이<br/>더 선명하게 살아납니다.
                    </p>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full py-4 bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-bold rounded-2xl hover:bg-zinc-700/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ImageIcon size={20} />
                      )}
                      {isUploading ? '업로드 중...' : uploadedImage ? '사진 변경하기' : '사진 등록하기'}
                    </button>
                    <p className="text-[10px] text-zinc-600 mt-4 text-center leading-tight break-keep">
                      ※ 타인의 저작권, 초상권, 개인정보를 침해할 경우 모든 책임은 이용자에게 있습니다.
                    </p>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                </div>
              )}

              {/* --- STEP 3: Finalize --- */}
              {currentStep === 3 && (
                <div className="flex flex-col items-center pt-4">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl mb-10"
                  >
                    <ErrorBoundary fallback={
                      <div className="w-full h-full flex items-center justify-center p-8">
                        {uploadedImage && <img src={uploadedImage} alt="Preview" className="max-w-full max-h-full object-contain" />}
                      </div>
                    }>
                      <Canvas shadows camera={{ position: [0, 0, 2.5], fov: 45 }}>
                        <Suspense fallback={null}>
                          <WorkshopPoster3D 
                            imageUrl={uploadedImage} 
                            materialType={materialType} 
                            interactive={false}
                            size={size}
                            autoRotate={true}
                          />
                        </Suspense>
                        <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={5} blur={2} far={2} color="#000000" />
                      </Canvas>
                    </ErrorBoundary>
                  </motion.div>

                  <div className="w-full space-y-6">
                    <div className="bg-zinc-900/40 rounded-3xl p-8 border border-white/5">
                      <h3 className="text-zinc-500 text-xs font-bold tracking-widest uppercase mb-6">Order Summary</h3>
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400 text-sm">제작 방식</span>
                          <span className="text-white font-bold">싱글 커스텀 제작</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400 text-sm">재질</span>
                          <span className="text-cyan-400 font-bold">메탈릭 알루미늄</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400 text-sm">사이즈</span>
                          <span className="text-white font-bold">{size} (210x297mm)</span>
                        </div>
                        <div className="h-[1px] bg-white/5 my-2" />
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400 text-sm">결제 예정 금액</span>
                          <div className="text-xl font-black text-white">
                            <AnimatedPrice value={49000} />
                            <span className="text-sm ml-1 font-bold">원</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl">
                      <p className="text-[11px] text-purple-300/80 leading-relaxed text-center">
                        ※ 커스텀 상품은 제작이 시작된 이후 취소 및 환불이 불가합니다.<br/>
                        최종 시안을 다시 한번 확인해 주세요.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Fixed Bottom Action Button */}
        <div className="max-w-xl mx-auto w-full px-6 mt-10">
          <button
            onClick={handleActionClick}
            disabled={isButtonDisabled}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${
              isButtonDisabled 
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                : currentStep === totalSteps
                  ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 shadow-[0_0_30px_rgba(217,70,239,0.3)]'
                  : 'bg-white text-black hover:bg-zinc-200'
            }`}
          >
            {isUploading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : currentStep === totalSteps ? (
              <ShoppingBag size={22} />
            ) : null}
            <span>
              {isUploading ? '처리 중...' : currentStep === totalSteps ? '내 컬렉션에 담기' : '다음 단계로'}
            </span>
          </button>
        </div>
      </div>

      {/* Flash Effect on Success */}
      <AnimatePresence>
        {isFlashing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10002] bg-white pointer-events-none"
          />
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fade-out-guide {
          0% { opacity: 0; transform: translateY(10px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        .animate-fade-out-guide {
          animation: fade-out-guide 4s forwards;
        }
      `}} />
    </div>
  );
}
