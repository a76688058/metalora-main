import React, { useState, useEffect } from 'react';
import { Product, ProductOption } from '../../data/products';
import { X, Upload, Image as ImageIcon, Save, Loader2, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

interface AdminProductFormProps {
  product?: Product | null;
  onSave: () => Promise<void>;
  onClose: () => void;
}

export default function AdminProductForm({ product, onSave, onClose }: AdminProductFormProps) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFrontUploading, setIsFrontUploading] = useState(false);
  const [isBackUploading, setIsBackUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    artist: '',
    description: '',
    image: '',
    backImage: '',
    limited: false,
    is_visible: true,
    options: [],
  });

  useEffect(() => {
    if (product) {
      setFormData({
        ...product,
        artist: product.subtitle || product.artist || '',
        image: product.front_image || product.image || '',
        backImage: product.back_image || product.backImage || '',
        options: product.options || [],
        is_visible: product.is_visible !== false,
      });
    } else {
      setFormData(prev => ({
        ...prev,
        options: [
          { id: Date.now().toString(), name: 'A4', dimension: '21 x 29.7 cm', price: 0, stock: 999, isActive: true }
        ]
      }));
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
    const { name, value, type } = e.target;
    if (type === 'number') {
      setFormData((prev) => ({ ...prev, [name]: Number(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setError(null);
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleOptionChange = (id: string, field: keyof ProductOption, value: any) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.map(opt => opt.id === id ? { ...opt, [field]: value } : opt)
    }));
  };

  const addOption = () => {
    setFormData(prev => ({
      ...prev,
      options: [
        ...(prev.options || []),
        { id: Date.now().toString(), name: 'A4', dimension: '21 x 29.7 cm', price: 0, stock: 999, isActive: true }
      ]
    }));
  };

  const removeOption = (id: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options?.filter(opt => opt.id !== id)
    }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'image' | 'backImage') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 50MB Limit for high-quality uploads
    if (file.size > 50 * 1024 * 1024) {
      setError('이미지 파일 크기는 50MB 이하여야 합니다. 고화질 원본 업로드를 위해 파일 용량을 확인해주세요.');
      return;
    }

    const setUploading = field === 'image' ? setIsFrontUploading : setIsBackUploading;
    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${field}.${fileExt}`;
      
      // Direct upload to storage bucket
      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(fileName, file);

      if (uploadError) throw new Error("이미지 업로드 실패: " + uploadError.message);
      
      const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
      
      setFormData((prev) => ({ ...prev, [field]: publicUrl }));
      showToast(`${field === 'image' ? '앞면' : '뒷면'} 이미지가 성공적으로 업로드되었습니다.`, 'success');
    } catch (err) {
      console.error(`Error uploading ${field}:`, err);
      setError(err instanceof Error ? err.message : '이미지 업로드 중 오류가 발생했습니다.');
      showToast("업로드 실패: " + (err instanceof Error ? err.message : '알 수 없는 오류'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault(); // Form 제출 방어
    
    // ★ 방어막 1: 15초 이상 통신이 지연/정지되면 무조건 로딩 해제 (강제 타임아웃)
    const failSafeTimeout = setTimeout(() => {
      setIsSubmitting(false);
      setError("요청 시간 초과. 네트워크나 DB 컬럼/Storage 설정을 확인하세요.");
    }, 15000);

    try {
      setIsSubmitting(true);
      setError(null);

        // 2. DB Insert Payload 강제 매핑 (SQL 컬럼명과 100% 일치 필수)
        // 주의: 확실히 있는 컬럼만 넣을 것.
        const payload: any = {
          title: formData.title,
          subtitle: formData.artist || null,
          description: formData.description || null,
          front_image: formData.image || null,
          back_image: formData.backImage || null,
          is_limited: formData.limited || false,
          options: formData.options?.map(opt => ({
            ...opt,
            stock: opt.stock || 999 // Ensure stock has a default value
          })) || [],
          is_visible: formData.is_visible !== false
        };

      if (product?.id) {
        payload.id = product.id;
      }

      // 3. DB 저장 및 검증 (.select() 필수)
      const { data, error: dbError } = await supabase
        .from('products')
        .upsert([payload])
        .select();
      
      if (dbError) throw new Error("DB 저장 실패: " + dbError.message);
      if (!data || data.length === 0) throw new Error("DB에 데이터가 기록되지 않았습니다.");

      showToast(product ? "상품 정보가 성공적으로 수정되었습니다!" : "신규 상품이 성공적으로 등록되었습니다!", 'success');
      
      // 부모 컴포넌트의 새로고침 로직 유도
      await onSave();
      
      onClose(); // 성공 시에만 모달 닫기
    } catch (err) {
      console.error("상품 등록 치명적 에러:", err);
      const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.';
      setError(message);
      showToast("오류 발생: " + message, 'error');
    } finally {
      clearTimeout(failSafeTimeout); // 타임아웃 해제
      setIsSubmitting(false); // ★ 무한 로딩 강제 종료
    }
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 w-screen h-screen h-[100dvh] z-[9999] bg-[#121212] flex flex-col overflow-y-auto custom-scrollbar pt-2 px-6 pb-40 md:px-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative w-full max-w-5xl mx-auto will-change-transform flex flex-col h-auto"
        >
          <button
            onClick={handleClose}
            className="fixed top-4 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90 z-[10000]"
          >
            <X size={24} />
          </button>

          {/* 헤더 */}
          <div className="flex justify-between items-center py-4 border-b border-white/5 bg-[#121212] relative">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                {product ? <RefreshCw className="text-indigo-400" size={24} /> : <Save className="text-indigo-400" size={24} />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {product ? '상품 정보 수정' : '신규 상품 등록'}
                </h2>
                <p className="text-xs text-zinc-500 font-medium mt-0.5 tracking-tight">
                  {product ? `ID: ${product.id} • 마지막 수정: ${new Date().toLocaleDateString()}` : '새로운 메탈 포스터 상품을 등록합니다.'}
                </p>
              </div>
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-8 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-base font-bold flex items-center gap-3 tracking-tight">
              <span className="font-black">오류:</span> {error}
            </div>
          )}

          {/* 폼 본문 */}
          <div className="flex-1 py-10 space-y-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
              {/* 왼쪽: 이미지 업로드 (양면) */}
              <div className="lg:col-span-5 space-y-10">
                <div className="bg-[#1C1C1E] p-8 rounded-[32px] border border-white/5">
                  <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3 tracking-tight">
                    <ImageIcon size={24} className="text-indigo-400" />
                    디자인 에셋
                  </h3>
                  
                  <div className="space-y-8">
                    {/* 앞면 이미지 */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-4 uppercase tracking-widest ml-1">Front Design (앞면)</label>
                      <div className="relative aspect-[3/4] bg-zinc-900 rounded-2xl overflow-hidden border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 transition-all group">
                        {isFrontUploading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
                            <Loader2 size={40} className="text-indigo-500 animate-spin mb-3" />
                            <span className="text-sm text-white font-bold animate-pulse">고화질 이미지 업로드 중...</span>
                          </div>
                        ) : null}
                        
                        {formData.image ? (
                          <>
                            <img src={formData.image} alt="Front Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <Upload className="text-white mb-2" size={32} />
                              <span className="text-sm text-white font-bold tracking-tight">이미지 변경</span>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                            <ImageIcon size={56} className="mb-4 opacity-20" />
                            <span className="text-base font-bold tracking-tight">앞면 이미지 업로드</span>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageChange(e, 'image')}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          disabled={isFrontUploading}
                        />
                      </div>
                    </div>

                    {/* 뒷면 이미지 */}
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-4 uppercase tracking-widest ml-1">Back Design (뒷면)</label>
                      <div className="relative aspect-[3/4] bg-zinc-900 rounded-2xl overflow-hidden border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 transition-all group">
                        {isBackUploading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
                            <Loader2 size={40} className="text-indigo-500 animate-spin mb-3" />
                            <span className="text-sm text-white font-bold animate-pulse">고화질 이미지 업로드 중...</span>
                          </div>
                        ) : null}

                        {formData.backImage ? (
                          <>
                            <img src={formData.backImage} alt="Back Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <Upload className="text-white mb-2" size={32} />
                              <span className="text-sm text-white font-bold tracking-tight">이미지 변경</span>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                            <ImageIcon size={56} className="mb-4 opacity-20" />
                            <span className="text-base font-bold tracking-tight">뒷면 이미지 업로드 (선택)</span>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageChange(e, 'backImage')}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          disabled={isBackUploading}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 상세 정보 및 설정 */}
              <div className="lg:col-span-7 space-y-12">
                {/* 기본 정보 */}
                <div className="grid grid-cols-2 gap-8">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-zinc-500 mb-3 ml-1 uppercase tracking-widest">상품명</label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title || ''}
                      onChange={handleChange}
                      className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-white focus:outline-none focus:border-white/20 transition-all placeholder:text-zinc-700 text-lg tracking-tight"
                      placeholder="예: Neon Genesis"
                      required
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-bold text-zinc-500 mb-3 ml-1 uppercase tracking-widest">작가명</label>
                    <input
                      type="text"
                      name="artist"
                      value={formData.artist || ''}
                      onChange={handleChange}
                      className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-white focus:outline-none focus:border-white/20 transition-all placeholder:text-zinc-700 text-lg tracking-tight"
                      placeholder="예: CyberPunk Lab"
                      required
                    />
                  </div>
                </div>

                {/* 설명 */}
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-3 ml-1 uppercase tracking-widest">상품 설명</label>
                  <textarea
                    name="description"
                    value={formData.description || ''}
                    onChange={handleChange}
                    rows={5}
                    className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-5 text-white focus:outline-none focus:border-white/20 transition-all resize-none leading-relaxed placeholder:text-zinc-700 text-lg tracking-tight"
                    placeholder="작품에 대한 상세한 설명을 입력하세요..."
                    required
                  />
                </div>

                {/* 재고 및 품절 관리 */}
                <div className="bg-[#1C1C1E] p-8 rounded-[32px] border border-white/5">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3 tracking-tight">
                      <div className="w-2 h-8 bg-indigo-500 rounded-full" />
                      상품 옵션
                    </h3>
                    <button
                      type="button"
                      onClick={addOption}
                      className="flex items-center gap-2 px-5 py-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl text-sm font-bold hover:bg-indigo-500/20 transition-all active:scale-95 tracking-tight"
                    >
                      <Plus size={18} />
                      옵션 추가
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    {formData.options?.map((option, index) => (
                      <div key={option.id} className="bg-black/40 p-6 rounded-2xl border border-white/5 flex flex-col gap-6 relative group">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black text-zinc-700 uppercase tracking-[0.2em]">OPTION {index + 1}</span>
                          <div className="flex items-center gap-5">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={option.isActive}
                                onChange={(e) => handleOptionChange(option.id, 'isActive', e.target.checked)}
                                className="rounded-full bg-zinc-800 border-zinc-700 text-indigo-500 focus:ring-indigo-500 w-5 h-5"
                              />
                              <span className={`text-sm font-bold tracking-tight ${option.isActive ? 'text-indigo-400' : 'text-zinc-600'}`}>
                                {option.isActive ? '판매중' : '숨김'}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => removeOption(option.id)}
                              className="text-zinc-700 hover:text-red-500 transition-colors p-1.5 bg-white/5 rounded-full"
                              title="옵션 삭제"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-zinc-600 mb-1.5 ml-1 uppercase tracking-widest">옵션명</label>
                            <input
                              type="text"
                              value={option.name}
                              onChange={(e) => handleOptionChange(option.id, 'name', e.target.value)}
                              className="w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-4 text-white text-base focus:outline-none focus:border-white/20 transition-colors tracking-tight"
                              placeholder="예: A4"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-zinc-600 mb-1.5 ml-1 uppercase tracking-widest">크기</label>
                            <input
                              type="text"
                              value={option.dimension}
                              onChange={(e) => handleOptionChange(option.id, 'dimension', e.target.value)}
                              className="w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-4 text-white text-base focus:outline-none focus:border-white/20 transition-colors tracking-tight"
                              placeholder="예: 21 x 29.7 cm"
                            />
                          </div>
                          <div className="col-span-2 lg:col-span-1 space-y-2">
                            <label className="block text-[11px] font-bold text-zinc-600 mb-1.5 ml-1 uppercase tracking-widest">가격 (₩)</label>
                            <input
                              type="number"
                              value={option.price}
                              onChange={(e) => handleOptionChange(option.id, 'price', Number(e.target.value))}
                              className="w-full h-14 bg-[#1C1C1E] border border-white/5 rounded-xl px-4 text-white text-base focus:outline-none focus:border-white/20 transition-colors font-mono"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {(!formData.options || formData.options.length === 0) && (
                      <div className="text-center py-12 text-zinc-700 text-base border-2 border-dashed border-zinc-800 rounded-2xl font-bold tracking-tight">
                        등록된 옵션이 없습니다. 옵션을 추가해주세요.
                      </div>
                    )}
                  </div>
                </div>

                {/* 배지 설정 */}
                <div className="flex flex-wrap gap-5 p-8 bg-[#1C1C1E] rounded-[32px] border border-white/5">
                  <label className={`flex items-center gap-4 px-6 py-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-95 ${formData.limited ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-transparent border-white/5 hover:bg-zinc-800'}`}>
                    <input
                      type="checkbox"
                      name="limited"
                      checked={formData.limited}
                      onChange={handleCheckboxChange}
                      className="rounded-full bg-zinc-800 border-zinc-700 text-yellow-500 focus:ring-yellow-500 w-6 h-6"
                    />
                    <span className={`text-base font-bold tracking-tight ${formData.limited ? 'text-yellow-400' : 'text-zinc-600'}`}>한정판 (Limited)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 푸터 (액션 버튼) - 고정 하단 바 */}
          <div className="fixed bottom-0 left-0 right-0 py-4 px-6 md:px-10 bg-[#1C1C1E] border-t border-white/5 z-[100] flex justify-end items-center gap-4">
            <button
              onClick={handleClose}
              className="w-32 h-11 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition-all font-bold text-sm tracking-tight"
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isFrontUploading || isBackUploading}
              className="w-40 h-11 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 text-sm tracking-tight"
            >
              {isSubmitting || isFrontUploading || isBackUploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {isSubmitting ? '저장 중...' : '업로드 중...'}
                </>
              ) : (
                <>
                  <Save size={18} />
                  {product ? '수정사항 저장' : '상품 등록하기'}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
