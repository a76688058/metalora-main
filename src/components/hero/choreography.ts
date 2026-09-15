import { smoothstep } from './curves';
import type { HeroIntegrationChannels } from './heroIntegration';
import { evaluateHeroIntegrationInto } from './heroIntegration';
import {
  KEYFRAME_DESIRE,
  KEYFRAME_ROOM_END,
} from './constants';

/** @deprecated Use HeroIntegrationChannels — kept for gradual migration */
export type HeroChoreographyChannels = HeroIntegrationChannels;

export function evaluateHeroChoreography(p: number): HeroIntegrationChannels {
  const out = {} as HeroIntegrationChannels;
  evaluateHeroChoreographyInto(p, out);
  return out;
}

export function evaluateHeroChoreographyInto(p: number, out: HeroIntegrationChannels): void {
  evaluateHeroIntegrationInto(p, out);
}

export function evaluateHeroUiChannels(
  storyP: number,
  coverP: number,
): {
  scrollCueOpacity: number;
  commerceOpacity: number;
  shellOpacity: number;
  exitOpacity: number;
  /** @deprecated use curtainRise */
  collectionEnter: number;
  curtainRise: number;
  marqueeEnter: number;
  artworksEnter: number;
  artworksSubtitleEnter: number;
} {
  const commerceIn = smoothstep(0.72, 0.78, storyP);
  const commercePeak = 0.72 + smoothstep(0.78, 0.86, storyP) * 0.28;

  // Collection choreography driven by cover phase only
  const curtainRise = coverP;
  const marqueeEnter = smoothstep(0.25, 0.5, coverP);
  const artworksEnter = smoothstep(0.6, 0.8, coverP);
  const artworksSubtitleEnter = smoothstep(0.85, 1, coverP);

  return {
    scrollCueOpacity: 1 - smoothstep(0.08, KEYFRAME_ROOM_END, storyP),
    commerceOpacity: Math.min(1, commerceIn * commercePeak),
    shellOpacity: 1,
    exitOpacity: 1,
    collectionEnter: curtainRise,
    curtainRise,
    marqueeEnter,
    artworksEnter,
    artworksSubtitleEnter,
  };
}
