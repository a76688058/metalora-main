import React, { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Poster3D from './Poster3D';

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-white text-sm font-mono">{progress.toFixed(0)}% loaded</div>
    </Html>
  );
}

interface ThreeDViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  backImageUrl?: string;
}

export default function ThreeDViewer({ isOpen, onClose, imageUrl, backImageUrl }: ThreeDViewerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 w-screen h-screen overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            className="relative w-[95vw] md:w-[85vw] h-[80vh] bg-[#1A1A1A] rounded-[24px] overflow-hidden shadow-2xl flex flex-col items-center justify-center mt-safe"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-[60] p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition"
            >
              <X size={24} />
            </button>

            <div className="w-full h-full cursor-grab active:cursor-grabbing">
              <Canvas shadows camera={{ position: [0, 0, 8], fov: 45 }}>
                <Poster3D 
                  key={`${imageUrl}-${backImageUrl}`}
                  imageUrl={imageUrl} 
                  backImageUrl={backImageUrl} 
                  scale={1.5} 
                  width={3} 
                  height={4.5} 
                />
                <OrbitControls 
                  enablePan={false} 
                  enableZoom={true} 
                  minPolarAngle={Math.PI / 4} 
                  maxPolarAngle={Math.PI / 1.5} 
                />
              </Canvas>
              
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                <p className="text-white/50 text-xs uppercase tracking-widest mb-2">Interactive 3D View</p>
                <p className="text-white/30 text-[10px]">Drag to rotate • Scroll to zoom</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
