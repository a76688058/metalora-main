/**
 * Preview video-hero media contract.
 * A0 passes future admin video settings through VideoHeroMediaConfig.
 * A null src keeps the poster and does not request a file.
 * The bundled sample is a temporary still montage, not installation footage
 * and not a production media URL.
 */
export type VideoHeroMediaConfig = {
  src: string | null;
  poster: string;
};

export const TEMPORARY_VIDEO_HERO_SAMPLE: VideoHeroMediaConfig = {
  src: '/preview/video-hero-sample.mp4',
  poster: '/preview/plate-install.jpg',
};

export function resolveVideoHeroMedia(
  override?: Partial<VideoHeroMediaConfig> | null,
): VideoHeroMediaConfig {
  const poster = override?.poster?.trim() || TEMPORARY_VIDEO_HERO_SAMPLE.poster;
  if (override && Object.prototype.hasOwnProperty.call(override, 'src')) {
    return { src: override.src?.trim() || null, poster };
  }
  return { src: TEMPORARY_VIDEO_HERO_SAMPLE.src, poster };
}
