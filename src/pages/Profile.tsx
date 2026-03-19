import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2, User, Mail, Phone, MapPin, Search, MessageSquare, Plus, ChevronRight, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';
import InquiryModal from '../components/InquiryModal';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  const [isInquiryDetailOpen, setIsInquiryDetailOpen] = useState(false);

  const [profileData, setProfileData] = useState<any>(null);
  const [formData, setFormData] = useState({
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
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // 2-1. 내 정보 데이터 호출
  const fetchProfile = async () => {
    if (!supabase) return;
    let isCompleted = false;
    const failSafeTimeout = setTimeout(() => {
      if (!isCompleted) {
        console.warn("fetchProfile timeout reached. Forcing loading state to false.");
        setIsLoading(false);
      }
    }, 3000);

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");

      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setProfileData(data); // 실제 상태 변수에 세팅
        setFormData({
          full_name: data.full_name || '',
          phone_number: data.phone_number || '',
          zip_code: data.zip_code || '',
          address: data.address || '',
          address_detail: data.address_detail || '',
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('Lock was stolen') || error.message?.includes('Fetch is aborted')) {
        console.warn('Supabase session sync skipped (normal behavior)');
        return;
      }
      showToast("데이터를 불러올 수 없습니다: " + error.message, 'error');
    } finally {
      isCompleted = true;
      clearTimeout(failSafeTimeout);
      setIsLoading(false); // ★ 먹통 방지
    }
  };

  const fetchInquiries = async () => {
    if (!user) return;
    try {
      setIsLoadingInquiries(true);
      const { data, error } = await supabase
        .from('cs_inquiries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setInquiries(data || []);
    } catch (error) {
      console.error('Error fetching inquiries:', error);
    } finally {
      setIsLoadingInquiries(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchInquiries();
  }, []);

  // 2-2. 내 정보 수정하기
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      
      // 1. 유저 세션 확실하게 가져오기 (비동기 지연 방지)
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session?.user) throw new Error("로그인 세션이 유효하지 않습니다.");
      const userId = session.user.id;

      // 2. Update profile directly
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
        .eq('id', userId);

      if (error) throw error;
      
      await refreshProfile();
      showToast("정보가 성공적으로 수정되었습니다.", 'success');
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (error: any) {
      showToast("수정 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false); // ★ 먹통 방지
    }
  };

  if (!user) return null;

  if (isLoading || !profileData) {
    return (
      <div className="min-h-screen bg-black pt-4 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pt-4 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">내 정보</h1>
          <p className="text-zinc-400 mt-2">회원 정보 및 배송지를 관리하세요.</p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        {isSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
            정보가 성공적으로 수정되었습니다.
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-8">
          {/* Basic Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1C1C1E] border border-white/5 rounded-3xl p-8 shadow-2xl space-y-6"
          >
            <h2 className="text-lg font-semibold text-white border-b border-white/5 pb-3 flex items-center gap-2">
              <User size={18} className="text-zinc-400" /> 기본 정보
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">아이디 (수정 불가)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User size={16} className="text-zinc-600" />
                  </div>
                  <input
                    type="text"
                    disabled
                    value={profileData?.user_custom_id || ''}
                    className="w-full h-[52px] bg-black/30 border border-white/5 rounded-xl pl-10 pr-4 text-zinc-600 cursor-not-allowed text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">이름</label>
                <input
                  type="text"
                  required
                  value={formData?.full_name || ''}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full h-[52px] bg-black/20 border border-white/5 rounded-xl px-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-all text-sm leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">연락처</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Phone size={16} className="text-zinc-600" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={formData?.phone_number || ''}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    className="w-full h-[52px] bg-black/20 border border-white/5 rounded-xl pl-10 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-all text-sm leading-relaxed"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Shipping Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#1C1C1E] border border-white/5 rounded-3xl p-8 shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin size={18} className="text-zinc-400" /> 배송지 정보
              </h2>
              <button
                type="button"
                disabled={!isScriptLoaded}
                onClick={handleOpenPostcode}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white hover:bg-white/10 transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-95 duration-150"
              >
                <Search size={14} />
                주소 검색
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">우편번호</label>
                <input
                  type="text"
                  readOnly
                  value={formData?.zip_code || ''}
                  className="w-full h-[52px] bg-black/30 border border-white/5 rounded-xl px-4 text-zinc-400 placeholder:text-zinc-700 focus:outline-none cursor-not-allowed text-sm"
                  placeholder="우편번호"
                />
              </div>

              {isPostcodeOpen && (
                <div className="fixed inset-0 z-[9999] bg-black flex flex-col p-6">
                  <div className="flex justify-between items-center mb-6 max-w-3xl mx-auto w-full">
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

              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">기본 주소</label>
                <input
                  type="text"
                  readOnly
                  value={formData?.address || ''}
                  className="w-full h-[52px] bg-black/30 border border-white/5 rounded-xl px-4 text-zinc-400 placeholder:text-zinc-700 focus:outline-none cursor-not-allowed text-sm leading-relaxed"
                  placeholder="도로명 또는 지번 주소"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">상세 주소</label>
                <input
                  type="text"
                  ref={detailAddressRef}
                  value={formData?.address_detail || ''}
                  onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                  className="w-full h-[52px] bg-black/20 border border-white/5 rounded-xl px-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-all text-sm leading-relaxed"
                  placeholder="동, 호수 등 상세 주소"
                />
              </div>
            </div>
          </motion.div>

          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full max-w-xs h-12 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 duration-150 shadow-xl shadow-white/5"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : null}
              정보 수정하기
            </button>
          </div>
        </form>

        {/* CS Inquiries Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#1C1C1E] border border-white/5 rounded-3xl p-8 shadow-2xl space-y-6"
        >
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageSquare size={18} className="text-zinc-400" /> 내가 남긴 문의
            </h2>
            <button
              onClick={() => setIsInquiryModalOpen(true)}
              className="text-xs font-bold text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 border border-white/5"
            >
              <Plus size={14} />
              문의하기
            </button>
          </div>

          <div className="space-y-3">
            {isLoadingInquiries ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-zinc-700" size={28} />
              </div>
            ) : inquiries.length === 0 ? (
              <div className="text-center py-16 bg-black/20 rounded-2xl border border-dashed border-white/5">
                <p className="text-zinc-600 text-sm font-medium">남기신 문의가 없습니다.</p>
              </div>
            ) : (
              inquiries.map((inquiry) => (
                <button
                  key={inquiry.id}
                  onClick={() => {
                    setSelectedInquiry(inquiry);
                    setIsInquiryDetailOpen(true);
                  }}
                  className="w-full bg-black/20 border border-white/5 rounded-2xl p-5 flex items-center justify-between group hover:bg-black/40 hover:border-white/10 transition-all text-left active:scale-[0.99]"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                        inquiry.status === '답변완료' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {inquiry.status === '답변완료' ? '답변완료' : '접수완료'}
                      </span>
                      <span className="text-[10px] text-zinc-600 font-bold tracking-widest">
                        {new Date(inquiry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-[15px] font-bold text-white truncate tracking-tight">{inquiry.title}</h4>
                  </div>
                  <ChevronRight size={18} className="text-zinc-800 group-hover:text-zinc-500 transition-colors" />
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Inquiry Detail Overlay */}
      <AnimatePresence>
        {isInquiryDetailOpen && selectedInquiry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black flex flex-col overflow-y-auto custom-scrollbar"
          >
            <div className="max-w-3xl mx-auto w-full px-6 py-12 md:py-20">
              <div className="flex items-center justify-between mb-12">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-[11px] font-black px-2.5 py-1 rounded uppercase tracking-widest ${
                      selectedInquiry.status === '답변완료' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {selectedInquiry.status === '답변완료' ? '답변완료' : '접수완료'}
                    </span>
                    <span className="text-[11px] text-zinc-600 font-bold tracking-widest">
                      {new Date(selectedInquiry.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 className="text-3xl font-black text-white tracking-tighter leading-tight">{selectedInquiry.title}</h2>
                </div>
                <button
                  onClick={() => setIsInquiryDetailOpen(false)}
                  className="fixed top-8 right-8 p-3 bg-white/5 hover:bg-white/10 rounded-full text-zinc-500 hover:text-white transition-all active:scale-90"
                >
                  <X size={32} />
                </button>
              </div>

              <div className="space-y-12">
                {/* User Content */}
                <div className="space-y-4">
                  <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest ml-1">문의 내용</label>
                  <div className="bg-[#1C1C1E] border border-white/5 rounded-3xl p-8 shadow-2xl">
                    <p className="text-zinc-300 text-lg leading-relaxed whitespace-pre-wrap tracking-tight">
                      {selectedInquiry.content}
                    </p>
                  </div>
                </div>

                {/* Admin Answer */}
                <div className="space-y-4">
                  <label className="text-[11px] font-black text-indigo-500 uppercase tracking-widest ml-1">[관리자 답변]</label>
                  <div className={`rounded-3xl p-8 shadow-2xl border ${
                    selectedInquiry.answer 
                      ? 'bg-indigo-500/5 border-indigo-500/10' 
                      : 'bg-zinc-900/50 border-white/5'
                  }`}>
                    {selectedInquiry.answer ? (
                      <p className="text-white text-lg leading-relaxed whitespace-pre-wrap tracking-tight">
                        {selectedInquiry.answer}
                      </p>
                    ) : (
                      <p className="text-zinc-600 text-lg font-medium italic tracking-tight">
                        답변을 준비 중입니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <InquiryModal 
        isOpen={isInquiryModalOpen} 
        onClose={() => {
          setIsInquiryModalOpen(false);
          fetchInquiries();
        }} 
      />
    </div>
  );
}
