import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import {
  ChevronLeft, Plus, MessageSquare, Loader2, Send, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function inquiryStatusLabel(status: unknown): string {
  const value = typeof status === 'string' ? status.trim() : '';
  if (value === 'pending' || value === '답변대기' || value === '답변 대기') return '답변 대기';
  if (value === '답변완료') return '답변완료';
  return '처리 중';
}

export default function InquiryModal({ isOpen, onClose }: InquiryModalProps) {
  const { user, openProfile } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();

  const [inquiries, setInquiries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const fetchGen = useRef(0);
  const mounted = useRef(true);
  const formDirty = title.trim().length > 0 || content.trim().length > 0;

  const returnToHub = useCallback(() => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  }, [onClose, openProfile]);

  const leaveOneLayer = useCallback(() => {
    if (showForm) {
      setShowForm(false);
      return;
    }
    if (selectedInquiry) {
      setSelectedInquiry(null);
      return;
    }
    returnToHub();
  }, [showForm, selectedInquiry, returnToHub]);

  const onBackdrop = useCallback(() => {
    if (showForm) {
      if (formDirty) return;
      setShowForm(false);
      return;
    }
    if (selectedInquiry) {
      setSelectedInquiry(null);
      return;
    }
    returnToHub();
  }, [showForm, formDirty, selectedInquiry, returnToHub]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      setShowForm(false);
      setSelectedInquiry(null);
      setTitle('');
      setContent('');
      setSubmitError('');
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
      leaveOneLayer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, leaveOneLayer]);

  const fetchInquiries = useCallback(async () => {
    if (!user) return;
    const gen = ++fetchGen.current;
    try {
      setIsLoading(true);
      setLoadError(false);
      const { data, error } = await supabase
        .from('cs_inquiries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!mounted.current || gen !== fetchGen.current) return;
      setInquiries(data || []);
    } catch {
      if (!mounted.current || gen !== fetchGen.current) return;
      setLoadError(true);
    } finally {
      if (mounted.current && gen === fetchGen.current) setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && isOpen) {
      void fetchInquiries();
    }
  }, [user, isOpen, fetchInquiries]);

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
      setSubmitError('');
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!currentUser) {
        setSubmitError('문의를 보내지 못했습니다. 다시 시도해 주세요.');
        return;
      }

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

      setTitle('');
      setContent('');
      setShowForm(false);
      showToast('문의가 등록되었습니다.', 'success');
      void fetchInquiries();
    } catch {
      const message = '문의를 보내지 못했습니다. 다시 시도해 주세요.';
      setSubmitError(message);
      showToast(message, 'error');
    } finally {
      if (mounted.current) setIsSubmitting(false);
    }
  };

  const fieldClass = cn(
    'w-full h-12 rounded-[2px] border px-4 text-base tracking-tight focus:outline-none focus-ring',
    theme === 'dark'
      ? 'border-white/20 bg-transparent text-[#f3f1ec] placeholder:text-[#8d887e]'
      : 'border-black/15 bg-transparent text-[#16150f] placeholder:text-[#6b675f]',
  );
  const labelClass = `text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`;
  const backLabel = showForm || selectedInquiry ? '목록으로' : '내 정보로 돌아가기';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="inquiry-title"
          className={cn('fixed inset-0 flex justify-end pointer-events-auto', zClass('sheet'))}
        >
          <button
            type="button"
            aria-label={showForm && formDirty ? '작성 중인 문의' : backLabel}
            onClick={onBackdrop}
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
                  onClick={leaveOneLayer}
                  aria-label={backLabel}
                  className={`p-2 rounded-full transition-all focus-ring ${
                    theme === 'dark' ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 id="inquiry-title" className="text-[1.75rem] font-medium tracking-[-0.02em]">1:1 문의</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar overscroll-contain touch-pan-y">
              <div className="pb-[max(2rem,env(safe-area-inset-bottom))]">
                <AnimatePresence mode="wait">
                  {showForm ? (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-8"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <h3 className="text-xl font-medium tracking-[-0.02em]">문의 남기기</h3>
                          <p className={`text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>궁금하신 점을 남겨주시면 답변해 드리겠습니다.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowForm(false)}
                          aria-label="문의 작성 닫기"
                          className={`p-2 rounded-full transition-all focus-ring ${theme === 'dark' ? 'hover:bg-white/5 text-zinc-500' : 'hover:bg-black/5 text-zinc-400'}`}
                        >
                          <X size={22} />
                        </button>
                      </div>

                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                          <label htmlFor="inquiry-subject" className={labelClass}>제목</label>
                          <input
                            id="inquiry-subject"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="문의 제목을 입력하세요"
                            className={cn(fieldClass, 'h-14')}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="inquiry-body" className={labelClass}>내용</label>
                          <textarea
                            id="inquiry-body"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="문의하실 내용을 상세히 적어주세요"
                            className={cn(fieldClass, 'h-[280px] p-5 resize-none leading-relaxed')}
                          />
                        </div>
                        {submitError && (
                          <div role="alert" className="text-red-500 text-sm font-medium text-center">{submitError}</div>
                        )}
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className={`w-full h-12 font-medium tracking-[-0.02em] rounded-[2px] flex items-center justify-center gap-2 disabled:opacity-50 focus-ring ${
                            theme === 'dark'
                              ? 'bg-[#f2f0ea] text-[#16150f]'
                              : 'bg-[#1a1914] text-[#f4f1eb]'
                          }`}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="animate-spin" size={20} />
                              보내는 중...
                            </>
                          ) : (
                            <>
                              <Send size={18} strokeWidth={2.5} />
                              <span>문의 보내기</span>
                            </>
                          )}
                        </button>
                      </form>
                    </motion.div>
                  ) : selectedInquiry ? (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-8"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedInquiry(null)}
                        className={`flex items-center gap-2 mb-2 focus-ring ${theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'}`}
                      >
                        <ChevronLeft size={20} />
                        <span className="text-sm font-medium">목록으로</span>
                      </button>

                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                            {inquiryStatusLabel(selectedInquiry.status)}
                          </span>
                          <span className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                            {new Date(selectedInquiry.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-2xl font-medium tracking-[-0.02em] leading-tight">{selectedInquiry.title}</h3>
                      </div>

                      <div className="space-y-8">
                        <div className="space-y-3">
                          <p className={`text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>문의 내용</p>
                          <div className="border-t border-black/10 pt-4 dark:border-white/10">
                            <p className="text-base leading-relaxed whitespace-pre-wrap">
                              {selectedInquiry.content}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <p className={`text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>관리자 답변</p>
                          <div className="border-t border-black/10 pt-4 dark:border-white/10">
                            {selectedInquiry.answer ? (
                              <p className="text-base leading-relaxed whitespace-pre-wrap">
                                {selectedInquiry.answer}
                              </p>
                            ) : (
                              <p className={`text-base ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
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
                      className="space-y-6"
                    >
                      <div className="flex justify-between items-end gap-3 mb-2">
                        <div className="space-y-1 min-w-0">
                          <h3 className="text-xl font-medium tracking-[-0.02em]">문의 내역</h3>
                          <p className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>남겨 주시면 답변을 드립니다.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowForm(true)}
                          className="h-12 px-4 font-medium rounded-[2px] flex items-center gap-2 shrink-0 focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]"
                        >
                          <Plus size={16} strokeWidth={3} />
                          <span>새 문의</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {isLoading && inquiries.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Loader2 className={`animate-spin ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} size={28} />
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>문의 내역을 불러오는 중</p>
                          </div>
                        ) : loadError && inquiries.length === 0 ? (
                          <div className="py-24 text-center">
                            <p className={`font-medium mb-4 ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>문의 내역을 불러오지 못했습니다.</p>
                            <button
                              type="button"
                              onClick={() => { void fetchInquiries(); }}
                              className="h-12 px-5 font-medium rounded-[2px] focus-ring bg-[#1a1914] text-[#f4f1eb] dark:bg-[#f2f0ea] dark:text-[#16150f]"
                            >
                              다시 시도
                            </button>
                          </div>
                        ) : inquiries.length === 0 ? (
                          <div className="py-24 text-center">
                            <MessageSquare size={40} strokeWidth={1} className={`mx-auto mb-4 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`} />
                            <p className={`font-medium ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>문의 내역이 없습니다.</p>
                          </div>
                        ) : (
                          inquiries.map((inquiry) => (
                            <button
                              key={inquiry.id}
                              type="button"
                              onClick={() => setSelectedInquiry(inquiry)}
                              className="w-full border-b border-black/10 py-5 text-left focus-ring dark:border-white/10"
                            >
                              <div className="flex justify-between items-center">
                                <span className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                                  {inquiryStatusLabel(inquiry.status)}
                                </span>
                                <span className={`text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                                  {new Date(inquiry.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <h4 className="text-lg font-medium tracking-[-0.02em] truncate">{inquiry.title}</h4>
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
