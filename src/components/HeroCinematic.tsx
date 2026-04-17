import React, { useRef, useMemo, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useTexture, ContactShadows, Float, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext';
import { useProducts } from '../context/ProductContext';
import { useNavigate } from 'react-router-dom';

/**
 * High-End Kinetic Fan Layout
 * Features:
 * - Metallic/Glass frame aesthetics
 * - Aggressive horizontal & depth fanning
 * - Brutalist typography integration
 * - Dramatic stage lighting
 */

function CinematicPoster({ progress, imageUrl, theme }: { progress: any, imageUrl: string, theme: string }) {
  const meshRef = useRef<THREE.Group>(null);
  const rimRef = useRef<THREE.Mesh>(null);
  const texture = useTexture(imageUrl);
  
  // Dramatic Cinematic Logic:
  const rotationY = useTransform(progress, [0, 0.3], [Math.PI / 2, 0]);
  const scale = useTransform(progress, [0, 0.25, 0.6, 1.0], [0.79, 0.9, 2.88, 16.2]);
  const opacity = useTransform(progress, [0.9, 1.0], [1, 0]); 

  // Sync with Poster3D's high-quality texture settings
  useEffect(() => {
    if (texture) {
      texture.anisotropy = 16;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
    }
  }, [texture]);

  // Materials need careful opacity handling
  const materials = useMemo(() => {
    return {
      rim: new THREE.MeshStandardMaterial({
        color: "#a855f7",
        emissive: "#a855f7",
        emissiveIntensity: 2,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide
      })
    };
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    const currentProgress = progress.get();
    const currentOpacity = opacity.get();
    
    meshRef.current.rotation.y = rotationY.get();
    meshRef.current.scale.setScalar(scale.get());
    
    // Rim Light Pulsing (Murmuring)
    if (rimRef.current) {
      const pulse = Math.sin(t * 1.5) * 0.4 + 0.6;
      materials.rim.emissiveIntensity = (theme === 'dark' ? 3.0 : 1.5) * pulse * (1 - currentProgress);
      materials.rim.opacity = (theme === 'dark' ? 0.7 : 0.4) * pulse * currentOpacity * (1 - currentProgress);
    }

    // Apply global opacity to all children
    meshRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh === rimRef.current) return; // Handled separately
        
        const mat = mesh.material as THREE.MeshStandardMaterial;
        // Base opacities: artwork is usually 1, frame is 1
        // We just apply the global exit fade
        mat.opacity = currentOpacity;
        mat.transparent = true;
      }
    });
  });

  return (
    <group ref={meshRef}>
      {/* Artwork Mesh - Synchronized with Poster3D visuals */}
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[1, 1.414, 0.002]} />
        <meshStandardMaterial 
          map={texture} 
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={1.0}
          color="#ffffff"
          roughness={0.3}
          metalness={0.7}
          toneMapped={false}
          transparent
        />
      </mesh>
      
      {/* Premium Metallic Case - Synchronized with fallbackMaterialProps */}
      <mesh>
        <boxGeometry args={[1.01, 1.424, 0.012]} />
        <meshStandardMaterial 
          color="#1a1a1a" 
          roughness={0.3} 
          metalness={0.7} 
          transparent 
        />
      </mesh>

      {/* Rim Light / Edge Glow Mesh */}
      <mesh ref={rimRef} material={materials.rim}>
        <boxGeometry args={[1.025, 1.438, 0.016]} />
      </mesh>
    </group>
  );
}

export default function HeroCinematic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { products } = useProducts();

  const heroProduct = useMemo(() => {
    if (!products || products.length === 0) return null;
    return products.find(p => p.title.toLowerCase().includes('mask')) || products[0];
  }, [products]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 30,
    restDelta: 0.001
  });

  if (!heroProduct) return null;

  return (
    <div ref={containerRef} className={`relative h-[350vh] ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        
        {/* Main 3D Stage */}
        <div className="absolute inset-0 z-10">
          <Canvas 
            key={heroProduct.id}
            camera={{ position: [0, 0, 4], fov: 30 }}
            gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
          >
            {/* Sync Stage Lighting with Poster3D */}
            <ambientLight intensity={0.2} />
            <directionalLight position={[5, 5, 5]} intensity={0.3} />
            <directionalLight position={[-5, -5, -5]} intensity={0.2} />
            <pointLight position={[2, 2, 2]} intensity={0.2} color="#ffffff" />
            
            <Environment preset="studio" environmentIntensity={0.3} />
            
            <React.Suspense fallback={null}>
              <CinematicPoster 
                progress={smoothProgress} 
                imageUrl={heroProduct.front_image || heroProduct.image} 
                theme={theme} 
              />
            </React.Suspense>
          </Canvas>
        </div>

        {/* Focus Vignette */}
        <div className={`absolute inset-0 pointer-events-none z-15 ${
          theme === 'dark' 
            ? 'bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.8)_100%)]' 
            : 'bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.1)_100%)]'
        }`} />
      </div>
    </div>
  );
}
