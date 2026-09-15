import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { getFullImageUrl } from '../lib/utils';
import LoginModal from './LoginModal';
import { Product } from '../data/products';
import { Button } from './ui/Button';
import { ProductTheatreLayout } from './pdp/ProductTheatreLayout';
import { ProductTheatreStage } from './pdp/ProductTheatreStage';
import { ProductTheatreRail } from './pdp/ProductTheatreRail';
import { ProductTheatreRoomPreview } from './pdp/ProductTheatreRoomPreview';
import { ProductTruthSection } from './pdp/ProductTruthSection';
import { ProductMountIncluded } from './pdp/ProductMountIncluded';
import { ProductOrderConfidence } from './pdp/ProductOrderConfidence';
import { ProductInformationNotice } from './pdp/ProductInformationNotice';
import { PdpStorySection } from './pdp/story';

/**
 * Short-lived StrictMode duplicate guard only (not session-wide suppression).
 * Revisits after navigation remain eligible once this window elapses.
 */
let lastViewItemDedupe: { productId: string; at: number } | null = null;
const VIEW_ITEM_STRICT_MODE_MS = 400;

type PdpPageStatus = 'loading' | 'ready' | 'not_found' | 'error';

declare global {
  interface Window {
    IMP: any;
  }
}

function isPublicProduct(product: Product | null | undefined): product is Product {
  return !!product && product.is_visible !== false;
}

function mapProductRecord(data: Record<string, unknown>): Product {
  const options = data.options as Product['options'];
  return {
    ...(data as unknown as Product),
    artist: (data.subtitle as string) || 'Unknown Artist',
    price: options?.[0]?.price || 0,
    image: (data.front_image as string) || '',
    limited: Boolean(data.is_limited),
  };
}

function isLookupNotFound(error: { code?: string } | null | undefined): boolean {
  const code = error?.code;
  return code === 'PGRST116' || code === '22P02';
}

function PdpStatusScreen({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100svh-var(--shell-offset))] flex-col items-center justify-center bg-canvas px-6 py-20 text-center text-text-primary">
      <h1 className="type-product-title">{title}</h1>
      {body ? <p className="mt-3 max-w-sm type-supporting text-text-secondary">{body}</p> : null}
      {children ? <div className="mt-8 flex w-full max-w-xs flex-col gap-3">{children}</div> : null}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const cartItemFromState = location.state?.cartItem;

  const { products, fetchProducts } = useProducts();
  const { user, adminUser } = useAuth();
  const { showToast } = useToast();
  const { addToCart, openCart } = useCart();

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [selectedOrientation, setSelectedOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');
  const [pageStatus, setPageStatus] = useState<PdpPageStatus>('loading');
  const [localProduct, setLocalProduct] = useState<Product | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [roomPreviewOpen, setRoomPreviewOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const roomPreviewEntryRef = useRef<HTMLButtonElement>(null);
  const roomPreviewWasOpenRef = useRef(false);

  useEffect(() => {
    setRoomPreviewOpen(false);
    setViewerOpen(false);
  }, [id]);

  useLayoutEffect(() => {
    if (roomPreviewOpen) {
      roomPreviewWasOpenRef.current = true;
      return;
    }
    if (!roomPreviewWasOpenRef.current) return;
    roomPreviewWasOpenRef.current = false;
    const entry = roomPreviewEntryRef.current;
    entry?.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      entry?.focus({ preventScroll: true });
    });
  }, [roomPreviewOpen]);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const goToCollection = () => {
    navigate('/');
  };

  const currentUser = user || adminUser;

  const workshopProduct: Product | null =
    id === 'workshop-single' && cartItemFromState
      ? {
          id: 'workshop-single',
          title: '커스텀 작품',
          artist: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'METALORA Artist',
          image: cartItemFromState.custom_image || cartItemFromState.image || '',
          front_image: cartItemFromState.custom_image || cartItemFromState.image || '',
          description: 'METALORA 워크숍에서 제작된 세상에 단 하나뿐인 커스텀 작품입니다.',
          limited: true,
          options: [
            {
              id: 'custom',
              name: cartItemFromState.custom_config?.size || '커스텀 옵션',
              price: cartItemFromState.custom_config?.price || 0,
              stock: 1,
              isActive: true,
              dimension: cartItemFromState.custom_config?.size || 'A4',
            },
          ],
        }
      : null;

  const listedProduct = id ? products.find((item) => item.id === id) : undefined;
  const listedPublic = isPublicProduct(listedProduct) ? listedProduct : null;

  const product =
    workshopProduct || (isPublicProduct(localProduct) ? localProduct : listedPublic);

  useEffect(() => {
    let cancelled = false;

    async function resolveProduct() {
      setIsAdded(false);
      setQuantity(1);
      setErrorMsg('');

      if (!id) {
        setLocalProduct(null);
        setPageStatus('not_found');
        return;
      }

      if (id === 'workshop-single') {
        setLocalProduct(null);
        setPageStatus(cartItemFromState ? 'ready' : 'not_found');
        return;
      }

      if (listedProduct) {
        setLocalProduct(null);
        setPageStatus(isPublicProduct(listedProduct) ? 'ready' : 'not_found');
        return;
      }

      setPageStatus('loading');
      setLocalProduct(null);

      try {
        const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
        if (cancelled) return;

        if (error) {
          if (isLookupNotFound(error)) {
            setPageStatus('not_found');
            return;
          }
          setPageStatus('error');
          return;
        }

        if (!data) {
          setPageStatus('not_found');
          return;
        }

        const mapped = mapProductRecord(data as Record<string, unknown>);
        if (!isPublicProduct(mapped)) {
          setPageStatus('not_found');
          return;
        }

        setLocalProduct(mapped);
        setPageStatus('ready');
      } catch {
        if (!cancelled) {
          setPageStatus('error');
        }
      }
    }

    void resolveProduct();
    return () => {
      cancelled = true;
    };
  }, [id, listedProduct, cartItemFromState, retryNonce]);

  useEffect(() => {
    if (product?.options && product.options.length > 0) {
      const firstAvailable = product.options.find((opt) => opt.isActive && opt.stock > 0) || product.options[0];
      setSelectedOptionId(firstAvailable.id);
    }
    if (product?.supported_orientations && product.supported_orientations.length > 0) {
      setSelectedOrientation(product.supported_orientations.includes('portrait') ? 'portrait' : 'landscape');
    } else {
      setSelectedOrientation('portrait');
    }
  }, [product]);

  const viewItemFiredForIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pageStatus !== 'ready') return;
    if (!product?.id || product.id === 'workshop-single') return;
    if (product.is_visible === false) return;
    if (viewItemFiredForIdRef.current === product.id) return;

    const options = product.options || [];
    const option = options.find((opt) => opt.id === selectedOptionId);
    if (options.length > 0 && !option) return;

    const price =
      option && typeof option.price === 'number'
        ? option.price
        : typeof product.price === 'number'
          ? product.price
          : NaN;
    if (!Number.isFinite(price)) return;

    const now = Date.now();
    if (
      lastViewItemDedupe &&
      lastViewItemDedupe.productId === product.id &&
      now - lastViewItemDedupe.at < VIEW_ITEM_STRICT_MODE_MS
    ) {
      viewItemFiredForIdRef.current = product.id;
      return;
    }

    viewItemFiredForIdRef.current = product.id;
    lastViewItemDedupe = { productId: product.id, at: now };
    track('view_item', {
      currency: 'KRW',
      value: price,
      items: [
        {
          item_id: product.id,
          item_name: product.title,
          ...(option?.name ? { item_variant: option.name } : {}),
          price,
          quantity: 1,
        },
      ],
    });
  }, [pageStatus, product, selectedOptionId]);

  const handleRetry = () => {
    setPageStatus('loading');
    setRetryNonce((value) => value + 1);
    void fetchProducts();
  };

  if (pageStatus === 'loading') {
    return (
      <PdpStatusScreen title="불러오는 중">
        <span className="sr-only">상품 정보를 불러오는 중입니다.</span>
      </PdpStatusScreen>
    );
  }

  if (pageStatus === 'error') {
    return (
      <PdpStatusScreen title="작품을 불러올 수 없습니다." body="잠시 후 다시 시도해 주세요.">
        <Button fullWidth onClick={handleRetry}>
          다시 시도
        </Button>
        <Button fullWidth variant="secondary" onClick={goToCollection}>
          컬렉션으로 돌아가기
        </Button>
      </PdpStatusScreen>
    );
  }

  if (pageStatus === 'not_found' || !product) {
    return (
      <PdpStatusScreen title="작품을 찾을 수 없습니다." body="요청하신 작품이 없거나 공개되지 않았습니다.">
        <Button fullWidth onClick={goToCollection}>
          컬렉션으로 돌아가기
        </Button>
      </PdpStatusScreen>
    );
  }

  const selectedOption = product.options?.find((opt) => opt.id === selectedOptionId);
  const isSoldOut = !selectedOption || selectedOption.stock <= 0 || !selectedOption.isActive;
  const currentPrice = selectedOption ? selectedOption.price : 0;

  const handleAddToCart = async () => {
    if (!currentUser) {
      setIsLoginModalOpen(true);
      return;
    }

    if (!product?.id || !selectedOptionId) {
      showToast('상품 옵션을 선택해주세요.', 'error');
      return;
    }

    try {
      setIsAddingToCart(true);

      const option = product.options?.find((opt) => opt.id === selectedOptionId);
      const unitPrice = option ? option.price : 0;
      const variantParts = [
        option?.name,
        selectedOrientation === 'landscape' ? 'landscape' : selectedOrientation === 'portrait' ? 'portrait' : undefined,
      ].filter(Boolean);

      const ok = await addToCart(
        product.id,
        selectedOptionId,
        Math.max(1, Math.floor(quantity)),
        undefined,
        undefined,
        selectedOrientation,
        {
        item_name: product.title,
        price: unitPrice,
        ...(variantParts.length > 0 ? { item_variant: variantParts.join(' / ') } : {}),
      });

      if (!ok) {
        return;
      }

      setIsAdded(true);
      setTimeout(() => {
        openCart();
      }, 800);
    } catch (error: any) {
      console.error('Add to Cart Failed:', error.message || error);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const factualImageSrc =
    getFullImageUrl(
      selectedOrientation === 'landscape' && product.landscape_image
        ? product.landscape_image
        : product.front_image || product.image,
    ) || null;

  return (
    <div className="relative bg-canvas text-text-primary">
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onSuccess={() => setIsLoginModalOpen(false)} />

      <ProductTheatreLayout
        stage={
          <ProductTheatreStage
            product={product}
            orientation={selectedOrientation}
            optionDimension={selectedOption?.dimension}
            onOpenRoomPreview={() => setRoomPreviewOpen(true)}
            roomPreviewEntryRef={roomPreviewEntryRef}
            onViewerOpenChange={setViewerOpen}
          />
        }
        rail={
          <ProductTheatreRail
            product={product}
            isWorkshopReturn={id === 'workshop-single' && Boolean(cartItemFromState)}
            selectedOptionId={selectedOptionId}
            selectedOrientation={selectedOrientation}
            quantity={quantity}
            currentPrice={currentPrice}
            isSoldOut={isSoldOut}
            isAddingToCart={isAddingToCart}
            isAdded={isAdded}
            errorMsg={errorMsg}
            onBack={handleBack}
            onSelectOption={setSelectedOptionId}
            onSelectOrientation={setSelectedOrientation}
            onQuantityChange={setQuantity}
            onAddToCart={handleAddToCart}
            onOpenCart={openCart}
          />
        }
      />

      <PdpStorySection
        product={product}
        orientation={selectedOrientation}
        viewerOpen={viewerOpen}
        roomPreviewOpen={roomPreviewOpen}
      />

      <ProductTruthSection imageSrc={factualImageSrc} />

      <ProductMountIncluded imageSrc={factualImageSrc} />

      <ProductOrderConfidence />

      <ProductInformationNotice productTitle={product.title} />

      {roomPreviewOpen ? (
        <ProductTheatreRoomPreview
          product={product}
          orientation={selectedOrientation}
          optionName={selectedOption?.name ?? ''}
          optionDimension={selectedOption?.dimension ?? ''}
          returnFocusRef={roomPreviewEntryRef}
          onClose={() => setRoomPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}
