import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { Product } from '../data/products';

interface Poster3DProps {
  product?: Product;
  imageUrl?: string;
  backImageUrl?: string;
  width?: number;
  height?: number;
  scale?: number;
  interactive?: boolean;
}

export default function Poster3D({ 
  product,
  imageUrl: propImageUrl, 
  backImageUrl: propBackImageUrl, 
  width = 1, 
  height = 1.414, 
  scale: baseScale = 1, 
  interactive = true 
}: Poster3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  
  const imageUrl = propImageUrl || product?.front_image || product?.image || '';
  const backImageUrl = propBackImageUrl || product?.back_image || product?.backImage || '';

  // Use useTexture for better caching and Suspense support
  const textures = useTexture(
    [imageUrl, backImageUrl].filter(Boolean) as string[]
  );

  const frontTexture = textures[0];
  const backTexture = backImageUrl ? textures[1] : null;

  // Apply cover logic and quality settings once
  useMemo(() => {
    const targetAspect = width / height;
    
    [frontTexture, backTexture].forEach(tex => {
      if (!tex || !tex.image) return;
      
      const img = tex.image as HTMLImageElement;
      const imageAspect = img.width / img.height;
      
      if (imageAspect > targetAspect) {
        tex.repeat.set(targetAspect / imageAspect, 1);
        tex.offset.set((1 - targetAspect / imageAspect) / 2, 0);
      } else {
        tex.repeat.set(1, imageAspect / targetAspect);
        tex.offset.set(0, (1 - imageAspect / targetAspect) / 2);
      }
      
      tex.anisotropy = 16;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
    });
  }, [frontTexture, backTexture, width, height]);

  useFrame((state, delta) => {
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

    if (meshRef.current && !active && !hovered && interactive && !backImageUrl) {
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  const materials = useMemo(() => {
    const fallbackMaterialProps = {
      color: '#2A2A2A',
      roughness: 0.2,
      metalness: 0.8,
    };

    return [
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Right
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Left
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Top
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }), // Bottom
      new THREE.MeshStandardMaterial({ 
        ...fallbackMaterialProps,
        map: frontTexture, 
        emissiveMap: frontTexture,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.4,
        color: frontTexture ? '#ffffff' : '#2A2A2A',
        toneMapped: false
      }), 
      new THREE.MeshStandardMaterial({ 
        ...fallbackMaterialProps,
        map: backTexture,
        emissiveMap: backTexture,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.4,
        color: backTexture ? '#ffffff' : '#2A2A2A',
        toneMapped: false
      }), 
    ];
  }, [frontTexture, backTexture]);

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
          <boxGeometry args={[width, height, 0.008]} /> 
        </mesh>
      </group>
    </>
  );
}
