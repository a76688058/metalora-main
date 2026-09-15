import * as THREE from 'three';

import {
  HERO_BASE_ARTWORK_VIEWPORT_HEIGHT,
  HERO_HEADER_SAFE_TOP,
  HERO_WALL_ANCHOR,
} from './backdropAsset';
import {
  KEYFRAME_DESIRE,
  KEYFRAME_DESIRE_END,
  KEYFRAME_DESIRE_LOCK,
  KEYFRAME_DESIRE_MID,
  KEYFRAME_DISCOVER,
  KEYFRAME_DISCOVER_END,
  KEYFRAME_EXIT,
  KEYFRAME_EXIT_END,
  KEYFRAME_EXIT_MID,
  KEYFRAME_HOLD,
  KEYFRAME_HOLD_END,
  KEYFRAME_HOLD_MID,
  KEYFRAME_LIGHT,
  KEYFRAME_LIGHT_END,
  KEYFRAME_LIGHT_MID,
  KEYFRAME_ROOM,
  KEYFRAME_ROOM_END,
} from './constants';
import { channelRange, interpolateAnchors, smoothstep } from './curves';

/**
 * Staged story anchors — narrative rhythm, not continuous zoom.
 * ROOM → DISCOVER → HOLD → LIGHT → DESIRE → EXIT
 */
const STORY_ANCHORS = [
  KEYFRAME_ROOM,
  KEYFRAME_ROOM_END,
  KEYFRAME_DISCOVER_END,
  KEYFRAME_HOLD_MID,
  KEYFRAME_HOLD_END,
  KEYFRAME_LIGHT_MID,
  KEYFRAME_LIGHT_END,
  KEYFRAME_DESIRE_MID,
  KEYFRAME_DESIRE_END,
  KEYFRAME_EXIT_MID,
  KEYFRAME_EXIT_END,
] as const;

/**
 * cameraApproachScale drives BOTH room CSS scale and artwork mount.
 * Growth concentrated in DISCOVER; HOLD/LIGHT nearly flat; DESIRE tiny settle; EXIT no further enlarge.
 * Portrait vh targets ≈ 16% → 28% → 40% → 42% → 44% → exit translate
 */
/** DISCOVER approach ~23% gentler — retain architectural cues at p=.38 */
const APPROACH_SCALE = [
  1.0, // 0 ROOM
  1.02, // .18 ROOM end — nearly static
  1.58, // .38 DISCOVER end — reduced from 1.75
  1.62, // .48 HOLD mid — nearly flat
  1.64, // .58 HOLD end
  1.64, // .67 LIGHT mid — no growth
  1.65, // .76 LIGHT end
  1.68, // .85 DESIRE mid — tiny settle
  1.7, // .90 DESIRE end
  1.7, // .95 EXIT mid
  1.7, // 1 EXIT end
] as const;

const BACKDROP_TX = [0, 0, -0.42, -0.62, -0.66, -0.7, -0.72, -0.74, -0.76, -0.76, -0.78] as const;
const BACKDROP_TY = [0, 0.02, 0.09, 0.13, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.22] as const;

export interface HeroIntegrationChannels {
  cameraApproachScale: number;
  artworkEmphasisScale: number;
  backdropTranslateX: number;
  backdropTranslateY: number;
  roomDim: number;
  roomOpacity: number;
  artworkYaw: number;
  artworkTiltX: number;
  lightSweep: number;
  richnessLight: number;
  lightArc: number;
  /** UV-space center of broad daylight band (1 = right edge) */
  lightBandCenter: number;
  /** Band width as fraction of artwork surface (~0.35 = 35%) */
  lightBandWidth: number;
  /** 0 outside LIGHT; peaks ~p=.67 */
  lightBandStrength: number;
  contactShadowStrength: number;
  artworkMountScale: number;
  /** EXIT: artwork rises / retreats in screen space (world Y offset) */
  exitLift: number;
  /** EXIT: artwork opacity */
  exitOpacity: number;
  /** EXIT: optional tiny scale settle */
  exitScale: number;
  /** Projected screen-space commerce placement (updated by scene each frame) */
  commerceScreenX: number;
  commerceScreenY: number;
  commerceScreenW: number;
  commerceScreenH: number;
  /** @internal Legacy fields for unused 3D backdrop components */
  roomParallax: number;
  foregroundParallax: number;
  backdropShiftX: number;
  backdropShiftY: number;
  backdropScale: number;
}

export function evaluateHeroIntegration(p: number): HeroIntegrationChannels {
  const out = {} as HeroIntegrationChannels;
  evaluateHeroIntegrationInto(p, out);
  return out;
}

export function evaluateHeroIntegrationInto(p: number, out: HeroIntegrationChannels): void {
  // Hero choreography completes by DESIRE_END; pose stays fixed while collection occludes
  const poseP = Math.min(p, KEYFRAME_DESIRE_LOCK);

  const cameraApproachScale = interpolateAnchors(poseP, STORY_ANCHORS, APPROACH_SCALE);
  const artworkEmphasisScale =
    1 + smoothstep(KEYFRAME_HOLD_END, KEYFRAME_DESIRE_END, poseP) * 0.04;

  const backdropTranslateX = interpolateAnchors(poseP, STORY_ANCHORS, BACKDROP_TX);
  const backdropTranslateY = interpolateAnchors(poseP, STORY_ANCHORS, BACKDROP_TY);

  const roomDim = interpolateAnchors(
    poseP,
    [KEYFRAME_ROOM, KEYFRAME_HOLD_END, KEYFRAME_LIGHT_MID, KEYFRAME_DESIRE_END],
    [0, 0.035, 0.055, 0.1],
  );
  const roomOpacity = interpolateAnchors(
    poseP,
    [KEYFRAME_ROOM, KEYFRAME_DESIRE_END],
    [1, 0.97],
  );

  const artworkYaw =
    smoothstep(KEYFRAME_LIGHT, KEYFRAME_LIGHT_MID, poseP) * 0.045 -
    smoothstep(KEYFRAME_LIGHT_MID, KEYFRAME_DESIRE, poseP) * 0.018;
  const artworkTiltX =
    smoothstep(KEYFRAME_LIGHT, KEYFRAME_LIGHT_MID, poseP) * 0.02 -
    smoothstep(KEYFRAME_LIGHT_MID, KEYFRAME_DESIRE, poseP) * 0.008;

  const lightEnter = smoothstep(KEYFRAME_HOLD_END, KEYFRAME_HOLD_END + 0.04, poseP);
  const lightExit = 1 - smoothstep(KEYFRAME_LIGHT_END - 0.05, KEYFRAME_LIGHT_END, poseP);
  const lightSweep = lightEnter * lightExit;
  const richnessLight =
    smoothstep(KEYFRAME_HOLD_END, KEYFRAME_LIGHT_MID, poseP) *
    (1 - smoothstep(KEYFRAME_LIGHT_END, KEYFRAME_DESIRE, poseP) * 0.3);
  const lightArc = channelRange(poseP, KEYFRAME_LIGHT, KEYFRAME_LIGHT_END);

  const lightBandCenter = interpolateAnchors(
    poseP,
    [KEYFRAME_HOLD_END, KEYFRAME_LIGHT_MID, KEYFRAME_LIGHT_END, KEYFRAME_DESIRE],
    [0.92, 0.54, 0.32, 0.32],
  );
  const lightBandWidth = 0.38;
  const lightBandPeak =
    smoothstep(KEYFRAME_HOLD_END, KEYFRAME_LIGHT_MID - 0.02, poseP) *
    (1 - smoothstep(KEYFRAME_LIGHT_MID + 0.02, KEYFRAME_LIGHT_END, poseP));
  const lightBandStrength = lightBandPeak * 0.72;

  const contactShadowStrength = interpolateAnchors(
    poseP,
    [KEYFRAME_ROOM, KEYFRAME_DISCOVER_END, KEYFRAME_HOLD_END, KEYFRAME_LIGHT_MID, KEYFRAME_DESIRE_END],
    [0.1, 0.16, 0.24, 0.3, 0.26],
  );

  // No Hero exit — collection curtain provides the transition
  const exitLift = 0;
  const exitOpacity = 1;
  const exitScale = 1;

  out.cameraApproachScale = cameraApproachScale;
  out.artworkEmphasisScale = artworkEmphasisScale;
  out.backdropTranslateX = backdropTranslateX;
  out.backdropTranslateY = backdropTranslateY;
  out.roomDim = roomDim;
  out.roomOpacity = roomOpacity;
  out.artworkYaw = artworkYaw;
  out.artworkTiltX = artworkTiltX;
  out.lightSweep = lightSweep;
  out.richnessLight = richnessLight;
  out.lightArc = lightArc;
  out.lightBandCenter = lightBandCenter;
  out.lightBandWidth = lightBandWidth;
  out.lightBandStrength = lightBandStrength;
  out.contactShadowStrength = contactShadowStrength;
  out.artworkMountScale = cameraApproachScale * artworkEmphasisScale;
  out.exitLift = exitLift;
  out.exitOpacity = exitOpacity;
  out.exitScale = exitScale;

  // Preserve commerce screen fields if already written by scene
  if (out.commerceScreenX === undefined) out.commerceScreenX = 0.5;
  if (out.commerceScreenY === undefined) out.commerceScreenY = 0.55;
  if (out.commerceScreenW === undefined) out.commerceScreenW = 0.2;
  if (out.commerceScreenH === undefined) out.commerceScreenH = 0.35;

  out.roomParallax = channelRange(p, KEYFRAME_ROOM, KEYFRAME_HOLD_END);
  out.foregroundParallax = channelRange(p, KEYFRAME_ROOM, KEYFRAME_DISCOVER_END);
  out.backdropShiftX = backdropTranslateX * 0.01;
  out.backdropShiftY = backdropTranslateY * 0.01;
  out.backdropScale = cameraApproachScale;
}

/** Project normalized viewport point (0–1) onto wall plane z=planeZ */
export function screenNormToWorld(
  nx: number,
  ny: number,
  camera: THREE.PerspectiveCamera,
  planeZ = 0,
): THREE.Vector3 {
  const worldPoint = new THREE.Vector3(nx * 2 - 1, -(ny * 2 - 1), 0.5);
  worldPoint.unproject(camera);
  const dir = worldPoint.sub(camera.position).normalize();
  const t = (planeZ - camera.position.z) / dir.z;
  return camera.position.clone().add(dir.multiplyScalar(t));
}

export function worldToScreenNorm(
  world: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): { x: number; y: number } {
  const projected = world.clone().project(camera);
  return {
    x: (projected.x + 1) * 0.5,
    y: (1 - projected.y) * 0.5,
  };
}

export function visibleWorldHeightAtWall(camera: THREE.PerspectiveCamera, planeZ = 0): number {
  const dist = camera.position.z - planeZ;
  return 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
}

export interface ArtworkScaleInput {
  slabWidth: number;
  slabHeight: number;
  aspect: number;
  mountScale: number;
  anchorY: number;
}

export function computeArtworkMountScale(
  camera: THREE.PerspectiveCamera,
  input: ArtworkScaleInput,
): number {
  const visibleH = visibleWorldHeightAtWall(camera);
  let scale = HERO_BASE_ARTWORK_VIEWPORT_HEIGHT * visibleH * input.mountScale;

  // Cap so portrait stays ≤ ~48% vh and landscape ≤ ~58% width
  const maxHeightFrac = input.aspect >= 1 ? 0.42 : 0.48;
  const maxWidthFrac = input.aspect >= 1 ? 0.58 : 0.4;

  const projectedHeightFrac = (input.slabHeight * scale) / visibleH;
  if (projectedHeightFrac > maxHeightFrac) {
    scale *= maxHeightFrac / projectedHeightFrac;
  }

  const projectedWidthFrac = (input.slabWidth * scale) / visibleH;
  if (projectedWidthFrac > maxWidthFrac) {
    scale *= maxWidthFrac / projectedWidthFrac;
  }

  const finalHeightFrac = (input.slabHeight * scale) / visibleH;
  const topEdge = input.anchorY - finalHeightFrac * 0.5;
  if (topEdge < HERO_HEADER_SAFE_TOP) {
    const safeMax = (input.anchorY - HERO_HEADER_SAFE_TOP) * 2;
    if (finalHeightFrac > safeMax && safeMax > 0) {
      scale *= safeMax / finalHeightFrac;
    }
  }

  return scale;
}

export function getWallAnchorNorm(): { x: number; y: number } {
  return { x: HERO_WALL_ANCHOR.x, y: HERO_WALL_ANCHOR.y };
}
