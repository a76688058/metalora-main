import * as THREE from 'three';
import type { ArtworkFacePresentation, ArtworkMaterialVariant } from './types';

const ALUMINUM_EDGE = {
  color: '#2a2d32',
  roughness: 0.38,
  metalness: 0.82,
};

const STANDARD_EDGE = {
  color: '#1a1a1a',
  roughness: 0.85,
  metalness: 0.12,
};

export function createEdgeMaterial(variant: ArtworkMaterialVariant): THREE.MeshStandardMaterial {
  const props = variant === 'aluminum' ? ALUMINUM_EDGE : STANDARD_EDGE;
  return new THREE.MeshStandardMaterial({ ...props, toneMapped: true });
}

export function createFaceMaterial(
  texture: THREE.Texture | null,
  options: {
    variant: ArtworkMaterialVariant;
    presentation: ArtworkFacePresentation;
    surfaceColor?: string;
    isBack?: boolean;
  },
): THREE.MeshStandardMaterial {
  const hasMap = Boolean(texture);
  const isAluminum = options.variant === 'aluminum';

  if (options.presentation === 'emissive-print' && hasMap) {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: isAluminum ? 1.0 : 0.05,
      color: '#ffffff',
      roughness: isAluminum ? 0.95 : 0.85,
      metalness: 0,
      toneMapped: false,
    });
  }

  if (hasMap) {
    return new THREE.MeshStandardMaterial({
      map: texture,
      color: '#ffffff',
      roughness: isAluminum ? 0.55 : 0.75,
      metalness: isAluminum ? 0.05 : 0,
      toneMapped: true,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: options.surfaceColor ?? (options.isBack ? '#1a1a1a' : '#f4f4f5'),
    roughness: isAluminum ? 0.4 : 0.85,
    metalness: isAluminum ? 0.65 : 0.1,
    toneMapped: true,
  });
}

export function createBoxMaterials(
  frontTexture: THREE.Texture | null,
  backTexture: THREE.Texture | null,
  options: {
    variant: ArtworkMaterialVariant;
    presentation: ArtworkFacePresentation;
    frontSurfaceColor?: string;
  },
): THREE.MeshStandardMaterial[] {
  const edge = createEdgeMaterial(options.variant);
  const front = createFaceMaterial(frontTexture, {
    variant: options.variant,
    presentation: options.presentation,
    surfaceColor: options.frontSurfaceColor,
  });
  const back = createFaceMaterial(backTexture, {
    variant: options.variant,
    presentation: options.presentation,
    isBack: true,
  });

  return [edge, edge, edge, edge, front, back];
}

/** Instance-owned materials — dispose on unmount/replace; never disposes shared map textures */
export function disposeArtworkMaterials(materials: THREE.Material[] | THREE.Material | null | undefined): void {
  if (!materials) return;
  const list = Array.isArray(materials) ? materials : [materials];
  list.forEach((material) => material.dispose());
}
