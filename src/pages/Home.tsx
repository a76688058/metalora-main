import React, { useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import Poster3D from '../components/Poster3D';
import Hook3D from '../components/Hook3D';
import MountingAnimation from '../components/MountingAnimation';
import MaterialEdgeAnimation from '../components/MaterialEdgeAnimation';
import Hero from '../components/Hero';
import ProductGrid from '../components/ProductGrid';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { ZoomIn, ShieldCheck, Truck, Layers, Zap, MousePointer2, Sparkles } from 'lucide-react';

const Reveal = ({ children, delay = 0, scale = 1, x = 0, y = 40 }: { children: React.ReactNode, delay?: number, scale?: number, x?: number, y?: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y, x, scale }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: true, margin: "-100px 0px -100px 0px", amount: 0.2 }}
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
  const { t } = useLanguage();
  const { user } = useAuth();
  const { fetchProducts } = useProducts();
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const textY = useTransform(scrollYProgress, [0, 1], [0, 200]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleBuyClick = () => {
    navigate('/collection');
  };

  return (
    <div className="relative bg-black min-h-screen text-white selection:bg-white selection:text-black">
        {/* 1. Top Marquee Grid (Restored) */}
        <div className="relative z-10 py-8">
          <ProductGrid />
        </div>

        {/* 2. Hero 3D Section (Restored) */}
        <Hero />

        {/* 3. Section 1 [THE HOOK]: 45도 3D 제품 쇼케이스 */}
        <section className="relative min-h-screen py-32 px-6 overflow-hidden flex items-center justify-center mt-8 bg-black">
          <div className="max-w-7xl mx-auto w-full relative flex flex-col items-center justify-center">
            <div className="flex flex-col items-center justify-center min-h-[80vh] w-full">
              {/* 3D Canvas Container - Floating in Deep Black */}
              <div className="absolute inset-0 z-0 opacity-80">
                <Canvas gl={{ antialias: true, alpha: true }}>
                  <React.Suspense fallback={null}>
                    <Hook3D imageUrl="https://picsum.photos/seed/metalora_hook/1024/1448" />
                  </React.Suspense>
                </Canvas>
              </div>

              {/* Parallax Text Overlay */}
              <motion.div 
                style={{ y: textY }}
                className="relative z-10 text-center pointer-events-none"
              >
                <Reveal y={100} delay={0.2}>
                  <div className="space-y-6">
                    <h2 className="text-5xl md:text-8xl font-thin tracking-[0.2em] uppercase leading-none text-white/90">
                      NOT A POSTER.
                    </h2>
                    <h2 className="text-4xl md:text-7xl font-light tracking-[0.2em] uppercase leading-none text-zinc-500">
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

        {/* Section 2 [THE SOLUTION]: 45도 자석 조립 애니메이션 */}
        <MountingAnimation />

        {/* Section 3 [THE MATERIAL]: 1.15mm 매크로 엣지 뷰 */}
        <MaterialEdgeAnimation />

        {/* Section 4 [THE EXPERIENCE]: 하단 마키 갤러리 (통일성 부여) */}
        <div className="py-32 bg-black">
          <div className="max-w-7xl mx-auto px-6 mb-16 text-center">
            <Reveal y={40}>
              <div className="space-y-6">
                <span className="text-xs font-black uppercase tracking-[0.5em] text-zinc-600">Archive</span>
                <h2 className="text-3xl md:text-5xl font-light tracking-[0.2em] text-white/80 uppercase">
                  지나간 작품도 다시 확인해보세요.
                </h2>
              </div>
            </Reveal>
          </div>
          <ProductGrid />
        </div>

        {/* Section 5 [THE CONCLUSION]: 정밀 공정 스텝퍼 및 푸터 연결 */}
        <section className="relative min-h-[80vh] py-32 px-6 flex items-center justify-center bg-black">
          <div className="max-w-4xl mx-auto text-center space-y-24 w-full">
            <Reveal y={40}>
              <div className="space-y-8">
                <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase">신뢰의 지표</h2>
                <p className="text-xl text-zinc-500 font-light">정밀한 공정과 투명한 과정을 통해 당신의 예술을 배달합니다.</p>
              </div>
            </Reveal>

            <Reveal delay={0.2} y={40}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                {/* Connector Line */}
                <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-white/5 -translate-y-1/2 z-0" />
                
                {[
                  { icon: <Zap size={24} />, title: "결제 완료", desc: "주문 즉시 공정 대기" },
                  { icon: <Layers size={24} />, title: "정밀 공정", desc: "1.15mm 알루미늄 가공" },
                  { icon: <Truck size={24} />, title: "안전 배송", desc: "전 세계 프리미엄 배송" }
                ].map((item, idx) => (
                  <div key={idx} className="relative z-10 flex flex-col items-center space-y-6 group">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center border border-white/10 group-hover:bg-white group-hover:text-black transition-all duration-500">
                      {item.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold">{item.title}</h3>
                      <p className="text-zinc-500 text-sm font-light">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.4} y={40}>
              <div className="pt-12">
                <button
                  onClick={handleBuyClick}
                  className="group relative px-20 py-8 rounded-full bg-white text-black font-black text-xl tracking-tight overflow-hidden transition-all active:scale-95"
                >
                  <span className="relative z-10">지금 컬렉션 시작하기</span>
                  <div className="absolute inset-0 bg-zinc-200 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                </button>
              </div>
            </Reveal>
          </div>
        </section>
    </div>
  );
}
