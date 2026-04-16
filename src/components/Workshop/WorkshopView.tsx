import React, { useState, useRef, Suspense, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { Upload, Image as ImageIcon, Check, ChevronLeft, Maximize, X, User, Loader2, ShoppingBag } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import Header from '../Header';
import LoadingScreen from '../LoadingScreen';
import ErrorBoundary from '../ErrorBoundary';
import WorkshopPoster3D from './WorkshopPoster3D';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import { useProducts } from '../../context/ProductContext';

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

interface WorkshopViewProps {
  onBack?: () => void;
  onClose?: () => void;
  hideHeader?: boolean;
}

export default function WorkshopView({ onBack, onClose, hideHeader = false }: WorkshopViewProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { addToCart, openCart } = useCart();
  const { customBasePrice } = useProducts();
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const totalSteps = STEPS.length;
  const [errorMsg, setErrorMsg] = useState('');

  // Workshop State
  const [materialType, setMaterialType] = useState<'aluminum'>('aluminum');
  const [size, setSize] = useState<SizeType>('A4');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<any>(null);
  const [isResumingImage, setIsResumingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isClearingRef = useRef(false);

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
          // No data found or error occurred
          localStorage.removeItem('force_new_start');
          sessionStorage.removeItem('workshop_just_finished');
          setIsRestoring(false);
          return;
        }

        const hasValidData = data && data.uploaded_image_url && 
                             typeof data.uploaded_image_url === 'string' && 
                             data.uploaded_image_url.trim().length > 0 && 
                             data.uploaded_image_url !== 'null';

        if (hasValidData) {
          const forceNew = localStorage.getItem('force_new_start') === 'true' || 
                           sessionStorage.getItem('workshop_just_finished') === 'true';

          if (forceNew) {
            // Force new start was requested, but data still exists.
            // Overwrite it with empty data instead of delete to bypass potential RLS delete restrictions.
            await supabase.from('user_progress').upsert({
              user_id: user.id,
              current_step: 1,
              selected_material: 'aluminum',
              selected_size: 'A4',
              uploaded_image_url: null,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
            localStorage.removeItem('force_new_start');
            sessionStorage.removeItem('workshop_just_finished');
            setIsRestoring(false);
          } else {
            setPendingProgress(data);
            setShowResumeModal(true);
            setIsRestoring(false);
          }
        } else {
          localStorage.removeItem('force_new_start');
          sessionStorage.removeItem('workshop_just_finished');
          setIsRestoring(false);
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
    isClearingRef.current = true;
    
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
        await supabase.from('user_progress').upsert({
          user_id: user.id,
          current_step: 1,
          selected_material: 'aluminum',
          selected_size: 'A4',
          uploaded_image_url: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (err) {
        console.error('Failed to clear progress in Supabase:', err);
      }
    }
    
    isClearingRef.current = false;
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
      if (isClearingRef.current) return;
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
    isClearingRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      await supabase.from('user_progress').upsert({
        user_id: user.id,
        current_step: 1,
        selected_material: 'aluminum',
        selected_size: 'A4',
        uploaded_image_url: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      setUploadedImage(null);
      localStorage.removeItem('temp_image_url');
      localStorage.removeItem('workshop_draft');
      sessionStorage.removeItem('temp_image_url');
      sessionStorage.removeItem('workshop_draft');
      localStorage.setItem('force_new_start', 'true');
    } catch (err) {
      console.error('Failed to clear progress:', err);
    } finally {
      // We don't reset isClearingRef here because usually we navigate away
      // If we don't navigate, it will be reset by the caller if needed
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo(0, 0);
    }
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
      } else if (onClose) {
        onClose();
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
          setErrorMsg("로그인이 필요합니다.");
          setTimeout(() => setErrorMsg(''), 3000);
          setIsUploading(false);
          return;
        }

        let finalImageUrl = uploadedImage;

        // 만약 임시 blob URL이라면, 장바구니에 담기 전(로그인된 상태)에 실제 스토리지에 업로드합니다.
        if (uploadedImage?.startsWith('blob:') && uploadedFile) {
          const fileExt = uploadedFile.name.split('.').pop();
          const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('workshop')
            .upload(fileName, uploadedFile);

          if (uploadError) {
            console.error('Storage upload error during checkout:', uploadError);
            setErrorMsg("이미지 업로드에 실패했습니다. 다시 시도해주세요.");
            setTimeout(() => setErrorMsg(''), 3000);
            setIsUploading(false);
            return;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('workshop')
            .getPublicUrl(fileName);
            
          finalImageUrl = publicUrl;
        }

        await addToCart(
          'workshop-single', 
          size, 
          1, 
          finalImageUrl || undefined,
          {
            shaderType: '커스텀 제작',
            material: materialType,
            size: size,
            price: customBasePrice,
            serial_number: `WS-${Date.now()}`
          }
        );

        setIsFlashing(true);
        await clearProgress();
        setUploadedImage(null);
        setUploadedFile(null);
        setPendingProgress(null);
        localStorage.removeItem('temp_image_url');
        localStorage.removeItem('workshop_draft');
        sessionStorage.removeItem('temp_image_url');
        sessionStorage.removeItem('workshop_draft');
        // 세션 내에서 방금 완료했음을 표시하여 즉시 재진입 시 모달 방지
        sessionStorage.setItem('workshop_just_finished', 'true');
        
        setIsFlashing(false);
        setIsUploading(false);
        
        if (onClose) {
          onClose();
        }
        setTimeout(() => openCart(), 100);
      } catch (err: any) {
        console.error('Failed to save to collection:', err);
        const errorMessage = err.message || err.details || JSON.stringify(err);
        setErrorMsg(`컬렉션 저장 중 오류가 발생했습니다: ${errorMessage}`);
        setTimeout(() => setErrorMsg(''), 3000);
        setIsUploading(false);
      }
    } else {
      handleNext();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. File Size Validation (Max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg('파일 용량은 10MB를 초과할 수 없습니다.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    // 2. File Type Validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('JPG, PNG, WEBP 이미지 파일만 업로드 가능합니다.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }

    setIsUploading(true);
    setUploadedFile(file); // Save the file object for potential later upload

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
    <div className={`w-full flex flex-col font-sans overflow-x-hidden pointer-events-auto transition-colors duration-500 ${
      hideHeader ? 'h-full' : 'min-h-screen'
    } ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}>
      {/* Custom Workshop Header */}
      <header className={`${hideHeader ? 'relative' : 'fixed top-0 left-0'} w-full z-[100] backdrop-blur-md border-b h-16 flex items-center px-6 transition-colors duration-500 ${
        theme === 'dark' ? 'bg-black/80 border-white/5' : 'bg-white/80 border-black/5'
      }`}>
        <div className="flex-1 flex justify-start">
          <button 
            onClick={handleBack}
            className={`transition-colors ${theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'}`}
          >
            <ChevronLeft size={24} />
          </button>
        </div>
        
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className={`text-[10px] font-bold tracking-widest uppercase mb-0.5 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>
            Step {currentStep} / {totalSteps}
          </div>
          <h1 className={`text-sm font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {STEPS[currentStep - 1].title}
          </h1>
        </div>

        <div className="flex-1 flex justify-end items-center gap-4">
          <button 
            onClick={() => onClose && onClose()}
            className={`transition-colors ${theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'}`}
          >
            <X size={22} />
          </button>
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
              className={`w-full max-w-sm rounded-[24px] p-8 text-center shadow-2xl ${
                theme === 'dark' ? 'bg-zinc-900' : 'bg-white border border-black/5'
              }`}
            >
              <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>이전에 작업한 이미지가 있습니다.</h3>
              <p className={`text-sm mb-8 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>불러오시겠습니까?</p>
              <div className="flex gap-3">
                <button
                  onClick={handleStartNew}
                  className={`py-4 rounded-[18px] font-semibold flex-1 active:scale-95 transition-transform ${
                    theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
                  }`}
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

      <div 
        ref={scrollContainerRef}
        className="relative z-10 flex-1 flex flex-col pt-8 pb-32 overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y"
      >
        {/* Step Progress Bar (Minimal) */}
        <div className="max-w-xl mx-auto w-full px-6 mb-8">
            <div className={`h-[2px] w-full rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-black/5'}`}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
                transition={{ duration: 0.5, ease: "circOut" }}
                className={`h-full ${theme === 'dark' ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-cyan-500'}`}
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
                    <h3 className={`text-lg font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>재질 확인</h3>
                    <div className="flex flex-col gap-4">
                      <div 
                        className={`p-6 rounded-3xl border text-left transition-all cursor-default relative overflow-hidden ${
                          theme === 'dark' 
                            ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]' 
                            : 'bg-cyan-50 border-cyan-500/30 shadow-[0_10px_30px_rgba(6,182,212,0.1)]'
                        }`}
                      >
                        <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-cyan-900'}`}>메탈릭 알루미늄</h3>
                        <p className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>METALORA Signature: 얇고 매끄러운 표면. 빛이 금속 특유의 광택으로 반사되어 미래지향적인 색감을 구현합니다.</p>
                        <div className={`mt-4 pt-4 border-t text-xs font-medium flex items-center gap-1.5 ${
                          theme === 'dark' ? 'border-cyan-500/20 text-cyan-400' : 'border-cyan-500/10 text-cyan-600'
                        }`}>
                          <Check size={14} />
                          METALORA 시그니처 재질로 확정되었습니다
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className={`text-lg font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>사이즈 선택</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSize('A4')}
                        className={`py-4 rounded-2xl border text-center transition-all ${
                          size === 'A4' 
                            ? theme === 'dark' 
                              ? 'bg-purple-500/10 border-purple-400 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                              : 'bg-purple-50 border-purple-500 text-purple-600 shadow-[0_10px_20px_rgba(168,85,247,0.1)]'
                            : theme === 'dark'
                              ? 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:border-white/20'
                              : 'bg-zinc-50 border-black/5 text-zinc-500 hover:border-black/10'
                        }`}
                      >
                        <div className="font-bold">A4 (210x297mm)</div>
                      </button>
                      <button
                        disabled
                        className={`py-4 rounded-2xl border text-center transition-all cursor-not-allowed relative overflow-hidden ${
                          theme === 'dark' ? 'bg-zinc-900/20 border-white/5 text-zinc-600' : 'bg-zinc-100 border-black/5 text-zinc-400'
                        }`}
                      >
                        <div className="font-bold">Custom (준비중)</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* --- STEP 2: Image Upload & 3D Preview --- */}
              {currentStep === 2 && (
                <div className="flex flex-col gap-6">
                  <div className={`w-full aspect-[3/4] max-w-sm mx-auto rounded-3xl overflow-hidden border relative shadow-2xl transition-colors duration-500 ${
                    theme === 'dark' ? 'bg-black border-white/10' : 'bg-zinc-50 border-black/5'
                  }`}>
                    <div className={`absolute top-4 left-4 z-10 px-3 py-1 backdrop-blur-md rounded-full border text-[10px] tracking-widest font-bold uppercase flex items-center gap-2 ${
                      theme === 'dark' ? 'bg-black/50 border-white/10 text-white' : 'bg-white/50 border-black/5 text-black'
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
                    
                    {isResumingImage && uploadedImage && (
                      <div className={`absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm ${theme === 'dark' ? 'bg-black/80' : 'bg-white/80'}`}>
                        <div className="flex flex-col items-center gap-3">
                          <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${
                            theme === 'dark' ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'border-cyan-600'
                          }`} />
                          <span className={`font-bold text-sm tracking-widest animate-pulse ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>이미지를 불러오는 중...</span>
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
                        <ContactShadows position={[0, -1, 0]} opacity={theme === 'dark' ? 0.5 : 0.2} scale={5} blur={2} far={2} color={theme === 'dark' ? "#000000" : "#666666"} />
                      </Canvas>
                    </ErrorBoundary>
                  </div>

                  <div className={`backdrop-blur-md border rounded-3xl p-6 text-center transition-colors duration-500 ${
                    theme === 'dark' ? 'bg-zinc-900/40 border-white/5' : 'bg-zinc-50 border-black/5'
                  }`}>
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      theme === 'dark' ? 'bg-white/5 text-white' : 'bg-black/5 text-black'
                    }`}>
                      <Upload size={28} />
                    </div>
                    <h3 className={`text-lg font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>고객님의 이미지를 업로드하세요.</h3>
                    <p className={`text-sm leading-relaxed mb-6 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      고해상도 이미지일수록 알루미늄의 광택이<br/>더 선명하게 살아납니다.
                    </p>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className={`w-full py-4 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                        theme === 'dark' 
                          ? 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 hover:bg-zinc-700/80' 
                          : 'bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200'
                      }`}
                    >
                      {isUploading ? (
                        <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${theme === 'dark' ? 'border-white' : 'border-black'}`} />
                      ) : (
                        <ImageIcon size={20} />
                      )}
                      {isUploading ? '업로드 중...' : uploadedImage ? '사진 변경하기' : '사진 등록하기'}
                    </button>
                    <p className={`text-[10px] mt-4 text-center leading-tight break-keep ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
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
                    className={`w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden border shadow-2xl mb-10 transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-black border-white/10' : 'bg-zinc-50 border-black/5'
                    }`}
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
                        <ContactShadows position={[0, -1, 0]} opacity={theme === 'dark' ? 0.5 : 0.2} scale={5} blur={2} far={2} color={theme === 'dark' ? "#000000" : "#666666"} />
                      </Canvas>
                    </ErrorBoundary>
                  </motion.div>

                  <div className="w-full space-y-6">
                    <div className={`rounded-3xl p-8 border transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-zinc-900/40 border-white/5' : 'bg-zinc-50 border-black/5'
                    }`}>
                      <h3 className={`text-xs font-bold tracking-widest uppercase mb-6 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Order Summary</h3>
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>제작 방식</span>
                          <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>커스텀 제작</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>재질</span>
                          <span className={`font-bold ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>메탈릭 알루미늄</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>사이즈</span>
                          <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{size} (210x297mm)</span>
                        </div>
                        <div className={`h-[1px] my-2 ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`} />
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>결제 예정 금액</span>
                          <div className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                            <AnimatedPrice value={customBasePrice} />
                            <span className="text-sm ml-1 font-bold">원</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`p-6 border rounded-2xl transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-purple-500/5 border-purple-500/20' : 'bg-purple-50 border-purple-200'
                    }`}>
                      <p className={`text-[11px] leading-relaxed text-center ${theme === 'dark' ? 'text-purple-300/80' : 'text-purple-600'}`}>
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
      </div>

      {/* Fixed Bottom Action Button */}
      <div className={`absolute bottom-0 left-0 w-full pt-12 pb-[max(2rem,env(safe-area-inset-bottom))] px-6 z-20 pointer-events-none transition-colors duration-500 ${
        theme === 'dark' ? 'bg-gradient-to-t from-black via-black/90 to-transparent' : 'bg-gradient-to-t from-white via-white/90 to-transparent'
      }`}>
        <div className="max-w-xl mx-auto w-full pointer-events-auto">
          {errorMsg && (
            <div className="text-center text-red-500 text-sm font-bold animate-pulse bg-red-500/10 py-2 rounded-xl backdrop-blur-md border border-red-500/20 mb-4">
              {errorMsg}
            </div>
          )}
          <button
            onClick={handleActionClick}
            disabled={isButtonDisabled}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${
              isButtonDisabled 
                ? theme === 'dark' ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : currentStep === totalSteps
                  ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 shadow-[0_0_30px_rgba(217,70,239,0.3)] text-white'
                  : theme === 'dark' 
                    ? 'bg-white text-black hover:bg-zinc-200 shadow-[0_0_30px_rgba(255,255,255,0.1)]' 
                    : 'bg-black text-white hover:bg-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.1)]'
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

      {/* 3D Interactive Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10005] backdrop-blur-xl flex flex-col pointer-events-auto touch-none transition-colors duration-500 ${
              theme === 'dark' ? 'bg-black/95' : 'bg-white/95'
            }`}
          >
            <div className="absolute top-0 left-0 w-full h-20 flex items-center justify-between px-6 z-20">
              <div className="flex flex-col">
                <span className={`text-[10px] font-bold tracking-[0.3em] uppercase mb-1 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>Interactive</span>
                <h3 className={`font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>3D 프리뷰</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className={`w-12 h-12 rounded-full border flex items-center justify-center transition-colors ${
                  theme === 'dark' ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-black/5 border-black/10 text-black hover:bg-black/10'
                }`}
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 relative">
              <Canvas shadows camera={{ position: [0, 0, 3], fov: 45 }}>
                <Suspense fallback={null}>
                  <WorkshopPoster3D 
                    imageUrl={uploadedImage} 
                    materialType={materialType} 
                    interactive={true}
                    size={size}
                  />
                  <OrbitControls 
                    enablePan={false}
                    enableZoom={true}
                    minDistance={1.5}
                    maxDistance={6}
                  />
                </Suspense>
                <ContactShadows position={[0, -1.2, 0]} opacity={theme === 'dark' ? 0.4 : 0.15} scale={6} blur={2.5} far={2} color={theme === 'dark' ? "#000000" : "#444444"} />
              </Canvas>

              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-3">
                <div className={`px-4 py-2 backdrop-blur-md rounded-full border flex items-center gap-3 ${
                  theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'
                }`}>
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className={`text-[11px] font-medium tracking-wider ${theme === 'dark' ? 'text-white/70' : 'text-black/70'}`}>손가락으로 자유롭게 돌려보세요</span>
                </div>
              </div>
            </div>
          </motion.div>
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
