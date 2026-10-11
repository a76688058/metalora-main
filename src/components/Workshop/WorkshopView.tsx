import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, ChevronLeft, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { safeInternalPath } from '../../lib/authIntegrity';
import LoginModal from '../LoginModal';
import { useTheme } from '../../context/ThemeContext';
import type { Product } from '../../data/products';
import { ProductTheatreStage } from '../pdp/ProductTheatreStage';
import { ProductTheatreRoomPreview } from '../pdp/ProductTheatreRoomPreview';
import { CATALOG_M_DIMENSION, CATALOG_M_NAME } from '../pdp/catalogSizeLabel';
import { track } from '../../lib/analytics';
import { clampComposition, compositionIsTightCrop } from '../../lib/customComposition/math';
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
  loadWorkshopMediaAsObjectUrl,
  persistWorkshopCartMedia,
  verifyTrustedCustomCartRow,
  WORKSHOP_UPLOAD_LIMITS,
  type WorkshopMediaApi,
} from '../../lib/customComposition/durableHandoff';
import {
  normalizeWorkshopMediaRef,
  resolveWorkshopMediaSrc,
  retryWorkshopMediaAfterLoadError,
} from '../../lib/workshopMedia';
import CustomImageEditor, { CustomCompositionControls, CustomPreviewPanel } from './CustomImageEditor';
import {
  claimWorkshopPendingAdd,
  discardWorkshopPendingAddSync,
  hasWorkshopPendingAdd,
  saveWorkshopPendingAdd,
  takeResumeDelivery,
  type WorkshopPendingAdd,
} from './pendingCartAuth';

const workshopMediaApi: WorkshopMediaApi = {
  fetch: (input, init) => fetch(input, init),
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
};

/**
 * Persisted Workshop original (canonical path or strict legacy URL) → sign-read → local blob: URL.
 * The server decides the source (private GCS or transitional legacy); the src never leaves this call.
 */
function loadResumedWorkshopOriginal(ref: string): Promise<string | null> {
  return loadWorkshopMediaAsObjectUrl(ref, {
    resolve: (value) => resolveWorkshopMediaSrc(value, { mode: 'customer' }),
    retryAfterLoadError: (value, failedSrc) =>
      retryWorkshopMediaAfterLoadError(value, failedSrc, { mode: 'customer' }),
    fetch: (input, init) => fetch(input, init),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
  });
}

const STEPS = [
  { id: 1, title: '이미지 편집' },
  { id: 2, title: '제품 미리보기' },
] as const;

const PRODUCT_LINE = '메탈 프린트 · M';
const PRODUCT_SIZE = '200 × 283 mm';

const WORKSHOP_RAIL_CLASS =
  'flex w-full shrink-0 flex-col border-t border-border-subtle px-6 max-[1099px]:px-5 max-[1099px]:pb-6 max-[1099px]:pt-4 min-[1100px]:w-96 min-[1100px]:overflow-y-auto min-[1100px]:border-l min-[1100px]:border-t-0 min-[1100px]:px-6';

const RAIL_LABEL_CLASS = 'text-[0.6875rem] tracking-[0.16em] text-text-tertiary';

export function workshopSurfaceStyle(theme: string): React.CSSProperties {
  const dark = theme === 'dark';
  return {
    backgroundColor: dark ? '#101114' : '#f6f4ef',
    color: dark ? '#f3f1ec' : '#16150f',
    ['--color-canvas' as string]: dark ? '#101114' : '#f6f4ef',
    ['--color-surface' as string]: dark ? '#101114' : '#f6f4ef',
    ['--color-surface-elevated' as string]: dark ? '#181a1e' : '#f6f4ef',
    ['--color-text-primary' as string]: dark ? '#f3f1ec' : '#16150f',
    ['--color-text-secondary' as string]: dark ? '#c9c4b8' : '#3f3c36',
    ['--color-text-tertiary' as string]: dark ? '#8d887e' : '#6a655c',
    ['--color-text-inverse' as string]: dark ? '#16150f' : '#f4f1eb',
    ['--color-border-subtle' as string]: dark ? 'rgb(255 255 255 / 0.1)' : 'rgb(0 0 0 / 0.1)',
  };
}

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
        className={`overflow-hidden border border-border-subtle bg-surface ${
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
  const location = useLocation();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { refreshCart, openCart } = useCart();
  const [currentStep, setCurrentStep] = useState<WorkshopStep>(1);
  const [, setDirection] = useState(1);
  const totalSteps = STEPS.length;

  const [materialType, setMaterialType] = useState<'aluminum'>('aluminum');
  const [size, setSize] = useState<SizeType>('A4');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [customPriceStatus, setCustomPriceStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  /** Persisted original ref (canonical path or legacy URL) behind `uploadedImage`. Never a signed src. */
  const [durableOriginalRef, setDurableOriginalRef] = useState<string | null>(null);
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
  const resumeAttemptRef = useRef(0);
  const resumeTimeoutRef = useRef<number | null>(null);
  const roomPreviewEntryRef = useRef<HTMLButtonElement>(null);
  const loadedSourceUrlRef = useRef<string | null>(null);
  const uploadedImageRef = useRef<string | null>(null);
  const cartSubmitLockRef = useRef(false);
  const continueAddAfterLoginRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;
  const seenUserIdRef = useRef<string | null>(user?.id ?? null);
  const suppressServerResumeRef = useRef(hasWorkshopPendingAdd());
  const resumeJobRef = useRef<{ phase: 'apply' | 'fire'; pending: WorkshopPendingAdd } | null>(null);
  const [resumeTick, setResumeTick] = useState(0);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const {
    source,
    composition,
    previewUrl,
    loadSourceFromUrl,
    clearSource,
    setOrientation,
    setZoom,
    panByPointer,
    reset,
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

  const invalidateResumeAttempt = useCallback(() => {
    resumeAttemptRef.current += 1;
    if (resumeTimeoutRef.current !== null) {
      window.clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      invalidateResumeAttempt();
      revokePreviewUrl(uploadedImageRef.current);
    };
  }, [invalidateResumeAttempt]);

  useEffect(() => {
    let cancelled = false;
    const settle = () => {
      if (!cancelled) {
        setIsRestoring(false);
      }
    };
    const timeoutId = window.setTimeout(settle, 12_000);

    const fetchProgress = async () => {
      if (resumeEvaluatedRef.current) {
        settle();
        return;
      }

      if (!user) {
        settle();
        return;
      }

      if (suppressServerResumeRef.current) {
        resumeEvaluatedRef.current = true;
        settle();
        return;
      }

      if (allowResumeCheck && !allowResumeCheck()) {
        resumeEvaluatedRef.current = true;
        settle();
        return;
      }

      resumeEvaluatedRef.current = true;

      try {
        const { data, error } = await supabase
          .from('user_progress')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (cancelled) return;

        if (error) {
          if (error.code !== 'PGRST116') {
            console.error('Fetch failed:', error);
          }
          localStorage.removeItem('force_new_start');
          sessionStorage.removeItem('workshop_just_finished');
          settle();
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
            if (cancelled) return;
            localStorage.removeItem('force_new_start');
            sessionStorage.removeItem('workshop_just_finished');
            settle();
          } else {
            setPendingProgress(data);
            setShowResumeModal(true);
            settle();
          }
        } else {
          localStorage.removeItem('force_new_start');
          sessionStorage.removeItem('workshop_just_finished');
          settle();
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err);
        settle();
      }
    };

    void fetchProgress();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      setIsRestoring(false);
    };
  }, [user?.id, allowResumeCheck]);

  const handleStartNew = async () => {
    invalidateResumeAttempt();
    setIsRestoring(false);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setShowResumeModal(false);
    isClearingRef.current = true;

    replaceUploadedImage(null);
    setDurableOriginalRef(null);
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

  const handleResume = async () => {
    const progress = pendingProgress;
    setShowResumeModal(false);
    if (!progress) return;
    setMaterialType(progress.selected_material as 'aluminum');
    setSize((progress.selected_size as SizeType) || 'A4');
    const ref = typeof progress.uploaded_image_url === 'string' ? progress.uploaded_image_url : '';
    if (!ref) {
      setCurrentStep(1);
      return;
    }
    invalidateResumeAttempt();
    const attempt = resumeAttemptRef.current;
    const isCurrent = () => attempt === resumeAttemptRef.current;
    setIsRestoring(true);
    resumeTimeoutRef.current = window.setTimeout(() => {
      if (!isCurrent()) return;
      resumeAttemptRef.current += 1;
      resumeTimeoutRef.current = null;
      setIsRestoring(false);
    }, 12_000);
    try {
      const objectUrl = normalizeWorkshopMediaRef(ref) ? await loadResumedWorkshopOriginal(ref) : null;
      if (!isCurrent()) return;
      if (!objectUrl) {
        setCurrentStep(1);
        showToast('이전 이미지를 불러오지 못했습니다. 사진을 다시 업로드해 주세요.', 'error');
        return;
      }
      setUploadedFile(null);
      setDurableOriginalRef(ref);
      replaceUploadedImage(objectUrl);
      setCurrentStep(normalizeWorkshopStep(progress.current_step));
    } finally {
      if (resumeTimeoutRef.current !== null && isCurrent()) {
        window.clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = null;
      }
      if (isCurrent()) setIsRestoring(false);
    }
  };

  const saveProgress = useCallback(async (step: number, mat: string, sz: string, originalRef: string | null) => {
    if (!user) return;

    const urlToSave = originalRef?.startsWith('blob:') ? null : originalRef;
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
    if (!isRestoring && !showResumeModal && uploadedImage && durableOriginalRef) {
      saveProgress(currentStep, materialType, size, durableOriginalRef);
    }
  }, [currentStep, materialType, size, uploadedImage, durableOriginalRef, isRestoring, showResumeModal, saveProgress]);

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
      setDurableOriginalRef(null);
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
    invalidateResumeAttempt();
    discardWorkshopPendingAddSync();
    resumeJobRef.current = null;
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

    try {
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        if (!user) {
          const pending: WorkshopPendingAdd = {
            v: 1,
            step: currentStep,
            orientation,
            zoom: composition.zoom,
            offsetX: composition.offsetX,
            offsetY: composition.offsetY,
          };
          const persisted = uploadedFile
            ? await saveWorkshopPendingAdd(pending, uploadedFile)
            : false;
          if (!persisted) {
            showToast('사진을 다시 선택해 주세요.', 'error');
          }
          continueAddAfterLoginRef.current = true;
          setIsLoginOpen(true);
        } else {
          showToast('로그인이 필요합니다.', 'error');
        }
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

      const handoff = await persistWorkshopCartMedia(
        workshopMediaApi,
        { originalFile: uploadedFile, existingOriginalRef: durableOriginalRef, previewBlob },
        async ({ originalRef, previewRef }) => {
          const { data, error } = await supabase.rpc('add_custom_cart_item', {
            p_quantity: 1,
            p_orientation: orientation,
            p_original_image_url: originalRef,
            p_preview_image_url: previewRef,
            p_custom_config: buildCompleteV1Config(source, composition),
          });
          if (error) {
            console.error('add_custom_cart_item failed:', { code: error.code });
            return null;
          }
          return { rpcData: data as unknown };
        },
      );

      if (handoff.ok === false) {
        showToast(
          handoff.reason === 'no_original'
            ? '원본 이미지를 저장하지 못했습니다. 다시 시도해 주세요.'
            : '장바구니에 담지 못했습니다. 다시 시도해 주세요.',
          'error',
        );
        return;
      }

      const { rpcData } = handoff.value;
      const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
        custom_image?: string | null;
        custom_config?: Record<string, unknown> | null;
      } | null;
      const verified = verifyTrustedCustomCartRow(row, handoff.refs.previewRef, normalizeWorkshopMediaRef);
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
      setDurableOriginalRef(null);
      setPendingProgress(null);
      discardWorkshopPendingAddSync();
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
      console.error('Failed to save to collection:', err instanceof Error ? err.message : 'unknown');
      showToast('장바구니에 담지 못했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      cartSubmitLockRef.current = false;
      setIsUploading(false);
    }
  };

  const handleActionClickRef = useRef(handleActionClick);
  handleActionClickRef.current = handleActionClick;

  useEffect(() => {
    if (isLoginOpen || !continueAddAfterLoginRef.current || !user) return;
    continueAddAfterLoginRef.current = false;
    discardWorkshopPendingAddSync();
    resumeJobRef.current = null;
    void handleActionClickRef.current();
  }, [isLoginOpen, user]);

  useEffect(() => {
    const id = user?.id ?? null;
    if (seenUserIdRef.current && !id) {
      discardWorkshopPendingAddSync();
      resumeJobRef.current = null;
    }
    seenUserIdRef.current = id;
  }, [user?.id]);

  useEffect(() => {
    if (!user || continueAddAfterLoginRef.current) return;
    let cancelled = false;
    void (async () => {
      const claimed = await claimWorkshopPendingAdd();
      if (cancelled || continueAddAfterLoginRef.current) return;
      if (claimed.status === 'reselect') {
        showToast('사진을 다시 선택해 주세요.', 'error');
        return;
      }
      if (claimed.status !== 'ready') return;
      const validated = await validateCustomImageFile(claimed.file);
      if (cancelled || continueAddAfterLoginRef.current) return;
      if (validated.ok === false) {
        discardWorkshopPendingAddSync();
        showToast('사진을 다시 선택해 주세요.', 'error');
        return;
      }
      if (!takeResumeDelivery()) return;
      setUploadedFile(claimed.file);
      setDurableOriginalRef(null);
      loadedSourceUrlRef.current = validated.objectUrl;
      replaceUploadedImage(validated.objectUrl);
      await loadSourceFromUrl(validated.objectUrl, false);
      if (cancelled) return;
      resumeJobRef.current = { phase: 'apply', pending: claimed.pending };
      setResumeTick((tick) => tick + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadSourceFromUrl, replaceUploadedImage, showToast]);

  useEffect(() => {
    const job = resumeJobRef.current;
    if (!job || job.phase !== 'apply' || !source) return;
    setOrientation(job.pending.orientation);
    reset();
    setZoom(job.pending.zoom);
    panByPointer(job.pending.offsetX, job.pending.offsetY, 1, 1);
    setCurrentStep(2);
    resumeJobRef.current = { phase: 'fire', pending: job.pending };
  }, [source, resumeTick, setOrientation, reset, setZoom, panByPointer]);

  useEffect(() => {
    const job = resumeJobRef.current;
    if (!job || job.phase !== 'fire' || !source || currentStep !== 2) return;
    if (customPriceStatus === 'loading') return;
    if (customPriceStatus === 'unavailable') {
      resumeJobRef.current = null;
      void handleActionClickRef.current();
      return;
    }
    const expected = clampComposition(source, {
      version: 1,
      orientation: job.pending.orientation,
      zoom: job.pending.zoom,
      offsetX: job.pending.offsetX,
      offsetY: job.pending.offsetY,
    });
    if (composition.orientation !== expected.orientation) return;
    if (Math.abs(composition.zoom - expected.zoom) > 1e-3) return;
    if (Math.abs(composition.offsetX - expected.offsetX) > 1e-3) return;
    if (Math.abs(composition.offsetY - expected.offsetY) > 1e-3) return;
    resumeJobRef.current = null;
    void handleActionClickRef.current();
  }, [source, composition, currentStep, customPriceStatus]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    invalidateResumeAttempt();
    setIsRestoring(false);

    if (file.size > WORKSHOP_UPLOAD_LIMITS.original) {
      showToast('25MB 이하의 사진을 선택해 주세요.', 'error');
      return;
    }

    const validated = await validateCustomImageFile(file);
    if (validated.ok === false) {
      showToast(validated.message, 'error');
      return;
    }

    setUploadedFile(file);
    setDurableOriginalRef(null);
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
    || isPreparingPreview
    || isRestoring;

  const isPreviewSubViewOpen = viewerOpen || roomPreviewOpen;

  const renderPrimaryCta = (placement: 'panel' | 'mobile') => (
    <button
      type="button"
      onClick={handleActionClick}
      disabled={isButtonDisabled}
      className={`focus-ring min-h-12 w-full items-center justify-center rounded-[2px] text-[0.9375rem] font-medium ${
        placement === 'panel'
          ? 'hidden min-[1100px]:flex'
          : 'flex'
      } ${
        isButtonDisabled
          ? 'cursor-not-allowed border border-[#8b9197]/70 bg-transparent text-text-secondary dark:border-[#d5d8dc]/45'
          : 'border border-transparent bg-text-primary text-text-inverse'
      }`}
    >
      <span>{primaryLabel}</span>
    </button>
  );

  const productInfo = (
    <div>
      <h2 className="text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary">{PRODUCT_LINE}</h2>
      {customPriceStatus === 'loading' ? null : customPriceStatus === 'ready' && customPrice !== null ? (
        <p className="mt-4 text-[1.25rem] font-medium leading-none text-text-primary">{formatCustomMPrice(customPrice)}</p>
      ) : (
        <p className="mt-4 text-[0.875rem] leading-snug text-text-secondary">{PRICE_UNAVAILABLE_MESSAGE}</p>
      )}
    </div>
  );

  const orientationControls = (
    <div>
      <h3 className={RAIL_LABEL_CLASS}>방향</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {([
          ['portrait', '세로', 'h-12 w-8'],
          ['landscape', '가로', 'h-8 w-12'],
        ] as const).map(([value, label, ratio]) => {
          const active = orientation === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setOrientation(value)}
              aria-pressed={active}
              className={`group focus-ring flex flex-col items-center gap-2.5 rounded-[2px] border bg-transparent px-3 pb-2.5 pt-3.5 transition-colors duration-300 max-[1099px]:gap-2 max-[1099px]:px-2 max-[1099px]:pb-2 max-[1099px]:pt-2.5 ${
                active
                  ? 'border-[#a89068] text-text-primary dark:border-[#b7bcc2]'
                  : 'border-border-subtle text-text-secondary hover:border-[#c4b08a] hover:text-text-primary dark:hover:border-[#9aa0a6]'
              }`}
            >
              <span
                aria-hidden
                className={`border transition-[border-color,opacity] duration-300 ${ratio} ${
                  active
                    ? 'border-[#a89068] opacity-100 dark:border-[#b7bcc2]'
                    : 'border-current opacity-40 group-hover:border-[#a89068] group-hover:opacity-70 dark:group-hover:border-[#b7bcc2]'
                }`}
              />
              <span className="text-[0.8125rem] leading-none">{label}</span>
              <span
                aria-hidden
                className={`h-px w-8 ${active ? 'bg-[#a89068] dark:bg-[#b7bcc2]' : 'bg-transparent'}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );

  const editPreview = (
    <CustomImageEditor
      source={source}
      composition={composition}
      emptyLabel="사진 업로드"
      onPanByPointer={panByPointer}
      onZoom={setZoom}
      onRequestUpload={source ? undefined : () => fileInputRef.current?.click()}
      uploadDisabled={isUploading}
    />
  );

  const step2Canvas = (
    <CustomPreviewPanel
      source={source}
      composition={composition}
      emptyLabel="사진을 업로드 하세요"
    />
  );

  const sizeBlock = (
    <div>
      <h3 className={RAIL_LABEL_CLASS}>크기</h3>
      <p className="mt-2 text-[0.9375rem] leading-snug text-text-primary">{PRODUCT_SIZE}</p>
    </div>
  );

  const step2Facts = (
    <div className="flex flex-col">
      <h2 className="text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary">{PRODUCT_LINE}</h2>
      {customPriceStatus === 'loading' ? null : customPriceStatus === 'ready' && customPrice !== null ? (
        <p className="mt-4 text-[1.25rem] font-medium leading-none text-text-primary">{formatCustomMPrice(customPrice)}</p>
      ) : (
        <p className="mt-4 text-[0.875rem] leading-snug text-text-secondary">{PRICE_UNAVAILABLE_MESSAGE}</p>
      )}

      <div className="mt-6 border-t border-border-subtle pt-3">
        <h3 className={RAIL_LABEL_CLASS}>크기</h3>
        <p className="mt-2 text-[0.9375rem] leading-snug text-text-primary">M</p>
        <p className="mt-1 text-[0.75rem] leading-snug text-text-tertiary">{PRODUCT_SIZE}</p>
      </div>

      <div className="mt-5 border-t border-border-subtle pt-3">
        <h3 className={RAIL_LABEL_CLASS}>방향</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-2.5 rounded-[2px] border border-[#a89068] bg-transparent px-3 pb-2.5 pt-3.5 text-text-primary dark:border-[#b7bcc2]">
            <span
              aria-hidden
              className={`border border-[#a89068] opacity-100 dark:border-[#b7bcc2] ${orientation === 'portrait' ? 'h-12 w-8' : 'h-8 w-12'}`}
            />
            <span className="text-[0.8125rem] leading-none">{orientation === 'portrait' ? '세로' : '가로'}</span>
            <span aria-hidden className="h-px w-8 bg-[#a89068] dark:bg-[#b7bcc2]" />
          </div>
        </div>
      </div>

      {isPreviewSubViewOpen ? null : (
        <div className="mt-5 border-t border-border-subtle pt-3">
          <h3 className={RAIL_LABEL_CLASS}>미리보기</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              ref={roomPreviewEntryRef}
              id="pdp-room-preview-entry"
              type="button"
              aria-haspopup="dialog"
              aria-label="내 공간에 걸어보기"
              className="focus-ring flex min-h-[4.5rem] flex-col items-start justify-between rounded-[2px] border border-border-subtle bg-transparent px-3 py-3 text-left text-[0.8125rem] leading-snug text-text-primary transition-colors duration-300 hover:border-[#c4b08a] dark:hover:border-[#9aa0a6]"
              onClick={() => setRoomPreviewOpen(true)}
            >
              <ImageIcon size={16} strokeWidth={1.5} aria-hidden />
              내 공간에 배치
            </button>
            <button
              type="button"
              aria-label="3D로 보기"
              className="focus-ring flex min-h-[4.5rem] flex-col items-start justify-between rounded-[2px] border border-border-subtle bg-transparent px-3 py-3 text-left text-[0.8125rem] leading-snug text-text-primary transition-colors duration-300 hover:border-[#c4b08a] disabled:text-text-tertiary dark:hover:border-[#9aa0a6]"
              disabled={!customProduct}
              onClick={() => setViewerOpen(true)}
            >
              <Box size={16} strokeWidth={1.5} aria-hidden />
              3D로 보기
            </button>
          </div>
        </div>
      )}

      <dl className="mt-5 border-t border-border-subtle">
        <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-3">
          <dt className={RAIL_LABEL_CLASS}>제작</dt>
          <dd className="text-[0.875rem] leading-snug text-text-primary">승인 후 3–5영업일</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-3">
          <dt className={RAIL_LABEL_CLASS}>배송</dt>
          <dd className="text-right text-[0.875rem] leading-snug text-text-primary">현재 무료배송</dd>
        </div>
      </dl>
    </div>
  );

  const workshopNotice = (
    <p className="text-[0.75rem] leading-snug text-text-tertiary">
      WORKSHOP은 고객이 제공한 이미지를 바탕으로 개별 제작됩니다. 이미지 검수 및 제작 승인 전에는 취소할 수 있으며, 제작 승인 이후에는 사전 안내 및 동의한 범위에서 단순변심에 의한 청약철회가 제한될 수 있습니다. 최종 시안을 다시 한번 확인해 주세요.
    </p>
  );

  return (
    <div
      className={`relative flex w-full flex-col overflow-x-hidden font-sans pointer-events-auto ${
        hideHeader ? 'h-full' : 'min-h-screen'
      }`}
      style={workshopSurfaceStyle(theme)}
      data-custom-preview-ready={previewUrl ? 'true' : 'false'}
    >
      <header className={`${hideHeader ? 'relative' : 'fixed top-0 left-0'} z-[100] h-16 w-full items-center border-b border-border-subtle bg-canvas px-4 max-[1099px]:h-auto max-[1099px]:px-0 max-[1099px]:pt-[env(safe-area-inset-top)] ${
        isPreviewSubViewOpen ? 'hidden' : 'flex'
      }`}>
        <div className="flex h-full w-full items-center max-[1099px]:relative max-[1099px]:h-14 max-[1099px]:px-3">
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

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
          <h1 className="text-[0.8125rem] leading-none text-text-secondary max-[1099px]:whitespace-nowrap">
            <span className="text-text-tertiary">{currentStep} / {totalSteps}</span>
            <span className="mx-2 text-text-tertiary" aria-hidden>·</span>
            {STEPS[currentStep - 1].title}
          </h1>
          <div className="h-px w-16 overflow-hidden bg-border-subtle" aria-hidden>
            <motion.div
              initial={false}
              animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="h-full bg-[#8b9197] dark:bg-[#d5d8dc]"
            />
          </div>
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
              className="w-full max-w-sm border border-border-subtle bg-canvas p-6 text-center"
            >
              <h3 className="type-section-title text-text-primary [word-break:keep-all]">이전에 작업한 이미지가 있습니다.</h3>
              <p className="type-supporting mt-2 text-text-secondary">불러오시겠습니까?</p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={handleStartNew}
                  className="focus-ring min-h-11 flex-1 rounded-[2px] border border-border-subtle type-label text-text-secondary"
                >
                  새로 시작
                </button>
                <button
                  type="button"
                  onClick={handleResume}
                  className="focus-ring min-h-11 flex-1 rounded-[2px] bg-text-primary type-label text-text-inverse"
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
              className="w-full max-w-sm border border-border-subtle bg-canvas p-6 text-center"
            >
              <h3 className="type-section-title text-text-primary [word-break:keep-all]">제작을 종료할까요?</h3>
              <p className="type-supporting mt-2 text-text-secondary [word-break:keep-all]">업로드한 이미지가 있습니다.</p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="focus-ring min-h-11 flex-1 rounded-[2px] border border-border-subtle type-label text-text-secondary"
                >
                  계속 제작
                </button>
                <button
                  type="button"
                  onClick={leaveWorkshop}
                  className="focus-ring min-h-11 flex-1 rounded-[2px] bg-text-primary type-label text-text-inverse"
                >
                  종료
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isRestoring ? (
        <div
          className="absolute inset-x-0 bottom-0 top-16 z-20 flex flex-col items-center justify-center gap-3 bg-canvas/80 max-[1099px]:top-[calc(3.5rem+env(safe-area-inset-top))]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-text-secondary" aria-hidden />
          <p className="type-supporting text-text-secondary">이전 작업을 불러오는 중</p>
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            ref={scrollContainerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain touch-pan-y min-[1100px]:flex-row min-[1100px]:overflow-hidden"
          >
            {currentStep === 1 && (
              <>
                <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col min-[1100px]:overflow-hidden max-[1099px]:flex-none max-[1099px]:shrink-0 ${isPreparingPreview ? 'pointer-events-none' : ''}`}>
                  {editPreview}
                </div>
                <aside className={`${WORKSHOP_RAIL_CLASS} py-5 min-[1100px]:py-5`}>
                  {productInfo}
                  <div className="mt-6 border-t border-border-subtle pt-3">
                    {sizeBlock}
                  </div>
                  <div className="mt-5 border-t border-border-subtle pt-3">
                    {orientationControls}
                  </div>
                  <div className="mt-5 border-t border-border-subtle pt-3">
                    <h3 className={RAIL_LABEL_CLASS}>이미지</h3>
                    {uploadedImage ? (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="focus-ring mt-2 text-[0.9375rem] leading-snug text-text-primary underline-offset-[5px] hover:underline disabled:opacity-50"
                      >
                        {isUploading ? '업로드 중...' : '사진 변경'}
                      </button>
                    ) : null}
                    <p className="mt-1.5 text-[0.75rem] leading-snug text-text-tertiary">
                      저작권 문제가 있는 이미지는 사용할 수 없습니다.
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept={SUPPORTED_IMAGE_ACCEPT}
                      className="sr-only"
                    />
                  </div>
                  {uploadedImage ? (
                    <>
                      <div className="mt-5 border-t border-border-subtle pt-3">
                        <h3 className={RAIL_LABEL_CLASS}>조정</h3>
                        <p className="mt-2 text-[0.9375rem] leading-snug text-text-primary">확대 / 축소</p>
                        <div className="mt-2">
                          <CustomCompositionControls
                            source={source}
                            composition={composition}
                            onZoom={setZoom}
                            qualityWarning={qualityWarning}
                          />
                        </div>
                      </div>
                      <div className="mt-5 border-t border-border-subtle pt-3">
                        <h3 className={RAIL_LABEL_CLASS}>품질 보정</h3>
                        <p className="mt-2 text-[0.9375rem] leading-snug text-text-primary">AI 업스케일</p>
                        <p className="mt-1 text-[0.75rem] leading-snug text-text-tertiary">
                          제작 전 이미지 품질을 자동 보정합니다.
                        </p>
                      </div>
                    </>
                  ) : null}
                  <div className="mt-5">
                    {renderPrimaryCta('panel')}
                  </div>
                </aside>
              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col min-[1100px]:overflow-hidden max-[1099px]:flex-none max-[1099px]:shrink-0">
                  {step2Canvas}
                </div>
                <aside className={isPreviewSubViewOpen ? 'hidden' : `${WORKSHOP_RAIL_CLASS} py-5 min-[1100px]:py-5`}>
                  {step2Facts}
                  <div className="mt-5 border-t border-border-subtle pt-3">
                    {workshopNotice}
                  </div>
                  <div className="mt-5">
                    {renderPrimaryCta('panel')}
                  </div>
                </aside>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className={`z-20 shrink-0 border-t border-border-subtle bg-canvas px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 max-[1099px]:pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
          isPreviewSubViewOpen ? 'hidden' : 'min-[1100px]:hidden'
        }`}
      >
        {renderPrimaryCta('mobile')}
      </div>

      <AnimatePresence>
        {isFlashing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`pointer-events-none fixed inset-0 z-[10002] ${theme === 'dark' ? 'bg-[#101114]' : 'bg-[#f6f4ef]'}`}
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
      <LoginModal
        isOpen={isLoginOpen}
        redirectUrl={safeInternalPath(`${location.pathname}${location.search}`)}
        onClose={() => {
          setIsLoginOpen(false);
          if (!userRef.current) continueAddAfterLoginRef.current = false;
        }}
        onSuccess={() => setIsLoginOpen(false)}
      />
    </div>
  );
}
