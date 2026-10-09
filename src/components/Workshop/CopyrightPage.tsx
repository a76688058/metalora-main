import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import Header from '../Header';
import { recordPolicyConsent } from '../../lib/consentLedger';
import { POLICY_TYPES, POLICY_VERSIONS } from '../../lib/policyVersions';
import { policies } from '../../constants/policies';

interface CopyrightPageProps {
  onAgree: () => void;
  hideHeader?: boolean;
}

export default function CopyrightPage({ onAgree, hideHeader = false }: CopyrightPageProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [hasReadAndAgreed, setHasReadAndAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAgree = async () => {
    if (!hasReadAndAgreed || !user) return;
    setIsSubmitting(true);

    try {
      const recorded = await recordPolicyConsent(supabase, {
        policyType: POLICY_TYPES.workshopCustom,
        policyVersion: POLICY_VERSIONS.workshop_custom,
        source: 'workshop',
      });

      if (!recorded) {
        throw new Error('consent_record_failed');
      }

      onAgree();
    } catch (err) {
      console.error('Error logging agreement:', err);
      showToast('네트워크 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${hideHeader ? '' : 'min-h-screen'} ${theme === 'dark' ? 'bg-black' : 'bg-white'}`}
    >
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
            약관 번호: {POLICY_VERSIONS.workshop_custom}
          </motion.p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-20 scrollbar-hide overscroll-contain touch-pan-y">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="type-label mb-6 text-text-primary">
              {policies.agreement.title}
            </h2>
            <div className="text-text-secondary">
              {policies.agreement.content}
            </div>
          </motion.div>

          <div className="pb-20 pt-8">
            <label
              className={`relative mb-6 flex cursor-pointer gap-4 rounded-xl border p-5 transition-colors ${
                hasReadAndAgreed
                  ? 'border-text-primary/30 bg-surface'
                  : 'border-border-subtle hover:border-border-subtle'
              }`}
            >
              <input
                type="checkbox"
                checked={hasReadAndAgreed}
                onChange={(event) => setHasReadAndAgreed(event.target.checked)}
                className="sr-only left-0 top-0"
              />
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  hasReadAndAgreed
                    ? 'border-text-primary bg-text-primary text-text-inverse'
                    : 'border-border-subtle bg-transparent'
                }`}
                aria-hidden="true"
              >
                {hasReadAndAgreed && <Check size={14} />}
              </div>
              <span className="type-metadata leading-relaxed text-text-secondary">
                위 WORKSHOP 제작 및 콘텐츠 이용 동의서({POLICY_VERSIONS.workshop_custom})를 확인하였으며 동의합니다.
              </span>
            </label>

            <AnimatePresence>
              {hasReadAndAgreed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void handleAgree();
                    }}
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
