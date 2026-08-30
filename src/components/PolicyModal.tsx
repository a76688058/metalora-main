import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';

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
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-modal-title"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className={cn('fixed inset-0 flex flex-col bg-canvas transform-gpu will-change-transform', zClass('dialog'))}
        >
          <div className="relative z-20 shrink-0 border-b border-border-subtle px-6 pb-5 pt-safe">
            <div className="mx-auto flex max-w-3xl items-center justify-between pt-10">
              <h2 id="policy-modal-title" className="type-page-title text-text-primary">
                {title}
              </h2>
              <IconButton variant="ghost" aria-label="닫기" onClick={onClose}>
                <X size={22} />
              </IconButton>
            </div>
          </div>

          <div className="relative z-10 flex-1 overflow-y-auto px-6 pb-32">
            <div className="mx-auto max-w-3xl pt-4 type-body text-text-secondary">{content}</div>
          </div>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-canvas/90 p-4 pb-safe backdrop-blur-sm">
            <div className="pointer-events-auto mx-auto max-w-3xl">
              <Button variant="primary" size="lg" fullWidth onClick={onClose}>
                확인했습니다
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
