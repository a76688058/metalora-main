/** Catalog image frame for uploaded artwork files: A4, 210 / 297. */
export const DEFAULT_ARTWORK_WIDTH_MM = 210;
export const DEFAULT_ARTWORK_HEIGHT_MM = 297;

export type ArtworkFrameMm = {
  widthMm: number;
  heightMm: number;
};

function positive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Shared catalog frame. A later validated size can be passed here.
 * Missing or unusable values stay on 210 / 297. Image pixel size is not a frame.
 */
export function artworkAspectRatio(frame?: ArtworkFrameMm | null): string {
  if (frame && positive(frame.widthMm) && positive(frame.heightMm)) {
    return `${frame.widthMm} / ${frame.heightMm}`;
  }
  return `${DEFAULT_ARTWORK_WIDTH_MM} / ${DEFAULT_ARTWORK_HEIGHT_MM}`;
}
