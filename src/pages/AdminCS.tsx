import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/admin/AdminLayout';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, CheckCircle, Clock, X, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';

interface CSInquiry {
  id: string;
  created_at: string;
  user_id: string;
  phone_number?: string;
  title: string;
  content: string;
  answer?: string;
  status: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 flex items-center gap-1 w-fit"><Clock size={12} /> 답변대기</span>;
    case '답변완료':
      return <span className="px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-400 text-xs font-medium border border-zinc-500/20 flex items-center gap-1 w-fit"><CheckCircle size={12} /> 답변완료</span>;
    default:
      return <span className="px-2.5 py-1 rounded-full bg-zinc-500/10 text-zinc-400 text-xs font-medium border border-zinc-500/20 flex items-center gap-1 w-fit">{status}</span>;
  }
};

export default function AdminCS() {
  const [inquiries, setInquiries] = useState<CSInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  // Bottom Sheet State
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<CSInquiry | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInquiries = async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cs_inquiries')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) setInquiries(data);
    } catch (error) {
      showToast("잠시 후 다시 시도해주세요.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, []);

  const handleRowClick = (inquiry: CSInquiry) => {
    setSelectedInquiry(inquiry);
    setAnswerText(inquiry.answer || '');
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setSelectedInquiry(null);
    setAnswerText('');
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;
    if (!answerText.trim()) {
      showToast("답변 내용을 입력해주세요.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      
      // 알림톡 연동을 위한 데이터 바인딩 (현재는 DB 업데이트만)
      const payload = {
        answer: answerText,
        status: '답변완료',
      };

      const { error } = await supabase
        .from('cs_inquiries')
        .update(payload)
        .eq('id', selectedInquiry.id);

      if (error) throw error;

      showToast("답변이 성공적으로 등록되었습니다.", "success");
      
      // 로컬 상태 업데이트
      setInquiries(prev => prev.map(inq => 
        inq.id === selectedInquiry.id 
          ? { ...inq, answer: answerText, status: '답변완료' } 
          : inq
      ));
      
      closeSheet();
    } catch (error) {
      showToast("잠시 후 다시 시도해주세요.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            1:1 고객 문의
            <span className="text-sm font-normal text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{inquiries.length}</span>
          </h2>
        </div>

        {/* 문의 리스트 */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="bg-zinc-800/80 text-xs uppercase font-medium text-zinc-500 border-b border-zinc-800 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-4">상태</th>
                  <th className="px-6 py-4">문의내용</th>
                  <th className="px-6 py-4">작성일시</th>
                  <th className="px-6 py-4">고객 ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-16" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-48" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                    </tr>
                  ))
                ) : inquiries.length > 0 ? (
                  inquiries.map((inquiry) => (
                    <tr 
                      key={inquiry.id} 
                      onClick={() => handleRowClick(inquiry)}
                      className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        {getStatusBadge(inquiry.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white font-medium line-clamp-1 max-w-md">
                          {inquiry.title}
                        </div>
                        <div className="text-zinc-500 text-xs line-clamp-1 max-w-md mt-1">
                          {inquiry.content}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {new Date(inquiry.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-500">
                        {inquiry.user_id.substring(0, 8)}...
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-zinc-500">
                      <div className="flex flex-col items-center gap-2">
                        <MessageSquare size={32} className="opacity-20" />
                        <p>등록된 문의가 없습니다.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 답변 작성 바텀 시트 */}
      <AnimatePresence>
        {isSheetOpen && selectedInquiry && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeSheet}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 220, mass: 0.8 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.y > 150 || velocity.y > 500) {
                  closeSheet();
                }
              }}
              className="fixed bottom-0 left-0 right-0 z-50 w-full max-w-lg mx-auto bg-zinc-900 rounded-t-[24px] rounded-b-none border-t border-zinc-800 shadow-2xl max-h-[90vh] pb-safe mt-auto flex flex-col will-change-transform"
            >
              <div className="flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing">
                <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto my-3" />
              </div>
              
              <div className="px-6 pb-4 flex justify-between items-center border-b border-zinc-800">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <MessageSquare size={20} className="text-indigo-400" />
                  문의 답변
                </h3>
                <button onClick={closeSheet} className="p-2 text-zinc-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* 질문 영역 */}
                <div className="bg-zinc-800/50 p-5 rounded-2xl border border-zinc-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">Q</span>
                    <span className="text-sm font-medium text-zinc-400">고객 문의내용 ({selectedInquiry.title})</span>
                  </div>
                  <p className="text-white leading-relaxed whitespace-pre-wrap">
                    {selectedInquiry.content}
                  </p>
                  <div className="mt-4 pt-4 border-t border-zinc-700/50 text-xs text-zinc-500 flex justify-between">
                    <span>작성일: {new Date(selectedInquiry.created_at).toLocaleString()}</span>
                    <span>ID: {selectedInquiry.user_id}</span>
                  </div>
                </div>

                {/* 답변 폼 */}
                <form onSubmit={handleAnswerSubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">A</span>
                      <label className="text-sm font-medium text-zinc-400">관리자 답변</label>
                    </div>
                    <textarea
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="고객에게 전달할 답변을 입력하세요..."
                      rows={6}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={closeSheet}
                      className="flex-1 py-3.5 rounded-xl text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-white transition-colors font-medium"
                    >
                      닫기
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !answerText.trim()}
                      className="flex-[2] py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        '답변 등록 (알림톡 발송 대기)'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}
