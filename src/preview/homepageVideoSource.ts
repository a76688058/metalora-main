import { TEMPORARY_VIDEO_HERO_SAMPLE } from './videoHeroConfig';

export const PUBLIC_HOMEPAGE_VIDEO = {
  desktop: '/api/homepage-video/desktop',
  mobile: '/api/homepage-video/mobile',
} as const;

export function selectPublicHeroVideoSrc(input: {
  mobile: boolean;
  desktopAvailable: boolean;
  mobileAvailable: boolean;
}): string {
  if (input.mobile && input.mobileAvailable) return PUBLIC_HOMEPAGE_VIDEO.mobile;
  if (input.desktopAvailable) return PUBLIC_HOMEPAGE_VIDEO.desktop;
  return TEMPORARY_VIDEO_HERO_SAMPLE.src ?? '/preview/video-hero-sample.mp4';
}
