import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Loader2, X, ChevronLeft
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileEditModal({ isOpen, onClose }: ProfileEditModalProps) {
  const { user, profile, refreshProfile, openProfile } = useAuth();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const handleBack = () => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  };
  
  const [formData, setFormData] = useState({
    user_custom_id: '',
    full_name: '',
    phone_number: '',
    zip_code: '',
    address: '',
    address_detail: '',
  });
  
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const detailAddressRef = useRef<HTMLInputElement>(null);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflowY = 'scroll';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
    };
  }, [isOpen]);

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
    if (profile && isOpen) {
      setFormData({
        user_custom_id: profile.user_custom_id || '',
        full_name: profile.full_name || '',
        phone_number: profile.phone_number || '',
        zip_code: profile.zip_code || '',
        address: profile.address || '',
        address_detail: profile.address_detail || '',
      });
    }
  }, [profile, isOpen]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone_number: formData.phone_number,
          zip_code: formData.zip_code,
          address: formData.address,
          address_detail: formData.address_detail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      
      await refreshProfile();
      showToast("정보가 성공적으로 수정되었습니다.", 'success');
      // onClose(); // Removed to keep the modal open after saving
    } catch (error: any) {
      showToast("수정 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[25000] flex justify-end pointer-events-auto"
        >
          {/* Backdrop */}
          <div 
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg bg-[#0F0F11] h-full flex flex-col shadow-2xl overflow-hidden border-l border-white/5 pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 sticky top-0 bg-[#0F0F11]/80 backdrop-blur-xl z-20">
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleBack}
                  className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-xl font-bold text-white tracking-tight">프로필 수정</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <form onSubmit={handleUpdateProfile} className="space-y-8">
                {/* Basic Info Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-cyan-500 rounded-full" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">기본 정보</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-500 ml-1 uppercase tracking-tighter">아이디</label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={formData.user_custom_id}
                        className="w-full h-14 bg-zinc-900/30 border border-white/5 rounded-2xl px-5 text-zinc-500 text-sm font-medium cursor-not-allowed"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-500 ml-1 uppercase tracking-tighter">이름</label>
                        <input
                          type="text"
                          required
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="이름을 입력하세요"
                          className="w-full h-14 bg-zinc-900/50 border border-white/10 rounded-2xl px-5 text-white text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-zinc-700 font-medium"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-zinc-500 ml-1 uppercase tracking-tighter">연락처</label>
                        <input
                          type="tel"
                          required
                          value={formData.phone_number}
                          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                          placeholder="010-0000-0000"
                          className="w-full h-14 bg-zinc-900/50 border border-white/10 rounded-2xl px-5 text-white text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-zinc-700 font-medium"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Shipping Info Section */}
                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">배송지 정보</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenPostcode}
                      className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-xl hover:bg-emerald-500/20 transition-all active:scale-95"
                    >
                      주소 찾기
                    </button>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      readOnly
                      value={formData.zip_code}
                      placeholder="우편번호"
                      className="w-full h-14 bg-zinc-900/30 border border-white/5 rounded-2xl px-5 text-zinc-500 text-sm font-medium cursor-default"
                    />
                    <input
                      type="text"
                      readOnly
                      value={formData.address}
                      placeholder="기본 주소"
                      className="w-full h-14 bg-zinc-900/30 border border-white/5 rounded-2xl px-5 text-zinc-500 text-sm font-medium cursor-default"
                    />
                    <input
                      type="text"
                      ref={detailAddressRef}
                      value={formData.address_detail}
                      onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                      placeholder="상세 주소를 입력하세요"
                      className="w-full h-14 bg-zinc-900/50 border border-white/10 rounded-2xl px-5 text-white text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-zinc-700 font-medium"
                    />
                  </div>
                </section>

                {/* Save Button */}
                <div className="pt-4 pb-8">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-16 bg-white text-black font-bold text-base rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 shadow-[0_10px_30px_rgba(255,255,255,0.1)]"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      "변경사항 저장하기"
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Postcode Overlay */}
            {isPostcodeOpen && (
              <div className="absolute inset-0 z-[13000] bg-black flex flex-col p-6 overflow-y-auto">
                <div className="flex justify-between items-center mb-6 w-full">
                  <h2 className="text-xl font-bold text-white tracking-tight">주소 검색</h2>
                  <button 
                    type="button" 
                    onClick={() => setIsPostcodeOpen(false)} 
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div ref={postcodeContainerRef} className="flex-1 w-full rounded-2xl overflow-hidden bg-white shadow-2xl min-h-[400px]"></div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
