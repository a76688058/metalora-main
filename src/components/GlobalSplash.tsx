import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

const LOGO_URL = "https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840";

export default function GlobalSplash() {
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    const minTimePromise = new Promise(resolve => setTimeout(resolve, 1500));
    
    const loadPromise = new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve(true);
      } else {
        window.addEventListener('load', resolve);
      }
    });

    const posterPromise = new Promise(resolve => {
      const handlePosterLoaded = () => {
        resolve(true);
        window.removeEventListener('3d-poster-loaded', handlePosterLoaded);
      };
      window.addEventListener('3d-poster-loaded', handlePosterLoaded);
      // Fallback timeout in case there's no 3D poster on the current page
      setTimeout(handlePosterLoaded, 3000);
    });

    Promise.all([minTimePromise, loadPromise, posterPromise]).then(() => {
      setIsLoading(false);
    });

    return () => {
      window.removeEventListener('load', () => {});
      window.removeEventListener('3d-poster-loaded', () => {});
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isLoading]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed inset-0 z-[99999] flex items-center justify-center transition-colors duration-500 ${
            theme === 'dark' ? 'bg-black' : 'bg-white'
          }`}
        >
          <motion.div
            initial={{ scale: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex items-center justify-center will-change-transform"
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="relative will-change-transform"
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
              
              {/* Shimmer Logo optimized with translateX instead of backgroundPosition */}
              {theme === 'dark' && (
                <div 
                  className="absolute inset-0 z-10 overflow-hidden" 
                  style={{
                    WebkitMaskImage: `url(${LOGO_URL})`,
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    filter: 'invert(1)',
                  }}
                >
                  <motion.div
                    className="absolute inset-y-0 w-[200%] will-change-transform"
                    style={{
                      background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)',
                    }}
                    animate={{
                      x: ['-50%', '0%'],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
