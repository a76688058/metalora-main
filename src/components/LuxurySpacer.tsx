import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { motion, useScroll, useTransform } from 'framer-motion';
import AlchemyParticles from './AlchemyParticles';

export default function LuxurySpacer() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const opacity = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [0, 1, 0]);
  const y = useTransform(scrollYProgress, [0.2, 0.8], [20, -20]);

  return (
    <div ref={ref} className="relative w-full h-[16rem] bg-black overflow-hidden z-10 flex items-center justify-center">
      <div className="absolute inset-0 pointer-events-none">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          gl={{ 
            powerPreference: "high-performance", 
            antialias: false,
            alpha: true,
            preserveDrawingBuffer: true
          }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <AlchemyParticles />
          </Suspense>
        </Canvas>
      </div>
      
      {/* Subtle Gradient Overlays for Depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none" />

      {/* Interactive Storytelling Text */}
      <motion.div 
        style={{ opacity, y }}
        className="relative z-20 text-center pointer-events-none"
      >
        <p className="text-zinc-400 font-light tracking-[0.3em] text-sm md:text-base uppercase">
          빛과 물질의 경계를 허물다
        </p>
      </motion.div>
    </div>
  );
}
