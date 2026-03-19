import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

interface Poster3DProps {
  imageUrl: string;
  backImageUrl?: string;
  width?: number;
  height?: number;
  scale?: number;
  interactive?: boolean;
}

export default function Poster3D({ 
  imageUrl, 
  backImageUrl, 
  width = 1, 
  height = 1.414, 
  scale: baseScale = 1, 
  interactive = true 
}: Poster3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  
  const [frontTexture, setFrontTexture] = useState<THREE.Texture | null>(null);
  const [backTexture, setBackTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let isMounted = true;
    
    const targetAspect = width / height;

    // Helper for cover logic
    const applyCover = (tex: THREE.Texture) => {
      if (!tex.image) return;
      const img = tex.image as HTMLImageElement;
      const imageAspect = img.width / img.height;
      if (imageAspect > targetAspect) {
        tex.repeat.set(targetAspect / imageAspect, 1);
        tex.offset.set((1 - targetAspect / imageAspect) / 2, 0);
      } else {
        tex.repeat.set(1, imageAspect / targetAspect);
        tex.offset.set(0, (1 - imageAspect / targetAspect) / 2);
      }
      
      // Maximize texture quality for close-ups
      tex.anisotropy = 16;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      
      tex.needsUpdate = true;
    };

    // Load Front Image
    if (imageUrl) {
      loader.load(
        imageUrl,
        (tex) => {
          if (!isMounted) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          applyCover(tex);
          setFrontTexture(tex);
        }
      );
    }

    // Load Back Image
    if (backImageUrl) {
      loader.load(
        backImageUrl,
        (tex) => {
          if (!isMounted) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          applyCover(tex);
          setBackTexture(tex);
        }
      );
    }

    return () => {
      isMounted = false;
    };
  }, [imageUrl, backImageUrl, width, height]);

  useFrame((state, delta) => {
    // Smooth flip animation (Group rotation)
    if (groupRef.current) {
      const targetRotation = active ? Math.PI : 0;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotation,
        delta * 5
      );

      const targetScale = active ? 1.1 * baseScale : 1 * baseScale;
      const currentScale = groupRef.current.scale.x;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 5);
      groupRef.current.scale.setScalar(newScale);
    }

    // Auto-rotation (Mesh rotation) - Only if not in a dedicated viewer that has its own controls
    if (meshRef.current && !active && !hovered && interactive && !backImageUrl) {
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  // Material setup
  // 0: right, 1: left, 2: top, 3: bottom, 4: front, 5: back
  const fallbackMaterialProps = {
    color: '#2A2A2A', // Actual aluminum edge look
    roughness: 0.2,
    metalness: 0.8,
  };

  const materials = [
    new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Right
    new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Left
    new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Top
    new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Bottom
    // Front Face
    new THREE.MeshStandardMaterial({ 
      ...fallbackMaterialProps,
      map: frontTexture, 
      emissiveMap: frontTexture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.4,
      metalness: 0.8, 
      roughness: 0.2,
      color: frontTexture ? '#ffffff' : '#2A2A2A',
      toneMapped: false // Preserve original artwork colors
    }), 
    // Back Face
    new THREE.MeshStandardMaterial({ 
      ...fallbackMaterialProps,
      map: backTexture,
      emissiveMap: backTexture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.4,
      metalness: 0.8,
      roughness: 0.2,
      color: backTexture ? '#ffffff' : '#2A2A2A',
      toneMapped: false // Preserve original artwork colors
    }), 
  ];

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={0.4} castShadow />
      <directionalLight position={[-5, -5, -5]} intensity={0.4} />
      <pointLight position={[2, 2, 2]} intensity={0.2} color="#ffffff" />
      <Environment preset="studio" environmentIntensity={0.5} />
      
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation();
            setActive(!active);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHovered(false);
          }}
          material={materials}
        >
          {/* Actual 1.15mm thickness simulated (0.008 in world units) */}
          <boxGeometry args={[width, height, 0.008]} /> 
        </mesh>
      </group>
    </>
  );
}
