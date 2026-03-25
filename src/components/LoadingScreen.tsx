import React from 'react';
import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
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
    </div>
  );
}
