import * as THREE from 'three';

import { STORY_LAYER_TONES } from './constants';

/** Neutral rolled aluminum — not charcoal, not chrome, not pastel gray. */
export const STORY_ALUMINUM_COLOR = STORY_LAYER_TONES.panelEdge;
/** Reverse face only. Unprinted aluminum back; no back_image exists. */
export const STORY_ALUMINUM_REVERSE_COLOR = STORY_LAYER_TONES.artworkReverse;
/** Studio rig exposure lift, removed so the reverse reads at its base tone. */
const STORY_ALUMINUM_REVERSE_EXPOSURE = 0.38;
export const STORY_ALUMINUM_METALNESS = 0.92;
export const STORY_ALUMINUM_ROUGHNESS = 0.33;
export const STORY_ALUMINUM_ANISOTROPY = 0.85;

export type StoryAluminumMaps = {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
};

function fillBrushedMaps(width: number, height: number): {
  normal: Uint8Array;
  roughness: Uint8Array;
} {
  const normal = new Uint8Array(width * height * 4);
  const roughness = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const stroke =
      Math.sin(y * 0.62) * 0.42 + Math.sin(y * 1.85) * 0.26 + Math.sin(y * 4.4) * 0.12;
    for (let x = 0; x < width; x += 1) {
      const jitter = ((x * 17 + y * 9) % 13) / 13 - 0.5;
      const nx = 128 + (stroke + jitter * 0.12) * 16;
      const i = (y * width + x) * 4;
      normal[i] = THREE.MathUtils.clamp(Math.round(nx), 0, 255);
      normal[i + 1] = 128;
      normal[i + 2] = 255;
      normal[i + 3] = 255;

      const grain = 236 + stroke * 10 + jitter * 6;
      const g = THREE.MathUtils.clamp(Math.round(grain), 0, 255);
      roughness[i] = g;
      roughness[i + 1] = g;
      roughness[i + 2] = g;
      roughness[i + 3] = 255;
    }
  }
  return { normal, roughness };
}

function makeDataTexture(data: Uint8Array, width: number, height: number, repeatY: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, repeatY);
  texture.needsUpdate = true;
  return texture;
}

export function createStoryAluminumMaps(): StoryAluminumMaps {
  const width = 256;
  const height = 256;
  const { normal, roughness } = fillBrushedMaps(width, height);
  return {
    normalMap: makeDataTexture(normal, width, height, 18),
    roughnessMap: makeDataTexture(roughness, width, height, 18),
  };
}

type PhysicalAnisotropy = THREE.MeshPhysicalMaterial & {
  anisotropy: number;
  anisotropyRotation: number;
};

export function createStoryAluminumMaterial(options?: {
  reverse?: boolean;
  maps?: StoryAluminumMaps;
}): { material: THREE.MeshPhysicalMaterial; maps: StoryAluminumMaps } {
  const maps = options?.maps ?? createStoryAluminumMaps();
  const reverse = options?.reverse === true;
  const material = new THREE.MeshPhysicalMaterial({
    color: reverse
      ? new THREE.Color(STORY_ALUMINUM_REVERSE_COLOR).multiplyScalar(
          STORY_ALUMINUM_REVERSE_EXPOSURE,
        )
      : new THREE.Color(STORY_ALUMINUM_COLOR),
    // Reverse is unprinted mill aluminum. Full metalness drops the diffuse
    // term and the base tone washes out against the story canvas.
    metalness: reverse ? 0.3 : STORY_ALUMINUM_METALNESS,
    roughness: reverse ? 0.58 : STORY_ALUMINUM_ROUGHNESS,
    envMapIntensity: reverse ? 0.3 : 1.45,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughnessMap: maps.roughnessMap,
    toneMapped: true,
  });
  const anisotropic = material as PhysicalAnisotropy;
  anisotropic.anisotropy = STORY_ALUMINUM_ANISOTROPY;
  anisotropic.anisotropyRotation = Math.PI / 2;
  return { material, maps };
}

export function createStoryPrintMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    toneMapped: false,
  });
  material.userData.pdpStoryPrint = true;
  return material;
}
