import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  EditorialReveal,
  useEditorialInView,
} from './editorialReveal';
import { cn } from '../../lib/cn';
import { FACTUAL_SHELL, FactualIndex } from './factualVisuals';

/**
 * Confirmed general-catalog commerce facts only (Rule 03).
 * Do not import Custom / Workshop policy. Do not claim free shipping.
 */
const HEADING = 'ORDER WITH CONFIDENCE';

function LeadNumber({
  kicker,
  figure,
  unit,
}: {
  kicker?: string;
  figure: string;
  unit: string;
}) {
  return (
    <p className="mt-8">
      {kicker ? (
        <span className="block type-metadata tracking-[0.08em] text-text-tertiary dark:text-[#8c877e]">
          {kicker}
        </span>
      ) : null}
      <span className="mt-2 block text-[clamp(3rem,7vw,4.5rem)] font-semibold leading-[0.9] tracking-[-0.05em] [font-variant-numeric:tabular-nums] dark:text-[#f4f1ea]">
        {figure}
      </span>
      <span className="mt-2 block type-body-lg text-text-secondary dark:text-[#e8e2d6]">{unit}</span>
    </p>
  );
}

function ConfidenceCell({
  index,
  label,
  children,
  detail,
  note,
  invert,
  className,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
  detail: string;
  note?: string;
  invert: boolean;
  className?: string;
}) {
  return (
    <li
      data-pdp-order-confidence-fact={index}
      className={cn('min-w-0 px-0 py-10 md:p-10 lg:p-12', className)}
    >
      <FactualIndex index={index} label={label} invert={invert} />
      {children}
      <p className="mt-5 max-w-[28rem] type-body text-pretty text-text-secondary dark:text-[#c9c3b8]">
        {detail}
      </p>
      {note ? (
        <p className="mt-4 max-w-[28rem] type-supporting text-pretty text-text-tertiary dark:text-[#9a948a]">
          {note}
        </p>
      ) : null}
    </li>
  );
}

export function ProductOrderConfidence() {
  const [ref, show] = useEditorialInView<HTMLElement>();
  const { theme } = useTheme();
  const invert = theme === 'dark';

  return (
    <section
      ref={ref}
      id="pdp-order-confidence"
      aria-labelledby="pdp-order-confidence-heading"
      data-pdp-order-confidence=""
      data-pdp-editorial-motion=""
      className="bg-canvas text-text-primary dark:bg-[#141414] dark:text-[#f4f1ea]"
    >
      <EditorialReveal show={show}>
        <div className={cn(FACTUAL_SHELL, 'py-24 sm:py-28 min-[1100px]:py-32')}>
          <h2
            id="pdp-order-confidence-heading"
            className="type-label tracking-[0.28em] text-text-tertiary dark:text-[#8c877e]"
          >
            {HEADING}
          </h2>

          <ol className="mt-12 m-0 grid list-none grid-cols-1 p-0 md:mt-16 md:grid-cols-2">
            <ConfidenceCell
              index="01"
              label="PRODUCTION"
              detail="주문 후 제작에 필요한 예상 기간입니다."
              invert={invert}
              className="border-b border-border-subtle md:border-r"
            >
              <LeadNumber figure="2–5" unit="영업일" />
            </ConfidenceCell>
            <ConfidenceCell
              index="02"
              label="DELIVERY"
              detail="제주·도서산간 지역은 추가 배송비가 발생할 수 있습니다."
              invert={invert}
              className="border-b border-border-subtle"
            >
              <LeadNumber kicker="출고 후" figure="1–3" unit="영업일" />
            </ConfidenceCell>
            <ConfidenceCell
              index="03"
              label="RETURNS"
              detail="단순 변심에 의한 반품은 수령 후 7일 이내 가능하며, 반품 배송비는 구매자 부담입니다."
              invert={invert}
              className="md:border-r md:border-border-subtle"
            >
              <LeadNumber kicker="수령 후" figure="7" unit="일 이내" />
            </ConfidenceCell>
            <ConfidenceCell
              index="04"
              label="ISSUE SUPPORT"
              detail="상품의 불량, 배송 중 파손 또는 오배송은 판매자 부담으로 교환 또는 환불을 진행합니다."
              note="초기 불량은 신속히 확인하며, 사용 중 발생한 문제는 상태 확인 후 개별 안내합니다."
              invert={invert}
            >
              <p className="mt-8 text-[clamp(1.35rem,3.2vw,1.85rem)] font-semibold leading-[1.2] tracking-[-0.02em] dark:text-[#f4f1ea]">
                불량 · 파손 · 오배송
              </p>
            </ConfidenceCell>
          </ol>
        </div>
      </EditorialReveal>
    </section>
  );
}

export default ProductOrderConfidence;
