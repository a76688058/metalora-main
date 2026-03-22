import React, { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

function MacroEdgeModel({ scrollProgress }: { scrollProgress: any }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.SpotLight>(null);

  // 0.0 ~ 0.2: Initial reveal
  // 0.2 ~ 0.8: Active Shimmer/Tilt (Enhanced)
  // 0.8 ~ 1.0: Hold (Maintain final tilt)
  const rotationY = useTransform(scrollProgress, [0, 0.2, 0.8, 1], [-Math.PI / 4, -Math.PI / 4, -Math.PI / 3.2, -Math.PI / 3.2]);
  const rotationX = useTransform(scrollProgress, [0, 0.2, 0.8, 1], [0.2, 0.2, 0.4, 0.4]);
  
  // Shimmer effect: light position moves across the edge based on scroll
  const lightX = useTransform(scrollProgress, [0.2, 0.8, 1], [-10, 10, 10]);
  const lightIntensity = useTransform(scrollProgress, [0, 0.2, 0.4, 0.6, 0.8, 1], [50, 300, 600, 600, 300, 300]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = rotationY.get();
      meshRef.current.rotation.x = rotationX.get();
    }
    
    if (lightRef.current) {
      lightRef.current.position.x = lightX.get();
      lightRef.current.intensity = lightIntensity.get();
    }
  });

  const materials = useMemo(() => {
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 1,
      roughness: 0.02, // Sharper reflections
      emissive: '#ffffff',
      emissiveIntensity: 0.1,
    });

    const surfaceMaterial = new THREE.MeshStandardMaterial({
      color: '#050505',
      metalness: 1,
      roughness: 0.3,
    });

    return [
      edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial,
      surfaceMaterial, surfaceMaterial
    ];
  }, []);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={20} />
      <ambientLight intensity={0.2} />
      <spotLight
        ref={lightRef}
        position={[0, 2, 4]}
        angle={0.3}
        penumbra={1}
        intensity={150}
        color="#ffffff"
      />
      <pointLight position={[-2, -1, 3]} intensity={40} color="#ffffff" />
      
      <mesh ref={meshRef} material={materials}>
        <boxGeometry args={[4.5, 2.8, 0.0115]} />
      </mesh>
      <Environment preset="night" />
    </>
  );
}

export default function MaterialEdgeAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // 0.0 ~ 0.2: Fade in
  // 0.2 ~ 0.8: Active Shimmer/Tilt (Holding from 0.8 to 1.0)
  const textOpacity = useTransform(smoothProgress, [0, 0.1, 0.8, 1], [0, 1, 1, 1]);
  const textY = useTransform(smoothProgress, [0, 0.1, 0.8, 1], [50, 0, 0, 0]);
  const edgeLineOpacity = useTransform(smoothProgress, [0.05, 0.1, 0.8, 1], [0, 1, 1, 1]);
  const modelOpacity = useTransform(smoothProgress, [0, 0.1, 0.8, 1], [0, 1, 1, 1]);

  if (!containerRef) return null;

  return (
    <section ref={containerRef} className="relative h-[200vh] bg-black">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false, margin: "-10% 0px 0px 0px" }}
          transition={{ duration: 0.8 }}
          className="relative w-full h-full flex items-center justify-center"
        >
          {/* 3D Macro View - Shifted to the right for better text placement */}
          <motion.div style={{ opacity: modelOpacity }} className="absolute inset-0 z-0 lg:left-[20%]">
            <Canvas gl={{ antialias: true, alpha: true }}>
              <React.Suspense fallback={null}>
                <MacroEdgeModel scrollProgress={smoothProgress} />
              </React.Suspense>
            </Canvas>
          </motion.div>

          {/* Overlay Content - Shifted to the left */}
          <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pointer-events-none">
            <motion.div 
              style={{ opacity: textOpacity, y: textY }}
              className="flex flex-col items-start text-left space-y-12 lg:w-1/2"
            >
              <div className="space-y-8">
                <h2 className="text-5xl md:text-8xl font-thin tracking-tight leading-tight text-white">
                  영원히 바래지 않는 <br/>
                  <span className="relative inline-block">
                    <span className="font-bold bg-gradient-to-r from-zinc-400 via-white to-zinc-400 bg-clip-text text-transparent">
                      1.15mm
                    </span>
                    <motion.div 
                      style={{ opacity: edgeLineOpacity }}
                      className="absolute -bottom-4 left-0 right-0 h-px bg-white/30"
                    >
                      <div className="absolute -right-20 -top-2 text-[10px] font-bold text-zinc-500 tracking-[0.3em] uppercase">
                        Precision Edge
                      </div>
                    </motion.div>
                  </span>
                  의 영속성.
                </h2>
                <p className="text-xl md:text-3xl font-thin tracking-[0.1em] text-zinc-500 max-w-2xl leading-relaxed">
                  종이보다 강인하게, 철보다 가볍게.<br/>
                  세월이 흘러도 변치 않는 압도적 발색력을 경험하십시오.
                </p>
              </div>
            </motion.div>
          </div>

          {/* 1.15mm Comparison Line (Visual Guide) */}
          <motion.div 
            style={{ opacity: edgeLineOpacity }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-4"
          >
            <div className="w-px h-32 bg-gradient-to-t from-white/40 to-transparent" />
            <div className="text-[10px] font-black tracking-[0.5em] text-white/40 uppercase">
              1.15mm Engineered Thickness
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
