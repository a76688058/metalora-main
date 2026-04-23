import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CopyrightPage from './Workshop/CopyrightPage';
import WorkshopView from './Workshop/WorkshopView';
import { supabase } from '../lib/supabase';

interface WorkshopOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkshopOverlay({ isOpen, onClose }: WorkshopOverlayProps) {
  const { user, openProfile } = useAuth();
  const { theme } = useTheme();
  const [view, setView] = useState<'copyright' | 'workshop'>('copyright');
  const [isCheckingAgreement, setIsCheckingAgreement] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const checkAgreement = async () => {
      if (!user) {
        setIsCheckingAgreement(false);
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
          setView('workshop');
        } else {
          setView('copyright');
        }
      } catch (err) {
        console.error('Error checking agreement:', err);
        setView('copyright');
      } finally {
        setIsCheckingAgreement(false);
      }
    };

    if (isOpen) {
      checkAgreement();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleBackToProfile = () => {
    onClose();
    setTimeout(() => {
      openProfile();
    }, 100);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[40000] flex justify-end pointer-events-auto"
    >
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
      />

      {/* Workshop Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`relative w-full h-full flex flex-col shadow-2xl overflow-hidden pointer-events-auto transition-colors duration-500 border-l will-change-transform transform-gpu ${
          theme === 'dark' ? 'bg-[#0F0F11] border-white/5' : 'bg-white border-black/5'
        }`}
      >
        <AnimatePresence mode="wait">
          {isCheckingAgreement ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </motion.div>
          ) : view === 'copyright' ? (
            <motion.div 
              key="copyright"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col h-full overflow-hidden"
            >
              <div className="absolute top-6 left-6 z-[101]">
                <button 
                  onClick={handleBackToProfile}
                  className={`p-2 rounded-full transition-all ${
                    theme === 'dark' 
                      ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white' 
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-black'
                  }`}
                >
                  <ChevronLeft size={20} />
                </button>
              </div>
              <CopyrightPage 
                onAgree={() => setView('workshop')} 
                hideHeader={true} 
              />
            </motion.div>
          ) : (
            <motion.div 
              key="workshop"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col h-full overflow-hidden"
            >
              <WorkshopView 
                onClose={onClose} 
                hideHeader={true}
                onBack={handleBackToProfile}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
