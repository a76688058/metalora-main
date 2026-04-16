import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import DaumPostcode from 'react-daum-postcode';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';

export default function ProfileComplete() {
  const { user, profile, adminProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    zip_code: '',
    address: '',
    address_detail: '',
  });

  useEffect(() => {
    if (isPostcodeOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isPostcodeOpen]);

  useEffect(() => {
    // 관리자 계정인 경우 이 페이지를 건너뜀
    if (adminProfile?.is_admin) {
      navigate('/admin');
      return;
    }

    if (profile?.phone_number && profile?.address) {
      navigate(redirectUrl);
    } else if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone_number: profile.phone_number || '',
        zip_code: profile.zip_code || '',
        address: profile.address || '',
        address_detail: profile.address_detail || '',
      });
    }
  }, [profile, adminProfile, navigate]);

  const handleComplete = (data: any) => {
    let fullAddress = data.address;
    let extraAddress = '';

    if (data.addressType === 'R') {
      if (data.bname !== '') {
        extraAddress += data.bname;
      }
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    setErrorMsg('');

    try {
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
      
      setTimeout(() => {
        navigate(redirectUrl);
      }, 1500);
    } catch (error: any) {
      console.error('Profile update error:', error);
      setErrorMsg(error.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black pt-28 pb-12 px-4 flex justify-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl transform-gpu will-change-transform"
      >
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">배송 정보 입력</h1>
          <p className="text-zinc-400 text-sm">원활한 배송을 위해 추가 정보를 입력해주세요.</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">이름</label>
            <input
              type="text"
              required
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-white transition-colors text-lg"
              placeholder="홍길동"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">연락처</label>
            <input
              type="tel"
              required
              value={formData.phone_number}
              onChange={(e) => setFormData(prev => ({ ...prev, phone_number: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-white transition-colors text-lg"
              placeholder="010-0000-0000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">주소</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                readOnly
                required
                value={formData.zip_code}
                className="w-1/3 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none cursor-not-allowed text-lg"
                placeholder="우편번호"
              />
              <button
                type="button"
                onClick={() => setIsPostcodeOpen(true)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-4 text-white transition-colors font-medium text-lg"
              >
                우편번호 찾기
              </button>
            </div>
            <input
              type="text"
              readOnly
              required
              value={formData.address}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none mb-2 cursor-not-allowed text-lg"
              placeholder="기본 주소"
            />
            <input
              type="text"
              required
              value={formData.address_detail}
              onChange={(e) => setFormData(prev => ({ ...prev, address_detail: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-white transition-colors text-lg"
              placeholder="상세 주소 입력"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isSuccess}
            className={`w-full h-16 font-bold text-base rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 mt-8 ${
              isSuccess 
                ? 'bg-emerald-500 text-white' 
                : 'bg-white text-black hover:bg-zinc-200 shadow-[0_10px_30px_rgba(255,255,255,0.1)]'
            }`}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={20} />
            ) : isSuccess ? (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <span>저장 완료</span>
              </>
            ) : (
              "저장하고 완료하기"
            )}
          </button>
        </form>
      </motion.div>

      {/* Daum Postcode Modal */}
      <AnimatePresence>
        {isPostcodeOpen && (
          <div className="fixed inset-0 z-[100] flex justify-center items-end bg-black/80 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              className="relative w-full max-w-lg bg-[#1A1A1A] rounded-t-[24px] rounded-b-none max-h-[85vh] overflow-y-auto p-6 shadow-2xl pb-safe mt-auto transform-gpu will-change-transform"
            >
              {/* Mobile Handle Bar */}
              <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto my-3" />

              <div className="flex justify-between items-center p-4 pt-8 border-b bg-white relative z-10">
                <h3 className="font-bold text-black">우편번호 찾기</h3>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsPostcodeOpen(false);
                  }} 
                  className="text-zinc-500 hover:text-black"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <DaumPostcode onComplete={handleComplete} autoClose={false} style={{ height: '400px' }} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
