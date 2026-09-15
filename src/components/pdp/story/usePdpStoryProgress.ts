import { useEffect, useState, type RefObject } from 'react';
import { SURFACE_PROGRESS_DAMPING_TAU } from './constants';

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

function readStoryRuntime(section: HTMLElement, shellPx: number): {
  progress: number;
  entered: boolean;
} {
  const rect = section.getBoundingClientRect();
  const stickyHeight = Math.max(1, window.innerHeight - shellPx);
  const travel = Math.max(1, rect.height - stickyHeight);
  const raw = (shellPx - rect.top) / travel;
  const entered = rect.top <= shellPx + 2;
  return {
    progress: entered ? clamp01(raw) : 0,
    entered,
  };
}

/**
 * Native document scroll → 0–1 through the story section.
 * Does not intercept wheel or lock body.
 * Progress is damped toward scroll; scroll remains the driver.
 */
export function usePdpStoryProgress(
  sectionRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  sectionEl: HTMLElement | null,
): {
  progress: number;
  entered: boolean;
} {
  const [progress, setProgress] = useState(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      setEntered(false);
      return undefined;
    }
    const section = sectionEl ?? sectionRef.current;
    if (!section) return undefined;

    let frame = 0;
    let smoothed = 0;
    let lastTs = performance.now();
    let lastProgress = Number.NaN;
    let lastEntered = false;

    const publish = (nextProgress: number, nextEntered: boolean) => {
      const rounded = Math.round(nextProgress * 10000) / 10000;
      if (rounded === lastProgress && nextEntered === lastEntered) return;
      lastProgress = rounded;
      lastEntered = nextEntered;
      setProgress(rounded);
      setEntered(nextEntered);
    };

    const apply = (now: number) => {
      const elapsed = Math.max(0, (now - lastTs) / 1000);
      lastTs = now;
      const live = readStoryRuntime(section, measureShellPx());
      const target = live.entered ? live.progress : 0;
      const starved = elapsed > 0.1;
      const dt = Math.min(0.048, elapsed);
      const k = starved ? 1 : 1 - Math.exp(-dt / SURFACE_PROGRESS_DAMPING_TAU);
      smoothed += (target - smoothed) * k;
      if (Math.abs(target - smoothed) < 0.0004) smoothed = target;
      publish(smoothed, live.entered);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      apply(now);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        const near = Boolean(entry?.isIntersecting);
        if (near && !frame) {
          lastTs = performance.now();
          frame = requestAnimationFrame(tick);
        }
        if (!near && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          apply(performance.now());
        }
      },
      { root: null, rootMargin: '80px 0px', threshold: 0 },
    );
    io.observe(section);

    apply(performance.now());

    const onScroll = () => apply(performance.now());
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, sectionEl, sectionRef]);

  return { progress, entered };
}
