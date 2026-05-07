import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { policies } from '../components/Footer';
import { useTheme } from '../context/ThemeContext';
import { motion } from 'framer-motion';

export default function PolicyPage() {
  const { type } = useParams<{ type: string }>();
  const { theme } = useTheme();

  if (!type || !policies[type as keyof typeof policies]) {
    return <Navigate to="/" replace />;
  }

  const policy = policies[type as keyof typeof policies];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`min-h-screen py-20 px-6 ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}
    >
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-10 tracking-tight">{policy.title}</h1>
        <div className={theme === 'dark' ? 'text-zinc-200' : 'text-zinc-950'}>
          {policy.content}
        </div>
      </div>
    </motion.div>
  );
}
