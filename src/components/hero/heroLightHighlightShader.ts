import * as THREE from 'three';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uBandCenter;
uniform float uBandWidth;
uniform float uStrength;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  float dx = abs(vUv.x - uBandCenter);
  float core = 1.0 - smoothstep(0.0, uBandWidth * 0.42, dx);
  float halo = 1.0 - smoothstep(uBandWidth * 0.25, uBandWidth * 1.05, dx);
  float band = core * halo;
  float vy = smoothstep(0.04, 0.14, vUv.y) * smoothstep(0.04, 0.14, 1.0 - vUv.y);
  float alpha = band * vy * uStrength;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uTint, alpha);
}
`;

/** Broad daylight reflection band — moves across artwork UV space (right → center-left) */
export function createHeroLightHighlightMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBandCenter: { value: 0.88 },
      uBandWidth: { value: 0.38 },
      uStrength: { value: 0 },
      uTint: { value: new THREE.Color(1.0, 0.97, 0.91) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  });
}
