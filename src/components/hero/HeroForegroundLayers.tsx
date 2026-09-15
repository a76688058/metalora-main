import { useRef } from 'react';

import { useFrame } from '@react-three/fiber';

import * as THREE from 'three';

import type { HeroChoreographyChannels } from './choreography';



interface HeroForegroundLayersProps {
  theme: 'light' | 'dark';
  channelsRef: React.MutableRefObject<HeroChoreographyChannels>;
  quality: 'low' | 'balanced' | 'high';
  useBakedRoom?: boolean;
}

/** Lightweight near-field depth — disabled when baked room provides real foreground */
export default function HeroForegroundLayers({
  theme,
  channelsRef,
  quality,
  useBakedRoom = false,
}: HeroForegroundLayersProps) {
  const isDark = theme === 'dark';
  const showLayers = quality !== 'low' && !useBakedRoom;

  const windowRef = useRef<THREE.Mesh>(null);

  const plantRef = useRef<THREE.Mesh>(null);

  const windowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const plantMatRef = useRef<THREE.MeshBasicMaterial>(null);



  useFrame(() => {

    if (!showLayers) return;

    const ch = channelsRef.current;

    const fg = ch.foregroundParallax;

    const exit = 1 - ch.lightArc * 0.75;



    if (windowRef.current) {

      windowRef.current.position.set(-2.1 + fg * -0.35, 0.35 + fg * 0.04, 0.35);

      windowRef.current.scale.set(1, 1 + fg * 0.08, 1);

    }

    if (plantRef.current) {

      plantRef.current.position.set(2.05 + fg * 0.28, -0.45 + fg * -0.02, 0.55);

    }

    if (windowMatRef.current) {

      windowMatRef.current.opacity = 0.35 * exit * (1 - ch.roomDim * 0.4);

    }

    if (plantMatRef.current) {

      plantMatRef.current.opacity = 0.28 * exit * (1 - ch.roomDim * 0.5);

    }

  });



  if (!showLayers) return null;



  return (

    <group>

      <mesh ref={windowRef}>

        <planeGeometry args={[0.55, 3.2]} />

        <meshBasicMaterial

          ref={windowMatRef}

          color={isDark ? '#0a0b0d' : '#2a2d32'}

          transparent

          opacity={0.35}

          toneMapped={false}

        />

      </mesh>

      <mesh ref={plantRef} scale={[1.1, 1.2, 1]}>

        <planeGeometry args={[0.9, 1.6]} />

        <meshBasicMaterial

          ref={plantMatRef}

          color={isDark ? '#0d0f12' : '#3d4540'}

          transparent

          opacity={0.28}

          toneMapped={false}

        />

      </mesh>

    </group>

  );

}

