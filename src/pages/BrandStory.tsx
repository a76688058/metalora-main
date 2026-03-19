import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export default function BrandStory() {
  const { scrollYProgress } = useScroll();
  const rotateY = useTransform(scrollYProgress, [0, 0.5, 1], [0, 180, 360]);

  return (
    <div className="bg-black text-white min-h-screen">
      {/* Hero Section */}
      <section className="h-screen flex items-center justify-center">
        <motion.h1 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
          className="text-5xl md:text-7xl font-light tracking-tighter"
        >
          빛과 금속의 연금술
        </motion.h1>
      </section>

      {/* Detail Section */}
      <section className="h-screen flex flex-col items-center justify-center p-10">
        <h2 className="text-4xl font-light text-[#A1A1A6] mb-10">1.15mm의 정교함</h2>
        <motion.div 
          style={{ rotateY }}
          className="w-64 h-96 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.1)] flex items-center justify-center"
        >
          <p className="text-xl font-medium">METALORA</p>
        </motion.div>
      </section>

      {/* Magnetic Section */}
      <section className="h-screen flex items-center justify-center">
        <motion.div 
          whileHover={{ scale: 1.05 }}
          className="p-10 border border-white/20 rounded-full bg-white/5 backdrop-blur-sm"
        >
          <h3 className="text-3xl font-light">자석 시스템의 미학</h3>
        </motion.div>
      </section>
    </div>
  );
}
