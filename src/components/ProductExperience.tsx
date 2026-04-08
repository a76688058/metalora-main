import React, { useRef, Suspense } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue } from 'framer-motion';
import { Box, Zap, Layers, ArrowRight, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import Hook3D from './Hook3D';
import MountingAnimation from './MountingAnimation';
import MaterialEdgeAnimation from './MaterialEdgeAnimation';
import ErrorBoundary from './ErrorBoundary';

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

const MagneticButton = ({ onClick }: { onClick: () => void }) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const springConfig = { damping: 15, stiffness: 150 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distanceX = e.clientX - centerX;
    const distanceY = e.clientY - centerY;
    
    mouseX.set(distanceX * 0.35);
    mouseY.set(distanceY * 0.35);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.button
      ref={buttonRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{ x, y }}
      className="group relative px-12 py-5 rounded-full bg-white text-black font-black text-xl tracking-tight overflow-hidden transition-shadow hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] active:scale-95"
    >
      <span className="relative z-10 flex items-center gap-3">
        컬렉션 구경하기
        <ArrowRight className="group-hover:translate-x-1 transition-transform" size={24} />
      </span>
      <motion.div 
        className="absolute inset-0 bg-zinc-200"
        initial={{ y: "100%" }}
        whileHover={{ y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </motion.button>
  );
};

const MagneticMountVisual = () => (
  <div className="relative w-full max-w-md aspect-square flex items-center justify-center">
    {/* Wall Background */}
    <div className="absolute inset-0 bg-zinc-900/20 rounded-3xl border border-white/5 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.02)_0%,transparent_50%)]" />
    </div>

    {/* Magnetic Field Waves */}
    {[...Array(3)].map((_, i) => (
      <motion.div
        key={i}
        animate={{ 
          scale: [1, 2],
          opacity: [0.5, 0],
        }}
        transition={{ 
          duration: 3, 
          repeat: Infinity, 
          delay: i * 1,
          ease: "easeOut"
        }}
        className="absolute w-32 h-32 border border-purple-500/30 rounded-full"
      />
    ))}

    {/* The Mechanism */}
    <div className="relative z-10 flex items-center gap-12">
      {/* Wall Side Sticker */}
      <div className="relative">
        <motion.div 
          animate={{ 
            boxShadow: ["0 0 20px rgba(168,85,247,0.2)", "0 0 40px rgba(168,85,247,0.4)", "0 0 20px rgba(168,85,247,0.2)"]
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-32 bg-zinc-800 border border-purple-500/50 rounded-md flex items-center justify-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent" />
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          </div>
        </motion.div>
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-mono text-purple-400/60 whitespace-nowrap">
          MAGNETIC STICKER
        </div>
      </div>

      {/* Snap Indicator */}
      <motion.div 
        animate={{ x: [-10, 10], opacity: [0.2, 1, 0.2] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="flex gap-1"
      >
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-1 h-1 bg-white/30 rounded-full" />
        ))}
      </motion.div>

      {/* Metal Poster Side */}
      <div className="relative">
        <motion.div 
          animate={{ 
            x: [20, 0, 20],
            rotateY: [-10, 0, -10]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="w-24 h-32 bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/20 rounded-md shadow-2xl flex items-center justify-center relative"
        >
          <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,rgba(255,255,255,0.1),50%,transparent)] bg-[length:200%_100%] animate-shimmer" />
          <Layers size={20} className="text-white/20" />
        </motion.div>
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-mono text-white/40 whitespace-nowrap">
          METAL POSTER
        </div>
      </div>
    </div>

    {/* Technical HUD Elements */}
    <div className="absolute top-8 left-8 flex flex-col gap-1">
      <div className="w-12 h-1 bg-purple-500/30 rounded-full overflow-hidden">
        <motion.div 
          animate={{ x: [-48, 48] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-full h-full bg-purple-400"
        />
      </div>
      <span className="text-[8px] font-mono text-zinc-600 uppercase">Alignment Active</span>
    </div>
  </div>
);

const ProductExperience = () => {
  const navigate = useNavigate();
  const { scrollYProgress: globalScroll } = useScroll();
  const textY = useTransform(globalScroll, [0, 1], [0, 200]);
  
  // 1. Horizontal Scroll Section Ref & Progress
  const horizontalRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: horizontalProgress } = useScroll({
    target: horizontalRef,
    offset: ["start start", "end end"]
  });

  const xTranslate = useTransform(horizontalProgress, [0, 1], ["0%", "-66.66%"]);

  return (
    <div className="w-full bg-black text-white selection:bg-white selection:text-black">
      
      {/* SECTION 1: Horizontal "Deep Dive" Specs */}
      <section ref={horizontalRef} className="h-[400vh] relative">
        <div className="sticky top-0 h-screen overflow-hidden flex items-center">
          {/* Background Technical Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)]" />

          <motion.div 
            style={{ x: xTranslate }}
            className="flex h-full w-[300vw] items-center"
          >
            {/* Slide 1: Thickness */}
            <div className="w-screen h-full flex flex-col items-center justify-center px-6 md:px-12 relative pt-20 lg:pt-0">
              <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="space-y-6 lg:space-y-8 text-center lg:text-left">
                  <h2 className="text-[14vw] lg:text-[8vw] font-black tracking-tighter leading-[0.85] lg:leading-none">
                    1.15MM<br/>
                    <span className="text-zinc-500">SLIM EDGE.</span>
                  </h2>
                  <p className="text-zinc-400 text-base md:text-xl font-light leading-relaxed max-w-md mx-auto lg:mx-0 break-keep">
                    항공기 소재 등급의 프리미엄 알루미늄. 얇지만 강인한 물성으로 공간에 압도적인 존재감을 선사합니다.
                  </p>
                </div>
                <div className="relative aspect-square flex items-center justify-center scale-75 lg:scale-100">
                  <motion.div 
                    animate={{ rotateY: [0, 360] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="w-1 h-48 lg:h-80 bg-gradient-to-b from-transparent via-white to-transparent shadow-[0_0_50px_rgba(255,255,255,0.5)]"
                  />
                  <div className="absolute inset-0 border border-white/5 rounded-full animate-spin-slow" />
                </div>
              </div>
            </div>

            {/* Slide 2: Resolution */}
            <div className="w-screen h-full flex flex-col items-center justify-center px-6 md:px-12 bg-zinc-950/30 pt-20 lg:pt-0">
              <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-2 lg:order-1 relative aspect-square flex items-center justify-center scale-75 lg:scale-100">
                  <div className="grid grid-cols-8 gap-2 w-48 h-48 lg:w-64 lg:h-64">
                    {[...Array(64)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ 
                          opacity: [0.2, 1, 0.2],
                          scale: [1, 1.1, 1],
                          backgroundColor: i % 3 === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"
                        }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.02 }}
                        className="w-full h-full rounded-sm"
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-6xl lg:text-8xl font-black text-white/10">4K</span>
                    <motion.div 
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="px-3 py-1 bg-yellow-400/20 border border-yellow-400/40 rounded-full mt-4"
                    >
                      <span className="text-[8px] lg:text-[10px] font-mono text-yellow-400 tracking-widest uppercase">AI-UPSCALING</span>
                    </motion.div>
                  </div>
                </div>
                <div className="order-1 lg:order-2 space-y-6 lg:space-y-8 text-center lg:text-left">
                  <h2 className="text-[14vw] lg:text-[8vw] font-black tracking-tighter leading-[0.85] lg:leading-none">
                    ULTRA<br/>
                    <span className="text-zinc-500">HD 4K.</span>
                  </h2>
                  <p className="text-zinc-400 text-base md:text-xl font-light leading-relaxed max-w-md mx-auto lg:mx-0 break-keep">
                    180℃ 이상의 고온 승화전사 공법과 AI-UPScaling 기술로 완성된 4K 해상도. 분자 속에 스며든 안료가 영원히 변치 않는 선명함을 보장합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Slide 3: Mounting */}
            <div className="w-screen h-full flex flex-col items-center justify-center px-6 md:px-12 pt-20 lg:pt-0">
              <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="space-y-6 lg:space-y-8 text-center lg:text-left">
                  <h2 className="text-[14vw] lg:text-[8vw] font-black tracking-tighter leading-[0.85] lg:leading-none">
                    MAGNETIC<br/>
                    <span className="text-zinc-500">MOUNT.</span>
                  </h2>
                  <p className="text-zinc-400 text-base md:text-xl font-light leading-relaxed max-w-md mx-auto lg:mx-0 break-keep">
                    못 없이 단 1분 만에 완성되는 갤러리. 강력한 마그네틱 시스템이 벽면 손상 없이 완벽한 밀착감을 제공합니다.
                  </p>
                </div>
                <div className="relative aspect-square flex items-center justify-center scale-75 lg:scale-100">
                  <MagneticMountVisual />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Progress Bar */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-64 h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div 
              style={{ scaleX: horizontalProgress }}
              className="w-full h-full bg-white origin-left"
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: Wall-Sticker-Magnet-Poster Interactive (Restored & Optimized) */}
      <div className="relative z-[70]">
        <MountingAnimation />
      </div>

      {/* SECTION 3: SCAR-FREE Text Section */}
      <section className="relative z-[60] min-h-screen pt-28 pb-20 bg-[#000000] flex items-center">
        <div className="max-w-7xl mx-auto px-6 text-left w-full">
          <div className="space-y-32">
            <div className="space-y-6">
              <motion.h2
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
                className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] text-[#F2F2F7]"
              >
                벽에 상처를
              </motion.h2>
              <motion.h2
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 1.0, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] text-[#F2F2F7]"
              >
                남기지 마세요.
              </motion.h2>
            </div>
            
            <div className="space-y-6">
              <motion.h2
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 1.0, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="text-6xl md:text-9xl font-bold tracking-[-0.02em] leading-[1.2] text-[#F2F2F7]"
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
                <span 
                  className="relative z-10 bg-clip-text text-transparent bg-[linear-gradient(110deg,#F2F2F7,45%,#71717a,50%,#F2F2F7,55%,#F2F2F7)] bg-[length:250%_100%]" 
                  style={{ animation: 'shimmer 4s infinite cubic-bezier(0.4, 0, 0.2, 1)' }}
                >
                  남기세요.
                </span>
              </motion.h2>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20, filter: 'blur(5px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
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

      {/* SECTION 4: The Material (1.15mm Edge) */}
      <div className="relative z-[50] pb-[35vh]">
        <MaterialEdgeAnimation />
      </div>

      {/* SECTION 5: Trust Indicators */}
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
                transition={{ duration: 1.0, delay: item.delay, ease: [0.16, 1, 0.3, 1] }}
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
        </div>
      </section>

      {/* SECTION 6: Magnetic "Snap" Finale (Bottom) */}
      <section className="py-64 px-6 flex flex-col items-center justify-center text-center bg-black relative overflow-hidden">
        {/* Background Ambient Light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-16 relative z-10"
        >
          <div className="space-y-6">
            <div className="flex justify-center gap-2 mb-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/20" />
              ))}
            </div>
            <h3 className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-none">
              당신의 공간을<br/>갤러리로 만드세요.
            </h3>
            <p className="text-zinc-500 text-xl font-light max-w-xl mx-auto break-keep">
              METALORA의 모든 컬렉션은 당신의 일상을 예술로 바꾸기 위해 설계되었습니다.
            </p>
          </div>
          
          <div className="pt-8">
            <MagneticButton onClick={() => navigate('/')} />
          </div>
        </motion.div>

        {/* Bottom Decorative Line */}
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </section>

    </div>
  );
};

export default ProductExperience;
