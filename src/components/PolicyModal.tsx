import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
}

export default function PolicyModal({ isOpen, onClose, title, content }: PolicyModalProps) {
  const { theme } = useTheme();
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`fixed inset-0 z-[70000] flex flex-col transition-colors duration-500 will-change-transform transform-gpu ${
            theme === 'dark' ? 'bg-zinc-950' : 'bg-white'
          }`}
        >
          {/* Header with Fade-out effect */}
          <div className={`relative z-20 flex-shrink-0 pt-12 pb-6 px-6 ${theme === 'dark' ? 'bg-zinc-950' : 'bg-white'}`}>
            <div className="max-w-3xl mx-auto flex justify-between items-center">
              <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{title}</h2>
              <button 
                onClick={onClose} 
                className={`transition-colors p-2 -mr-2 ${theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'}`}
                aria-label="닫기"
              >
                <X size={28} />
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-40 relative z-10">
            <div className={`max-w-3xl mx-auto pt-4 ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-950'}`}>
              {content}
            </div>
          </div>

          {/* Bottom Button */}
          <div className={`fixed bottom-0 left-0 right-0 p-6 z-20 pointer-events-none ${
            theme === 'dark' ? 'bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent' : 'bg-gradient-to-t from-white via-white to-transparent'
          }`}>
            <div className="max-w-3xl mx-auto pointer-events-auto">
              <button 
                onClick={onClose}
                className={`w-full font-semibold text-[17px] py-4 rounded-2xl transition-all shadow-[0_0_40px_rgba(0,0,0,0.1)] ${
                  theme === 'dark' ? 'bg-white text-black hover:bg-zinc-200' : 'bg-black text-white hover:bg-zinc-800'
                }`}
              >
                확인했습니다
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
