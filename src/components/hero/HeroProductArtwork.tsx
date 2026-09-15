import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createBoxMaterials, disposeArtworkMaterials } from '../artwork3d/materials';
import { cloneArtworkTexture, configureArtworkTexture } from '../artwork3d/textureUtils';
import { HERO_CONTACT_SHADOW, HERO_PANEL_WALL_OFFSET } from './backdropAsset';
import HeroLightHighlight from './HeroLightHighlight';
import type { HeroIntegrationChannels } from './heroIntegration';
import { resolveHeroArtworkDimensions } from './heroArtworkDimensions';
import { getHeroSoftShadowTexture } from './softShadowTexture';
import type { HeroProductSelection } from './useHeroProduct';

interface HeroProductArtworkProps {
  heroProduct: HeroProductSelection;
  channelsRef: React.MutableRefObject<HeroIntegrationChannels>;
  artworkSizeRef: React.MutableRefObject<{ width: number; height: number; aspect: number }>;
}

/**
 * Same physical product identity as PDP LIVE 3D PREVIEW:
 * A4-ratio box, cover UV crop, thickness 0.008, aluminum + emissive-print.
 */
export default function HeroProductArtwork({
  heroProduct,
  channelsRef,
  artworkSizeRef,
}: HeroProductArtworkProps) {
  const [sourceTexture, setSourceTexture] = useState<THREE.Texture | null>(null);
  const faceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const shadowMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const panelRef = useRef<THREE.Mesh>(null);

  const slabDimensions = useMemo(
    () => resolveHeroArtworkDimensions(heroProduct.orientation),
    [heroProduct.orientation],
  );

  useEffect(() => {
    artworkSizeRef.current = {
      width: slabDimensions.width,
      height: slabDimensions.height,
      aspect: slabDimensions.aspect,
    };
  }, [artworkSizeRef, slabDimensions.width, slabDimensions.height, slabDimensions.aspect]);

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      heroProduct.frontTextureUrl,
      (texture) => {
        if (!alive) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        loaded = texture;
        setSourceTexture(texture);
      },
      undefined,
      () => {
        if (alive) setSourceTexture(null);
      },
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [heroProduct.frontTextureUrl]);

  const frontTexture = useMemo(
    () => (sourceTexture ? cloneArtworkTexture(sourceTexture) : null),
    [sourceTexture],
  );

  useEffect(() => {
    if (!frontTexture) return;
    // Same fit as Poster3D LIVE 3D PREVIEW
    configureArtworkTexture(frontTexture, {
      targetAspect: slabDimensions.aspect,
      layoutMode: 'cover',
      anisotropy: 4,
    });
  }, [frontTexture, slabDimensions.aspect]);

  const boxMaterials = useMemo(() => {
    if (!frontTexture) return null;
    return createBoxMaterials(frontTexture, null, {
      variant: 'aluminum',
      presentation: 'emissive-print',
    });
  }, [frontTexture]);

  const shadowTexture = useMemo(() => getHeroSoftShadowTexture(), []);

  useEffect(() => {
    // Front face is materials[4] in createBoxMaterials order
    faceMatRef.current = (boxMaterials?.[4] as THREE.MeshStandardMaterial) ?? null;
    return () => {
      if (boxMaterials) disposeArtworkMaterials(boxMaterials);
    };
  }, [boxMaterials]);

  useFrame(() => {
    const ch = channelsRef.current;
    const mat = faceMatRef.current;
    const shadowMat = shadowMatRef.current;
    const shadow = shadowRef.current;
    const panel = panelRef.current;

    if (mat) {
      const sweep = ch.lightSweep;
      const band = ch.lightBandStrength;
      const holdRichness = ch.richnessLight * (1 - sweep * 0.25);
      // HOLD baseline; LIGHT adds visible but premium response
      mat.emissiveIntensity =
        THREE.MathUtils.lerp(0.7, 0.8, holdRichness) + sweep * 0.12 + band * 0.22;
      mat.roughness =
        THREE.MathUtils.lerp(0.94, 0.86, holdRichness) - sweep * 0.1 - band * 0.08;
      mat.metalness = THREE.MathUtils.lerp(0.04, 0.08, sweep + band * 0.35);
    }

    if (panel) {
      panel.visible = true;
    }

    if (shadowMat && shadow) {
      const strength = ch.contactShadowStrength;
      const sweep = ch.lightSweep * 0.2;
      shadow.position.set(
        HERO_CONTACT_SHADOW.offsetX - ch.artworkYaw * 0.08,
        HERO_CONTACT_SHADOW.offsetY - ch.artworkTiltX * 0.05,
        HERO_CONTACT_SHADOW.offsetZ,
      );
      shadowMat.opacity = 0.16 + strength * 0.28 + sweep * 0.04;
      shadow.scale.set(
        slabDimensions.width * (1.10 + strength * 0.05),
        slabDimensions.height * (1.08 + strength * 0.04),
        1,
      );
    }

    if (boxMaterials) {
      for (const m of boxMaterials) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.opacity = 1;
          m.transparent = false;
          m.depthWrite = true;
        }
      }
    }
  });

  const { width, height, thickness } = slabDimensions;

  if (!boxMaterials) return null;

  return (
    <group>
      <mesh
        ref={shadowRef}
        position={[HERO_CONTACT_SHADOW.offsetX, HERO_CONTACT_SHADOW.offsetY, HERO_CONTACT_SHADOW.offsetZ]}
        renderOrder={-1}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={shadowMatRef}
          map={shadowTexture}
          transparent
          opacity={0.2}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={panelRef}
        position={[0, 0, -thickness * 0.5 + HERO_PANEL_WALL_OFFSET * 0.1]}
        material={boxMaterials}
        castShadow
        receiveShadow
        renderOrder={1}
      >
        <boxGeometry args={[width, height, thickness]} />
      </mesh>
      <HeroLightHighlight
        channelsRef={channelsRef}
        width={width}
        height={height}
        thickness={thickness}
        wallOffset={HERO_PANEL_WALL_OFFSET}
      />
    </group>
  );
}
