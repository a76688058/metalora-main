import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, Text, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { 
  ArrowLeft, Wand2, Sparkles, Zap, Save, Maximize2, Cpu
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { GoogleGenAI } from '@google/genai';
import CopyrightPage from '../components/Workshop/CopyrightPage';
import gsap from 'gsap';

// --- Shader Definition (Refined for High-End Aesthetic) ---

const MasterFXMaterial = shaderMaterial(
  {
    uTexture: null,
    uHasTexture: 0,
    uTime: 0,
    uColorPrimary: new THREE.Color('#8A2BE2'),
    uColorSecondary: new THREE.Color('#4B0082'),
    uFXActive: 0,
    uResolution: new THREE.Vector2(1024, 1024),
    uMacroView: 0,
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
  uniform float uTime;
  uniform vec3 uColorPrimary;
  uniform vec3 uColorSecondary;
  uniform float uFXActive;
  uniform vec2 uResolution;
  uniform float uMacroView;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec4 texColor = vec4(0.05, 0.05, 0.05, 1.0);
    if (uHasTexture > 0.5) {
      texColor = texture2D(uTexture, vUv);
    }
    
    // Brushed Metal Texture
    float noise = hash(vec2(vUv.x * 2000.0, vUv.y * 5.0));
    float hairline = smoothstep(0.2, 0.8, noise);
    texColor.rgb *= (0.9 + 0.1 * hairline);

    if (uFXActive > 0.01) {
      float dist = distance(vUv, vec2(0.5));
      float mask = smoothstep(0.5, 0.2, dist);
      texColor.rgb *= mask;
      
      float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 4.0);
      vec3 glowColor = mix(uColorPrimary, uColorSecondary, 0.5);
      texColor.rgb += glowColor * rim * 1.2 * uFXActive;
    }

    gl_FragColor = texColor;
  }
  `
);

extend({ MasterFXMaterial });

// --- 3D Components ---

const MetalPanel = ({ 
  imageUrl, 
  position = [0, 0, 0], 
  isFXActive = false,
  isMacroView = false,
  serialNumber = ''
}: { 
  imageUrl: string | null, 
  position?: [number, number, number], 
  isFXActive?: boolean,
  isMacroView?: boolean,
  serialNumber?: string
}) => {
  const materialRef = useRef<any>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (imageUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(imageUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      });
    } else {
      setTexture(null);
    }
  }, [imageUrl]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uMacroView = THREE.MathUtils.lerp(
        materialRef.current.uMacroView, 
        isMacroView ? 1 : 0, 
        0.05
      );
      materialRef.current.uFXActive = THREE.MathUtils.lerp(
        materialRef.current.uFXActive, 
        isFXActive ? 1 : 0, 
        0.05
      );
      materialRef.current.uHasTexture = texture ? 1.0 : 0.0;
    }
  });

  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3, 4.242, 0.02]} />
        {/* @ts-ignore */}
        <masterFXMaterial 
          ref={materialRef}
          uTexture={texture}
          transparent
        />
      </mesh>
      {serialNumber && (
        <Text
          position={[0, 2.0, 0.02]}
          fontSize={0.08}
          color="#A0A0A0"
          font="https://fonts.gstatic.com/s/jetbrainsmono/v13/tDbY2oWUg02q24S1nFuFMWS6T6f7SjZ9V2ux6mQ.woff"
        >
          {`SN: ${serialNumber}`}
        </Text>
      )}
    </group>
  );
};

const CameraRig = ({ isMacroView }: { isMacroView: boolean }) => {
  useFrame((state) => {
    const targetPos = isMacroView ? new THREE.Vector3(1.2, 1.5, 2.5) : new THREE.Vector3(0, 0, 8);
    state.camera.position.lerp(targetPos, 0.05);
  });
  return null;
};

// --- Main Atelier Component ---

export default function Atelier() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  
  const [isAgreed, setIsAgreed] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [slot1Image, setSlot1Image] = useState<string | null>(null);
  const [slot2Image, setSlot2Image] = useState<string | null>(null);
  const [isFXActive, setIsFXActive] = useState(false);
  const [isMacroView, setIsMacroView] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'ARCHIVING' | 'SUCCESS'>('IDLE');
  const [displayPrice, setDisplayPrice] = useState(0);
  const [serialNumber, setSerialNumber] = useState('');

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  // Dynamic Pricing Logic
  useEffect(() => {
    if (slot1Image || slot2Image) {
      if (!serialNumber) {
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        setSerialNumber(`ML-A4-2026-${randomStr}`);
      }
      
      const targetPrice = 49000;
      let current = displayPrice;
      const step = 1234;
      
      const interval = setInterval(() => {
        if (current < targetPrice) {
          current = Math.min(current + step, targetPrice);
          setDisplayPrice(current);
        } else {
          clearInterval(interval);
        }
      }, 20);
      
      return () => clearInterval(interval);
    }
  }, [slot1Image, slot2Image]);

  const handleAgreement = () => setIsAgreed(true);

  const handleFileUpload = async (slot: 1 | 2, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (slot === 1) setSlot1Image(url);
    else setSlot2Image(url);
    showToast(`Slot ${slot} loaded.`, 'success');
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !process.env.GEMINI_API_KEY) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "3:4", imageSize: "1K" } },
      });
      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        const url = `data:image/png;base64,${part.inlineData.data}`;
        if (!slot1Image) setSlot1Image(url);
        else setSlot2Image(url);
        showToast('AI Generation Complete.', 'success');
      }
    } catch (err) {
      showToast('Generation failed.', 'error');
    } finally {
      setIsGenerating(false);
      setPrompt('');
    }
  };

  const handleSave = async () => {
    if (!slot1Image && !slot2Image) return;
    setSaveStatus('ARCHIVING');
    setIsSaving(true);
    
    // Simulate DB Save
    setTimeout(() => {
      setSaveStatus('SUCCESS');
      setIsSaving(false);
      showToast('Archived successfully.', 'success');
      setTimeout(() => setSaveStatus('IDLE'), 3000);
    }, 2000);
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-black flex flex-col font-mono text-[0.9rem] text-[#A0A0A0]">
      <AnimatePresence mode="wait">
        {!isAgreed ? (
          <CopyrightPage key="legal-gate" onAgree={handleAgreement} />
        ) : (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex-1 flex flex-col"
          >
            {/* Top Navigation: h-[50px] */}
            <nav className="h-[50px] shrink-0 border-b border-white/10 flex items-center justify-between px-6 bg-black z-50">
              <button 
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 hover:text-[#8A2BE2] transition-colors uppercase text-[0.75rem] tracking-widest"
              >
                <ArrowLeft size={14} /> EXIT
              </button>
              <div className="text-[0.75rem] tracking-[0.4em] font-bold text-[#8A2BE2]">
                PROJECT: METALORA_A4
              </div>
              <div className="text-[0.75rem] tracking-widest">
                USER: <span className="text-[#8A2BE2]">{user?.email?.split('@')[0].toUpperCase() || 'GUEST'}</span>
              </div>
            </nav>

            {/* Middle: 3D Stage */}
            <main className="flex-1 relative bg-black overflow-hidden">
              {/* Pixel Grid Background */}
              <div className="absolute inset-0 pointer-events-none opacity-10"
                style={{
                  backgroundImage: `linear-gradient(to right, #8A2BE2 1px, transparent 1px), linear-gradient(to bottom, #8A2BE2 1px, transparent 1px)`,
                  backgroundSize: '40px 40px'
                }}
              />
              
              <Canvas shadows camera={{ position: [0, 0, 8], fov: 45 }}>
                <Environment preset="studio" />
                <ambientLight intensity={0.2} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <CameraRig isMacroView={isMacroView} />
                
                <group position={[0, 0, 0]}>
                  {slot1Image && !slot2Image && (
                    <MetalPanel imageUrl={slot1Image} isFXActive={isFXActive} isMacroView={isMacroView} serialNumber={serialNumber} />
                  )}
                  {slot2Image && !slot1Image && (
                    <MetalPanel imageUrl={slot2Image} isFXActive={isFXActive} isMacroView={isMacroView} serialNumber={serialNumber} />
                  )}
                  {slot1Image && slot2Image && (
                    <>
                      <MetalPanel imageUrl={slot1Image} position={[-2, 0, 0]} isFXActive={isFXActive} isMacroView={isMacroView} serialNumber={serialNumber} />
                      <MetalPanel imageUrl={slot2Image} position={[2, 0, 0]} isFXActive={isFXActive} isMacroView={isMacroView} serialNumber={serialNumber} />
                    </>
                  )}
                  {!slot1Image && !slot2Image && (
                    <MetalPanel imageUrl={null} isFXActive={isFXActive} isMacroView={isMacroView} />
                  )}
                  <ContactShadows position={[0, -2.5, 0]} opacity={0.4} scale={10} blur={2} far={4} />
                </group>
                <OrbitControls enablePan={false} enableZoom={!isMacroView} autoRotate={false} />
              </Canvas>

              {/* Status Overlays */}
              <div className="absolute top-6 left-6 flex flex-col gap-1">
                <div className="text-[0.65rem] tracking-widest text-[#8A2BE2]/60 uppercase">System Status</div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#8A2BE2] animate-pulse" />
                  <div className="text-[0.75rem] font-bold">ATELIER_ONLINE</div>
                </div>
              </div>
            </main>

            {/* Bottom: Control Dock: h-[300px] */}
            <footer className="h-[300px] shrink-0 bg-[#050505]/90 backdrop-blur-xl border-t border-white/10 p-8 flex items-center justify-between relative z-50">
              
              {/* Dual Slots (Left) */}
              <div className="flex gap-6 h-full items-center">
                {[1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="text-[0.65rem] tracking-widest uppercase text-center">Slot 0{i}</div>
                    <div 
                      onClick={() => (i === 1 ? fileInputRef1 : fileInputRef2).current?.click()}
                      className="w-[120px] h-[170px] border border-white/10 rounded-sm flex flex-col items-center justify-center cursor-pointer hover:border-[#8A2BE2]/50 transition-all group relative overflow-hidden bg-black/40"
                    >
                      {(i === 1 ? slot1Image : slot2Image) ? (
                        <img 
                          src={(i === 1 ? slot1Image : slot2Image)!} 
                          alt={`Slot ${i}`} 
                          className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Cpu size={24} className="text-white/10 group-hover:text-[#8A2BE2]/40 transition-colors" />
                          <span className="text-[0.65rem] tracking-[0.2em] text-white/20">EMPTY</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        ref={i === 1 ? fileInputRef1 : fileInputRef2} 
                        className="hidden" 
                        onChange={(e) => handleFileUpload(i as 1 | 2, e)} 
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Central Action & AI Terminal */}
              <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-md mx-auto">
                <button
                  onClick={() => showToast('Mastering sequence initiated.', 'info')}
                  className="group relative px-12 py-4 border border-[#8A2BE2] text-[#8A2BE2] font-black tracking-[0.4em] uppercase transition-all hover:bg-[#8A2BE2]/10 hover:shadow-[0_0_30px_rgba(138,43,226,0.3)]"
                >
                  START MASTERING
                  <div className="absolute -inset-0.5 bg-[#8A2BE2] opacity-0 group-hover:opacity-10 blur transition-opacity" />
                </button>

                <div className="w-full flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 border border-white/10 rounded-sm">
                    <Wand2 size={14} className="text-[#8A2BE2]" />
                    <input 
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                      placeholder="ENTER_CREATIVE_PROMPT_HERE..."
                      className="flex-1 bg-transparent border-none outline-none text-[0.8rem] text-[#A0A0A0] placeholder:text-white/10"
                    />
                    {isGenerating && <div className="w-3 h-3 border-2 border-[#8A2BE2] border-t-transparent rounded-full animate-spin" />}
                  </div>
                  <div className="flex justify-between px-1">
                    <span className="text-[0.6rem] text-white/20 tracking-widest">TERMINAL_V2.0</span>
                    <span className="text-[0.6rem] text-white/20 tracking-widest">READY_FOR_INPUT</span>
                  </div>
                </div>
              </div>

              {/* Right Tools & Pricing */}
              <div className="flex flex-col items-end gap-8 h-full justify-center">
                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsFXActive(!isFXActive)}
                    className={`w-12 h-12 border flex items-center justify-center transition-all ${isFXActive ? 'bg-[#8A2BE2]/20 border-[#8A2BE2] text-[#8A2BE2]' : 'border-white/10 text-white/20 hover:border-white/30'}`}
                    title="FX ENGINE"
                  >
                    <Zap size={20} />
                  </button>
                  <button 
                    onClick={() => setIsMacroView(!isMacroView)}
                    className={`w-12 h-12 border flex items-center justify-center transition-all ${isMacroView ? 'bg-[#8A2BE2]/20 border-[#8A2BE2] text-[#8A2BE2]' : 'border-white/10 text-white/20 hover:border-white/30'}`}
                    title="MACRO ZOOM"
                  >
                    <Maximize2 size={20} />
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`w-12 h-12 border flex items-center justify-center transition-all ${saveStatus === 'SUCCESS' ? 'bg-green-500/20 border-green-500 text-green-500' : 'border-white/10 text-white/20 hover:border-white/30'}`}
                    title="SAVE TO COLLECTION"
                  >
                    {saveStatus === 'ARCHIVING' ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                  </button>
                </div>

                <div className="flex flex-col items-end">
                  <div className="text-[0.65rem] tracking-[0.3em] text-white/20 uppercase mb-1">Estimated Value</div>
                  <div className="text-xl font-black text-[#8A2BE2] tracking-tighter">
                    {saveStatus === 'ARCHIVING' ? 'ARCHIVING...' : saveStatus === 'SUCCESS' ? 'SUCCESS' : `${displayPrice.toLocaleString()} KRW`}
                  </div>
                </div>
              </div>

            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        body {
          font-family: 'JetBrains Mono', 'Pretendard', monospace;
        }
        input::placeholder {
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
      `}} />
    </div>
  );
}
