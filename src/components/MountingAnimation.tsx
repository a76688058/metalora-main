import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';

export default function MountingAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Smooth scroll progress for fluid animation
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Layer 2: Adhesive Sticker (0.05 -> 0.25)
  const stickerOpacity = useTransform(smoothProgress, [0.0, 0.05, 0.25, 0.3], [0, 1, 1, 1]);
  const stickerX = useTransform(smoothProgress, [0.0, 0.25], [600, 0]);
  const stickerY = useTransform(smoothProgress, [0.0, 0.25], [-400, 0]);
  const stickerZ = useTransform(smoothProgress, [0.0, 0.25], [1000, 0]);
  const stickerScale = useTransform(smoothProgress, [0.0, 0.25], [1.5, 1]);
  const stickerShadow = useTransform(smoothProgress, [0.0, 0.25], ["-60px 100px 120px rgba(0,0,0,0.6)", "0 0px 0px rgba(0,0,0,0)"]);

  // Layer 3: Magnetic Bar (0.25 -> 0.45)
  const magnetOpacity = useTransform(smoothProgress, [0.25, 0.3, 0.45, 0.5], [0, 1, 1, 1]);
  const magnetX = useTransform(smoothProgress, [0.25, 0.45], [500, 0]);
  const magnetY = useTransform(smoothProgress, [0.25, 0.45], [-300, 0]);
  const magnetZ = useTransform(smoothProgress, [0.25, 0.45], [800, 0]);
  const magnetScale = useTransform(smoothProgress, [0.25, 0.45], [1.3, 1]);
  const magnetShadow = useTransform(smoothProgress, [0.25, 0.45], ["-40px 70px 80px rgba(0,0,0,0.8)", "0 0px 0px rgba(0,0,0,0)"]);

  // Layer 4: Metal Poster (0.45 -> 0.65)
  const posterOpacity = useTransform(smoothProgress, [0.45, 0.5, 0.65, 0.7], [0, 1, 1, 1]);
  const posterX = useTransform(smoothProgress, [0.45, 0.65], [400, 0]);
  const posterY = useTransform(smoothProgress, [0.45, 0.65], [-200, 0]);
  const posterZ = useTransform(smoothProgress, [0.45, 0.65], [600, 0]);
  const posterScale = useTransform(smoothProgress, [0.45, 0.65], [1.2, 1]);
  const posterShadow = useTransform(smoothProgress, [0.45, 0.65], ["-50px 80px 100px rgba(0,0,0,0.9)", "-5px 10px 30px rgba(0,0,0,0.5)"]);

  // Text animations (Appears after assembly is mostly done)
  const textOpacity = useTransform(smoothProgress, [0.65, 0.75, 0.9, 1], [0, 1, 1, 0]);
  const textY = useTransform(smoothProgress, [0.65, 0.75], [100, 0]);

  return (
    <section ref={containerRef} className="relative h-[400vh] bg-black">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden py-20">
        {/* Background Wall Texture */}
        <div className="absolute inset-0 bg-black" />

        <div className="relative w-full max-w-7xl mx-auto px-6 flex flex-col items-center justify-center space-y-24">
          
          {/* Top: Assembly Visualizer (Now first) */}
          <div className="relative h-[50vh] lg:h-[60vh] w-full flex items-center justify-center perspective-[3000px] transform-gpu">
            
            {/* 45-Degree Perspective Wrapper */}
            <motion.div 
              style={{ rotateX: 20, rotateY: -30 }}
              className="relative w-full h-full flex items-center justify-center preserve-3d"
            >
              {/* 1. 벽 (Wall - Fixed Base) */}
              <div className="absolute w-72 h-72 md:w-96 md:h-96 bg-zinc-900/20 border border-white/10 rounded-[3rem] flex items-center justify-center">
                <span className="text-5xl md:text-7xl font-bold text-white/10 uppercase tracking-tighter">벽</span>
              </div>

              {/* 2. 벽면 보호 스티커 */}
              <motion.div
                style={{ 
                  opacity: stickerOpacity,
                  x: stickerX,
                  y: stickerY,
                  z: stickerZ,
                  scale: stickerScale,
                  boxShadow: stickerShadow
                }}
                className="absolute w-56 h-56 md:w-64 md:h-64 bg-zinc-800/40 rounded-[2rem] border border-white/20 flex items-center justify-center overflow-hidden z-10 backdrop-blur-sm"
              >
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                <span className="text-2xl md:text-4xl font-bold text-white/60 text-center leading-tight">벽면 보호<br/>스티커</span>
              </motion.div>

              {/* 3. 자석 */}
              <motion.div
                style={{ 
                  opacity: magnetOpacity,
                  x: magnetX,
                  y: magnetY,
                  z: magnetZ,
                  scale: magnetScale,
                  boxShadow: magnetShadow
                }}
                className="absolute w-36 h-36 md:w-44 md:h-44 bg-zinc-700 rounded-2xl border border-white/30 flex flex-col items-center justify-center z-20 shadow-2xl"
              >
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-600 to-zinc-800 rounded-2xl">
                  <span className="text-3xl md:text-5xl font-bold text-white uppercase tracking-widest">자석</span>
                </div>
              </motion.div>

              {/* 4. 액자 (Metal Poster with 1.15mm Edge Highlight) */}
              <motion.div
                style={{ 
                  opacity: posterOpacity,
                  x: posterX,
                  y: posterY,
                  z: posterZ,
                  scale: posterScale,
                  boxShadow: posterShadow
                }}
                className="absolute w-64 h-[90%] md:w-80 md:h-[113%] z-30 preserve-3d"
              >
                {/* Main Surface */}
                <div className="absolute inset-0 bg-zinc-900 rounded-xl border border-white/10 overflow-hidden">
                  <img 
                    src="https://picsum.photos/seed/metalora_poster_demo/1200/1697" 
                    alt="Metal Poster Demo" 
                    className="w-full h-full object-cover opacity-90"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {/* Gloss effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-50" />
                  
                  {/* Label Overlay (REMOVED '액자' label as requested) */}
                </div>

                {/* 1.15mm Edge Simulation (Right Side) */}
                <div className="absolute top-0 bottom-0 -right-[1.15px] w-[2px] bg-gradient-to-b from-zinc-400 via-white to-zinc-400 origin-left rotate-y-90 opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                
                {/* 1.15mm Edge Simulation (Top Side) */}
                <div className="absolute left-0 right-0 -top-[1.15px] h-[2px] bg-gradient-to-r from-zinc-400 via-white to-zinc-400 origin-bottom rotate-x-90 opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
              </motion.div>
            </motion.div>

          </div>

          {/* Bottom: Narrative Content (Now second) */}
          <motion.div 
            style={{ opacity: textOpacity, y: textY }}
            className="space-y-12 z-50 text-center flex flex-col justify-center"
          >
            <div className="space-y-6">
              <h2 className="text-4xl md:text-6xl font-light tracking-tight leading-tight text-white">
                벽에 상처를 남기지 마십시오.<br/>
                <span className="text-zinc-500">오직 예술만 남기십시오.</span>
              </h2>
              <p className="text-xl md:text-2xl font-thin tracking-[0.3em] text-zinc-400 uppercase">
                3단계. 1분. 도구 불필요.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
