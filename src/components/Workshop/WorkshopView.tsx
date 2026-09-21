import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Image as ImageIcon, ChevronLeft, X, Loader2, ShoppingBag, Box } from 'lucide-react';
import LoadingScreen from '../LoadingScreen';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import type { Product } from '../../data/products';
import { ProductTheatreStage } from '../pdp/ProductTheatreStage';
import { ProductTheatreRoomPreview } from '../pdp/ProductTheatreRoomPreview';
import { CATALOG_M_DIMENSION, CATALOG_M_NAME } from '../pdp/catalogSizeLabel';
import { track } from '../../lib/analytics';
import { compositionIsTightCrop } from '../../lib/customComposition/math';
import { SUPPORTED_IMAGE_ACCEPT, validateCustomImageFile } from '../../lib/customComposition/imageValidation';
import { revokePreviewUrl } from '../../lib/customComposition/rasterize';
import { useCustomComposition } from '../../lib/customComposition/useCustomComposition';
import {
  fetchCustomMPrice,
  formatCustomMPrice,
  PRICE_UNAVAILABLE_MESSAGE,
} from '../../lib/customComposition/customMPrice';
import {
  buildCompleteV1Config,
  removeWorkshopPaths,
  uploadWorkshopOriginal,
  uploadWorkshopPreview,
  verifyTrustedCustomCartRow,
} from '../../lib/customComposition/durableHandoff';
import CustomImageEditor, { CustomCompositionControls, CustomPreviewPanel } from './CustomImageEditor';

const STEPS = [
  { id: 1, title: '이미지 편집' },
  { id: 2, title: '제품 미리보기' },
] as const;

const PRODUCT_LINE = '메탈 프린트 · M';
const PRODUCT_SIZE = '200 × 283 mm';

const CUSTOM_MEDIA_PILL_CLASS =
  'pointer-events-auto focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-zinc-950/15 bg-white px-3.5 text-zinc-950 shadow-[0_2px_14px_rgba(0,0,0,0.22)] type-metadata hover:bg-zinc-100 hover:shadow-[0_3px_16px_rgba(0,0,0,0.26)] active:bg-zinc-200 active:scale-[0.98]';

/** Progress / cart snapshot only. Not shown to customers. */
type SizeType = 'A4' | 'Custom';
type WorkshopStep = 1 | 2;

function normalizeWorkshopStep(step: unknown): WorkshopStep {
  const n = Number(step);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return 2;
}

/** Analytics identity only. Join sellable size/orientation. Separator is exact `" / "`. */
function workshopAnalyticsItemVariant(
  sizeValue: string | null | undefined,
  orientationValue: string | null | undefined,
): string | undefined {
  const fragments = [sizeValue, orientationValue]
    .map((fragment) => (typeof fragment === 'string' ? fragment.trim() : ''))
    .filter((fragment) => fragment.length > 0);
  return fragments.length > 0 ? fragments.join(' / ') : undefined;
}

function EmptyProductFrame({
  orientation,
  label,
}: {
  orientation: 'portrait' | 'landscape';
  label: string;
}) {
  const portrait = orientation === 'portrait';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div
        aria-hidden
        className={`overflow-hidden rounded-xl border border-border-subtle bg-surface ${
          portrait ? 'h-[11.5rem] w-[8.1rem]' : 'h-[8.1rem] w-[11.5rem]'
        }`}
      />
      <p className="type-metadata text-center text-text-secondary [word-break:keep-all]">{label}</p>
    </div>
  );
}

interface WorkshopViewProps {
  onBack?: () => void;
  onClose?: () => void;
  onComplete?: () => void;
  hideHeader?: boolean;
  allowResumeCheck?: () => boolean;
}

export default function WorkshopView({ onBack, onClose, onComplete, hideHeader = false, allowResumeCheck }: WorkshopViewProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { refreshCart, openCart } = useCart();
  const [currentStep, setCurrentStep] = useState<WorkshopStep>(1);
  const [direction, setDirection] = useState(1);
  const totalSteps = STEPS.length;

  const [materialType, setMaterialType] = useState<'aluminum'>('aluminum');
  const [size, setSize] = useState<SizeType>('A4');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [customPriceStatus, setCustomPriceStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [roomPreviewOpen, setRoomPreviewOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isClearingRef = useRef(false);
  const resumeEvaluatedRef = useRef(false);
  const roomPreviewEntryRef = useRef<HTMLButtonElement>(null);
  const loadedSourceUrlRef = useRef<string | null>(null);
  const uploadedImageRef = useRef<string | null>(null);
  const cartSubmitLockRef = useRef(false);

  const {
    source,
    composition,
    previewUrl,
    loadSourceFromUrl,
    clearSource,
    setOrientation,
    setZoom,
    panByPointer,
    ensureCurrentPreview,
  } = useCustomComposition();

  const orientation = composition.orientation;
  const qualityWarning = Boolean(source && compositionIsTightCrop(composition));

  const replaceUploadedImage = useCallback((next: string | null) => {
    setUploadedImage((prev) => {
      if (prev && prev !== next) revokePreviewUrl(prev);
      return next;
    });
  }, []);

  const customProduct = useMemo<Product | null>(() => {
    if (!previewUrl) return null;
    return {
      id: 'workshop-custom',
      title: '커스텀 작품',
      artist: 'METALORA',
      image: previewUrl,
      front_image: previewUrl,
      landscape_image: previewUrl,
      description: '',
      limited: true,
    };
  }, [previewUrl]);

  uploadedImageRef.current = uploadedImage;

  useEffect(() => {
    let cancelled = false;
    setCustomPriceStatus('loading');
    setCustomPrice(null);
    void fetchCustomMPrice().then((amount) => {
      if (cancelled) return;
      if (amount === null) {
        setCustomPrice(null);
        setCustomPriceStatus('unavailable');
        return;
      }
      setCustomPrice(amount);
      setCustomPriceStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!uploadedImage) {
      loadedSourceUrlRef.current = null;
      clearSource();
      return;
    }
    if (loadedSourceUrlRef.current === uploadedImage) return;
    loadedSourceUrlRef.current = uploadedImage;
    void loadSourceFromUrl(uploadedImage, true);
  }, [uploadedImage, clearSource, loadSourceFromUrl]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(uploadedImageRef.current);
    };
  }, []);

  useEffect(() => {
    const fetchProgress = async () => {
      if (resumeEvaluatedRef.current) {
        setIsRestoring(false);
        return;
      }

      if (!user) {
        setIsRestoring(false);
        return;
      }

      if (allowResumeCheck && !allowResumeCheck()) {
        resumeEvaluatedRef.current = true;
        setIsRestoring(false);
        return;
      }

      resumeEvaluatedRef.current = true;

      try {
        const { data, error } = await supabase
          .from('user_progress')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          if (error.code !== 'PGRST116') {
            console.error('Fetch failed:', error);
          }
          localStorage.removeItem('force_new_start');
          sessionStorage.removeItem('workshop_just_finished');
          setIsRestoring(false);
          return;
        }

        const hasValidData = data && data.uploaded_image_url &&
                             typeof data.uploaded_image_url === 'string' &&
                             data.uploaded_image_url.trim().length > 0 &&
                             data.uploaded_image_url !== 'null';

        if (hasValidData) {
          const forceNew = localStorage.getItem('force_new_start') === 'true' ||
                           sessionStorage.getItem('workshop_just_finished') === 'true';

          if (forceNew) {
            await supabase.from('user_progress').upsert({
              user_id: user.id,
              current_step: 1,
              selected_material: 'aluminum',
              selected_size: 'A4',
              uploaded_image_url: null,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
            localStorage.removeItem('force_new_start');
            sessionStorage.removeItem('workshop_just_finished');
            setIsRestoring(false);
          } else {
            setPendingProgress(data);
            setShowResumeModal(true);
            setIsRestoring(false);
          }
        } else {
          localStorage.removeItem('force_new_start');
          sessionStorage.removeItem('workshop_just_finished');
          setIsRestoring(false);
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err);
        setIsRestoring(false);
      }
    };

    fetchProgress();
  }, [user?.id, allowResumeCheck]);

  const handleStartNew = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setShowResumeModal(false);
    isClearingRef.current = true;

    replaceUploadedImage(null);
    setPendingProgress(null);
    setMaterialType('aluminum');
    setSize('A4');

    localStorage.removeItem('temp_image_url');
    localStorage.removeItem('workshop_draft');
    sessionStorage.removeItem('temp_image_url');
    sessionStorage.removeItem('workshop_draft');
    localStorage.setItem('force_new_start', 'true');

    if (user) {
      try {
        await supabase.from('user_progress').upsert({
          user_id: user.id,
          current_step: 1,
          selected_material: 'aluminum',
          selected_size: 'A4',
          uploaded_image_url: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      } catch (err) {
        console.error('Failed to clear progress in Supabase:', err);
      }
    }

    isClearingRef.current = false;
    setCurrentStep(1);
  };

  const handleResume = () => {
    if (pendingProgress) {
      setMaterialType(pendingProgress.selected_material as 'aluminum');
      setSize((pendingProgress.selected_size as SizeType) || 'A4');
      if (pendingProgress.uploaded_image_url) {
        replaceUploadedImage(pendingProgress.uploaded_image_url);
        setCurrentStep(normalizeWorkshopStep(pendingProgress.current_step));
      } else {
        setCurrentStep(1);
      }
    }
    setShowResumeModal(false);
  };

  const saveProgress = useCallback(async (step: number, mat: string, sz: string, imgUrl: string | null) => {
    if (!user) return;

    const urlToSave = imgUrl?.startsWith('blob:') ? null : imgUrl;
    if (!urlToSave) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (isClearingRef.current) return;
      try {
        const { error } = await supabase
          .from('user_progress')
          .upsert({
            user_id: user.id,
            current_step: normalizeWorkshopStep(step),
            selected_material: mat,
            selected_size: sz,
            uploaded_image_url: urlToSave,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) {
          console.error('Save failed:', error);
        }
      } catch (err) {
        console.error('Save failed (exception):', err);
      }
    }, 1500);
  }, [user]);

  useEffect(() => {
    if (!isRestoring && !showResumeModal && uploadedImage) {
      saveProgress(currentStep, materialType, size, uploadedImage);
    }
  }, [currentStep, materialType, size, uploadedImage, isRestoring, showResumeModal, saveProgress]);

  const clearProgress = async () => {
    if (!user) return;
    isClearingRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      await supabase.from('user_progress').upsert({
        user_id: user.id,
        current_step: 1,
        selected_material: 'aluminum',
        selected_size: 'A4',
        uploaded_image_url: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      replaceUploadedImage(null);
      loadedSourceUrlRef.current = null;
      localStorage.removeItem('temp_image_url');
      localStorage.removeItem('workshop_draft');
      sessionStorage.removeItem('temp_image_url');
      sessionStorage.removeItem('workshop_draft');
      localStorage.setItem('force_new_start', 'true');
    } catch (err) {
      console.error('Failed to clear progress:', err);
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo(0, 0);
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 2) {
      setRoomPreviewOpen(false);
      setViewerOpen(false);
    }
  }, [currentStep]);

  const leaveWorkshop = () => {
    setShowExitConfirm(false);
    if (onBack) {
      onBack();
    } else if (onClose) {
      onClose();
    }
  };

  const requestExit = () => {
    if (uploadedImage) {
      setShowExitConfirm(true);
      return;
    }
    leaveWorkshop();
  };

  const handleNext = async () => {
    if (currentStep !== 1) return;
    if (!uploadedImage) {
      showToast('사진을 먼저 업로드해 주세요.', 'error');
      return;
    }
    setIsPreparingPreview(true);
    try {
      const url = await ensureCurrentPreview();
      if (!url) {
        showToast('미리보기를 만들지 못했습니다. 다시 시도해 주세요.', 'error');
        return;
      }
      setDirection(1);
      setCurrentStep(2);
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleBack = () => {
    if (currentStep === 1) {
      requestExit();
      return;
    }
    setDirection(-1);
    setCurrentStep(1);
  };

  const handleActionClick = async () => {
    if (currentStep !== totalSteps) {
      await handleNext();
      return;
    }

    if (isUploading || isPreparingPreview || cartSubmitLockRef.current) return;

    if (customPriceStatus !== 'ready' || customPrice === null) {
      showToast('판매가를 확인할 수 없어 담을 수 없습니다.', 'error');
      return;
    }

    if (!source) {
      showToast('사진을 먼저 업로드해 주세요.', 'error');
      return;
    }

    cartSubmitLockRef.current = true;
    setIsUploading(true);
    const createdPaths: string[] = [];
    let rowPersisted = false;

    try {
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        showToast('로그인이 필요합니다.', 'error');
        return;
      }

      const previewObjectUrl = await ensureCurrentPreview();
      if (!previewObjectUrl) {
        showToast('미리보기를 만들지 못했습니다. 다시 시도해 주세요.', 'error');
        return;
      }

      const previewBlob = await fetch(previewObjectUrl).then((response) => {
        if (!response.ok) throw new Error('preview blob fetch failed');
        return response.blob();
      });

      let originalUrl: string | null = null;
      if (uploadedFile) {
        const original = await uploadWorkshopOriginal(currentUser.id, uploadedFile);
        createdPaths.push(original.path);
        originalUrl = original.publicUrl;
      } else if (uploadedImage && !uploadedImage.startsWith('blob:')) {
        originalUrl = uploadedImage;
      }

      if (!originalUrl) {
        showToast('원본 이미지를 저장하지 못했습니다. 다시 시도해 주세요.', 'error');
        return;
      }

      const preview = await uploadWorkshopPreview(currentUser.id, previewBlob);
      createdPaths.push(preview.path);

      const { data: rpcData, error: rpcError } = await supabase.rpc('add_custom_cart_item', {
        p_quantity: 1,
        p_orientation: orientation,
        p_original_image_url: originalUrl,
        p_preview_image_url: preview.publicUrl,
        p_custom_config: buildCompleteV1Config(source, composition),
      });

      if (rpcError) {
        console.error('add_custom_cart_item failed:', rpcError);
        showToast('장바구니에 담지 못했습니다. 다시 시도해 주세요.', 'error');
        await removeWorkshopPaths(createdPaths).catch(() => undefined);
        return;
      }

      rowPersisted = true;

      const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
        custom_image?: string | null;
        custom_config?: Record<string, unknown> | null;
      } | null;
      const verified = verifyTrustedCustomCartRow(row, preview.publicUrl);
      if (verified.ok === false) {
        showToast('장바구니에 담지 못했습니다. 다시 시도해 주세요.', 'error');
        return;
      }

      if (verified.priceSnapshot !== customPrice) {
        setCustomPrice(verified.priceSnapshot);
        setCustomPriceStatus('ready');
        showToast(`판매가가 ${formatCustomMPrice(verified.priceSnapshot)}으로 반영되었습니다.`, 'info');
      }

      const refreshed = await refreshCart();
      if (!refreshed) {
        showToast('장바구니에 담지 못했습니다. 다시 시도해 주세요.', 'error');
        return;
      }

      track('add_to_cart', {
        currency: 'KRW',
        value: verified.priceSnapshot,
        items: [
          {
            item_id: 'workshop-single',
            item_name: '나만의 커스텀 포스터',
            item_variant: workshopAnalyticsItemVariant('M', orientation),
            price: verified.priceSnapshot,
            quantity: 1,
          },
        ],
      });

      setIsFlashing(true);
      await clearProgress();
      replaceUploadedImage(null);
      setUploadedFile(null);
      setPendingProgress(null);
      localStorage.removeItem('temp_image_url');
      localStorage.removeItem('workshop_draft');
      sessionStorage.removeItem('temp_image_url');
      sessionStorage.removeItem('workshop_draft');
      sessionStorage.setItem('workshop_just_finished', 'true');

      setIsFlashing(false);

      if (onComplete) {
        onComplete();
      }
      setTimeout(() => openCart(), 100);
    } catch (err: unknown) {
      console.error('Failed to save to collection:', err);
      showToast('장바구니에 담지 못했습니다. 다시 시도해 주세요.', 'error');
      if (!rowPersisted) {
        await removeWorkshopPaths(createdPaths).catch(() => undefined);
      }
    } finally {
      cartSubmitLockRef.current = false;
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const validated = await validateCustomImageFile(file);
    if (validated.ok === false) {
      showToast(validated.message, 'error');
      return;
    }

    setUploadedFile(file);
    replaceUploadedImage(validated.objectUrl);
  };

  const primaryLabel =
    isUploading
      ? (currentStep === 2 ? '처리 중...' : '업로드 중...')
      : isPreparingPreview
        ? '미리보기 준비 중...'
      : currentStep === 1
        ? '다음으로'
        : '장바구니에 담기';

  const isButtonDisabled =
    (currentStep === 1 && (!uploadedImage || !source))
    || (currentStep === 2 && (customPriceStatus !== 'ready' || customPrice === null))
    || isUploading
    || isPreparingPreview;

  if (isRestoring) {
    return <LoadingScreen />;
  }

  const isPreviewSubViewOpen = viewerOpen || roomPreviewOpen;

  const renderPrimaryCta = (placement: 'panel' | 'mobile') => (
    <button
      type="button"
      onClick={handleActionClick}
      disabled={isButtonDisabled}
      className={`focus-ring min-h-12 w-full items-center justify-center gap-2 rounded-xl type-label ${
        placement === 'panel'
          ? 'hidden md:flex'
          : 'flex'
      } ${
        isButtonDisabled
          ? 'cursor-not-allowed bg-surface text-text-tertiary'
          : 'bg-text-primary text-text-inverse'
      }`}
    >
      {isUploading || isPreparingPreview ? (
        <Loader2 className="animate-spin" size={18} />
      ) : currentStep === 2 ? (
        <ShoppingBag size={18} />
      ) : null}
      <span>{primaryLabel}</span>
    </button>
  );

  const productInfo = (
    <div className="text-center md:text-left">
      <p className="type-label text-text-primary">{PRODUCT_LINE}</p>
      <p className="type-supporting mt-1 text-text-secondary">{PRODUCT_SIZE}</p>
      {customPriceStatus === 'loading' ? null : customPriceStatus === 'ready' && customPrice !== null ? (
        <p className="type-label mt-2 text-text-primary">{formatCustomMPrice(customPrice)}</p>
      ) : (
        <p className="type-supporting mt-2 text-text-secondary">{PRICE_UNAVAILABLE_MESSAGE}</p>
      )}
    </div>
  );

  const orientationControls = (
    <div>
      <h3 className="type-supporting mb-3 text-text-secondary">방향</h3>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOrientation('portrait')}
          className={`focus-ring flex min-h-11 flex-col items-center justify-center gap-2 rounded-lg border py-3 type-label ${
            orientation === 'portrait'
              ? 'border-text-primary bg-surface text-text-primary'
              : 'border-border-subtle text-text-secondary hover:text-text-primary'
          }`}
          aria-pressed={orientation === 'portrait'}
        >
          <span aria-hidden className="h-7 w-5 rounded-[2px] border border-current" />
          세로
        </button>
        <button
          type="button"
          onClick={() => setOrientation('landscape')}
          className={`focus-ring flex min-h-11 flex-col items-center justify-center gap-2 rounded-lg border py-3 type-label ${
            orientation === 'landscape'
              ? 'border-text-primary bg-surface text-text-primary'
              : 'border-border-subtle text-text-secondary hover:text-text-primary'
          }`}
          aria-pressed={orientation === 'landscape'}
        >
          <span aria-hidden className="h-5 w-7 rounded-[2px] border border-current" />
          가로
        </button>
      </div>
    </div>
  );

  const editPreview = (
    <CustomImageEditor
      source={source}
      composition={composition}
      emptyLabel="사진을 업로드 하세요"
      onPanByPointer={panByPointer}
      onZoom={setZoom}
    />
  );

  const step2Canvas = (
    <CustomPreviewPanel
      source={source}
      composition={composition}
      emptyLabel="사진을 업로드 하세요"
      overlay={
        isPreviewSubViewOpen ? undefined : (
        <div className="absolute right-3 bottom-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-1.5">
          <button
            ref={roomPreviewEntryRef}
            id="pdp-room-preview-entry"
            type="button"
            aria-haspopup="dialog"
            aria-label="내 공간에 걸어보기"
            className={CUSTOM_MEDIA_PILL_CLASS}
            onClick={() => setRoomPreviewOpen(true)}
          >
            <ImageIcon size={14} strokeWidth={1.7} aria-hidden />
            내 공간에 걸어보기
          </button>
          {customProduct ? (
          <button
            type="button"
            aria-label="3D로 보기"
            className={CUSTOM_MEDIA_PILL_CLASS}
            onClick={() => setViewerOpen(true)}
          >
            <Box size={14} strokeWidth={1.7} aria-hidden />
            3D로 보기
          </button>
          ) : null}
        </div>
        )
      }
    />
  );

  const step2Facts = (
    <div className="flex flex-col gap-5">
      {productInfo}
      <dl className="space-y-3">
        <div className="flex justify-between gap-4">
          <dt className="type-supporting text-text-secondary">방향</dt>
          <dd className="type-label text-text-primary">{orientation === 'landscape' ? '가로' : '세로'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="type-supporting text-text-secondary">제작</dt>
          <dd className="type-label text-text-primary">2–5영업일</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="type-supporting text-text-secondary">배송</dt>
          <dd className="type-label text-right text-text-primary">출고 후 1–3영업일</dd>
        </div>
      </dl>
      <p className="type-body text-text-secondary">
        커스텀 상품은 제작이 시작된 이후 취소 및 환불이 불가합니다. 최종 시안을 다시 한번 확인해 주세요.
      </p>
    </div>
  );

  return (
    <div
      className={`flex w-full flex-col overflow-x-hidden font-sans pointer-events-auto ${
      hideHeader ? 'h-full' : 'min-h-screen'
    } ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}
      data-custom-preview-ready={previewUrl ? 'true' : 'false'}
    >
      <header className={`${hideHeader ? 'relative' : 'fixed top-0 left-0'} z-[100] h-16 w-full items-center border-b border-border-subtle px-4 backdrop-blur-md ${
        isPreviewSubViewOpen ? 'hidden' : 'flex'
      } ${theme === 'dark' ? 'bg-black/80' : 'bg-white/80'}`}>
        <div className="flex flex-1 justify-start">
          <button
            type="button"
            onClick={handleBack}
            className="focus-ring p-2 text-text-secondary hover:text-text-primary"
            aria-label={currentStep === 1 ? '닫기' : '이전'}
          >
            <ChevronLeft size={22} />
          </button>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="type-metadata text-text-tertiary">
            {currentStep} / {totalSteps}
          </div>
          <h1 className="type-label text-text-primary">
            {STEPS[currentStep - 1].title}
          </h1>
        </div>

        <div className="flex flex-1 items-center justify-end">
          <button
            type="button"
            onClick={requestExit}
            className="focus-ring p-2 text-text-secondary hover:text-text-primary"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showResumeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className={`w-full max-w-sm rounded-xl border border-border-subtle p-6 text-center ${
                theme === 'dark' ? 'bg-zinc-900' : 'bg-white'
              }`}
            >
              <h3 className="type-section-title text-text-primary [word-break:keep-all]">이전에 작업한 이미지가 있습니다.</h3>
              <p className="type-supporting mt-2 text-text-secondary">불러오시겠습니까?</p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="focus-ring min-h-11 flex-1 rounded-lg border border-border-subtle type-label text-text-secondary"
                >
                  새로 시작
                </button>
                <button
                  type="button"
                  onClick={handleResume}
                  className="focus-ring min-h-11 flex-1 rounded-lg bg-text-primary type-label text-text-inverse"
                >
                  불러오기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className={`w-full max-w-sm rounded-xl border border-border-subtle p-6 text-center ${
                theme === 'dark' ? 'bg-zinc-900' : 'bg-white'
              }`}
            >
              <h3 className="type-section-title text-text-primary [word-break:keep-all]">제작을 종료할까요?</h3>
              <p className="type-supporting mt-2 text-text-secondary [word-break:keep-all]">업로드한 이미지가 있습니다.</p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="focus-ring min-h-11 flex-1 rounded-lg border border-border-subtle type-label text-text-secondary"
                >
                  계속 제작
                </button>
                <button
                  type="button"
                  onClick={leaveWorkshop}
                  className="focus-ring min-h-11 flex-1 rounded-lg bg-text-primary type-label text-text-inverse"
                >
                  종료
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollContainerRef}
        className="relative z-10 flex flex-1 flex-col overflow-y-auto overscroll-contain touch-pan-y pb-8 pt-6"
      >
        <div className="mx-auto mb-6 w-full max-w-xl px-5 md:max-w-7xl">
          <div className={`h-px w-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-black/5'}`}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
              transition={{ duration: 0.4 }}
              className="h-full bg-text-primary"
            />
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl flex-1 px-5 md:max-w-7xl">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 16 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -16 : 16 }}
              transition={{ duration: 0.3 }}
              className="h-full w-full"
            >
              {currentStep === 1 && (
                <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                  <div className={`order-1 w-full flex-1 ${isPreparingPreview ? 'pointer-events-none' : ''}`}>
                    {editPreview}
                  </div>
                  <div className="order-2 flex w-full flex-col gap-6 md:w-[22rem]">
                    {productInfo}
                    {orientationControls}
                    <div>
                      <h3 className="type-supporting mb-3 text-text-secondary">사진 업로드</h3>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-subtle type-label text-text-primary disabled:opacity-50"
                      >
                        {isUploading ? <Loader2 className="animate-spin" size={18} /> : uploadedImage ? <ImageIcon size={18} /> : <Upload size={18} />}
                        {isUploading ? '업로드 중...' : uploadedImage ? '사진 변경' : '사진 업로드'}
                      </button>
                      <p className="type-supporting mt-2 text-text-secondary">
                        타인의 저작권을 침해하는 이미지는 사용할 수 없습니다.
                      </p>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept={SUPPORTED_IMAGE_ACCEPT}
                        className="hidden"
                      />
                    </div>
                    {uploadedImage ? (
                      <CustomCompositionControls
                        source={source}
                        composition={composition}
                        onZoom={setZoom}
                        qualityWarning={qualityWarning}
                      />
                    ) : null}
                    {renderPrimaryCta('panel')}
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                  <div className="order-1 w-full flex-1">
                    {step2Canvas}
                  </div>
                  <div className={`${isPreviewSubViewOpen ? 'hidden' : 'flex'} order-2 w-full flex-col gap-6 md:w-[22rem]`}>
                    {step2Facts}
                    {renderPrimaryCta('panel')}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div
        className={`z-20 shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 ${
          isPreviewSubViewOpen ? 'hidden' : 'md:hidden'
        } ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}
      >
        {renderPrimaryCta('mobile')}
      </div>

      <AnimatePresence>
        {isFlashing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[10002] bg-white"
          />
        )}
      </AnimatePresence>

      {viewerOpen && customProduct ? (
        <ProductTheatreStage
          product={customProduct}
          orientation={orientation}
          optionDimension={CATALOG_M_DIMENSION}
          startInViewer
          onViewerOpenChange={setViewerOpen}
        />
      ) : null}

      {roomPreviewOpen && customProduct ? (
        <div className="[&_[data-room-artwork-visual]]:overflow-hidden [&_[data-room-artwork-visual]]:rounded-xl">
          <ProductTheatreRoomPreview
            product={customProduct}
            orientation={orientation}
            optionName={CATALOG_M_NAME}
            optionDimension={CATALOG_M_DIMENSION}
            returnFocusRef={roomPreviewEntryRef}
            onClose={() => setRoomPreviewOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
