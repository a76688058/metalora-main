/**
 * SURFACE-only coplanar highlight. Lives as a child of the story artwork mesh
 * so the band is clipped to the print face by construction.
 * Does not change print / edge / reverse materials.
 */
import React, { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform float uTravel;
uniform float uOpacity;

void main() {
  float axis = vUv.x * 0.62 + (1.0 - vUv.y) * 0.38;
  float center = mix(-0.16, 1.16, uTravel);
  float dist = abs(axis - center);
  float core = 1.0 - smoothstep(0.01, 0.046, dist);
  float halo = 1.0 - smoothstep(0.04, 0.11, dist);
  float band = max(core, halo * 0.38);
  float alpha = band * uOpacity * 0.38;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(0.93, 0.97, 1.0, alpha);
}
`;

export function SurfaceSweepPlane({
  width,
  height,
  depth,
  orientation,
  travel,
  opacity,
}: {
  width: number;
  height: number;
  depth: number;
  orientation: 'portrait' | 'landscape';
  travel: number;
  opacity: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTravel: { value: 0 },
          uOpacity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        blending: THREE.NormalBlending,
      }),
    [],
  );

  useLayoutEffect(() => {
    material.uniforms.uTravel.value = travel;
    material.uniforms.uOpacity.value = opacity;
    invalidate();
    return undefined;
  }, [invalidate, material, opacity, travel]);

  useLayoutEffect(() => () => material.dispose(), [material]);

  const faceWidth = orientation === 'landscape' ? height : width;
  const faceHeight = orientation === 'landscape' ? width : height;

  return (
    <mesh position={[0, 0, depth / 2 + 0.0012]} renderOrder={5} frustumCulled={false}>
      <planeGeometry args={[faceWidth, faceHeight]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
