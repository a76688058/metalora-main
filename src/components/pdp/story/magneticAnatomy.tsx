import * as THREE from 'three';
import {
  MAGNETIC_CALLOUT,
  STORY_LAYER_TONES,
  STORY_MAGNET_SIZE_MM,
  STORY_MM_PER_UNIT,
  STORY_PANEL_HEIGHT_MM,
  STORY_PANEL_WIDTH_MM,
  STORY_STICKER_HEIGHT_MM,
  STORY_STICKER_WIDTH_MM,
  STORY_WALL_FACE_SCALE,
  STORY_WALL_SURFACE_COLOR,
  type StoryAnatomyLayerId,
} from './constants';

/**
 * Local −Z = toward wall. Face sizes follow real mm × story face scale.
 * Magnet/sticker thickness is explanatory only — not measured SKU millimetres.
 * Seated = compressed mount. Exploded = explanatory fan-out.
 */
export const ANATOMY_LAYOUT = {
  wallMagnetSeatedZ: -0.034,
  stickerSeatedZ: -0.05,
  wallSeatedZ: -0.058,
  artMagnetExplodedZ: -0.58,
  wallMagnetExplodedZ: -1.22,
  stickerExplodedZ: -1.86,
  wallExplodedZ: -2.5,
} as const;

/** Visual plate thickness only. Do not label as millimetres. */
const MAGNET_THICKNESS = 0.016;
const STICKER_THICKNESS = 0.004;

/**
 * Material roles, not decoration. Wall = receiving surface (larger than the
 * product), sticker = light film, magnets = dark squares. Artwork FRONT is the
 * current product print; reverse remains unprinted aluminum (storyAluminum.ts).
 *
 * Sticker/magnet still get a mild exposure lift against the story tone curve.
 * The wall is now camera-facing (004E-R4) so it uses the authored plaster tone
 * without the old rear-side crush; crushing it again makes another gray plate.
 */
const STICKER_COLOR = STORY_LAYER_TONES.sticker;
const MAGNET_COLOR = STORY_LAYER_TONES.magnet;
const STICKER_EXPOSURE = 0.95;

const WALL_TONE = new THREE.Color(STORY_WALL_SURFACE_COLOR);
const STICKER_TONE = new THREE.Color(STICKER_COLOR).multiplyScalar(STICKER_EXPOSURE);

/** One 64² plaster grain. Created once; amplitude is ~1% so it does not read as a pattern. */
function createWallPlasterMap(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grain = (n - Math.floor(n) - 0.5) * 5;
      const v = THREE.MathUtils.clamp(Math.round(248 + grain), 242, 255);
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
}

const WALL_PLASTER_MAP = createWallPlasterMap();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function faceMm(mm: number, frameScale: number): number {
  return (mm / STORY_MM_PER_UNIT) * frameScale;
}

export type StoryAnatomyView = {
  panelOffset: [number, number, number];
  artMagnetDetach: number;
  wallOpacity: number;
  magnetOpacity: number;
  wallSpread: number;
  stickerSpread: number;
  wallMagnetSpread: number;
  layerPulse: Record<StoryAnatomyLayerId, number>;
  layerHighlight: Record<StoryAnatomyLayerId, number>;
};

const ZERO_PULSE: Record<StoryAnatomyLayerId, number> = {
  wall: 0,
  sticker: 0,
  wallMagnet: 0,
  artMagnet: 0,
  artwork: 0,
};

export const STORY_ANATOMY_IDLE: StoryAnatomyView = {
  panelOffset: [0, 0, 0],
  artMagnetDetach: 0,
  wallOpacity: 0,
  magnetOpacity: 0,
  wallSpread: 0,
  stickerSpread: 0,
  wallMagnetSpread: 0,
  layerPulse: ZERO_PULSE,
  layerHighlight: ZERO_PULSE,
};

/** Panel-local Z of every layer at the current spread. Fan-out order. */
export function storyAnatomyLayerZs(
  anatomy: StoryAnatomyView,
  panelThickness: number,
  frameScale: number,
): { id: StoryAnatomyLayerId; z: number }[] {
  const worldThickness = panelThickness * frameScale;
  const artMagnetSeatedZ = -(worldThickness / 2 + MAGNET_THICKNESS / 2);
  return [
    {
      id: 'wall',
      z: lerp(ANATOMY_LAYOUT.wallSeatedZ, ANATOMY_LAYOUT.wallExplodedZ, anatomy.wallSpread),
    },
    {
      id: 'sticker',
      z: lerp(ANATOMY_LAYOUT.stickerSeatedZ, ANATOMY_LAYOUT.stickerExplodedZ, anatomy.stickerSpread),
    },
    {
      id: 'wallMagnet',
      z: lerp(
        ANATOMY_LAYOUT.wallMagnetSeatedZ,
        ANATOMY_LAYOUT.wallMagnetExplodedZ,
        anatomy.wallMagnetSpread,
      ),
    },
    {
      id: 'artMagnet',
      z: lerp(artMagnetSeatedZ, ANATOMY_LAYOUT.artMagnetExplodedZ, anatomy.artMagnetDetach),
    },
    { id: 'artwork', z: anatomy.panelOffset[2] },
  ];
}

function MagnetPlate({
  position,
  size,
  opacity,
  pulse = 0,
  highlight = 0,
}: {
  position: [number, number, number];
  size: number;
  opacity: number;
  pulse?: number;
  highlight?: number;
}) {
  if (opacity < 0.01) return null;
  const scale = 1 + MAGNETIC_CALLOUT.pulseScale * pulse;
  return (
    <mesh position={position} scale={scale} renderOrder={2}>
      <boxGeometry args={[size, size, MAGNET_THICKNESS]} />
      <meshStandardMaterial
        color={MAGNET_COLOR}
        metalness={0.34}
        roughness={0.58}
        envMapIntensity={0.45 + 0.28 * highlight}
        emissive="#d8dde4"
        emissiveIntensity={0.32 * highlight}
        transparent={opacity < 0.999}
        opacity={opacity}
        depthWrite={opacity > 0.8}
      />
    </mesh>
  );
}

/** Sibling of the panel. 80 × 80 mm face. Spread 0 = seated on reverse. */
export function PdpStoryArtMagnet({
  panelThickness,
  frameScale,
  detach,
  opacity,
  pulse = 0,
  highlight = 0,
}: {
  panelThickness: number;
  frameScale: number;
  detach: number;
  opacity: number;
  pulse?: number;
  highlight?: number;
}) {
  const worldThickness = panelThickness * frameScale;
  const seatedZ = -(worldThickness / 2 + MAGNET_THICKNESS / 2);
  const size = faceMm(STORY_MAGNET_SIZE_MM, frameScale);
  const z = lerp(seatedZ, ANATOMY_LAYOUT.artMagnetExplodedZ, detach);
  return <MagnetPlate position={[0, 0, z]} size={size} opacity={opacity} pulse={pulse} highlight={highlight} />;
}

/**
 * Wall, sticker, wall-side magnet — panel-local −Z.
 * All three exist from magnetic start; spread 0 is the compressed mount.
 */
export function PdpStoryAnatomyWorld({
  anatomy,
  frameScale,
  orientation,
}: {
  anatomy: StoryAnatomyView;
  frameScale: number;
  orientation: 'portrait' | 'landscape';
}) {
  if (anatomy.wallOpacity < 0.01 && anatomy.magnetOpacity < 0.01) return null;
  const portrait = orientation !== 'landscape';
  const stickerW = faceMm(
    portrait ? STORY_STICKER_WIDTH_MM : STORY_STICKER_HEIGHT_MM,
    frameScale,
  );
  const stickerH = faceMm(
    portrait ? STORY_STICKER_HEIGHT_MM : STORY_STICKER_WIDTH_MM,
    frameScale,
  );
  const magnetSize = faceMm(STORY_MAGNET_SIZE_MM, frameScale);
  const artW = faceMm(portrait ? STORY_PANEL_WIDTH_MM : STORY_PANEL_HEIGHT_MM, frameScale);
  const artH = faceMm(portrait ? STORY_PANEL_HEIGHT_MM : STORY_PANEL_WIDTH_MM, frameScale);
  const stackBoost = frameScale / 1.8;
  const wallW = (artW * STORY_WALL_FACE_SCALE.x) / Math.max(stackBoost, 0.01);
  const wallH = (artH * STORY_WALL_FACE_SCALE.y) / Math.max(stackBoost, 0.01);
  const wallZ = lerp(
    ANATOMY_LAYOUT.wallSeatedZ,
    ANATOMY_LAYOUT.wallExplodedZ,
    anatomy.wallSpread,
  );
  const stickerZ = lerp(
    ANATOMY_LAYOUT.stickerSeatedZ,
    ANATOMY_LAYOUT.stickerExplodedZ,
    anatomy.stickerSpread,
  );
  const wallMagnetZ = lerp(
    ANATOMY_LAYOUT.wallMagnetSeatedZ,
    ANATOMY_LAYOUT.wallMagnetExplodedZ,
    anatomy.wallMagnetSpread,
  );

  const pulse = anatomy.layerPulse;
  const highlight = anatomy.layerHighlight ?? ZERO_PULSE;
  const wallScale = 1 + MAGNETIC_CALLOUT.pulseScale * (pulse.wall ?? 0);
  const stickerScale = 1 + MAGNETIC_CALLOUT.pulseScale * (pulse.sticker ?? 0);
  const wallLift = highlight.wall ?? 0;
  const stickerLift = highlight.sticker ?? 0;

  return (
    <>
      <mesh position={[0, 0, wallZ]} scale={wallScale} renderOrder={0}>
        <planeGeometry args={[wallW, wallH]} />
        <meshStandardMaterial
          color={WALL_TONE}
          map={WALL_PLASTER_MAP}
          roughness={1}
          metalness={0}
          envMapIntensity={0.08 + 0.12 * wallLift}
          emissive="#f4eee6"
          emissiveIntensity={0.2 * wallLift}
          transparent
          opacity={anatomy.wallOpacity}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, stickerZ]} scale={stickerScale} renderOrder={1}>
        <boxGeometry args={[stickerW, stickerH, STICKER_THICKNESS]} />
        <meshStandardMaterial
          color={STICKER_TONE}
          roughness={0.78}
          metalness={0}
          envMapIntensity={0.12 * stickerLift}
          emissive="#f7f4ee"
          emissiveIntensity={0.22 * stickerLift}
          transparent
          opacity={anatomy.wallOpacity * 0.9}
          depthWrite={false}
        />
      </mesh>
      <MagnetPlate
        position={[0, 0, wallMagnetZ]}
        size={magnetSize}
        opacity={anatomy.magnetOpacity}
        pulse={pulse.wallMagnet ?? 0}
        highlight={highlight.wallMagnet ?? 0}
      />
    </>
  );
}
