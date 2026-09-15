import React, { useCallback, useRef, useState } from 'react';
import type { Product } from '../../../data/products';
import { getPdpStoryDesktopTravelVh, getStoryBeatRanges, splitDesktopStoryProgress, SURFACE_HEADLINE } from './constants';
import { resolveStoryFrontUrl } from './media';
import { PdpStoryMobile } from './PdpStoryMobile';
import { PdpStoryStatic } from './PdpStoryStatic';
import { PdpStorySurface } from './PdpStorySurface';
import { usePdpStoryGate } from './usePdpStoryGate';
import { usePdpStoryProgress } from './usePdpStoryProgress';

interface PdpStorySectionProps {
  product: Product;
  orientation: 'portrait' | 'landscape';
  viewerOpen: boolean;
  roomPreviewOpen: boolean;
}

export function PdpStorySection({
  product,
  orientation,
  viewerOpen,
  roomPreviewOpen,
}: PdpStorySectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null);
  const bindSection = useCallback((el: HTMLElement | null) => {
    sectionRef.current = el;
    setSectionEl(el);
  }, []);
  const frontTextureUrl = resolveStoryFrontUrl(product, orientation);
  const { desktop, allowCanvas, near, reducedMotion } = usePdpStoryGate({
    sectionRef,
    sectionEl,
    viewerOpen,
    roomPreviewOpen,
    hasFrontTexture: Boolean(frontTextureUrl),
  });
  // Reduced-motion (any viewport) keeps the static fallback. Desktop normal stays
  // on the frozen WebGL pin. Compact normal is the cinematic 2.5D branch.
  const desktopMotion = desktop && !reducedMotion;
  const { progress: rawProgress, entered } = usePdpStoryProgress(sectionRef, desktopMotion, sectionEl);
  const { core: progress, tail: tailLocal } = splitDesktopStoryProgress(rawProgress);

  const mountCanvas = allowCanvas && Boolean(frontTextureUrl);
  const travelVh = getPdpStoryDesktopTravelVh();
  const ranges = getStoryBeatRanges();
  const beat =
    progress <= ranges.surface.end ? 'surface' : progress <= ranges.edge.end ? 'edge' : 'magnetic';

  return (
    <>
      {reducedMotion ? (
        <PdpStoryStatic frontTextureUrl={frontTextureUrl} orientation={orientation} />
      ) : !desktop ? (
        <PdpStoryMobile frontTextureUrl={frontTextureUrl} orientation={orientation} />
      ) : (
        <section
          ref={bindSection}
          aria-labelledby="pdp-story-surface-heading pdp-story-edge-heading pdp-story-magnetic-heading"
          data-pdp-story="desktop"
          data-pdp-story-canvas={mountCanvas ? 'mounted' : 'absent'}
          data-pdp-story-near={near ? 'true' : 'false'}
          data-pdp-story-entered={entered ? 'true' : 'false'}
          data-pdp-story-progress={progress.toFixed(3)}
          data-pdp-story-tail={tailLocal.toFixed(3)}
          data-pdp-story-beat={beat}
          data-pdp-story-active={entered && progress > 0.02 ? 'true' : 'false'}
          className="relative bg-canvas text-text-primary"
          style={{ height: `calc(100svh - var(--shell-offset) + ${travelVh}vh)` }}
        >
          <div
            ref={stageRef}
            data-pdp-story-stage=""
            className="sticky top-[var(--shell-offset)] z-0 h-[calc(100svh-var(--shell-offset))]"
          >
            <div className="relative h-full w-full overflow-hidden">
              <a
                href="#pdp-story-end"
                className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-canvas focus:px-3 focus:py-2"
              >
                제품 이야기 건너뛰기
              </a>
              {frontTextureUrl ? (
                <PdpStorySurface
                  frontTextureUrl={frontTextureUrl}
                  orientation={orientation}
                  progress={progress}
                  tailLocal={tailLocal}
                  entered={entered}
                  mountCanvas={mountCanvas}
                />
              ) : (
                <div className="flex h-full items-end p-10">
                  <h2 id="pdp-story-surface-heading" className="type-section-title">
                    {SURFACE_HEADLINE}
                  </h2>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      <div id="pdp-story-end" tabIndex={-1} className="sr-only">
        제품 이야기 끝
      </div>
    </>
  );
}

export default PdpStorySection;
