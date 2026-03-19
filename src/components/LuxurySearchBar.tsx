import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useProducts } from '../context/ProductContext';

export default function LuxurySearchBar() {
  const { searchTerm, setSearchTerm } = useProducts();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="relative max-w-md mx-auto mb-16 px-6 sm:px-0">
      <motion.div
        className="relative flex items-center px-4 py-3 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        animate={{
          boxShadow: isFocused 
            ? '0 0 20px 2px rgba(255, 255, 255, 0.15)' 
            : '0 0 0px 0px rgba(255, 255, 255, 0)',
        }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Glow Effect Layer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent 70%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isFocused ? 1 : 0 }}
          transition={{ duration: 0.5 }}
        />

        <Search 
          size={18} 
          className={`mr-3 transition-colors duration-300 ${isFocused ? 'text-white' : 'text-zinc-500'}`} 
        />
        
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="작품 검색..."
          className="w-full bg-transparent border-none outline-none text-white placeholder-zinc-500 text-sm font-light tracking-wide z-10"
        />
      </motion.div>
    </div>
  );
}
