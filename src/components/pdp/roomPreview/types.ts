export const ROOM_PHOTO_MAX_LONG_EDGE = 2048;
export const ROOM_JPEG_QUALITY = 0.82;
/** Artwork long edge as a fraction of the displayed room photo's short side. */
export const ARTWORK_LONG_EDGE_FRACTION = 0.4;
/** Artwork short side vs displayed photo short side (usability min). */
export const ARTWORK_MIN_SHORT_FRACTION = 0.03;
/** Invisible hit floor so a 3% preview can still be tapped/selected. */
export const ARTWORK_MIN_HIT_PX = 44;
/** Artwork long side vs displayed photo long side (usability max). */
export const ARTWORK_MAX_LONG_FRACTION = 0.88;
/** Minimum fraction of the artwork box that must stay inside the photo rect. */
export const ARTWORK_INSIDE_FRACTION = 0.25;
export const ARTWORK_MOVE_THRESHOLD_PX = 3;
export const ARTWORK_NUDGE_PX = 4;
export const ARTWORK_NUDGE_LARGE_PX = 16;
export const ARTWORK_SCALE_STEP = 0.045;
export const ARTWORK_LOCK_SETTLE_MS = 240;

export type RoomPreviewPhase = 'empty' | 'decoding' | 'ready';
export type RoomArtworkMode = 'locked' | 'editing';

/** Center is 0–1 of the displayed photo rect. longFrac is long edge / photo short side. */
export interface ArtworkPlacement {
  cx: number;
  cy: number;
  longFrac: number;
}

export const DEFAULT_ARTWORK_PLACEMENT: ArtworkPlacement = {
  cx: 0.5,
  cy: 0.5,
  longFrac: ARTWORK_LONG_EDGE_FRACTION,
};

export interface RoomPhotoDisplay {
  url: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface DecodeRoomPhotoResult {
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export const ROOM_PHOTO_DECODE_ERROR =
  '이 사진은 미리보기에 사용할 수 없습니다. JPEG 또는 PNG로 다시 선택해 주세요.';
