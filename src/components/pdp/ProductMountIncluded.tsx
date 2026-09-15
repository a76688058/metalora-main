import React from 'react';
import {
  EditorialLine,
  EditorialReveal,
  useEditorialInView,
} from './editorialReveal';
import { cn } from '../../lib/cn';
import {
  FACTUAL_SHELL,
  IncludedSilhouette,
  MountSchematicVisual,
} from './factualVisuals';

/**
 * Mount stack matches Rule 02 measured order.
 * Included quantities: artwork ×1, PPF ×1, protective sticker ×1, magnets ×2.
 * Do not add wall-damage, mark-free, strength, or install-time claims.
 */
const MOUNT_HEADING = 'MOUNT';
const MOUNT_PRIMARY = '못 없이 설치하는 마그네틱 마운트.';
const MOUNT_SUPPORT =
  '보호 스티커와 두 개의 자석을 이용해 작품을 벽면에 자력으로 부착합니다.';

const INCLUDED_HEADING = 'INCLUDED';

const INCLUDED_ITEMS = [
  { key: 'artwork' as const, name: '작품', qty: 1 },
  { key: 'ppf' as const, name: 'PPF 보호필름', qty: 1 },
  { key: 'sticker' as const, name: '보호 스티커', qty: 1 },
  { key: 'magnets' as const, name: '자석', qty: 2 },
];

const PACKAGING_LINES = [
  '종이 완충재와 제품에 맞춘 박스로 포장합니다.',
  '외부 박스에는 METALORA 로고 마킹이 적용됩니다.',
] as const;

function MountBlock({ imageSrc }: { imageSrc: string | null }) {
  const [ref, show] = useEditorialInView<HTMLDivElement>();

  return (
    <div ref={ref} data-pdp-mount="">
      <EditorialReveal show={show}>
        <div className="grid min-w-0 items-start gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-20">
          <div className="min-w-0 max-w-[32rem]">
            <h2
              id="pdp-mount-heading"
              className="type-label tracking-[0.28em] text-text-tertiary"
            >
              {MOUNT_HEADING}
            </h2>
            <p className="mt-5 type-section-title text-pretty">{MOUNT_PRIMARY}</p>
            <p className="mt-4 type-body text-pretty text-text-secondary">
              {MOUNT_SUPPORT}
            </p>
          </div>
          <MountSchematicVisual imageSrc={imageSrc} />
        </div>
      </EditorialReveal>
    </div>
  );
}

function IncludedBlock({ imageSrc }: { imageSrc: string | null }) {
  const [ref, show] = useEditorialInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-pdp-included=""
      className="relative mt-24 pt-16 sm:mt-28 min-[1100px]:mt-36 min-[1100px]:pt-20"
    >
      <EditorialLine show={show} className="absolute inset-x-0 top-0" />
      <EditorialReveal show={show}>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
          <h2
            id="pdp-included-heading"
            className="type-label tracking-[0.28em] text-text-tertiary"
          >
            {INCLUDED_HEADING}
          </h2>
          <div className="max-w-[34rem]">
            {PACKAGING_LINES.map((line) => (
              <p
                key={line}
                className="mt-1 type-supporting text-pretty text-text-secondary first:mt-0"
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        <ul
          aria-label="구성품"
          className="mt-12 m-0 flex list-none flex-wrap items-end gap-x-8 gap-y-12 p-0 sm:mt-16 sm:gap-x-12 lg:gap-x-16 lg:gap-y-14"
        >
          {INCLUDED_ITEMS.map((item) => (
            <li key={item.name} className="min-w-0">
              <IncludedSilhouette kind={item.key} imageSrc={imageSrc} />
              <div className="mt-4 flex min-w-0 items-baseline gap-3">
                <span className="type-body">{item.name}</span>
                <span className="shrink-0 type-body tabular-nums text-text-secondary">× {item.qty}</span>
              </div>
            </li>
          ))}
        </ul>
      </EditorialReveal>
    </div>
  );
}

export function ProductMountIncluded({ imageSrc = null }: { imageSrc?: string | null }) {
  return (
    <section
      id="pdp-mount-included"
      aria-labelledby="pdp-mount-heading pdp-included-heading"
      data-pdp-mount-included=""
      data-pdp-editorial-motion=""
      className="bg-canvas text-text-primary"
    >
      <div className={cn(FACTUAL_SHELL, 'pb-24 pt-8 sm:pb-28 sm:pt-12 min-[1100px]:pb-36 min-[1100px]:pt-16')}>
        <MountBlock imageSrc={imageSrc} />
        <IncludedBlock imageSrc={imageSrc} />
      </div>
    </section>
  );
}

export default ProductMountIncluded;
