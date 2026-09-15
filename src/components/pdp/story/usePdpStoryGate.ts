import { useEffect, useState } from 'react';
import { usePdpQualityTier } from '../usePdpQualityTier';
import { PDP_STORY_DESKTOP_QUERY, PDP_STORY_LAZY_ROOT_MARGIN } from './constants';

function readDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(PDP_STORY_DESKTOP_QUERY).matches;
}

interface UsePdpStoryGateOptions {
  sectionRef: { current: HTMLElement | null };
  /** Rebinds intersection when the desktop section mounts. */
  sectionEl: HTMLElement | null;
  viewerOpen: boolean;
  roomPreviewOpen: boolean;
  hasFrontTexture: boolean;
}

/**
 * Story Canvas may pre-mount when the stage is near.
 * Visibility is gated separately by story entry (`entered`) plus progress opacity.
 * `reducedMotion` selects the static story; it does not gate the Canvas alone,
 * because a pinned stage with no Canvas would leave the beats unreadable.
 */
export function usePdpStoryGate({
  sectionRef,
  sectionEl,
  viewerOpen,
  roomPreviewOpen,
  hasFrontTexture,
}: UsePdpStoryGateOptions): {
  desktop: boolean;
  allowCanvas: boolean;
  near: boolean;
  reducedMotion: boolean;
} {
  const quality = usePdpQualityTier();
  const [desktop, setDesktop] = useState(readDesktop);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(PDP_STORY_DESKTOP_QUERY);
    const onChange = () => setDesktop(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      media.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);

  useEffect(() => {
    const section = sectionEl ?? sectionRef.current;
    if (!section || !desktop) {
      setNear(false);
      return undefined;
    }

    const readNear = () => {
      const rect = section.getBoundingClientRect();
      return rect.bottom > -80 && rect.top < window.innerHeight + 80;
    };

    const observer = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting) || readNear()),
      { root: null, rootMargin: PDP_STORY_LAZY_ROOT_MARGIN, threshold: 0 },
    );
    observer.observe(section);
    setNear(readNear());

    const onScroll = () => setNear(readNear());
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [desktop, sectionEl, sectionRef]);

  const allowCanvas =
    desktop &&
    near &&
    hasFrontTexture &&
    quality.recommendMount &&
    !quality.reducedMotion &&
    !viewerOpen &&
    !roomPreviewOpen;

  return { desktop, allowCanvas, near, reducedMotion: quality.reducedMotion };
}
