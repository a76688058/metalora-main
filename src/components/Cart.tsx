import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { X, ShoppingBag, ChevronRight, MapPin, CreditCard, CheckCircle2, Loader2, Trash2, Plus, Minus, Search, Check } from 'lucide-react';
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
import { Product } from '../data/products';
import { track, type AnalyticsItem } from '../lib/analytics';
import {
  extractTossCodeFromError,
  httpFailureCode,
  reportPaymentFail,
  sanitizeTossFailureCode,
} from '../lib/paymentFailureAnalytics';
import { isUsableMemberProfile, safeInternalPath } from '../lib/authIntegrity';
import { PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 } from '../lib/publicPaymentFreeze';
import { assertTossTestClientKey, CARD_SCREENING_TEST_ENABLED, createCardScreeningOrderId } from '../lib/cardScreeningTest';
import { checkoutPolicyVersionSnapshot } from '../lib/policyVersions';
import { useWorkshopMediaDisplay } from '../hooks/useWorkshopMediaDisplay';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOSS_CLIENT_KEY = 'test_ck_Poxy1XQL8R9nPR9Xn61Xr7nO5Wml';

type CheckoutShippingFields = {
  name: string;
  phone: string;
  zipCode: string;
  address: string;
  addressDetail: string;
};

function hasCompleteShipping(shipping: CheckoutShippingFields): boolean {
  return [shipping.name, shipping.phone, shipping.zipCode, shipping.address, shipping.addressDetail]
    .every((value) => value.trim() !== '');
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

function cartThumbFrameClass(orientation: 'portrait' | 'landscape' | null, compact = false): string {
  if (orientation === 'landscape') {
    return compact
      ? 'w-[4.5rem] h-[3.15rem]'
      : 'w-[6.75rem] h-[4.75rem] sm:w-[7.5rem] sm:h-[5.25rem]';
  }
  return compact
    ? 'w-[3.15rem] h-[4.5rem]'
    : 'w-[4.75rem] h-[6.75rem] sm:w-[5.25rem] sm:h-[7.5rem]';
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
  const isOpen = isCartOpen;
  const onClose = closeCart;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const { user, adminUser, profile, adminProfile, isLoading: isAuthLoading, isProfileResolved } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState(1); // 1: List, 2: Order Form
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const pendingCheckoutRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [displayPrice, setDisplayPrice] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setIsLoginModalOpen(false);
      pendingCheckoutRef.current = false;
    }
  }, [isOpen]);

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
    const price = isCustomCartRow(item)
      ? customUnitPrice(item)
      : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0);
    return sum + (price * item.quantity);
  }, 0);

  // Toss-style price animation
  useEffect(() => {
    const controls = animate(displayPrice, selectedTotalPrice, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setDisplayPrice(Math.floor(value)),
    });
    return () => controls.stop();
  }, [selectedTotalPrice]);

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

  const beginCheckoutStep = () => {
    if (selectedIds.size === 0 || step !== 1) return;
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
        };
      });

      const { data: { session } } = await client.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.');
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

      // 3. Initialize Toss Payments
      let tossPayments;
      try {
        tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
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
    if (!isAllConsented) {
      showToast('필수 약관에 모두 동의해 주세요.', 'error');
      return;
    }
    const amount = parsePositiveKrwAmount(selectedTotalPrice);
    if (amount === null) {
      showToast('테스트 결제 금액이 올바르지 않습니다.', 'error');
      return;
    }

    let orderId = '';
    try {
      setIsProcessing(true);
      const clientKey = assertTossTestClientKey(TOSS_CLIENT_KEY);
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

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn('fixed inset-0 flex justify-end pointer-events-auto transform-gpu', zClass('drawer'))}
    >
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
      />

      {/* Cart Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`relative w-full max-w-lg h-full flex flex-col pointer-events-auto transform-gpu will-change-transform ${
          theme === 'dark' ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-[1.75rem] font-medium tracking-[-0.02em]">
            {step === 1 ? '장바구니' : '주문하기'}
          </h2>
          <button 
            onClick={onClose}
            aria-label="장바구니 닫기"
            className="focus-ring p-2 text-current/70 hover:text-current"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pb-6 flex items-center gap-3 text-sm tracking-tight">
          <span className={step === 1 ? 'font-medium' : (theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]')}>장바구니</span>
          <ChevronRight className={theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'} size={14} />
          <span className={step === 2 ? 'font-medium' : (theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]')}>주문서</span>
          <ChevronRight className={theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'} size={14} />
          <span className={theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}>결제</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="py-4 space-y-4"
              >
                {isCartLoading && cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-zinc-500 space-y-4">
                    <Loader2 size={28} className="animate-spin text-zinc-400" />
                    <p className="text-base font-medium">장바구니를 불러오는 중</p>
                  </div>
                ) : cartLoadFailed && cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-zinc-500 space-y-4">
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
                        onClick={toggleSelectAll}
                        className={`flex items-center gap-2 transition-colors ${theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'}`}
                      >
                        <span className="text-sm font-medium tracking-tight">
                          전체 선택
                        </span>
                        <span className="text-sm font-medium">({selectedIds.size}/{cartItems.length})</span>
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

                        const price = isWorkshop
                          ? customUnitPrice(item)
                          : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0);
                        const image = isWorkshop
                          ? (workshopMedia.get(item.custom_image).src || '')
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
                          onClick={() => toggleItemSelection(item.id)}
                          className="py-6 flex gap-4 border-b border-black/10 dark:border-white/10 cursor-pointer"
                        >
                          <span
                            aria-hidden
                            className={`mt-1 h-3.5 w-3.5 shrink-0 border ${isSelected ? 'bg-[#16150f] border-[#16150f] dark:bg-[#f3f1ec] dark:border-[#f3f1ec]' : 'border-black/30 dark:border-white/35'}`}
                          />
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
                                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>{optionDisplay}</p>
                              </div>
                              <button 
                                type="button"
                                aria-label={`${title} 삭제`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void removeFromCart(item.id);
                                }}
                                className={`p-2 -mr-2 -mt-2 shrink-0 focus-ring ${theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'}`}
                              >
                                <X size={18} />
                              </button>
                            </div>
                            <div className="flex justify-between items-end mt-4 gap-3">
                              <div className="flex items-center gap-1">
                                <button 
                                  type="button"
                                  aria-label={`${title} 수량 줄이기`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void updateQuantity(item.id, item.quantity - 1);
                                  }}
                                  className="w-8 h-8 flex items-center justify-center focus-ring"
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
                                  className="w-8 h-8 flex items-center justify-center focus-ring"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              <p className="font-medium text-base shrink-0">₩{(price * item.quantity).toLocaleString()}</p>
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="py-4 space-y-8 pb-8"
              >
                <section>
                  <h3 className="text-sm font-medium mb-4">주문 상품</h3>
                  <div className="space-y-4 border-b border-black/10 py-6 dark:border-white/10">
                    {selectedItems.map(item => {
                      const isWorkshop = isCustomCartRow(item);
                      const rowOrientation = cartRowOrientation(item);
                      const title = isWorkshop ? (item.product?.title || '나만의 커스텀 포스터') : (item.product?.title || '제품');
                      const orientationName = rowOrientation === 'landscape' ? '가로형' : rowOrientation === 'portrait' ? '세로형' : '';
                      const optionName = isWorkshop
                        ? customSizeLabel(item.custom_config?.size)
                        : (item.product?.options?.find(opt => opt.id === item.selected_option)?.name || '');
                      const meta = [optionName, orientationName].filter(Boolean).join(' · ');
                      const price = isWorkshop
                        ? customUnitPrice(item)
                        : (item.product?.options?.find(opt => opt.id === item.selected_option)?.price || 0);
                      const image = isWorkshop
                        ? (workshopMedia.get(item.custom_image).src || '')
                        : (rowOrientation === 'landscape' && item.product?.landscape_image
                          ? item.product.landscape_image
                          : (item.product?.front_image || item.product?.image || ''));
                      return (
                        <div key={item.id} className="flex items-center gap-3 text-sm">
                          <div className={`${cartThumbFrameClass(rowOrientation, true)} rounded-xl overflow-hidden shrink-0 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
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
                          <div className="flex-1 min-w-0">
                            <span className={`font-medium block truncate ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{title}</span>
                            {meta ? (
                              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{meta}</span>
                            ) : null}
                            <span className={`block text-sm font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>수량 {item.quantity}개</span>
                          </div>
                          <span className={`font-semibold shrink-0 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>₩{(price * item.quantity).toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-medium mb-4">배송지 정보</h3>
                  <div className="space-y-5 border-b border-black/10 py-8 dark:border-white/10">
                    <div className="space-y-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>받는 사람</label>
                        <input 
                          type="text"
                          value={shippingData.name}
                          onChange={(e) => setShippingData({...shippingData, name: e.target.value})}
                          className={`w-full rounded-[2px] border px-4 py-3 text-base focus:outline-none focus-ring ${
                            theme === 'dark' ? 'border-white/20 bg-transparent text-[#f3f1ec] placeholder:text-[#8d887e]' : 'border-black/15 bg-transparent text-[#16150f] placeholder:text-[#6b675f]'
                          }`}
                          placeholder="이름을 입력해주세요"
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>연락처</label>
                        <input 
                          type="tel"
                          value={shippingData.phone}
                          onChange={(e) => setShippingData({...shippingData, phone: e.target.value})}
                          className={`w-full rounded-[2px] border px-4 py-3 text-base focus:outline-none focus-ring ${
                            theme === 'dark' ? 'border-white/20 bg-transparent text-[#f3f1ec] placeholder:text-[#8d887e]' : 'border-black/15 bg-transparent text-[#16150f] placeholder:text-[#6b675f]'
                          }`}
                          placeholder="010-0000-0000"
                        />
                      </div>
                    </div>
                    
                    <div className="my-2 h-px bg-black/10 dark:bg-white/10" />
                    
                    <div className="space-y-4">
                      <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>주소</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          readOnly
                          value={shippingData.zipCode}
                          className={`w-28 rounded-[2px] border px-4 py-3 text-base focus:outline-none focus-ring ${
                            theme === 'dark' ? 'border-white/20 bg-transparent text-[#f3f1ec]' : 'border-black/15 bg-transparent text-[#16150f]'
                          }`}
                          placeholder="우편번호"
                        />
                        <button 
                          onClick={handleOpenPostcode}
                          className={`h-12 px-4 font-medium rounded-[2px] focus-ring ${
                            theme === 'dark' ? 'bg-[#f2f0ea] text-[#16150f]' : 'bg-[#1a1914] text-[#f4f1eb]'
                          }`}
                        >
                          주소 검색
                        </button>
                      </div>
                      
                      {isPostcodeOpen && (
                        <div className="mt-4 overflow-hidden border border-black/10 bg-white dark:border-white/10">
                          <div className={`flex justify-between items-center p-3 border-b ${theme === 'dark' ? 'bg-zinc-100 border-zinc-200' : 'bg-zinc-50 border-zinc-200'}`}>
                            <span className="text-sm font-bold text-zinc-800">우편번호 검색</span>
                            <button onClick={() => setIsPostcodeOpen(false)} className="text-zinc-500 hover:text-zinc-800 p-1"><X size={18} /></button>
                          </div>
                          <div ref={postcodeRef} className="w-full h-[400px]" />
                        </div>
                      )}
                      
                      <input 
                        type="text"
                        readOnly
                        value={shippingData.address}
                        className={`w-full rounded-[2px] border px-4 py-3 text-base focus:outline-none focus-ring ${
                          theme === 'dark' ? 'border-white/20 bg-transparent text-[#f3f1ec]' : 'border-black/15 bg-transparent text-[#16150f]'
                        }`}
                        placeholder="기본 주소"
                      />
                      <input 
                        type="text"
                        value={shippingData.addressDetail}
                        onChange={(e) => setShippingData({...shippingData, addressDetail: e.target.value})}
                        className={`w-full rounded-[2px] border px-4 py-3 text-base focus:outline-none focus-ring placeholder:text-[#6b675f] dark:placeholder:text-[#8d887e] ${
                          theme === 'dark' ? 'border-white/20 bg-transparent text-[#f3f1ec]' : 'border-black/15 bg-transparent text-[#16150f]'
                        }`}
                        placeholder="상세 주소를 입력해주세요"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <h3 className="text-sm font-medium mb-4">결제 수단</h3>
                  {checkoutClosed ? (
                    <div className="border-b border-black/10 py-5 dark:border-white/10">
                      <p className="text-base font-medium">결제 준비 중</p>
                      <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>현재 결제 기능을 준비하고 있습니다.</p>
                    </div>
                  ) : (
                    <div className="border-b border-black/10 py-5 dark:border-white/10">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-base font-medium">{screeningCheckout ? '심사 테스트 카드 결제' : '간편 결제'}</p>
                          <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                            {screeningCheckout
                              ? '카드사 심사 테스트입니다. 실제 주문과 배송은 만들어지지 않습니다.'
                              : '신용/체크카드 및 간편 결제'}
                          </p>
                        </div>
                        <CheckCircle2 size={18} />
                      </div>
                    </div>
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`px-6 pt-6 pb-12 border-t ${theme === 'dark' ? 'border-white/10' : 'border-black/10'}`}>
          <div className="flex justify-between items-end mb-6">
            <span className={`text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>총 결제 금액</span>
            <span className="text-[1.75rem] font-medium tracking-[-0.03em]">₩{displayPrice.toLocaleString()}</span>
          </div>

          {screeningCheckout ? (
            <p className={`text-sm font-medium mb-3 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
              카드사 심사 테스트 결제입니다. 실제 주문과 배송은 만들어지지 않습니다.
            </p>
          ) : PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 ? (
            <p className={`text-sm font-medium mb-3 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
              현재 결제 기능을 준비하고 있습니다.
            </p>
          ) : null}
          
          <div className="flex gap-3">
            {step === 2 && (
              <button 
                type="button"
                onClick={handlePrevStep}
                className={`w-1/3 h-12 font-medium rounded-[2px] transition-colors ${
                  theme === 'dark' ? 'bg-white/10 text-[#f3f1ec] hover:bg-white/15' : 'bg-black/5 text-[#16150f] hover:bg-black/10'
                }`}
              >
                이전
              </button>
            )}
            <button 
              type="button"
              onClick={step === 1 ? handleNextStep : () => {
                if (checkoutClosed) return;
                setIsBottomSheetOpen(true);
              }}
              disabled={selectedItems.length === 0 || isProcessing || checkoutClosed}
              className={`flex-1 h-12 text-base font-medium tracking-[-0.02em] rounded-[2px] flex items-center justify-center gap-2 transition-colors ${
                selectedItems.length === 0 || isProcessing || checkoutClosed
                  ? (theme === 'dark' ? 'bg-[#2a2b31] text-[#f3f1ec]/35 cursor-not-allowed' : 'bg-[#e4dfd6] text-[#16150f]/35 cursor-not-allowed')
                  : (theme === 'dark' ? 'bg-[#f2f0ea] text-[#16150f] hover:brightness-105' : 'bg-[#1a1914] text-[#f4f1eb] hover:brightness-110')
              }`}
            >
              {isProcessing ? (
                <Loader2 className="animate-spin" size={24} />
              ) : checkoutClosed ? (
                '결제 준비 중'
              ) : step === 1 ? (
                selectedIds.size === 0 ? '상품을 선택해주세요' : '주문하기'
              ) : (
                '결제하기'
              )}
            </button>
          </div>
        </div>
      </motion.div>

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
    </motion.div>
  );
}
