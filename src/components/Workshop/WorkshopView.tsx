import React, { useState, useRef, Suspense, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { Upload, Image as ImageIcon, Check, ChevronLeft, Maximize, X, User, Loader2, ShoppingBag } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';
import Header from '../Header';
import LoadingScreen from '../LoadingScreen';
import ErrorBoundary from '../ErrorBoundary';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';

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

// 3D Loaded Event Emitter Component
function WorkshopCanvasLoadTracker() {
  useEffect(() => {
    // Dispatch an event to signal that the Suspense boundary resolved
    window.dispatchEvent(new CustomEvent('workshop-3d-poster-rendered'));
  }, []);
  return null;
}

function WorkshopPoster3DWithFallback({ imageUrl, materialType, interactive, size, orientation, autoRotate, theme, layoutMode, aiOutpaint }: { imageUrl: string | null, materialType: string, interactive?: boolean, size?: SizeType, orientation?: 'portrait' | 'landscape', autoRotate?: boolean, theme: string, layoutMode?: 'cover' | 'contain', aiOutpaint?: boolean }) {
  const [hasError, setHasError] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  // AI Outpaint 활성 시: 다크모드(진보라), 라이트모드(연보라)
  const emptySpaceColor = aiOutpaint 
    ? (theme === 'dark' ? 'bg-[#1a1033]' : 'bg-[#f5f3ff]')
    : (theme === 'dark' ? 'bg-white' : 'bg-black');

  useEffect(() => {
    const handleRendered = () => setIsRendered(true);
    window.addEventListener('workshop-3d-poster-rendered', handleRendered);
    return () => window.removeEventListener('workshop-3d-poster-rendered', handleRendered);
  }, []);

  const shouldShowFallback = hasError;

  if (shouldShowFallback) {
    return (
       <Html center className="flex items-center justify-center pointer-events-none">
        <div className={`relative transition-all duration-500 overflow-hidden ${orientation === 'landscape' ? 'w-[280px] h-[200px]' : 'w-[200px] h-[280px]'} ${layoutMode === 'contain' ? emptySpaceColor : ''}`}>
          {layoutMode === 'contain' && aiOutpaint && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-full opacity-80" style={{ backgroundImage: `linear-gradient(${theme === 'dark' ? '#c084fc' : '#6366f1'} 1px, transparent 1px), linear-gradient(90deg, ${theme === 'dark' ? '#c084fc' : '#6366f1'} 1px, transparent 1px)`, backgroundSize: '12px 12px' }} />
              <div className={`absolute text-[10px] font-black uppercase tracking-[0.25em] animate-pulse ${theme === 'dark' ? 'text-purple-400' : 'text-indigo-600'}`}>AI Extension Space</div>
            </div>
          )}
          <img 
            src={imageUrl || DEFAULT_IMAGE} 
            alt="Poster" 
            className={`relative z-10 w-full h-full ${layoutMode === 'contain' ? 'object-contain' : 'object-cover'}`}
            onError={() => setHasError(true)}
          />
        </div>
      </Html>
    );
  }

  return (
    <ErrorBoundary fallback={
       <Html center className="pointer-events-none">
        <div className={`relative transition-all duration-500 overflow-hidden ${orientation === 'landscape' ? 'w-[280px] h-[200px]' : 'w-[200px] h-[280px]'} ${layoutMode === 'contain' ? emptySpaceColor : ''}`}>
          {layoutMode === 'contain' && aiOutpaint && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-full opacity-80" style={{ backgroundImage: `linear-gradient(${theme === 'dark' ? '#c084fc' : '#6366f1'} 1px, transparent 1px), linear-gradient(90deg, ${theme === 'dark' ? '#c084fc' : '#6366f1'} 1px, transparent 1px)`, backgroundSize: '12px 12px' }} />
              <div className={`absolute text-[10px] font-black uppercase tracking-[0.25em] animate-pulse ${theme === 'dark' ? 'text-purple-400' : 'text-indigo-600'}`}>AI Extension Space</div>
            </div>
          )}
          <img 
            src={imageUrl || DEFAULT_IMAGE} 
            alt="Poster" 
            className={`relative z-10 w-full h-full ${layoutMode === 'contain' ? 'object-contain' : 'object-cover'}`}
          />
        </div>
      </Html>
    }>
      <Suspense fallback={null}>
        <WorkshopCanvasLoadTracker />
        <WorkshopPoster3D 
          imageUrl={imageUrl} 
          materialType={materialType} 
          interactive={interactive}
          size={size}
          orientation={orientation}
          autoRotate={autoRotate}
          layoutMode={layoutMode}
          theme={theme}
          aiOutpaint={aiOutpaint}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

// --- 3D Poster Component (Ported from Main Landing) ---
function WorkshopPoster3D({ 
  imageUrl, 
  materialType, 
  interactive = false, 
  size = 'A4',
  orientation = 'portrait',
  autoRotate = false,
  layoutMode = 'cover',
  theme,
  aiOutpaint = false
}: { 
  imageUrl: string | null, 
  materialType: string, 
  interactive?: boolean, 
  size?: SizeType,
  orientation?: 'portrait' | 'landscape',
  autoRotate?: boolean,
  layoutMode?: 'cover' | 'contain',
  theme: string,
  aiOutpaint?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const targetRotation = useRef({ x: 0, y: 0 });
  
  const textureUrl = imageUrl || DEFAULT_IMAGE;
  const texture = useTexture(textureUrl);

  const targetAspect = useMemo(() => {
    const baseAspect = 1 / 1.414;
    return orientation === 'landscape' ? 1 / baseAspect : baseAspect;
  }, [size, orientation]);

  useEffect(() => {
    if (!texture || !texture.image) return;
    const img = texture.image as HTMLImageElement;
    const imageAspect = img.width / img.height;
    
    // Reset wrapping to ensure clean containment
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    if (layoutMode === 'cover') {
      if (imageAspect > targetAspect) {
        texture.repeat.set(targetAspect / imageAspect, 1);
        texture.offset.set((1 - targetAspect / imageAspect) / 2, 0);
      } else {
        texture.repeat.set(1, imageAspect / targetAspect);
        texture.offset.set(0, (1 - imageAspect / targetAspect) / 2);
      }
    } else {
      // Contain mode - Use full texture, calculated size instead of UV mapping
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
    }
    
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }, [texture, targetAspect, layoutMode]);

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
    if (groupRef.current) {
      const targetRotationY = active ? Math.PI : 0;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotationY,
        delta * 5
      );

      const targetScale = active ? 1.1 : 1;
      const currentScale = groupRef.current.scale.x;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 5);
      groupRef.current.scale.setScalar(newScale);
    }

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

    // 빈 공간 배경색: 화이트 모드(라이트테마)에서는 블랙, 블랙 모드(다크테마)에서는 화이트
    // AI Outpaint 활성 시에는 보라색 톤 적용
    const bgHex = aiOutpaint
      ? (theme === 'dark' ? '#1a1033' : '#f5f3ff')
      : (theme === 'dark' ? '#ffffff' : '#000000');

    const baseProps = {
      roughness,
      metalness,
      toneMapped: false
    };

    return [
      new THREE.MeshStandardMaterial({ ...baseProps, color: '#1a1a1a' }), // side
      new THREE.MeshStandardMaterial({ ...baseProps, color: '#1a1a1a' }), // side
      new THREE.MeshStandardMaterial({ ...baseProps, color: '#1a1a1a' }), // side
      new THREE.MeshStandardMaterial({ ...baseProps, color: '#1a1a1a' }), // side
      new THREE.MeshStandardMaterial({ ...baseProps, color: bgHex }), // front (background for photo)
      new THREE.MeshStandardMaterial({ ...baseProps, color: '#1a1a1a' }), // back
    ];
  }, [materialType, theme, layoutMode, aiOutpaint]);

  const isAluminum = materialType === 'aluminum';
  const depth = isAluminum ? 0.008 : 0.04;

  const geometryArgs = useMemo(() => {
    const width = orientation === 'landscape' ? 1.414 : 1;
    const height = orientation === 'landscape' ? 1 : 1.414;
    return [width, height, depth] as [number, number, number];
  }, [size, depth, orientation]);

  // 사진 전 전용 재질 (Box 위에 부착)
  const photoMaterial = useMemo(() => {
    const isAluminum = materialType === 'aluminum';
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: isAluminum ? 1.0 : 0.05,
      color: '#ffffff',
      transparent: true,
      toneMapped: false
    });
  }, [texture, materialType]);

  // 사진 평면 사이즈 계산 (Contain 모드용)
  const photoScale = useMemo(() => {
    if (!texture || !texture.image || layoutMode === 'cover') return [1, 1, 1] as [number, number, number];
    
    const img = texture.image as HTMLImageElement;
    const imageAspect = img.width / img.height;
    
    if (imageAspect > targetAspect) {
      // 이미지가 가로로 더 김 -> 가로는 꽉 채우고 세로를 줄임
      return [1, targetAspect / imageAspect, 1] as [number, number, number];
    } else {
      // 이미지가 세로로 더 김 -> 세로는 꽉 채우고 가로를 줄임
      return [imageAspect / targetAspect, 1, 1] as [number, number, number];
    }
  }, [texture, layoutMode, targetAspect, orientation]);

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
          onClick={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            if (active) {
              setActive(false);
            } else {
              setActive(true);
            }
          }}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          material={materials}
          castShadow
          receiveShadow
        >
          <boxGeometry args={geometryArgs} /> 
          
          {/* AI Extension Grid (Only in Contain mode) */}
          {layoutMode === 'contain' && aiOutpaint && (
            <mesh position={[0, 0, depth / 2 + 0.0005]}>
              <planeGeometry args={[geometryArgs[0], geometryArgs[1]]} />
              <meshStandardMaterial 
                transparent 
                opacity={0.4} 
                color={theme === 'dark' ? '#c084fc' : '#6366f1'}
                wireframe
              />
            </mesh>
          )}

          {/* 사진 레이어 (Z축으로 살짝 앞으로) */}
          <mesh 
            position={[0, 0, depth / 2 + 0.001]} 
            scale={photoScale}
            material={photoMaterial}
          >
            <planeGeometry args={[geometryArgs[0], geometryArgs[1]]} />
          </mesh>
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
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { addToCart, openCart } = useCart();
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const totalSteps = STEPS.length;

  // Workshop State
  const [materialType, setMaterialType] = useState<'aluminum'>('aluminum');
  const [size, setSize] = useState<SizeType>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [aiUpscale, setAiUpscale] = useState(false);
  const [aiOutpaint, setAiOutpaint] = useState(false);
  const [aiAutoFill, setAiAutoFill] = useState(false);
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
          showToast("로그인이 필요합니다.", "error");
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
            orientation: orientation,
            ai_upscale: aiUpscale,
            ai_outpaint: aiOutpaint,
            ai_autofill: aiAutoFill,
            price: 49000,
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
          <div className={`text-[12px] font-bold tracking-widest uppercase mb-0.5 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>
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
        <div className="max-w-xl md:max-w-7xl mx-auto w-full px-6 mb-8">
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
        <div className="flex-1 max-w-xl md:max-w-7xl mx-auto w-full px-6 relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -20 : 20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              {/* --- STEP 1: Material & Size Selection --- */}
              {currentStep === 1 && (
                <div className="flex flex-col md:flex-row gap-12 md:gap-20">
                  <div className="flex-1 space-y-12">
                    <div>
                      <h3 className={`text-xl font-bold mb-6 flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                        <div className="w-1.5 h-6 bg-cyan-400 rounded-full" />
                        재질 확인
                      </h3>
                      <div className="flex flex-col gap-4">
                        <div 
                          className={`p-8 rounded-[40px] border text-left transition-all cursor-default relative overflow-hidden ${
                            theme === 'dark' 
                              ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.15)]' 
                              : 'bg-cyan-50 border-cyan-500/30'
                          }`}
                        >
                          <div className={`text-[12px] font-black tracking-[0.3em] uppercase mb-4 ${theme === 'dark' ? 'text-cyan-300' : 'text-cyan-800'}`}>Premium Material</div>
                          <h3 className={`text-2xl font-black mb-3 ${theme === 'dark' ? 'text-white' : 'text-cyan-900'}`}>메탈릭 알루미늄</h3>
                          <p className={`text-base leading-relaxed break-keep ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            METALORA Signature: 얇고 매끄러운 표면. 빛이 금속 특유의 광택으로 반사되어 미래지향적인 색감을 구현합니다.
                          </p>
                          <div className={`mt-8 pt-6 border-t text-sm font-bold flex items-center gap-2 ${
                            theme === 'dark' ? 'border-cyan-500/20 text-cyan-400' : 'border-cyan-500/10 text-cyan-700'
                          }`}>
                            <div className="w-5 h-5 rounded-full bg-cyan-400/20 flex items-center justify-center">
                              <Check size={12} />
                            </div>
                            시그니처 재질로 자동 선택되었습니다
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-[400px] space-y-12">
                    <div>
                      <h3 className={`text-lg font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>사이즈 선택</h3>
                      <div className="grid grid-cols-1 gap-4">
                        <button
                          onClick={() => setSize('A4')}
                          className={`py-6 px-8 rounded-3xl border text-left transition-all flex items-center justify-between ${
                            size === 'A4' 
                              ? theme === 'dark' 
                                ? 'bg-purple-500/10 border-purple-400 text-purple-400' 
                                : 'bg-purple-50 border-purple-500 text-purple-600'
                              : theme === 'dark'
                                ? 'bg-zinc-900/40 border-white/5 text-zinc-400'
                                : 'bg-zinc-50 border-black/5 text-zinc-500'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-black text-lg underline decoration-2 underline-offset-4 decoration-purple-500/30">A4 Standard</span>
                            <span className="text-[14px] font-semibold opacity-90">210 x 297 mm</span>
                          </div>
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${size === 'A4' ? 'bg-purple-500 border-purple-500' : 'border-zinc-700'}`}>
                            {size === 'A4' && <Check size={16} className="text-white" />}
                          </div>
                        </button>
                        <button
                          disabled
                          className={`py-6 px-8 rounded-3xl border text-left transition-all cursor-not-allowed opacity-40 ${
                            theme === 'dark' ? 'bg-zinc-900/20 border-white/5 text-zinc-600' : 'bg-zinc-100 border-black/5 text-zinc-400'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-black text-lg">Custom Size</span>
                            <span className="text-sm font-medium">Coming Soon</span>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className={`text-lg font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>방향 선택</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setOrientation('portrait')}
                          className={`py-6 rounded-3xl border text-center transition-all flex flex-col items-center gap-3 ${
                            orientation === 'portrait' 
                              ? theme === 'dark' 
                                ? 'bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-xl' 
                                : 'bg-cyan-50 border-cyan-500 text-cyan-600 shadow-lg'
                              : theme === 'dark'
                                ? 'bg-zinc-900/40 border-white/5 text-zinc-400'
                                : 'bg-zinc-50 border-black/5 text-zinc-500'
                          }`}
                        >
                          <div className={`w-6 h-9 rounded-md border-2 transition-transform duration-500 ${orientation === 'portrait' ? 'border-current scale-110 shadow-lg shadow-cyan-400/20' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')}`} />
                          <div className="font-black text-[14px] tracking-tighter">세로형 (Portrait)</div>
                        </button>
                        <button
                          onClick={() => setOrientation('landscape')}
                          className={`py-6 rounded-3xl border text-center transition-all flex flex-col items-center gap-3 ${
                            orientation === 'landscape' 
                              ? theme === 'dark' 
                                ? 'bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-xl' 
                                : 'bg-cyan-50 border-cyan-500 text-cyan-600 shadow-lg'
                              : theme === 'dark'
                                ? 'bg-zinc-900/40 border-white/5 text-zinc-400'
                                : 'bg-zinc-50 border-black/5 text-zinc-500'
                          }`}
                        >
                          <div className={`w-9 h-6 rounded-md border-2 transition-transform duration-500 ${orientation === 'landscape' ? 'border-current scale-110 shadow-lg shadow-cyan-400/20' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')}`} />
                          <div className="font-black text-[14px] tracking-tighter">가로형 (Landscape)</div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- STEP 2: Image Upload & 3D Preview --- */}
              {currentStep === 2 && (
                <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-16">
                  {/* Left Column: 3D Preview */}
                  <div className="flex-1 w-full order-1 md:order-1">
                    <div className={`w-full aspect-square md:aspect-[16/10] rounded-[32px] md:rounded-[48px] overflow-hidden border relative shadow-2xl transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-black border-white/10' : 'bg-zinc-50 border-black/5'
                    }`}>
                      <div className={`absolute top-4 left-4 z-10 px-4 py-1.5 backdrop-blur-md rounded-full border text-[12px] tracking-[0.2em] font-bold uppercase flex items-center gap-2.5 ${
                        theme === 'dark' ? 'bg-black/50 border-white/10 text-white' : 'bg-white/50 border-black/5 text-black'
                      }`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Studio Live Preview
                      </div>
                      
                      <motion.button 
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        onClick={() => setIsModalOpen(true)}
                        className={`absolute top-6 right-6 p-3 backdrop-blur-md rounded-full border z-10 transition-colors ${
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
                        <Canvas shadows camera={{ position: [0, 0, 2.8], fov: 45 }} style={{ pointerEvents: 'none' }}>
                            <WorkshopPoster3DWithFallback 
                              key={`preview-${orientation}`}
                              imageUrl={uploadedImage} 
                              materialType={materialType} 
                              interactive={false}
                              size={size}
                              orientation={orientation}
                              autoRotate={true}
                              theme={theme}
                              layoutMode={aiAutoFill ? 'cover' : 'contain'}
                              aiOutpaint={aiOutpaint}
                            />
                          <ContactShadows position={[0, -1.2, 0]} opacity={theme === 'dark' ? 0.6 : 0.2} scale={6} blur={2.5} far={2} color={theme === 'dark' ? "#000000" : "#666666"} />
                        </Canvas>
                      </ErrorBoundary>
                    </div>
                  </div>

                  {/* Right Column: Controls */}
                  <div className="w-full md:w-[400px] order-2 md:order-2 flex flex-col gap-6">
                    <div className={`backdrop-blur-md border rounded-[32px] md:rounded-[40px] p-8 text-center transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-zinc-900/40 border-white/5 shadow-2xl' : 'bg-zinc-50 border-black/5'
                    }`}>
                      <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6 ${
                        theme === 'dark' ? 'bg-white/5 text-white' : 'bg-black/5 text-black'
                      }`}>
                        <Upload size={28} />
                      </div>
                      <h3 className={`text-xl font-bold mb-3 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>이미지 업로드</h3>
                      <p className={`text-[15px] leading-relaxed mb-8 break-keep ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        고해상도 이미지일수록 알루미늄의 광택이<br className="hidden md:block"/> 더 선명하게 살아납니다.
                      </p>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className={`w-full py-5 font-bold rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98] ${
                          theme === 'dark' 
                            ? 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5' 
                            : 'bg-black text-white hover:bg-zinc-800 shadow-lg shadow-black/10'
                        }`}
                      >
                        {isUploading ? (
                          <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${theme === 'dark' ? 'border-black' : 'border-white'}`} />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                        {isUploading ? '업로드 중...' : uploadedImage ? '다른 사진 선택' : '사진 등록하기'}
                      </button>
                      <p className={`text-[14px] mt-4 text-center font-medium leading-tight break-keep ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
                        ※ 타인의 저작권을 침해하는 이미지는 삼가주세요.
                      </p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                        accept="image/*" 
                        className="hidden" 
                      />

                      {/* AI Premium Options Integrated */}
                      <div className={`mt-10 pt-8 border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                        <div className="flex items-center justify-center gap-2 mb-6">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                          <h4 className={`text-[12px] font-black tracking-[0.2em] uppercase ${theme === 'dark' ? 'text-purple-400' : 'text-purple-700'}`}>AI Premium Solutions</h4>
                        </div>
                        <div className="space-y-3">
                          {/* 1. 자동확대 프리뷰 레이아웃 */}
                          <button
                            onClick={() => {
                              setAiAutoFill(!aiAutoFill);
                              if (!aiAutoFill) setAiOutpaint(false); // If enabling auto-fill, disable outpaint
                            }}
                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center gap-4 group active:scale-[0.98] ${
                              aiAutoFill 
                                ? theme === 'dark' 
                                  ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]' 
                                  : 'bg-cyan-50 border-cyan-500/30 shadow-[0_10px_20px_rgba(34,211,238,0.05)]'
                                : theme === 'dark'
                                  ? 'bg-zinc-900/20 border-white/5 hover:border-white/10'
                                  : 'bg-zinc-100 border-black/5 hover:border-black/10'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                              aiAutoFill ? 'bg-cyan-500 border-cyan-500' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')
                            }`}>
                              {aiAutoFill && <Check size={14} className="text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-[15px] ${theme === 'dark' ? 'text-white' : 'text-black'}`}>자동확대 프리뷰 레이아웃</span>
                                <span className={`text-[12px] px-1.5 py-0.5 rounded font-black uppercase ${theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>Free</span>
                              </div>
                              <p className={`text-[14px] mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>프레임 규격에 맞춰 이미지를 자동으로 확대합니다.</p>
                            </div>
                          </button>

                          {/* 2. AI 스페이스 익스텐션 */}
                          <button
                            onClick={() => {
                              setAiOutpaint(!aiOutpaint);
                              if (!aiOutpaint) setAiAutoFill(false); // If enabling outpaint, disable auto-fill (zoom)
                            }}
                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center gap-4 group active:scale-[0.98] ${
                              aiOutpaint 
                                ? theme === 'dark' 
                                  ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                                  : 'bg-purple-50 border-purple-500/30 shadow-[0_10px_20px_rgba(168,85,247,0.05)]'
                                : theme === 'dark'
                                  ? 'bg-zinc-900/20 border-white/5 hover:border-white/10'
                                  : 'bg-zinc-100 border-black/5 hover:border-black/10'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                              aiOutpaint ? 'bg-purple-500 border-purple-500' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')
                            }`}>
                              {aiOutpaint && <Check size={14} className="text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-[15px] ${theme === 'dark' ? 'text-white' : 'text-black'}`}>AI 스페이스 익스텐션</span>
                                <span className="text-[12px] px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded font-black uppercase">Free</span>
                              </div>
                              <p className={`text-[14px] mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>확대 없이 비율을 유지하며 잘린 공간을 AI가 채웁니다.</p>
                            </div>
                          </button>

                          {/* 3. AI 울트라 디테일 최적화 */}
                          <button
                            onClick={() => setAiUpscale(!aiUpscale)}
                            className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center gap-4 group active:scale-[0.98] ${
                              aiUpscale 
                                ? theme === 'dark' 
                                  ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.1)]' 
                                  : 'bg-purple-50 border-purple-500/30 shadow-[0_10px_20px_rgba(168,85,247,0.05)]'
                                : theme === 'dark'
                                  ? 'bg-zinc-900/20 border-white/5 hover:border-white/10'
                                  : 'bg-zinc-100 border-black/5 hover:border-black/10'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                              aiUpscale ? 'bg-purple-500 border-purple-500' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')
                            }`}>
                              {aiUpscale && <Check size={14} className="text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-[15px] ${theme === 'dark' ? 'text-white' : 'text-black'}`}>AI 울트라 디테일 최적화</span>
                                <span className="text-[12px] px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded font-black uppercase">Free</span>
                              </div>
                              <p className={`text-[14px] mt-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>노이즈를 제거하고 4K급 고해상도로 변환합니다.</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* --- STEP 3: Finalize --- */}
              {currentStep === 3 && (
                <div className="flex flex-col md:flex-row md:items-center gap-12 md:gap-20 pt-4">
                  {/* Left Column: Result Preview */}
                  <div className="flex-1 flex justify-center order-1 md:order-1">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`w-full aspect-[3/4] max-w-[320px] md:max-w-[420px] rounded-[32px] md:rounded-[48px] overflow-hidden border shadow-[0_30px_60px_rgba(0,0,0,0.3)] transition-colors duration-500 ${
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
                              key={`final-${orientation}`}
                              imageUrl={uploadedImage} 
                              materialType={materialType} 
                              interactive={false}
                              size={size}
                              orientation={orientation}
                              autoRotate={true}
                              layoutMode={aiAutoFill ? 'cover' : 'contain'}
                              theme={theme}
                              aiOutpaint={aiOutpaint}
                            />
                          </Suspense>
                          <ContactShadows position={[0, -1, 0]} opacity={theme === 'dark' ? 0.5 : 0.2} scale={5} blur={2} far={2} color={theme === 'dark' ? "#000000" : "#666666"} />
                        </Canvas>
                      </ErrorBoundary>
                    </motion.div>
                  </div>

                  {/* Right Column: Order Summary */}
                  <div className="w-full md:w-[400px] order-2 md:order-2 space-y-6">
                    <div className={`rounded-[32px] p-10 border transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-zinc-900/40 border-white/5 shadow-2xl' : 'bg-zinc-50 border-black/5'
                    }`}>
                      <h3 className={`text-[13px] font-black tracking-[0.2em] uppercase mb-8 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>Studio Order Summary</h3>
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>제작 방식</span>
                          <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>커스텀 제작</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-medium">
                          <span className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}>재질</span>
                          <span className={theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}>메탈릭 알루미늄</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-medium">
                          <span className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}>사이즈</span>
                          <span className={theme === 'dark' ? 'text-white' : 'text-black'}>{size} ({orientation === 'landscape' ? '297x210mm' : '210x297mm'})</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-medium">
                          <span className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}>방향</span>
                          <span className={theme === 'dark' ? 'text-white' : 'text-black'}>{orientation === 'landscape' ? '가로형' : '세로형'}</span>
                        </div>
                        {(aiUpscale || aiOutpaint || aiAutoFill) && (
                          <div className={`pt-4 border-t ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
                            <p className={`text-[14px] font-black uppercase tracking-widest mb-3 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>적용된 AI 솔루션</p>
                            <div className="space-y-2">
                              {aiAutoFill && (
                                <div className={`flex items-center gap-2 text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                  <span>자동확대 프리뷰 레이아웃</span>
                                </div>
                              )}
                              {aiOutpaint && (
                                <div className={`flex items-center gap-2 text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span>AI 스페이스 익스텐션</span>
                                </div>
                              )}
                              {aiUpscale && (
                                <div className={`flex items-center gap-2 text-[14px] font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span>AI 울트라 디테일 최적화</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className={`pt-6 border-t flex justify-between items-center ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
                          <span className={`font-bold ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>결제 예정 금액</span>
                          <div className={`text-2xl font-black ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                            <AnimatedPrice value={49000} />
                            <span className="text-sm ml-1 font-bold">원</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`p-6 border rounded-2xl transition-colors duration-500 ${
                      theme === 'dark' ? 'bg-purple-500/5 border-purple-500/20' : 'bg-purple-50 border-purple-200'
                    }`}>
                      <p className={`text-[12px] leading-relaxed text-center ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>
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
        <div className="max-w-xl md:max-w-7xl mx-auto w-full pointer-events-auto">
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
            className={`fixed inset-0 z-[10005] backdrop-blur-xl flex flex-col pointer-events-auto transition-colors duration-500 ${
              theme === 'dark' ? 'bg-black/95' : 'bg-white/95'
            }`}
          >
            <div className="absolute top-0 left-0 w-full h-20 flex items-center justify-between px-6 z-20">
              <div className="flex flex-col">
                <span className={`text-[11px] font-bold tracking-[0.3em] uppercase mb-1 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>Interactive</span>
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
                    orientation={orientation}
                    layoutMode={aiAutoFill ? 'cover' : 'contain'}
                    theme={theme}
                    aiOutpaint={aiOutpaint}
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
