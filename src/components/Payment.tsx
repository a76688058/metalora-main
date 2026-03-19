import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface PaymentProps {
  isOpen: boolean;
  onClose: () => void;
  price: number;
}

export default function Payment({ isOpen, onClose, price }: PaymentProps) {
  const { t } = useLanguage();
  const [method, setMethod] = useState<'card' | 'toss' | 'kakao' | 'bank'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

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

  const handlePayment = () => {
    setIsProcessing(true);
    // Mock Portone API Integration
    
    setTimeout(() => {
      setIsProcessing(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    }, 1500);
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-center items-end bg-black/80 w-screen h-screen overflow-hidden">
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose();
              }
            }}
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220, mass: 0.8 }}
            className="relative w-full max-w-lg bg-[#1A1A1A] rounded-t-[24px] rounded-b-none max-h-[85vh] overflow-y-auto p-6 shadow-2xl pb-safe mt-auto will-change-transform"
          >
        {/* Mobile Handle Bar */}
        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto my-3" />

        <button 
          onClick={handleClose}
          className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors z-50 p-2"
        >
          <X size={24} />
        </button>

        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white tracking-tight mb-2">{t('checkout_title')}</h2>
          <p className="text-zinc-400 font-medium">{t('checkout_subtitle')}</p>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-sm text-center font-bold animate-pulse">
            결제가 완료되었습니다! (데모)
          </div>
        )}

        <div className="space-y-8">
          <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/5">
            <div className="flex justify-between items-center mb-4">
              <span className="text-zinc-400 font-medium">METALORA Edition 01</span>
              <span className="text-white font-bold">₩{price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-xl">
              <span className="text-zinc-400 font-medium">{t('total')}</span>
              <span className="text-white font-bold">₩{price.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-bold text-zinc-400 ml-1">{t('payment_method')}</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setMethod('card')}
                className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all group active:scale-[0.98] ${
                  method === 'card' ? 'bg-zinc-800 border-white/40' : 'bg-zinc-900 border-white/5 hover:border-white/20'
                }`}
              >
                <CreditCard className={method === 'card' ? 'text-white' : 'text-zinc-400 group-hover:text-white'} size={28} />
                <span className={`text-sm font-bold ${method === 'card' ? 'text-white' : 'text-zinc-400 group-hover:text-white'}`}>{t('card')}</span>
              </button>
              <button 
                onClick={() => setMethod('toss')}
                className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all group active:scale-[0.98] ${
                  method === 'toss' ? 'bg-blue-500/10 border-blue-500/40' : 'bg-zinc-900 border-white/5 hover:border-white/20'
                }`}
              >
                <Smartphone className={method === 'toss' ? 'text-blue-400' : 'text-zinc-400 group-hover:text-white'} size={28} />
                <span className={`text-sm font-bold ${method === 'toss' ? 'text-blue-400' : 'text-zinc-400 group-hover:text-white'}`}>Toss Pay</span>
              </button>
            </div>
          </div>

          <button
            onClick={handlePayment}
            disabled={isProcessing || success}
            className="w-full bg-white text-black font-bold py-5 rounded-2xl hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xl mt-4 disabled:opacity-50 shadow-xl shadow-white/5"
          >
            {isProcessing ? (
              <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-black"></span>
            ) : success ? (
              '결제 완료'
            ) : (
              `${t('pay_now')} ₩${price.toLocaleString()}`
            )}
          </button>

          <p className="text-center text-zinc-600 text-[11px] font-medium">
            결제 시 METALORA의 결제 이용약관에 동의하게 됩니다.
          </p>
        </div>
      </motion.div>
    </div>
    )}
  </AnimatePresence>
);
}
