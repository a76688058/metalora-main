import React, { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { Upload, Image as ImageIcon, Check, ChevronLeft, Maximize, X } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import Header from '../components/Header';

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
function WorkshopPoster3D({ imageUrl, materialType, interactive = false, size = 'A4' }: { imageUrl: string | null, materialType: string, interactive?: boolean, size?: SizeType }) {
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
      if (!interactive && e.beta !== null && e.gamma !== null) {
        const maxTilt = Math.PI / 12;
        const tiltX = THREE.MathUtils.clamp((e.beta - 45) * (Math.PI / 180), -maxTilt, maxTilt);
        const tiltY = THREE.MathUtils.clamp(e.gamma * (Math.PI / 180), -maxTilt, maxTilt);
        targetRotation.current = { x: tiltX, y: tiltY };
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [interactive]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (interactive) {
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 5);
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
    const roughness = isAluminum ? 0.2 : 0.85;
    const metalness = isAluminum ? 0.8 : 0.1;

    const fallbackMaterialProps = {
      color: '#2A2A2A',
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
        emissiveIntensity: isAluminum ? 0.2 : 0.05,
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
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={0.4} castShadow />
      <directionalLight position={[-5, -5, -5]} intensity={0.4} />
      <pointLight position={[2, 2, 2]} intensity={0.2} color="#ffffff" />
      <Environment preset="studio" environmentIntensity={0.5} />
      
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          material={materials}
        >
          <boxGeometry args={geometryArgs} /> 
        </mesh>
      </group>
    </>
  );
}

export default function WorkshopSingle() {
  const navigate = useNavigate();
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      navigate('/workshop/lobby');
    } else {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleActionClick = () => {
    if (currentStep === totalSteps) {
      // Final Step: Trigger Purple Neon Flash
      setIsFlashing(true);
      setTimeout(() => {
        setIsFlashing(false);
        navigate('/workshop'); // Or navigate to a success/processing page
      }, 800);
    } else {
      handleNext();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      setTimeout(() => {
        const url = URL.createObjectURL(file);
        setUploadedImage(url);
        setIsUploading(false);
      }, 1500);
    }
  };

  const isButtonDisabled = (currentStep === 2 && !uploadedImage) || isUploading;

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col font-sans overflow-x-hidden">
      <Header />

      {/* Visual Aesthetic: The Neon Mist */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-cyan-500/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] rounded-full" />
      </div>

      {/* Full Screen Purple Neon Flash Overlay */}
      <AnimatePresence>
        {isFlashing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed inset-0 z-[100] bg-purple-600/40 pointer-events-none mix-blend-screen"
          />
        )}
      </AnimatePresence>

      {/* 3D Interactive Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[9999] bg-black flex flex-col pt-24"
          >
            <div className="absolute top-12 right-6 z-50">
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-sm text-white animate-fade-out-guide whitespace-nowrap">
                터치하여 움직여보세요
              </div>
            </div>

            <div className="flex-1 relative">
              <Canvas shadows camera={{ position: [0, 0, 2.5], fov: 45 }}>
                <Suspense fallback={null}>
                  <WorkshopPoster3D 
                    imageUrl={uploadedImage} 
                    materialType={materialType} 
                    interactive={true}
                    size={size}
                  />
                </Suspense>
                <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={5} blur={2} far={2} color="#000000" />
                <OrbitControls enablePan={false} enableZoom={true} minDistance={1.5} maxDistance={4} />
              </Canvas>
            </div>

            <div className="pb-12 pt-4 flex items-center justify-center gap-2 text-zinc-500 text-sm">
              <motion.div 
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              />
              <span>터치하여 움직여보세요</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex-1 flex flex-col pt-24 pb-12">
        {/* Step Indicator */}
        <div className="max-w-xl mx-auto w-full px-6 mb-8">
            <div className="flex flex-col gap-1 mb-4">
              <span className="text-cyan-400 font-bold tracking-tighter">
                {currentStep} / {totalSteps}
              </span>
              <h2 className="text-xl font-bold text-white">
                {STEPS[currentStep - 1].title}
              </h2>
            </div>
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
                <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6 text-green-400">
                    <Check size={36} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">마스터피스 완성 준비 완료</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                    선택하신 {materialType === 'aluminum' ? '알루미늄' : '캔버스'} 재질로<br />
                    최고의 퀄리티를 담아 제작을 진행합니다.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* --- Integrated Bottom Action Bar (Toss Style 2-Layer) --- */}
      <div className="w-full bg-[#0c0c0c] border-t border-white/5 px-6 pb-10 pt-8 mt-auto z-50">
        <div className="flex flex-col max-w-xl mx-auto w-full">
          {/* Upper Layer: Summary & Price */}
          <div className="flex items-end justify-between">
            <AnimatePresence mode="wait">
              <motion.span
                key={`${materialType}-${size}`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-[15px] font-medium text-zinc-500 tracking-wide"
              >
                알루미늄 패널 · A4
              </motion.span>
            </AnimatePresence>
            <div className="text-[22px] font-bold text-white flex items-baseline gap-1 tracking-tight">
              <AnimatedPrice value={49000} />
              <span className="text-lg font-normal text-zinc-400">원</span>
            </div>
          </div>

          {/* Lower Layer: Dual Navigation Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleBack}
              className="flex-1 bg-zinc-900 text-zinc-400 py-4 rounded-[18px] font-semibold transition-transform active:scale-[0.97]"
            >
              이전으로
            </button>
            <button
              onClick={handleActionClick}
              disabled={isButtonDisabled}
              className="flex-[2.5] bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-4 rounded-[18px] font-bold transition-transform active:scale-[0.97] flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 disabled:shadow-none"
            >
              {currentStep === totalSteps ? '제작 확정' : '다음으로'}
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        body {
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
          background-color: #000;
          -webkit-font-smoothing: antialiased;
        }
        @keyframes fadeOutGuide {
          0% { opacity: 0; transform: translateY(10px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        .animate-fade-out-guide {
          animation: fadeOutGuide 3s ease-in-out forwards;
        }
      `}} />
    </div>
  );
}
