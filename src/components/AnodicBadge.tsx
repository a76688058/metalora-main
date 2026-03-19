import React from 'react';
import { motion } from 'framer-motion';

export default function AnodicBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="inline-flex items-center px-4 py-1.5 rounded-full"
      style={{
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
        boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.2)',
      }}
    >
      <span className="text-[10px] font-sans font-bold tracking-[0.3em] uppercase text-white/80">
        Alchemic Series 01
      </span>
    </motion.div>
  );
}
