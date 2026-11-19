import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const LOGO_URL = '/logo/metalora-wordmark.webp';

export default function LoadingScreen() {
  const { theme } = useTheme();
  const reduced = usePrefersReducedMotion();
  const isDark = theme === 'dark';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${
        isDark ? 'bg-black text-white' : 'bg-white text-black'
      }`}
    >
      <div className="flex flex-col items-center">
        <img
          src={LOGO_URL}
          alt="METALORA"
          width={384}
          height={124}
          className={`h-12 w-auto object-contain md:h-16 ${isDark ? 'invert opacity-80' : 'opacity-100'}`}
          referrerPolicy="no-referrer"
        />
        <div className="mt-8 h-px w-16 overflow-hidden bg-current/20" aria-hidden="true">
          <motion.span
            className="block h-full w-6 bg-current"
            initial={false}
            animate={reduced ? { x: 20 } : { x: [-24, 64] }}
            transition={reduced ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        <span className="sr-only">불러오는 중</span>
      </div>
    </div>
  );
}
