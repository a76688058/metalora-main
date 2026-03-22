import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Loader2, User, Mail, Phone, MapPin, Search, 
  MessageSquare, ChevronDown, ChevronRight, Plus, X, 
  ShoppingBag, LogOut, Package
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';
import InquiryModal from '../components/InquiryModal';

// --- Sub-components ---

const Drawer = ({ isOpen, onClose, title, children }: any) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-xl z-[10001] bg-black border-l border-white/10 shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="relative z-20 p-8 border-b border-white/10 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl pointer-events-auto">
              <h2 className="text-2xl font-black tracking-tighter text-white uppercase">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-full text-zinc-500 hover:text-white transition-all active:scale-90"
              >
                <X size={28} />
              </button>
            </div>
            <div className="relative z-10 flex-1 !overflow-y-auto p-8 custom-scrollbar bg-gradient-to-b from-black to-zinc-950" style={{ WebkitOverflowScrolling: 'touch' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const OrderStepper = ({ status }: { status: string }) => {
  const steps = ['결제완료', '제품공정', '배송시작', '배송완료'];
  
  const getActiveStep = (status: string) => {
    switch (status) {
      case '결제완료': return 0;
      case '제작중': return 1;
      case '배송중': return 2;
      case '구매확정': return 3;
      default: return -1;
    }
  };

  const activeIndex = getActiveStep(status);

  return (
    <div className="w-full pt-6 pb-2">
      <div className="relative flex justify-between items-center px-2">
        {/* Background Line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/5 z-0" />
        
        {steps.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;
          
          return (
            <div key={step} className="relative z-10 flex flex-col items-center gap-3">
              <div 
                className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                  isActive 
                    ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] scale-125' 
                    : isCompleted 
                      ? 'bg-zinc-400' 
                      : 'bg-zinc-800'
                }`} 
              />
              <span className={`text-[9px] font-light tracking-tighter uppercase ${
                isActive ? 'text-white font-medium' : 'text-zinc-600'
              }`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function Profile() {
  const { user, profile, refreshProfile, signOut, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  const [isInquiryDetailOpen, setIsInquiryDetailOpen] = useState(false);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isOrdersDrawerOpen, setIsOrdersDrawerOpen] = useState(false);
  const [isInquiryDrawerOpen, setIsInquiryDrawerOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);

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

  const fetchProfileData = async () => {
    if (!user) return;
    try {
      if (profile) {
        setFormData({
          full_name: profile.full_name || '',
          phone_number: profile.phone_number || '',
          zip_code: profile.zip_code || '',
          address: profile.address || '',
          address_detail: profile.address_detail || '',
        });
      }
    } catch (error: any) {
      console.error('Error setting profile data:', error);
    }
  };

  const fetchInquiries = async () => {
    if (!user) return;
    try {
      // Only show loading state if we don't have data yet (Initial Load)
      if (inquiries.length === 0) setIsLoadingInquiries(true);
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

  const fetchOrders = async () => {
    if (!user) return;
    try {
      // Only show loading state if we don't have data yet (Initial Load)
      if (orders.length === 0) setIsLoadingOrders(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
    fetchInquiries();
    fetchOrders();
  }, [user, profile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
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
        .eq('id', user?.id);

      if (error) throw error;
      
      await refreshProfile();
      showToast("정보가 성공적으로 수정되었습니다.", 'success');
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (error: any) {
      showToast("수정 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Only show skeleton on initial load when profile data is missing
  if (authLoading && !profile) {
    return (
      <div className="min-h-screen bg-black pt-20 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-20 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!user || !profile) return null;

  return (
    <div className="min-h-[60vh] bg-black pt-20 pb-12 px-6">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header Section */}
        <div className="flex items-end justify-between mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-light tracking-tight text-zinc-400"
          >
            환영합니다, <span className="text-white font-normal">{profile.full_name || '회원'}</span> 님.
          </motion.h1>
          <motion.button 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => signOut()}
            className="p-3 text-zinc-500 hover:text-white transition-all active:scale-90 bg-white/5 rounded-full border border-white/5"
          >
            <LogOut size={24} strokeWidth={1} />
          </motion.button>
        </div>

        {/* Unified Activity List */}
        <div className="max-w-2xl">
          <div className="space-y-0 border-t border-white/10">
            {/* Profile Management */}
            <button 
              onClick={() => setIsProfileDrawerOpen(true)}
              className="w-full py-8 flex items-center justify-between group border-b border-white/10 hover:bg-white/[0.02] transition-all px-2"
            >
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-zinc-500/10 flex items-center justify-center border border-zinc-500/20 group-hover:bg-zinc-500/20 transition-all">
                  <User size={24} strokeWidth={1} className="text-zinc-400" />
                </div>
                <div className="text-left">
                  <p className="text-white text-lg font-bold tracking-tight">프로필 관리</p>
                  <p className="text-zinc-500 text-sm">회원 정보 및 배송지 설정</p>
                </div>
              </div>
              <ChevronRight size={24} strokeWidth={1} className="text-zinc-700 group-hover:text-white transition-all" />
            </button>

            {/* Order History */}
            <button 
              onClick={() => setIsOrdersDrawerOpen(true)}
              className="w-full py-8 flex items-center justify-between group border-b border-white/10 hover:bg-white/[0.02] transition-all px-2"
            >
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all">
                  <ShoppingBag size={24} strokeWidth={1} className="text-indigo-400" />
                </div>
                <div className="text-left">
                  <p className="text-white text-lg font-bold tracking-tight">주문 내역</p>
                  <p className="text-zinc-500 text-sm">{orders.length}개의 주문</p>
                </div>
              </div>
              <ChevronRight size={24} strokeWidth={1} className="text-zinc-700 group-hover:text-white transition-all" />
            </button>

            {/* 1:1 Inquiry */}
            <button 
              onClick={() => setIsInquiryDrawerOpen(true)}
              className="w-full py-8 flex items-center justify-between group border-b border-white/10 hover:bg-white/[0.02] transition-all px-2"
            >
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
                  <MessageSquare size={24} strokeWidth={1} className="text-amber-400" />
                </div>
                <div className="text-left">
                  <p className="text-white text-lg font-bold tracking-tight">1:1 문의</p>
                  <p className="text-zinc-500 text-sm">{inquiries.length}개의 문의</p>
                </div>
              </div>
              <ChevronRight size={24} strokeWidth={1} className="text-zinc-700 group-hover:text-white transition-all" />
            </button>
          </div>
        </div>
      </div>

      {/* --- Drawers --- */}

      <Drawer 
        isOpen={isProfileDrawerOpen} 
        onClose={() => setIsProfileDrawerOpen(false)} 
        title="프로필 관리"
      >
        <form onSubmit={handleUpdateProfile} className="space-y-12 pb-12">
          {/* Basic Info Section */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-6">Basic Information</h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">아이디</label>
                  <input
                    type="text"
                    disabled
                    value={profile.user_custom_id || ''}
                    className="w-full h-14 bg-black/40 border border-white/5 rounded-xl px-5 text-zinc-600 cursor-not-allowed text-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">이름</label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-xl px-5 text-white focus:outline-none focus:border-white/30 transition-all text-sm font-medium"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">연락처</label>
                <input
                  type="tel"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-xl px-5 text-white focus:outline-none focus:border-white/30 transition-all text-sm font-medium"
                />
              </div>
            </div>
          </section>

          {/* Shipping Info Section */}
          <section className="space-y-6 pt-12 border-t border-white/5">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600">Shipping Address</h3>
              <button
                type="button"
                onClick={handleOpenPostcode}
                className="text-[10px] font-black text-white bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20 transition-all uppercase tracking-widest"
              >
                주소 검색
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                readOnly
                value={formData.zip_code}
                placeholder="우편번호"
                className="w-32 h-14 bg-black/40 border border-white/5 rounded-xl px-5 text-zinc-400 text-sm font-medium"
              />
              <input
                type="text"
                readOnly
                value={formData.address}
                placeholder="기본 주소"
                className="w-full h-14 bg-black/40 border border-white/5 rounded-xl px-5 text-zinc-400 text-sm font-medium"
              />
              <input
                type="text"
                ref={detailAddressRef}
                value={formData.address_detail}
                onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                placeholder="상세 주소"
                className="w-full h-14 bg-white/[0.03] border border-white/10 rounded-xl px-5 text-white focus:outline-none focus:border-white/30 transition-all text-sm font-medium"
              />
            </div>
          </section>

          {/* Integrated Save Button */}
          <div className="pt-8 border-t border-white/5">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-16 bg-white text-black font-black rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 shadow-[0_20px_40px_rgba(255,255,255,0.1)]"
            >
              {isLoading && <Loader2 className="animate-spin" size={20} />}
              저장하기
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer 
        isOpen={isOrdersDrawerOpen} 
        onClose={() => setIsOrdersDrawerOpen(false)} 
        title="주문 내역"
      >
        <div className="space-y-6">
          {isLoadingOrders && orders.length === 0 ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-zinc-700" size={32} />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-32 border border-dashed border-white/10 rounded-3xl">
              <Package size={48} strokeWidth={1} className="mx-auto text-zinc-800 mb-4" />
              <p className="text-zinc-500 font-bold">주문 내역이 없습니다.</p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4 hover:bg-white/[0.06] transition-all group cursor-default">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{order.order_number}</p>
                    <p className="text-white font-bold tracking-tight">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black text-white uppercase tracking-widest">
                    {order.status}
                  </span>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-zinc-500 text-sm">결제 금액</span>
                    <span className="text-white font-black">₩{order.total_price?.toLocaleString()}</span>
                  </div>
                  <OrderStepper status={order.status} />
                  {order.courier && order.tracking_number && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Shipping Info</p>
                      <p className="text-xs text-zinc-300 font-medium tracking-tight">
                        {order.courier} <span className="text-white ml-2">{order.tracking_number}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Drawer>

      <Drawer 
        isOpen={isInquiryDrawerOpen} 
        onClose={() => setIsInquiryDrawerOpen(false)} 
        title="1:1 문의"
      >
        <div className="space-y-4">
          <button
            onClick={() => setIsInquiryModalOpen(true)}
            className="w-full h-16 bg-white text-black font-black rounded-2xl mb-8 flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Plus size={20} strokeWidth={1} />
            새 문의하기
          </button>
          
          {isLoadingInquiries && inquiries.length === 0 ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-zinc-700" size={32} />
            </div>
          ) : inquiries.length === 0 ? (
            <div className="text-center py-32 border border-dashed border-white/10 rounded-3xl">
              <MessageSquare size={48} strokeWidth={1} className="mx-auto text-zinc-800 mb-4" />
              <p className="text-zinc-500 font-bold">문의 내역이 없습니다.</p>
            </div>
          ) : (
            inquiries.map((inquiry) => (
              <button
                key={inquiry.id}
                onClick={() => {
                  setSelectedInquiry(inquiry);
                  setIsInquiryDetailOpen(true);
                }}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-6 text-left group hover:bg-white/[0.06] transition-all"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                    inquiry.status === '답변완료' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {inquiry.status}
                  </span>
                  <span className="text-[9px] text-zinc-600 font-bold tracking-widest">
                    {new Date(inquiry.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h4 className="text-white font-bold tracking-tight truncate">{inquiry.title}</h4>
              </button>
            ))
          )}
        </div>
      </Drawer>

      {/* Inquiry Detail Overlay */}
      <AnimatePresence>
        {isInquiryDetailOpen && selectedInquiry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[20000] bg-black flex flex-col !overflow-y-auto custom-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch' }}
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
                      {selectedInquiry.status}
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
                <div className="space-y-4">
                  <label className="text-[11px] font-black text-zinc-600 uppercase tracking-widest ml-1">문의 내용</label>
                  <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 shadow-2xl">
                    <p className="text-zinc-300 text-lg leading-relaxed whitespace-pre-wrap tracking-tight">
                      {selectedInquiry.content}
                    </p>
                  </div>
                </div>

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
