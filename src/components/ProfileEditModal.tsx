import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import {
  Loader2, X, ChevronLeft
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass = (theme: string, disabled = false) =>
  cn(
    'w-full h-12 rounded-[2px] border px-4 text-base focus:outline-none focus-ring',
    disabled
      ? (theme === 'dark' ? 'border-white/10 bg-transparent text-[#8d887e] cursor-not-allowed' : 'border-black/10 bg-transparent text-[#6b675f] cursor-not-allowed')
      : (theme === 'dark'
        ? 'border-white/20 bg-transparent text-[#f3f1ec] placeholder:text-[#8d887e]'
        : 'border-black/15 bg-transparent text-[#16150f] placeholder:text-[#6b675f]'),
  );

export default function ProfileEditModal({ isOpen, onClose }: ProfileEditModalProps) {
  const { user, profile, refreshProfile, openProfile } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const returnToHub = useCallback(() => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  }, [onClose, openProfile]);

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
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (isPostcodeOpen) {
        setIsPostcodeOpen(false);
        return;
      }
      returnToHub();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isPostcodeOpen, returnToHub]);

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
    if (!(window as any).daum || !(window as any).daum.Postcode) {
      showToast('주소 서비스 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }
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
    if (!isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen]);

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
      setErrorMsg('');
      setSuccessMsg('');
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
      setSuccessMsg('저장되었습니다.');
      showToast('프로필이 저장되었습니다.', 'success');
    } catch (error: any) {
      const message = error?.message || '저장에 실패했습니다. 다시 시도해 주세요.';
      setErrorMsg(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const labelClass = `block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-edit-title"
          className={cn('fixed inset-0 flex justify-end pointer-events-auto', zClass('sheet'))}
        >
          <button
            type="button"
            aria-label="내 정보로 돌아가기"
            onClick={returnToHub}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`relative w-full max-w-lg h-full flex flex-col shadow-2xl overflow-hidden pointer-events-auto transition-colors duration-500 will-change-transform transform-gpu ${
              theme === 'dark' ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]'
            }`}
          >
            <div className={`flex items-center justify-between px-6 py-5 border-b ${
              theme === 'dark' ? 'border-white/5' : 'border-black/5'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={returnToHub}
                  aria-label="내 정보로 돌아가기"
                  className={`p-2 rounded-full transition-all focus-ring ${
                    theme === 'dark' ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 id="profile-edit-title" className="text-[1.75rem] font-medium tracking-[-0.02em]">프로필 수정</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <form onSubmit={handleUpdateProfile} className="space-y-8">
                <section className="space-y-5">
                  <h3 className={`text-sm font-semibold tracking-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>기본 정보</h3>

                  <div className="space-y-4">
                    {profile?.password_login_enabled === true && (
                      <div className="space-y-2">
                        <label htmlFor="profile-username" className={labelClass}>아이디</label>
                        <input
                          id="profile-username"
                          type="text"
                          readOnly
                          disabled
                          value={formData.user_custom_id}
                          className={inputClass(theme, true)}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="profile-full-name" className={labelClass}>이름</label>
                        <input
                          id="profile-full-name"
                          type="text"
                          required
                          autoComplete="name"
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          placeholder="이름을 입력하세요"
                          className={inputClass(theme)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="profile-phone" className={labelClass}>연락처</label>
                        <input
                          id="profile-phone"
                          type="tel"
                          required
                          autoComplete="tel"
                          value={formData.phone_number}
                          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                          placeholder="010-0000-0000"
                          className={inputClass(theme)}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-5">
                  <div className="flex justify-between items-center gap-3">
                    <h3 className={`text-sm font-semibold tracking-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>배송지 정보</h3>
                    <button
                      type="button"
                      onClick={handleOpenPostcode}
                      className={`text-sm font-medium h-10 px-4 rounded-[2px] border focus-ring ${
                        theme === 'dark' ? 'border-white/20 text-[#f3f1ec] hover:bg-white/5' : 'border-black/15 text-[#16150f] hover:bg-black/5'
                      }`}
                    >
                      주소 찾기
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label htmlFor="profile-zip" className={labelClass}>우편번호</label>
                      <input
                        id="profile-zip"
                        type="text"
                        readOnly
                        autoComplete="postal-code"
                        value={formData.zip_code}
                        placeholder="우편번호"
                        className={inputClass(theme, true)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="profile-address" className={labelClass}>기본 주소</label>
                      <input
                        id="profile-address"
                        type="text"
                        readOnly
                        autoComplete="street-address"
                        value={formData.address}
                        placeholder="기본 주소"
                        className={inputClass(theme, true)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="profile-address-detail" className={labelClass}>상세 주소</label>
                      <input
                        id="profile-address-detail"
                        type="text"
                        ref={detailAddressRef}
                        autoComplete="address-line2"
                        value={formData.address_detail}
                        onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                        placeholder="상세 주소를 입력하세요"
                        className={inputClass(theme)}
                      />
                    </div>
                  </div>
                </section>

                {errorMsg && (
                  <div role="alert" className="text-red-500 text-sm font-medium text-center">{errorMsg}</div>
                )}
                {successMsg && (
                  <div role="status" className="text-emerald-600 text-sm font-medium text-center">{successMsg}</div>
                )}

                <div className="pt-2 pb-[max(2rem,env(safe-area-inset-bottom))]">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full h-12 font-medium tracking-[-0.02em] rounded-[2px] flex items-center justify-center gap-2 disabled:opacity-50 focus-ring ${
                      theme === 'dark'
                        ? 'bg-[#f2f0ea] text-[#16150f]'
                        : 'bg-[#1a1914] text-[#f4f1eb]'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        저장 중...
                      </>
                    ) : (
                      '변경사항 저장하기'
                    )}
                  </button>
                </div>
              </form>
            </div>

            {isPostcodeOpen && (
              <div className={`absolute inset-0 z-10 flex flex-col p-6 overflow-y-auto ${theme === 'dark' ? 'bg-[#0F0F11]' : 'bg-white'}`}>
                <div className="flex justify-between items-center mb-6 w-full">
                  <h2 className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>주소 검색</h2>
                  <button
                    type="button"
                    onClick={() => setIsPostcodeOpen(false)}
                    aria-label="주소 검색 닫기"
                    className={`p-2 rounded-full transition-all focus-ring ${
                      theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white' : 'bg-black/5 hover:bg-black/10 text-zinc-500 hover:text-black'
                    }`}
                  >
                    <X size={24} />
                  </button>
                </div>
                <div ref={postcodeContainerRef} className="min-h-[400px] w-full flex-1 overflow-hidden bg-white"></div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
