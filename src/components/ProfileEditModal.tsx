import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { loadScript } from '../lib/utils';
import { 
  Loader2, X, ChevronLeft, Check
} from 'lucide-react';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileEditModal({ isOpen, onClose }: ProfileEditModalProps) {
  const { user, profile, refreshProfile, openProfile } = useAuth();
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
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
    loadScript('https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js')
      .then(() => setIsScriptLoaded(true))
      .catch(err => console.error('Failed to load Daum Postcode script:', err));
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
    
    const phoneRegex = /^01([0|1|6|7|8|9])-?([0-9]{3,4})-?([0-9]{4})$/;
    if (!phoneRegex.test(formData.phone_number)) {
      setErrorMsg('올바른 연락처 형식이 아닙니다. (예: 010-0000-0000)');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    
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
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2000);
      // onClose(); // Removed to keep the modal open after saving
    } catch (error: any) {
      setErrorMsg("수정 실패: " + error.message);
      setTimeout(() => setErrorMsg(''), 3000);
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
            className={`relative w-full max-w-lg h-full flex flex-col shadow-2xl overflow-hidden border-l pointer-events-auto transition-colors duration-500 ${
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
                <h2 className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>프로필 수정</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <form onSubmit={handleUpdateProfile} className="space-y-8">
                {/* Basic Info Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-cyan-500 rounded-full" />
                    <h3 className={`text-xs font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>기본 정보</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className={`text-[11px] font-bold ml-1 uppercase tracking-tighter ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>아이디</label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={formData.user_custom_id}
                        className={`w-full h-14 border rounded-2xl px-5 text-base md:text-sm font-medium cursor-not-allowed ${
                          theme === 'dark' ? 'bg-zinc-900/30 border-white/5 text-zinc-500' : 'bg-zinc-50 border-black/5 text-zinc-400'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className={`text-[11px] font-bold ml-1 uppercase tracking-tighter ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>이름</label>
                        <input
                          type="text"
                          required
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="이름을 입력하세요"
                          className={`w-full h-14 border rounded-2xl px-5 text-base md:text-sm focus:outline-none focus:ring-1 transition-all font-medium ${
                            theme === 'dark' 
                              ? 'bg-zinc-900/50 border-white/10 text-white focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-zinc-700' 
                              : 'bg-zinc-50 border-black/10 text-black focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-zinc-300'
                          }`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={`text-[11px] font-bold ml-1 uppercase tracking-tighter ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>연락처</label>
                        <input
                          type="tel"
                          required
                          value={formData.phone_number}
                          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                          placeholder="010-0000-0000"
                          className={`w-full h-14 border rounded-2xl px-5 text-base md:text-sm focus:outline-none focus:ring-1 transition-all font-medium ${
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
                      <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                      <h3 className={`text-xs font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>배송지 정보</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenPostcode}
                      className={`text-[11px] font-bold px-4 py-2 rounded-xl transition-all active:scale-95 ${
                        theme === 'dark' ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                      }`}
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
                      className={`w-full h-14 border rounded-2xl px-5 text-base md:text-sm font-medium cursor-default ${
                        theme === 'dark' ? 'bg-zinc-900/30 border-white/5 text-zinc-500' : 'bg-zinc-50 border-black/5 text-zinc-400'
                      }`}
                    />
                    <input
                      type="text"
                      readOnly
                      value={formData.address}
                      placeholder="기본 주소"
                      className={`w-full h-14 border rounded-2xl px-5 text-base md:text-sm font-medium cursor-default ${
                        theme === 'dark' ? 'bg-zinc-900/30 border-white/5 text-zinc-500' : 'bg-zinc-50 border-black/5 text-zinc-400'
                      }`}
                    />
                    <input
                      type="text"
                      ref={detailAddressRef}
                      value={formData.address_detail}
                      onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                      placeholder="상세 주소를 입력하세요"
                      className={`w-full h-14 border rounded-2xl px-5 text-base md:text-sm focus:outline-none focus:ring-1 transition-all font-medium ${
                        theme === 'dark' 
                          ? 'bg-zinc-900/50 border-white/10 text-white focus:border-emerald-500/50 focus:ring-emerald-500/20 placeholder:text-zinc-700' 
                          : 'bg-zinc-50 border-black/10 text-black focus:border-emerald-500/50 focus:ring-emerald-500/20 placeholder:text-zinc-300'
                      }`}
                    />
                  </div>
                </section>

                {/* Save Button */}
                <div className="pt-4 pb-8 space-y-4">
                  {errorMsg && (
                    <div className="text-center text-red-500 text-sm font-bold animate-pulse bg-red-500/10 py-2 rounded-xl backdrop-blur-md border border-red-500/20">
                      {errorMsg}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || isSuccess}
                    className={`w-full h-16 font-bold text-base rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 ${
                      isSuccess
                        ? theme === 'dark' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-600 border border-green-200'
                        : theme === 'dark' 
                          ? 'bg-white text-black hover:bg-zinc-200 shadow-[0_10px_30px_rgba(255,255,255,0.1)]' 
                          : 'bg-black text-white hover:bg-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.1)]'
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : isSuccess ? (
                      <>
                        <Check size={20} className="text-green-400" />
                        <span>저장 완료</span>
                      </>
                    ) : (
                      "변경사항 저장하기"
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Postcode Overlay */}
            {isPostcodeOpen && (
              <div className={`absolute inset-0 z-[13000] flex flex-col p-6 overflow-y-auto overscroll-contain ${theme === 'dark' ? 'bg-black' : 'bg-zinc-100'}`}>
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
