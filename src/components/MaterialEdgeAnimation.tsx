import React, { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

function MacroEdgeModel({ scrollProgress }: { scrollProgress: any }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.SpotLight>(null);

  // Rotate from 45 deg to 90 deg (showing only the edge)
  const rotationY = useTransform(scrollProgress, [0, 1], [-Math.PI / 4, -Math.PI / 2]);
  const rotationX = useTransform(scrollProgress, [0, 1], [0.2, 0]);
  const scaleZ = useTransform(scrollProgress, [0, 1], [1, 1.5]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = rotationY.get();
      meshRef.current.rotation.x = rotationX.get();
      meshRef.current.scale.z = scaleZ.get();
    }
    
    // Shimmer effect: moving light
    if (lightRef.current) {
      lightRef.current.position.x = Math.sin(state.clock.elapsedTime * 2) * 5;
    }
  });

  const materials = useMemo(() => {
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 1,
      roughness: 0.05,
      emissive: '#ffffff',
      emissiveIntensity: 0.2,
    });

    const surfaceMaterial = new THREE.MeshStandardMaterial({
      color: '#111111',
      metalness: 1,
      roughness: 0.2,
    });

    // Right, Left, Top, Bottom, Front, Back
    return [
      edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial,
      surfaceMaterial, surfaceMaterial
    ];
  }, []);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={25} />
      <ambientLight intensity={0.1} />
      <spotLight
        ref={lightRef}
        position={[5, 2, 5]}
        angle={0.15}
        penumbra={1}
        intensity={150}
        color="#ffffff"
      />
      <pointLight position={[-5, -2, 2]} intensity={20} color="#4444ff" />
      
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
        <mesh ref={meshRef} material={materials}>
          {/* 1.15mm depth = 0.0115 in relative units */}
          <boxGeometry args={[4, 2.5, 0.0115]} />
        </mesh>
      </Float>
      <Environment preset="studio" />
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
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  // Refined mapping: text appears even earlier (threshold 0.05)
  const textOpacity = useTransform(smoothProgress, [0.05, 0.2, 0.8, 0.95], [0, 1, 1, 0]);
  const textY = useTransform(smoothProgress, [0.05, 0.2], [100, 0]);
  const edgeLineOpacity = useTransform(smoothProgress, [0.1, 0.3], [0, 1]);

  return (
    <section ref={containerRef} className="relative h-[300vh] bg-black overflow-hidden">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center py-20">
        {/* 3D Macro View */}
        <div className="absolute inset-0 z-0">
          <Canvas gl={{ antialias: true, alpha: true }}>
            <React.Suspense fallback={null}>
              <MacroEdgeModel scrollProgress={smoothProgress} />
            </React.Suspense>
          </Canvas>
        </div>

        {/* Overlay Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pointer-events-none">
          <motion.div 
            style={{ opacity: textOpacity, y: textY }}
            className="flex flex-col items-center text-center space-y-12"
          >
            <div className="space-y-6">
              <h2 className="text-4xl md:text-7xl font-thin tracking-tight leading-tight text-white">
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
              <p className="text-xl md:text-2xl font-thin tracking-[0.2em] text-zinc-500 max-w-3xl mx-auto leading-relaxed">
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
      </div>
    </section>
  );
}
