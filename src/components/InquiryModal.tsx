import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { 
  ChevronLeft, Plus, MessageSquare, Loader2, Send, X 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InquiryModal({ isOpen, onClose }: InquiryModalProps) {
  const { user, openProfile } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleBack = () => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  };

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      // Reset state when closed
      setShowForm(false);
      setSelectedInquiry(null);
      setTitle('');
      setContent('');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  const fetchInquiries = async () => {
    if (!user) return;
    try {
      setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && isOpen) {
      fetchInquiries();
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('로그인이 필요한 서비스입니다.', 'info');
      return;
    }
    if (!title.trim() || !content.trim()) {
      showToast('제목과 내용을 입력해주세요.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!currentUser) return;

      const { error } = await supabase
        .from('cs_inquiries')
        .insert([
          {
            user_id: currentUser.id,
            title: title.trim(),
            content: content.trim(),
            status: 'pending'
          }
        ]);

      if (error) throw error;

      showToast('문의가 접수되었습니다.', 'success');
      setTitle('');
      setContent('');
      setShowForm(false);
      fetchInquiries();
    } catch (error: any) {
      console.error('CS Inquiry Submission Failed:', error.message || error);
      showToast('문의 접수에 실패했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

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
                <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>1:1 문의</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <div className="max-w-2xl mx-auto pb-24">
                <AnimatePresence mode="wait">
                  {showForm ? (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-10"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <h2 className={`text-3xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>문의 남기기</h2>
                          <p className={`tracking-tight font-medium ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>궁금하신 점을 남겨주시면 빠르게 답변해 드리겠습니다.</p>
                        </div>
                        <button 
                          onClick={() => setShowForm(false)}
                          className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'hover:bg-white/5 text-zinc-500' : 'hover:bg-black/5 text-zinc-400'}`}
                        >
                          <X size={24} />
                        </button>
                      </div>

                      <form onSubmit={handleSubmit} className="space-y-10">
                        <div className="space-y-8">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-1 h-4 bg-amber-500 rounded-full" />
                              <label className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700'}`}>제목</label>
                            </div>
                            <input
                              type="text"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="문의 제목을 입력하세요"
                              className={`w-full h-18 border rounded-2xl px-6 text-lg transition-all tracking-tight font-medium focus:outline-none focus:ring-1 ${
                                theme === 'dark' 
                                  ? 'bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-700 focus:border-amber-500/50 focus:ring-amber-500/20' 
                                  : 'bg-zinc-50 border-black/10 text-black placeholder:text-zinc-300 focus:border-amber-500/50 focus:ring-amber-500/20'
                              }`}
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-1 h-4 bg-amber-500 rounded-full" />
                              <label className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700'}`}>내용</label>
                            </div>
                            <textarea
                              value={content}
                              onChange={(e) => setContent(e.target.value)}
                              placeholder="문의하실 내용을 상세히 적어주세요"
                              className={`w-full h-[350px] border rounded-2xl p-6 text-lg transition-all resize-none tracking-tight font-medium leading-relaxed focus:outline-none focus:ring-1 ${
                                theme === 'dark' 
                                  ? 'bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-700 focus:border-amber-500/50 focus:ring-amber-500/20' 
                                  : 'bg-zinc-50 border-black/10 text-black placeholder:text-zinc-300 focus:border-amber-500/50 focus:ring-amber-500/20'
                              }`}
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className={`w-full h-20 font-bold tracking-tight rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-xl active:scale-[0.98] ${
                            theme === 'dark' 
                              ? 'bg-white text-black hover:bg-zinc-200 shadow-[0_10px_30px_rgba(255,255,255,0.1)]' 
                              : 'bg-black text-white hover:bg-zinc-800 shadow-[0_10px_30px_rgba(0,0,0,0.1)]'
                          }`}
                        >
                          {isSubmitting ? (
                            <Loader2 className="animate-spin" size={28} />
                          ) : (
                            <>
                              <Send size={24} strokeWidth={2.5} />
                              <span>문의 보내기</span>
                            </>
                          )}
                        </button>
                      </form>
                    </motion.div>
                  ) : selectedInquiry ? (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-12"
                    >
                      <button 
                        onClick={() => setSelectedInquiry(null)}
                        className={`flex items-center gap-2 transition-colors mb-4 ${theme === 'dark' ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-black'}`}
                      >
                        <ChevronLeft size={20} />
                        <span className="text-sm font-bold">목록으로</span>
                      </button>

                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <span className={`text-[12px] font-bold px-3 py-1.5 rounded-xl uppercase tracking-widest ${
                            selectedInquiry.status === '답변완료' 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
                          }`}>
                            {selectedInquiry.status}
                          </span>
                          <span className={`text-[12px] font-bold tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            {new Date(selectedInquiry.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h2 className={`text-2xl font-bold tracking-tight leading-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{selectedInquiry.title}</h2>
                      </div>

                      <div className="space-y-12">
                        <div className="space-y-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1 h-3 rounded-full ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`} />
                            <label className={`text-[12px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>문의 내용</label>
                          </div>
                          <div className={`border rounded-[2rem] p-8 transition-colors duration-500 ${
                            theme === 'dark' ? 'bg-zinc-900/40 border-white/5' : 'bg-zinc-50 border-black/5'
                          }`}>
                            <p className={`text-lg leading-relaxed whitespace-pre-wrap tracking-tight font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                              {selectedInquiry.content}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-5">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-3 bg-amber-500 rounded-full" />
                            <label className="text-[12px] font-bold text-amber-500 uppercase tracking-widest">관리자 답변</label>
                          </div>
                          <div className={`rounded-[2rem] p-8 border transition-colors duration-500 ${
                            selectedInquiry.answer 
                              ? 'bg-amber-500/5 border-amber-500/10' 
                              : theme === 'dark' ? 'bg-zinc-900/20 border-white/5' : 'bg-zinc-50 border-black/5'
                          }`}>
                            {selectedInquiry.answer ? (
                              <p className={`text-lg leading-relaxed whitespace-pre-wrap tracking-tight font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                                {selectedInquiry.answer}
                              </p>
                            ) : (
                              <p className={`text-lg font-medium italic tracking-tight ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-300'}`}>
                                답변을 준비 중입니다. 잠시만 기다려주세요.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-8"
                    >
                      <div className="flex justify-between items-end mb-4">
                        <div className="space-y-1">
                          <h2 className={`text-3xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>문의 내역</h2>
                          <p className={`text-sm font-medium tracking-tight ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>고객님의 소중한 의견을 기다립니다.</p>
                        </div>
                        <button
                          onClick={() => setShowForm(true)}
                          className={`h-12 px-6 font-bold rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg ${
                            theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
                          }`}
                        >
                          <Plus size={18} strokeWidth={3} />
                          <span>새 문의</span>
                        </button>
                      </div>

                      <div className="space-y-4">
                        {isLoading && inquiries.length === 0 ? (
                          <div className="flex justify-center py-24">
                            <Loader2 className={`animate-spin ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`} size={32} />
                          </div>
                        ) : inquiries.length === 0 ? (
                          <div className={`text-center py-32 border border-dashed rounded-[2.5rem] transition-colors duration-500 ${
                            theme === 'dark' ? 'bg-zinc-900/20 border-white/5' : 'bg-zinc-50 border-black/5'
                          }`}>
                            <MessageSquare size={48} strokeWidth={1} className={`mx-auto mb-4 ${theme === 'dark' ? 'text-zinc-800' : 'text-zinc-200'}`} />
                            <p className={`font-medium ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>문의 내역이 없습니다.</p>
                          </div>
                        ) : (
                          inquiries.map((inquiry) => (
                            <button
                              key={inquiry.id}
                              onClick={() => setSelectedInquiry(inquiry)}
                              className={`w-full border rounded-[2rem] p-7 text-left group transition-all active:scale-[0.99] space-y-4 ${
                                theme === 'dark' ? 'bg-zinc-900/40 border-white/5 hover:bg-zinc-900/60' : 'bg-zinc-50 border-black/5 hover:bg-zinc-100'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className={`text-sm font-bold px-3 py-1.5 rounded-xl uppercase tracking-widest ${
                                  inquiry.status === '답변완료' 
                                    ? 'bg-emerald-500/10 text-emerald-400' 
                                    : theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
                                }`}>
                                  {inquiry.status}
                                </span>
                                <span className={`text-sm font-bold tracking-widest ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700'}`}>
                                  {new Date(inquiry.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <h4 className={`text-xl font-bold tracking-tight truncate group-hover:text-amber-400 transition-colors ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{inquiry.title}</h4>
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
