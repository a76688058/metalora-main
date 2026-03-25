import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Header from '../Header';
import { useNavigate } from 'react-router-dom';

interface CopyrightPageProps {
  onAgree: () => void;
}

export default function CopyrightPage({ onAgree }: CopyrightPageProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agreements, setAgreements] = useState({
    article1: false,
    article2: false,
    article3: false,
    article4: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [clientIp, setClientIp] = useState<string>('unknown');

  const allAgreed = Object.values(agreements).every(v => v);
  const agreedCount = Object.values(agreements).filter(v => v).length;

  useEffect(() => {
    const checkInitialAgreement = async () => {
      if (!user) {
        setIsChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_agreements')
          .select('*')
          .eq('user_id', user.id)
          .eq('agreement_version', 'ML_Legal_v260325')
          .single();

        if (data && !error) {
          // Already agreed, redirect
          onAgree();
          navigate('/workshop/lobby');
        }
      } catch (err) {
        console.error('Error checking initial agreement:', err);
      } finally {
        setIsChecking(false);
      }
    };

    checkInitialAgreement();

    // Fetch IP address for logging
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip))
      .catch(err => console.error('Failed to fetch IP:', err));
  }, [user, onAgree, navigate]);

  const toggleAgreement = (key: keyof typeof agreements) => {
    setAgreements(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAgree = async () => {
    if (!allAgreed || !user) return;
    setIsSubmitting(true);

    try {
      // Log agreement to Supabase (user_agreements table)
      const { error } = await supabase
        .from('user_agreements')
        .insert({
          user_id: user.id,
          agreement_version: 'ML_Legal_v260325',
          ip_address: clientIp,
          agreed_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      onAgree();
      navigate('/workshop/lobby');
    } catch (err) {
      console.error('Error logging agreement:', err);
      alert('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  const articles = [
    {
      id: 'article1' as const,
      title: '제1조 [기술적 중립성 및 수동적 전달자 지위]',
      content: 'METALORA는 이용자가 업로드한 데이터를 AI 기술로 가공하여 출력하는 기술 및 도구 제공 플랫폼입니다. 당사는 이용자가 생성하는 콘텐츠를 사전에 검수하거나 편집하지 않는 수동적 전달자(Passive Conduit)로서, 기술적 중립성을 유지하며 개별 콘텐츠의 위법성을 인지하지 못함을 고지합니다.'
    },
    {
      id: 'article2' as const,
      title: '제2조 [이용자의 권리 확약 및 보증]',
      content: '이용자는 업로드 및 AI로 생성하는 모든 이미지(인물, 캐릭터 등)에 대하여 저작권, 초상권 및 퍼블리시티권을 적법하게 보유하고 있음을 보증합니다. 권리자의 허가 없는 무단 사용으로 발생하는 모든 법적 책임은 이용자에게 귀속되며, 당사를 기망하여 발생한 문제에 대해 당사는 일절 책임지지 않습니다.'
    },
    {
      id: 'article3' as const,
      title: '제3조 [데이터 즉시 파기 및 복구 불가]',
      content: '개인정보 보호 및 보안 정책에 따라, 제작 완료 및 출고 시 모든 이미지 데이터는 서버에서 즉시 영구 삭제(Permanent Delete)됩니다. 데이터가 잔존하지 않으므로 당사는 사후 증빙 의무가 없으며, 삭제된 데이터의 복구 요청 또한 거부될 수 있습니다.'
    },
    {
      id: 'article4' as const,
      title: '제4조 [면책 및 손해배상 청구]',
      content: '이용자의 위반 행위로 인해 METALORA가 제3자로부터 소송, 합의금 청구 등 법적 분쟁에 휘말릴 경우, 이용자는 변호사 선임비를 포함한 모든 법률 비용 및 배상금 전액을 부담하여 당사를 면책시켜야 합니다.'
    }
  ];

  return (
    <div className="min-h-screen bg-black flex flex-col overflow-hidden">
      <Header />
      
      {/* Fixed Header Area */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black pt-24 pb-6 px-6 touch-none">
        <div className="max-w-xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold leading-tight text-white whitespace-pre-line"
          >
            약관을 끝까지 읽고{"\n"}동의를 완료해 주세요
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs text-zinc-600 mt-2"
          >
            약관 번호: ML_Legal_v260325
          </motion.p>
        </div>
      </div>

      {/* Article Checkbox List (Scrollable Area) */}
      <div className="flex-1 overflow-y-auto mt-[220px] px-6 pb-20 scrollbar-hide">
        <div className="max-w-xl mx-auto space-y-4">
          {articles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              onClick={() => toggleAgreement(article.id)}
              className={`flex gap-4 p-6 rounded-2xl cursor-pointer border transition-all duration-300 ${
                agreements[article.id] 
                  ? 'bg-purple-600/10 border-purple-600/30' 
                  : 'bg-zinc-900/30 border-white/5 hover:border-white/10'
              }`}
            >
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 mt-0.5 ${
                agreements[article.id] ? 'bg-purple-600' : 'bg-zinc-800 border border-white/10'
              }`}>
                {agreements[article.id] && <Check size={14} className="text-white" />}
              </div>
              <div className="space-y-2">
                <span className={`text-sm font-bold block transition-colors ${
                  agreements[article.id] ? 'text-white' : 'text-[#E2E2E2]'
                }`}>
                  {article.title}
                </span>
                <p className="text-xs text-[#E2E2E2]/70 leading-relaxed">
                  {article.content}
                </p>
              </div>
            </motion.div>
          ))}

          {/* Progress Indicator & Activation Button */}
          <div className="pt-10 pb-20">
            <div className="flex justify-center mb-6">
              <div className="px-4 py-1.5 bg-zinc-900/50 rounded-full border border-white/5">
                <span className="text-[10px] font-bold tracking-widest text-zinc-500">
                  PROGRESS: <span className={agreedCount === 4 ? 'text-purple-500' : 'text-white'}>{agreedCount}</span> / 4 COMPLETED
                </span>
              </div>
            </div>

            <AnimatePresence>
              {allAgreed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <button 
                    onClick={handleAgree}
                    disabled={isSubmitting}
                    className="w-full py-5 rounded-2xl bg-[#8A2BE2] text-white font-bold text-lg shadow-[0_0_30px_rgba(138,43,226,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 size={20} />
                    )}
                    <span>{isSubmitting ? '기록 중...' : '동의하고 입장하기'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
