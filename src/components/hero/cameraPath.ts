import * as THREE from 'three';

import { clamp01 } from './curves';

export interface CameraKeyframe {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

/**
 * Authored camera — SPACE → DISCOVERY → PRESENCE → LIGHT → DESIRE.
 * Restrained travel on X/Y/Z + lookAt; no aggressive FOV zoom.
 */
const KEYFRAMES: CameraKeyframe[] = [
  // p=0 SPACE — wide asymmetric room establishing shot
  {
    position: new THREE.Vector3(0.78, 0.12, 5.35),
    lookAt: new THREE.Vector3(-0.1, 0.14, -2.32),
  },
  // p=.25 DISCOVERY — forward approach + subtle lateral drift
  {
    position: new THREE.Vector3(0.62, 0.1, 4.35),
    lookAt: new THREE.Vector3(-0.09, 0.2, -2.22),
  },
  // p=.5 PRESENCE — frontal artwork beauty composition
  {
    position: new THREE.Vector3(-0.04, 0.04, 2.02),
    lookAt: new THREE.Vector3(-0.06, 0.17, -2.13),
  },
  // p=.75 LIGHT — small sideways arc, slight off-axis read
  {
    position: new THREE.Vector3(-0.52, 0.06, 1.48),
    lookAt: new THREE.Vector3(0.04, 0.11, -2.07),
  },
  // p=1 DESIRE — settled premium campaign framing
  {
    position: new THREE.Vector3(-0.68, 0.0, 1.12),
    lookAt: new THREE.Vector3(0.1, 0.05, -2.01),
  },
];

function catmullRom(
  t: number,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  out: THREE.Vector3,
): void {
  const t2 = t * t;
  const t3 = t2 * t;
  out.set(
    0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  );
}

export function sampleHeroCamera(
  progress: number,
  outPosition: THREE.Vector3,
  outLookAt: THREE.Vector3,
): void {
  const t = clamp01(progress);
  const n = KEYFRAMES.length - 1;
  const scaled = t * n;
  const segment = Math.min(Math.floor(scaled), n - 1);
  const localT = scaled - segment;

  const i0 = Math.max(0, segment - 1);
  const i1 = segment;
  const i2 = segment + 1;
  const i3 = Math.min(n, segment + 2);

  catmullRom(
    localT,
    KEYFRAMES[i0].position,
    KEYFRAMES[i1].position,
    KEYFRAMES[i2].position,
    KEYFRAMES[i3].position,
    outPosition,
  );
  catmullRom(
    localT,
    KEYFRAMES[i0].lookAt,
    KEYFRAMES[i1].lookAt,
    KEYFRAMES[i2].lookAt,
    KEYFRAMES[i3].lookAt,
    outLookAt,
  );
}
