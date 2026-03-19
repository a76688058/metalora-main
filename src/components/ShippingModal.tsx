import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface ShippingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ShippingModal({ isOpen, onClose, onSuccess }: ShippingModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({
    shipping_name: '',
    shipping_phone: '',
    zip_code: '',
    address: '',
    address_detail: '',
  });
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const detailAddressRef = useRef<HTMLInputElement>(null);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = 'daum-postcode-script';
    if (document.getElementById(scriptId)) {
      setIsScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.onload = () => setIsScriptLoaded(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleOpenPostcode = () => {
    if (!(window as any).daum || !(window as any).daum.Postcode) return;
    setIsPostcodeOpen(true);

    setTimeout(() => {
      if (!postcodeContainerRef.current) return;
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

          setFormData(prev => ({
            ...prev,
            zip_code: data.zonecode,
            address: fullAddress,
          }));

          setIsPostcodeOpen(false);
          setTimeout(() => {
            detailAddressRef.current?.focus();
          }, 100);
        },
        width: '100%',
        height: '100%',
      }).embed(postcodeContainerRef.current);
    }, 0);
  };

  useEffect(() => {
    const fetchShippingInfo = async () => {
      if (!supabase) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (error) throw error;

        if (data) {
          // 실제 컴포넌트에서 사용하는 상태 변수(State) 업데이트 함수로 정확히 맵핑할 것
          setFormData(prev => ({
            ...prev,
            shipping_name: data.shipping_name || data.full_name || '',
            shipping_phone: data.shipping_phone || data.phone_number || '',
            zip_code: data.zip_code || '',
            address: data.address || '',
            address_detail: data.address_detail || '',
          }));
        }
      } catch (err: any) {
        console.error("데이터 바인딩 실패:", err.message);
      }
    };
    
    // 모달이 열려있을 때만 데이터를 불러오도록 제어
    if (isOpen) {
      fetchShippingInfo();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setErrorMsg('');

      // 1. 유저 세션 확실하게 가져오기 (비동기 지연 방지)
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session?.user) throw new Error("로그인 세션이 유효하지 않습니다.");
      const userId = session.user.id;

      // 2. Update profile directly
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.shipping_name,
          phone_number: formData.shipping_phone,
          zip_code: formData.zip_code,
          address: formData.address,
          address_detail: formData.address_detail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      await refreshProfile();
      showToast('배송지가 저장되었습니다.', 'success'); // 성공 시에만 모달 닫기
      onClose(); 
      onSuccess(); // 결제 단계로 전환
    } catch (error: any) {
      console.error('Error updating shipping info:', error);
      showToast("배송지 저장 실패: " + error.message, 'error');
      setErrorMsg(error.message || '배송지 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
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
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-[#121212] w-screen h-screen flex flex-col overflow-y-auto custom-scrollbar p-6 md:p-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative w-full max-w-3xl mx-auto my-auto will-change-transform flex flex-col"
          >
            {/* Header */}
            <div className="sticky top-0 z-[70] bg-[#121212] py-8 flex items-center justify-between border-b border-white/5">
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">배송지 정보</h2>
                <p className="text-zinc-500 text-base mt-2 tracking-tight">상품을 받으실 주소를 입력해주세요.</p>
              </div>
              <button 
                onClick={handleClose}
                className="fixed top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90 z-[10000]"
              >
                <X size={32} />
              </button>
            </div>

            <div className="flex-1 py-10 custom-scrollbar">
              <form id="shipping-form" onSubmit={handleSaveShipping} className="space-y-10">
                {/* 폼 내용 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-zinc-500 ml-1 uppercase tracking-widest">받는 분</label>
                    <input
                      type="text"
                      required
                      value={formData.shipping_name}
                      onChange={(e) => setFormData({ ...formData, shipping_name: e.target.value })}
                      className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-lg tracking-tight"
                      placeholder="이름을 입력하세요"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-zinc-500 ml-1 uppercase tracking-widest">연락처</label>
                    <input
                      type="tel"
                      required
                      value={formData.shipping_phone}
                      onChange={(e) => setFormData({ ...formData, shipping_phone: e.target.value })}
                      className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-lg tracking-tight"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-zinc-500 ml-1 uppercase tracking-widest">우편번호</label>
                  <div className="grid grid-cols-[140px_1fr] gap-3 w-full h-16">
                    <button
                      type="button"
                      disabled={!isScriptLoaded}
                      onClick={handleOpenPostcode}
                      className="h-full bg-white text-black hover:bg-zinc-200 border-none rounded-2xl text-base font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 whitespace-nowrap tracking-tight"
                    >
                      <Search size={20} />
                      <span>주소 찾기</span>
                    </button>
                    <input
                      type="text"
                      required
                      readOnly
                      value={formData.zip_code}
                      className="h-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-zinc-400 placeholder:text-zinc-600 focus:outline-none cursor-not-allowed text-lg w-full min-w-0 tracking-tight"
                      placeholder="우편번호"
                    />
                  </div>
                </div>

                {isPostcodeOpen && (
                  <div className="mt-6 mb-8">
                    <div className="flex justify-between items-center mb-4 px-2">
                      <span className="text-base font-bold text-zinc-500 tracking-tight">주소 검색 결과</span>
                      <button type="button" onClick={() => setIsPostcodeOpen(false)} className="text-sm font-bold text-white/60 hover:text-white transition-colors tracking-tight">닫기</button>
                    </div>
                    <div ref={postcodeContainerRef} className="w-full h-[450px] border border-white/10 rounded-2xl overflow-hidden bg-white shadow-2xl"></div>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-zinc-500 ml-1 uppercase tracking-widest">기본 주소</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.address}
                    className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-zinc-400 placeholder:text-zinc-600 focus:outline-none cursor-not-allowed text-lg tracking-tight"
                    placeholder="주소 찾기 버튼을 이용해주세요"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-zinc-500 ml-1 uppercase tracking-widest">상세 주소</label>
                  <input
                    type="text"
                    required
                    ref={detailAddressRef}
                    value={formData.address_detail}
                    onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                    className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all text-lg tracking-tight"
                    placeholder="동, 호수 등 상세 주소를 입력하세요"
                  />
                </div>

                {errorMsg && (
                  <div className="text-red-500 text-sm font-bold mt-4 px-4 bg-red-500/10 py-4 rounded-2xl border border-red-500/20 tracking-tight">
                    {errorMsg}
                  </div>
                )}
              </form>
            </div>

            {/* Footer Button */}
            <div className="sticky bottom-0 left-0 right-0 py-10 bg-gradient-to-t from-[#121212] via-[#121212] to-transparent z-[80]">
              <motion.button
                type="submit"
                form="shipping-form"
                disabled={isLoading}
                whileTap={{ scale: 0.96 }}
                className="w-full h-20 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl text-2xl tracking-tight"
              >
                {isLoading ? <Loader2 className="animate-spin" size={28} /> : null}
                저장하고 결제하기
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
