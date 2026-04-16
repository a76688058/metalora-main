import React, { useRef, useMemo, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, PerspectiveCamera, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext';

/**
 * HeroCinematic.tsx
 * 
 * A perfectly centered cinematic opening:
 * - Hyper-realistic aurora image
 * - No floor/ground to ensure absolute centering
 * - Fast rotation (10% -> 40%)
 * - Continuous zoom (40% -> 100%)
 * - Standard lighting & materials from Poster3D.tsx
 */

const AURORA_IMAGE_URL = "https://images.unsplash.com/photo-1593378026483-2a1fd46a35bd?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

function CinematicPoster({ progress, theme }: { progress: any, theme: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgeLightRef = useRef<THREE.PointLight>(null);
  
  const posterTexture = useTexture(AURORA_IMAGE_URL);

  // Animation Timings
  // 0.0 -> 0.1: Edge reveal & Edge Light
  // 0.1 -> 0.4: Fast rotation to front
  // 0.4 -> 1.0: Continuous zoom-in until section disappears
  const rotationY = useTransform(progress, [0, 0.1, 0.4], [Math.PI / 2, Math.PI / 2, 0]);
  const scale = useTransform(progress, [0.3, 0.4, 1.0], [0.8, 1.2, 5.0]);
  const edgeLightIntensity = useTransform(progress, [0, 0.05, 0.1], [0, 40, 0]);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y = rotationY.get();
      meshRef.current.scale.setScalar(scale.get());
    }
    if (edgeLightRef.current) {
      edgeLightRef.current.intensity = edgeLightIntensity.get();
    }
  });

  const materials = useMemo(() => {
    const standardProps = {
      color: theme === 'dark' ? '#1a1a1a' : '#f0f0f0',
      roughness: theme === 'dark' ? 0.3 : 0.1,
      metalness: theme === 'dark' ? 0.7 : 0.4,
    };
    
    const frontMaterial = new THREE.MeshStandardMaterial({
      ...standardProps,
      map: posterTexture,
      color: '#ffffff',
      roughness: 1.0, // Matte surface (no reflections)
      metalness: 0.0, // Pure colors
    });

    const sideMaterial = new THREE.MeshStandardMaterial({
      ...standardProps,
    });

    if (posterTexture) {
      posterTexture.colorSpace = THREE.SRGBColorSpace;
      posterTexture.wrapS = posterTexture.wrapT = THREE.ClampToEdgeWrapping;
      
      // Handle texture aspect ratio to fit A4 (1:1.414)
      if (posterTexture.image) {
        const img = posterTexture.image as HTMLImageElement;
        const imageAspect = img.width / img.height;
        const targetAspect = 1 / 1.414;
        
        if (imageAspect > targetAspect) {
          posterTexture.repeat.set(targetAspect / imageAspect, 1);
          posterTexture.offset.set((1 - targetAspect / imageAspect) / 2, 0);
        } else {
          posterTexture.repeat.set(1, imageAspect / targetAspect);
          posterTexture.offset.set(0, (1 - imageAspect / targetAspect) / 2);
        }
      }
      posterTexture.needsUpdate = true;
    }

    const mats = [
      sideMaterial, // right
      sideMaterial, // left
      sideMaterial, // top
      sideMaterial, // bottom
      frontMaterial, // front
      sideMaterial, // back
    ];

    return mats;
  }, [posterTexture, theme]);

  // Ensure materials are disposed on unmount
  useEffect(() => {
    return () => {
      materials.forEach(m => m.dispose());
    };
  }, [materials]);

  return (
    <group>
      <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.1}>
        <mesh ref={meshRef} material={materials}>
          <boxGeometry args={[1, 1.414, 0.0115]} />
        </mesh>
      </Float>

      {/* Edge Reveal Light */}
      <pointLight 
        ref={edgeLightRef}
        position={[0.8, 0, 0.5]} 
        color="#ffffff" 
      />
    </group>
  );
}

export default function HeroCinematic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 35,
    restDelta: 0.001
  });

  const glowOpacity = useTransform(smoothProgress, [0, 0.2, 0.5], [0, 0.4, 0]);
  const glowScale = useTransform(smoothProgress, [0, 0.5], [0.6, 2.0]);

  return (
    <div ref={containerRef} className={`relative h-[180vh] transition-colors duration-500 ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center">
        {/* 3D Scene - Perfectly Centered */}
        <div className="absolute inset-0 z-10">
          <Canvas dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, 0, 3.5]} fov={30} />
            
            {/* Standard Lighting Sync with Poster3D.tsx */}
            <ambientLight intensity={theme === 'dark' ? 0.25 : 0.4} />
            <directionalLight position={[5, 5, 5]} intensity={0.4} castShadow={false} />
            <directionalLight position={[-5, -5, -5]} intensity={0.2} />
            <pointLight position={[2, 2, 2]} intensity={0.3} color="#ffffff" />
            <Environment preset="studio" environmentIntensity={theme === 'dark' ? 0.2 : 0.3} />
            
            <React.Suspense fallback={null}>
              <CinematicPoster progress={smoothProgress} theme={theme} />
            </React.Suspense>
          </Canvas>
        </div>
        
        {/* Scroll Hint */}
        <motion.div 
          style={{ opacity: useTransform(smoothProgress, [0, 0.05], [1, 0]) }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-20"
        >
          <div className={`w-[1px] h-12 animate-pulse ${
            theme === 'dark' ? 'bg-gradient-to-b from-white/0 via-white/70 to-white/0' : 'bg-gradient-to-b from-black/0 via-black/70 to-black/0'
          }`} />
          <span className={`text-[10px] font-black tracking-[0.6em] uppercase ${
            theme === 'dark' ? 'text-white/60' : 'text-black/60'
          }`}>Scroll to Explore</span>
        </motion.div>
      </div>

      {/* Final Transition Overlay */}
      <motion.div 
        style={{ opacity: useTransform(smoothProgress, [0.95, 1], [0, 1]) }}
        className={`absolute bottom-0 left-0 w-full h-screen z-30 pointer-events-none ${
          theme === 'dark' ? 'bg-black' : 'bg-white'
        }`}
      />
    </div>
  );
}
