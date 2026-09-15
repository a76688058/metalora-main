import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  HERO_ROOM_BACKDROP_ASPECT,
  HERO_ROOM_BACKDROP_LAYOUT,
  HERO_ROOM_BACKDROP_PRIMARY,
} from './backdropAsset';
import type { HeroChoreographyChannels } from './choreography';

function createArchitecturalFallbackTexture(isDark: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  const wallGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (isDark) {
    wallGrad.addColorStop(0, '#2a2d32');
    wallGrad.addColorStop(0.55, '#1e2126');
    wallGrad.addColorStop(1, '#14161a');
  } else {
    wallGrad.addColorStop(0, '#ebe6df');
    wallGrad.addColorStop(0.5, '#ddd6cd');
    wallGrad.addColorStop(1, '#cfc6bb');
  }
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const windowGlow = ctx.createRadialGradient(780, 180, 20, 780, 180, 280);
  windowGlow.addColorStop(0, isDark ? 'rgba(255,248,235,0.18)' : 'rgba(255,252,245,0.55)');
  windowGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = windowGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const floorGrad = ctx.createLinearGradient(0, canvas.height * 0.62, 0, canvas.height);
  floorGrad.addColorStop(0, 'rgba(0,0,0,0)');
  floorGrad.addColorStop(1, isDark ? 'rgba(0,0,0,0.35)' : 'rgba(80,70,60,0.12)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, canvas.height * 0.55, canvas.width, canvas.height * 0.45);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyCoverTexture(
  texture: THREE.Texture,
  planeAspect: number,
  imageAspect: number,
  offsetX: number,
  offsetY: number,
): void {
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  if (imageAspect > planeAspect) {
    const repeatX = planeAspect / imageAspect;
    texture.repeat.set(repeatX, 1);
    texture.offset.set((1 - repeatX) / 2 + offsetX, offsetY);
  } else {
    const repeatY = imageAspect / planeAspect;
    texture.repeat.set(1, repeatY);
    texture.offset.set(offsetX, (1 - repeatY) / 2 + offsetY);
  }
}

let sharedRoomTexture: THREE.Texture | null = null;
let sharedRoomTexturePromise: Promise<THREE.Texture> | null = null;

export function loadSharedRoomTexture(): Promise<THREE.Texture> {
  const planeWidth = HERO_ROOM_BACKDROP_LAYOUT.planeWidth;
  const planeHeight = planeWidth / HERO_ROOM_BACKDROP_ASPECT;

  if (sharedRoomTexture) {
    applyCoverTexture(
      sharedRoomTexture,
      planeWidth / planeHeight,
      HERO_ROOM_BACKDROP_ASPECT,
      HERO_ROOM_BACKDROP_LAYOUT.coverOffsetX,
      HERO_ROOM_BACKDROP_LAYOUT.coverOffsetY,
    );
    sharedRoomTexture.needsUpdate = true;
    return Promise.resolve(sharedRoomTexture);
  }
  if (!sharedRoomTexturePromise) {
    sharedRoomTexturePromise = new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        HERO_ROOM_BACKDROP_PRIMARY,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          const planeWidth = HERO_ROOM_BACKDROP_LAYOUT.planeWidth;
          const planeHeight = planeWidth / HERO_ROOM_BACKDROP_ASPECT;
          applyCoverTexture(
            texture,
            planeWidth / planeHeight,
            HERO_ROOM_BACKDROP_ASPECT,
            HERO_ROOM_BACKDROP_LAYOUT.coverOffsetX,
            HERO_ROOM_BACKDROP_LAYOUT.coverOffsetY,
          );
          texture.needsUpdate = true;
          sharedRoomTexture = texture;
          resolve(texture);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }
  return sharedRoomTexturePromise;
}

interface BackdropBaseProps {
  theme: 'light' | 'dark';
  channelsRef: React.MutableRefObject<HeroChoreographyChannels>;
  onReady?: () => void;
}

function FallbackRoomBackdrop({ theme, channelsRef, onReady }: BackdropBaseProps) {
  const isDark = theme === 'dark';
  const groupRef = useRef<THREE.Group>(null);
  const wallMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const floorMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const texture = useMemo(() => createArchitecturalFallbackTexture(isDark), [isDark]);
  const readySent = useRef(false);
  const { invalidate } = useThree();

  useFrame(() => {
    if (!readySent.current) {
      readySent.current = true;
      onReady?.();
      invalidate();
    }

    const ch = channelsRef.current;
    const group = groupRef.current;
    const wallMat = wallMaterialRef.current;
    const floorMat = floorMaterialRef.current;
    if (!group || !wallMat || !floorMat) return;

    const parallaxX = ch.backdropShiftX + ch.roomParallax * -0.12;
    const parallaxY = ch.backdropShiftY;
    const dim = ch.roomDim * 0.35;

    group.position.set(parallaxX, parallaxY, HERO_ROOM_BACKDROP_LAYOUT.baseZ);
    group.scale.setScalar(ch.backdropScale);

    wallMat.opacity = ch.roomOpacity;
    wallMat.color.setScalar(1 - dim * 0.25);
    floorMat.opacity = ch.roomOpacity * 0.85;
  }, 2);

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.05, 0]}>
        <planeGeometry args={[9.2, 5.8]} />
        <meshBasicMaterial ref={wallMaterialRef} map={texture} transparent toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.55, 1.1]}>
        <planeGeometry args={[8.5, 4.5]} />
        <meshBasicMaterial
          ref={floorMaterialRef}
          color={isDark ? '#0e1012' : '#c4bcb3'}
          transparent
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

interface BakedRoomBackdropInnerProps {
  channelsRef: React.MutableRefObject<HeroChoreographyChannels>;
  texture: THREE.Texture;
  onReady?: () => void;
}

/** Stable baked room — texture lives outside Suspense/useTexture lifecycle */
function BakedRoomBackdropInner({ channelsRef, texture, onReady }: BakedRoomBackdropInnerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const { invalidate } = useThree();
  const readySent = useRef(false);

  const planeWidth = HERO_ROOM_BACKDROP_LAYOUT.planeWidth;
  const planeHeight = planeWidth / HERO_ROOM_BACKDROP_ASPECT;

  useFrame(() => {
    if (!readySent.current) {
      readySent.current = true;
      onReady?.();
      invalidate();
    }

    const ch = channelsRef.current;
    const group = groupRef.current;
    const mat = materialRef.current;
    if (!group || !mat) return;

    const parallaxX = ch.backdropShiftX + ch.roomParallax * -0.1;
    const parallaxY = ch.backdropShiftY + HERO_ROOM_BACKDROP_LAYOUT.baseY;
    const dim = ch.roomDim * 0.38;

    group.position.set(parallaxX, parallaxY, HERO_ROOM_BACKDROP_LAYOUT.baseZ);
    group.scale.setScalar(ch.backdropScale);

    mat.opacity = ch.roomOpacity;
    const tone = 1 - dim * 0.24;
    mat.color.setRGB(tone, tone * 0.99, tone * 0.97);
  }, 2);

  return (
    <group ref={groupRef}>
      <mesh renderOrder={-2}>
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          transparent
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

interface BakedRoomBackdropPersistentProps {
  channelsRef: React.MutableRefObject<HeroChoreographyChannels>;
  theme: 'light' | 'dark';
  onReady: () => void;
}

function BakedRoomBackdropPersistent({
  channelsRef,
  theme,
  onReady,
}: BakedRoomBackdropPersistentProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(sharedRoomTexture);
  const [failed, setFailed] = useState(false);
  const { invalidate } = useThree();

  useEffect(() => {
    let alive = true;
    loadSharedRoomTexture()
      .then((tex) => {
        if (!alive) return;
        setTexture(tex);
        invalidate();
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [invalidate]);

  if (failed) {
    return <FallbackRoomBackdrop theme={theme} channelsRef={channelsRef} onReady={onReady} />;
  }

  if (!texture) {
    return <FallbackRoomBackdrop theme={theme} channelsRef={channelsRef} />;
  }

  return (
    <BakedRoomBackdropInner
      channelsRef={channelsRef}
      texture={texture}
      onReady={onReady}
    />
  );
}

interface BakedRoomBackdropWithFallbackProps extends BackdropBaseProps {
  onBakedRoomReady?: () => void;
}

function BakedRoomBackdropWithFallback({
  theme,
  channelsRef,
  onBakedRoomReady,
}: BakedRoomBackdropWithFallbackProps) {
  const handleReady = useCallback(() => {
    onBakedRoomReady?.();
  }, [onBakedRoomReady]);

  return (
    <BakedRoomBackdropPersistent
      theme={theme}
      channelsRef={channelsRef}
      onReady={handleReady}
    />
  );
}

interface HeroRoomBackdropProps {
  theme: 'light' | 'dark';
  channelsRef: React.MutableRefObject<HeroChoreographyChannels>;
  useBakedRoom: boolean;
  onBakedRoomReady?: () => void;
}

export default function HeroRoomBackdrop({
  theme,
  channelsRef,
  useBakedRoom,
  onBakedRoomReady,
}: HeroRoomBackdropProps) {
  if (useBakedRoom) {
    return (
      <BakedRoomBackdropWithFallback
        theme={theme}
        channelsRef={channelsRef}
        onBakedRoomReady={onBakedRoomReady}
      />
    );
  }
  return <FallbackRoomBackdrop theme={theme} channelsRef={channelsRef} onReady={onBakedRoomReady} />;
}
