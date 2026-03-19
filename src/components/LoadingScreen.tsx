import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center"
      >
        <div className="relative mb-8">
          <div className="w-20 h-20 border-4 border-zinc-800 rounded-full" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 w-20 h-20 border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent rounded-full"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="text-indigo-500 animate-pulse" size={32} />
          </div>
        </div>
        
        <h2 className="text-2xl font-black text-white tracking-[0.2em] mb-2">METALORA</h2>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
        </div>
        <p className="text-zinc-500 text-sm font-medium mt-6 tracking-tight">인증 정보를 확인 중입니다...</p>
      </motion.div>
    </div>
  );
}
