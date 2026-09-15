import React from 'react';
import {
  EditorialReveal,
  useEditorialInView,
} from './editorialReveal';
import { cn } from '../../lib/cn';
import { FACTUAL_SHELL } from './factualVisuals';

/**
 * DEVELOPMENT HOLD values for (40) 기타 재화 notice.
 * `심의 예정` is an unresolved development-stage label, NOT a legal conclusion
 * and NOT equivalent to `해당없음`. A6 production release stays BLOCKED while
 * certification or finished-product origin remains 심의 예정.
 */
export const NOTICE_REVIEW_PENDING = '심의 예정';

const HEADING = '상품정보 제공고시';
const CATEGORY_VALUE = '기타 재화';
const MODEL_NAME = 'METALORA M';
const MANUFACTURER = 'METALORA';
const AS_OWNER = '메탈로라';
const AS_PHONE_DISPLAY = '010-5595-0541';
const AS_PHONE_TEL = '01055950541';

type NoticeRow = {
  key: string;
  label: string;
  hold?: 'certification' | 'origin' | 'importer';
  value: React.ReactNode;
};

function NoticeValue({ children }: { children: React.ReactNode }) {
  return <div className="type-body text-pretty text-text-primary">{children}</div>;
}

export function ProductInformationNotice({ productTitle }: { productTitle: string }) {
  const [ref, show] = useEditorialInView<HTMLElement>();
  const title = productTitle.trim();

  const rows: NoticeRow[] = [
    {
      key: 'name-model',
      label: '품명 및 모델명',
      value: (
        <NoticeValue>
          <p>품명: {title || '—'}</p>
          <p className="mt-1">모델명: {MODEL_NAME}</p>
        </NoticeValue>
      ),
    },
    {
      key: 'certification',
      label: '법에 의한 인증·허가 등',
      hold: 'certification',
      value: <NoticeValue>{NOTICE_REVIEW_PENDING}</NoticeValue>,
    },
    {
      key: 'origin',
      label: '제조국 또는 원산지',
      hold: 'origin',
      value: <NoticeValue>{NOTICE_REVIEW_PENDING}</NoticeValue>,
    },
    {
      key: 'maker-importer',
      label: '제조자 / 수입자',
      hold: 'importer',
      value: (
        <NoticeValue>
          <p>제조자: {MANUFACTURER}</p>
          <p className="mt-1">수입자: {NOTICE_REVIEW_PENDING}</p>
        </NoticeValue>
      ),
    },
    {
      key: 'as',
      label: 'A/S 책임자와 전화번호',
      value: (
        <NoticeValue>
          <p>A/S 책임자: {AS_OWNER}</p>
          <p className="mt-1">
            전화번호:{' '}
            <a
              className="focus-ring rounded-sm text-text-primary underline-offset-2 hover:underline focus-visible:underline"
              href={`tel:${AS_PHONE_TEL}`}
            >
              {AS_PHONE_DISPLAY}
            </a>
          </p>
        </NoticeValue>
      ),
    },
  ];

  return (
    <section
      ref={ref}
      id="pdp-product-notice"
      aria-labelledby="pdp-product-notice-heading"
      data-pdp-product-notice=""
      data-pdp-notice-category="기타 재화"
      data-pdp-notice-model={MODEL_NAME}
      data-pdp-editorial-motion=""
      className="bg-canvas text-text-primary"
    >
      <EditorialReveal show={show}>
        <div className={cn(FACTUAL_SHELL, 'py-16 sm:py-20 min-[1100px]:py-24')}>
          <header className="max-w-[36rem]">
            <h2
              id="pdp-product-notice-heading"
              className="type-label tracking-[0.06em] text-text-secondary [word-break:keep-all]"
            >
              {HEADING}
            </h2>
            <p className="mt-3 type-supporting text-text-tertiary">{CATEGORY_VALUE}</p>
          </header>

          <dl className="mt-10 m-0 border-b border-border-subtle sm:mt-12">
            {rows.map((row) => (
              <div
                key={row.key}
                data-pdp-notice-field={row.key}
                data-pdp-notice-hold={row.hold}
                className="grid min-w-0 grid-cols-1 gap-2 border-t border-border-subtle py-6 md:grid-cols-[minmax(13rem,20rem)_minmax(0,1fr)] md:items-start md:gap-12 md:py-7"
              >
                <dt className="type-metadata text-text-secondary">{row.label}</dt>
                <dd className="m-0 min-w-0">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </EditorialReveal>
    </section>
  );
}

export default ProductInformationNotice;
