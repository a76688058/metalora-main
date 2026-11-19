import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { cn } from '../lib/cn';
import {
  reportPaymentFail,
  sanitizeTossFailureCode,
} from '../lib/paymentFailureAnalytics';

function localResultPreviewAllowed(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

type FailKind = 'declined' | 'cancelled' | 'provider' | 'technical' | 'unknown';

const DRAW = [0.16, 1, 0.3, 1] as const;

const FAIL_COPY: Record<FailKind, { title: string; body: string }> = {
  declined: {
    title: '결제가 승인되지 않았습니다',
    body: '카드 또는 결제 수단이 승인되지 않았습니다. 주문은 완료되지 않았습니다.',
  },
  cancelled: {
    title: '결제를 취소했습니다',
    body: '결제 진행을 취소했습니다. 주문은 완료되지 않았습니다.',
  },
  provider: {
    title: '결제 서비스에서 실패를 전달했습니다',
    body: '결제 서비스가 실패를 알렸습니다. 주문은 완료되지 않았습니다.',
  },
  technical: {
    title: '결제 처리 중 문제가 생겼습니다',
    body: '결제 처리 중 기술적인 문제가 있었습니다. 주문이 완료되었는지는 주문 내역에서 확인해 주세요.',
  },
  unknown: {
    title: '결제 결과를 확인하지 못했습니다',
    body: '결제 완료로 표시하지 않습니다. 결제가 되지 않았다고 단정하지도 않습니다. 주문 내역에서 상태를 확인해 주세요.',
  },
};

function classifyFailure(code: string | null): FailKind {
  if (!code) return 'unknown';
  if (code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL') return 'cancelled';
  if (code.startsWith('REJECT_') || code.startsWith('INVALID_CARD') || code === 'INVALID_STOPPED_CARD') return 'declined';
  if (
    code.includes('INTERNAL')
    || code === 'FAILED_INTERNAL_SYSTEM_PROCESSING'
    || code === 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING'
  ) return 'technical';
  if (code === 'unknown_toss_failure') return 'unknown';
  return 'provider';
}

function visibleCode(code: string | null): string | null {
  if (!code) return null;
  return /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : null;
}

function PaymentStatusMark({ mark }: { mark: FailKind }) {
  const reduced = usePrefersReducedMotion();
  const tone = mark === 'cancelled'
    ? 'text-[#3f3c36] dark:text-[#c9c4b8]'
    : mark === 'unknown'
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-error)]';

  return (
    <div className={cn('grid h-[88px] w-[88px] shrink-0 place-items-center', tone)} aria-hidden>
      <motion.svg
        viewBox="0 0 80 80"
        className="h-20 w-20"
        initial={reduced ? false : { opacity: 0.65, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.45, ease: DRAW }}
      >
        {mark === 'provider' || mark === 'technical' ? (
          <motion.circle
            cx="40"
            cy="40"
            r="27"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeDasharray="110 60"
            initial={reduced ? false : { strokeDashoffset: 110 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: reduced ? 0 : 0.45, ease: DRAW }}
          />
        ) : (
          <motion.circle
            cx="40"
            cy="40"
            r="27"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: mark === 'unknown' ? 0.68 : 1 }}
            transition={{ duration: reduced ? 0 : 0.4, ease: DRAW }}
          />
        )}
        {mark === 'declined' ? (
          <motion.path
            d="M31 31 L49 49 M49 31 L31 49"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.22, delay: reduced ? 0 : 0.22, ease: DRAW }}
          />
        ) : null}
        {mark === 'cancelled' ? (
          <motion.path
            d="M33 40 H47"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.24, ease: DRAW }}
          />
        ) : null}
        {mark === 'unknown' ? (
          <motion.circle
            cx="40"
            cy="40"
            r="2.2"
            fill="currentColor"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.28 }}
          />
        ) : null}
      </motion.svg>
    </div>
  );
}

export default function PaymentFail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { openOrders } = useAuth();
  const { openCart } = useCart();
  const [previewKind, setPreviewKind] = useState<FailKind | null>(null);

  const code = searchParams.get('code');
  const message = searchParams.get('message');
  const orderId = searchParams.get('orderId');
  const hasProviderResult = Boolean(code || message || orderId);
  const previewAvailable = localResultPreviewAllowed() && !hasProviderResult;

  useEffect(() => {
    if (previewAvailable) return;
    reportPaymentFail({
      failure_stage: 'toss_redirect_fail',
      failure_code: sanitizeTossFailureCode(code, 'unknown_toss_failure'),
      orderNumberForDedupe: orderId ?? undefined,
    });
  }, [code, orderId, previewAvailable]);

  const kind = import.meta.env.DEV && previewKind ? previewKind : classifyFailure(code);
  const copy = FAIL_COPY[kind];
  const shownCode = import.meta.env.DEV && previewKind ? 'PREVIEW_NOT_A_PROVIDER_CODE' : visibleCode(code);
  const shownMessage = import.meta.env.DEV && previewKind
    ? '이것은 미리보기용으로 길게 적은 안내 문장입니다. 실제 결제사 응답이 아니며 화면에서 줄바꿈만 확인합니다.'
    : (message?.trim() || '');
  const isDark = theme === 'dark';
  const muted = isDark ? 'text-[#c9c4b8]' : 'text-[#3f3c36]';
  const line = isDark ? 'border-white/10' : 'border-black/10';
  const primaryBtn = cn(
    'focus-ring inline-flex h-12 w-full items-center justify-center rounded-[2px] px-5 text-[0.9375rem] font-medium sm:flex-[1.4]',
    isDark ? 'bg-[#f2f0ea] text-[#16150f]' : 'bg-[#1a1914] text-[#f4f1eb]',
  );
  const secondaryBtn = cn(
    'focus-ring inline-flex h-12 w-full items-center justify-center rounded-[2px] px-5 text-[0.9375rem] font-medium sm:flex-1',
    isDark ? 'bg-white/10 text-[#f3f1ec]' : 'bg-black/[0.05] text-[#16150f]',
  );
  const hasDetail = Boolean(shownMessage || shownCode || (orderId && !previewKind));

  const goCart = () => {
    navigate('/');
    openCart();
  };
  const goOrders = () => {
    navigate('/');
    openOrders();
  };
  const orderHistoryFirst = kind === 'technical' || kind === 'unknown';

  return (
    <div className={cn('px-6 py-14 md:px-10 md:py-20', isDark ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]')}>
      <div className="mx-auto flex w-full max-w-[42rem] flex-col">
        {import.meta.env.DEV && previewKind ? (
          <div className={cn('mb-10 flex items-center justify-between gap-4 border-b pb-4 text-xs', line, muted)}>
            <span>개발용 미리보기 · 결제 요청 없음</span>
            <button type="button" className="focus-ring h-10 px-3" onClick={() => setPreviewKind(null)}>목록</button>
          </div>
        ) : null}

        {import.meta.env.DEV && previewAvailable && !previewKind ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-[1.75rem] font-medium leading-tight tracking-[-0.02em]">개발용 상태 미리보기</h1>
            <p className={cn('text-[0.9375rem] leading-relaxed', muted)}>확인할 상태를 고르세요. 이 화면은 결제를 다시 요청하지 않습니다.</p>
            {(['declined', 'cancelled', 'provider', 'technical', 'unknown'] as FailKind[]).map((item) => (
              <button key={item} type="button" className={secondaryBtn} onClick={() => setPreviewKind(item)}>
                {FAIL_COPY[item].title}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
              <PaymentStatusMark mark={kind} />
              <h1 className="mt-8 w-full max-w-[36rem] text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.02em]">{copy.title}</h1>
              <p className={cn('mt-3 max-w-[26rem] text-pretty text-[0.9375rem] leading-relaxed', muted)}>{copy.body}</p>
            </div>
            {hasDetail ? (
              <details className="mt-10 w-full">
                <summary className={cn('focus-ring w-fit cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden', muted)}>
                  상세 정보
                </summary>
                <div className={cn('mt-3 space-y-2 border-t pt-4 text-sm leading-relaxed', line, muted)}>
                  {shownMessage ? <p className="break-words">{shownMessage}</p> : null}
                  {shownCode ? <p className="break-all">코드 {shownCode}</p> : null}
                  {orderId && !previewKind ? <p className="break-all">주문번호 {orderId}</p> : null}
                </div>
              </details>
            ) : null}
            <div className="mt-12 flex w-full flex-col gap-3 sm:flex-row">
              {orderHistoryFirst ? (
                <>
                  <button type="button" className={primaryBtn} onClick={goOrders}>주문 내역 보기</button>
                  <button type="button" className={secondaryBtn} onClick={goCart}>장바구니로</button>
                </>
              ) : (
                <>
                  <button type="button" className={primaryBtn} onClick={goCart}>장바구니로</button>
                  <button type="button" className={secondaryBtn} onClick={() => navigate('/')}>쇼핑 계속하기</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
