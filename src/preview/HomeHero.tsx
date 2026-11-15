import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import type { Product } from '../data/products';
import ConceptGallery from './ConceptGallery';
import VideoHero from './VideoHero';
import { HERO_SCENES, type HeroDestination, type HeroScene } from './heroScenes';
import './reference.css';

const IMAGE_SLIDE_MS = 4000;

const WALL_WORKS: Product[] = [
  ['1', '01'],
  ['2', '02'],
  ['3', '03'],
  ['4', '04'],
].map(([file, label]) => ({
  id: `c18-${label}`,
  title: `미리보기 ${label}`,
  artist: 'METALORA',
  image: `/preview/collection18/artworks/${file}.webp`,
  front_image: `/preview/collection18/artworks/${file}.webp`,
  description: '',
  limited: false,
}));

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return reduce;
}

export default function HomeHero({ scenes = HERO_SCENES }: { scenes?: HeroScene[] }) {
  const { theme } = useTheme();
  const { requestCustomAccess } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [failedVideo, setFailedVideo] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [blockIndex, setBlockIndex] = useState<number | null>(null);
  const videoBlocked = blockIndex === index;
  const count = scenes.length;
  const scene = scenes[index] ?? scenes[0];
  const pausedRef = useRef(paused);
  const suspendedRef = useRef(suspended);
  const pendingRef = useRef(false);
  const countRef = useRef(count);
  const stageRef = useRef<HTMLDivElement>(null);
  const programmaticRef = useRef(false);
  const touchingRef = useRef(false);
  const dragRef = useRef({ x: 0, moved: false });
  pausedRef.current = paused;
  suspendedRef.current = suspended;
  countRef.current = count;

  const mobileRail = () => window.matchMedia('(max-width: 860px)').matches;

  const show = (next: number) => {
    if (count < 1) return;
    pendingRef.current = false;
    setIndex((next + count) % count);
  };

  const advance = () => {
    if (pausedRef.current || suspendedRef.current) {
      pendingRef.current = true;
      return;
    }
    pendingRef.current = false;
    setIndex((current) => (current + 1) % countRef.current);
  };

  const go = (to: HeroDestination) => {
    if (to === 'custom') {
      requestCustomAccess();
      return;
    }
    if (to.startsWith('#')) {
      document.getElementById(to.slice(1))?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    navigate(to);
  };

  useEffect(() => {
    if (paused || suspended || reduce || !pendingRef.current) return;
    pendingRef.current = false;
    setIndex((current) => (current + 1) % count);
  }, [paused, suspended, reduce, count]);

  const videoHolds = scene?.layout === 'video' && !reduce && !videoBlocked;

  useEffect(() => {
    if (reduce || paused || suspended || count < 2 || videoHolds) return;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % count);
    }, IMAGE_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, reduce, paused, suspended, count, videoHolds]);

  const syncFromRail = () => {
    if (programmaticRef.current || touchingRef.current || !mobileRail()) return;
    const stage = stageRef.current;
    if (!stage) return;
    const frames = [...stage.querySelectorAll<HTMLElement>('.n75-hero-frame')];
    const center = stage.scrollLeft + stage.clientWidth / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    frames.forEach((frame, frameIndex) => {
      const mid = frame.offsetLeft + frame.clientWidth / 2;
      const dist = Math.abs(mid - center);
      if (dist < bestDist) {
        best = frameIndex;
        bestDist = dist;
      }
    });
    setIndex((current) => (current === best ? current : best));
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !mobileRail() || touchingRef.current) return;
    const card = stage.querySelectorAll<HTMLElement>('.n75-hero-frame')[index];
    if (!card) return;
    const left = card.offsetLeft - (stage.clientWidth - card.clientWidth) / 2;
    const delta = Math.abs(stage.scrollLeft - left);
    if (delta < 3) return;
    programmaticRef.current = true;
    stage.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
    const release = () => { programmaticRef.current = false; };
    stage.addEventListener('scrollend', release, { once: true });
    const backup = window.setTimeout(release, reduce ? 40 : 520);
    return () => {
      stage.removeEventListener('scrollend', release);
      window.clearTimeout(backup);
    };
  }, [index, reduce]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onScrollEnd = () => syncFromRail();
    stage.addEventListener('scrollend', onScrollEnd);
    return () => stage.removeEventListener('scrollend', onScrollEnd);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea')) return;
      if (!target?.closest('.n75-hero')) return;
      if (event.key === 'ArrowRight') show(index + 1);
      if (event.key === 'ArrowLeft') show(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count]);

  return (
    <section
      className="n75-hero n75-unified-hero"
      data-slide={scene?.id ?? ''}
      aria-roledescription="캐러셀"
      aria-label={`홈 장면, ${index + 1} / ${count}`}
      onMouseEnter={() => setSuspended(true)}
      onMouseLeave={() => setSuspended(false)}
      onFocusCapture={() => setSuspended(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setSuspended(false);
      }}
      onTouchStart={() => {
        touchingRef.current = true;
        setSuspended(true);
      }}
      onTouchEnd={() => {
        touchingRef.current = false;
        window.setTimeout(syncFromRail, 480);
        window.setTimeout(() => setSuspended(false), 520);
      }}
      onTouchCancel={() => {
        touchingRef.current = false;
        setSuspended(false);
      }}
    >
      <p className="sr-only" aria-live="polite">{`장면 ${index + 1} / ${count}`}</p>
      <div
        className="n75-hero-stage"
        ref={stageRef}
        onPointerDown={(event) => { dragRef.current = { x: event.clientX, moved: false }; }}
        onPointerMove={(event) => {
          if (Math.abs(event.clientX - dragRef.current.x) > 8) dragRef.current.moved = true;
        }}
        onClickCapture={(event) => {
          if (!dragRef.current.moved) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current.moved = false;
        }}
      >
      {scenes.map((item, sceneIndex) => {
        const active = sceneIndex === index;
        const poster = theme === 'dark' ? item.posterDark : item.posterLight;
        const playVideo = Boolean(item.video) && !reduce && failedVideo !== item.video;
        return (
          <div key={item.id} id={item.id} className={`n75-hero-frame${active ? ' is-active' : ''}`} aria-hidden={active ? undefined : true}>
            {item.layout === 'video' ? (
              <VideoHero
                embedded
                active={active}
                onEnded={advance}
                onBlocked={() => setBlockIndex(index)}
              />
            ) : item.layout === 'wall' ? (
              <ConceptGallery
                embedded
                products={WALL_WORKS}
                query=""
                onQueryChange={() => {}}
                onClear={() => {}}
                sortBy="latest"
                onSort={() => {}}
                onCustom={() => go('custom')}
                hrefFor={() => '#marquee-section'}
              />
            ) : playVideo ? (
              <video
                className="n75-hero-photo"
                muted
                playsInline
                autoPlay
                loop
                poster={poster}
                src={item.video ?? undefined}
                onError={() => setFailedVideo(item.video)}
              />
            ) : (
              <>
                <img className="n75-hero-photo is-dark" src={item.posterDark} alt={theme === 'dark' && active ? item.alt : ''} />
                <img className="n75-hero-photo is-light" src={item.posterLight} alt={theme === 'light' && active ? item.alt : ''} />
                <div className="n75-hero-copy">
                  <p className="n75-kicker">{item.kicker}</p>
                  <h1>{item.heading}</h1>
                  <p className="n75-lead">{item.description}</p>
                  <div className="n75-hero-actions">
                    <button type="button" className="n75-hero-primary" onClick={() => go(item.primary.to)}>
                      {item.primary.label}
                    </button>
                    {item.secondary ? (
                      <button type="button" className="n75-hero-secondary" onClick={() => go(item.secondary!.to)}>
                        {item.secondary.label}
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
      <button type="button" className="n75-arrow n75-prev" aria-label="이전 장면" onClick={() => show(index - 1)}>‹</button>
      <button type="button" className="n75-arrow n75-next" aria-label="다음 장면" onClick={() => show(index + 1)}>›</button>
      {reduce || count < 2 ? null : (
        <button
          type="button"
          className="n75-auto"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? '자동 재생' : '자동 멈춤'}
        </button>
      )}
      </div>
    </section>
  );
}
