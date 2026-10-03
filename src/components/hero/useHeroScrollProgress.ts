import { useEffect, useRef } from 'react';
import { useScroll, useSpring, type MotionValue } from 'framer-motion';
import { mapSectionToCollectionCover, writeHeroScrollProgress } from './heroScrollMapping';
import type { HeroSpatialProgressRef } from './types';

/** Scroll tunnel height — extra viewport scroll while sticky hero is pinned */
export const HERO_SCROLL_TUNNEL_VH = 380;
export const HERO_SCROLL_TUNNEL_VH_REDUCED = 160;

interface UseHeroScrollProgressOptions {
  scrollSectionRef: React.RefObject<HTMLElement | null>;
  devStoryOverride: number | null;
  devCoverOverride: number | null;
  reducedMotion: boolean;
}

function createProgressState() {
  return {
    sectionProgress: 0,
    heroStoryProgress: 0,
    collectionCoverProgress: 0,
    collectionLayoutProgress: 0,
    spatialProgress: 0,
  };
}

/**
 * Native vertical scroll → sprung visual progress + unsprung Home layout cover.
 * Visual: scrollYProgress → spring → heroStory / collectionCoverProgress.
 * Layout: scrollYProgress → mapSectionToCollectionCover (no spring).
 */
export function useHeroScrollProgress({
  scrollSectionRef,
  devStoryOverride,
  devCoverOverride,
  reducedMotion,
}: UseHeroScrollProgressOptions): {
  spatialProgressRef: HeroSpatialProgressRef;
  scrollProgress: MotionValue<number>;
} {
  const spatialProgressRef = useRef(createProgressState());

  const { scrollYProgress } = useScroll({
    target: scrollSectionRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: reducedMotion ? 140 : 48,
    damping: reducedMotion ? 42 : 34,
    mass: reducedMotion ? 0.75 : 1.05,
    restDelta: 0.0001,
  });

  useEffect(() => {
    const apply = (section: number) => {
      writeHeroScrollProgress(
        spatialProgressRef.current,
        section,
        devStoryOverride,
        devCoverOverride,
      );
    };

    apply(smoothProgress.get());
    const unsubscribe = smoothProgress.on('change', apply);
    return unsubscribe;
  }, [devStoryOverride, devCoverOverride, smoothProgress]);

  useEffect(() => {
    const applyLayout = (rawSection: number) => {
      spatialProgressRef.current.collectionLayoutProgress = mapSectionToCollectionCover(rawSection);
    };

    applyLayout(scrollYProgress.get());
    const unsubscribe = scrollYProgress.on('change', applyLayout);
    return unsubscribe;
  }, [scrollYProgress]);

  return { spatialProgressRef, scrollProgress: smoothProgress };
}
