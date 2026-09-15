/** Production room backdrop */

export const HERO_ROOM_BACKDROP_PRIMARY = '/hero/spatial-room.webp';



/** Baked interior asset is present in `public/hero/spatial-room.webp` */

export const HERO_ROOM_BACKDROP_AVAILABLE = true;



/** Optional foreground mask silhouettes (unused when baked room is active) */

export const HERO_FOREGROUND_WINDOW_MASK = '/hero/spatial-window-edge.webp';

export const HERO_FOREGROUND_PLANT_MASK = '/hero/spatial-plant-silhouette.webp';



/** spatial-room.webp native aspect (1672×941) */

export const HERO_ROOM_BACKDROP_ASPECT = 1672 / 941;



/**

 * Baked room plane layout — tuned for 1440 desktop cover crop.

 * `coverOffset` shifts the visible crop without stretching.

 */

export const HERO_ROOM_BACKDROP_LAYOUT = {

  planeWidth: 12.6,

  baseZ: -2.38,

  baseY: -0.06,

  coverOffsetX: -0.062,

  coverOffsetY: -0.024,

};



/** Artwork mount on the main wall — tuned against static room backdrop at p=0 (SPACE) */
export const HERO_WALL_ANCHOR = {
  /** Normalized screen point on object-cover room image where panel center sits at p=0 */
  x: 0.5,
  y: 0.39,
};

/** Target viewport height fraction at p=0 (long edge for portrait) */
export const HERO_BASE_ARTWORK_VIEWPORT_HEIGHT = 0.16;

/** Keep artwork below header / logo safe band */
export const HERO_HEADER_SAFE_TOP = 0.14;

/** Same thickness as Poster3D LIVE 3D PREVIEW (legacy thin aluminum) */
export const HERO_PANEL_DEPTH = 0.008;

/** Wall offset — panel sits slightly proud of wall plane */
export const HERO_PANEL_WALL_OFFSET = 0.006;

/** Fixed hero camera — 2.5D, does not dolly through baked photo */
export const HERO_FIXED_CAMERA = {
  position: [0, 0, 5] as const,
  fov: 42,
  near: 0.1,
  far: 30,
};

/** Legacy 3D mount — unused in 2.5D path */
export const HERO_ARTWORK_MOUNT = {
  x: -0.06,
  y: 0.48,
  z: -2.24,
  baseScale: 1.08,
  wallTiltY: -0.028,
};

export const HERO_CONTACT_SHADOW = {
  /** Light from right → shadow falls left and slightly down */
  offsetX: -0.022,
  offsetY: -0.018,
  offsetZ: -0.006,
};
