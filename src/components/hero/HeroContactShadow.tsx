import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HERO_CONTACT_SHADOW } from './backdropAsset';
import type { HeroChoreographyChannels } from './choreography';
import { getHeroSoftShadowTexture } from './softShadowTexture';

interface HeroContactShadowProps {
  channelsRef: React.MutableRefObject<HeroChoreographyChannels>;
  artworkSizeRef: React.MutableRefObject<{ width: number; height: number }>;
}

/** Soft radial contact shadow — no rectangular backplate */
export default function HeroContactShadow({ channelsRef, artworkSizeRef }: HeroContactShadowProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const shadowTexture = useMemo(() => getHeroSoftShadowTexture(), []);

  useFrame(() => {
    const ch = channelsRef.current;
    const { width, height } = artworkSizeRef.current;
    const skew = ch.artworkYaw * 0.3;
    const strength = ch.contactShadowStrength;

    if (meshRef.current) {
      meshRef.current.position.set(
        HERO_CONTACT_SHADOW.offsetX + skew * 0.1,
        HERO_CONTACT_SHADOW.offsetY,
        HERO_CONTACT_SHADOW.offsetZ,
      );
      meshRef.current.rotation.set(0, skew * 0.12, 0);
      meshRef.current.scale.set(
        width * (1.08 + strength * 0.04),
        height * (1.06 + strength * 0.03),
        1,
      );
    }
    if (materialRef.current) {
      materialRef.current.opacity = 0.04 + strength * 0.14;
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={shadowTexture}
        transparent
        opacity={0.08}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
