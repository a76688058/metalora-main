import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Link } from 'react-router-dom';
import * as THREE from 'three';

import { useTheme } from '../../context/ThemeContext';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

import { HERO_ROOM_BACKDROP_PRIMARY, HERO_FIXED_CAMERA } from './backdropAsset';
import {
  KEYFRAME_DESIRE_MID,
  KEYFRAME_DISCOVER,
  KEYFRAME_EXIT_MID,
  KEYFRAME_HOLD_MID,
  KEYFRAME_LIGHT_MID,
  KEYFRAME_ROOM,
  KEYFRAME_ROOM_END,
  KEYFRAME_HOLD,
  KEYFRAME_LIGHT,
  KEYFRAME_DESIRE,
  KEYFRAME_EXIT,
  KEYFRAME_EXIT_END,
} from './constants';
import { readDevHeroCoverOverride, readDevHeroProgressOverride, isDevHeroAuthoringEnabled } from './devProgress';
import HeroSpatialScene from './HeroSpatialScene';
import { loadSharedRoomTexture } from './HeroRoomBackdrop';
import {
  HERO_SCROLL_TUNNEL_VH,
  HERO_SCROLL_TUNNEL_VH_REDUCED,
  useHeroScrollProgress,
} from './useHeroScrollProgress';
import { useHeroProduct } from './useHeroProduct';
import { heroCanvasDpr, useHeroQualityTier } from './useHeroQualityTier';
import { useHeroUiVars } from './useHeroUiVars';
import type { HeroCommerceBounds } from './types';

/** PHASE 4B: frameloop="always" is temporary until visual QA passes (PHASE 4B-PERF). */
const HERO_FRAMELOOP: 'always' = 'always';

const DEV_SCRUB_POINTS = [
  { label: '0', at: KEYFRAME_ROOM },
  { label: '.18', at: KEYFRAME_ROOM_END },
  { label: '.38', at: KEYFRAME_HOLD },
  { label: '.48', at: KEYFRAME_HOLD_MID },
  { label: '.58', at: KEYFRAME_LIGHT },
  { label: '.67', at: KEYFRAME_LIGHT_MID },
  { label: '.76', at: KEYFRAME_DESIRE },
  { label: '.85', at: KEYFRAME_DESIRE_MID },
  { label: '.90', at: KEYFRAME_EXIT },
  { label: '.93', at: 0.93 },
  { label: '.95', at: 0.95 },
  { label: '.97', at: 0.97 },
  { label: '.985', at: 0.985 },
  { label: '1', at: KEYFRAME_EXIT_END },
] as const;

function HeroProgressMicroNav({ progress }: { progress: number }) {
  const stages = [
    { label: 'ROOM', at: KEYFRAME_ROOM },
    { label: 'DISCOVER', at: KEYFRAME_DISCOVER },
    { label: 'HOLD', at: KEYFRAME_HOLD },
    { label: 'LIGHT', at: KEYFRAME_LIGHT },
    { label: 'DESIRE', at: KEYFRAME_DESIRE },
  ];

  const active =
    progress < KEYFRAME_DISCOVER
      ? 0
      : progress < KEYFRAME_HOLD
        ? 1
        : progress < KEYFRAME_LIGHT
          ? 2
          : progress < KEYFRAME_DESIRE
            ? 3
            : 4;

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-2 text-[9px] font-bold tracking-[0.3em] uppercase opacity-[var(--hero-shell-opacity,1)]"
      aria-hidden
    >
      {stages.map((s, i) => (
        <span key={s.label} className={i === active ? 'text-current' : 'text-current/35'}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function HeroStaticRoomBackground({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden ${isDark ? 'bg-[#0a0b0d]' : 'bg-[#f5f2ee]'}`}
      aria-hidden
    >
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transformOrigin: 'var(--hero-anchor-x, 50%) var(--hero-anchor-y, 39%)',
          transform:
            'translate3d(var(--hero-backdrop-tx, 0%), var(--hero-backdrop-ty, 0%), 0) scale(var(--hero-backdrop-scale, 1))',
          opacity: 'var(--hero-room-opacity, 1)',
        }}
      >
        <img
          src={HERO_ROOM_BACKDROP_PRIMARY}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 bg-[#1a1410]"
        style={{ opacity: 'var(--hero-room-dim, 0)' }}
        aria-hidden
      />
    </div>
  );
}

function formatHeroPrice(price: number): string {
  return new Intl.NumberFormat('ko-KR').format(price);
}

export default function HeroSpatial() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const reducedMotion = usePrefersReducedMotion();
  const quality = useHeroQualityTier(reducedMotion);
  const { selection: heroProduct, isReady: heroProductReady, textureReady } = useHeroProduct();

  const scrollSectionRef = useRef<HTMLElement>(null);
  const stickyViewportRef = useRef<HTMLDivElement>(null);
  const commerceBoundsRef = useRef<HeroCommerceBounds>({ x: 0.5, y: 0.5, w: 0.2, h: 0.35 });

  const [devStoryOverride, setDevStoryOverride] = useState<number | null>(() =>
    readDevHeroProgressOverride(),
  );
  const [devCoverOverride, setDevCoverOverride] = useState<number | null>(() =>
    readDevHeroCoverOverride(),
  );
  const [devProgressDisplay, setDevProgressDisplay] = useState({
    story: 0,
    cover: 0,
    section: 0,
  });
  const [canvasMounted, setCanvasMounted] = useState(false);

  const { spatialProgressRef } = useHeroScrollProgress({
    scrollSectionRef,
    devStoryOverride,
    devCoverOverride,
    reducedMotion,
  });

  useEffect(() => {
    loadSharedRoomTexture().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!heroProductReady || !textureReady) return;
    const id = requestAnimationFrame(() => setCanvasMounted(true));
    return () => cancelAnimationFrame(id);
  }, [heroProductReady, textureReady]);

  useHeroUiVars(stickyViewportRef, spatialProgressRef, commerceBoundsRef);

  useEffect(() => {
    if (!isDevHeroAuthoringEnabled()) return;
    let raf = 0;
    const tick = () => {
      const prog = spatialProgressRef.current;
      setDevProgressDisplay({
        story: prog.heroStoryProgress,
        cover: prog.collectionCoverProgress,
        section: prog.sectionProgress,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spatialProgressRef]);

  useEffect(() => {
    if (!isDevHeroAuthoringEnabled()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const step = e.shiftKey ? 0.25 : 0.05;
      const current = spatialProgressRef.current.heroStoryProgress;
      if (e.key === '[') {
        setDevStoryOverride((v) => Math.max(0, (v ?? current) - step));
      } else if (e.key === ']') {
        setDevStoryOverride((v) => Math.min(1, (v ?? current) + step));
      } else if (e.key === '\\') {
        setDevStoryOverride(null);
        setDevCoverOverride(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spatialProgressRef]);

  const navProgress = devStoryOverride ?? devProgressDisplay.story;
  const tunnelVh = reducedMotion ? HERO_SCROLL_TUNNEL_VH_REDUCED : HERO_SCROLL_TUNNEL_VH;

  const scrollToCollection = useCallback(() => {
    const el = document.getElementById('marquee-section');
    if (!el) return;
    const headerOffset = 100;
    const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  return (
    <section
      ref={scrollSectionRef}
      aria-label="METALORA spatial hero"
      className={`relative w-full max-w-[100vw] ${isDark ? 'bg-[#0a0b0d]' : 'bg-[#f5f2ee]'}`}
      style={{
        height: `${tunnelVh}vh`,
        /* Overlap the following Home collection by one sticky viewport so curtain-rise can cover it. */
        marginBottom: '-100svh',
      }}
    >
      <div
        ref={stickyViewportRef}
        className={`sticky top-0 z-[1] h-[100svh] w-full overflow-hidden ${
          isDark ? 'bg-[#0a0b0d] text-white' : 'bg-[#f5f2ee] text-black'
        }`}
        style={{
          ['--hero-anchor-x' as string]: '50%',
          ['--hero-anchor-y' as string]: '39%',
          ['--hero-backdrop-scale' as string]: '1',
          ['--hero-backdrop-tx' as string]: '0%',
          ['--hero-backdrop-ty' as string]: '0%',
          ['--hero-room-dim' as string]: '0',
          ['--hero-room-opacity' as string]: '1',
          ['--hero-commerce-left' as string]: '50%',
          ['--hero-commerce-top' as string]: '62%',
          ['--hero-collection-enter' as string]: '0',
        }}
      >
        <div className="absolute inset-0 z-0">
          <HeroStaticRoomBackground isDark={isDark} />
        </div>

        <div className="absolute inset-0 z-[1]">
          {canvasMounted && heroProduct ? (
            <Canvas
              className="block h-full w-full"
              style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }}
              dpr={heroCanvasDpr(quality)}
              frameloop={HERO_FRAMELOOP}
              camera={{
                fov: HERO_FIXED_CAMERA.fov,
                near: HERO_FIXED_CAMERA.near,
                far: HERO_FIXED_CAMERA.far,
                position: [...HERO_FIXED_CAMERA.position],
              }}
              gl={{
                antialias: quality !== 'low',
                alpha: true,
                powerPreference: 'high-performance',
                preserveDrawingBuffer: true,
              }}
              onCreated={({ gl, scene, camera }) => {
                gl.setClearColor(0x000000, 0);
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.render(scene, camera);
              }}
            >
              <HeroSpatialScene
                spatialProgressRef={spatialProgressRef}
                quality={quality}
                theme={theme}
                reducedMotion={reducedMotion}
                heroProduct={heroProduct}
                commerceBoundsRef={commerceBoundsRef}
              />
            </Canvas>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-0 z-20">
          {isDevHeroAuthoringEnabled() ? (
            <div className="absolute right-6 top-6 md:right-10 md:top-10">
              <HeroProgressMicroNav progress={navProgress} />
            </div>
          ) : null}

          <h1 className="sr-only">METALORA — Premium Metal Artworks</h1>

          {/* Commerce group — horizontal center tracks projected artwork center */}
          {heroProduct ? (
            <div
              className="pointer-events-auto absolute flex w-max max-w-[min(92vw,360px)] flex-col items-center text-center"
              style={{
                left: 'var(--hero-commerce-left, 50%)',
                top: 'var(--hero-commerce-top, 62%)',
                opacity: 'var(--hero-commerce-opacity, 0)',
                pointerEvents: 'var(--hero-commerce-pe, none)' as React.CSSProperties['pointerEvents'],
                transform: 'translateX(-50%)',
              }}
            >
              <p
                className={`text-[13px] font-semibold tracking-wide md:text-sm ${
                  isDark ? 'text-white/95' : 'text-black/90'
                }`}
                style={{
                  textShadow: isDark
                    ? '0 1px 12px rgba(0,0,0,0.45)'
                    : '0 1px 10px rgba(255,255,255,0.7)',
                }}
              >
                {heroProduct.product.title}
              </p>
              <p
                className={`mt-1 text-[11px] font-medium tracking-wider ${
                  isDark ? 'text-white/72' : 'text-black/65'
                }`}
                style={{
                  textShadow: isDark
                    ? '0 1px 8px rgba(0,0,0,0.35)'
                    : '0 1px 8px rgba(255,255,255,0.55)',
                }}
              >
                ₩{formatHeroPrice(heroProduct.price)}
              </p>
              <Link
                to={heroProduct.pdpPath}
                className={`mt-3 inline-flex min-h-11 min-w-[148px] items-center justify-center border px-5 text-[10px] font-bold tracking-[0.32em] uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isDark
                    ? 'border-white/18 bg-[#1a1c20]/78 text-white/95 backdrop-blur-sm hover:bg-[#23262c]/88 focus-visible:outline-white'
                    : 'border-black/22 bg-[#2a2a2e]/82 text-white/95 backdrop-blur-sm hover:bg-[#35353a]/90 focus-visible:outline-black'
                }`}
                onClick={() =>
                  sessionStorage.setItem('homeScrollPosition', window.scrollY.toString())
                }
              >
                View Artwork →
              </Link>
            </div>
          ) : null}

          {!reducedMotion ? (
            <p
              className={`absolute bottom-8 left-1/2 -translate-x-1/2 text-center text-[9px] font-medium tracking-[0.5em] uppercase ${
                isDark ? 'text-white/30' : 'text-black/28'
              }`}
              style={{ opacity: 'var(--hero-scroll-cue-opacity, 1)' }}
              aria-hidden
            >
              Scroll ↓
            </p>
          ) : (
            <button
              type="button"
              onClick={scrollToCollection}
              className={`pointer-events-auto absolute bottom-8 left-1/2 min-h-11 -translate-x-1/2 border px-6 text-[10px] font-bold tracking-[0.3em] uppercase ${
                isDark
                  ? 'border-white/20 bg-white/5 hover:bg-white/10'
                  : 'border-black/12 bg-black/5 hover:bg-black/10'
              }`}
            >
              Collection
            </button>
          )}
        </div>

        {isDevHeroAuthoringEnabled() ? (
          <div className="pointer-events-auto absolute bottom-4 left-4 z-30 flex max-w-[min(100%,480px)] flex-wrap items-center gap-1.5 rounded bg-black/70 px-2.5 py-2 text-[9px] text-white">
            <span className="mr-1">
              story={devProgressDisplay.story.toFixed(2)} cover=
              {devProgressDisplay.cover.toFixed(2)} sec=
              {devProgressDisplay.section.toFixed(2)}
            </span>
            {heroProduct ? (
              <span className="opacity-70">{heroProduct.product.title.slice(0, 12)}</span>
            ) : null}
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((devStoryOverride ?? devProgressDisplay.story) * 100)}
              onChange={(e) => setDevStoryOverride(Number(e.target.value) / 100)}
              className="w-20"
            />
            {DEV_SCRUB_POINTS.map((pt) => (
              <button
                key={pt.label}
                type="button"
                className="underline opacity-80 hover:opacity-100"
                onClick={() => setDevStoryOverride(pt.at)}
              >
                {pt.label}
              </button>
            ))}
            <span className="opacity-50">|</span>
            {[0, 0.25, 0.5, 0.75, 1].map((c) => (
              <button
                key={c}
                type="button"
                className="underline opacity-80 hover:opacity-100"
                onClick={() => {
                  setDevStoryOverride(1);
                  setDevCoverOverride(c);
                }}
              >
                c{c}
              </button>
            ))}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setDevStoryOverride(null);
                setDevCoverOverride(null);
              }}
            >
              scroll
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
