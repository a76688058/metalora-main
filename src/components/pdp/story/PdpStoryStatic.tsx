import React from 'react';

import {
  EDGE_DISCLOSURE,
  EDGE_MEASURE_PRIMARY,
  EDGE_MEASURE_SECONDARY,
  MAGNETIC_DETACH_DISCLOSURE,
  MAGNETIC_EXPLODE_DISCLOSURE,
  MAGNETIC_HEADLINE,
  MAGNETIC_LAYER_LABELS,
  MAGNETIC_STACK_COPY,
  MOUNTED_BODY,
  MOUNTED_DISCLOSURE,
  MOUNTED_HEADLINE,
  STATIC_REVERSE_NOTE,
  STATIC_STACK_AXIS_NOTE,
  STORY_ANATOMY_LAYER_ORDER,
  STORY_LAYER_TONES,
  STORY_MAGNET_SIZE_MM,
  STORY_PANEL_HEIGHT_MM,
  STORY_PANEL_THICKNESS_MM,
  STORY_PANEL_WIDTH_MM,
  STORY_STICKER_HEIGHT_MM,
  STORY_STICKER_WIDTH_MM,
  SURFACE_HEADLINE,
  type StoryAnatomyLayerId,
} from './constants';

/**
 * Non-WebGL equivalent of the approved desktop story, in normal document flow:
 * SURFACE → EDGE → MAGNETIC ANATOMY → MOUNTED RESULT.
 *
 * Used for compact viewports and for reduced-motion desktop. It does not imitate
 * the pinned choreography: nothing here is scroll-driven or animated, and every
 * fact stays DOM text. The repo holds no product photography, so the beats are
 * drawn from the same measured geometry and role tones as the 3D anatomy rather
 * than from invented photographic evidence.
 */

/**
 * The wall has no measured size — it is the receiving surface, drawn wider and
 * shorter than the panel so the stack reads as sitting on it. Never present these
 * two numbers as a product measurement.
 */
const WALL_WIDTH_RATIO = 1.18;
const WALL_HEIGHT_RATIO = 0.34;

type StaticPlate = {
  id: StoryAnatomyLayerId;
  /** Share of the measured panel width. */
  widthRatio: number;
  /** CSS aspect-ratio, width / height. */
  aspect: string;
  tone: string;
  /** Brushed reverse aluminum reads flat as a single fill. */
  sheen?: boolean;
  /** Adhesive film, not a solid plate. */
  film?: boolean;
};

const STATIC_PLATES: Record<StoryAnatomyLayerId, StaticPlate> = {
  wall: {
    id: 'wall',
    widthRatio: WALL_WIDTH_RATIO,
    aspect: `${WALL_WIDTH_RATIO} / ${WALL_HEIGHT_RATIO}`,
    tone: STORY_LAYER_TONES.wall,
  },
  sticker: {
    id: 'sticker',
    widthRatio: STORY_STICKER_WIDTH_MM / STORY_PANEL_WIDTH_MM,
    aspect: `${STORY_STICKER_WIDTH_MM} / ${STORY_STICKER_HEIGHT_MM}`,
    tone: STORY_LAYER_TONES.sticker,
    film: true,
  },
  wallMagnet: {
    id: 'wallMagnet',
    widthRatio: STORY_MAGNET_SIZE_MM / STORY_PANEL_WIDTH_MM,
    aspect: `${STORY_MAGNET_SIZE_MM} / ${STORY_MAGNET_SIZE_MM}`,
    tone: STORY_LAYER_TONES.magnet,
  },
  artMagnet: {
    id: 'artMagnet',
    widthRatio: STORY_MAGNET_SIZE_MM / STORY_PANEL_WIDTH_MM,
    aspect: `${STORY_MAGNET_SIZE_MM} / ${STORY_MAGNET_SIZE_MM}`,
    tone: STORY_LAYER_TONES.magnet,
  },
  artwork: {
    id: 'artwork',
    widthRatio: 1,
    aspect: `${STORY_PANEL_WIDTH_MM} / ${STORY_PANEL_HEIGHT_MM}`,
    tone: STORY_LAYER_TONES.artworkReverse,
    sheen: true,
  },
};

/**
 * Rolled aluminum seen edge-on and magnified: a bright roll highlight under the
 * printed face, falling to shadow at the back arris.
 */
const EDGE_CORE_GRADIENT =
  'linear-gradient(to bottom, #f4f6f7 0%, #dfe3e7 14%, #c0c6cc 42%, #9ba2aa 74%, #7f868e 92%, #adb4bb 100%)';
/** Printed face marked as a band, not as a stretched slice of the artwork. */
const EDGE_FACE_TONE = '#6f7681';
const REVERSE_SHEEN_GRADIENT =
  'linear-gradient(104deg, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0) 42%, rgb(0 0 0 / 0.08) 100%)';
const CONTACT_SHADOW = '0 14px 24px -14px rgb(18 22 28 / 0.55)';
/**
 * The aluminum edge runs around the whole panel, so a hairline rim keeps a
 * front-on panel reading as a slab rather than as a print. Thickness is carried by
 * the EDGE beat, which states the real 1.15 mm and discloses its enlargement.
 */
const PANEL_SLAB = `inset 0 0 0 1px ${STORY_LAYER_TONES.panelEdge}, ${CONTACT_SHADOW}`;

interface PdpStoryStaticProps {
  frontTextureUrl: string | null;
  orientation: 'portrait' | 'landscape';
}

function panelAspect(orientation: 'portrait' | 'landscape'): string {
  return orientation === 'landscape'
    ? `${STORY_PANEL_HEIGHT_MM} / ${STORY_PANEL_WIDTH_MM}`
    : `${STORY_PANEL_WIDTH_MM} / ${STORY_PANEL_HEIGHT_MM}`;
}

function AnatomyPlate({ plate }: { plate: StaticPlate }) {
  return (
    <div
      className="relative"
      style={{
        // Column is sized to the wall, so every plate stays in true relative scale.
        width: `${(plate.widthRatio / WALL_WIDTH_RATIO) * 100}%`,
        aspectRatio: plate.aspect,
        backgroundColor: plate.tone,
        boxShadow: plate.film ? 'inset 0 0 0 1px rgb(18 22 28 / 0.08)' : undefined,
      }}
    >
      {plate.sheen ? (
        <span
          className="absolute inset-0"
          style={{ backgroundImage: REVERSE_SHEEN_GRADIENT }}
        />
      ) : null}
    </div>
  );
}

export function PdpStoryStatic({ frontTextureUrl, orientation }: PdpStoryStaticProps) {
  const aspect = panelAspect(orientation);

  return (
    <section
      aria-labelledby="pdp-story-static-surface pdp-story-static-edge pdp-story-static-magnetic pdp-story-static-mounted"
      data-pdp-story="static"
      data-pdp-story-canvas="absent"
      className="bg-canvas px-5 py-14 text-text-primary sm:px-8 sm:py-16 min-[1100px]:motion-safe:hidden"
    >
      <div className="mx-auto flex max-w-[32rem] flex-col gap-16 sm:gap-20">
        {/* ── SURFACE ── */}
        <figure className="m-0 flex flex-col gap-6">
          {frontTextureUrl ? (
            <div
              aria-hidden="true"
              className="mx-auto w-[76%] max-w-[17rem] bg-surface-elevated"
              style={{ aspectRatio: aspect, boxShadow: PANEL_SLAB }}
            >
              <img
                src={frontTextureUrl}
                alt=""
                draggable={false}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
          <figcaption>
            <h2 id="pdp-story-static-surface" className="type-section-title">
              {SURFACE_HEADLINE}
            </h2>
          </figcaption>
        </figure>

        {/* ── EDGE ── */}
        <div className="flex flex-col gap-6">
          {/*
            Magnified cross-section: printed face on top, aluminum core below.
            The caliper brackets the magnified thickness; the real measurement is
            the heading directly underneath, so nothing is stated twice.
          */}
          <div aria-hidden="true" className="flex items-stretch gap-2.5">
            <svg
              viewBox="0 0 14 48"
              preserveAspectRatio="none"
              className="h-12 w-3.5 shrink-0 text-text-secondary sm:h-14"
            >
              <path
                d="M0 0.5H14M7 0.5V47.5M0 47.5H14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
            <div
              className="relative h-12 min-w-0 flex-1 sm:h-14"
              style={{ background: EDGE_CORE_GRADIENT }}
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: EDGE_FACE_TONE }}
              />
              <span
                className="absolute inset-x-0 top-1 h-px"
                style={{ backgroundColor: 'rgb(18 22 28 / 0.28)' }}
              />
            </div>
          </div>
          <div>
            <h2 id="pdp-story-static-edge" className="type-section-title">
              {EDGE_MEASURE_PRIMARY}
            </h2>
            <p className="mt-1 type-body">{EDGE_MEASURE_SECONDARY}</p>
            <p className="mt-3 whitespace-pre-line type-supporting text-text-secondary">
              {EDGE_DISCLOSURE}
            </p>
          </div>
        </div>

        {/* ── MAGNETIC ANATOMY ── */}
        <div className="flex flex-col gap-6">
          <div>
            <h2 id="pdp-story-static-magnetic" className="type-section-title">
              {MAGNETIC_HEADLINE}
            </h2>
            <p className="mt-2 type-supporting text-text-secondary">{STATIC_STACK_AXIS_NOTE}</p>
          </div>
          <ol
            className="m-0 mx-auto flex w-fit max-w-full list-none flex-col gap-4 p-0 sm:gap-5"
            data-pdp-story-static-anatomy=""
          >
            {STORY_ANATOMY_LAYER_ORDER.map((id) => (
              <li
                key={id}
                data-pdp-story-layer={id}
                // Fixed columns so every plate shares one centre line across rows.
                className="grid grid-cols-[10.5rem_7rem] items-center gap-4 sm:grid-cols-[13.75rem_9rem] sm:gap-6"
              >
                <div aria-hidden="true" className="flex justify-center">
                  <AnatomyPlate plate={STATIC_PLATES[id]} />
                </div>
                <span className="type-body">{MAGNETIC_LAYER_LABELS[id]}</span>
              </li>
            ))}
          </ol>
          <div>
            <p className="whitespace-pre-line type-body">{MAGNETIC_STACK_COPY}</p>
            <p className="mt-3 type-supporting text-text-secondary">
              {MAGNETIC_EXPLODE_DISCLOSURE}
            </p>
            <p className="mt-1 type-supporting text-text-secondary">{MAGNETIC_DETACH_DISCLOSURE}</p>
            <p className="mt-1 type-supporting text-text-secondary">{STATIC_REVERSE_NOTE}</p>
          </div>
        </div>

        {/* ── MOUNTED RESULT ── */}
        <div className="flex flex-col gap-6">
          <div
            aria-hidden="true"
            className="flex justify-center px-6 py-9"
            style={{ backgroundColor: STORY_LAYER_TONES.wall }}
          >
            {frontTextureUrl ? (
              <div
                className="w-[58%] max-w-[12.5rem]"
                style={{ aspectRatio: aspect, boxShadow: PANEL_SLAB }}
              >
                <img
                  src={frontTextureUrl}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
          </div>
          <div>
            <h2 id="pdp-story-static-mounted" className="type-section-title">
              {MOUNTED_HEADLINE}
            </h2>
            <p className="mt-2 type-body">{MOUNTED_BODY}</p>
            <p className="mt-3 type-supporting text-text-secondary">{MOUNTED_DISCLOSURE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PdpStoryStatic;
