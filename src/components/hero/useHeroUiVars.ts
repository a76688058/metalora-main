import { useEffect, useRef } from 'react';

import { evaluateHeroUiChannels } from './choreography';
import { evaluateHeroIntegration } from './heroIntegration';
import { HERO_WALL_ANCHOR } from './backdropAsset';

import type { HeroSpatialProgressRef } from './types';

/** Public Home ↔ Hero layout CSS channels. A4 publishes → A2/Home consumes. */
export const HERO_LAYOUT_VARS = Object.freeze({
  curtainRise: '--hero-curtain-rise',
  marqueeEnter: '--hero-marquee-enter',
  artworksEnter: '--hero-artworks-enter',
  artworksSubtitleEnter: '--hero-artworks-subtitle-enter',
} as const);

/** Sync spatial progress → CSS custom properties without React re-renders */
export function useHeroUiVars(
  viewportRef: React.RefObject<HTMLElement | null>,
  spatialProgressRef: HeroSpatialProgressRef,
  commerceBoundsRef?: React.MutableRefObject<{
    x: number;
    y: number;
    w: number;
    h: number;
  }>,
): void {
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const el = viewportRef.current;
      if (el) {
        const { heroStoryProgress, collectionCoverProgress } = spatialProgressRef.current;
        const ui = evaluateHeroUiChannels(heroStoryProgress, collectionCoverProgress);
        const integration = evaluateHeroIntegration(heroStoryProgress);

        el.style.setProperty('--hero-p', String(heroStoryProgress));
        el.style.setProperty('--hero-section-p', String(spatialProgressRef.current.sectionProgress));
        el.style.setProperty('--hero-cover-p', String(collectionCoverProgress));
        el.style.setProperty('--hero-scroll-cue-opacity', String(ui.scrollCueOpacity));
        el.style.setProperty('--hero-commerce-opacity', String(ui.commerceOpacity));
        el.style.setProperty(
          '--hero-commerce-pe',
          ui.commerceOpacity < 0.05 ? 'none' : 'auto',
        );
        el.style.setProperty('--hero-shell-opacity', String(ui.shellOpacity));
        el.style.setProperty('--hero-collection-enter', String(ui.collectionEnter));
        el.style.setProperty('--hero-curtain-rise', String(ui.curtainRise));
        el.style.setProperty('--hero-marquee-enter', String(ui.marqueeEnter));
        el.style.setProperty('--hero-artworks-enter', String(ui.artworksEnter));
        el.style.setProperty(
          '--hero-artworks-subtitle-enter',
          String(ui.artworksSubtitleEnter),
        );
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty(HERO_LAYOUT_VARS.curtainRise, String(ui.curtainRise));
        rootStyle.setProperty(HERO_LAYOUT_VARS.marqueeEnter, String(ui.marqueeEnter));
        rootStyle.setProperty(HERO_LAYOUT_VARS.artworksEnter, String(ui.artworksEnter));
        rootStyle.setProperty(
          HERO_LAYOUT_VARS.artworksSubtitleEnter,
          String(ui.artworksSubtitleEnter),
        );

        el.style.setProperty('--hero-anchor-x', `${HERO_WALL_ANCHOR.x * 100}%`);
        el.style.setProperty('--hero-anchor-y', `${HERO_WALL_ANCHOR.y * 100}%`);
        el.style.setProperty('--hero-backdrop-scale', String(integration.cameraApproachScale));
        el.style.setProperty('--hero-backdrop-tx', `${integration.backdropTranslateX}%`);
        el.style.setProperty('--hero-backdrop-ty', `${integration.backdropTranslateY}%`);
        el.style.setProperty('--hero-room-dim', String(integration.roomDim));
        el.style.setProperty('--hero-room-opacity', String(integration.roomOpacity));

        const bounds = commerceBoundsRef?.current;
        if (bounds) {
          // Commerce group: exact projected artwork horizontal center
          const top = Math.max(0.2, Math.min(0.88, bounds.y + bounds.h * 0.5 + 0.04));
          el.style.setProperty('--hero-commerce-left', `${bounds.x * 100}%`);
          el.style.setProperty('--hero-commerce-top', `${top * 100}%`);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      const rootStyle = document.documentElement.style;
      rootStyle.removeProperty(HERO_LAYOUT_VARS.curtainRise);
      rootStyle.removeProperty(HERO_LAYOUT_VARS.marqueeEnter);
      rootStyle.removeProperty(HERO_LAYOUT_VARS.artworksEnter);
      rootStyle.removeProperty(HERO_LAYOUT_VARS.artworksSubtitleEnter);
      rootStyle.removeProperty('--hero-collection-enter');
    };
  }, [viewportRef, spatialProgressRef, commerceBoundsRef]);
}
