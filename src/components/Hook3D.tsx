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
    envMapIntensity: 1,
    color: '#ffffff',
  }), []);

  const materials = useMemo(() => {
    // 1.15mm thin edges
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#222222',
      metalness: 1,
      roughness: 0.2,
    });

    const frontMaterial = new THREE.MeshStandardMaterial({
      ...materialProps,
      map: texture,
      color: '#ffffff',
    });

    const backMaterial = new THREE.MeshStandardMaterial({
      color: '#050505',
      metalness: 1,
      roughness: 0.5,
    });

    // Order: Right, Left, Top, Bottom, Front, Back
    return [
      edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial,
      frontMaterial, backMaterial
    ];
  }, [texture, materialProps]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={35} />
      
      {/* Minimal Static Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} color="#ffffff" />
      <Environment preset="night" />

      <mesh ref={meshRef} material={materials} rotation={[0.1, -0.2, 0]}>
        {/* 1.15mm = 0.00115 depth */}
        <boxGeometry args={[1.4, 1.96, 0.01]} /> 
      </mesh>
    </>
  );
}
