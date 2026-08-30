import { useEffect, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArtworkExternalStateRef, ArtworkInteractionMode } from './types';

export interface ArtworkMotionOptions {
  interactionMode: ArtworkInteractionMode;
  interactive: boolean;
  autoRotate: boolean;
  baseScale: number;
  enablePointerFlip: boolean;
  enableDeviceOrientation: boolean;
  /** Poster3D legacy: non-interactive views always rotate unless autoRotate explicitly false and this is idle */
  nonInteractiveMotion?: 'rotate' | 'idle-tilt';
  externalStateRef?: ArtworkExternalStateRef;
}

export interface ArtworkMotionRefs {
  groupRef: React.RefObject<THREE.Group | null>;
  meshRef: React.RefObject<THREE.Mesh | null>;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

export function useArtworkMotion(options: ArtworkMotionOptions): ArtworkMotionRefs {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const pointerRef = useRef({ hovered: false, active: false });
  const deviceTiltRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!options.enableDeviceOrientation) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (options.interactive || options.autoRotate) return;
      if (e.beta === null || e.gamma === null) return;

      const maxTilt = Math.PI / 12;
      deviceTiltRef.current = {
        x: THREE.MathUtils.clamp((e.beta - 45) * (Math.PI / 180), -maxTilt, maxTilt),
        y: THREE.MathUtils.clamp(e.gamma * (Math.PI / 180), -maxTilt, maxTilt),
      };
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [options.enableDeviceOrientation, options.interactive, options.autoRotate]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    const external = options.externalStateRef?.current;
    const pointer = pointerRef.current;

    const flipTarget =
      external?.flipProgress !== undefined
        ? external.flipProgress * Math.PI
        : pointer.active
          ? Math.PI
          : 0;

    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, flipTarget, delta * 5);

    const scaleTarget =
      (external?.scale ?? 1) * (pointer.active ? 1.1 : 1) * options.baseScale;
    const currentScale = group.scale.x;
    group.scale.setScalar(THREE.MathUtils.lerp(currentScale, scaleTarget, delta * 5));

    if (external?.rotationX !== undefined || external?.rotationY !== undefined) {
      if (external.rotationX !== undefined) {
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, external.rotationX, delta * 6);
      }
      if (external.rotationY !== undefined) {
        mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, external.rotationY, delta * 6);
      }
      return;
    }

    if (options.interactive) {
      mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, delta * 5);
      mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, 0, delta * 5);
      return;
    }

    const shouldAutoRotate =
      options.autoRotate ||
      options.interactionMode === 'subtle' ||
      options.nonInteractiveMotion === 'rotate';

    if (shouldAutoRotate) {
      mesh.rotation.y += delta * (options.autoRotate ? 0.5 : 0.35);
      mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, delta * 5);
      return;
    }

    let targetX = external?.tiltX ?? deviceTiltRef.current.x;
    let targetY = external?.tiltY ?? deviceTiltRef.current.y;

    if (pointer.hovered && !('ontouchstart' in window)) {
      targetY = (state.mouse.x * Math.PI) / 8;
      targetX = -(state.mouse.y * Math.PI) / 8;
    }

    if (external?.inspectionProgress !== undefined) {
      const p = external.inspectionProgress;
      targetX = THREE.MathUtils.lerp(0, targetX, p);
      targetY = THREE.MathUtils.lerp(0, targetY, p);
    }

    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, targetY, delta * 5);
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetX, delta * 5);
  });

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    const allowPointerTilt =
      options.interactive ||
      options.interactionMode !== 'static' ||
      options.nonInteractiveMotion === 'idle-tilt';
    if (!allowPointerTilt) return;
    e.stopPropagation();
    pointerRef.current.hovered = true;
  };

  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    const allowPointerTilt =
      options.interactive ||
      options.interactionMode !== 'static' ||
      options.nonInteractiveMotion === 'idle-tilt';
    if (!allowPointerTilt) return;
    e.stopPropagation();
    pointerRef.current.hovered = false;
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!options.enablePointerFlip || !options.interactive) return;
    e.stopPropagation();
    pointerRef.current.active = !pointerRef.current.active;
  };

  return {
    groupRef,
    meshRef,
    onPointerOver,
    onPointerOut,
    onClick,
  };
}
