import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { ArtworkExternalStateRef } from './types';

interface ArtworkReactiveLightingProps {
  externalStateRef: ArtworkExternalStateRef;
}

/** Optional light sweep / edge highlight — mounted only when external control is provided */
export default function ArtworkReactiveLighting({ externalStateRef }: ArtworkReactiveLightingProps) {
  const sweepLightRef = useRef<THREE.PointLight>(null);
  const edgeBoostRef = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    const external = externalStateRef.current;
    if (!external) return;

    if (sweepLightRef.current && external.lightSweep !== undefined) {
      const t = external.lightSweep;
      sweepLightRef.current.position.set(
        THREE.MathUtils.lerp(-1.2, 1.2, t),
        THREE.MathUtils.lerp(0.4, -0.2, t),
        1.4,
      );
      sweepLightRef.current.intensity = 0.15 + t * 0.35;
    }

    if (edgeBoostRef.current && external.edgeHighlight !== undefined) {
      edgeBoostRef.current.intensity = 0.2 + external.edgeHighlight * 0.45;
    }
  });

  return (
    <>
      <directionalLight ref={edgeBoostRef} position={[-4, 2, 3]} intensity={0.2} />
      <pointLight ref={sweepLightRef} position={[0.8, 0.4, 1.4]} intensity={0.2} color="#ffffff" />
    </>
  );
}
