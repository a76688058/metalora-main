/** Visual keyframe progress — staged Flighty-inspired narrative (continuous, not snaps) */

/** ROOM — architecture exists */
export const KEYFRAME_ROOM = 0;
export const KEYFRAME_ROOM_END = 0.18;

/** DISCOVER — room gives stage to artwork */
export const KEYFRAME_DISCOVER = 0.18;
export const KEYFRAME_DISCOVER_END = 0.38;

/** HOLD — artwork settles; almost no growth */
export const KEYFRAME_HOLD = 0.38;
export const KEYFRAME_HOLD_MID = 0.48;
export const KEYFRAME_HOLD_END = 0.58;

/** LIGHT — visual event around stable artwork */
export const KEYFRAME_LIGHT = 0.58;
export const KEYFRAME_LIGHT_MID = 0.67;
export const KEYFRAME_LIGHT_END = 0.76;

/** DESIRE — commerce scene completes */
export const KEYFRAME_DESIRE = 0.76;
export const KEYFRAME_DESIRE_MID = 0.85;
export const KEYFRAME_DESIRE_END = 0.9;

/** EXIT — collection curtain rises; Hero pose locked at DESIRE_END */
export const KEYFRAME_EXIT = 0.9;
export const KEYFRAME_EXIT_MID = 0.95;
export const KEYFRAME_EXIT_END = 1;

/** Final commerce pose — all Hero choreography freezes at/after this */
export const KEYFRAME_DESIRE_LOCK = KEYFRAME_DESIRE_END;

/** Legacy aliases — keep scrubber / imports working */
export const KEYFRAME_SPACE = KEYFRAME_ROOM;
export const KEYFRAME_APPROACH = KEYFRAME_DISCOVER;
export const KEYFRAME_PRESENCE = KEYFRAME_HOLD_MID;
export const KEYFRAME_DESIRE_LEGACY = KEYFRAME_DESIRE_END;

export const KEYFRAME_ROOM_WIDE = KEYFRAME_ROOM;
export const KEYFRAME_ROOM_EXIT = KEYFRAME_DISCOVER;
export const KEYFRAME_ARTWORK = KEYFRAME_HOLD_MID;
export const KEYFRAME_EDGE_REVEAL = KEYFRAME_LIGHT_MID;
export const KEYFRAME_MATERIAL = KEYFRAME_DESIRE_END;

/** Stable FOV — 2.5D fixed camera */
export const HERO_FOV_START = 42;
export const HERO_FOV_END = 42;
