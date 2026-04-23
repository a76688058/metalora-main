import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
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
  const { theme } = useTheme();
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
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
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
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`relative w-full md:w-[50%] h-full flex flex-col shadow-2xl overflow-hidden border-l pointer-events-auto transition-colors duration-500 will-change-transform transform-gpu ${
              theme === 'dark' ? 'bg-[#0F0F11] border-white/5' : 'bg-white border-black/5'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-5 border-b sticky top-0 backdrop-blur-xl z-20 transition-colors duration-500 ${
              theme === 'dark' ? 'border-white/5 bg-[#0F0F11]/80' : 'border-black/5 bg-white/80'
            }`}>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleBack}
                  className={`p-2 rounded-full transition-all ${
                    theme === 'dark' ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>프로필 수정</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <form onSubmit={handleUpdateProfile} className="space-y-8">
                {/* Basic Info Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-5 bg-cyan-500 rounded-full" />
                    <h3 className={`text-[15px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>기본 정보</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className={`text-[14px] font-bold ml-1 uppercase tracking-tighter ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>아이디</label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={formData.user_custom_id}
                        className={`w-full h-16 border rounded-2xl px-6 text-base font-medium cursor-not-allowed ${
                          theme === 'dark' ? 'bg-zinc-900/30 border-white/5 text-zinc-500' : 'bg-zinc-50 border-black/5 text-zinc-400'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className={`text-[14px] font-bold ml-1 uppercase tracking-tighter ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>이름</label>
                        <input
                          type="text"
                          required
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="이름을 입력하세요"
                          className={`w-full h-16 border rounded-2xl px-6 text-base focus:outline-none focus:ring-1 transition-all font-medium ${
                            theme === 'dark' 
                              ? 'bg-zinc-900/50 border-white/10 text-white focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-zinc-700' 
                              : 'bg-zinc-50 border-black/10 text-black focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-zinc-300'
                          }`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={`text-[14px] font-bold ml-1 uppercase tracking-tighter ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>연락처</label>
                        <input
                          type="tel"
                          required
                          value={formData.phone_number}
                          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                          placeholder="010-0000-0000"
                          className={`w-full h-16 border rounded-2xl px-6 text-base focus:outline-none focus:ring-1 transition-all font-medium ${
                            theme === 'dark' 
                              ? 'bg-zinc-900/50 border-white/10 text-white focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-zinc-700' 
                              : 'bg-zinc-50 border-black/10 text-black focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-zinc-300'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Shipping Info Section */}
                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                      <h3 className={`text-[15px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>배송지 정보</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenPostcode}
                      className={`text-[14px] font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95 ${
                        theme === 'dark' ? 'text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30' : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
                      }`}
                    >
                      주소 찾기
                    </button>
                  </div>

                  <div className="space-y-4">
                    <input
                      type="text"
                      readOnly
                      value={formData.zip_code}
                      placeholder="우편번호"
                      className={`w-full h-16 border rounded-2xl px-6 text-base font-medium cursor-default ${
                        theme === 'dark' ? 'bg-zinc-900/30 border-white/5 text-zinc-500' : 'bg-zinc-50 border-black/5 text-zinc-400'
                      }`}
                    />
                    <input
                      type="text"
                      readOnly
                      value={formData.address}
                      placeholder="기본 주소"
                      className={`w-full h-16 border rounded-2xl px-6 text-base font-medium cursor-default ${
                        theme === 'dark' ? 'bg-zinc-900/30 border-white/5 text-zinc-500' : 'bg-zinc-50 border-black/5 text-zinc-400'
                      }`}
                    />
                    <input
                      type="text"
                      ref={detailAddressRef}
                      value={formData.address_detail}
                      onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                      placeholder="상세 주소를 입력하세요"
                      className={`w-full h-16 border rounded-2xl px-6 text-base focus:outline-none focus:ring-1 transition-all font-medium ${
                        theme === 'dark' 
                          ? 'bg-zinc-900/50 border-white/10 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 placeholder:text-zinc-700' 
                          : 'bg-zinc-50 border-black/10 text-black focus:border-emerald-500/50 focus:ring-emerald-500/20 placeholder:text-zinc-300'
                      }`}
                    />
                  </div>
                </section>

                {/* Save Button */}
                <div className="pt-4 pb-8">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full h-20 font-bold text-lg rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 ${
                      theme === 'dark' 
                        ? 'bg-white text-black hover:bg-zinc-200 shadow-[0_10px_30px_rgba(255,255,255,0.1)]' 
                        : 'bg-black text-white hover:bg-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.1)]'
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={24} />
                    ) : (
                      "변경사항 저장하기"
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Postcode Overlay */}
            {isPostcodeOpen && (
              <div className={`absolute inset-0 z-[13000] flex flex-col p-6 overflow-y-auto ${theme === 'dark' ? 'bg-black' : 'bg-zinc-100'}`}>
                <div className="flex justify-between items-center mb-6 w-full">
                  <h2 className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>주소 검색</h2>
                  <button 
                    type="button" 
                    onClick={() => setIsPostcodeOpen(false)} 
                    className={`p-2 rounded-full transition-all active:scale-90 ${
                      theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white' : 'bg-black/5 hover:bg-black/10 text-zinc-500 hover:text-black'
                    }`}
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
