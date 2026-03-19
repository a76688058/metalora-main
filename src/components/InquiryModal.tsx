import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InquiryModal({ isOpen, onClose }: InquiryModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. 로그인 체크
    if (!user) {
      showToast('로그인이 필요한 서비스입니다.', 'info');
      // 로그인 모달 유도는 상위 컴포넌트에서 처리하거나 여기서 직접 열 수 없으므로 토스트로 안내
      return;
    }

    // 2. 데이터 검증
    if (!title.trim() || !content.trim()) {
      showToast('제목과 내용을 입력해주세요.', 'error');
      return;
    }

    try {
      setIsLoading(true);
      
      // Get current user session explicitly
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        showToast('로그인이 필요한 서비스입니다.', 'info');
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

      // 3. 성공 피드백
      showToast('문의가 접수되었습니다.', 'success');
      setTitle('');
      setContent('');
      onClose();
    } catch (error: any) {
      // 4. 상세 에러 콘솔 출력
      console.error('CS Inquiry Submission Failed:', error.message || error);
      showToast('문의 접수에 실패했습니다. 다시 시도해주세요.', 'error');
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
          className="fixed inset-0 z-[9999] bg-[#121212] w-screen h-screen flex flex-col overflow-y-auto custom-scrollbar p-6 md:p-10"
        >
          <div className="max-w-3xl mx-auto w-full my-auto">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-3xl font-bold text-white tracking-tight">1:1 문의하기</h2>
              <button
                onClick={onClose}
                className="fixed top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all active:scale-90 z-[10000]"
              >
                <X size={32} />
              </button>
            </div>

            <p className="text-zinc-500 text-lg mb-10 tracking-tight">궁금하신 점을 남겨주시면 빠르게 답변해 드리겠습니다.</p>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-3">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest ml-1">제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문의 제목을 입력하세요"
                  className="w-full h-16 bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 text-white text-lg placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-all tracking-tight"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-zinc-500 uppercase tracking-widest ml-1">내용</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="문의하실 내용을 상세히 적어주세요"
                  className="w-full h-[400px] bg-[#1C1C1E] border border-white/5 rounded-2xl p-6 text-white text-lg placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-all resize-none tracking-tight"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-20 bg-white text-black font-bold tracking-tight rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-xl mt-8 shadow-2xl shadow-white/5"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={28} />
                ) : (
                  <>
                    <Send size={24} />
                    <span>문의 보내기</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
