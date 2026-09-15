import React from 'react';
import {
  EditorialLine,
  EditorialReveal,
  useEditorialInView,
} from './editorialReveal';
import { cn } from '../../lib/cn';
import {
  AluminumPanelVisual,
  FACTUAL_SHELL,
  FactualIndex,
  ImageSurfaceVisual,
  ProcessRailVisual,
  SublimationHeatVisual,
} from './factualVisuals';

/**
 * Confirmed general-catalog facts only (Rule 03). Current finished size is M.
 * Do not generalize these millimetres to unconfirmed sizes.
 */
const PANEL_M = {
  widthMm: 200,
  heightMm: 283,
  thicknessMm: 1.15,
} as const;

const HEADING = 'PRODUCT TRUTH';
const LEAD = '이 제품이 무엇으로 만들어지고, 어떻게 생산되는지.';

const COPY = {
  aluminum: {
    index: '01',
    label: 'ALUMINUM',
    value: `M · ${PANEL_M.widthMm} × ${PANEL_M.heightMm} mm`,
    detail: `${PANEL_M.thicknessMm} mm 알루미늄 패널`,
    note: '현재 M 사이즈 완제품 크기입니다.',
  },
  sublimation: {
    index: '02',
    label: 'SUBLIMATION',
    value: '180℃',
    detail: '조건으로 승화전사',
    note: 'METALORA가 실제 사용하는 승화전사 설정입니다. 알루미늄 자체가 180℃에 도달한다는 의미가 아닙니다.',
  },
  image: {
    index: '03',
    label: 'IMAGE',
    value: 'AI 업스케일링을 거친 고해상도 이미지',
    detail: '출력에 사용하는 최종 이미지입니다.',
  },
  made: {
    index: '04',
    label: 'MADE BY METALORA',
    value: 'METALORA가 진행합니다.',
    detail: '이미지 준비부터 출력, 승화전사, 후면 작업, 부품 조립, 검수, 포장까지.',
  },
} as const;

function FactCopy({
  index,
  label,
  value,
  detail,
  note,
  numeric = false,
}: {
  index: string;
  label: string;
  value: string;
  detail: string;
  note?: string;
  numeric?: boolean;
}) {
  return (
    <div className="max-w-[28rem]">
      <FactualIndex index={index} label={label} />
      <p
        className={
          numeric
            ? 'mt-6 text-[clamp(1.75rem,5vw,2.75rem)] font-semibold leading-[1.12] tracking-[-0.03em] [font-variant-numeric:tabular-nums]'
            : 'mt-6 type-product-title text-pretty'
        }
      >
        {value}
      </p>
      <p className="mt-3 type-body-lg text-pretty">{detail}</p>
      {note ? (
        <p className="mt-4 type-supporting text-pretty text-text-secondary">{note}</p>
      ) : null}
    </div>
  );
}

function TruthHeader() {
  const [ref, show] = useEditorialInView<HTMLElement>();

  return (
    <header ref={ref} className="max-w-[36rem]">
      <EditorialReveal show={show}>
        <h2
          id="pdp-product-truth-heading"
          className="type-label tracking-[0.28em] text-text-tertiary"
        >
          {HEADING}
        </h2>
        <p className="mt-5 type-section-title text-pretty">{LEAD}</p>
      </EditorialReveal>
    </header>
  );
}

function TruthModule({
  fact,
  visual,
  visualSide,
}: {
  fact: string;
  visual: React.ReactNode;
  visualSide: 'left' | 'right';
}) {
  const [ref, show] = useEditorialInView<HTMLLIElement>();
  const copy = COPY[fact as keyof typeof COPY];

  return (
    <li
      ref={ref}
      data-pdp-product-truth-fact={copy.index}
      className="relative py-16 min-[1100px]:py-24"
    >
      <EditorialLine show={show} className="absolute inset-x-0 top-0" />
      <EditorialReveal show={show}>
        <div className="grid min-w-0 items-center gap-10 lg:grid-cols-2 lg:gap-20 xl:gap-24">
          <div
            className={cn(
              'min-w-0',
              visualSide === 'left' ? 'order-1 lg:order-2' : 'order-1',
            )}
          >
            <FactCopy
              index={copy.index}
              label={copy.label}
              value={copy.value}
              detail={copy.detail}
              note={'note' in copy ? copy.note : undefined}
              numeric={copy.index === '01'}
            />
          </div>
          <div
            className={cn(
              'min-w-0',
              visualSide === 'left' ? 'order-2 lg:order-1' : 'order-2',
            )}
          >
            {visual}
          </div>
        </div>
      </EditorialReveal>
    </li>
  );
}

function MadeByModule() {
  const [ref, show] = useEditorialInView<HTMLLIElement>();
  const copy = COPY.made;

  return (
    <li
      ref={ref}
      data-pdp-product-truth-fact={copy.index}
      className="relative py-16 min-[1100px]:py-24"
    >
      <EditorialLine show={show} className="absolute inset-x-0 top-0" />
      <EditorialReveal show={show}>
        <FactCopy
          index={copy.index}
          label={copy.label}
          value={copy.value}
          detail={copy.detail}
        />
        <ProcessRailVisual className="mt-10 max-w-full lg:mt-14" />
      </EditorialReveal>
    </li>
  );
}

export function ProductTruthSection({ imageSrc = null }: { imageSrc?: string | null }) {
  return (
    <section
      id="pdp-product-truth"
      aria-labelledby="pdp-product-truth-heading"
      data-pdp-product-truth=""
      data-pdp-editorial-motion=""
      className="bg-canvas text-text-primary"
    >
      <div className={cn(FACTUAL_SHELL, 'py-24 sm:py-28 min-[1100px]:py-36')}>
        <TruthHeader />

        <ol className="mt-16 m-0 list-none p-0 sm:mt-20 min-[1100px]:mt-24">
          <TruthModule
            fact="aluminum"
            visualSide="right"
            visual={<AluminumPanelVisual />}
          />
          <TruthModule
            fact="sublimation"
            visualSide="left"
            visual={<SublimationHeatVisual />}
          />
          <TruthModule
            fact="image"
            visualSide="right"
            visual={<ImageSurfaceVisual src={imageSrc} />}
          />
          <MadeByModule />
        </ol>
      </div>
    </section>
  );
}

export default ProductTruthSection;
