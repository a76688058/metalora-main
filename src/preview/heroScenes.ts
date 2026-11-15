export type HeroDestination = '#marquee-section' | 'custom' | `/product/${string}`;

export type HeroScene = {
  id: string;
  kicker: string;
  heading: string;
  description: string;
  posterDark: string;
  posterLight: string;
  alt: string;
  /** Set when a real file exists. Null skips the request. */
  video: string | null;
  missingVideo: string;
  /** Wall reuses the surviving exhibition stage. Photo uses the poster pair. Video uses VideoHero. */
  layout?: 'photo' | 'wall' | 'video';
  primary: { label: string; to: HeroDestination };
  secondary?: { label: string; to: HeroDestination };
};

/**
 * Owner-editable hero copy. Visual scenes stay independent of this text.
 * Video files listed in missingVideo are not in public/preview yet.
 */
export const HERO_SCENES: HeroScene[] = [
  {
    id: 'panel-0',
    kicker: 'METAL WALL ART',
    heading: '고르거나, 만들거나.',
    description: '금속이 만드는 빛의 깊이, 당신만의 공간 예술.',
    posterDark: '/preview/ref-hero-night.jpg',
    posterLight: '/preview/ref-hero-day.jpg',
    alt: '구성안. 금속 월 아트가 걸린 갤러리. 실제 설치 결과를 증명하지 않습니다.',
    video: null,
    missingVideo: '/preview/slide-1-install.mp4',
    primary: { label: '작품 탐색하기 →', to: '#marquee-section' },
    secondary: { label: '커스텀 제작하기', to: 'custom' },
  },
  {
    id: 'panel-1',
    kicker: 'METAL WALL ART',
    heading: '고르거나, 만들거나.',
    description: '금속이 만드는 빛의 깊이, 당신만의 공간 예술.',
    posterDark: '/preview/plate-custom.jpg',
    posterLight: '/preview/ref-hero-day.jpg',
    alt: '구성안. 커스텀 금속 패널. 이 장면의 낮 갤러리 사진이 없어 낮에는 갤러리 포스터를 보여 줍니다.',
    video: null,
    missingVideo: '/preview/slide-2-custom.mp4',
    primary: { label: '커스텀 제작하기', to: 'custom' },
  },
  {
    id: 'panel-2',
    kicker: 'METAL WALL ART',
    heading: '고르거나, 만들거나.',
    description: '금속이 만드는 빛의 깊이, 당신만의 공간 예술.',
    posterDark: '/preview/plate-room.jpg',
    posterLight: '/preview/ref-hero-day.jpg',
    alt: '구성안. 실내에 놓인 금속 작품. 이 장면의 낮 갤러리 사진이 없어 낮에는 갤러리 포스터를 보여 줍니다.',
    video: null,
    missingVideo: '/preview/slide-3-room.mp4',
    primary: { label: '작품 탐색하기 →', to: '#marquee-section' },
  },
];

/** Homepage carousel only. Slide 2 reuses the existing exhibition room. */
export const HOME_CAROUSEL_SCENES: HeroScene[] = [
  HERO_SCENES[0],
  {
    ...HERO_SCENES[1],
    id: 'panel-gallery',
    layout: 'wall',
    posterDark: '/preview/gallery-environment-dark.webp',
    posterLight: '/preview/gallery-environment-light.webp',
    alt: '구성안. 베이지 전시 벽의 네 작품. 실제 설치 결과를 증명하지 않습니다.',
    video: null,
    missingVideo: '/preview/slide-2-gallery.mp4',
  },
];

/** Homepage: existing video, then the two current carousel scenes. */
export const HOME_UNIFIED_SCENES: HeroScene[] = [
  {
    id: 'panel-video',
    layout: 'video',
    kicker: '',
    heading: '',
    description: '',
    posterDark: '/preview/plate-install.jpg',
    posterLight: '/preview/plate-install.jpg',
    alt: '구성안. 홈 영상 장면. 실제 설치 결과를 증명하지 않습니다.',
    video: null,
    missingVideo: '',
    primary: { label: '작품 탐색하기 →', to: '#marquee-section' },
  },
  ...HOME_CAROUSEL_SCENES,
];
