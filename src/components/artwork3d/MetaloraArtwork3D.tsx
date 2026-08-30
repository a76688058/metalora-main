import React, { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import ArtworkReactiveLighting from './ArtworkReactiveLighting';
import ArtworkSceneLighting from './ArtworkSceneLighting';
import { createBoxMaterials, createFaceMaterial, disposeArtworkMaterials } from './materials';
import {
  ALUMINUM_THICKNESS,
  LEGACY_THIN_THICKNESS,
  QUALITY_ANISOTROPY,
  type MetaloraArtwork3DProps,
} from './types';
import {
  cloneArtworkTexture,
  computePhotoPlaneScale,
  configureArtworkTexture,
  resolveAnisotropy,
  resolveDimensions,
} from './textureUtils';
import { useArtworkMotion } from './useArtworkMotion';

function MetaloraArtwork3D({
  frontTextureUrl,
  backTextureUrl,
  width = 1,
  height = 1.414,
  orientation = 'portrait',
  thickness,
  materialVariant = 'aluminum',
  layoutMode = 'cover',
  facePresentation = 'standard',
  interactionMode = 'subtle',
  interactive = false,
  autoRotate = false,
  quality = 'high',
  includeSceneLighting = false,
  environmentIntensity = 0.3,
  baseScale = 1,
  frontSurfaceColor,
  externalStateRef,
  enablePointerFlip = true,
  enableDeviceOrientation = false,
  usePhotoPlane = false,
  nonInteractiveMotion = 'idle-tilt',
  children,
}: MetaloraArtwork3DProps) {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const { finalWidth, finalHeight, targetAspect } = resolveDimensions(width, height, orientation);
  const depth =
    thickness ??
    (materialVariant === 'aluminum' ? ALUMINUM_THICKNESS : LEGACY_THIN_THICKNESS * 5);

  const textureUrls = useMemo(
    () => [frontTextureUrl, ...(backTextureUrl ? [backTextureUrl] : [])],
    [frontTextureUrl, backTextureUrl],
  );

  const cachedTextures = useTexture(textureUrls);
  const effectiveAnisotropy = resolveAnisotropy(QUALITY_ANISOTROPY[quality], maxAnisotropy);

  const instanceTextures = useMemo(() => {
    const frontSource = cachedTextures[0] ?? null;
    const backSource = backTextureUrl ? cachedTextures[1] ?? null : null;
    return {
      front: frontSource ? cloneArtworkTexture(frontSource) : null,
      back: backSource ? cloneArtworkTexture(backSource) : null,
    };
  }, [cachedTextures, backTextureUrl]);

  const frontTexture = instanceTextures.front;
  const backTexture = instanceTextures.back;

  useEffect(() => {
    [frontTexture, backTexture].forEach((tex) => {
      if (!tex) return;
      configureArtworkTexture(tex, { targetAspect, layoutMode, anisotropy: effectiveAnisotropy });
    });
  }, [frontTexture, backTexture, targetAspect, layoutMode, effectiveAnisotropy]);

  useEffect(() => {
    const { front, back } = instanceTextures;
    return () => {
      front?.dispose();
      back?.dispose();
    };
  }, [instanceTextures]);

  const resolvedInteractionMode = interactive ? 'inspect' : interactionMode;
  const resolvedAutoRotate = autoRotate || (!interactive && interactionMode === 'subtle');

  const { groupRef, meshRef, onPointerOver, onPointerOut, onClick } = useArtworkMotion({
    interactionMode: resolvedInteractionMode,
    interactive,
    autoRotate: resolvedAutoRotate,
    baseScale,
    enablePointerFlip,
    enableDeviceOrientation,
    nonInteractiveMotion,
    externalStateRef,
  });

  const boxMaterials = useMemo(
    () =>
      createBoxMaterials(usePhotoPlane ? null : frontTexture, backTexture, {
        variant: materialVariant,
        presentation: facePresentation,
        frontSurfaceColor,
      }),
    [frontTexture, backTexture, materialVariant, facePresentation, frontSurfaceColor, usePhotoPlane],
  );

  const photoMaterial = useMemo(() => {
    if (!usePhotoPlane || !frontTexture) return null;
    return createFaceMaterial(frontTexture, {
      variant: materialVariant,
      presentation: facePresentation,
    });
  }, [usePhotoPlane, frontTexture, materialVariant, facePresentation]);

  useEffect(() => {
    const materials = boxMaterials;
    const photo = photoMaterial;
    return () => {
      disposeArtworkMaterials(materials);
      disposeArtworkMaterials(photo);
    };
  }, [boxMaterials, photoMaterial]);

  const photoScale = useMemo((): [number, number, number] => {
    if (!usePhotoPlane || layoutMode === 'cover' || !frontTexture?.image) {
      return [1, 1, 1];
    }
    const img = frontTexture.image as HTMLImageElement;
    return computePhotoPlaneScale(img.width / img.height, targetAspect);
  }, [usePhotoPlane, layoutMode, frontTexture, targetAspect]);

  return (
    <>
      {includeSceneLighting ? (
        <ArtworkSceneLighting environmentIntensity={environmentIntensity} />
      ) : null}
      {includeSceneLighting && externalStateRef ? (
        <ArtworkReactiveLighting externalStateRef={externalStateRef} />
      ) : null}

      <group ref={groupRef}>
        <mesh
          ref={meshRef}
          material={boxMaterials}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          castShadow={usePhotoPlane}
          receiveShadow={usePhotoPlane}
        >
          <boxGeometry args={[finalWidth, finalHeight, depth]} />

          {children}

          {usePhotoPlane && photoMaterial ? (
            <mesh position={[0, 0, depth / 2 + 0.001]} scale={photoScale} material={photoMaterial}>
              <planeGeometry args={[finalWidth, finalHeight]} />
            </mesh>
          ) : null}
        </mesh>
      </group>
    </>
  );
}

export default React.memo(MetaloraArtwork3D);
