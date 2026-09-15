import { useEffect, type RefObject } from 'react';
import {
  applyMobileStory,
  collectMobileStoryEls,
  createMobileVisual,
  mobileVisualAt,
} from './mobileChoreography';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function measureShellPx(): number {
  const shellEl = document.querySelector('main.shell-offset, .shell-offset');
  if (shellEl) {
    const paddingTop = parseFloat(getComputedStyle(shellEl).paddingTop);
    if (Number.isFinite(paddingTop) && paddingTop > 0) return paddingTop;
  }
  const header = document.querySelector('header');
  if (!header) return 96;
  return header.getBoundingClientRect().height;
}

function setWillChange(els: ReturnType<typeof collectMobileStoryEls>, on: boolean): void {
  if (!els) return;
  const value = on ? 'transform' : '';
  els.envelope.style.willChange = value;
  els.rig.style.willChange = value;
  els.plates.wall.style.willChange = value;
  els.plates.sticker.style.willChange = value;
  els.plates.wallMagnet.style.willChange = value;
  els.plates.artMagnet.style.willChange = value;
  els.plates.artwork.style.willChange = value;
}

/**
 * Scroll → direct compositor styles. No React state. No damping.
 * Progress is derived from cached section geometry + scrollY.
 * rAF only coalesces scroll while the section is near; it is not a standing loop.
 */
export function useMobileStoryScroll(
  sectionRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return undefined;

    const els = collectMobileStoryEls(stage);
    if (!els) return undefined;

    const visual = createMobileVisual();
    let shellPx = 96;
    let sectionTop = 0;
    let sectionHeight = 1;
    let viewportH = window.innerHeight;
    let near = false;
    let frame = 0;
    let lastProgress = Number.NaN;

    const cacheMetrics = () => {
      shellPx = measureShellPx();
      viewportH = window.innerHeight;
      const rect = section.getBoundingClientRect();
      sectionTop = rect.top + window.scrollY;
      sectionHeight = rect.height;
    };

    const progressFromScroll = () => {
      const stickyHeight = Math.max(1, viewportH - shellPx);
      const travel = Math.max(1, sectionHeight - stickyHeight);
      return clamp01((window.scrollY + shellPx - sectionTop) / travel);
    };

    const paint = () => {
      frame = 0;
      const progress = progressFromScroll();
      const rounded = Math.round(progress * 10000) / 10000;
      if (rounded === lastProgress) return;
      lastProgress = rounded;
      applyMobileStory(els, mobileVisualAt(rounded, visual));
    };

    const onScroll = () => {
      if (!near) return;
      if (frame) return;
      frame = requestAnimationFrame(paint);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        near = Boolean(entry?.isIntersecting);
        stage.dataset.pdpStoryNear = near ? 'true' : 'false';
        cacheMetrics();
        setWillChange(els, near);
        lastProgress = Number.NaN;
        if (near) {
          paint();
        } else {
          if (frame) {
            cancelAnimationFrame(frame);
            frame = 0;
          }
          paint();
        }
      },
      { root: null, rootMargin: '80px 0px', threshold: 0 },
    );
    io.observe(section);

    const onResize = () => {
      cacheMetrics();
      lastProgress = Number.NaN;
      paint();
    };

    cacheMetrics();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });
    paint();

    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      setWillChange(els, false);
    };
  }, [enabled, sectionRef, stageRef]);
}
