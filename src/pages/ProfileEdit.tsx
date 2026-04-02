import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Loader2, ChevronLeft, X
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import LoadingScreen from '../components/LoadingScreen';

export default function ProfileEdit() {
  const { user, profile, refreshProfile, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
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
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile) {
      setFormData({
        user_custom_id: profile.user_custom_id || '',
        full_name: profile.full_name || '',
        phone_number: profile.phone_number || '',
        zip_code: profile.zip_code || '',
        address: profile.address || '',
        address_detail: profile.address_detail || '',
      });
    }
  }, [profile]);

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
      navigate('/mypage');
    } catch (error: any) {
      showToast("수정 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Only show loading screen on initial load when profile data is missing
  if (authLoading || !profile) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center px-6 sticky top-0 bg-black/80 backdrop-blur-xl z-50">
        <button 
          onClick={() => navigate('/mypage')} 
          className="p-2 -ml-2 hover:bg-white/5 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="ml-2 text-xl font-black tracking-tighter text-white uppercase">프로필 수정</h1>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar pb-24 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-xl mx-auto px-6 py-8">
          <form onSubmit={handleUpdateProfile} className="space-y-10">
            {/* Basic Info Section */}
            <section className="space-y-8">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-cyan-500 rounded-full" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">기본 정보</h3>
              </div>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-zinc-500 ml-1">아이디</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={formData.user_custom_id}
                    className="w-full h-16 bg-zinc-900/30 border border-white/5 rounded-2xl px-6 text-zinc-500 text-base font-medium cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-500 ml-1">이름</label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="이름을 입력하세요"
                      className="w-full h-16 bg-zinc-900/50 border border-white/10 rounded-2xl px-6 text-white text-base focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-zinc-700 font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-500 ml-1">연락처</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone_number}
                      onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                      placeholder="010-0000-0000"
                      className="w-full h-16 bg-zinc-900/50 border border-white/10 rounded-2xl px-6 text-white text-base focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-zinc-700 font-medium"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Shipping Info Section */}
            <section className="space-y-8">
              <div className="flex justify-between items-center mb-2">
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

              <div className="space-y-4">
                <input
                  type="text"
                  readOnly
                  value={formData.zip_code}
                  placeholder="우편번호"
                  className="w-full h-16 bg-zinc-900/30 border border-white/5 rounded-2xl px-6 text-zinc-500 text-base font-medium cursor-default"
                />
                <input
                  type="text"
                  readOnly
                  value={formData.address}
                  placeholder="기본 주소"
                  className="w-full h-16 bg-zinc-900/30 border border-white/5 rounded-2xl px-6 text-zinc-500 text-base font-medium cursor-default"
                />
                <input
                  type="text"
                  ref={detailAddressRef}
                  value={formData.address_detail}
                  onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                  placeholder="상세 주소를 입력하세요"
                  className="w-full h-16 bg-zinc-900/50 border border-white/10 rounded-2xl px-6 text-white text-base focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all placeholder:text-zinc-700 font-medium"
                />
              </div>
            </section>

            {/* Save Button */}
            <div className="pt-10">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-18 bg-white text-black font-bold text-lg rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 shadow-[0_10px_30px_rgba(255,255,255,0.1)]"
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
      </main>

      {isPostcodeOpen && (
        <div className="fixed inset-0 z-[30000] bg-black flex flex-col p-6 !overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex justify-between items-center mb-6 max-w-3xl mx-auto w-full relative z-20 pointer-events-auto">
            <h2 className="text-2xl font-bold text-white tracking-tight">주소 검색</h2>
            <button 
              type="button" 
              onClick={() => setIsPostcodeOpen(false)} 
              className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90"
            >
              <X size={28} />
            </button>
          </div>
          <div ref={postcodeContainerRef} className="flex-1 w-full max-w-3xl mx-auto rounded-3xl overflow-hidden bg-white shadow-2xl"></div>
        </div>
      )}
    </div>
  );
}
