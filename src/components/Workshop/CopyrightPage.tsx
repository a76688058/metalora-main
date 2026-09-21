import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import Header from '../Header';

interface CopyrightPageProps {
  onAgree: () => void;
  hideHeader?: boolean;
}

export default function CopyrightPage({ onAgree, hideHeader = false }: CopyrightPageProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
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
          onAgree();
        }
      } catch (err) {
        console.error('Error checking initial agreement:', err);
      } finally {
        setIsChecking(false);
      }
    };

    checkInitialAgreement();

    const fetchIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) throw new Error('Primary IP fetch failed');
        const data = await response.json();
        setClientIp(data.ip);
      } catch (err) {
        try {
          const cfResponse = await fetch('https://1.1.1.1/cdn-cgi/trace');
          if (cfResponse.ok) {
            const text = await cfResponse.text();
            const ipMatch = text.match(/ip=(.*)/);
            if (ipMatch && ipMatch[1]) {
              setClientIp(ipMatch[1]);
              return;
            }
          }
        } catch (innerErr) {
          // Both failed, ignore silently
        }
      }
    };

    fetchIp();
  }, [user, onAgree]);

  const toggleAgreement = (key: keyof typeof agreements) => {
    setAgreements(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAgree = async () => {
    if (!allAgreed || !user) return;
    setIsSubmitting(true);

    try {
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
    } catch (err) {
      console.error('Error logging agreement:', err);
      showToast('네트워크 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
        <Loader2 className="w-8 h-8 animate-spin text-text-secondary" />
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
    <div className={`flex flex-col h-full overflow-hidden ${hideHeader ? '' : 'min-h-screen'} ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}>
      {!hideHeader && <Header />}

      <div className={`flex-none px-6 ${hideHeader ? 'pt-16 pb-6' : 'pt-24 pb-6'}`}>
        <div className="mx-auto max-w-3xl">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="type-page-title text-pretty text-text-primary [word-break:keep-all]"
          >
            약관을 끝까지 읽고{"\n"}동의를 완료해 주세요
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="type-metadata mt-2 text-text-tertiary"
          >
            약관 번호: ML_Legal_v260325
          </motion.p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-20 scrollbar-hide overscroll-contain touch-pan-y">
        <div className="mx-auto max-w-3xl space-y-3">
          {articles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * index }}
              onClick={() => toggleAgreement(article.id)}
              className={`flex cursor-pointer gap-4 rounded-xl border p-5 transition-colors ${
                agreements[article.id]
                  ? 'border-text-primary/30 bg-surface'
                  : 'border-border-subtle hover:border-border-subtle'
              }`}
            >
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  agreements[article.id]
                    ? 'border-text-primary bg-text-primary text-text-inverse'
                    : 'border-border-subtle bg-transparent'
                }`}
              >
                {agreements[article.id] && <Check size={14} />}
              </div>
              <div className="space-y-2">
                <span className="type-label block text-text-primary">
                  {article.title}
                </span>
                <p className="type-metadata leading-relaxed text-text-secondary">
                  {article.content}
                </p>
              </div>
            </motion.div>
          ))}

          <div className="pb-20 pt-8">
            <div className="mb-6 flex justify-center">
              <span className="type-metadata text-text-tertiary">
                동의 진행 <span className="text-text-primary">{agreedCount}</span> / 4
              </span>
            </div>

            <AnimatePresence>
              {allAgreed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <button
                    type="button"
                    onClick={handleAgree}
                    disabled={isSubmitting}
                    className="focus-ring flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-text-primary type-label text-text-inverse transition-opacity disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-text-inverse/30 border-t-text-inverse" />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    <span>{isSubmitting ? '기록 중...' : '동의하고 계속하기'}</span>
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
