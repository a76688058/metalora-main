import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Default placeholder image (Premium Abstract/Graffiti vibe)
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop";

type SizeType = 'A4' | 'Custom';

export default function WorkshopPoster3D({ 
  imageUrl, 
  materialType, 
  interactive = false, 
  size = 'A4',
  autoRotate = false 
}: { 
  imageUrl: string | null, 
  materialType: string, 
  interactive?: boolean, 
  size?: SizeType,
  autoRotate?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const targetRotation = useRef({ x: 0, y: 0 });
  
  const textureUrl = imageUrl || DEFAULT_IMAGE;
  const texture = useTexture(textureUrl);

  const targetAspect = useMemo(() => {
    if (size === 'A4') return 1 / 1.414;
    return 1 / 1.414; // Default or Custom
  }, [size]);

  useMemo(() => {
    if (!texture || !texture.image) return;
    const img = texture.image as HTMLImageElement;
    const imageAspect = img.width / img.height;
    
    if (imageAspect > targetAspect) {
      texture.repeat.set(targetAspect / imageAspect, 1);
      texture.offset.set((1 - targetAspect / imageAspect) / 2, 0);
    } else {
      texture.repeat.set(1, imageAspect / targetAspect);
      texture.offset.set(0, (1 - imageAspect / targetAspect) / 2);
    }
    
    texture.anisotropy = 16;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }, [texture, targetAspect]);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (!interactive && !autoRotate && e.beta !== null && e.gamma !== null) {
        const maxTilt = Math.PI / 12;
        const tiltX = THREE.MathUtils.clamp((e.beta - 45) * (Math.PI / 180), -maxTilt, maxTilt);
        const tiltY = THREE.MathUtils.clamp(e.gamma * (Math.PI / 180), -maxTilt, maxTilt);
        targetRotation.current = { x: tiltX, y: tiltY };
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [interactive, autoRotate]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (interactive) {
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, delta * 5);
      } else if (autoRotate) {
        meshRef.current.rotation.y += delta * 0.35; // ~20 degrees per second
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, delta * 5);
      } else {
        let targetX = targetRotation.current.x;
        let targetY = targetRotation.current.y;

        if (hovered && !("ontouchstart" in window)) {
          targetY = (state.mouse.x * Math.PI) / 8;
          targetX = -(state.mouse.y * Math.PI) / 8;
        }

        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetY, delta * 5);
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetX, delta * 5);
      }
    }
  });

  const materials = useMemo(() => {
    const isAluminum = materialType === 'aluminum';
    const roughness = isAluminum ? 0.3 : 0.85;
    const metalness = isAluminum ? 0.7 : 0.1;

    const fallbackMaterialProps = {
      color: '#1a1a1a',
      roughness,
      metalness,
    };

    const mats = [
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
      new THREE.MeshStandardMaterial({ 
        ...fallbackMaterialProps,
        map: texture, 
        emissiveMap: texture,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: isAluminum ? 1.0 : 0.05,
        color: '#ffffff',
        toneMapped: false
      }), 
      new THREE.MeshStandardMaterial({ ...fallbackMaterialProps }),
    ];

    return mats;
  }, [texture, materialType]);

  // Ensure materials and textures are disposed on unmount
  useEffect(() => {
    return () => {
      materials.forEach(m => m.dispose());
      if (texture) texture.dispose();
    };
  }, [materials, texture]);

  const isAluminum = materialType === 'aluminum';
  const depth = isAluminum ? 0.008 : 0.04;

  const geometryArgs = useMemo(() => {
    const width = 1;
    const height = size === 'A4' ? 1.414 : 1.414;
    return [width, height, depth] as [number, number, number];
  }, [size, depth]);

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
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          material={materials}
          castShadow
          receiveShadow
        >
          <boxGeometry args={geometryArgs} /> 
        </mesh>
      </group>
    </>
  );
}
