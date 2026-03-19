import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import AlchemyParticles from './AlchemyParticles';

export default function LuxurySpacer() {
  return (
    <div className="relative w-full h-[12rem] bg-black overflow-hidden z-10">
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
    </div>
  );
}
