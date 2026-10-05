import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Save, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Product, ProductOption } from '../../data/products';
import { useToast } from '../../context/ToastContext';
import { resizeImageVariant, VARIANT_RESIZE_PRESETS } from '../../lib/imageDerivatives';
import { supabase } from '../../lib/supabase';
import {
  CATALOG_M_DIMENSION,
  CATALOG_M_NAME,
  CATALOG_M_SIZE_LABEL,
} from '../pdp/catalogSizeLabel';

interface AdminProductFormProps {
  product?: Product | null;
  onSave: () => Promise<void>;
  onClose: () => void;
}

type SizePreset = '' | 'M';
type SaleStatus = 'on_sale' | 'sold_out';

function createOptionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

const MULTI_OPTION_BLOCKED = 'MULTI_OPTION_BLOCKED';

function hasMultipleOptions(options: ProductOption[] | undefined): boolean {
  return (options?.length ?? 0) > 1;
}

function optionSaleLabel(option: ProductOption): string {
  return option.isActive === false ? '품절' : '판매중';
}

function buildSavedOptions(
  existing: ProductOption[] | undefined,
  values: { price: number; stock: number; isActive: boolean },
): ProductOption[] {
  if (hasMultipleOptions(existing)) {
    throw new Error(MULTI_OPTION_BLOCKED);
  }
  const current = existing?.[0];
  return [{
    id: current?.id || createOptionId(),
    name: CATALOG_M_NAME,
    dimension: CATALOG_M_DIMENSION,
    price: values.price,
    stock: values.stock,
    isActive: values.isActive,
  }];
}

export default function AdminProductForm({ product, onSave, onClose }: AdminProductFormProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFrontUploading, setIsFrontUploading] = useState(false);
  const [isBackUploading, setIsBackUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sizePreset, setSizePreset] = useState<SizePreset>('');
  const [priceDraft, setPriceDraft] = useState('');
  const [stockDraft, setStockDraft] = useState('');
  const [saleStatus, setSaleStatus] = useState<SaleStatus>('on_sale');
  const frontUploadIdRef = useRef(0);
  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    subtitle: '',
    description: '',
    image: '',
    backImage: '',
    landscape_image: '',
    landscape_back_image: '',
    supported_orientations: ['portrait'],
    limited: false,
    is_visible: true,
    options: [],
  });

  useEffect(() => {
    if (product) {
      const options = product.options || [];
      const primary = options.length === 1 ? options[0] : undefined;
      setFormData({
        ...product,
        subtitle: product.subtitle || product.artist || '',
        image: product.front_image || product.image || '',
        backImage: product.back_image || product.backImage || '',
        landscape_image: product.landscape_image || '',
        landscape_back_image: product.landscape_back_image || '',
        supported_orientations: product.supported_orientations || ['portrait'],
        options,
        is_visible: product.is_visible !== false,
        description: product.description || '',
      });
      setSizePreset(primary ? 'M' : '');
      setPriceDraft(primary && typeof primary.price === 'number' ? String(primary.price) : '');
      setStockDraft(primary && typeof primary.stock === 'number' ? String(primary.stock) : '');
      setSaleStatus(primary?.isActive === false ? 'sold_out' : 'on_sale');
    } else {
      setFormData({
        title: '',
        subtitle: '',
        description: '',
        image: '',
        backImage: '',
        landscape_image: '',
        landscape_back_image: '',
        supported_orientations: ['portrait'],
        limited: false,
        is_visible: true,
        options: [],
      });
      setSizePreset('');
      setPriceDraft('');
      setStockDraft('');
      setSaleStatus('on_sale');
    }
    setError(null);
  }, [product]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'image' | 'backImage',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError('이미지 파일 크기는 50MB 이하여야 합니다. 고화질 원본 업로드를 위해 파일 용량을 확인해주세요.');
      return;
    }

    const setUploading = field === 'image' ? setIsFrontUploading : setIsBackUploading;
    setUploading(true);
    setError(null);

    const uploadId = field === 'image' ? ++frontUploadIdRef.current : 0;
    const uploadTimeout = setTimeout(() => {
      setUploading(false);
      setError('스토리지 업로드 시간이 초과되었습니다. (15분 초과) 대용량 파일의 경우 네트워크 환경에 따라 오래 걸릴 수 있습니다. 인터넷 연결을 확인해주세요.');
      showToast('업로드 시간 초과', 'error');
    }, 900000);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${field}.${fileExt}`;

      if (field === 'image') {
        const stem = fileName.replace(/\.[^.]+$/, '');
        const derivativeFailures: string[] = [];
        let thumbBlob: Blob | null = null;
        let mediumBlob: Blob | null = null;

        try {
          thumbBlob = await resizeImageVariant(file, VARIANT_RESIZE_PRESETS.thumb);
        } catch (resizeErr) {
          console.warn('Front thumb resize failed:', resizeErr);
          derivativeFailures.push('thumb');
        }
        try {
          mediumBlob = await resizeImageVariant(file, VARIANT_RESIZE_PRESETS.medium);
        } catch (resizeErr) {
          console.warn('Front medium resize failed:', resizeErr);
          derivativeFailures.push('medium');
        }

        const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file);
        if (uploadError) throw new Error('이미지 업로드 실패: ' + uploadError.message);

        if (thumbBlob) {
          const { error: thumbUploadError } = await supabase.storage
            .from('products')
            .upload(`${stem}__thumb.webp`, thumbBlob, { contentType: 'image/webp' });
          if (thumbUploadError) {
            console.warn('Front thumb upload failed:', thumbUploadError);
            derivativeFailures.push('thumb');
          }
        }
        if (mediumBlob) {
          const { error: mediumUploadError } = await supabase.storage
            .from('products')
            .upload(`${stem}__medium.webp`, mediumBlob, { contentType: 'image/webp' });
          if (mediumUploadError) {
            console.warn('Front medium upload failed:', mediumUploadError);
            derivativeFailures.push('medium');
          }
        }

        if (uploadId !== frontUploadIdRef.current) return;
        const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
        setFormData((prev) => ({ ...prev, image: publicUrl }));
        showToast('앞면 이미지가 성공적으로 업로드되었습니다.', 'success');
        if ([...new Set(derivativeFailures)].length > 0) {
          showToast('원본은 업로드됐지만 최적화 이미지 일부 생성에 실패했습니다.', 'info');
        }
        return;
      }

      const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file);
      if (uploadError) throw new Error('이미지 업로드 실패: ' + uploadError.message);
      const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
      setFormData((prev) => ({ ...prev, backImage: publicUrl }));
      showToast('3D 뷰어 뒷면 이미지가 성공적으로 업로드되었습니다.', 'success');
    } catch (err) {
      console.error(`Error uploading ${field}:`, err);
      if (field === 'image' && uploadId !== frontUploadIdRef.current) return;
      setError(err instanceof Error ? err.message : '이미지 업로드 중 오류가 발생했습니다.');
      showToast('업로드 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'), 'error');
    } finally {
      clearTimeout(uploadTimeout);
      if (field !== 'image' || uploadId === frontUploadIdRef.current) {
        setUploading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const failSafeTimeout = setTimeout(() => {
      setIsSubmitting(false);
      setError('요청 시간 초과. 네트워크나 DB 컬럼/Storage 설정을 확인하세요.');
    }, 15000);

    try {
      setIsSubmitting(true);
      setError(null);

      if (hasMultipleOptions(formData.options)) {
        setError('추가 판매 옵션이 감지되어 저장할 수 없습니다.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }

      if (!String(formData.title ?? '').trim()) {
        setError('상품명을 입력해 주세요.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }
      if (!formData.image) {
        setError('앞면 이미지를 등록해 주세요.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }
      if (sizePreset !== 'M') {
        setError('규격을 선택해 주세요.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }

      const price = parseNonNegativeInt(priceDraft);
      if (price === null) {
        setError('가격은 0 이상의 정수 원화로 입력해 주세요.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }

      const stock = parseNonNegativeInt(stockDraft);
      if (stock === null) {
        setError('재고는 0 이상의 정수로 입력해 주세요.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }

      const isActive = saleStatus === 'on_sale';
      if (isActive && stock < 1) {
        setError('판매중으로 저장하려면 재고를 1 이상 입력해 주세요.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }

      let savedOptions: ProductOption[];
      try {
        savedOptions = buildSavedOptions(formData.options, { price, stock, isActive });
      } catch (optionError) {
        if (optionError instanceof Error && optionError.message === MULTI_OPTION_BLOCKED) {
          setError('추가 판매 옵션이 감지되어 저장할 수 없습니다.');
          setIsSubmitting(false);
          clearTimeout(failSafeTimeout);
          return;
        }
        throw optionError;
      }
      if (savedOptions.length !== 1) {
        setError('상품은 단일 M 규격만 저장할 수 있습니다.');
        setIsSubmitting(false);
        clearTimeout(failSafeTimeout);
        return;
      }

      const payload: Record<string, unknown> = {
        title: formData.title.trim(),
        subtitle: String(formData.subtitle ?? '').trim() || null,
        description: String(formData.description ?? '').trim() || null,
        front_image: formData.image || null,
        back_image: formData.backImage || null,
        landscape_image: formData.landscape_image || null,
        landscape_back_image: formData.landscape_back_image || null,
        supported_orientations: formData.supported_orientations?.length
          ? formData.supported_orientations
          : ['portrait'],
        is_limited: formData.limited || false,
        options: savedOptions,
        is_visible: formData.is_visible !== false,
      };

      if (product?.id) {
        payload.id = product.id;
      }

      const { data, error: dbError } = await supabase
        .from('products')
        .upsert([payload])
        .select();

      if (dbError) throw new Error('DB 저장 실패: ' + dbError.message);
      if (!data || data.length === 0) throw new Error('DB에 데이터가 기록되지 않았습니다.');

      showToast(product ? '상품 정보가 성공적으로 수정되었습니다!' : '신규 상품이 성공적으로 등록되었습니다!', 'success');
      await onSave();
      onClose();
    } catch (err) {
      console.error('상품 등록 치명적 에러:', err);
      const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.';
      setError(message);
      showToast('오류 발생: ' + message, 'error');
    } finally {
      clearTimeout(failSafeTimeout);
      setIsSubmitting(false);
    }
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  const busy = isSubmitting || isFrontUploading || isBackUploading;
  const existingOptions = formData.options ?? [];
  const isMultiOption = hasMultipleOptions(existingOptions);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] bg-[#121212] flex flex-col h-[100dvh]">
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pt-2 px-6 md:px-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="relative w-full max-w-3xl mx-auto will-change-transform flex flex-col h-auto"
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="fixed top-4 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90 z-[10000]"
          >
            <X size={24} aria-hidden="true" />
          </button>

          <div className="flex justify-between items-center py-4 border-b border-white/5 bg-[#121212] relative">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                {product ? <RefreshCw className="text-indigo-400" size={24} aria-hidden="true" /> : <Save className="text-indigo-400" size={24} aria-hidden="true" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {product ? '상품 정보 수정' : '신규 상품 등록'}
                </h2>
                <p className="text-xs text-zinc-500 font-medium mt-0.5 tracking-tight">
                  {product ? `ID: ${product.id}` : '스토어 상품을 등록합니다.'}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-medium" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 py-8 space-y-8">
            <section className="bg-[#1C1C1E] p-6 rounded-2xl border border-white/5 space-y-5">
              <h3 className="text-lg font-bold text-white">기본 정보</h3>
              <div>
                <label htmlFor="admin-product-title" className="block text-sm font-medium text-zinc-400 mb-2">상품명</label>
                <input
                  id="admin-product-title"
                  type="text"
                  name="title"
                  value={formData.title || ''}
                  onChange={handleChange}
                  className="w-full h-12 bg-zinc-900 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:border-white/20"
                  placeholder="상품명"
                />
              </div>
              <div>
                <label htmlFor="admin-product-subtitle" className="block text-sm font-medium text-zinc-400 mb-2">부가 문구</label>
                <input
                  id="admin-product-subtitle"
                  type="text"
                  name="subtitle"
                  value={formData.subtitle || ''}
                  onChange={handleChange}
                  className="w-full h-12 bg-zinc-900 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:border-white/20"
                  placeholder="선택"
                  aria-describedby="admin-product-subtitle-help"
                />
                <p id="admin-product-subtitle-help" className="mt-2 text-xs text-zinc-500">
                  상품 상세 제목 아래와 홈 마퀴 호버에 표시됩니다.
                </p>
              </div>
            </section>

            <section className="bg-[#1C1C1E] p-6 rounded-2xl border border-white/5 space-y-6">
              <h3 className="text-lg font-bold text-white">이미지</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="admin-product-front-image" className="block text-sm font-medium text-zinc-400 mb-2">앞면 이미지</label>
                  <div className="relative aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border border-dashed border-zinc-700">
                    {isFrontUploading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
                        <Loader2 size={28} className="text-indigo-500 animate-spin mb-2" aria-hidden="true" />
                        <span className="text-xs text-white">업로드 중...</span>
                      </div>
                    )}
                    {formData.image ? (
                      <img src={formData.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                        <ImageIcon size={36} className="mb-2 opacity-40" aria-hidden="true" />
                        <span className="text-sm">앞면 이미지 업로드</span>
                      </div>
                    )}
                    <input
                      id="admin-product-front-image"
                      type="file"
                      accept="image/*"
                      onChange={(event) => { void handleImageChange(event, 'image'); }}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      disabled={isFrontUploading}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="admin-product-back-image" className="block text-sm font-medium text-zinc-400 mb-2">뒷면 이미지</label>
                  <div className="relative aspect-[3/4] bg-zinc-900 rounded-xl overflow-hidden border border-dashed border-zinc-700">
                    {isBackUploading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
                        <Loader2 size={28} className="text-indigo-500 animate-spin mb-2" aria-hidden="true" />
                        <span className="text-xs text-white">업로드 중...</span>
                      </div>
                    )}
                    {formData.backImage ? (
                      <img src={formData.backImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 pointer-events-none">
                        <Upload size={36} className="mb-2 opacity-40" aria-hidden="true" />
                        <span className="text-sm">선택</span>
                      </div>
                    )}
                    <input
                      id="admin-product-back-image"
                      type="file"
                      accept="image/*"
                      onChange={(event) => { void handleImageChange(event, 'backImage'); }}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      disabled={isBackUploading}
                      aria-describedby="admin-product-back-image-help"
                    />
                  </div>
                  <p id="admin-product-back-image-help" className="mt-2 text-xs text-zinc-500">
                    3D 뷰어의 뒷면 이미지입니다. 스토리/실물 후면과는 별개입니다.
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-[#1C1C1E] p-6 rounded-2xl border border-white/5 space-y-5">
              <h3 className="text-lg font-bold text-white">판매 옵션</h3>
              {isMultiOption ? (
                <div className="space-y-4" role="alert">
                  <p className="text-sm text-red-400 leading-relaxed">
                    추가 판매 옵션이 감지되었습니다.
                    <br />
                    현재 관리자 상품 관리는 단일 M 규격만 지원합니다.
                    <br />
                    기존 추가 옵션을 확인하기 전에는 이 상품을 저장할 수 없습니다.
                  </p>
                  <ul className="space-y-2">
                    {existingOptions.map((option, index) => (
                      <li key={option.id || `option-${index}`} className="text-sm text-zinc-300 bg-zinc-900 border border-white/5 rounded-xl px-4 py-3">
                        <p>{option.name || '이름 없음'} · {option.dimension || '크기 없음'}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          ₩{Number(option.price || 0).toLocaleString('ko-KR')} · 재고 {typeof option.stock === 'number' ? option.stock : '없음'} · {optionSaleLabel(option)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
              <div>
                <label htmlFor="admin-product-size" className="block text-sm font-medium text-zinc-400 mb-2">규격 선택</label>
                <select
                  id="admin-product-size"
                  value={sizePreset}
                  onChange={(event) => {
                    setSizePreset(event.target.value === 'M' ? 'M' : '');
                    setError(null);
                  }}
                  className="w-full h-12 bg-zinc-900 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:border-white/20"
                >
                  <option value="">규격을 선택하세요</option>
                  <option value="M">{CATALOG_M_SIZE_LABEL}</option>
                </select>
              </div>
              <div>
                <label htmlFor="admin-product-price" className="block text-sm font-medium text-zinc-400 mb-2">가격</label>
                <div className="flex items-center gap-2">
                  <input
                    id="admin-product-price"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={priceDraft}
                    onChange={(event) => {
                      setPriceDraft(event.target.value);
                      setError(null);
                    }}
                    className="w-full h-12 bg-zinc-900 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:border-white/20"
                    placeholder="원"
                  />
                  <span className="text-sm text-zinc-500 shrink-0">원</span>
                </div>
              </div>
              <fieldset>
                <legend className="block text-sm font-medium text-zinc-400 mb-2">판매 상태</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="판매 상태">
                  <label className={`min-h-11 px-4 rounded-xl border inline-flex items-center cursor-pointer ${saleStatus === 'on_sale' ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-300 border-white/10'}`}>
                    <input
                      type="radio"
                      name="admin-product-sale-status"
                      className="sr-only"
                      checked={saleStatus === 'on_sale'}
                      onChange={() => setSaleStatus('on_sale')}
                    />
                    판매중
                  </label>
                  <label className={`min-h-11 px-4 rounded-xl border inline-flex items-center cursor-pointer ${saleStatus === 'sold_out' ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-300 border-white/10'}`}>
                    <input
                      type="radio"
                      name="admin-product-sale-status"
                      className="sr-only"
                      checked={saleStatus === 'sold_out'}
                      onChange={() => setSaleStatus('sold_out')}
                    />
                    품절
                  </label>
                </div>
              </fieldset>
              <div>
                <label htmlFor="admin-product-stock" className="block text-sm font-medium text-zinc-400 mb-2">재고</label>
                <input
                  id="admin-product-stock"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={stockDraft}
                  onChange={(event) => {
                    setStockDraft(event.target.value);
                    setError(null);
                  }}
                  className="w-40 h-12 bg-zinc-900 border border-white/5 rounded-xl px-4 text-white focus:outline-none focus:border-white/20"
                  aria-describedby="admin-product-stock-help"
                />
                <p id="admin-product-stock-help" className="mt-2 text-xs text-zinc-500">
                  스토어는 재고가 1 이상이고 판매중일 때만 구매할 수 있습니다. 값을 자동으로 넣지 않습니다.
                </p>
              </div>
                </>
              )}
            </section>

            <section className="bg-[#1C1C1E] p-6 rounded-2xl border border-white/5">
              <h3 className="text-lg font-bold text-white mb-4">배지</h3>
              <label htmlFor="admin-product-limited" className="inline-flex items-center gap-3 min-h-11 cursor-pointer">
                <input
                  id="admin-product-limited"
                  type="checkbox"
                  name="limited"
                  checked={Boolean(formData.limited)}
                  onChange={(event) => setFormData((prev) => ({ ...prev, limited: event.target.checked }))}
                  className="w-5 h-5 rounded bg-zinc-800 border-zinc-700 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-white">한정판</span>
              </label>
            </section>

            <details className="bg-[#1C1C1E] p-6 rounded-2xl border border-white/5">
              <summary className="text-lg font-bold text-white cursor-pointer">고급 설정</summary>
              <div className="mt-5">
                <label htmlFor="admin-product-seo-description" className="block text-sm font-medium text-zinc-400 mb-2">SEO 설명</label>
                <textarea
                  id="admin-product-seo-description"
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  rows={4}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/20 resize-y"
                  aria-describedby="admin-product-seo-description-help"
                />
                <p id="admin-product-seo-description-help" className="mt-2 text-xs text-zinc-500">
                  검색/메타/JSON-LD에만 사용됩니다. 상품 상세 본문이 아닙니다.
                </p>
              </div>
            </details>
          </form>
        </motion.div>
        </div>

          <div className="shrink-0 py-4 px-6 md:px-10 bg-[#1C1C1E] border-t border-white/5 z-[100] flex justify-end items-center gap-4">
            <button
              type="button"
              onClick={handleClose}
              className="w-32 h-11 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white font-bold text-sm"
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={busy || isMultiOption}
              className="w-40 h-11 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  {isSubmitting ? '저장 중...' : '업로드 중...'}
                </>
              ) : (
                <>
                  <Save size={18} aria-hidden="true" />
                  {product ? '수정사항 저장' : '상품 등록하기'}
                </>
              )}
            </button>
          </div>
      </div>
    </AnimatePresence>
  );
}
