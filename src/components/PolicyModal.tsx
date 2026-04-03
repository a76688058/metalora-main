import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
}

export default function PolicyModal({ isOpen, onClose, title, content }: PolicyModalProps) {
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
          className="fixed inset-0 z-[70000] bg-black flex flex-col"
        >
          {/* Header with Fade-out effect */}
          <div className="relative z-20 flex-shrink-0 pt-12 pb-6 px-6 bg-black">
            <div className="max-w-3xl mx-auto flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
              <button 
                onClick={onClose} 
                className="text-zinc-400 hover:text-white transition-colors p-2 -mr-2"
                aria-label="닫기"
              >
                <X size={28} />
              </button>
            </div>
            {/* Fade out gradient for scrolling content */}
            <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-transparent to-black translate-y-full pointer-events-none" />
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-40 relative z-10">
            <div className="max-w-3xl mx-auto pt-4">
              {content}
            </div>
          </div>

          {/* Bottom Button */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black to-transparent z-20 pointer-events-none">
            <div className="max-w-3xl mx-auto pointer-events-auto">
              <button 
                onClick={onClose}
                className="w-full bg-white text-black font-semibold text-[17px] py-4 rounded-2xl hover:bg-zinc-200 transition-colors shadow-[0_0_40px_rgba(0,0,0,0.8)]"
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
