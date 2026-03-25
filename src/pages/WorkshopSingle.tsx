import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Upload, Sparkles, Image as ImageIcon, Check } from 'lucide-react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import Header from '../components/Header';

// --- 1. Alpha-Edge Selective Bloom Shader FX ---
const AlphaEdgeNeonMaterial = shaderMaterial(
  {
    uTexture: null,
    uHasTexture: 0,
    uColor1: new THREE.Color('#0000FF'),
    uColor2: new THREE.Color('#8A2BE2'),
    uIntensity: 0.0,
    uIsAluminum: 1.0,
    uTime: 0,
  },
  // Vertex Shader
  `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
  `,
  // Fragment Shader
  `
  uniform sampler2D uTexture;
  uniform float uHasTexture;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uIntensity;
  uniform float uIsAluminum;
  uniform float uTime;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  
  void main() {
    vec3 panelColor = vec3(0.0, 0.0, 0.0); // Pure Black Background
    
    if (uHasTexture < 0.5) {
      gl_FragColor = vec4(panelColor, 1.0);
      return;
    }
    
    vec4 texColor = texture2D(uTexture, vUv);
    float alpha = texColor.a;
    
    // Calculate Neon Color Gradient (Animated)
    float mixFactor = vUv.y + sin(vUv.x * 5.0 + uTime * 2.0) * 0.1;
    vec3 neonColor = mix(uColor1, uColor2, clamp(mixFactor, 0.0, 1.0));
    
    // --- High-Fidelity Alpha Edge Detection ---
    float outline = 0.0;
    float stepX = 0.004;
    float stepY = 0.004;
    
    // 8-way sampling to find the silhouette edge
    outline += texture2D(uTexture, vUv + vec2(stepX, 0.0)).a;
    outline += texture2D(uTexture, vUv - vec2(stepX, 0.0)).a;
    outline += texture2D(uTexture, vUv + vec2(0.0, stepY)).a;
    outline += texture2D(uTexture, vUv - vec2(0.0, stepY)).a;
    outline += texture2D(uTexture, vUv + vec2(stepX, stepY)).a;
    outline += texture2D(uTexture, vUv - vec2(stepX, -stepY)).a;
    outline += texture2D(uTexture, vUv + vec2(-stepX, stepY)).a;
    outline += texture2D(uTexture, vUv - vec2(-stepX, -stepY)).a;
    outline /= 8.0;
    
    // Outer glow (just outside the alpha mask)
    float outerGlow = smoothstep(0.0, 0.5, outline) * (1.0 - alpha);
    // Inner rim (just inside the alpha mask)
    float innerGlow = smoothstep(0.5, 1.0, outline) * alpha * (1.0 - smoothstep(0.8, 1.0, alpha));
    
    float edgeMask = outerGlow + innerGlow;
    
    // Mix panel and subject
    vec3 finalColor = mix(panelColor, texColor.rgb, alpha);
    
    // Apply Selective Bloom to the Edge
    float glowIntensity = edgeMask * uIntensity * 4.0;
    finalColor += neonColor * glowIntensity;
    
    // --- Material Reflection (PBR Simulation) ---
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float rim = 1.0 - max(dot(normal, viewDir), 0.0);
    
    if (uIsAluminum > 0.5) {
       // Aluminum reflects the neon light across the dark panel
       float metalReflection = pow(rim, 4.0) * uIntensity;
       // Add reflection only to the panel (where alpha is 0)
       finalColor += neonColor * metalReflection * (1.0 - alpha) * 0.8;
       
       // Add a subtle overall metallic sheen
       finalColor += vec3(0.05) * pow(rim, 2.0) * (1.0 - alpha);
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
);
extend({ AlphaEdgeNeonMaterial });

// --- 2. Mock High-Fidelity AI Segmentation (SAM Simulation) ---
// This simulates a server-side Segment Anything Model (SAM) processing
const processImageWithMockAI = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      
      // Create a high-fidelity portrait/subject cutout simulation
      const radiusX = canvas.width * 0.35;
      const radiusY = canvas.height * 0.45;
      
      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor((i / 4) / canvas.width);
        
        const nx = (x - cx) / radiusX;
        const ny = (y - cy) / radiusY;
        const dist = Math.sqrt(nx*nx + ny*ny);
        
        if (dist > 1) {
          data[i + 3] = 0; // Pure Black / Transparent background
        } else if (dist > 0.95) {
          // Anti-aliasing for a razor-sharp but smooth edge
          const alpha = (1 - dist) / 0.05;
          data[i + 3] = Math.floor(alpha * 255);
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = URL.createObjectURL(file);
  });
};

// --- 3. 3D Model Component ---
const ProductModel = ({ imageUrl, materialType, neonColors, intensity }: any) => {
  const materialRef = useRef<any>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  
  useEffect(() => {
    if (imageUrl) {
      new THREE.TextureLoader().load(imageUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      });
    }
  }, [imageUrl]);
  
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
      materialRef.current.uColor1.set(neonColors[0]);
      materialRef.current.uColor2.set(neonColors[1]);
      materialRef.current.uIntensity = THREE.MathUtils.lerp(materialRef.current.uIntensity, intensity, 0.1);
      materialRef.current.uIsAluminum = materialType === 'aluminum' ? 1.0 : 0.0;
      materialRef.current.uHasTexture = texture ? 1.0 : 0.0;
    }
  });
  
  const isAluminum = materialType === 'aluminum';
  const args = isAluminum ? [3, 4, 0.05] : [3, 4, 0.3];
  
  return (
    <group position={[0, 0.5, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={args as any} />
        {/* @ts-ignore */}
        <alphaEdgeNeonMaterial ref={materialRef} uTexture={texture} transparent />
      </mesh>
    </group>
  );
};

// --- Constants ---
const STEPS = [
  { id: 1, title: '제품 재질 및 사이즈 선택' },
  { id: 2, title: '고정밀 AI 배경 제거' },
  { id: 3, title: '3D 피사체 네온 FX' },
  { id: 4, title: '최종 확인 및 주문' },
];

const NEON_STYLES = [
  { id: 'neon-night', name: '네온 나이트', colors: ['#0000FF', '#8A2BE2'], desc: 'Deep Blue & Purple' },
  { id: 'sunset-glow', name: '선셋 글로우', colors: ['#FF4500', '#FF69B4'], desc: 'Orange & Pink' },
  { id: 'ice-fire', name: '아이스 앤 파이어', colors: ['#00FFFF', '#FF0000'], desc: 'Cyan & Red' },
  { id: 'cosmic-aurora', name: '코스믹 오로라', colors: ['#00FF00', '#8A2BE2'], desc: 'Green & Purple' },
  { id: 'synthwave', name: '신스웨이브', colors: ['#FF00FF', '#00FFFF'], desc: 'Magenta & Cyan' },
];

export default function WorkshopSingle() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = STEPS.length;

  // Workshop State
  const [materialType, setMaterialType] = useState<'aluminum' | 'canvas'>('aluminum');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [selectedNeon, setSelectedNeon] = useState(NEON_STYLES[0]);
  const [neonIntensity, setNeonIntensity] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNext = () => {
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const processFile = async (file: File) => {
    setIsProcessingAI(true);
    
    try {
      // 1. Simulate Server-side SAM Processing
      const processedDataUrl = await processImageWithMockAI(file);
      
      // 2. Simulate Supabase Storage Upload Delay
      await new Promise(resolve => setTimeout(resolve, 3500));
      
      setUploadedImage(processedDataUrl);
      setCurrentStep(3); // Auto advance to Stage 3
    } catch (error) {
      console.error('AI Processing failed:', error);
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col font-sans overflow-x-hidden">
      <Header />

      {/* Visual Aesthetic: The Neon Mist */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col pt-24 pb-32">
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
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {/* --- STEP 1: Material Selection --- */}
              {currentStep === 1 && (
                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => setMaterialType('aluminum')}
                    className={`p-6 rounded-3xl border text-left transition-all ${materialType === 'aluminum' ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'bg-zinc-900/40 border-white/5 hover:border-white/20'}`}
                  >
                    <h3 className="text-xl font-bold text-white mb-2">메탈로라 알루미늄</h3>
                    <p className="text-zinc-400 text-sm">얇고 매끄러운 표면. 네온 빛이 금속 특유의 광택으로 반사되어 미래지향적인 느낌을 줍니다.</p>
                  </button>
                  <button 
                    onClick={() => setMaterialType('canvas')}
                    className={`p-6 rounded-3xl border text-left transition-all ${materialType === 'canvas' ? 'bg-purple-500/10 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'bg-zinc-900/40 border-white/5 hover:border-white/20'}`}
                  >
                    <h3 className="text-xl font-bold text-white mb-2">프리미엄 캔버스</h3>
                    <p className="text-zinc-400 text-sm">두께감이 있는 텍스처. 네온 빛이 캔버스 질감에 부드럽게 스며들어 예술적인 분위기를 연출합니다.</p>
                  </button>
                </div>
              )}

              {/* --- STEP 2: High-Fidelity Upload & AI Processing --- */}
              {currentStep === 2 && (
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`bg-zinc-900/40 backdrop-blur-md border rounded-3xl p-8 min-h-[400px] flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-300 ${isDragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/5'}`}
                >
                  {isProcessingAI ? (
                    <div className="flex flex-col items-center gap-8 z-10">
                      <div className="relative w-32 h-32">
                        {/* Graffiti / High-tech Loading Animation */}
                        <div className="absolute inset-0 border-4 border-zinc-800 rounded-2xl"></div>
                        <div className="absolute inset-0 border-4 border-cyan-400 rounded-2xl border-t-transparent animate-spin"></div>
                        <div className="absolute inset-2 bg-purple-500/20 animate-pulse rounded-xl"></div>
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400" size={40} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white mb-2">AI 장인이 배경을 정교하게 다듬고 있습니다...</h3>
                        <p className="text-cyan-400/80 text-sm font-mono">Segment Anything Model (SAM) 가동 중</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-colors ${isDragging ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-zinc-400'}`}>
                        <Upload size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">이미지를 드래그 앤 드롭하세요</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                        업계 최고 수준의 AI가 피사체를 완벽하게 분리하여<br />
                        칼 같은 경계선의 3D 네온 아트로 변환해 드립니다.
                      </p>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-colors flex items-center gap-2"
                      >
                        <ImageIcon size={20} />
                        PC에서 사진 선택
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                        accept="image/*" 
                        className="hidden" 
                      />
                    </>
                  )}
                </div>
              )}

              {/* --- STEP 3: Alpha-Edge Selective Bloom Shader FX --- */}
              {currentStep === 3 && (
                <div className="flex flex-col gap-6">
                  {/* WebGL Canvas Area */}
                  <div className="w-full aspect-square max-w-md mx-auto rounded-3xl overflow-hidden bg-[#000000] border border-white/10 relative shadow-2xl">
                    <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 text-[10px] tracking-widest text-cyan-400 font-bold uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Alpha-Edge FX Engine
                    </div>
                    
                    <Canvas shadows camera={{ position: [0, 0, 8], fov: 45 }}>
                      <Environment preset="city" />
                      <ambientLight intensity={0.2} />
                      <ProductModel 
                        imageUrl={uploadedImage} 
                        materialType={materialType} 
                        neonColors={selectedNeon.colors}
                        intensity={neonIntensity}
                      />
                      <ContactShadows position={[0, -2.5, 0]} opacity={0.5} scale={10} blur={2} far={4} color="#000000" />
                      <OrbitControls enablePan={false} minDistance={4} maxDistance={12} autoRotate autoRotateSpeed={0.5} />
                    </Canvas>
                  </div>

                  {/* Neon Style Controls */}
                  <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-6">
                    <h4 className="text-sm font-bold text-white mb-4">피사체 네온 후광 조합</h4>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                      {NEON_STYLES.map((neon) => (
                        <button
                          key={neon.id}
                          onClick={() => setSelectedNeon(neon)}
                          className={`shrink-0 w-28 p-3 rounded-2xl border transition-all flex flex-col items-center gap-3 ${selectedNeon.id === neon.id ? 'bg-white/10 border-white/30' : 'bg-black/50 border-white/5 hover:border-white/10'}`}
                        >
                          <div 
                            className="w-12 h-12 rounded-full shadow-lg"
                            style={{ background: `linear-gradient(135deg, ${neon.colors[0]}, ${neon.colors[1]})` }}
                          />
                          <div className="text-center">
                            <div className="text-xs font-bold text-white mb-0.5">{neon.name}</div>
                            <div className="text-[9px] text-zinc-500">{neon.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-zinc-400 mb-2">
                        <span>빛의 세기 (Intensity)</span>
                        <span>{Math.round(neonIntensity * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="2" step="0.1" 
                        value={neonIntensity}
                        onChange={(e) => setNeonIntensity(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* --- STEP 4: Finalize --- */}
              {currentStep === 4 && (
                <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6 text-green-400">
                    <Check size={36} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">마스터피스 완성 준비 완료</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                    선택하신 {materialType === 'aluminum' ? '알루미늄' : '캔버스'} 재질과<br />
                    '{selectedNeon.name}' 네온 스타일로 제작을 진행합니다.
                  </p>
                  <div className="w-full p-4 bg-black/50 rounded-2xl border border-white/5 flex justify-between items-center mb-4">
                    <span className="text-zinc-400 text-sm">예상 제작 비용</span>
                    <span className="text-xl font-bold text-cyan-400">49,000 KRW</span>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-6">
          <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex gap-3 shadow-2xl">
            {currentStep > 1 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handlePrev}
                disabled={isProcessingAI}
                className="flex-1 h-14 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ChevronLeft size={20} />
                이전
              </motion.button>
            )}
            <button
              onClick={currentStep === totalSteps ? () => navigate('/workshop') : handleNext}
              disabled={isProcessingAI || (currentStep === 2 && !uploadedImage)}
              className="flex-[2] h-14 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
            >
              {currentStep === totalSteps ? '주문하기' : '다음으로'}
              <ChevronRight size={20} />
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
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
