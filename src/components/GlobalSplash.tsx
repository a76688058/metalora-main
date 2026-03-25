import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GlobalSplash() {
  const [isLoading, setIsLoading] = useState(true);

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
          className="fixed inset-0 w-screen h-screen bg-black z-[10001] flex items-center justify-center"
        >
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
                src="https://postfiles.pstatic.net/MjAyNjAzMTZfMjM2/MDAxNzczNjQzMzQ3MDUw.zR_7l4ozVWSXDJOr1CA_6tw0H8LF8ZQenQvN8Tw3swEg.i_g5v5uqKHopzrE-iqVmSsuKM-nhT3X3N0tWVC_DDBgg.PNG/METALORA_LOGO.png?type=w3840"
                alt="METALORA"
                className="h-12 md:h-16 object-contain filter invert opacity-30"
                referrerPolicy="no-referrer"
              />
              
              {/* Shimmer Logo */}
              <motion.div
                className="absolute inset-0 z-10"
                style={{
                  WebkitMaskImage: `url(https://postfiles.pstatic.net/MjAyNjAzMTZfMjM2/MDAxNzczNjQzMzQ3MDUw.zR_7l4ozVWSXDJOr1CA_6tw0H8LF8ZQenQvN8Tw3swEg.i_g5v5uqKHopzrE-iqVmSsuKM-nhT3X3N0tWVC_DDBgg.PNG/METALORA_LOGO.png?type=w3840)`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
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
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
