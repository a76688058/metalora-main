import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { cn } from '../lib/cn';
import { resolvePurchaseAnalyticsAfterConfirm } from '../lib/purchaseAnalyticsDedupe';
import {
  httpFailureCode,
  reportPaymentFail,
} from '../lib/paymentFailureAnalytics';

function localResultPreviewAllowed(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

type SuccessPreview = 'verifying' | 'confirmed' | 'unknown';

const DRAW = [0.16, 1, 0.3, 1] as const;

function PaymentStatusMark({ mark }: { mark: SuccessPreview }) {
  const reduced = usePrefersReducedMotion();
  const tone = mark === 'unknown' ? 'text-[var(--color-warning)]' : 'text-accent';

  if (mark === 'verifying') {
    return (
      <div className={cn('grid h-[88px] w-[88px] shrink-0 place-items-center', tone)} aria-hidden>
        <motion.div
          className="h-20 w-20"
          animate={reduced ? { rotate: 0 } : { rotate: 360 }}
          transition={reduced ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 80 80" className="h-full w-full">
            <circle cx="40" cy="40" r="27" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.25" />
            <motion.circle
              cx="40"
              cy="40"
              r="27"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeDasharray="46 124"
              animate={reduced ? { opacity: 1 } : { opacity: [0.42, 1, 0.42] }}
              transition={reduced ? { duration: 0 } : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </svg>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn('grid h-[88px] w-[88px] shrink-0 place-items-center', tone)} aria-hidden>
      <motion.svg
        viewBox="0 0 80 80"
        className="h-20 w-20"
        initial={reduced ? false : { scale: 0.96, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.55, ease: DRAW }}
      >
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
          transition={{ duration: reduced ? 0 : 0.46, ease: DRAW }}
        />
        {mark === 'confirmed' ? (
          <motion.path
            d="M29 41.5 L36.5 49 L51.5 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.24, delay: reduced ? 0 : 0.3, ease: DRAW }}
          />
        ) : (
          <motion.circle
            cx="40"
            cy="40"
            r="2.2"
            fill="currentColor"
            initial={reduced ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.34, ease: DRAW }}
          />
        )}
      </motion.svg>
    </div>
  );
}

/**
 * METALORA PII(Personally Identifiable Information) 보호 모듈
 * @description 프리미엄 브랜드의 격에 맞는 정교한 마스킹 처리를 수행합니다.
 */
const MaskingUtil = {
  // 성명 마스킹 (예: 강동훈 -> 강*훈)
  name: (name: string) => {
    if (!name) return '알수없음';
    if (name.length <= 2) return name.replace(/^(.)(.+)$/, '$1*');
    return name.replace(/^(.)(.+)(.)$/, '$1*$3');
  },

  // 연락처 마스킹 (예: 010-1234-5678 -> 010-****-5678)
  phone: (phone: string) => {
    if (!phone) return '알수없음';
    return phone.replace(/^(\d{3})-(\d{4})-(\d{4})$/, '$1-****-$3');
  },

  // 주소 마스킹 (시/군/구까지만 노출)
  address: (address: string) => {
    if (!address) return '알수없음';
    const parts = address.split(' ');
    return parts.length > 2 ? `${parts[0]} ${parts[1]} ...` : address;
  }
};

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshCart } = useCart();
  const { openOrders } = useAuth();
  const { theme } = useTheme();
  const [isConfirming, setIsConfirming] = useState(true);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<SuccessPreview | null>(null);

  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const totalAmount = searchParams.get('amount') || searchParams.get('totalAmount');
  const method = searchParams.get('method') || searchParams.get('paymentType');

  const isProcessing = React.useRef(false);
  const hasPaymentAttempt = Boolean(paymentKey && orderId && totalAmount);
  const previewAvailable = localResultPreviewAllowed() && !hasPaymentAttempt;

  useEffect(() => {
    if (previewAvailable) return;
    const confirmPayment = async () => {
      if (isProcessing.current) return;
      if (!paymentKey || !orderId || !totalAmount) {
        setErrorMessage('결제 정보가 올바르지 않습니다. 주문 내역을 확인해 주세요.');
        setIsConfirming(false);
        return;
      }

      isProcessing.current = true;
      setIsConfirming(true);
      setErrorMessage(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          reportPaymentFail({
            failure_stage: 'confirm_http',
            failure_code: 'http_401',
            orderNumberForDedupe: orderId ?? undefined,
          });
          throw new Error('로그인 세션이 만료되었습니다. 다시 로그인 후 주문 내역을 확인해 주세요.');
        }

        // Optional UI/cart snapshot only — never required for server recovery
        let pendingItems: any[] | null = null;
        const pendingOrderStr = sessionStorage.getItem('pendingOrder');
        if (pendingOrderStr) {
          try {
            const pendingOrderData = JSON.parse(pendingOrderStr);
            if (Array.isArray(pendingOrderData?.items)) {
              pendingItems = pendingOrderData.items;
            }
          } catch {
            pendingItems = null;
          }
        }

        let response: Response;
        try {
          response = await fetch('/api/payment/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              paymentKey,
              orderId,
              amount: totalAmount,
            }),
          });
        } catch {
          reportPaymentFail({
            failure_stage: 'confirm_network',
            failure_code: 'network_error',
            orderNumberForDedupe: orderId ?? undefined,
          });
          throw new Error('결제 승인 중 오류가 발생했습니다.');
        }

        let result: Record<string, unknown>;
        try {
          result = (await response.json()) as Record<string, unknown>;
        } catch {
          reportPaymentFail({
            failure_stage: response.ok ? 'confirm_finalize' : 'confirm_http',
            failure_code: response.ok
              ? 'invalid_confirm_success_response'
              : httpFailureCode(response.status),
            orderNumberForDedupe: orderId ?? undefined,
          });
          throw new Error('결제 승인 중 오류가 발생했습니다.');
        }

        if (!response.ok) {
          reportPaymentFail({
            failure_stage: 'confirm_http',
            failure_code: httpFailureCode(response.status),
            orderNumberForDedupe: orderId ?? undefined,
          });
          throw new Error(
            (typeof result.error === 'string' && result.error) ||
              '결제 승인 중 오류가 발생했습니다.',
          );
        }

        if (result.success !== true) {
          reportPaymentFail({
            failure_stage: 'confirm_finalize',
            failure_code: 'invalid_confirm_success_response',
            orderNumberForDedupe: orderId ?? undefined,
          });
          throw new Error('결제 승인 중 오류가 발생했습니다.');
        }

        resolvePurchaseAnalyticsAfterConfirm(result);

        // Optional cart clear when session snapshot is still available
        if (pendingItems && pendingItems.length > 0) {
          const { data: userAuth } = await supabase.auth.getUser();
          const userId = userAuth.user?.id;

          if (userId) {
            const productIds = pendingItems
              .map((item: any) => item.product_id)
              .filter((id: any) => id && id !== 'workshop-single');

            if (productIds.length > 0) {
              await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', userId)
                .in('product_id', productIds);
            }

            const hasWorkshopItem = pendingItems.some(
              (item: any) => item.product_id === 'workshop-single' || item.product_title?.includes('커스텀') || item.product_id === null
            );

            if (hasWorkshopItem) {
              await supabase
                .from('cart_items')
                .delete()
                .eq('user_id', userId)
                .eq('product_id', 'workshop-single');
            }

            await refreshCart();
          }
        }

        sessionStorage.removeItem('pendingOrder');
        setIsConfirming(false);
        // Keep isProcessing.current = true to prevent duplicate success UI remounts
      } catch (error: any) {
        console.error('Payment confirmation error:', error);
        setErrorMessage(error.message || "결제 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.");
        setIsConfirming(false);
        // Allow same-page retry after failure
        isProcessing.current = false;
      }
    };

    confirmPayment();
  }, [paymentKey, orderId, totalAmount, method, searchParams, previewAvailable]);


  const handleCopy = () => {
    const value = import.meta.env.DEV && previewMode
      ? 'ML-PREVIEW-0000-NOT-A-REAL-ORDER-WITH-A-LONG-IDENTIFIER'
      : orderId;
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goHome = () => navigate('/');
  const goOrders = () => {
    navigate('/');
    openOrders();
  };

  const reducedMotion = usePrefersReducedMotion();
  const isDark = theme === 'dark';
  const pageClass = isDark ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]';
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

  const showingPreview = import.meta.env.DEV && Boolean(previewMode);
  const view: SuccessPreview = showingPreview && previewMode
    ? previewMode
    : (isConfirming ? 'verifying' : errorMessage ? 'unknown' : 'confirmed');
  const shownOrderId = import.meta.env.DEV && previewMode
    ? 'ML-PREVIEW-0000-NOT-A-REAL-ORDER-WITH-A-LONG-IDENTIFIER'
    : orderId;
  const amountNumber = import.meta.env.DEV && previewMode ? 54900 : Number(totalAmount);
  const amountLabel = Number.isFinite(amountNumber) ? `₩${amountNumber.toLocaleString()}` : '금액 확인 필요';

  const title = view === 'verifying'
    ? '결제 결과를 확인하고 있습니다'
    : view === 'unknown'
      ? '결제 상태를 확인하지 못했습니다'
      : '결제가 확인되었습니다';
  const support = view === 'verifying'
    ? '아직 결제가 확인되지 않았습니다.'
    : view === 'unknown'
      ? '결제 완료로 확인할 수 없습니다. 주문 내역을 확인해 주세요.'
      : (import.meta.env.DEV && showingPreview
        ? '예시 주문번호와 금액입니다. 결제는 진행되지 않았습니다.'
        : '주문 내역에서 진행 상태를 확인할 수 있습니다.');

  const page = (body: React.ReactNode) => (
    <div className={cn('px-6 py-14 md:px-10 md:py-20', pageClass)}>
      <div className="mx-auto flex w-full max-w-[42rem] flex-col">{body}</div>
    </div>
  );

  if (import.meta.env.DEV && previewAvailable && !previewMode) {
    return page(
      <div className="flex flex-col gap-4">
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-[-0.02em]">개발용 상태 미리보기</h1>
        <p className={cn('text-[0.9375rem] leading-relaxed', muted)}>확인할 상태를 고르세요. 주소만으로는 미리보기가 열리지 않습니다.</p>
        <button type="button" className={secondaryBtn} onClick={() => setPreviewMode('verifying')}>확인 중</button>
        <button type="button" className={secondaryBtn} onClick={() => setPreviewMode('confirmed')}>확인된 성공</button>
        <button type="button" className={secondaryBtn} onClick={() => setPreviewMode('unknown')}>확인 불가</button>
      </div>,
    );
  }

  return page(
    <>
      {import.meta.env.DEV && showingPreview ? (
        <div className={cn('mb-10 flex items-center justify-between gap-4 border-b pb-4 text-xs', line, muted)}>
          <span>개발용 미리보기 · 결제 요청 없음</span>
          <button type="button" className="focus-ring h-10 px-3" onClick={() => setPreviewMode(null)}>목록</button>
        </div>
      ) : null}
      <div className="flex flex-col items-center text-center" role="status" aria-live="polite" aria-busy={view === 'verifying'}>
        <PaymentStatusMark mark={view} />
        <h1 className="mt-8 w-full max-w-[36rem] text-balance text-[1.75rem] font-medium leading-tight tracking-[-0.02em]">{title}</h1>
        <p className={cn('mt-3 max-w-[26rem] text-pretty text-[0.9375rem] leading-relaxed', muted)}>{support}</p>
      </div>
      {view === 'unknown' && !showingPreview && errorMessage ? (
        <p className={cn('mx-auto mt-6 max-w-[26rem] text-center text-sm leading-relaxed break-words', muted)}>{errorMessage}</p>
      ) : null}
      {view === 'confirmed' ? (
        <motion.section
          aria-label="주문 정보"
          className="mt-12 w-full"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.45, delay: reducedMotion ? 0 : 0.12, ease: DRAW }}
        >
          <div className={cn('flex items-start justify-between gap-4 border-t pt-7', line)}>
            <div className="min-w-0">
              <p className={cn('text-xs tracking-[0.06em]', muted)}>주문번호</p>
              <p className="mt-1.5 break-all text-sm font-medium leading-6">{shownOrderId || '주문번호 확인 필요'}</p>
            </div>
            {shownOrderId ? (
              <button
                type="button"
                className={cn('focus-ring grid h-11 w-11 shrink-0 place-items-center', muted)}
                onClick={handleCopy}
                aria-label={copied ? '주문번호를 복사했습니다' : '주문번호 복사'}
              >
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              </button>
            ) : null}
          </div>
          <div className="mt-7 flex items-baseline justify-between gap-4">
            <p className={cn('text-xs tracking-[0.06em]', muted)}>결제 금액</p>
            <p className="text-[1.375rem] font-medium tabular-nums tracking-[-0.03em]">{amountLabel}</p>
          </div>
        </motion.section>
      ) : null}
      {view !== 'verifying' ? (
        <div className="mt-12 flex w-full flex-col gap-3 sm:flex-row">
          <button type="button" className={primaryBtn} onClick={goOrders}>주문 내역 보기</button>
          {!showingPreview && view === 'unknown' && hasPaymentAttempt ? (
            <button type="button" className={secondaryBtn} onClick={() => window.location.reload()}>다시 확인</button>
          ) : null}
          <button type="button" className={secondaryBtn} onClick={goHome}>쇼핑 계속하기</button>
        </div>
      ) : null}
    </>,
  );
}
