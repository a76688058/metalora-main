import React, { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

import {
  MetaloraArtwork3D,
  type ArtworkExternalState,
  type ArtworkExternalStateRef,
  type ArtworkOrientation,
} from '../artwork3d';
import { usePdpQualityTier } from './usePdpQualityTier';
import { createStoryAluminumMaterial, createStoryPrintMaterial } from './story/storyAluminum';
import { PdpStoryRimSignature } from './story/edgeRimLights';
import { MAGNETIC_CALLOUT } from './story/constants';
import { SurfaceSweepPlane } from './story/surfaceSweepPlane';
import type { SurfaceSweepVisual } from './story/surfaceSweep';
import {
  PdpStoryAnatomyWorld,
  PdpStoryArtMagnet,
  STORY_ANATOMY_IDLE,
  type StoryAnatomyView,
} from './story/magneticAnatomy';

/** A4-relative aluminum depth: 1.15mm / 210mm. */
export const PDP_PANEL_THICKNESS = 0.0055;

/** Framing multiplier so an A4 slab fills the theatre camera. */
export const PDP_FRAME_SCALE = 1.8;

export const PDP_CAMERA = {
  position: [0, 0, 3.5] as [number, number, number],
  fov: 40,
};

/** Limited panel inspect — not free tumble. */
export const PDP_INSPECT_MAX_PITCH = Math.PI / 7;
export const PDP_INSPECT_MAX_YAW = Math.PI / 5;

const PDP_A4_WIDTH = 1;
const PDP_A4_HEIGHT = 1.414;
const PDP_ABANDON_MS = 12000;
const PDP_LERP_PULSE_MS = 800;

export type PdpSpatialStatus = 'pending' | 'ready' | 'failed';

/** `limited` = existing ±π/5 yaw ±π/7 pitch. `continuous` = unclamped yaw/pitch for viewer drag. */
export type PdpInspectRotationMode = 'limited' | 'continuous';
export type PdpLightingMode = 'studio' | 'grazing';

export interface PdpSpatialCanvasProps {
  frontTextureUrl: string;
  backTextureUrl?: string | null;
  orientation?: ArtworkOrientation;
  /** Face width in world units. Default 1 = 210mm (Theatre). */
  panelWidth?: number;
  /** Face height in world units. Default 1.414 = 297mm (Theatre). */
  panelHeight?: number;
  /** Slab depth in world units. Default 0.0055 = 1.15mm. Not derived from face size. */
  panelThickness?: number;
  /** A4-relative panel scale. 1 = A4 short side. */
  scale?: number;
  /** Inspection pitch in radians. Clamped only in `limited` mode. */
  rotationX?: number;
  /** Inspection yaw in radians. Clamped only in `limited` mode. */
  rotationY?: number;
  /**
   * `limited` (default) preserves current callers.
   * `continuous` does not clamp; yaw may pass π so the reverse face is reachable by drag.
   */
  inspectRotationMode?: PdpInspectRotationMode;
  /** 0 = face, 1 = reverse. Ignored when no real back texture. Separate from inspect yaw. */
  flipProgress?: number;
  /** `studio` preserves Theatre lighting. `grazing` is PDP-004 SURFACE only. */
  lightingMode?: PdpLightingMode;
  /**
   * 0 = studio, 1 = grazing. Used only when `storyVisualFinish` is omitted.
   * Theatre omits this and keeps the lightingMode switch.
   */
  grazingMix?: number;
  /**
   * 0 = SURFACE metal quiet, 1 = EDGE key. Story-only; scales world-space metal lights.
   * Theatre omits this.
   */
  edgeMix?: number;
  /** Story EDGE-only. 0–1 rim catch. Theatre omits this. */
  edgeRimMix?: number;
  /** Story EDGE-only. 0–1 position of the traveling specular along the long edge. */
  edgeSweep?: number;
  /** Story EDGE-only. Tiny peak glint. Theatre omits this. */
  edgeGlint?: number;
  /** Default 0.1. Story macro passes a smaller near plane so 0.0055 geometry is not clipped. */
  cameraNear?: number;
  /**
   * Story-only: unlit color-faithful print + PBR aluminum edge/reverse.
   * Theatre / Viewer omit this.
   */
  storyVisualFinish?: boolean;
  /** Story MAGNETIC-only. Theatre / Viewer omit this. */
  storyAnatomy?: StoryAnatomyView;
  /**
   * Story SURFACE-only metallic light catch on the print face.
   * Theatre / Viewer / EDGE / MAGNETIC omit this.
   */
  surfaceSweep?: SurfaceSweepVisual | null;
  cameraPosition?: [number, number, number];
  cameraLookAt?: [number, number, number];
  cameraFov?: number;
  onReady?: () => void;
  onFailed?: () => void;
  className?: string;
}

export function clampPdpInspectRotation(
  rotationX: number,
  rotationY: number,
): { rotationX: number; rotationY: number } {
  return {
    rotationX: THREE.MathUtils.clamp(rotationX, -PDP_INSPECT_MAX_PITCH, PDP_INSPECT_MAX_PITCH),
    rotationY: THREE.MathUtils.clamp(rotationY, -PDP_INSPECT_MAX_YAW, PDP_INSPECT_MAX_YAW),
  };
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function PdpCameraRig({
  position,
  lookAt,
  fov,
  near,
}: {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
  near: number;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, fov, near, invalidate]);

  useFrame(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  });

  return null;
}

function PdpStoryDemandKeepalive() {
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    invalidate();
  });
  return null;
}

function PdpGrazingLights({ intensity = 1 }: { intensity?: number }) {
  const k = THREE.MathUtils.clamp(intensity, 0, 1);
  return (
    <>
      <ambientLight intensity={0.22 * k} />
      <directionalLight position={[1.8, 0.45, 1.05]} intensity={0.85 * k} color="#f4eee6" />
      <directionalLight position={[-0.15, 0.2, 2.4]} intensity={0.55 * k} color="#f2f0eb" />
      <pointLight position={[0.8, 0.4, 1.4]} intensity={0.22 * k} color="#ffffff" />
    </>
  );
}

function PdpStudioLights({ intensity = 1 }: { intensity?: number }) {
  const k = THREE.MathUtils.clamp(intensity, 0, 1);
  return (
    <>
      <ambientLight intensity={0.2 * k} />
      <directionalLight position={[5, 5, 5]} intensity={0.3 * k} />
      <directionalLight position={[-5, -5, -5]} intensity={0.15 * k} />
      <pointLight position={[0.8, 0.4, 1.4]} intensity={0.2 * k} color="#ffffff" />
    </>
  );
}

/** Panel-local rim for non-story blended inspect. Story uses world-space metal lights instead. */
function PdpPanelEdgeLights({ intensity = 1 }: { intensity?: number }) {
  const k = THREE.MathUtils.clamp(intensity, 0, 1);
  if (k < 0.001) return null;
  return (
    <>
      <directionalLight position={[4.2, 0.08, 0.55]} intensity={2.1 * k} color="#fff6ea" />
      <directionalLight position={[3.5, 1.1, 0.05]} intensity={0.85 * k} color="#ffffff" />
      <directionalLight position={[3.2, 0.15, -0.7]} intensity={0.55 * k} color="#e7eef5" />
    </>
  );
}

function PdpBlendedLights({ mix, edgeMix = 0 }: { mix: number; edgeMix?: number }) {
  const g = THREE.MathUtils.clamp(mix, 0, 1);
  const e = THREE.MathUtils.clamp(edgeMix, 0, 1);
  const studioK = (1 - g) * (1 - e * 0.35) + 0.12;
  const grazingK = g * (1 - e * 0.2);
  const envK = 0.3 * (1 - e * 0.18);
  const fillK = 0.14 * (1 - e * 0.3);
  return (
    <>
      <Environment preset="studio" environmentIntensity={envK} />
      <PdpStudioLights intensity={studioK} />
      <PdpGrazingLights intensity={grazingK} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[0.1, 0.25, 3.2]} intensity={fillK} color="#ffffff" />
    </>
  );
}

/**
 * World-space metal lights. Front print is MeshBasic and ignores these.
 * Lights stay fixed in world space so the edge specular travels as the slab yaws.
 * Macro looks along +X (world z ≈ −0.24); a +Z-only key misses that face.
 */
function PdpStoryMetalLights({ edgeMix }: { edgeMix: number }) {
  const e = THREE.MathUtils.clamp(edgeMix, 0, 1);
  const envK = 1.05 + 0.45 * e;
  const approachK = 1.15 + 0.55 * e;
  const edgeKeyK = 0.55 + 2.55 * e;
  const streakK = 0.4 + 1.35 * e;
  const reverseK = 0.28 + 0.4 * e;
  return (
    <>
      <Environment preset="studio" environmentIntensity={envK} />
      <directionalLight position={[2.45, 1.25, 2.05]} intensity={approachK} color="#fff4e6" />
      <directionalLight position={[1.75, 1.35, -0.22]} intensity={edgeKeyK} color="#fff7ee" />
      <directionalLight position={[0.95, 2.85, 0.18]} intensity={streakK} color="#ffffff" />
      <directionalLight position={[-1.55, 0.45, -1.25]} intensity={reverseK} color="#d7e1ec" />
    </>
  );
}

function readFaceMap(material: THREE.Material): THREE.Texture | null {
  if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
    return material.map;
  }
  return null;
}

function stampStoryMaterialContract(
  canvas: HTMLCanvasElement,
  applied: { bound: boolean; env: boolean },
): void {
  canvas.dataset.pdpStoryPrint = applied.bound ? 'unlit-basic' : 'pending';
  canvas.dataset.pdpStoryEdge = applied.bound ? 'physical-aluminum' : 'pending';
  canvas.dataset.pdpStoryReverse = applied.bound ? 'aluminum-8c8d91' : 'pending';
  canvas.dataset.pdpStoryEnv = applied.env ? 'yes' : 'no';
}

/**
 * Story print/edge/reverse finish, bound from inside the artwork mesh.
 *
 * `MetaloraArtwork3D` mounts `children` under its box mesh, so the anchor's parent
 * is the target by construction — no scene search, and nothing runs per frame. A
 * layout effect is ordered after r3f has applied the artwork's own `material` prop
 * in the same commit, so the swap is deterministic on every mount and reload.
 * `sourceKey` carries the inputs that can rebuild that prop, so a rebuilt artwork
 * array is always followed by a rebind instead of being discovered by polling.
 */
function PdpStoryMaterialFinish({
  enabled,
  sourceKey,
}: {
  enabled: boolean;
  sourceKey: string;
}) {
  const anchorRef = useRef<THREE.Object3D>(null);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const mesh = anchorRef.current?.parent;
    if (!enabled || !(mesh instanceof THREE.Mesh)) return undefined;

    // r3f owns this array and MetaloraArtwork3D disposes it. Borrow the front map,
    // never adopt it: the story materials are the only thing this effect owns.
    const artworkOwned = mesh.material;
    if (!Array.isArray(artworkOwned) || artworkOwned.length !== 6) return undefined;
    const map = readFaceMap(artworkOwned[4]);
    if (!map) return undefined;

    const { material: edge, maps } = createStoryAluminumMaterial();
    const { material: reverse } = createStoryAluminumMaterial({ reverse: true, maps });
    const print = createStoryPrintMaterial(map);
    // drei's Environment sits earlier in the tree, so scene.environment is already
    // committed here and the reverse never renders a frame without its env map.
    const env = scene.environment;
    if (env) {
      edge.envMap = env;
      reverse.envMap = env;
    }

    const applied = [edge, edge, edge, edge, print, reverse];
    mesh.material = applied;
    stampStoryMaterialContract(gl.domElement, { bound: true, env: Boolean(env) });
    invalidate();

    return () => {
      // Hand the mesh back only if it is still holding this binding; a rebuilt
      // artwork array arrives in the mutation phase, before this cleanup.
      if (mesh.material === applied) mesh.material = artworkOwned;
      print.dispose();
      reverse.dispose();
      edge.dispose();
      maps.normalMap.dispose();
      maps.roughnessMap.dispose();
      stampStoryMaterialContract(gl.domElement, { bound: false, env: false });
      invalidate();
    };
  }, [enabled, sourceKey, scene, gl, invalidate]);

  return <object3D ref={anchorRef} />;
}

class PdpCanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; onFailed: () => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; onFailed: () => void }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailed();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function PdpContextLossWatcher({ onFailed }: { onFailed: () => void }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      onFailed();
    };
    canvas.addEventListener('webglcontextlost', onLost, { passive: false });
    return () => canvas.removeEventListener('webglcontextlost', onLost);
  }, [gl, onFailed]);

  return null;
}

function PdpDemandDriver({
  pulseKey,
}: {
  pulseKey: string;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const pulseUntilRef = useRef(0);

  useEffect(() => {
    pulseUntilRef.current = performance.now() + PDP_LERP_PULSE_MS;
    invalidate();

    let raf = 0;
    const tick = () => {
      if (performance.now() < pulseUntilRef.current) {
        invalidate();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') invalidate();
    };
    const onFocus = () => invalidate();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [invalidate, pulseKey]);

  return null;
}

function PdpReadyReporter({
  texturesReady,
  onReady,
}: {
  texturesReady: boolean;
  onReady: () => void;
}) {
  const reportedRef = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (texturesReady && !reportedRef.current) invalidate();
  }, [texturesReady, invalidate]);

  useFrame(() => {
    if (reportedRef.current || !texturesReady) return;
    gl.render(scene, camera);
    reportedRef.current = true;
    onReady();
  });

  return null;
}

function PdpSpatialScene({
  frontTextureUrl,
  backTextureUrl,
  orientation,
  panelWidth,
  panelHeight,
  panelThickness,
  scale,
  rotationX,
  rotationY,
  flipProgress,
  inspectRotationMode,
  lightingMode,
  grazingMix,
  edgeMix,
  edgeRimMix,
  edgeSweep,
  edgeGlint,
  storyVisualFinish,
  storyAnatomy,
  surfaceSweep,
  cameraPosition,
  cameraLookAt,
  cameraFov,
  cameraNear,
  quality,
  onReady,
  onFailed,
}: {
  frontTextureUrl: string;
  backTextureUrl: string | null;
  orientation: ArtworkOrientation;
  panelWidth: number;
  panelHeight: number;
  panelThickness: number;
  scale: number;
  rotationX: number;
  rotationY: number;
  flipProgress: number;
  inspectRotationMode: PdpInspectRotationMode;
  lightingMode: PdpLightingMode;
  grazingMix: number | null;
  edgeMix: number;
  edgeRimMix: number;
  edgeSweep: number;
  edgeGlint: number;
  storyVisualFinish: boolean;
  storyAnatomy: StoryAnatomyView;
  surfaceSweep: SurfaceSweepVisual | null;
  cameraPosition: [number, number, number];
  cameraLookAt: [number, number, number] | null;
  cameraFov: number;
  cameraNear: number;
  quality: ReturnType<typeof usePdpQualityTier>['tier'];
  onReady: () => void;
  onFailed: () => void;
}) {
  const [texturesReady, setTexturesReady] = useState(false);
  const externalStateRef = useRef<ArtworkExternalState | null>(null);

  const continuous = inspectRotationMode === 'continuous';
  const blendLights = grazingMix !== null;
  const studioOn = !blendLights && lightingMode === 'studio';
  const grazingOn = !blendLights && lightingMode === 'grazing';
  const pose = continuous
    ? { rotationX, rotationY }
    : clampPdpInspectRotation(rotationX, rotationY);
  const canFlip = Boolean(backTextureUrl);
  const appliedFlip = canFlip ? clamp01(flipProgress) : 0;

  // Limited: Euler on the mesh via externalStateRef (existing callers).
  // Continuous: nested groups (world yaw, then local pitch) so yaw can pass π
  // without gimbal-locking against pitch. Mesh inspect Euler stays at 0.
  // flipProgress stays on externalStateRef and is never derived from drag yaw.
  externalStateRef.current = {
    rotationX: continuous ? 0 : pose.rotationX,
    rotationY: continuous ? 0 : pose.rotationY,
    flipProgress: appliedFlip,
  } satisfies ArtworkExternalState;

  const onTexturesReady = useCallback(() => {
    setTexturesReady(true);
  }, []);

  const pulseKey = [
    frontTextureUrl,
    backTextureUrl ?? '',
    orientation,
    panelWidth,
    panelHeight,
    panelThickness,
    scale,
    inspectRotationMode,
    lightingMode,
    pose.rotationX,
    pose.rotationY,
    appliedFlip,
    cameraPosition.join(','),
    cameraLookAt?.join(',') ?? '',
    cameraFov,
    cameraNear,
    grazingMix ?? 0,
    edgeMix,
    edgeRimMix,
    edgeSweep,
    edgeGlint,
    storyVisualFinish ? 'story-finish' : 'default-mat',
    storyAnatomy.panelOffset.join(','),
    storyAnatomy.artMagnetDetach,
    storyAnatomy.wallOpacity,
    storyAnatomy.magnetOpacity,
    storyAnatomy.wallSpread,
    storyAnatomy.stickerSpread,
    storyAnatomy.wallMagnetSpread,
    storyAnatomy.layerPulse.wall,
    storyAnatomy.layerPulse.sticker,
    storyAnatomy.layerPulse.wallMagnet,
    storyAnatomy.layerPulse.artMagnet,
    storyAnatomy.layerPulse.artwork,
    storyAnatomy.layerHighlight?.wall ?? 0,
    storyAnatomy.layerHighlight?.sticker ?? 0,
    storyAnatomy.layerHighlight?.wallMagnet ?? 0,
    storyAnatomy.layerHighlight?.artMagnet ?? 0,
    storyAnatomy.layerHighlight?.artwork ?? 0,
    surfaceSweep?.opacity ?? 0,
    surfaceSweep?.travel ?? 0,
    texturesReady ? 'tex' : 'wait',
  ].join('|');

  // The inputs that can rebuild the artwork's own material array. Any change here
  // must be followed by a story rebind.
  const storyFinishKey = [
    frontTextureUrl,
    backTextureUrl ?? '',
    orientation,
    quality,
    panelWidth,
    panelHeight,
    panelThickness,
  ].join('|');

  const artwork = (
    <MetaloraArtwork3D
      frontTextureUrl={frontTextureUrl}
      backTextureUrl={backTextureUrl}
      width={panelWidth}
      height={panelHeight}
      orientation={orientation}
      thickness={panelThickness}
      materialVariant="aluminum"
      layoutMode="cover"
      facePresentation="standard"
      interactionMode="static"
      interactive={false}
      autoRotate={false}
      quality={quality}
      includeSceneLighting={studioOn}
      baseScale={PDP_FRAME_SCALE * scale}
      externalStateRef={externalStateRef as ArtworkExternalStateRef}
      enablePointerFlip={false}
      enableDeviceOrientation={false}
      castShadow={false}
      receiveShadow={false}
      onTexturesReady={onTexturesReady}
    >
      {storyVisualFinish ? (
        <>
          <PdpStoryMaterialFinish enabled={texturesReady} sourceKey={storyFinishKey} />
          <SurfaceSweepPlane
            width={panelWidth}
            height={panelHeight}
            depth={panelThickness}
            orientation={orientation}
            travel={surfaceSweep?.travel ?? 0}
            opacity={surfaceSweep?.opacity ?? 0}
          />
        </>
      ) : null}
    </MetaloraArtwork3D>
  );

  return (
    <>
      <PdpContextLossWatcher onFailed={onFailed} />
      <PdpDemandDriver pulseKey={pulseKey} />
      <PdpReadyReporter texturesReady={texturesReady} onReady={onReady} />
      {cameraLookAt ? (
        <>
          <PdpCameraRig
            position={cameraPosition}
            lookAt={cameraLookAt}
            fov={cameraFov}
            near={cameraNear}
          />
          <PdpStoryDemandKeepalive />
        </>
      ) : null}
      {storyVisualFinish ? (
        <>
          <PdpStoryMetalLights edgeMix={edgeMix} />
          <PdpStoryRimSignature
            orientation={orientation}
            panelWidth={panelWidth}
            panelHeight={panelHeight}
            scale={scale}
            frameScale={PDP_FRAME_SCALE}
            rimMix={edgeRimMix}
            sweep={edgeSweep}
            glint={edgeGlint}
          />
        </>
      ) : null}
      {blendLights && !storyVisualFinish ? (
        <PdpBlendedLights mix={grazingMix ?? 0} edgeMix={edgeMix} />
      ) : null}
      {grazingOn ? <PdpGrazingLights /> : null}
      {continuous ? (
        <group rotation={[0, pose.rotationY, 0]}>
          <group rotation={[pose.rotationX, 0, 0]}>
            <group position={storyAnatomy.panelOffset}>
              <group scale={1 + MAGNETIC_CALLOUT.pulseScale * (storyAnatomy.layerPulse.artwork ?? 0)}>
                {artwork}
                {(storyAnatomy.layerHighlight?.artwork ?? 0) > 0.02 ? (
                  <mesh
                    position={[0, 0, (panelThickness * PDP_FRAME_SCALE * scale) / 2 + 0.004]}
                    renderOrder={6}
                  >
                    <planeGeometry
                      args={[panelWidth * PDP_FRAME_SCALE * scale, panelHeight * PDP_FRAME_SCALE * scale]}
                    />
                    <meshBasicMaterial
                      color="#f6f1ea"
                      transparent
                      opacity={0.085 * (storyAnatomy.layerHighlight.artwork ?? 0)}
                      depthWrite={false}
                    />
                  </mesh>
                ) : null}
              </group>
              {storyVisualFinish ? (
                <PdpStoryArtMagnet
                  panelThickness={panelThickness}
                  frameScale={PDP_FRAME_SCALE * scale}
                  detach={storyAnatomy.artMagnetDetach}
                  opacity={storyAnatomy.magnetOpacity}
                  pulse={storyAnatomy.layerPulse.artMagnet ?? 0}
                  highlight={storyAnatomy.layerHighlight?.artMagnet ?? 0}
                />
              ) : null}
            </group>
            {storyVisualFinish ? (
              <PdpStoryAnatomyWorld
                anatomy={storyAnatomy}
                frameScale={PDP_FRAME_SCALE * scale}
                orientation={orientation}
              />
            ) : null}
            {blendLights && !storyVisualFinish ? (
              <>
                <ambientLight intensity={0.1} />
                <directionalLight position={[0.15, 0.35, 3.1]} intensity={0.42} color="#ffffff" />
                <PdpPanelEdgeLights intensity={edgeMix} />
              </>
            ) : null}
          </group>
        </group>
      ) : (
        artwork
      )}
    </>
  );
}

/**
 * PDP Spatial Canvas core. Theatre Viewer omits story props and keeps studio defaults.
 * Parent owns 2D LCP, named controls, and skip-on-reduced-motion.
 */
export function PdpSpatialCanvas({
  frontTextureUrl,
  backTextureUrl = null,
  orientation = 'portrait',
  panelWidth = PDP_A4_WIDTH,
  panelHeight = PDP_A4_HEIGHT,
  panelThickness = PDP_PANEL_THICKNESS,
  scale = 1,
  rotationX = 0,
  rotationY = 0,
  inspectRotationMode = 'limited',
  flipProgress = 0,
  lightingMode = 'studio',
  grazingMix,
  edgeMix = 0,
  edgeRimMix = 0,
  edgeSweep = 0,
  edgeGlint = 0,
  storyVisualFinish = false,
  storyAnatomy = STORY_ANATOMY_IDLE,
  surfaceSweep = null,
  cameraPosition,
  cameraLookAt,
  cameraFov,
  cameraNear = 0.1,
  onReady,
  onFailed,
  className,
}: PdpSpatialCanvasProps) {
  const quality = usePdpQualityTier();
  const settledRef = useRef<PdpSpatialStatus>('pending');
  const resolvedCameraPosition = cameraPosition ?? PDP_CAMERA.position;
  const resolvedFov = cameraFov ?? PDP_CAMERA.fov;

  const fail = useCallback(() => {
    if (settledRef.current !== 'pending') return;
    settledRef.current = 'failed';
    onFailed?.();
  }, [onFailed]);

  const succeed = useCallback(() => {
    if (settledRef.current !== 'pending') return;
    settledRef.current = 'ready';
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!frontTextureUrl) {
      fail();
    }
  }, [fail, frontTextureUrl]);

  useEffect(() => {
    if (!frontTextureUrl) return undefined;
    const timer = window.setTimeout(() => {
      if (settledRef.current === 'pending') fail();
    }, PDP_ABANDON_MS);
    return () => window.clearTimeout(timer);
  }, [fail, frontTextureUrl]);

  if (!frontTextureUrl) return null;

  return (
    <div className={className} aria-hidden="true">
      <PdpCanvasErrorBoundary onFailed={fail}>
        <Canvas
          frameloop="demand"
          dpr={quality.dpr}
          gl={{
            antialias: quality.antialias,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          camera={{ position: resolvedCameraPosition, fov: resolvedFov, near: cameraNear }}
          onCreated={({ gl, invalidate }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.setClearColor(0x000000, 0);
            invalidate();
          }}
          style={{ background: 'transparent', pointerEvents: 'none', width: '100%', height: '100%' }}
        >
          <Suspense fallback={null}>
            <PdpSpatialScene
              frontTextureUrl={frontTextureUrl}
              backTextureUrl={backTextureUrl}
              orientation={orientation}
              panelWidth={panelWidth}
              panelHeight={panelHeight}
              panelThickness={panelThickness}
              scale={scale}
              rotationX={rotationX}
              rotationY={rotationY}
              flipProgress={flipProgress}
              inspectRotationMode={inspectRotationMode}
              lightingMode={lightingMode}
              grazingMix={typeof grazingMix === 'number' ? grazingMix : null}
              edgeMix={edgeMix}
              edgeRimMix={edgeRimMix}
              edgeSweep={edgeSweep}
              edgeGlint={edgeGlint}
              storyVisualFinish={storyVisualFinish}
              storyAnatomy={storyAnatomy}
              surfaceSweep={surfaceSweep}
              cameraPosition={resolvedCameraPosition}
              cameraLookAt={cameraLookAt ?? null}
              cameraFov={resolvedFov}
              cameraNear={cameraNear}
              quality={quality.tier}
              onReady={succeed}
              onFailed={fail}
            />
          </Suspense>
        </Canvas>
      </PdpCanvasErrorBoundary>
    </div>
  );
}

export default PdpSpatialCanvas;
