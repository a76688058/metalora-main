import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';

import { useFrame, useThree } from '@react-three/fiber';

import { Environment } from '@react-three/drei';

import * as THREE from 'three';

import { HERO_FIXED_CAMERA, HERO_PANEL_WALL_OFFSET } from './backdropAsset';

import type { HeroIntegrationChannels } from './heroIntegration';
import {
  computeArtworkMountScale,
  evaluateHeroIntegrationInto,
  getWallAnchorNorm,
  screenNormToWorld,
  worldToScreenNorm,
} from './heroIntegration';

import HeroProductArtwork from './HeroProductArtwork';

import type { HeroSpatialSceneProps } from './types';

function HeroSceneLighting({
  theme,
  channelsRef,
  lightSweepRef,
}: {
  theme: 'light' | 'dark';
  channelsRef: React.MutableRefObject<HeroIntegrationChannels>;
  lightSweepRef: React.MutableRefObject<number>;
}) {
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  const sweepRef = useRef<THREE.DirectionalLight>(null);
  const isDark = theme === 'dark';

  useFrame(() => {
    const ch = channelsRef.current;
    const sweep = lightSweepRef.current;
    const richness = ch.richnessLight;

    if (keyRef.current) {
      keyRef.current.intensity = 0.48 + richness * 0.22;
    }
    if (fillRef.current) {
      fillRef.current.intensity = 0.14 + richness * 0.08;
    }
    if (sweepRef.current) {
      const band = ch.lightBandStrength;
      // Broad window daylight — complements face shader band
      sweepRef.current.intensity =
        0.01 + sweep * 0.48 * Math.max(richness, 0.3) + band * 0.35;
      sweepRef.current.position.set(
        THREE.MathUtils.lerp(3.6, -0.4, sweep + band * 0.15),
        THREE.MathUtils.lerp(0.32, 0.5, sweep),
        2.5,
      );
    }
  });

  return (
    <>
      <ambientLight intensity={isDark ? 0.32 : 0.52} color={isDark ? '#e8e4df' : '#f3ece4'} />
      <directionalLight ref={keyRef} position={[4.2, 1.8, 3.2]} intensity={0.58} color="#fff0e0" />
      <directionalLight ref={fillRef} position={[-2.5, 0.4, 2]} intensity={0.18} color="#e6eaef" />
      <directionalLight ref={sweepRef} position={[2, 0.5, 2]} intensity={0.04} color="#fff6ee" />
      <Suspense fallback={null}>
        <Environment preset="apartment" environmentIntensity={isDark ? 0.18 : 0.32} />
      </Suspense>
    </>
  );
}

export default function HeroSpatialScene({
  spatialProgressRef,
  quality,
  theme,
  reducedMotion,
  heroProduct,
  commerceBoundsRef,
}: HeroSpatialSceneProps) {
  const artworkMountRef = useRef<THREE.Group>(null);
  const { camera, invalidate, size } = useThree();

  const channelsRef = useRef<HeroIntegrationChannels>({
    cameraApproachScale: 1,
    artworkEmphasisScale: 1,
    backdropTranslateX: 0,
    backdropTranslateY: 0,
    roomDim: 0,
    roomOpacity: 1,
    artworkYaw: 0,
    artworkTiltX: 0,
    lightSweep: 0,
    richnessLight: 0,
    lightArc: 0,
    lightBandCenter: 0.92,
    lightBandWidth: 0.38,
    lightBandStrength: 0,
    contactShadowStrength: 0.35,
    artworkMountScale: 1,
    exitLift: 0,
    exitOpacity: 1,
    exitScale: 1,
    commerceScreenX: 0.5,
    commerceScreenY: 0.55,
    commerceScreenW: 0.2,
    commerceScreenH: 0.35,
    roomParallax: 0,
    foregroundParallax: 0,
    backdropShiftX: 0,
    backdropShiftY: 0,
    backdropScale: 1,
  });

  const lightSweepRef = useRef(0);
  const artworkSizeRef = useRef({ width: 1, height: 1.414, aspect: 1 / 1.414 });
  const _corner = useRef(new THREE.Vector3());
  const _euler = useRef(new THREE.Euler());

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.position.set(...HERO_FIXED_CAMERA.position);
    camera.lookAt(0, 0, 0);
    camera.fov = HERO_FIXED_CAMERA.fov;
    camera.near = HERO_FIXED_CAMERA.near;
    camera.far = HERO_FIXED_CAMERA.far;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.width, size.height]);

  useEffect(() => {
    invalidate();
  }, [invalidate, theme, quality, heroProduct.frontTextureUrl, heroProduct.orientation]);

  useFrame(() => {
    const p = reducedMotion ? 0 : spatialProgressRef.current.heroStoryProgress;
    evaluateHeroIntegrationInto(p, channelsRef.current);
    const ch = channelsRef.current;

    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const anchor = getWallAnchorNorm();
    const worldPos = screenNormToWorld(anchor.x, anchor.y, camera, 0);

    const mount = artworkMountRef.current;
    if (mount) {
      const { width, height, aspect } = artworkSizeRef.current;
      const uniformScale = computeArtworkMountScale(camera, {
        slabWidth: width,
        slabHeight: height,
        aspect,
        mountScale: ch.artworkMountScale,
        anchorY: anchor.y,
      });

      mount.position.set(worldPos.x, worldPos.y, HERO_PANEL_WALL_OFFSET);
      mount.rotation.y = ch.artworkYaw;
      mount.rotation.x = ch.artworkTiltX;
      mount.scale.setScalar(uniformScale);

      // Project rotated artwork bounds → screen-space AABB for commerce alignment
      const halfW = width * uniformScale * 0.5;
      const halfH = height * uniformScale * 0.5;
      const centerY = worldPos.y;
      const panelZ = HERO_PANEL_WALL_OFFSET;

      _euler.current.set(ch.artworkTiltX, ch.artworkYaw, 0, 'XYZ');
      const localCorners: [number, number][] = [
        [-halfW, -halfH],
        [halfW, -halfH],
        [-halfW, halfH],
        [halfW, halfH],
      ];

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const [lx, ly] of localCorners) {
        _corner.current.set(lx, ly, 0);
        _corner.current.applyEuler(_euler.current);
        _corner.current.x += worldPos.x;
        _corner.current.y += centerY;
        _corner.current.z = panelZ;

        const screen = worldToScreenNorm(_corner.current, camera);
        minX = Math.min(minX, screen.x);
        maxX = Math.max(maxX, screen.x);
        minY = Math.min(minY, screen.y);
        maxY = Math.max(maxY, screen.y);
      }

      const screenCenterX = (minX + maxX) * 0.5;
      const screenCenterY = (minY + maxY) * 0.5;
      const screenW = Math.max(maxX - minX, 0.2);
      const screenH = Math.max(maxY - minY, 0.35);

      ch.commerceScreenX = screenCenterX;
      ch.commerceScreenY = screenCenterY;
      ch.commerceScreenW = screenW;
      ch.commerceScreenH = screenH;

      if (commerceBoundsRef) {
        commerceBoundsRef.current = {
          x: screenCenterX,
          y: screenCenterY,
          w: screenW,
          h: screenH,
        };
      }
    }

    lightSweepRef.current = ch.lightSweep;
  });

  return (
    <>
      <HeroSceneLighting
        theme={theme}
        channelsRef={channelsRef}
        lightSweepRef={lightSweepRef}
      />
      <group ref={artworkMountRef}>
        <HeroProductArtwork
          heroProduct={heroProduct}
          channelsRef={channelsRef}
          artworkSizeRef={artworkSizeRef}
        />
      </group>
    </>
  );
}
