import React, { useRef, useMemo, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { useProducts } from '../context/ProductContext';

export default function MountingAnimation() {
  const { products } = useProducts();
  const [selectedImage, setSelectedImage] = useState('https://picsum.photos/seed/metalora_fallback/1200/1697');
  const tunnelRef = useRef<HTMLDivElement>(null);
  
  // Randomly select one image from the actual product pool when products are loaded
  useEffect(() => {
    if (products && products.length > 0) {
      const visibleProducts = products.filter(p => p.is_visible !== false);
      if (visibleProducts.length > 0) {
        const randomProduct = visibleProducts[Math.floor(Math.random() * visibleProducts.length)];
        setSelectedImage(randomProduct.front_image || randomProduct.image);
      }
    }
  }, [products]);

  const { scrollYProgress } = useScroll({
    target: tunnelRef,
    offset: ["start start", "end end"]
  });

  // Smooth scroll progress for fluid animation - Adjusted for "Elegant Fly-in"
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 40,
    damping: 15,
    mass: 1,
    restDelta: 0.001
  });

  if (!tunnelRef) return null;

  // Layer 1: Wall (0.0 -> 0.1)
  const wallOpacity = useTransform(smoothProgress, [0, 0.05], [0, 1]);
  const wallScale = useTransform(smoothProgress, [0, 0.1], [0.8, 1]);

  // Layer 2: Adhesive Sticker (0.1 -> 0.35) - Staggered
  const stickerOpacity = useTransform(smoothProgress, [0.1, 0.15], [0, 1]);
  const stickerX = useTransform(smoothProgress, [0.1, 0.35], [800, 0]);
  const stickerY = 0;
  const stickerZ = useTransform(smoothProgress, [0.1, 0.35], [400, 0]);
  const stickerScale = useTransform(smoothProgress, [0.1, 0.35], [1.2, 1]);
  const stickerShadow = useTransform(smoothProgress, [0.1, 0.35], ["-100px 0px 120px rgba(0,0,0,0.4)", "0 0px 0px rgba(0,0,0,0)"]);

  // Layer 3: Magnetic Bar (0.35 -> 0.6) - Staggered
  const magnetOpacity = useTransform(smoothProgress, [0.35, 0.4], [0, 1]);
  const magnetX = useTransform(smoothProgress, [0.35, 0.6], [700, 0]);
  const magnetY = 0;
  const magnetZ = useTransform(smoothProgress, [0.35, 0.6], [300, 0]);
  const magnetScale = useTransform(smoothProgress, [0.35, 0.6], [1.1, 1]);
  const magnetShadow = useTransform(smoothProgress, [0.35, 0.6], ["-80px 0px 80px rgba(0,0,0,0.6)", "0 0px 0px rgba(0,0,0,0)"]);

  // Layer 4: Metal Poster (0.6 -> 0.85) - Staggered
  const posterOpacity = useTransform(smoothProgress, [0.6, 0.65], [0, 1]);
  const posterX = useTransform(smoothProgress, [0.6, 0.85], [600, 0]);
  const posterY = 0;
  const posterZ = useTransform(smoothProgress, [0.6, 0.85], [200, 0]);
  const posterScale = useTransform(smoothProgress, [0.6, 0.85], [1.05, 1]);
  const posterShadow = useTransform(smoothProgress, [0.6, 0.85], ["-100px 0px 100px rgba(0,0,0,0.8)", "-5px 10px 30px rgba(0,0,0,0.5)"]);

  // Exit Animation (Sticky container moves up at the end) - Smoother Exit Range
  const stickyExitY = useTransform(smoothProgress, [0.9, 1], [0, -1500]);

  return (
    <div className="relative bg-black z-20">
      {/* Section A: 3D Assembly Mockup (The Scroll Tunnel) */}
      <section ref={tunnelRef} className="relative h-[300vh]">
        <motion.div 
          style={{ y: stickyExitY }}
          className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden"
        >
          {/* Background Wall Texture */}
          <div className="absolute inset-0 bg-black" />

          <div className="relative w-full max-w-7xl mx-auto px-6 flex items-center justify-center">
            {/* Assembly Visualizer (Centered) */}
            <div className="relative h-[50vh] lg:h-[60vh] w-full flex items-center justify-center perspective-[3000px] transform-gpu">
              
              {/* Increased Y-axis Tilt Perspective Wrapper */}
              <motion.div 
                style={{ rotateX: 5, rotateY: -25 }}
                className="relative w-full h-full flex items-center justify-center preserve-3d"
              >
                {/* 1. 벽 (Wall - Fixed Base) */}
                <motion.div 
                  style={{ opacity: wallOpacity, scale: wallScale }}
                  className="absolute w-72 h-72 md:w-96 md:h-96 bg-zinc-900/20 border border-white/10 rounded-[3rem] flex items-center justify-center"
                >
                  <span className="text-5xl md:text-7xl font-bold text-white/20 uppercase tracking-tighter">벽</span>
                </motion.div>

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

                {/* 4. 액자 (Metal Poster - No Label) */}
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
                      src={selectedImage} 
                      alt="Metal Poster Demo" 
                      className="w-full h-full object-cover opacity-90"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {/* Gloss effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-50" />
                  </div>

                  {/* 1.15mm Edge Simulation (Right Side) */}
                  <div className="absolute top-0 bottom-0 -right-[1.15px] w-[2px] bg-gradient-to-b from-zinc-400 via-white to-zinc-400 origin-left rotate-y-90 opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                  
                  {/* 1.15mm Edge Simulation (Top Side) */}
                  <div className="absolute left-0 right-0 -top-[1.15px] h-[2px] bg-gradient-to-r from-zinc-400 via-white to-zinc-400 origin-bottom rotate-x-90 opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
