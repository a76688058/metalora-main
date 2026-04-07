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
  autoRotate?: boolean;
}

export default function Poster3D({ 
  product,
  imageUrl: propImageUrl, 
  backImageUrl: propBackImageUrl, 
  width = 1, 
  height = 1.414, 
  scale: baseScale = 1, 
  interactive = true,
  autoRotate = false
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

    if (meshRef.current) {
      if (interactive) {
        // When interactive (modal), we let OrbitControls handle the view.
        // We reset the mesh rotation to 0 so it doesn't conflict with camera movement.
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 5);
      } else if (autoRotate || !interactive) {
        // Always auto-rotate if requested or not interactive (main view)
        meshRef.current.rotation.y += delta * 0.5;
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
      } else if (!active && !hovered) {
        // Auto rotate when not hovered
        meshRef.current.rotation.y += delta * 0.4;
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
      } else if (hovered && !active) {
        // Mouse tracking tilt
        const mouseX = (state.mouse.x * Math.PI) / 8;
        const mouseY = -(state.mouse.y * Math.PI) / 8;
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, mouseX, delta * 5);
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, mouseY, delta * 5);
      } else if (!active) {
        // Reset rotation
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 5);
      } else {
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
      }
    }
  });

  const materials = useMemo(() => {
    const fallbackMaterialProps = {
      color: '#1a1a1a',
      roughness: 0.3, // Prevent wash-out from reflections
      metalness: 0.7, // Premium metallic feel
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
        emissiveIntensity: 1.0, // Ultimate emissive for maximum clarity
        color: frontTexture ? '#ffffff' : '#1a1a1a',
        toneMapped: false
      }), 
      new THREE.MeshStandardMaterial({ 
        ...fallbackMaterialProps,
        map: backTexture,
        emissiveMap: backTexture,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 1.0,
        color: backTexture ? '#ffffff' : '#1a1a1a',
        toneMapped: false
      }), 
    ];
  }, [frontTexture, backTexture]);

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} castShadow={false} />
      <directionalLight position={[-5, -5, -5]} intensity={0.2} />
      <pointLight position={[2, 2, 2]} intensity={0.2} color="#ffffff" />
      <Environment preset="studio" environmentIntensity={0.3} />
      
      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          onClick={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            setActive(!active);
          }}
          onPointerOver={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={(e) => {
            if (!interactive) return;
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
