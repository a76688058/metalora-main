import React, { useRef } from 'react';
import {
  EDGE_DISCLOSURE,
  EDGE_MEASURE_PRIMARY,
  EDGE_MEASURE_SECONDARY,
  MAGNETIC_DETACH_DISCLOSURE,
  MAGNETIC_EXPLODE_DISCLOSURE,
  MAGNETIC_HEADLINE,
  MAGNETIC_LAYER_LABELS,
  MAGNETIC_STACK_COPY,
  STORY_LAYER_TONES,
  STORY_MAGNET_SIZE_MM,
  STORY_PANEL_HEIGHT_MM,
  STORY_PANEL_WIDTH_MM,
  STORY_STICKER_HEIGHT_MM,
  STORY_STICKER_WIDTH_MM,
  STORY_WALL_FACE_SCALE,
  STORY_WALL_SURFACE_COLOR,
  SURFACE_HEADLINE,
} from './constants';
import { MAGNETIC_CALLOUT_LINE_SPAN } from './magneticLabels';
import { getMobileStorySectionTravelVh, MOBILE_MAG_LAYER_ANCHOR, MOBILE_PERSPECTIVE_PX } from './mobileChoreography';
import { useMobileStoryScroll } from './useMobileStoryScroll';

/**
 * Compact-normal cinematic story. Zero WebGL. Reduced-motion still uses
 * PdpStoryStatic. Desktop WebGL is a separate branch and is not imported here.
 *
 * A single perspective scene (envelope) holds one preserve-3d rig. Five flat
 * planes separate purely along local Z — the same geometry the desktop rig uses —
 * so the 3/4 explosion is a real perspective projection, not a flat X fan or the
 * R1 six-face textured cuboid. Scroll writes transform/opacity on cached nodes.
 */

const MAGNET_RATIO = STORY_MAGNET_SIZE_MM / STORY_PANEL_WIDTH_MM;
const STICKER_RATIO = STORY_STICKER_WIDTH_MM / STORY_PANEL_WIDTH_MM;
const WALL_WIDTH_RATIO = STORY_WALL_FACE_SCALE.x;
const WALL_ASPECT = `${STORY_PANEL_WIDTH_MM * STORY_WALL_FACE_SCALE.x} / ${STORY_PANEL_HEIGHT_MM * STORY_WALL_FACE_SCALE.y}`;

interface PdpStoryMobileProps {
  frontTextureUrl: string | null;
  orientation: 'portrait' | 'landscape';
}

function panelAspect(orientation: 'portrait' | 'landscape'): string {
  return orientation === 'landscape'
    ? `${STORY_PANEL_HEIGHT_MM} / ${STORY_PANEL_WIDTH_MM}`
    : `${STORY_PANEL_WIDTH_MM} / ${STORY_PANEL_HEIGHT_MM}`;
}

function LayerAnchor({ x, y }: { x: number; y: number }) {
  return (
    <span
      data-ms="layer-anchor"
      className="pointer-events-none absolute z-[1] block opacity-0"
      style={{
        left: `calc(${(x * 100).toFixed(2)}% - 1px)`,
        top: `calc(${(y * 100).toFixed(2)}% - 1px)`,
        width: 2,
        height: 2,
      }}
    />
  );
}

function AnatomyPlate({
  name,
  glint,
  widthRatio,
  aspect,
  tone,
  film,
  wall,
  anchor,
}: {
  name: string;
  glint: string;
  widthRatio: number;
  aspect: string;
  tone: string;
  film?: boolean;
  wall?: boolean;
  anchor: { x: number; y: number };
}) {
  return (
    <div
      aria-hidden="true"
      data-ms={name}
      className="absolute left-1/2 top-1/2 overflow-hidden"
      style={{
        width: `calc(var(--panel-w) * ${widthRatio})`,
        aspectRatio: aspect,
        backgroundColor: tone,
        backgroundImage: wall
          ? 'linear-gradient(180deg, rgb(255 252 248 / 0.10) 0%, rgb(255 255 255 / 0) 45%, rgb(40 28 16 / 0.04) 100%)'
          : undefined,
        opacity: 0,
        boxShadow: film ? 'inset 0 0 0 1px rgb(18 22 28 / 0.08)' : undefined,
        transform: 'translate(-50%, -50%) translateZ(0)',
      }}
    >
      <div
        data-ms={glint}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          backgroundImage:
            'linear-gradient(118deg, rgb(255 255 255 / 0) 30%, rgb(255 255 255 / 0.12) 42%, rgb(255 255 255 / 0.95) 50%, rgb(255 255 255 / 0.12) 58%, rgb(255 255 255 / 0) 72%)',
        }}
      />
      <LayerAnchor x={anchor.x} y={anchor.y} />
    </div>
  );
}

export function PdpStoryMobile({ frontTextureUrl, orientation }: PdpStoryMobileProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const travelVh = getMobileStorySectionTravelVh();
  const aspect = panelAspect(orientation);

  useMobileStoryScroll(sectionRef, stageRef, true);

  const labelDefs = [
    { ms: 'label-wall', id: 'wall' as const },
    { ms: 'label-sticker', id: 'sticker' as const },
    { ms: 'label-wm', id: 'wallMagnet' as const },
    { ms: 'label-am', id: 'artMagnet' as const },
    { ms: 'label-art', id: 'artwork' as const },
  ];

  return (
    <section
      ref={sectionRef}
      aria-labelledby="pdp-story-surface-heading pdp-story-edge-heading pdp-story-magnetic-heading"
      data-pdp-story="mobile"
      data-pdp-story-canvas="absent"
      className="relative bg-canvas text-text-primary min-[1100px]:hidden"
      style={{ height: `calc(100svh - var(--shell-offset) + ${travelVh}vh)` }}
    >
      <div
        ref={stageRef}
        data-pdp-story-stage=""
        className="sticky top-[var(--shell-offset)] z-0 h-[calc(100svh-var(--shell-offset))]"
      >
        <a
          href="#pdp-story-end"
          className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-canvas focus:px-3 focus:py-2"
        >
          제품 이야기 건너뛰기
        </a>
        <div className="relative h-full w-full overflow-hidden">
          {/* Scene: supplies the shared camera perspective for the 3/4 explosion. */}
          <div
            data-ms="envelope"
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              perspective: `${MOBILE_PERSPECTIVE_PX}px`,
              perspectiveOrigin: '50% 44%',
            }}
          >
            <div
              data-ms="rig"
              className="absolute left-1/2 top-[46%]"
              style={{
                width: 'var(--panel-w)',
                aspectRatio: aspect,
                transformStyle: 'preserve-3d',
                transform: 'translate(-50%, -50%) translate3d(0, -2%, 0) rotateY(2deg) scale(0.9)',
              }}
            >
              <AnatomyPlate
                name="plate-wall"
                glint="glint-wall"
                widthRatio={WALL_WIDTH_RATIO}
                aspect={WALL_ASPECT}
                tone={STORY_WALL_SURFACE_COLOR}
                wall
                anchor={MOBILE_MAG_LAYER_ANCHOR.wall}
              />
              <AnatomyPlate
                name="plate-sticker"
                glint="glint-sticker"
                widthRatio={STICKER_RATIO}
                aspect={`${STORY_STICKER_WIDTH_MM} / ${STORY_STICKER_HEIGHT_MM}`}
                tone={STORY_LAYER_TONES.sticker}
                film
                anchor={MOBILE_MAG_LAYER_ANCHOR.sticker}
              />
              <AnatomyPlate
                name="plate-wm"
                glint="glint-wm"
                widthRatio={MAGNET_RATIO}
                aspect="1"
                tone={STORY_LAYER_TONES.magnet}
                anchor={MOBILE_MAG_LAYER_ANCHOR.wallMagnet}
              />
              <AnatomyPlate
                name="plate-am"
                glint="glint-am"
                widthRatio={MAGNET_RATIO}
                aspect="1"
                tone={STORY_LAYER_TONES.magnet}
                anchor={MOBILE_MAG_LAYER_ANCHOR.artMagnet}
              />
              {/* Artwork anchor — the panel itself, at local Z = 0. */}
              <div
                data-ms="plate-art"
                className="absolute inset-0 overflow-hidden"
                style={{ backgroundColor: STORY_LAYER_TONES.panelEdge, transformOrigin: '50% 50%' }}
              >
                <div data-ms="front" className="absolute inset-0" style={{ opacity: 1 }}>
                  {frontTextureUrl ? (
                    <img
                      src={frontTextureUrl}
                      alt=""
                      draggable={false}
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div
                  data-ms="reverse"
                  className="absolute inset-0"
                  style={{
                    opacity: 0,
                    backgroundColor: STORY_LAYER_TONES.artworkReverse,
                    backgroundImage:
                      'linear-gradient(104deg, rgb(255 255 255 / 0.14) 0%, rgb(255 255 255 / 0) 42%, rgb(0 0 0 / 0.08) 100%)',
                  }}
                />
                <div
                  data-ms="edge"
                  className="absolute top-[4%] right-0 h-[92%] origin-right"
                  style={{
                    width: 2,
                    opacity: 0.28,
                    backgroundImage:
                      'linear-gradient(to bottom, #d2d6db 0%, #c4c8cd 18%, #9aa1a8 55%, #c4c8cd 88%, #d7dbe0 100%)',
                    boxShadow: 'inset 1px 0 0 rgb(90 96 104 / 0.35)',
                  }}
                />
                <div
                  data-ms="glint-art"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    opacity: 0,
                    backgroundImage:
                      'linear-gradient(118deg, rgb(255 255 255 / 0) 30%, rgb(255 255 255 / 0.12) 42%, rgb(255 255 255 / 0.95) 50%, rgb(255 255 255 / 0.12) 58%, rgb(255 255 255 / 0) 72%)',
                  }}
                />
                <div
                  data-ms="surface-sweep"
                  className="pointer-events-none absolute inset-0"
                  data-pdp-story-surface-sweep=""
                  style={{
                    opacity: 0,
                    backgroundImage:
                      'linear-gradient(118deg, rgb(237 247 255 / 0) 38%, rgb(237 247 255 / 0.14) 47%, rgb(237 247 255 / 0.40) 50%, rgb(237 247 255 / 0.14) 53%, rgb(237 247 255 / 0) 62%)',
                    backgroundSize: '260% 260%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: '118% -18%',
                  }}
                />
                <LayerAnchor x={MOBILE_MAG_LAYER_ANCHOR.artwork.x} y={MOBILE_MAG_LAYER_ANCHOR.artwork.y} />
              </div>
            </div>
          </div>

          {/* Layer names — flat overlay positioned by the shared 3/4 projection so
              each name rides its layer without 3D depth cramping. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[4]"
            data-ms="callouts"
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              {labelDefs.map(({ ms, id }) => (
                <path
                  key={ms}
                  data-ms={ms.replace('label', 'line')}
                  data-pdp-story-callout-line={id}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.35}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="butt"
                  strokeDasharray={MAGNETIC_CALLOUT_LINE_SPAN}
                  strokeDashoffset={MAGNETIC_CALLOUT_LINE_SPAN}
                  opacity={0}
                />
              ))}
            </svg>
            {labelDefs.map(({ ms, id }) => (
              <span
                key={`dot-${ms}`}
                data-ms={ms.replace('label', 'dot')}
                data-pdp-story-callout-dot={id}
                className="absolute h-2 w-2 rounded-full bg-current"
                style={{ opacity: 0, transform: 'translate(-50%, -50%)' }}
              />
            ))}
            {labelDefs.map(({ ms, id }) => (
              <span
                key={ms}
                data-ms={ms}
                data-pdp-story-layer={id}
                className="absolute whitespace-nowrap"
                style={{
                  opacity: 0,
                  fontSize: 'clamp(0.9375rem, 0.82rem + 0.5vw, 1.125rem)',
                  lineHeight: 1.3,
                  fontWeight: 400,
                  letterSpacing: '0.04em',
                }}
              >
                {MAGNETIC_LAYER_LABELS[id]}
              </span>
            ))}
          </div>

          <div
            aria-hidden="true"
            data-ms="surface-scrim"
            data-pdp-story-surface-scrim=""
            className="pointer-events-none absolute inset-0 z-[2] bg-canvas"
            style={{ opacity: 1 }}
          />

          <h2
            id="pdp-story-surface-heading"
            data-ms="copy-s"
            className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-6 text-center text-text-primary motion-reduce:transform-none"
            style={{
              opacity: 0,
              fontSize: 'clamp(2.5rem, 1.4rem + 5vw, 3rem)',
              lineHeight: 1.2,
              fontWeight: 'var(--text-display--font-weight)',
              letterSpacing: 'var(--text-display--letter-spacing)',
              transformOrigin: '50% 50%',
            }}
          >
            <span className="break-keep">{SURFACE_HEADLINE}</span>
          </h2>

          <div
            data-ms="edge-copy"
            className="pointer-events-none absolute inset-x-0 top-[66%] z-[1] px-6 text-center min-[768px]:inset-x-auto min-[768px]:left-[58%] min-[768px]:right-8 min-[768px]:top-[42%] min-[768px]:w-[min(20rem,34vw)] min-[768px]:-translate-y-1/2 min-[768px]:px-0 min-[768px]:text-left"
          >
            <h2
              id="pdp-story-edge-heading"
              data-ms="edge-h"
              className="text-text-primary"
              style={{
                opacity: 0,
                fontSize: 'clamp(2.75rem, 1.85rem + 5.2vw, 3.5rem)',
                lineHeight: 1.05,
                fontWeight: 'var(--text-display--font-weight)',
                letterSpacing: 'var(--text-display--letter-spacing)',
              }}
            >
              {EDGE_MEASURE_PRIMARY}
            </h2>
            <p
              data-ms="edge-b"
              className="mt-2 break-keep text-text-primary"
              style={{
                opacity: 0,
                fontSize: 'clamp(1.125rem, 1.05rem + 0.5vw, 1.375rem)',
                lineHeight: 1.35,
                fontWeight: 400,
              }}
            >
              {EDGE_MEASURE_SECONDARY}
            </p>
            <p
              data-ms="edge-d"
              className="mx-auto mt-3 max-w-[20rem] whitespace-pre-line text-text-secondary min-[768px]:mx-0"
              style={{
                opacity: 0,
                fontSize: 'clamp(0.875rem, 0.8rem + 0.4vw, 1.0625rem)',
                lineHeight: 1.55,
                fontWeight: 400,
              }}
            >
              {EDGE_DISCLOSURE}
            </p>
          </div>

          <div
            data-ms="mag-copy"
            className="pointer-events-none absolute inset-x-0 z-[1] px-6 text-left min-[768px]:left-8 min-[768px]:right-auto min-[768px]:w-[min(22rem,42vw)] min-[768px]:px-0"
            style={{ bottom: '5%' }}
          >
            <h2
              id="pdp-story-magnetic-heading"
              data-ms="mag-h"
              className="break-keep text-text-primary"
              style={{
                opacity: 0,
                fontSize: 'clamp(1.875rem, 1.05rem + 3.8vw, 2.375rem)',
                lineHeight: 1.22,
                fontWeight: 'var(--text-display--font-weight)',
                letterSpacing: 'var(--text-display--letter-spacing)',
              }}
            >
              {MAGNETIC_HEADLINE}
            </h2>
            <p
              data-ms="mag-k"
              className="mt-3 whitespace-pre-line text-text-primary"
              style={{
                opacity: 0,
                fontSize: 'clamp(0.9375rem, 0.86rem + 0.32vw, 1.0625rem)',
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              {MAGNETIC_STACK_COPY}
            </p>
            <p
              data-ms="mag-x"
              className="mt-3 max-w-md text-text-secondary"
              style={{
                opacity: 0,
                fontSize: 'clamp(0.8125rem, 0.78rem + 0.32vw, 0.9375rem)',
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              {MAGNETIC_EXPLODE_DISCLOSURE}
            </p>
            <p
              data-ms="mag-t"
              className="mt-2 max-w-md text-text-secondary"
              style={{
                opacity: 0,
                fontSize: 'clamp(0.8125rem, 0.78rem + 0.32vw, 0.9375rem)',
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              {MAGNETIC_DETACH_DISCLOSURE}
            </p>
          </div>
        </div>
      </div>
      <style>{`
        [data-pdp-story="mobile"] [data-ms="callouts"] {
          color: color-mix(in srgb, var(--color-text-primary) 88%, var(--color-text-secondary));
        }
        [data-pdp-story="mobile"] [data-pdp-story-stage] {
          --panel-w: min(48vw, 30svh);
        }
        @media (min-width: 430px) {
          [data-pdp-story="mobile"] [data-pdp-story-stage] {
            --panel-w: min(46vw, 32svh);
          }
          [data-pdp-story="mobile"] [data-pdp-story-layer] {
            font-size: 1.125rem;
          }
        }
        @media (min-width: 768px) {
          [data-pdp-story="mobile"] [data-pdp-story-stage] {
            --panel-w: min(40vw, 36svh);
          }
        }
      `}</style>
    </section>
  );
}

export default PdpStoryMobile;
