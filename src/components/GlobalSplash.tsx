import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

const LOGO_URL = "https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840";

export default function GlobalSplash() {
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    const minTimePromise = new Promise(resolve => setTimeout(resolve, 1500));

    let handleLoad: (() => void) | undefined;
    const loadPromise = new Promise<boolean>(resolve => {
      if (document.readyState === 'complete') {
        resolve(true);
      } else {
        handleLoad = () => resolve(true);
        window.addEventListener('load', handleLoad);
      }
    });

    // Home uses HeroCinematic, which never dispatches `3d-poster-loaded`.
    // Skip dead 3000ms poster wait on `/` only; other routes keep event + fallback.
    const isHome = window.location.pathname === '/';
    let handlePosterLoaded: (() => void) | undefined;
    let posterTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const posterPromise = isHome
      ? Promise.resolve()
      : new Promise<void>(resolve => {
          handlePosterLoaded = () => {
            resolve();
            if (handlePosterLoaded) {
              window.removeEventListener('3d-poster-loaded', handlePosterLoaded);
            }
            if (posterTimeoutId !== undefined) {
              clearTimeout(posterTimeoutId);
            }
          };
          window.addEventListener('3d-poster-loaded', handlePosterLoaded);
          posterTimeoutId = setTimeout(handlePosterLoaded, 3000);
        });

    Promise.all([minTimePromise, loadPromise, posterPromise]).then(() => {
      setIsLoading(false);
    });

    return () => {
      if (handleLoad) {
        window.removeEventListener('load', handleLoad);
      }
      if (handlePosterLoaded) {
        window.removeEventListener('3d-poster-loaded', handlePosterLoaded);
      }
      if (posterTimeoutId !== undefined) {
        clearTimeout(posterTimeoutId);
      }
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
          <div className="relative flex items-center justify-center">
            <img
              src={LOGO_URL}
              alt="METALORA"
              className={`h-12 object-contain md:h-16 ${
                theme === 'dark' ? 'invert opacity-80' : 'opacity-100'
              }`}
              referrerPolicy="no-referrer"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
