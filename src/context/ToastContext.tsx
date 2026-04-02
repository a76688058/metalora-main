import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'purple';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[10001] flex flex-col gap-3 w-full max-w-[90%] sm:max-w-md pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="pointer-events-auto"
            >
              <div className={`
                flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border
                ${toast.type === 'success' ? 'bg-emerald-500/90 border-emerald-400/20 text-white' : 
                  toast.type === 'error' ? 'bg-red-500/90 border-red-400/20 text-white' : 
                  toast.type === 'purple' ? 'bg-purple-600/90 border-purple-400/20 text-white' :
                  'bg-zinc-800/90 border-white/10 text-white'}
              `}>
                {(toast.type === 'success' || toast.type === 'purple') && <CheckCircle size={20} className="shrink-0" />}
                {toast.type === 'error' && <AlertCircle size={20} className="shrink-0" />}
                <p className="text-sm font-bold flex-1 leading-tight">{toast.message}</p>
                <button 
                  onClick={() => removeToast(toast.id)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
