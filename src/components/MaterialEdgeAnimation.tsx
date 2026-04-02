import React, { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';

function MacroEdgeModel({ scrollProgress }: { scrollProgress: any }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.SpotLight>(null);
  const backLightRef = useRef<THREE.PointLight>(null);

  // Extreme close-up angles
  const rotationY = useTransform(scrollProgress, [0, 1], [-Math.PI / 2.1, -Math.PI / 1.95]);
  const rotationX = useTransform(scrollProgress, [0, 1], [0.1, -0.1]);
  
  // Shimmer effect: light position moves across the edge based on scroll
  const lightY = useTransform(scrollProgress, [0, 1], [5, -5]);
  const lightIntensity = useTransform(scrollProgress, [0, 0.5, 1], [200, 1000, 200]);
  
  // Backlight intensity pulsing slightly with scroll
  const backLightIntensity = useTransform(scrollProgress, [0, 0.5, 1], [100, 250, 100]);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y = rotationY.get();
      meshRef.current.rotation.x = rotationX.get();
    }
    
    if (lightRef.current) {
      lightRef.current.position.y = lightY.get();
      lightRef.current.intensity = lightIntensity.get();
    }

    if (backLightRef.current) {
      backLightRef.current.intensity = backLightIntensity.get();
    }
  });

  const materials = useMemo(() => {
    // Highly reflective edge material
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 1,
      roughness: 0.05,
      emissive: '#ffffff',
      emissiveIntensity: 0.08,
    });

    // Dark matte surface material
    const surfaceMaterial = new THREE.MeshStandardMaterial({
      color: '#050505',
      metalness: 0.9,
      roughness: 0.15,
    });

    return [
      edgeMaterial, // +x
      edgeMaterial, // -x
      edgeMaterial, // +y
      edgeMaterial, // -y
      surfaceMaterial, // +z
      surfaceMaterial  // -z
    ];
  }, []);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 2]} fov={15} />
      <ambientLight intensity={0.05} />
      
      {/* Main Shimmer Light */}
      <spotLight
        ref={lightRef}
        position={[2, 5, 2]}
        angle={0.15}
        penumbra={1}
        intensity={400}
        color="#ffffff"
      />

      {/* Backlight for Silhouette definition */}
      <pointLight
        ref={backLightRef}
        position={[-3, 0, -2]}
        intensity={150}
        color="#4a4a4a"
      />

      <pointLight position={[-2, 0, 2]} intensity={40} color="#ffffff" />
      
      {/* The "Poster" - scaled up for extreme close-up of the edge */}
      <mesh ref={meshRef} material={materials}>
        <boxGeometry args={[10, 10, 0.0115]} />
      </mesh>
      <Environment preset="night" />
    </>
  );
}

export default function MaterialEdgeAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 25,
    damping: 30,
    mass: 1.5,
    restDelta: 0.0001
  });

  const textOpacity = useTransform(smoothProgress, [0.2, 0.4, 0.9, 0.98], [0, 1, 1, 0]);
  const textY = useTransform(smoothProgress, [0.2, 0.4, 0.9, 0.98], [30, 0, 0, -30]);
  const modelOpacity = useTransform(smoothProgress, [0, 0.2, 0.9, 0.98], [0, 1, 1, 0]);
  const glowOpacity = useTransform(smoothProgress, [0, 0.4, 0.9, 0.98], [0.1, 0.3, 0.3, 0]);

  return (
    <section ref={containerRef} className="relative h-[300vh] bg-[#000000]">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        
        {/* Backlight Glow Layer */}
        <motion.div 
          style={{ opacity: glowOpacity }}
          className="absolute inset-0 z-0 pointer-events-none"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_50%,#1a1a1a_0%,transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_50%,#0f172a_0%,transparent_60%)] opacity-50" />
        </motion.div>

        <div className="relative w-full h-full flex items-center justify-center">
          
          {/* 3D Macro View - Extreme Close-up of the 1.15mm Edge */}
          <motion.div style={{ opacity: modelOpacity }} className="absolute inset-0 z-0">
            <Canvas 
              frameloop="always" 
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
              onCreated={() => {
                window.dispatchEvent(new CustomEvent('3d-poster-loaded'));
              }}
            >
              <React.Suspense fallback={<Html center><div className="w-full h-full bg-transparent" /></Html>}>
                <MacroEdgeModel scrollProgress={smoothProgress} />
              </React.Suspense>
            </Canvas>
          </motion.div>

          {/* Dark Overlay for Text Contrast (Left side) */}
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/40 to-transparent z-5 pointer-events-none" />

          {/* Overlay Content - Left Aligned */}
          <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pointer-events-none">
            <motion.div 
              style={{ opacity: textOpacity, y: textY }}
              className="flex flex-col items-start text-left space-y-8 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
            >
              <div className="space-y-4">
                <h2 className="text-5xl md:text-8xl font-thin tracking-tight leading-tight text-[#FFFFFF]">
                  <span className="font-bold bg-gradient-to-r from-zinc-300 via-white to-zinc-300 bg-clip-text text-transparent">
                    1.15mm
                  </span>
                  의 영속성.
                </h2>
                <p className="text-xl md:text-2xl font-thin tracking-[0.1em] text-zinc-400 max-w-xl leading-relaxed">
                  종이보다 강인하게, 철보다 가볍게.<br/>
                  세월이 흘러도 변치 않는 압도적 발색력을 경험하십시오.
                </p>
              </div>
              
              {/* Micro Detail Label */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-px bg-white/40" />
                <span className="text-[10px] font-bold text-zinc-400 tracking-[0.4em] uppercase">
                  Precision Edge Technology
                </span>
              </div>
            </motion.div>
          </div>

          {/* Bottom Indicator */}
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.3 }}
            className="absolute bottom-12 left-6 flex flex-col items-start space-y-2"
          >
            <div className="text-[9px] font-black tracking-[0.5em] text-white uppercase">
              Material Permanence
            </div>
            <div className="w-24 h-px bg-white/20" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
