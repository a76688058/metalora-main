import React, { useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import Hook3D from '../components/Hook3D';
import MountingAnimation from '../components/MountingAnimation';
import MaterialEdgeAnimation from '../components/MaterialEdgeAnimation';
import ErrorBoundary from '../components/ErrorBoundary';
import Hero from '../components/Hero';
import ProductGrid from '../components/ProductGrid';
import { useProducts } from '../context/ProductContext';
import { Truck, Layers, Zap } from 'lucide-react';

import { Html } from '@react-three/drei';

const Reveal = ({ children, delay = 0, scale = 1, x = 0, y = 40 }: { children: React.ReactNode, delay?: number, scale?: number, x?: number, y?: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y, x, scale }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: true, margin: "-100px 0px -100px 0px", amount: 0.3 }}
      transition={{ 
        duration: 0.8, 
        delay, 
        ease: [0.17, 0.67, 0.83, 0.67] 
      }}
    >
      {children}
    </motion.div>
  );
};

export default function Home() {
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const textY = useTransform(scrollYProgress, [0, 1], [0, 200]);

  const handleBuyClick = () => {
    navigate('/collection');
  };

  return (
    <div className="relative bg-black min-h-screen text-white selection:bg-white selection:text-black">
        {/* 1. [Top Marquee]: 헤더 아래 mt-2 여백 유지. 좌측 무한 흐름 그리드. */}
        <div className="relative z-10 mt-2 pt-0 pb-0 top-0 overflow-hidden">
          <ProductGrid />
        </div>

        {/* 2. [Hero Section]: 중앙 자동 회전 3D 액자 + '작품 더보기' 버튼 */}
        <div className="relative z-[90]">
          <Hero />
        </div>

        {/* 3. [NOT A POSTER]: 브랜드의 첫 선언. 새벽녘 장노출 은하수와 산맥 사진. */}
        <section className="relative z-[80] h-auto py-24 px-6 overflow-hidden flex items-center justify-center bg-black">
          <div className="max-w-7xl mx-auto w-full relative flex flex-col items-start justify-center">
            <div className="flex flex-col items-start justify-center min-h-[80vh] w-full">
              {/* 3D Canvas Container - Floating in Deep Black */}
              <div className="absolute inset-0 z-0">
                <ErrorBoundary>
                  <Canvas 
                    frameloop="always" 
                    gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
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
                    <h2 className="text-6xl md:text-9xl font-thin tracking-[0.2em] uppercase leading-[0.9] text-white/90">
                      NOT A<br/>
                      POSTER.
                    </h2>
                    <h2 className="text-3xl md:text-5xl font-light tracking-[0.2em] uppercase leading-none text-zinc-500">
                      ENGINEERED ART.
                    </h2>
                  </div>
                </Reveal>
                
                <Reveal y={40} delay={0.5}>
                  <p className="mt-16 text-xl md:text-2xl font-thin tracking-[0.3em] text-zinc-400 uppercase">
                    포스터가 아닙니다. 엔지니어링된 작품입니다.
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
        <section className="relative z-[60] min-h-screen pt-28 pb-20 bg-[#000000] flex items-center">
          <div className="max-w-7xl mx-auto px-6 text-left w-full">
            <div className="space-y-32">
              {/* Chunk 1: 벽에 상처를 남기지 마세요. */}
              <div className="space-y-6">
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] text-[#F2F2F7]"
                >
                  벽에 상처를
                </motion.h2>
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                  className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] text-[#F2F2F7]"
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
                  transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                  className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] text-[#F2F2F7]"
                >
                  오직 예술만
                </motion.h2>
                <motion.h2
                  initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                  className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] relative inline-block"
                >
                  {/* Metallic Shimmer Text */}
                  <span 
                    className="relative z-10 bg-clip-text text-transparent bg-[linear-gradient(110deg,#F2F2F7,45%,#71717a,50%,#F2F2F7,55%,#F2F2F7)] bg-[length:250%_100%]" 
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
                transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
                className="flex items-center gap-4"
              >
                <div className="w-1 h-8 bg-[#8E8E93]/30 rounded-full" />
                <p className="text-xl md:text-3xl font-light tracking-[0.3em] text-[#8E8E93] uppercase">
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

        {/* 7. [Bottom Marquee]: 최상단 마키와 동일한 데이터로 통일성 있게 마무리. */}
        <div className="relative z-[40] pt-40 pb-24 bg-black overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 mb-12 text-left">
            <Reveal y={40}>
              <div className="space-y-6">
                <span className="text-xs font-black uppercase tracking-[0.5em] text-zinc-600">Archive</span>
                <h2 className="text-4xl md:text-6xl font-light tracking-[0.2em] text-white/80 uppercase">
                  지나간 작품도 다시 확인해보세요.
                </h2>
              </div>
            </Reveal>
          </div>
          <ProductGrid />
        </div>

        {/* 8. [Trust Indicators]: 신뢰의 지표 섹션. */}
        <section className="relative z-[30] min-h-[80vh] pt-40 pb-32 px-6 flex items-center justify-center bg-black">
          <div className="max-w-4xl mx-auto text-center space-y-24 w-full">
            <Reveal y={40}>
              <div className="space-y-8">
                <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase text-white">신뢰의 지표</h2>
                <p className="text-xl text-zinc-500 font-light max-w-2xl mx-auto">정밀한 공정과 투명한 과정을 통해 당신의 예술을 배달합니다.</p>
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
                  transition={{ duration: 0.8, delay: item.delay, ease: [0.16, 1, 0.3, 1] }}
                  className="relative z-10 flex flex-col items-center text-center space-y-6 group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center border border-white/10 group-hover:bg-white group-hover:text-black transition-all duration-500">
                    {item.icon}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-white">{item.title}</h3>
                    <p className="text-zinc-500 text-sm font-light">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <Reveal delay={0.6} y={40}>
              <div className="pt-12 flex justify-center">
                <button
                  onClick={handleBuyClick}
                  className="group relative px-8 py-3 rounded-full bg-white text-black font-bold text-lg tracking-tight overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_10px_30px_rgba(255,255,255,0.05)]"
                >
                  <span className="relative z-10">컬렉션 구경하기</span>
                  <div className="absolute inset-0 bg-zinc-200 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                </button>
              </div>
            </Reveal>
          </div>
        </section>
    </div>
  );
}
