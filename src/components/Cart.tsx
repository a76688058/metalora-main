import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { X, ShoppingBag, ChevronRight, MapPin, CreditCard, Loader2, Trash2, Plus, Minus, Search, Check } from 'lucide-react';
import { CART_AUTH_RETURN_KEY, useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { loadTossPayments } from '@tosspayments/payment-sdk';
import PolicyModal from './PolicyModal';
import LoginModal from './LoginModal';
import { policies } from '../constants/policies';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { GenieShell } from './shell/genieShell';
import { Product } from '../data/products';
import { track, type AnalyticsItem } from '../lib/analytics';
import {
  extractTossCodeFromError,
  httpFailureCode,
  reportPaymentFail,
  sanitizeTossFailureCode,
} from '../lib/paymentFailureAnalytics';
import { isExistingPasswordEnrollmentCandidate, isUsableMemberProfile, safeInternalPath } from '../lib/authIntegrity';
import { cartMayOpenCanonicalCheckout, isExplicitPaymentTestIsolation } from '../lib/paymentEnvGuard';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../lib/publicPaymentFreeze';
import { hasCompleteShipping, type CheckoutShippingFields } from '../lib/checkoutShipping';
import { assertTossTestClientKey, CARD_SCREENING_TEST_ENABLED, createCardScreeningOrderId } from '../lib/cardScreeningTest';
import { resolveTossClientKey } from '../lib/tossClientKey';
import { checkoutPolicyVersionSnapshot } from '../lib/policyVersions';
import { useWorkshopMediaDisplay } from '../hooks/useWorkshopMediaDisplay';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import {
  classifyCartLine,
  readSeenUnit,
  writeSeenUnit,
  type CartLineNotice,
  type CartNoticeInput,
} from '../lib/cartLineNotice';
import { CART_CONTINUE_LINE_KEY, customCheckoutCartItemId } from '../lib/customComposition/submitCustomCart';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
}

function parsePositiveKrwAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
    return parsed;
  }
  return null;
}

function isCustomCartRow(item: { product_id?: string; product_type?: string }): boolean {
  return item.product_id === 'workshop-single' || item.product_type === 'workshop';
}

function customUnitPrice(item: { custom_config?: { price?: unknown; price_snapshot?: unknown } }): number {
  return (
    parsePositiveKrwAmount(item.custom_config?.price_snapshot) ??
    parsePositiveKrwAmount(item.custom_config?.price) ??
    0
  );
}

function cartRowOrientation(item: {
  orientation?: string | null;
  custom_config?: { orientation?: unknown };
}): 'portrait' | 'landscape' | null {
  if (item.orientation === 'portrait' || item.orientation === 'landscape') {
    return item.orientation;
  }
  const fromConfig = item.custom_config?.orientation;
  if (fromConfig === 'portrait' || fromConfig === 'landscape') {
    return fromConfig;
  }
  return null;
}

function customSizeLabel(size: unknown): string {
  const raw = typeof size === 'string' ? size.trim() : '';
  if (!raw || raw === 'A4') return 'M';
  return raw;
}

function cartLineInput(
  item: {
    product_id?: string;
    product_type?: string;
    selected_option?: string;
    custom_config?: { price?: unknown; price_snapshot?: unknown };
    product?: CartNoticeInput['product'];
  },
  seenUnit: number | null,
): CartNoticeInput {
  return {
    kind: isCustomCartRow(item) ? 'workshop' : 'catalog',
    product: item.product ?? null,
    optionId: item.selected_option ?? '',
    workshopUnit: customUnitPrice(item),
    seenUnit,
  };
}

function CartLineCopy({ notice }: { notice: CartLineNotice }) {
  if (!notice.statusMessage && !notice.priceMessage) return null;
  return (
    <div className="mt-2 space-y-1">
      {notice.statusMessage ? (
        <p className="text-sm font-medium" role="status">{notice.statusMessage}</p>
      ) : null}
      {notice.priceMessage ? (
        <p className="text-sm font-medium" role="status">{notice.priceMessage}</p>
      ) : null}
    </div>
  );
}

function isolatedReviewThumb(lineId: string): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return '';
  const bridge = (window as Window & {
    __metaloraConceptCartReview?: { src?: (id: string) => string };
  }).__metaloraConceptCartReview;
  return bridge?.src?.(lineId) ?? '';
}

function isolatedReviewLabel(): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return '';
  const bridge = (window as Window & {
    __metaloraConceptCartReview?: { active?: boolean; label?: string };
  }).__metaloraConceptCartReview;
  return bridge?.active ? (bridge.label || '') : '';
}

function cartThumbFrameClass(orientation: 'portrait' | 'landscape' | null, compact = false): string {
  const size = orientation === 'landscape'
    ? (compact
      ? 'w-[4.5rem] h-[3.15rem]'
      : 'w-[6.75rem] h-[4.75rem] sm:w-[7.5rem] sm:h-[5.25rem]')
    : (compact
      ? 'w-[3.15rem] h-[4.5rem]'
      : 'w-[4.75rem] h-[6.75rem] sm:w-[5.25rem] sm:h-[7.5rem]');
  return `${size} rounded-[2px] bg-black/[0.04] dark:bg-white/[0.06]`;
}

type CartCheckState = 'off' | 'on' | 'mixed';

function CartCheckMark({ state }: { state: CartCheckState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[22px] items-center justify-center rounded-[2px] border',
        state === 'off'
          ? 'border-black/40 bg-transparent dark:border-white/50'
          : 'border-accent bg-accent text-text-inverse',
      )}
    >
      {state === 'on' ? <Check size={14} strokeWidth={3} /> : null}
      {state === 'mixed' ? <Minus size={14} strokeWidth={3} /> : null}
    </span>
  );
}

function BrandMark({
  label,
  background,
  children,
}: {
  label: string;
  background: string;
  children: React.ReactNode;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: background }}
    >
      {children}
    </span>
  );
}

function CheckoutPaymentCard({ muted }: { muted: string }) {
  return (
    <div className="rounded-[2px] border border-accent/35 bg-accent/[0.04] px-3.5 py-3 dark:border-accent/45 dark:bg-accent/[0.07]">
      <h3 className="text-base font-medium leading-none">결제 수단</h3>
      <p className={cn('mt-1 text-xs leading-relaxed', muted)}>카드부터 간편결제까지, 한 번에</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2" role="group" aria-label="대표 결제 수단">
        <BrandMark label="카카오페이" background="#FEE500">
          <svg viewBox="0 0 24 24" className="size-[1.15rem]" aria-hidden="true">
            <path fill="#191919" d="M12 3.1C6.7 3.1 2.4 6.5 2.4 10.7c0 2.7 1.8 5.1 4.5 6.4l-.9 3.3c-.1.3.2.6.5.4l3.9-2.6c.5.1 1 .1 1.6.1 5.3 0 9.6-3.4 9.6-7.6S17.3 3.1 12 3.1z" />
          </svg>
        </BrandMark>
        <BrandMark label="토스페이" background="#0064FF">
          <svg viewBox="4 2 168 186" className="h-[1.2rem] w-[1.15rem]" aria-hidden="true">
            <path fill="#fff" d="m118.5 45.4 8.9-41.8c.4-2.1-1.4-4-3.5-3.5-12.9 2.3-26.3 6.3-39.6 12-59.8 25.3-96 74.9-80.8 110.8 11.5 26.9 48.6 38.4 91.7 31.7l-8.9 41.8c-.4 2.1 1.4 4 3.5 3.5 12.9-2.3 26.3-6.3 39.6-12 59.8-25.3 95.9-74.9 80.7-110.9-11.4-26.8-48.5-38.3-91.6-31.6z" />
          </svg>
        </BrandMark>
        <BrandMark label="네이버페이" background="#03C75A">
          <svg viewBox="-1.5 -1.5 27 27" className="size-[1.15rem]" aria-hidden="true">
            <path fill="#fff" d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845Z" />
          </svg>
        </BrandMark>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-black/12 text-[11px] tracking-[0.12em] text-current/55 dark:border-white/15 dark:text-current/60"
          >
            ···
          </span>
          <span className={cn('text-xs leading-none', muted)}>외 다양한 결제수단</span>
        </span>
      </div>
    </div>
  );
}

function RollingKrwAmount({
  value,
  reducedMotion,
  className,
}: {
  value: number;
  reducedMotion: boolean;
  className?: string;
}) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const [display, setDisplay] = useState(safe);
  const displayRef = useRef(safe);

  useEffect(() => {
    const controls = animate(displayRef.current, safe, {
      duration: reducedMotion ? 0 : 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (next) => {
        const floored = Math.floor(next);
        if (!Number.isFinite(floored)) return;
        displayRef.current = floored;
        setDisplay(floored);
      },
    });
    return () => controls.stop();
  }, [safe, reducedMotion]);

  return <span className={cn('tabular-nums', className)}>₩{display.toLocaleString()}</span>;
}

function joinAnalyticsVariant(
  ...fragments: Array<string | null | undefined>
): string | undefined {
  const parts = fragments
    .map((fragment) => (typeof fragment === 'string' ? fragment.trim() : ''))
    .filter((fragment) => fragment.length > 0);
  return parts.length > 0 ? parts.join(' / ') : undefined;
}

function canonicalAnalyticsOrientation(
  value: unknown,
): 'portrait' | 'landscape' | undefined {
  return value === 'portrait' || value === 'landscape' ? value : undefined;
}

function buildAnalyticsItem(input: {
  item_id: string;
  item_name?: string;
  item_variant?: string;
  price: number;
  quantity: number;
}): AnalyticsItem {
  const item: Record<string, string | number> = {
    item_id: input.item_id,
    price: input.price,
    quantity: input.quantity,
  };
  if (input.item_name) {
    item.item_name = input.item_name;
  }
  if (input.item_variant) {
    item.item_variant = input.item_variant;
  }
  return item as AnalyticsItem;
}

/** Map selected cart rows to safe GA4 ecommerce items (no PII / no custom image URLs). */
function mapSelectedItemsToAnalyticsItems(
  items: Array<{
    product_id: string;
    product_type: 'stock' | 'workshop';
    selected_option: string;
    quantity: number;
    orientation?: string | null;
    custom_config?: { price?: number; size?: string; price_snapshot?: unknown };
    product?: Product;
  }>,
): AnalyticsItem[] {
  return items.map((item) => {
    const orientation = canonicalAnalyticsOrientation(item.orientation);

    if (item.product_id === 'workshop-single' || item.product_type === 'workshop') {
      const unitPrice = customUnitPrice(item);
      const size =
        typeof item.custom_config?.size === 'string' ? item.custom_config.size : undefined;
      return buildAnalyticsItem({
        item_id: 'workshop-single',
        item_name: '나만의 커스텀 포스터',
        item_variant: joinAnalyticsVariant(size, orientation),
        price: unitPrice,
        quantity: item.quantity,
      });
    }

    const option = item.product?.options?.find(
      (opt) => opt.id === item.selected_option,
    );
    const unitPrice = option?.price ?? 0;
    const optionName = typeof option?.name === 'string' ? option.name : undefined;
    const title =
      typeof item.product?.title === 'string' ? item.product.title.trim() : '';
    return buildAnalyticsItem({
      item_id: item.product_id,
      item_name: title || undefined,
      item_variant: joinAnalyticsVariant(optionName, orientation),
      price: unitPrice,
      quantity: item.quantity,
    });
  });
}

export default function Cart() {
  const navigate = useNavigate();
  const location = useLocation();
  const cartAuthReturnPath = safeInternalPath(`${location.pathname}${location.search}`);
  const { cartItems, removeFromCart, updateQuantity, totalPrice, isLoading: isCartLoading, cartLoadFailed, refreshCart, isCartOpen, closeCart } = useCart();
  const { theme } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const isOpen = isCartOpen;
  const onClose = closeCart;
  const muted = theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]';

  const { user, adminUser, profile, adminProfile, isLoading: isAuthLoading, isProfileResolved } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState(1); // 1: List, 2: Order Form
  const cartEnterSettled = useRef(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const pendingCheckoutRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [displayPrice, setDisplayPrice] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setIsLoginModalOpen(false);
      pendingCheckoutRef.current = false;
      cartEnterSettled.current = false;
      return;
    }
    void refreshCart();
    const id = window.setTimeout(() => {
      cartEnterSettled.current = true;
    }, 520);
    return () => window.clearTimeout(id);
  }, [isOpen, refreshCart]);

  useEffect(() => {
    const viewerId = user?.id || adminUser?.id;
    if (!viewerId) return;
    for (const item of cartItems) {
      const status = classifyCartLine(cartLineInput(item, null));
      if (status.currentUnit < 1) continue;
      if (status.block === 'missing' || status.block === 'option_missing' || status.block === 'price_unknown') continue;
      if (readSeenUnit(viewerId, item.id) == null) {
        writeSeenUnit(viewerId, item.id, status.currentUnit);
      }
    }
  }, [user?.id, adminUser?.id, cartItems]);

  // Initialize selection: Select all by default
  useEffect(() => {
    if (isOpen && cartItems.length > 0) {
      setSelectedIds(new Set(cartItems.map(item => item.id)));
    }
  }, [isOpen, cartItems.length]);

  const workshopMedia = useWorkshopMediaDisplay(
    isOpen ? cartItems.filter(isCustomCartRow).map((item) => item.custom_image) : [],
    'customer',
  );

  const selectedItems = cartItems.filter(item => selectedIds.has(item.id));
  const selectedTotalPrice = selectedItems.reduce((sum, item) => {
    const unit = classifyCartLine(cartLineInput(item, null)).currentUnit;
    return sum + (unit * item.quantity);
  }, 0);

  // Toss-style price animation
  useEffect(() => {
    const controls = animate(displayPrice, selectedTotalPrice, {
      duration: reducedMotion ? 0 : 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setDisplayPrice(Math.floor(value)),
    });
    return () => controls.stop();
  }, [selectedTotalPrice, reducedMotion]);

  const toggleSelectAll = () => {
    if (selectedIds.size === cartItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cartItems.map(item => item.id)));
    }
  };

  const toggleItemSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  
  // Shipping Form State
  const [shippingData, setShippingData] = useState<CheckoutShippingFields>({
    name: '',
    phone: '',
    zipCode: '',
    address: '',
    addressDetail: '',
  });
  const [shippingTouched, setShippingTouched] = useState<Partial<Record<keyof CheckoutShippingFields, boolean>>>({});
  
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const postcodeRef = useRef<HTMLDivElement>(null);

  // Consent State
  const [consents, setConsents] = useState({
    content: false,
    refund: false,
    terms: false,
  });
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; key: keyof typeof policies | null }>({
    isOpen: false,
    key: null,
  });
  const [consentModal, setConsentModal] = useState<{ isOpen: boolean; type: 'content' | 'refund' | 'terms' | null }>({
    isOpen: false,
    type: null,
  });

  // Reset consents when opening bottom sheet
  useEffect(() => {
    if (isBottomSheetOpen) {
      setConsents({ content: false, refund: false, terms: false });
    }
  }, [isBottomSheetOpen]);

  const hasWorkshopItems = selectedItems.some(item => item.product_type === 'workshop');
  const isAllConsented = consents.refund && consents.terms && (!hasWorkshopItems || consents.content);

  // Helper to get the correct supabase client based on active session
  const getClient = () => {
    return supabase;
  };

  const CONSENT_TEXTS = {
    content: {
      title: '콘텐츠 권리 책임 동의',
      items: [
        '업로드한 이미지의 <strong class="font-semibold">저작권 및 초상권</strong>은 본인에게 있습니다.',
        '권리자의 허가 없이 사용 시 발생하는 <strong class="font-semibold">모든 법적 책임</strong>은 본인에게 있습니다.'
      ]
    },
    refund: {
      title: '환불 및 교환 정책 동의',
      items: [
        ...(hasWorkshopItems
          ? [
              'WORKSHOP은 <strong class="font-semibold">이미지 검수 및 제작 승인 전</strong>까지 주문을 취소할 수 있습니다.',
              '제작 승인 이후에는 사전 안내 및 동의한 범위에서 <strong class="font-semibold">단순변심에 의한 청약철회가 제한될 수 있습니다</strong>.',
              '제품의 <strong class="font-semibold">불량·파손·오배송</strong>에 대한 교환·환불 권리는 제한되지 않습니다.',
            ]
          : []),
        '상품의 <strong class="font-semibold">명백한 하자 또는 오배송</strong>의 경우 수령 후 7일 이내에 교환/반품 신청이 가능합니다.',
        '모니터 사양에 따른 <strong class="font-semibold">색상 차이, 원본 파일의 저화질 및 노이즈</strong>는 환불 사유에 해당하지 않음을 인지하였습니다.'
      ]
    },
    terms: {
      title: '전체 약관 동의',
      items: [
        '<strong class="font-semibold">이용약관, 개인정보처리방침, 쿠키 정책, 커스텀 제작 동의서</strong>를 모두 확인하였으며 이에 동의합니다.'
      ]
    }
  };

  // Initialize shipping data from profile
  useEffect(() => {
    if (profile && step === 2) {
      setShippingData({
        name: profile.full_name || '',
        phone: profile.phone_number || '',
        zipCode: profile.zip_code || '',
        address: profile.address || '',
        addressDetail: profile.address_detail || '',
      });
    }
  }, [profile, step]);

  // Daum Postcode Script Loading
  useEffect(() => {
    const scriptId = 'daum-postcode-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleOpenPostcode = () => {
    if (!(window as any).daum || !(window as any).daum.Postcode) {
      showToast('주소 서비스 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    
    setIsPostcodeOpen(true);
    setTimeout(() => {
      if (postcodeRef.current) {
        new (window as any).daum.Postcode({
          oncomplete: (data: any) => {
            let fullAddress = data.address;
            let extraAddress = '';

            if (data.addressType === 'R') {
              if (data.bname !== '') extraAddress += data.bname;
              if (data.buildingName !== '') {
                extraAddress += extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName;
              }
              fullAddress += extraAddress !== '' ? ` (${extraAddress})` : '';
            }

            setShippingData(prev => ({
              ...prev,
              zipCode: data.zonecode,
              address: fullAddress,
            }));
            setIsPostcodeOpen(false);
          },
          width: '100%',
          height: '100%',
        }).embed(postcodeRef.current);
      }
    }, 0);
  };

  const currentAuthUser = user || adminUser;
  const noticeFor = (item: (typeof cartItems)[number]) =>
    classifyCartLine(cartLineInput(item, currentAuthUser ? readSeenUnit(currentAuthUser.id, item.id) : null));
  const selectedBlocked = selectedItems.some((item) => noticeFor(item).block);
  const selectedPriceChanged = selectedItems.some((item) => noticeFor(item).priceChanged);
  const rememberSelectedPrices = () => {
    if (!currentAuthUser) return;
    for (const item of selectedItems) {
      const status = noticeFor(item);
      if (status.currentUnit < 1) continue;
      if (status.block === 'missing' || status.block === 'option_missing' || status.block === 'price_unknown') continue;
      writeSeenUnit(currentAuthUser.id, item.id, status.currentUnit);
    }
  };
  const checkoutProfile =
    currentAuthUser && profile?.id === currentAuthUser.id
      ? profile
      : currentAuthUser && adminProfile?.id === currentAuthUser.id
        ? adminProfile
        : null;
  const canCheckout =
    Boolean(currentAuthUser) && isUsableMemberProfile(checkoutProfile);
  const canCheckoutRef = useRef(canCheckout);
  canCheckoutRef.current = canCheckout;
  const checkoutAuthPending =
    isAuthLoading || (Boolean(currentAuthUser) && !isProfileResolved);
  const screeningCheckout = CARD_SCREENING_TEST_ENABLED && PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7;
  const checkoutClosed = PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 && !screeningCheckout;
  const continueLineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    let lineId: string | null = null;
    try {
      lineId = sessionStorage.getItem(CART_CONTINUE_LINE_KEY);
      if (lineId) sessionStorage.removeItem(CART_CONTINUE_LINE_KEY);
    } catch {
      lineId = null;
    }
    if (lineId) continueLineRef.current = lineId;
  }, [isOpen]);

  useEffect(() => {
    const lineId = continueLineRef.current;
    if (!lineId || !isOpen) return;
    if (!cartItems.some((item) => item.id === lineId)) return;
    continueLineRef.current = null;
    setSelectedIds(new Set([lineId]));
    if (canCheckout && !checkoutClosed) setStep(2);
  }, [isOpen, cartItems, canCheckout, checkoutClosed]);

  const beginCheckoutStep = () => {
    if (selectedIds.size === 0 || step !== 1) return;
    if (selectedItems.some((item) => noticeFor(item).block)) {
      showToast('주문할 수 없는 상품이 선택되어 있습니다.', 'error');
      return;
    }
    track('begin_checkout', {
      currency: 'KRW',
      value: selectedTotalPrice,
      items: mapSelectedItemsToAnalyticsItems(selectedItems),
    });
    setStep(2);
  };

  const requireCheckoutAuth = (): boolean => {
    if (checkoutAuthPending) return false;
    if (canCheckout) return true;
    if (user && isExistingPasswordEnrollmentCandidate(user, checkoutProfile)) {
      navigate('/member-enroll', { replace: true });
      return false;
    }
    try {
      sessionStorage.setItem(CART_AUTH_RETURN_KEY, '1');
    } catch {
      // Session storage can be unavailable. Password login still stays on this page.
    }
    pendingCheckoutRef.current = step === 1;
    setIsLoginModalOpen(true);
    return false;
  };

  const handlePayment = async () => {
    if (PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7) return;
    if (!requireCheckoutAuth()) return;
    const currentUser = user || adminUser;
    if (!currentUser) return;
    if (!hasCompleteShipping(shippingData)) {
      showToast('배송 정보를 모두 입력해 주세요.', 'error');
      return;
    }
    if (selectedItems.some((item) => noticeFor(item).block)) {
      showToast('주문할 수 없는 상품이 선택되어 있습니다.', 'error');
      return;
    }

    if (!isAllConsented) {
      showToast('필수 약관에 모두 동의해 주세요.', 'error');
      return;
    }

    const resolvedProfile =
      profile?.id === currentUser.id
        ? profile
        : adminProfile?.id === currentUser.id
          ? adminProfile
          : null;
    const userCustomId = resolvedProfile?.user_custom_id?.trim() ?? '';
    if (!resolvedProfile || !userCustomId) {
      showToast('회원 프로필 정보가 없습니다. 다시 로그인하거나 고객센터에 문의해 주세요.', 'error');
      return;
    }

    try {
      setIsProcessing(true);
      const client = getClient();

      const { data: updatedProfiles, error: profileError } = await client
        .from('profiles')
        .update({
          full_name: shippingData.name,
          phone_number: shippingData.phone,
          zip_code: shippingData.zipCode,
          address: shippingData.address,
          address_detail: shippingData.addressDetail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentUser.id)
        .select('id');

      if (profileError) {
        throw new Error('배송 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      if (!updatedProfiles || updatedProfiles.length === 0) {
        throw new Error('회원 프로필을 찾을 수 없습니다. 다시 로그인 후 시도해 주세요.');
      }

      const prepareItems = selectedItems.map(item => {
        let title = '';
        let optionName = '';
        let optionId: string | null = null;

        if (item.product_id === 'workshop-single') {
          title = item.product?.title || '커스텀 포스터';
          optionName = item.custom_config?.size || '커스텀';
          optionId = null;
        } else {
          const option = item.product?.options?.find(opt => opt.id === item.selected_option);
          title = item.product?.title || '제품';
          optionName = option ? option.name : (item.selected_option || '');
          optionId = option?.id ?? item.selected_option ?? null;
        }

        const cartItemId = customCheckoutCartItemId(item);
        return {
          product_id: item.product_id === 'workshop-single' ? null : item.product_id,
          product_title: title,
          title,
          option_id: optionId,
          option: optionName,
          quantity: item.quantity,
          image: item.custom_image || item.product?.front_image || item.product?.image || null,
          user_image_url: item.custom_image || null,
          orientation: item.orientation || null,
          custom_config: item.custom_config || null,
          ...(cartItemId ? { cart_item_id: cartItemId } : {}),
        };
      });

      const { data: { session } } = await client.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.');
      }

      if (!cartMayOpenCanonicalCheckout({
        hostname: window.location.hostname,
        paymentTestIsolated: isExplicitPaymentTestIsolation({
          mode: import.meta.env.MODE,
          viteMetaloraEnv: import.meta.env.VITE_METALORA_ENV,
        }),
      })) {
        showToast('이 주소에서는 결제를 진행할 수 없습니다.', 'error');
        return;
      }

      let prepareResponse: Response;
      try {
        prepareResponse = await fetch('/api/payment/prepare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            items: prepareItems,
            shipping: {
              name: shippingData.name,
              phone: shippingData.phone,
              zip_code: shippingData.zipCode,
              address: shippingData.address,
              address_detail: shippingData.addressDetail,
            },
            consents: {
              ...consents,
              agreed_at: new Date().toISOString(),
              policy_versions: checkoutPolicyVersionSnapshot(hasWorkshopItems),
            },
          }),
        });
      } catch {
        reportPaymentFail({
          failure_stage: 'prepare_network',
          failure_code: 'network_error',
        });
        throw new Error('결제 준비 중 오류가 발생했습니다.');
      }

      let prepareResult: Record<string, unknown>;
      try {
        prepareResult = (await prepareResponse.json()) as Record<string, unknown>;
      } catch {
        reportPaymentFail({
          failure_stage: 'prepare_http',
          failure_code: prepareResponse.ok
            ? 'invalid_prepare_response'
            : httpFailureCode(prepareResponse.status),
        });
        throw new Error(
          prepareResponse.ok
            ? '결제 준비 응답이 올바르지 않습니다.'
            : '결제 준비 중 오류가 발생했습니다.',
        );
      }

      if (!prepareResponse.ok) {
        reportPaymentFail({
          failure_stage: 'prepare_http',
          failure_code: httpFailureCode(prepareResponse.status),
        });
        throw new Error(
          (typeof prepareResult.error === 'string' && prepareResult.error) ||
            '결제 준비 중 오류가 발생했습니다.',
        );
      }

      const orderNumber = prepareResult.orderId;
      const authoritativeAmount = Number(prepareResult.amount);
      if (
        typeof orderNumber !== 'string' ||
        !orderNumber ||
        !Number.isFinite(authoritativeAmount) ||
        authoritativeAmount <= 0
      ) {
        reportPaymentFail({
          failure_stage: 'prepare_http',
          failure_code: 'invalid_prepare_response',
          orderNumberForDedupe:
            typeof prepareResult.orderId === 'string' ? prepareResult.orderId : undefined,
        });
        throw new Error('결제 준비 응답이 올바르지 않습니다.');
      }

      const resolvedOrderNumber = orderNumber;

      const pendingOrderData = {
        order_number: resolvedOrderNumber,
        user_id: currentUser.id,
        user_custom_id: userCustomId,
        total_price: authoritativeAmount,
        status: 'PAID',
        shipping_name: shippingData.name,
        shipping_phone: shippingData.phone,
        zip_code: shippingData.zipCode,
        address: shippingData.address,
        address_detail: shippingData.addressDetail,
        shipping_info: {
          consents: {
            ...consents,
            agreed_at: new Date().toISOString(),
            policy_versions: checkoutPolicyVersionSnapshot(hasWorkshopItems),
          }
        },
        ordered_items: selectedItems.map(item => ({
          product_id: item.product_id,
          title: item.product?.title || (item.product_id === 'workshop-single' ? '커스텀 포스터' : '제품'),
          option: item.product_id === 'workshop-single' ? item.custom_config?.size : item.selected_option,
          quantity: item.quantity,
          price: item.product_id === 'workshop-single' ? (item.custom_config?.price || 0) : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0),
          user_image_url: item.custom_image,
          front_image: item.product?.front_image || item.product?.image,
          custom_config: item.custom_config
        }))
      };

      const pendingOrderItems = selectedItems.map(item => {
        let price = 0;
        let title = '';
        let optionName = '';
        let optionId: string | null = null;

        if (item.product_id === 'workshop-single') {
          price = item.custom_config?.price || 0;
          title = item.product?.title || '커스텀 포스터';
          optionName = item.custom_config?.size || '커스텀';
          optionId = null;
        } else {
          const option = item.product?.options?.find(opt => opt.id === item.selected_option);
          price = option ? option.price : 0;
          title = item.product?.title || '제품';
          optionName = option ? option.name : (item.selected_option || '');
          optionId = option?.id ?? item.selected_option ?? null;
        }

        return {
          product_id: item.product_id === 'workshop-single' ? null : item.product_id,
          product_title: title,
          title,
          option_id: optionId,
          option: optionName,
          quantity: item.quantity,
          price,
          image: item.custom_image || item.product?.front_image || item.product?.image || null,
          user_image_url: item.custom_image || null,
          front_image: item.product?.front_image || item.product?.image || null,
          orientation: item.orientation || null,
          custom_config: item.custom_config || null,
        };
      });

      sessionStorage.setItem('pendingOrder', JSON.stringify({
        order: pendingOrderData,
        items: pendingOrderItems
      }));

      const paymentTestIsolated = isExplicitPaymentTestIsolation({
        mode: import.meta.env.MODE,
        viteMetaloraEnv: import.meta.env.VITE_METALORA_ENV,
      });
      if (!cartMayOpenCanonicalCheckout({
        hostname: window.location.hostname,
        paymentTestIsolated,
      })) {
        showToast('이 주소에서는 결제를 진행할 수 없습니다.', 'error');
        return;
      }

      const resolvedClientKey = resolveTossClientKey({
        purpose: paymentTestIsolated ? 'payment-test' : 'production-checkout',
        raw: paymentTestIsolated
          ? import.meta.env.VITE_TOSS_TEST_CLIENT_KEY
          : import.meta.env.VITE_TOSS_LIVE_CLIENT_KEY,
      });
      if (!resolvedClientKey.ok) {
        showToast('결제 설정을 확인할 수 없어 결제를 진행할 수 없습니다.', 'error');
        return;
      }

      let tossPayments;
      try {
        tossPayments = await loadTossPayments(resolvedClientKey.key);
      } catch (error: unknown) {
        reportPaymentFail({
          failure_stage: 'toss_sdk_load',
          failure_code: sanitizeTossFailureCode(
            extractTossCodeFromError(error),
            'sdk_load_failed',
          ),
          orderNumberForDedupe: orderNumber,
        });
        throw error;
      }
      
      const orderName = selectedItems.length > 1 
        ? `${selectedItems[0].product?.title || '커스텀 제품'} 외 ${selectedItems.length - 1}건`
        : (selectedItems[0].product?.title || '커스텀 제품');

      track('payment_start', {
        currency: 'KRW',
        value: authoritativeAmount,
        items: mapSelectedItemsToAnalyticsItems(selectedItems),
        payment_provider: 'toss',
      });

      try {
        await tossPayments.requestPayment('카드', {
          amount: authoritativeAmount,
          orderId: orderNumber,
          orderName: orderName,
          customerName: shippingData.name,
          successUrl: `${window.location.origin}/payment/success`,
          failUrl: `${window.location.origin}/payment/fail`,
        });
      } catch (error: unknown) {
        reportPaymentFail({
          failure_stage: 'toss_request',
          failure_code: sanitizeTossFailureCode(
            extractTossCodeFromError(error),
            'request_failed',
          ),
          orderNumberForDedupe: orderNumber,
        });
        throw error;
      }

      setIsBottomSheetOpen(false);
    } catch (error: any) {
      console.error('Payment Error:', error);
      const errorMessage = error?.message || '결제 요청 중 오류가 발생했습니다.';
      showToast(errorMessage, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScreeningPayment = async () => {
    if (!screeningCheckout) return;
    if (!requireCheckoutAuth()) return;
    if (!hasCompleteShipping(shippingData)) {
      showToast('배송 정보를 모두 입력해 주세요.', 'error');
      return;
    }
    if (selectedItems.some((item) => noticeFor(item).block)) {
      showToast('주문할 수 없는 상품이 선택되어 있습니다.', 'error');
      return;
    }
    if (!isAllConsented) {
      showToast('필수 약관에 모두 동의해 주세요.', 'error');
      return;
    }
    const amount = parsePositiveKrwAmount(selectedTotalPrice);
    if (amount === null) {
      showToast('테스트 결제 금액이 올바르지 않습니다.', 'error');
      return;
    }

    const resolvedTestKey = resolveTossClientKey({
      purpose: 'screening',
      raw: import.meta.env.VITE_TOSS_TEST_CLIENT_KEY,
    });
    if (!resolvedTestKey.ok) {
      showToast('테스트 결제 설정을 확인할 수 없습니다.', 'error');
      return;
    }

    let orderId = '';
    try {
      setIsProcessing(true);
      const clientKey = assertTossTestClientKey(resolvedTestKey.key);
      orderId = createCardScreeningOrderId();
      const tossPayments = await loadTossPayments(clientKey);
      const productTitle = selectedItems[0]?.product?.title || '메탈로라 작품';
      const orderName = selectedItems.length > 1
        ? `[심사테스트] ${productTitle} 외 ${selectedItems.length - 1}건`
        : `[심사테스트] ${productTitle}`;
      await tossPayments.requestPayment('카드', {
        amount,
        orderId,
        orderName,
        customerName: shippingData.name,
        successUrl: `${window.location.origin}/payment/screening/success`,
        failUrl: `${window.location.origin}/payment/screening/fail`,
      });
      setIsBottomSheetOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message
        ? error.message
        : '테스트 결제 창을 열지 못했습니다.';
      showToast(message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNextStep = () => {
    if (checkoutClosed) return;
    if (selectedIds.size === 0 || step !== 1) return;
    if (!requireCheckoutAuth()) return;
    beginCheckoutStep();
  };

  const handlePrevStep = () => {
    setStep(1);
  };

  const markShippingTouched = (key: keyof CheckoutShippingFields) => {
    setShippingTouched((current) => ({ ...current, [key]: true }));
  };

  const shippingFieldError = (key: keyof CheckoutShippingFields) => {
    if (!shippingTouched[key]) return null;
    return shippingData[key].trim() === '' ? '입력해 주세요.' : null;
  };

  const showingCheckoutForm = step === 2;
  const stepShift = reducedMotion || !cartEnterSettled.current
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  useEffect(() => {
    if (checkoutClosed) {
      pendingCheckoutRef.current = false;
      return;
    }
    if (!pendingCheckoutRef.current || isLoginModalOpen || checkoutAuthPending || !canCheckout) {
      return;
    }
    if (step !== 1) {
      pendingCheckoutRef.current = false;
      return;
    }
    pendingCheckoutRef.current = false;
    beginCheckoutStep();
  }, [isLoginModalOpen, checkoutAuthPending, canCheckout, step, checkoutClosed]);

  const cartOverlayOpen = isLoginModalOpen || policyModal.isOpen || consentModal.isOpen || isBottomSheetOpen;

  return (
    <>
    <GenieShell
      isOpen={isOpen}
      inert={cartOverlayOpen}
      labelledBy="cart-drawer-title"
      anchor="[data-cart-anchor]"
      className={zClass('drawer')}
      panelClassName="w-full max-w-lg"
      backdropClassName="bg-black/60 backdrop-blur-sm"
      onClose={onClose}
    >
      <div
        className={`flex h-full flex-col ${
          theme === 'dark' ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-5 ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
          <div className="min-w-0">
            <h2 id="cart-drawer-title" className="text-[1.75rem] font-medium tracking-[-0.02em]">
              {showingCheckoutForm ? '주문하기' : '장바구니'}
            </h2>
            {isolatedReviewLabel() ? (
              <p className="mt-1 text-xs font-medium">{isolatedReviewLabel()}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="장바구니 닫기"
            className={`focus-ring flex size-10 shrink-0 items-center justify-center rounded-full ${
              theme === 'dark' ? 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-black'
            }`}
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pb-6 flex items-center gap-3 text-sm tracking-tight">
          <span className={showingCheckoutForm ? muted : 'font-medium'}>장바구니</span>
          <ChevronRight className={muted} size={14} />
          <span className={showingCheckoutForm ? 'font-medium' : muted}>주문서</span>
          <ChevronRight className={muted} size={14} />
          <span className={muted}>결제</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6">
          <AnimatePresence mode="wait">
            {!showingCheckoutForm ? (
              <motion.div
                key="step1"
                initial={reducedMotion || !cartEnterSettled.current ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: -12 }}
                transition={stepShift}
                className="py-4 space-y-4"
              >
                {isCartLoading && cartItems.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-32 space-y-4 ${muted}`}>
                    <Loader2 size={28} className="animate-spin motion-reduce:animate-none" />
                    <p className="text-base font-medium">장바구니를 불러오는 중</p>
                  </div>
                ) : cartLoadFailed && cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <ShoppingBag size={32} strokeWidth={1} className={theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'} />
                    <p className={`text-base font-medium ${theme === 'dark' ? 'text-[#f3f1ec]' : 'text-[#16150f]'}`}>장바구니를 불러오지 못했습니다</p>
                    <button
                      type="button"
                      onClick={() => { void refreshCart(); }}
                      className="mt-2 h-12 px-5 font-medium rounded-[2px] focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-zinc-500 space-y-4">
                    <ShoppingBag size={32} strokeWidth={1} className={theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'} />
                    <p className={`text-base font-medium ${theme === 'dark' ? 'text-[#f3f1ec]' : 'text-[#16150f]'}`}>장바구니가 비어 있습니다</p>
                    <button 
                      onClick={() => {
                        onClose();
                        navigate('/#marquee-section');
                      }}
                      className="mt-2 h-12 px-5 font-medium rounded-[2px] focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]"
                    >
                      상품 둘러보기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 pb-8">
                    {/* Select All Toggle */}
                    <div className="flex items-center justify-between px-1 mb-6">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={
                          cartItems.length > 0 && selectedIds.size === cartItems.length
                            ? true
                            : selectedIds.size > 0
                              ? 'mixed'
                              : false
                        }
                        aria-label="전체 선택"
                        onClick={toggleSelectAll}
                        className={`focus-ring flex min-h-10 items-center gap-2 ${muted}`}
                      >
                        <CartCheckMark
                          state={
                            cartItems.length > 0 && selectedIds.size === cartItems.length
                              ? 'on'
                              : selectedIds.size > 0
                                ? 'mixed'
                                : 'off'
                          }
                        />
                        <span className="text-sm font-medium tracking-tight">
                          전체 선택 ({selectedIds.size}/{cartItems.length})
                        </span>
                      </button>
                    </div>

                      {cartItems.map((item) => {
                        const isWorkshop = isCustomCartRow(item);
                        const title = isWorkshop ? (item.product?.title || '나만의 커스텀 포스터') : (item.product?.title || '제품');
                        const rowOrientation = cartRowOrientation(item);
                        const orientationName = rowOrientation === 'landscape' ? '가로형' : rowOrientation === 'portrait' ? '세로형' : '';
                        const sizeName = isWorkshop
                          ? customSizeLabel(item.custom_config?.size)
                          : (item.product?.options?.find(opt => opt.id === item.selected_option)?.name || '기본 옵션');
                        
                        const aiOptions = [];
                        if (isWorkshop && item.custom_config) {
                          if (item.custom_config.ai_upscale) aiOptions.push('AI 고화질');
                          if (item.custom_config.ai_outpaint) aiOptions.push('AI 비율복원');
                        }
                        
                        const optionDisplay = [sizeName, orientationName, ...aiOptions].filter(Boolean).join(' • ');
                        const lineNotice = noticeFor(item);
                        const price = lineNotice.currentUnit;
                        const image = isWorkshop
                          ? (isolatedReviewThumb(item.id) || workshopMedia.get(item.custom_image).src || '')
                          : (rowOrientation === 'landscape' && item.product?.landscape_image
                            ? item.product.landscape_image
                            : (item.product?.front_image || item.product?.image || ''));
                        const isSelected = selectedIds.has(item.id);
                      
                      const handleItemClick = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        onClose();
                        if (isWorkshop) {
                          navigate(`/product/workshop-single`, { state: { cartItem: item } });
                        } else {
                          navigate(`/product/${item.product_id}`);
                        }
                      };

                      return (
                        <div
                          key={item.id}
                          className="flex gap-3 border-b border-black/10 py-6 dark:border-white/10"
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={`${title} 선택`}
                            onClick={() => toggleItemSelection(item.id)}
                            className="focus-ring flex size-10 shrink-0 items-center justify-center"
                          >
                            <CartCheckMark state={isSelected ? 'on' : 'off'} />
                          </button>
                          <button
                            type="button"
                            aria-label={`${title} 상세 보기`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemClick(e);
                            }}
                            className={`${cartThumbFrameClass(rowOrientation)} overflow-hidden shrink-0 hover:opacity-80 transition-opacity`}
                          >
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                                onError={isWorkshop ? () => void workshopMedia.onLoadError(item.custom_image, image) : undefined}
                              />
                            ) : null}
                          </button>
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                            <div className="flex justify-between items-start gap-3">
                              <div className="min-w-0">
                                <h3 className="font-medium text-base leading-tight tracking-[-0.02em] break-words">{title}</h3>
                                <p className={`text-sm mt-1 break-words ${muted}`}>{optionDisplay}</p>
                                <CartLineCopy notice={lineNotice} />
                              </div>
                              <button 
                                type="button"
                                aria-label={`${title} 삭제`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void removeFromCart(item.id);
                                }}
                                className={`focus-ring flex size-10 shrink-0 items-center justify-center ${muted}`}
                              >
                                <X size={18} />
                              </button>
                            </div>
                            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`${title} 수량 줄이기`}
                                  disabled={item.quantity <= 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.quantity <= 1) return;
                                    void updateQuantity(item.id, item.quantity - 1);
                                  }}
                                  className="focus-ring flex size-10 items-center justify-center disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  <Minus size={16} />
                                </button>
                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                <button
                                  type="button"
                                  aria-label={`${title} 수량 늘리기`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void updateQuantity(item.id, item.quantity + 1);
                                  }}
                                  className="focus-ring flex size-10 items-center justify-center"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              <div className="ml-auto max-w-full shrink-0 text-right">
                                <p className={`text-sm ${muted}`}>상품 금액</p>
                                <RollingKrwAmount
                                  value={price * item.quantity}
                                  reducedMotion={reducedMotion}
                                  className="text-base font-medium"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={reducedMotion || !cartEnterSettled.current ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 12 }}
                transition={stepShift}
                className="space-y-8 py-4 pb-8"
              >
                <section>
                  <h3 className="mb-4 text-base font-medium">주문 상품</h3>
                  <div>
                    {selectedItems.map(item => {
                      const isWorkshop = isCustomCartRow(item);
                      const rowOrientation = cartRowOrientation(item);
                      const title = isWorkshop ? (item.product?.title || '나만의 커스텀 포스터') : (item.product?.title || '제품');
                      const orientationName = rowOrientation === 'landscape' ? '가로형' : rowOrientation === 'portrait' ? '세로형' : '';
                      const optionName = isWorkshop
                        ? customSizeLabel(item.custom_config?.size)
                        : (item.product?.options?.find(opt => opt.id === item.selected_option)?.name || '');
                      const meta = [optionName, orientationName].filter(Boolean).join(' · ');
                      const lineNotice = noticeFor(item);
                      const price = lineNotice.currentUnit;
                      const image = isWorkshop
                        ? (workshopMedia.get(item.custom_image).src || '')
                        : (rowOrientation === 'landscape' && item.product?.landscape_image
                          ? item.product.landscape_image
                          : (item.product?.front_image || item.product?.image || ''));
                      return (
                        <div key={item.id} className="flex gap-3 border-b border-black/10 py-6 dark:border-white/10">
                          <div className={`${cartThumbFrameClass(rowOrientation)} shrink-0 overflow-hidden`}>
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                                onError={isWorkshop ? () => void workshopMedia.onLoadError(item.custom_image, image) : undefined}
                              />
                            ) : null}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
                            <div className="min-w-0">
                              <span className="block break-words font-medium text-base leading-tight tracking-[-0.02em]">{title}</span>
                              {meta ? (
                                <span className={`mt-1 block break-words text-sm ${muted}`}>{meta}</span>
                              ) : null}
                              <CartLineCopy notice={lineNotice} />
                            </div>
                            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                              <span className={`text-sm ${muted}`}>수량 {item.quantity}개</span>
                              <div className="ml-auto max-w-full shrink-0 text-right">
                                <span className={`block text-sm ${muted}`}>상품 금액</span>
                                <RollingKrwAmount
                                  value={price * item.quantity}
                                  reducedMotion={reducedMotion}
                                  className="text-base font-medium"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 text-base font-medium">배송지 정보</h3>
                  <div className="space-y-5 border-b border-black/10 py-8 dark:border-white/10">
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="cart-ship-name" className={`mb-2 block text-sm font-medium ${muted}`}>받는 사람</label>
                        <input
                          id="cart-ship-name"
                          type="text"
                          value={shippingData.name}
                          onChange={(e) => setShippingData({...shippingData, name: e.target.value})}
                          onBlur={() => markShippingTouched('name')}
                          aria-invalid={shippingFieldError('name') ? true : undefined}
                          aria-describedby={shippingFieldError('name') ? 'cart-ship-name-error' : undefined}
                          className={`w-full rounded-[2px] border bg-transparent px-4 py-3 text-base focus:outline-none focus-ring ${
                            shippingFieldError('name')
                              ? 'border-black/40 dark:border-white/40'
                              : (theme === 'dark' ? 'border-white/20 text-[#f3f1ec] placeholder:text-[#8d887e]' : 'border-black/15 text-[#16150f] placeholder:text-[#6b675f]')
                          } ${theme === 'dark' ? 'text-[#f3f1ec] placeholder:text-[#8d887e]' : 'text-[#16150f] placeholder:text-[#6b675f]'}`}
                          placeholder="이름을 입력해주세요"
                        />
                        {shippingFieldError('name') ? <p id="cart-ship-name-error" className={`mt-2 text-sm ${muted}`}>{shippingFieldError('name')}</p> : null}
                      </div>
                      <div>
                        <label htmlFor="cart-ship-phone" className={`mb-2 block text-sm font-medium ${muted}`}>연락처</label>
                        <input
                          id="cart-ship-phone"
                          type="tel"
                          value={shippingData.phone}
                          onChange={(e) => setShippingData({...shippingData, phone: e.target.value})}
                          onBlur={() => markShippingTouched('phone')}
                          aria-invalid={shippingFieldError('phone') ? true : undefined}
                          aria-describedby={shippingFieldError('phone') ? 'cart-ship-phone-error' : undefined}
                          className={`w-full rounded-[2px] border bg-transparent px-4 py-3 text-base focus:outline-none focus-ring ${
                            shippingFieldError('phone') ? 'border-black/40 dark:border-white/40' : (theme === 'dark' ? 'border-white/20' : 'border-black/15')
                          } ${theme === 'dark' ? 'text-[#f3f1ec] placeholder:text-[#8d887e]' : 'text-[#16150f] placeholder:text-[#6b675f]'}`}
                          placeholder="010-0000-0000"
                        />
                        {shippingFieldError('phone') ? <p id="cart-ship-phone-error" className={`mt-2 text-sm ${muted}`}>{shippingFieldError('phone')}</p> : null}
                      </div>
                    </div>
                    
                    <div className="my-2 h-px bg-black/10 dark:bg-white/10" />
                    
                    <div className="space-y-4">
                      <label htmlFor="cart-ship-zip" className={`mb-2 block text-sm font-medium ${muted}`}>주소</label>
                      <div className="flex gap-2">
                        <input
                          id="cart-ship-zip"
                          type="text"
                          readOnly
                          value={shippingData.zipCode}
                          onBlur={() => markShippingTouched('zipCode')}
                          aria-invalid={shippingFieldError('zipCode') ? true : undefined}
                          aria-describedby={shippingFieldError('zipCode') ? 'cart-ship-zip-error' : undefined}
                          className={`w-28 rounded-[2px] border bg-transparent px-4 py-3 text-base focus:outline-none focus-ring ${
                            shippingFieldError('zipCode') ? 'border-black/40 dark:border-white/40' : (theme === 'dark' ? 'border-white/20' : 'border-black/15')
                          } ${theme === 'dark' ? 'text-[#f3f1ec]' : 'text-[#16150f]'}`}
                          placeholder="우편번호"
                        />
                        <button
                          type="button"
                          onClick={handleOpenPostcode}
                          className={`h-12 px-4 font-medium rounded-[2px] focus-ring ${
                            theme === 'dark' ? 'bg-[#f2f0ea] text-[#16150f]' : 'bg-[#1a1914] text-[#f4f1eb]'
                          }`}
                        >
                          주소 검색
                        </button>
                      </div>
                      {shippingFieldError('zipCode') ? <p id="cart-ship-zip-error" className={`text-sm ${muted}`}>{shippingFieldError('zipCode')}</p> : null}

                      {isPostcodeOpen && (
                        <div className={`mt-4 overflow-hidden border ${theme === 'dark' ? 'border-white/10 bg-[#101114]' : 'border-black/10 bg-[#f6f4ef]'}`}>
                          <div className={`flex items-center justify-between border-b p-3 ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
                            <span className="text-sm font-medium">우편번호 검색</span>
                            <button type="button" onClick={() => setIsPostcodeOpen(false)} aria-label="우편번호 검색 닫기" className={`focus-ring flex size-10 items-center justify-center ${muted}`}><X size={18} /></button>
                          </div>
                          <div ref={postcodeRef} className="h-[400px] w-full" />
                        </div>
                      )}

                      <input
                        id="cart-ship-address"
                        type="text"
                        readOnly
                        value={shippingData.address}
                        onBlur={() => markShippingTouched('address')}
                        aria-invalid={shippingFieldError('address') ? true : undefined}
                        aria-describedby={shippingFieldError('address') ? 'cart-ship-address-error' : undefined}
                        className={`w-full rounded-[2px] border bg-transparent px-4 py-3 text-base focus:outline-none focus-ring ${
                          shippingFieldError('address') ? 'border-black/40 dark:border-white/40' : (theme === 'dark' ? 'border-white/20' : 'border-black/15')
                        } ${theme === 'dark' ? 'text-[#f3f1ec]' : 'text-[#16150f]'}`}
                        placeholder="기본 주소"
                      />
                      {shippingFieldError('address') ? <p id="cart-ship-address-error" className={`text-sm ${muted}`}>{shippingFieldError('address')}</p> : null}
                      <input
                        id="cart-ship-detail"
                        type="text"
                        value={shippingData.addressDetail}
                        onChange={(e) => setShippingData({...shippingData, addressDetail: e.target.value})}
                        onBlur={() => markShippingTouched('addressDetail')}
                        aria-invalid={shippingFieldError('addressDetail') ? true : undefined}
                        aria-describedby={shippingFieldError('addressDetail') ? 'cart-ship-detail-error' : undefined}
                        className={`w-full rounded-[2px] border bg-transparent px-4 py-3 text-base focus:outline-none focus-ring ${
                          shippingFieldError('addressDetail') ? 'border-black/40 dark:border-white/40' : (theme === 'dark' ? 'border-white/20' : 'border-black/15')
                        } ${theme === 'dark' ? 'text-[#f3f1ec] placeholder:text-[#8d887e]' : 'text-[#16150f] placeholder:text-[#6b675f]'}`}
                        placeholder="상세 주소를 입력해주세요"
                      />
                      {shippingFieldError('addressDetail') ? <p id="cart-ship-detail-error" className={`text-sm ${muted}`}>{shippingFieldError('addressDetail')}</p> : null}
                    </div>
                  </div>
                </section>

                <section>
                  {screeningCheckout ? (
                    <div className="border-b border-black/10 py-5 dark:border-white/10">
                      <h3 className="text-base font-medium">결제 수단</h3>
                      <p className="mt-1 text-base font-medium">심사 테스트 카드 결제</p>
                      <p className={`mt-1 text-sm ${muted}`}>카드사 심사 테스트입니다. 실제 주문과 배송은 만들어지지 않습니다.</p>
                    </div>
                  ) : checkoutClosed ? (
                    <div className="border-b border-black/10 py-5 dark:border-white/10">
                      <h3 className="mb-1 text-base font-medium">결제 수단</h3>
                      <p className="text-base font-medium">결제 준비 중</p>
                      <p className={`mt-1 text-sm ${muted}`}>현재 결제 기능을 준비하고 있습니다.</p>
                    </div>
                  ) : (
                    <CheckoutPaymentCard muted={muted} />
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`px-6 pt-6 pb-12 border-t ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
          {selectedPriceChanged ? (
            <p className={`mb-3 text-sm font-medium ${muted}`}>
              변경된 가격이 있습니다. 현재 가격으로 계산됩니다.
            </p>
          ) : null}
          <div className="flex justify-between items-end mb-6">
            <span className={`text-sm font-medium ${muted}`}>총 결제 금액</span>
            <span className="text-[1.75rem] font-medium tracking-[-0.03em]">₩{displayPrice.toLocaleString()}</span>
          </div>

          {screeningCheckout ? (
            <p className={`mb-3 text-sm font-medium ${muted}`}>
              카드사 심사 테스트 결제입니다. 실제 주문과 배송은 만들어지지 않습니다.
            </p>
          ) : PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 ? (
            <p className={`mb-3 text-sm font-medium ${muted}`}>
              현재 결제 기능을 준비하고 있습니다.
            </p>
          ) : null}

          <div className="flex gap-3">
            {showingCheckoutForm && (
              <button
                type="button"
                onClick={handlePrevStep}
                className={`h-12 w-1/3 rounded-[2px] font-medium transition-colors ${
                  theme === 'dark' ? 'bg-white/10 text-[#f3f1ec] hover:bg-white/15' : 'bg-black/5 text-[#16150f] hover:bg-black/10'
                }`}
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={!showingCheckoutForm ? handleNextStep : () => {
                if (checkoutClosed) return;
                if (selectedBlocked) {
                  showToast('주문할 수 없는 상품이 선택되어 있습니다.', 'error');
                  return;
                }
                rememberSelectedPrices();
                setIsBottomSheetOpen(true);
              }}
              disabled={selectedItems.length === 0 || isProcessing || checkoutClosed}
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-[2px] text-base font-medium tracking-[-0.02em] transition-colors ${
                selectedItems.length === 0 || isProcessing || checkoutClosed
                  ? (theme === 'dark' ? 'cursor-not-allowed bg-[#2a2b31] text-[#f3f1ec]/35' : 'cursor-not-allowed bg-[#e4dfd6] text-[#16150f]/35')
                  : (theme === 'dark' ? 'bg-[#f2f0ea] text-[#16150f] hover:brightness-105' : 'bg-[#1a1914] text-[#f4f1eb] hover:brightness-110')
              }`}
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" size={24} />
              ) : checkoutClosed ? (
                '결제 준비 중'
              ) : !showingCheckoutForm ? (
                selectedIds.size === 0 ? '상품을 선택해주세요' : selectedBlocked ? '주문할 수 없는 상품이 있습니다' : '주문하기'
              ) : (
                selectedBlocked ? '주문할 수 없는 상품이 있습니다' : '결제하기'
              )}
            </button>
          </div>
        </div>
      </div>
    </GenieShell>

      {/* Policy Modal for full details */}
      <PolicyModal
        isOpen={policyModal.isOpen}
        onClose={() => setPolicyModal({ isOpen: false, key: null })}
        title={policyModal.key ? policies[policyModal.key].title : ''}
        content={policyModal.key ? policies[policyModal.key].content : null}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        redirectUrl={cartAuthReturnPath}
        onClose={() => {
          setIsLoginModalOpen(false);
          if (canCheckoutRef.current) return;
          pendingCheckoutRef.current = false;
          try {
            sessionStorage.removeItem(CART_AUTH_RETURN_KEY);
          } catch {
            // ignore
          }
        }}
        onSuccess={() => setIsLoginModalOpen(false)}
      />

      {/* Consent Detail Modal - Summary version */}
      <AnimatePresence>
        {consentModal.isOpen && consentModal.type && (
          <div className={cn('fixed inset-0 flex items-center justify-center p-6', zClass('dialog'))}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConsentModal({ isOpen: false, type: null })}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full max-w-md overflow-hidden border transition-colors duration-500 ${
                theme === 'dark' ? 'bg-[#101114] text-[#f3f1ec] border-white/10' : 'bg-[#f6f4ef] text-[#16150f] border-black/10'
              }`}
            >
              <div className={`p-6 border-b flex justify-between items-center ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
                <h4 className="text-lg font-medium tracking-[-0.02em]">{CONSENT_TEXTS[consentModal.type].title}</h4>
                <button 
                  onClick={() => setConsentModal({ isOpen: false, type: null })}
                  className={`p-2 transition-colors ${theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'}`}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="max-h-[60vh] space-y-6 overflow-y-auto p-8">
                {CONSENT_TEXTS[consentModal.type].items.map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className={`mt-2 h-1 w-1 shrink-0 ${theme === 'dark' ? 'bg-[#c9c4b8]' : 'bg-[#3f3c36]'}`} />
                    <p 
                      className={`text-base leading-relaxed tracking-tight ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}
                      dangerouslySetInnerHTML={{ __html: item }}
                    />
                  </div>
                ))}
              </div>
              <div className={`border-t p-6 ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
                <button 
                  onClick={() => setConsentModal({ isOpen: false, type: null })}
                  className="h-12 w-full rounded-[2px] font-medium focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toss-style Consent Bottom Sheet */}
      <AnimatePresence>
      {isBottomSheetOpen && !checkoutClosed && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBottomSheetOpen(false)}
              className={cn('fixed inset-0 bg-black/60 backdrop-blur-sm', zClass('sheetBackdrop'))}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                'fixed bottom-0 left-0 right-0 rounded-t-lg border-t border-border-subtle surface-modal overflow-hidden motion-safe-transition',
                zClass('sheet'),
              )}
            >
              {/* Handle Bar */}
              <div className="w-full flex justify-center pt-3 pb-2">
                <div className={`w-12 h-1.5 rounded-full ${theme === 'dark' ? 'bg-white/10' : 'bg-black/10'}`} />
              </div>
              
              <div className="px-6 pb-16 pt-4">
                <div className="flex justify-between items-center mb-8">
                  <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-black'}`}>최종 동의</h3>
                  <button 
                    onClick={() => setIsBottomSheetOpen(false)}
                    className={`p-2 transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-black'}`}
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6 mb-10">
                  {hasWorkshopItems && (
                    <div className="flex items-center justify-between group">
                      <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                        <div 
                          onClick={() => setConsents(prev => ({ ...prev, content: !prev.content }))}
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                            consents.content ? 'bg-[#16150f] border-[#16150f] dark:bg-[#f3f1ec] dark:border-[#f3f1ec]' : (theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400')
                          }`}
                        >
                          {consents.content && <Check size={16} className="text-[#f4f1eb] dark:text-[#16150f]" />}
                        </div>
                        <span className={`text-base font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          <span className="mr-1">(필수)</span>
                          콘텐츠 권리 책임 동의
                        </span>
                      </label>
                      <button 
                        onClick={() => setPolicyModal({ isOpen: true, key: 'agreement' })}
                        className={`text-sm underline underline-offset-4 px-3 py-2 transition-colors ${
                          theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'
                        }`}
                      >
                        자세히 보기
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between group">
                    <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                      <div 
                        onClick={() => setConsents(prev => ({ ...prev, refund: !prev.refund }))}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                          consents.refund ? 'bg-[#16150f] border-[#16150f] dark:bg-[#f3f1ec] dark:border-[#f3f1ec]' : (theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400')
                        }`}
                      >
                        {consents.refund && <Check size={16} className="text-[#f4f1eb] dark:text-[#16150f]" />}
                      </div>
                      <span className="min-w-0">
                        <span className={`block text-base font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          <span className="mr-1">(필수)</span>
                          환불 정책 동의
                        </span>
                        {hasWorkshopItems && (
                          <span className={`block text-xs mt-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            WORKSHOP 개별 제작 상품의 취소 및 청약철회 기준이 포함됩니다.
                          </span>
                        )}
                      </span>
                    </label>
                    <button 
                      onClick={() => setPolicyModal({ isOpen: true, key: 'refund' })}
                      className={`text-sm underline underline-offset-4 px-3 py-2 transition-colors ${
                        theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'
                      }`}
                    >
                      자세히 보기
                    </button>
                  </div>

                  <div className="flex items-center justify-between group">
                    <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                      <div 
                        onClick={() => setConsents(prev => ({ ...prev, terms: !prev.terms }))}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                          consents.terms ? 'bg-[#16150f] border-[#16150f] dark:bg-[#f3f1ec] dark:border-[#f3f1ec]' : (theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400')
                        }`}
                      >
                        {consents.terms && <Check size={16} className="text-[#f4f1eb] dark:text-[#16150f]" />}
                      </div>
                      <span className={`text-base font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        <span className="mr-1">(필수)</span>
                        전체 약관 동의
                      </span>
                    </label>
                    <button 
                      onClick={() => setPolicyModal({ isOpen: true, key: 'terms' })}
                      className={`text-sm underline underline-offset-4 px-3 py-2 transition-colors ${
                        theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'
                      }`}
                    >
                      자세히 보기
                    </button>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={screeningCheckout ? handleScreeningPayment : handlePayment}
                  disabled={checkoutClosed || !isAllConsented || isProcessing}
                  className={`w-full h-12 font-medium tracking-[-0.02em] rounded-[2px] flex items-center justify-center gap-2 ${
                    !isAllConsented || isProcessing
                      ? (theme === 'dark' ? 'bg-[#2a2b31] text-[#f3f1ec]/40 cursor-not-allowed' : 'bg-[#e4dfd6] text-[#16150f]/40 cursor-not-allowed')
                      : (theme === 'dark' ? 'bg-[#f2f0ea] text-[#16150f]' : 'bg-[#1a1914] text-[#f4f1eb]')
                  }`}
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    screeningCheckout ? '동의하고 테스트 결제하기' : '동의하고 결제하기'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
