import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

export default function LoadingScreen() {
  const { theme } = useTheme();
  const LOGO_URL = "https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840";

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center transition-colors duration-500 ${
      theme === 'dark' ? 'bg-black' : 'bg-white'
    }`}>
      <motion.div
        initial={{ scale: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center justify-center"
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          {/* Base Logo */}
          <img
            src={LOGO_URL}
            alt="METALORA"
            className={`h-12 md:h-16 object-contain transition-all duration-500 ${
              theme === 'dark' ? 'filter invert opacity-30' : 'opacity-100'
            }`}
            referrerPolicy="no-referrer"
          />
          
          {/* Shimmer Logo */}
          {theme === 'dark' && (
            <motion.div
              className="absolute inset-0 z-10"
              style={{
                WebkitMaskImage: `url(${LOGO_URL})`,
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                filter: 'invert(1)',
              }}
              animate={{
                backgroundPosition: ['200% 0', '-200% 0'],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
