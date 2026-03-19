import { motion } from 'framer-motion';
import { Suspense } from 'react';
import Hero3D from './Hero3D';

export default function Hero() {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-black text-white selection:bg-white selection:text-black">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <Suspense fallback={<div className="w-full h-full bg-black flex items-center justify-center text-zinc-800 font-sans text-[10px] tracking-[0.2em]">LOADING EXPERIENCE...</div>}>
          <Hero3D />
        </Suspense>
      </div>

      {/* Foreground Content - Extreme Minimalism */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-8 md:p-12 pointer-events-none">
        {/* Top Bar - Technical Specs */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-between items-start w-full mix-blend-difference"
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-[10px] md:text-xs font-sans font-medium tracking-[0.3em] uppercase opacity-80">
              Cinematic Object
            </h1>
            <span className="text-[10px] font-sans tracking-[0.2em] opacity-50">
              Series 01
            </span>
          </div>
          
          <div className="text-[10px] md:text-xs font-sans font-medium tracking-[0.3em] uppercase opacity-80 text-right flex flex-col gap-1">
            <div>Aluminum / Glass</div>
            <div className="opacity-50">Designed in California</div>
          </div>
        </motion.div>

        {/* Center - Empty for the Object to breathe */}
        
        {/* Bottom Bar - Interaction Hints & Details */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-between items-end w-full mix-blend-difference"
        >
          <div className="flex flex-col gap-2">
            <span className="text-[9px] font-sans font-bold tracking-[0.4em] uppercase opacity-40">
              Material
            </span>
            <span className="text-xs md:text-sm font-sans font-light tracking-[0.2em] uppercase">
              Anisotropic Aluminum
            </span>
          </div>

          {/* Center Scroll Indicator - Very subtle */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 opacity-40">
            <div className="w-[1px] h-16 bg-gradient-to-b from-white to-transparent" />
            <span className="text-[9px] font-sans tracking-[0.3em] uppercase">Scroll</span>
          </div>

          <div className="flex flex-col gap-2 text-right">
            <span className="text-[9px] font-sans font-bold tracking-[0.4em] uppercase opacity-40">
              Interaction
            </span>
            <span className="text-xs md:text-sm font-sans font-light tracking-[0.2em] uppercase">
              Depth Sensing
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
