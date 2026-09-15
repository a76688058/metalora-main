import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PDP_FRAME_SCALE, PdpSpatialCanvas } from '../PdpSpatialCanvas';
import {
  EDGE_DISCLOSURE,
  EDGE_MEASURE_PRIMARY,
  EDGE_MEASURE_SECONDARY,
  MAGNETIC_DETACH_DISCLOSURE,
  MAGNETIC_EXPLODE_DISCLOSURE,
  MAGNETIC_HEADLINE,
  MAGNETIC_STACK_COPY,
  STORY_CAMERA_NEAR,
  STORY_PANEL_HEIGHT,
  STORY_PANEL_THICKNESS,
  STORY_PANEL_WIDTH,
  SURFACE_HEADLINE,
  getStoryBeatRanges,
} from './constants';
import { storyAnatomyLayerZs } from './magneticAnatomy';
import { layoutMagneticCallouts, MAGNETIC_CALLOUT_LINE_SPAN } from './magneticLabels';
import { storyVisualAt } from './storyChoreography';
import { edgeCopyAnchor } from './edgeChoreography';
import { surfaceStatementAt } from './surfaceStatement';
import { surfaceSweepAt } from './surfaceSweep';

function useStageAspect(): {
  ref: React.RefObject<HTMLDivElement | null>;
  aspect: number;
  width: number;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [width, setWidth] = useState(1440);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.height <= 0) return;
      setAspect(box.width / box.height);
      setWidth(box.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, aspect, width };
}

interface PdpStorySurfaceProps {
  frontTextureUrl: string;
  orientation: 'portrait' | 'landscape';
  progress: number;
  tailLocal?: number;
  entered: boolean;
  mountCanvas: boolean;
}

export function PdpStorySurface({
  frontTextureUrl,
  orientation,
  progress,
  tailLocal = 0,
  entered,
  mountCanvas,
}: PdpStorySurfaceProps) {
  const visual = useMemo(
    () => storyVisualAt(progress, orientation, tailLocal),
    [orientation, progress, tailLocal],
  );
  const stageOpacity = entered ? visual.stageOpacity : 0;
  const { ref: stageRef, aspect, width: stageWidth } = useStageAspect();
  const surfaceLocal = useMemo(() => {
    const surfaceEnd = getStoryBeatRanges().surface.end;
    return visual.beat === 'surface' && surfaceEnd > 0
      ? Math.min(1, Math.max(0, progress / surfaceEnd))
      : 0;
  }, [progress, visual.beat]);
  const surfaceActive = entered && visual.beat === 'surface';
  const statement = useMemo(
    () => surfaceStatementAt(surfaceLocal, surfaceActive),
    [surfaceActive, surfaceLocal],
  );
  const sweep = useMemo(
    () => surfaceSweepAt(surfaceLocal, surfaceActive),
    [surfaceActive, surfaceLocal],
  );
  const edgeCopyOpacity = entered ? visual.edgeCopyOpacity : 0;
  const disclosureOpacity = entered ? visual.disclosureOpacity : 0;
  const edgeAnchor = useMemo(() => {
    if (!entered) return null;
    if (visual.beat !== 'edge' && edgeCopyOpacity < 0.01 && disclosureOpacity < 0.01) return null;
    return edgeCopyAnchor(visual.pose, aspect, orientation, stageWidth);
  }, [aspect, disclosureOpacity, edgeCopyOpacity, entered, orientation, stageWidth, visual.beat, visual.pose]);
  const magneticCopyOpacity = entered ? visual.magneticCopyOpacity : 0;
  const stackCopyOpacity = entered ? visual.stackCopyOpacity : 0;
  const explodeDisclosureOpacity = entered ? visual.explodeDisclosureOpacity : 0;
  const detachDisclosureOpacity = entered ? visual.detachDisclosureOpacity : 0;
  const magneticStackScale = 1 + 0.12 * visual.anatomy.wallSpread;
  const labelPeak = entered
    ? Math.max(...Object.values(visual.layerLabelOpacity), ...Object.values(visual.layerLine))
    : 0;
  const callouts = useMemo(() => {
    if (labelPeak < 0.01) return [];
    return layoutMagneticCallouts({
      layers: storyAnatomyLayerZs(
        visual.anatomy,
        STORY_PANEL_THICKNESS,
        PDP_FRAME_SCALE * magneticStackScale,
      ),
      pose: visual.pose,
      aspect,
      stackScale: magneticStackScale,
    });
  }, [aspect, labelPeak, magneticStackScale, visual.anatomy, visual.pose]);

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden bg-canvas"
      data-pdp-story-visual=""
      data-pdp-story-beat={visual.beat}
      data-pdp-story-active={stageOpacity > 0.04 ? 'true' : 'false'}
      data-pdp-story-grazing={visual.grazingMix.toFixed(3)}
      data-pdp-story-edge-mix={visual.edgeMix.toFixed(3)}
      data-pdp-story-rim={visual.rimMix.toFixed(3)}
      data-pdp-story-sweep={visual.sweep.toFixed(3)}
      data-pdp-story-glint={visual.glint.toFixed(3)}
      data-pdp-story-wall={visual.anatomy.wallOpacity.toFixed(3)}
      data-pdp-story-detach={visual.anatomy.artMagnetDetach.toFixed(3)}
      data-pdp-story-wall-spread={visual.anatomy.wallSpread.toFixed(3)}
      data-pdp-story-panel-z={visual.anatomy.panelOffset[2].toFixed(3)}
      data-pdp-story-labels={labelPeak.toFixed(3)}
      data-pdp-story-lookat-z={visual.pose.lookAt[2].toFixed(3)}
      data-pdp-story-surface-sweep={sweep.opacity.toFixed(3)}
      data-pdp-story-amount={visual.amount.toFixed(3)}
      data-pdp-story-z={visual.pose.position[2].toFixed(3)}
      data-pdp-story-lookat-x={visual.pose.lookAt[0].toFixed(3)}
      data-pdp-story-yaw={visual.pose.yaw.toFixed(3)}
      data-pdp-story-pitch={visual.pose.pitch.toFixed(3)}
      data-pdp-story-tail={tailLocal.toFixed(3)}
      data-pdp-story-stack-scale={magneticStackScale.toFixed(3)}
      style={{
        opacity: stageOpacity,
        visibility: entered || stageOpacity > 0.001 ? 'visible' : 'hidden',
        clipPath: entered ? 'none' : 'inset(100%)',
        pointerEvents: 'none',
      }}
    >
      {mountCanvas ? (
        <PdpSpatialCanvas
          className="pointer-events-none absolute inset-0 h-full w-full"
          frontTextureUrl={frontTextureUrl}
          backTextureUrl={null}
          orientation={orientation}
          panelWidth={STORY_PANEL_WIDTH}
          panelHeight={STORY_PANEL_HEIGHT}
          panelThickness={STORY_PANEL_THICKNESS}
          scale={magneticStackScale}
          rotationX={visual.pose.pitch}
          rotationY={visual.pose.yaw}
          inspectRotationMode="continuous"
          flipProgress={0}
          lightingMode="studio"
          grazingMix={visual.grazingMix}
          edgeMix={visual.edgeMix}
          edgeRimMix={visual.rimMix}
          edgeSweep={visual.sweep}
          edgeGlint={visual.glint}
          storyVisualFinish
          storyAnatomy={visual.anatomy}
          cameraNear={STORY_CAMERA_NEAR}
          cameraPosition={visual.pose.position}
          cameraLookAt={visual.pose.lookAt}
          cameraFov={visual.pose.fov}
          surfaceSweep={sweep}
        />
      ) : null}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-canvas dark:bg-[#121212]"
        data-pdp-story-surface-scrim=""
        style={{
          opacity: statement.scrim,
        }}
      />

      {callouts.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] text-text-secondary"
          data-pdp-story-layer-labels=""
          data-pdp-story-callouts="infographic"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {callouts.map((callout) => {
              const draw = visual.layerLine[callout.id];
              return (
                <path
                  key={`line-${callout.id}`}
                  d={callout.path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="butt"
                  strokeDasharray={MAGNETIC_CALLOUT_LINE_SPAN}
                  strokeDashoffset={(1 - draw) * MAGNETIC_CALLOUT_LINE_SPAN}
                  opacity={draw}
                  data-pdp-story-callout-line={callout.id}
                />
              );
            })}
          </svg>
          {callouts.map((callout) => {
            const draw = visual.layerLine[callout.id];
            const opacity = visual.layerLabelOpacity[callout.id];
            return (
              <React.Fragment key={callout.id}>
                <span
                  aria-hidden="true"
                  className="absolute h-2 w-2 rounded-full bg-text-secondary"
                  data-pdp-story-callout-dot={callout.id}
                  style={{
                    left: `${callout.ax}%`,
                    top: `${callout.ay}%`,
                    opacity: draw,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                <span
                  className="absolute whitespace-nowrap text-text-secondary"
                  data-pdp-story-layer={callout.id}
                  data-pdp-story-callout-side={callout.side}
                  style={{
                    left: `${callout.lx}%`,
                    top: `${callout.ly}%`,
                    opacity,
                    fontSize: 'clamp(1.0625rem, 0.95rem + 0.22vw, 1.1875rem)',
                    lineHeight: 1.3,
                    fontWeight: 400,
                    letterSpacing: '0.04em',
                    transform: `translate(${callout.side === 'left' ? '-100%' : '0'}, -50%)`,
                  }}
                >
                  {callout.text}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute z-[1] w-max min-w-[18rem] max-w-[21rem] text-left"
        data-pdp-story-edge-copy=""
        data-pdp-story-edge-art-left={edgeAnchor ? edgeAnchor.artLeftPct.toFixed(2) : ''}
        data-pdp-story-edge-art-right={edgeAnchor ? edgeAnchor.artRightPct.toFixed(2) : ''}
        style={{
          left: edgeAnchor ? `${edgeAnchor.leftPct}%` : '58%',
          top: edgeAnchor ? `${edgeAnchor.topPct}%` : '48%',
          transform: 'translateY(-50%)',
          opacity: Math.max(edgeCopyOpacity, disclosureOpacity),
        }}
      >
          <h2
            id="pdp-story-edge-heading"
            className="whitespace-nowrap text-text-primary"
            style={{
              opacity: edgeCopyOpacity,
              fontSize: 'clamp(3.75rem, 1rem + 3.5vw, 4.75rem)',
              lineHeight: 1.05,
              fontWeight: 'var(--text-display--font-weight)',
              letterSpacing: 'var(--text-display--letter-spacing)',
            }}
          >
            {EDGE_MEASURE_PRIMARY}
          </h2>
          <p
            className="mt-3 break-keep text-text-primary"
            style={{
              opacity: edgeCopyOpacity,
              fontSize: 'clamp(1.25rem, 1.05rem + 0.4vw, 1.5rem)',
              lineHeight: 1.35,
              fontWeight: 400,
            }}
          >
            {EDGE_MEASURE_SECONDARY}
          </p>
          <p
            className="mt-5 whitespace-pre-line text-text-secondary"
            style={{
              opacity: disclosureOpacity,
              fontSize: 'clamp(0.9375rem, 0.82rem + 0.28vw, 1.0625rem)',
              lineHeight: 1.55,
              fontWeight: 400,
            }}
          >
            {EDGE_DISCLOSURE}
          </p>
        </div>

      <div
        className="pointer-events-none absolute z-[1] w-[clamp(20rem,11rem+9.5vw,23rem)] max-w-[23rem] text-left"
        data-pdp-story-magnetic-copy=""
        style={{
          left: 'clamp(3.75rem, 4.6vw, 5.25rem)',
          top: '64%',
          transform: 'translateY(-8%)',
          opacity: Math.max(
            magneticCopyOpacity,
            stackCopyOpacity,
            explodeDisclosureOpacity,
            detachDisclosureOpacity,
          ),
        }}
      >
        <h2
          id="pdp-story-magnetic-heading"
          className="break-keep text-text-primary"
          style={{
            opacity: magneticCopyOpacity,
            fontSize: 'clamp(2.125rem, 0.55rem + 2.15vw, 2.75rem)',
            lineHeight: 1.22,
            fontWeight: 'var(--text-display--font-weight)',
            letterSpacing: 'var(--text-display--letter-spacing)',
            transform: `translateY(${(1 - magneticCopyOpacity) * 12}px)`,
          }}
        >
          {MAGNETIC_HEADLINE}
        </h2>
        <p
          className="mt-5 whitespace-pre-line text-text-primary"
          style={{
            opacity: stackCopyOpacity,
            fontSize: 'clamp(1rem, 0.88rem + 0.22vw, 1.125rem)',
            lineHeight: 1.55,
            fontWeight: 400,
            transform: `translateY(${(1 - stackCopyOpacity) * 10}px)`,
          }}
        >
          {MAGNETIC_STACK_COPY}
        </p>
        <p
          className="mt-5 text-text-secondary"
          style={{
            opacity: explodeDisclosureOpacity,
            fontSize: 'clamp(0.875rem, 0.78rem + 0.16vw, 1rem)',
            lineHeight: 1.55,
            fontWeight: 400,
            transform: `translateY(${(1 - explodeDisclosureOpacity) * 8}px)`,
          }}
        >
          {MAGNETIC_EXPLODE_DISCLOSURE}
        </p>
        <p
          className="mt-2 text-text-secondary"
          style={{
            opacity: detachDisclosureOpacity,
            fontSize: 'clamp(0.875rem, 0.78rem + 0.16vw, 1rem)',
            lineHeight: 1.55,
            fontWeight: 400,
            transform: `translateY(${(1 - detachDisclosureOpacity) * 8}px)`,
          }}
        >
          {MAGNETIC_DETACH_DISCLOSURE}
        </p>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[1] flex items-end p-10 min-[1440px]:p-14">
        <h2
          id="pdp-story-surface-heading"
          className="absolute inset-0 flex items-center justify-center px-10 text-center text-text-primary motion-reduce:transform-none dark:text-[#f5f6f8]"
          style={{
            opacity: statement.opacity,
            fontSize: 'clamp(4.25rem, 1.85rem + 3.85vw, 6.75rem)',
            lineHeight: 1.15,
            fontWeight: 'var(--text-display--font-weight)',
            letterSpacing: 'var(--text-display--letter-spacing)',
            transform: `translateY(${statement.translateY.toFixed(2)}px) scale(${statement.scale.toFixed(4)})`,
          }}
        >
          <span className="break-keep">{SURFACE_HEADLINE}</span>
        </h2>
      </div>
    </div>
  );
}
