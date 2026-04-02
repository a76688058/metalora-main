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
  
  useMemo(() => {
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    }
  }, [texture]);
  
  // Material settings for high-end metal look
  const materialProps = useMemo(() => ({
    metalness: 0.7,
    roughness: 0.3,
    envMapIntensity: 0.3,
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
      emissiveMap: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.4,
      color: '#ffffff',
      toneMapped: false
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
      
      {/* Enhanced Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} color="#ffffff" />
      <directionalLight position={[-5, -5, -5]} intensity={0.2} color="#ffffff" />
      <pointLight position={[0, 0, 3]} intensity={0.2} color="#ffffff" />
      <Environment preset="studio" environmentIntensity={0.3} />

      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={meshRef} material={materials} rotation={[0.1, -0.2, 0]}>
          {/* Reduced size: 1.1 x 1.55 (A4 ratio) */}
          <boxGeometry args={[1.1, 1.55, 0.01]} /> 
        </mesh>
      </Float>
    </>
  );
}
