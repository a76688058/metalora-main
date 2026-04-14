import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';

const FALLBACK_MESSAGES = [
  "지금 주문 시 무료 배송 (오늘 마감)",
  "ATELIER의 새로운 컬렉션을 만나보세요",
  "포스터가 아닌 엔지니어링 된 작품",
  "벽에 상처를 남기지 않는 혁신적인 거치 방식"
];

const AnnouncementBar = () => {
  const [messages, setMessages] = useState<string[]>(FALLBACK_MESSAGES);
  const { theme } = useTheme();

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('banners')
          .select('content')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) {
          // If table doesn't exist, just use fallback silently
          if (error.code === 'PGRST205') return;
          throw error;
        }
        
        if (data && data.length > 0) {
          setMessages(data.map(b => b.content));
        }
      } catch (error) {
        console.error('Error fetching banners for bar:', error);
      }
    };

    fetchBanners();
  }, []);

  return (
    <div className={`w-full border-b py-3 overflow-hidden whitespace-nowrap relative z-[110] transition-colors duration-500 ${
      theme === 'dark' ? 'bg-blue-600 border-blue-500' : 'bg-blue-500 border-blue-400'
    }`}>
      {/* Subtle gradient overlays for a premium feel */}
      <div className={`absolute inset-y-0 left-0 w-24 z-10 pointer-events-none ${
        theme === 'dark' ? 'bg-gradient-to-r from-blue-600 to-transparent' : 'bg-gradient-to-r from-blue-500 to-transparent'
      }`} />
      <div className={`absolute inset-y-0 right-0 w-24 z-10 pointer-events-none ${
        theme === 'dark' ? 'bg-gradient-to-l from-blue-600 to-transparent' : 'bg-gradient-to-l from-blue-500 to-transparent'
      }`} />
      
      <motion.div 
        className="flex items-center gap-16 text-sm font-bold uppercase tracking-[0.2em] text-white"
        animate={{ x: [0, -1500] }}
        transition={{ 
          duration: 40, 
          repeat: Infinity, 
          ease: "linear" 
        }}
      >
        {[...messages, ...messages, ...messages, ...messages].map((msg, i) => (
          <React.Fragment key={i}>
            <span className="hover:text-white/80 transition-colors duration-500 cursor-default">{msg}</span>
            <span className="text-white/40 flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-current" />
            </span>
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
};

export default AnnouncementBar;
