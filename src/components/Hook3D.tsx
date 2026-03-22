import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, useTexture, Float, PerspectiveCamera, SpotLight } from '@react-three/drei';
import * as THREE from 'three';

interface Hook3DProps {
  imageUrl: string;
}

export default function Hook3D({ imageUrl }: Hook3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.SpotLight>(null);
  const { mouse, viewport } = useThree();
  
  const texture = useTexture(imageUrl);
  
  // Material settings for high-end metal look
  const materialProps = useMemo(() => ({
    metalness: 1,
    roughness: 0.15,
    envMapIntensity: 2,
    color: '#ffffff',
  }), []);

  const materials = useMemo(() => {
    // 1.15mm thin edges
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#444444',
      metalness: 1,
      roughness: 0.1,
    });

    const frontMaterial = new THREE.MeshStandardMaterial({
      ...materialProps,
      map: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.1,
    });

    const backMaterial = new THREE.MeshStandardMaterial({
      color: '#111111',
      metalness: 1,
      roughness: 0.2,
    });

    // Order: Right, Left, Top, Bottom, Front, Back
    return [
      edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial,
      frontMaterial, backMaterial
    ];
  }, [texture, materialProps]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // 1. Auto-orbit (Slow Y rotation)
    meshRef.current.rotation.y += delta * 0.15;

    // 2. Interactive Tilt with Damping (0.85+)
    // Target rotation based on mouse position
    const targetX = (mouse.y * viewport.height * Math.PI) / 20;
    const targetY = (mouse.x * viewport.width * Math.PI) / 20;

    // Apply damping (lerp)
    meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetX, 0.05);
    // We add the auto-rotation on top of the tilt, but we need to be careful.
    // Actually, let's combine them.
    // meshRef.current.rotation.y is already incrementing. 
    // Let's just lerp the X and Z for tilt.
    meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, -targetY * 0.5, 0.05);

    // 3. Dynamic Spotlight following mouse slightly for specular highlights
    if (lightRef.current) {
      lightRef.current.position.x = THREE.MathUtils.lerp(lightRef.current.position.x, mouse.x * 5, 0.1);
      lightRef.current.position.y = THREE.MathUtils.lerp(lightRef.current.position.y, mouse.y * 5, 0.1);
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={35} />
      
      {/* Lighting for Specular Highlights */}
      <ambientLight intensity={0.2} />
      <SpotLight
        ref={lightRef}
        position={[5, 5, 5]}
        angle={0.3}
        penumbra={1}
        intensity={200}
        castShadow
        color="#ffffff"
      />
      <pointLight position={[-5, 5, -5]} intensity={50} color="#4444ff" />
      <Environment preset="city" />

      <Float
        speed={1.5} 
        rotationIntensity={0.5} 
        floatIntensity={0.5}
      >
        <mesh ref={meshRef} castShadow receiveShadow material={materials}>
          {/* 1.15mm = 0.00115 depth */}
          <boxGeometry args={[2, 2.8, 0.01]} /> 
        </mesh>
      </Float>

      {/* Subtle floor for shadow if needed, but prompt says "부유" (floating) */}
      {/* We'll keep it floating in deep black */}
    </>
  );
}
