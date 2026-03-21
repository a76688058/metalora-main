import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas } from '@react-three/fiber';

const APPLE_EASE = [0.16, 1, 0.3, 1] as const;

interface StorySectionProps {
  title: string;
  subtitle?: string;
  bgImage?: string;
  children?: React.ReactNode;
}

const StorySection: React.FC<StorySectionProps> = ({ title, subtitle, bgImage, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  // Apply Apple-like smooth spring to scroll progress
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 50,
    damping: 20,
    mass: 1
  });

  // Deep sea rising effect
  const y = useTransform(smoothProgress, [0.2, 0.4, 0.6, 0.8], [150, 0, 0, -150]);
  const opacity = useTransform(smoothProgress, [0.2, 0.4, 0.6, 0.8], [0, 1, 1, 0]);
  
  // Micro-scale effect for background
  const scale = useTransform(smoothProgress, [0, 1], [1.0, 1.05]);

  return (
    <section ref={ref} className="relative h-[200vh] w-full bg-[#000000]">
      <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center overflow-hidden">
        
        {bgImage && (
          <motion.div 
            style={{ scale }}
            className="absolute inset-0 z-0"
          >
            <div className="absolute inset-0 bg-[#000000]/60 z-10" />
            <img 
              src={bgImage} 
              alt="Background" 
              className="w-full h-full object-cover grayscale opacity-30" 
            />
          </motion.div>
        )}
        
        <motion.div 
          style={{ y, opacity }}
          className="relative z-20 text-center px-6 w-full max-w-7xl mx-auto flex flex-col items-center justify-center"
        >
          <h2 className="text-7xl md:text-8xl lg:text-[120px] font-extrabold tracking-[-0.05em] text-[#FFFFFF] leading-none whitespace-pre-line break-keep">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-8 text-3xl md:text-5xl font-extrabold tracking-[-0.05em] text-[#8E8E93] leading-tight">
              {subtitle}
            </p>
          )}
          {children && (
            <div className="mt-24 w-full">
              {children}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
};

const AluminumDetail = () => {
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  
  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMouse({ x, y });
  };

  return (
    <div 
      onMouseMove={handleMouseMove}
      className="relative w-full max-w-5xl mx-auto h-48 md:h-64 bg-[#000000] border-y border-[#8E8E93]/20 overflow-hidden group cursor-crosshair"
    >
      {/* Base Metal Texture (Brushed Aluminum) */}
      <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(90deg,#000000,#000000_1px,#8E8E93_1px,#8E8E93_2px)]" />
      
      {/* Dynamic Reflection based on mouse */}
      <div 
        className="absolute inset-0 opacity-40 transition-opacity duration-500 ease-out"
        style={{
          background: `radial-gradient(circle 600px at ${mouse.x}% ${mouse.y}%, #FFFFFF 0%, transparent 60%)`,
          mixBlendMode: 'overlay'
        }}
      />
      
      {/* Center Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[#FFFFFF] text-5xl md:text-7xl font-extrabold tracking-[-0.05em] mix-blend-difference">
          1.15mm
        </span>
      </div>
    </div>
  );
};

export default function BrandStory() {
  return (
    <div className="bg-[#000000] text-[#FFFFFF] min-h-screen relative font-sans selection:bg-[#8E8E93] selection:text-[#000000]">
      
      {/* Global Fixed Background Particles - Extremely Minimal (10% density) */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
      </div>

      <div className="relative z-10">
        {/* Section 1 */}
        <StorySection 
          title="빛의 연금술"
        />

        {/* Section 2 */}
        <StorySection 
          title="1.15mm의 완벽"
        >
          <AluminumDetail />
        </StorySection>

        {/* Section 3 */}
        <StorySection 
          title="분자 속에 새겨진 이야기"
        />

        {/* Section 4 */}
        <StorySection 
          title="공간의 해방"
          subtitle="무타공 마그네틱"
        />

        {/* Section 5 */}
        <StorySection 
          title="영원히 변치 않는 기록"
        />
        
        {/* Final Spacer for smooth ending */}
        <div className="h-[50vh] bg-[#000000]" />
      </div>
    </div>
  );
}
