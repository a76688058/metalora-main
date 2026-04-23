import React, { useRef, useState, useMemo, useEffect, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, useTexture, Html } from '@react-three/drei';
import ErrorBoundary from './ErrorBoundary';
import * as THREE from 'three';
import { Product } from '../data/products';

// 3D Loaded Event Emitter Component
function CanvasLoadTracker({ onLoaded }: { onLoaded: () => void }) {
  useEffect(() => {
    onLoaded();
  }, [onLoaded]);
  return null;
}

interface Poster3DProps {
  product?: Product;
  imageUrl?: string;
  backImageUrl?: string;
  width?: number;
  height?: number;
  scale?: number;
  interactive?: boolean;
  autoRotate?: boolean;
  orientation?: 'portrait' | 'landscape';
}

export function Poster3DWithFallback({ product, imageUrl, backImageUrl, width, height, scale, interactive, autoRotate, orientation, fallbackImageUrl }: Poster3DProps & { fallbackImageUrl?: string }) {
  const [showFallback, setShowFallback] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      // If the 3D model hasn't rendered after 1.5s, fallback
      setShowFallback(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const imageSrc = fallbackImageUrl || imageUrl || (orientation === 'landscape' && product?.landscape_image ? product.landscape_image : (product?.front_image || product?.image));

  // if explicitly hasError, or if timer triggered AND it never rendered
  const shouldShowFallback = hasError || (showFallback && !isRendered);

  if (shouldShowFallback) {
    return (
      <Html center className="w-full h-full pointer-events-none"> 
         <img 
          src={imageSrc || 'https://picsum.photos/seed/metalora_fallback/210/297'} 
          alt="Poster" 
          className="w-full h-full object-contain drop-shadow-2xl"
          onError={() => setHasError(true)}
        />
      </Html>
    );
  }

  return (
    <ErrorBoundary fallback={
       <Html center className="w-full h-full pointer-events-none">
        <img 
          src={imageSrc || 'https://picsum.photos/seed/metalora_fallback/210/297'} 
          alt="Poster" 
          className="w-full h-full object-contain drop-shadow-2xl"
        />
      </Html>
    }>
      <Suspense fallback={null}>
         <CanvasLoadTracker onLoaded={() => setIsRendered(true)} />
         <Poster3D 
           product={product}
           imageUrl={imageUrl}
           backImageUrl={backImageUrl}
           width={width}
           height={height}
           scale={scale}
           interactive={interactive}
           autoRotate={autoRotate}
           orientation={orientation}
         />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function Poster3D({ 
  product,
  imageUrl: propImageUrl, 
  backImageUrl: propBackImageUrl, 
  width = 1, 
  height = 1.414, 
  scale: baseScale = 1, 
  interactive = true,
  autoRotate = false,
  orientation = 'portrait'
}: Poster3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const finalWidth = orientation === 'landscape' ? height : width;
  const finalHeight = orientation === 'landscape' ? width : height;
  
  const imageUrl = propImageUrl || (orientation === 'landscape' && product?.landscape_image ? product.landscape_image : (product?.front_image || product?.image || ''));
  const backImageUrl = propBackImageUrl || (orientation === 'landscape' && product?.landscape_back_image ? product.landscape_back_image : (product?.back_image || product?.backImage || ''));

  // Use useTexture for better caching and Suspense support
  const textures = useTexture(
    [imageUrl, backImageUrl].filter(Boolean) as string[]
  );

  const frontTexture = textures[0];
  const backTexture = backImageUrl ? textures[1] : null;

  // Apply cover logic and quality settings once
  useMemo(() => {
    const targetAspect = finalWidth / finalHeight;
    
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
  }, [frontTexture, backTexture, finalWidth, finalHeight]);

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
          <boxGeometry args={[finalWidth, finalHeight, 0.008]} /> 
        </mesh>
      </group>
    </>
  );
}
