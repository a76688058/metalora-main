import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CopyrightPage from './Workshop/CopyrightPage';
import WorkshopView, { workshopSurfaceStyle } from './Workshop/WorkshopView';
import { supabase } from '../lib/supabase';
import { POLICY_TYPES, POLICY_VERSIONS } from '../lib/policyVersions';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

interface WorkshopOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkshopOverlay({ isOpen, onClose }: WorkshopOverlayProps) {
  const { user, openProfile, workshopOrigin } = useAuth();
  const { theme } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const [view, setView] = useState<'copyright' | 'workshop'>('copyright');
  const [isCheckingAgreement, setIsCheckingAgreement] = useState(true);
  const resumeCheckConsumedRef = useRef(false);
  const checkGenRef = useRef(0);
  const acceptedForUserIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const consumeResumeCheck = useCallback(() => {
    if (resumeCheckConsumedRef.current) return false;
    resumeCheckConsumedRef.current = true;
    return true;
  }, []);

  const handleAgree = useCallback(() => {
    acceptedForUserIdRef.current = userIdRef.current;
    checkGenRef.current += 1;
    setIsCheckingAgreement(false);
    setView('workshop');
  }, []);

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      // Reset only on true overlay close. Do not reset on open — that races
      // WorkshopView's first effect and lets the resume prompt fire again.
      resumeCheckConsumedRef.current = false;
      acceptedForUserIdRef.current = null;
      checkGenRef.current += 1;
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const acceptedFor = acceptedForUserIdRef.current;
    if (acceptedFor !== null && acceptedFor === userId) {
      return;
    }

    const gen = ++checkGenRef.current;
    let cancelled = false;
    const isCurrent = () => {
      if (cancelled || gen !== checkGenRef.current) return false;
      const accepted = acceptedForUserIdRef.current;
      if (accepted !== null && accepted === userId) return false;
      return true;
    };

    const checkAgreement = async () => {
      if (!userId) {
        if (isCurrent()) {
          setIsCheckingAgreement(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_agreements')
          .select('id')
          .eq('user_id', userId)
          .eq('policy_type', POLICY_TYPES.workshopCustom)
          .eq('agreement_version', POLICY_VERSIONS.workshop_custom)
          .limit(1)
          .maybeSingle();

        if (!isCurrent()) {
          return;
        }

        if (data && !error) {
          setView('workshop');
        } else {
          setView('copyright');
        }
      } catch (err) {
        console.error('Error checking agreement:', err);
        if (!isCurrent()) {
          return;
        }
        setView('copyright');
      } finally {
        if (isCurrent()) {
          setIsCheckingAgreement(false);
        }
      }
    };

    void checkAgreement();
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleExit = () => {
    const origin = workshopOrigin;
    onClose();
    if (origin === 'profile') {
      window.setTimeout(() => {
        openProfile();
      }, 100);
    }
  };

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : undefined}
      className="fixed inset-0 z-[40000] flex justify-end pointer-events-auto"
    >
      <div
        onClick={view === 'workshop' ? undefined : handleExit}
        className="absolute inset-0 bg-black/40 pointer-events-auto touch-none"
      />

      <motion.div
        initial={reducedMotion ? false : { x: '100%' }}
        animate={{ x: 0 }}
        exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
        className="pointer-events-auto relative flex h-full w-full transform-gpu flex-col overflow-hidden border-l border-border-subtle will-change-transform max-[1099px]:h-[100dvh] max-[1099px]:max-h-[100dvh]"
        style={workshopSurfaceStyle(theme)}
      >
        {isCheckingAgreement ? (
          <div className="flex-1 flex items-center justify-center" role="status" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
            <span className="sr-only">동의 상태를 확인하는 중</span>
          </div>
        ) : view === 'copyright' ? (
          <div className="relative flex-1 flex flex-col h-full overflow-hidden">
            <div className="absolute top-6 left-6 z-[101]">
              <button
                type="button"
                onClick={handleExit}
                className="focus-ring p-2 text-text-secondary hover:text-text-primary"
                aria-label="닫기"
              >
                <ChevronLeft size={20} />
              </button>
            </div>
            <CopyrightPage
              onAgree={handleAgree}
              hideHeader={true}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden max-[1099px]:h-auto max-[1099px]:min-h-0">
            <WorkshopView
              onClose={handleExit}
              onBack={handleExit}
              onComplete={onClose}
              hideHeader={true}
              allowResumeCheck={consumeResumeCheck}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
