import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import { Truck, Layers, Zap } from 'lucide-react';
import { Html } from '@react-three/drei';
import Hook3D from './Hook3D';
import MountingAnimation from './MountingAnimation';
import MaterialEdgeAnimation from './MaterialEdgeAnimation';
import ErrorBoundary from './ErrorBoundary';
import { useTheme } from '../context/ThemeContext';

const Reveal = ({ children, delay = 0, scale = 1, x = 0, y = 40 }: { children: React.ReactNode, delay?: number, scale?: number, x?: number, y?: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y, x, scale }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: true, margin: "-100px 0px -100px 0px", amount: 0.3 }}
      transition={{ 
        duration: 1.0, 
        delay, 
        ease: [0.16, 1, 0.3, 1] 
      }}
    >
      {children}
    </motion.div>
  );
};

const BrandStorySection = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { scrollYProgress } = useScroll();
  const textY = useTransform(scrollYProgress, [0, 1], [0, 200]);

  const handleBuyClick = () => {
    navigate('/');
  };

  return (
    <div className={`relative transition-colors duration-500 overflow-hidden ${
      theme === 'dark' ? 'bg-black text-white selection:bg-white selection:text-black' : 'bg-white text-black selection:bg-black selection:text-white'
    }`}>
        {/* 3. [NOT A POSTER]: 브랜드의 첫 선언. 새벽녘 장노출 은하수와 산맥 사진. */}
        <section className={`relative z-[80] h-auto py-24 px-6 overflow-hidden flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
          <div className="max-w-7xl mx-auto w-full relative flex flex-col items-start justify-center">
            <div className="flex flex-col items-start justify-center min-h-[80vh] w-full">
              {/* 3D Canvas Container - Floating in Deep Black */}
              <div className="absolute inset-0 z-0">
                {/* Bottom Fade Gradient - Restored for elegant depth */}
                <div className={`absolute inset-x-0 bottom-0 h-1/2 z-10 pointer-events-none ${
                  theme === 'dark' ? 'bg-gradient-to-t from-black via-black/40 to-transparent' : 'bg-gradient-to-t from-white via-white/40 to-transparent'
                }`} />
                
                <ErrorBoundary fallback={
                  <div className="w-full h-full flex items-center justify-center opacity-50">
                    <img src="https://images.unsplash.com/photo-1464802686167-b939a6910659?auto=format&fit=crop&q=80&w=2070" alt="Background" className="w-full h-full object-cover" />
                  </div>
                }>
                  <Canvas 
                    frameloop="always" 
                    gl={{ 
                      antialias: true, 
                      alpha: true, 
                      preserveDrawingBuffer: true,
                      toneMappingExposure: theme === 'dark' ? 1.3 : 1.0
                    }}
                    onCreated={() => {
                      window.dispatchEvent(new CustomEvent('3d-poster-loaded'));
                    }}
                  >
                    <React.Suspense fallback={<Html center><div className="w-full h-full bg-transparent" /></Html>}>
                      <Hook3D imageUrl="https://images.unsplash.com/photo-1464802686167-b939a6910659?auto=format&fit=crop&q=80&w=2070" />
                    </React.Suspense>
                  </Canvas>
                </ErrorBoundary>
              </div>

              {/* Parallax Text Overlay - Left Aligned */}
              <motion.div 
                style={{ y: textY }}
                className="relative z-10 text-left pointer-events-none"
              >
                <Reveal y={100} delay={0.2}>
                  <div className="space-y-6">
                    <h2 className={`text-6xl md:text-9xl font-thin tracking-[0.2em] uppercase leading-[0.9] ${theme === 'dark' ? 'text-white/90' : 'text-black/90'}`}>
                      NOT A<br/>
                      POSTER.
                    </h2>
                    <h2 className={`text-3xl md:text-5xl font-light tracking-[0.2em] uppercase leading-none ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      ENGINEERED ART.
                    </h2>
                  </div>
                </Reveal>
                
                <Reveal y={40} delay={0.5}>
                  <p className={`mt-16 text-xl md:text-2xl font-thin tracking-[0.3em] uppercase leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    포스터가 아닙니다.<br/>
                    엔지니어링 된 작품입니다.
                  </p>
                </Reveal>
              </motion.div>
            </div>
          </div>
        </section>

        {/* 4. [THE SOLUTION (Sticky Tunnel)]: h-[300vh] 부모 내에서 중앙 고정 조립. */}
        <div className="relative z-[70]">
          <MountingAnimation />
        </div>

        {/* 5. [SCAR-FREE Text Section]: Final Polish */}
        <section className={`relative z-[60] min-h-screen pt-28 pb-20 flex items-center ${theme === 'dark' ? 'bg-[#000000]' : 'bg-[#ffffff]'}`}>
          <div className="max-w-7xl mx-auto px-6 text-left w-full">
            <div className="space-y-32">
              {/* Chunk 1: 벽에 상처를 남기지 마세요. */}
              <div className="space-y-6">
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
                  className={`text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] ${theme === 'dark' ? 'text-[#F2F2F7]' : 'text-[#1c1c1e]'}`}
                >
                  벽에 상처를
                </motion.h2>
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 1.0, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className={`text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] ${theme === 'dark' ? 'text-[#F2F2F7]' : 'text-[#1c1c1e]'}`}
                >
                  남기지 마세요.
                </motion.h2>
              </div>
              
              {/* Chunk 2: 오직 예술만 남기세요. */}
              <div className="space-y-6">
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 1.0, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] ${theme === 'dark' ? 'text-[#F2F2F7]' : 'text-[#1c1c1e]'}`}
                >
                  오직 예술만
                </motion.h2>
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 1.0, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] relative inline-block"
                >
                  {/* Metallic Shimmer Text */}
                  <span 
                    className={`relative z-10 bg-clip-text text-transparent bg-[length:250%_100%] ${
                      theme === 'dark' 
                        ? 'bg-[linear-gradient(110deg,#F2F2F7,45%,#71717a,50%,#F2F2F7,55%,#F2F2F7)]' 
                        : 'bg-[linear-gradient(110deg,#1c1c1e,45%,#71717a,50%,#1c1c1e,55%,#1c1c1e)]'
                    }`} 
                    style={{ animation: 'shimmer 4s infinite cubic-bezier(0.4, 0, 0.2, 1)' }}
                  >
                    남기세요.
                  </span>
                </motion.h2>
              </div>

              {/* Chunk 3: 3단계. 1분. 도구 불필요 */}
              <motion.div
                initial={{ opacity: 0, y: 20, filter: 'blur(5px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-4"
              >
                <div className={`w-1 h-8 rounded-full ${theme === 'dark' ? 'bg-[#8E8E93]/30' : 'bg-[#8E8E93]/20'}`} />
                <p className={`text-xl md:text-3xl font-light tracking-[0.3em] uppercase ${theme === 'dark' ? 'text-[#8E8E93]' : 'text-[#636366]'}`}>
                  3단계. 1분. 도구 불필요
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* 6. [THE MATERIAL (Sticky Tunnel)]: 1.15mm 영속성 섹션. */}
        <div className="relative z-[50] pb-[35vh]">
          <MaterialEdgeAnimation />
        </div>

        {/* 8. [Trust Indicators]: 신뢰의 지표 섹션. */}
        <section className={`relative z-[30] min-h-[80vh] pt-40 pb-32 px-6 flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
          <div className="max-w-4xl mx-auto text-center space-y-24 w-full">
            <Reveal y={40}>
              <div className="space-y-8">
                <h2 className={`text-5xl md:text-7xl font-black tracking-tighter uppercase ${theme === 'dark' ? 'text-white' : 'text-black'}`}>신뢰의 지표</h2>
                <p className={`text-xl font-light max-w-2xl mx-auto ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>정밀한 공정과 투명한 과정을 통해 당신의 예술을 배달합니다.</p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
              {[
                { icon: <Zap size={24} />, title: "결제 완료", desc: "주문 즉시 공정 대기", delay: 0 },
                { icon: <Layers size={24} />, title: "정밀 공정", desc: "1.15mm 알루미늄 가공", delay: 0.2 },
                { icon: <Truck size={24} />, title: "안전 배송", desc: "전 세계 프리미엄 배송", delay: 0.4 }
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.0, delay: item.delay, ease: [0.16, 1, 0.3, 1] }}
                  className="relative z-10 flex flex-col items-center text-center space-y-6 group"
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border transition-all duration-500 ${
                    theme === 'dark' 
                      ? 'bg-zinc-900 border-white/10 group-hover:bg-white group-hover:text-black' 
                      : 'bg-zinc-100 border-black/10 group-hover:bg-black group-hover:text-white'
                  }`}>
                    {item.icon}
                  </div>
                  <div className="space-y-2">
                    <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{item.title}</h3>
                    <p className={`text-sm font-light ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <Reveal delay={0.6} y={40}>
              <div className="pt-12 flex justify-center">
                <button
                  onClick={handleBuyClick}
                  className={`group relative px-8 py-3 rounded-full font-bold text-lg tracking-tight overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.05)] ${
                    theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
                  }`}
                >
                  <span className="relative z-10">컬렉션 구경하기</span>
                  <div className={`absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ${
                    theme === 'dark' ? 'bg-zinc-200' : 'bg-zinc-800'
                  }`} />
                </button>
              </div>
            </Reveal>
          </div>
        </section>
    </div>
  );
};

export default BrandStorySection;
