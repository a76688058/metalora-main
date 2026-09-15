import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { HeroIntegrationChannels } from './heroIntegration';
import { createHeroLightHighlightMaterial } from './heroLightHighlightShader';

interface HeroLightHighlightProps {
  channelsRef: React.MutableRefObject<HeroIntegrationChannels>;
  width: number;
  height: number;
  thickness: number;
  wallOffset: number;
}

/** Face-mounted broad soft highlight — signature LIGHT event, moves with panel */
export default function HeroLightHighlight({
  channelsRef,
  width,
  height,
  thickness,
  wallOffset,
}: HeroLightHighlightProps) {
  const material = useMemo(() => createHeroLightHighlightMaterial(), []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const ch = channelsRef.current;
    material.uniforms.uBandCenter.value = ch.lightBandCenter;
    material.uniforms.uBandWidth.value = ch.lightBandWidth;
    material.uniforms.uStrength.value = ch.lightBandStrength;
  });

  const z = -thickness * 0.5 + wallOffset * 0.1 + thickness * 0.5 + 0.0008;

  return (
    <mesh position={[0, 0, z]} renderOrder={2} material={material}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}
