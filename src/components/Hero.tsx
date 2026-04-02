import { useEffect, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Poster3D from './Poster3D';
import { useProducts } from '../context/ProductContext';
import { Product } from '../data/products';

import ErrorBoundary from './ErrorBoundary';

import { Html } from '@react-three/drei';

export default function Hero() {
  const { products } = useProducts();
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (products && products.length > 0 && !targetProduct) {
      // Try to find the 'Mask' product specifically as requested
      const maskProduct = products.find(p => 
        p.title.toLowerCase().includes('mask') || 
        p.title.includes('가면')
      );
      
      if (maskProduct) {
        setTargetProduct(maskProduct);
      } else {
        // Fallback to random if not found, but prefer the first one if it's the intended one
        setTargetProduct(products[0]);
      }
    }
  }, [products, targetProduct]);

  const handleMoreClick = () => {
    navigate('/collection');
  };

  const frontImage = targetProduct?.front_image || targetProduct?.image;
  const backImage = targetProduct?.back_image || targetProduct?.backImage || frontImage;

  return (
    <section className="relative w-full flex flex-col items-center justify-center pt-10 pb-10 overflow-hidden bg-black min-h-[75vh]">
      {/* 1. Background Transformation: Exhibition Stage with Purple Spotlight */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Deep background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(88,28,135,0.15),transparent_70%)]" />
        {/* Sharp spotlight effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.1),transparent_60%)] blur-3xl" />
      </div>

      {/* 2. 3D Interactive Frame with Slide-up Animation */}
      <motion.div 
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          duration: 1.0, 
          ease: [0.16, 1, 0.3, 1] // Custom ease-out
        }}
        className="relative w-full max-w-[80vw] h-[60vh] mx-auto z-10 flex items-center justify-center"
      >
        {frontImage ? (
          <ErrorBoundary>
            <Canvas 
              frameloop="always" 
              camera={{ position: [0, 0, 4.5], fov: 45 }} 
              className="w-full h-full" 
              gl={{ 
                antialias: true, 
                alpha: true, 
                preserveDrawingBuffer: true,
                toneMappingExposure: 1.3
              }}
              onCreated={() => {
                window.dispatchEvent(new CustomEvent('3d-poster-loaded'));
              }}
            >
              {/* 3. Lighting & Material: Added specific lights for the purple sheen */}
              <pointLight position={[2, 2, 2]} intensity={0.1} color="#a855f7" />
              <pointLight position={[-2, -1, 2]} intensity={0.05} color="#ffffff" />
              
              <Suspense fallback={<Html center><div className="w-full h-full bg-transparent" /></Html>}>
                <Poster3D 
                  interactive={false} 
                  autoRotate={true}
                  scale={2.4}
                  imageUrl={frontImage}
                  backImageUrl={backImage}
                />
              </Suspense>
            </Canvas>
          </ErrorBoundary>
        ) : (
          <div className="w-full h-full bg-black flex items-center justify-center" />
        )}
      </motion.div>

      {/* CTA Button */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
        className="relative z-20 mt-8 mb-8 flex justify-center items-center w-full"
      >
        <button 
          onClick={handleMoreClick}
          className="px-24 py-5 rounded-full bg-white text-black font-black tracking-tight text-xl hover:bg-zinc-200 transition-all duration-500 shadow-[0_0_50px_rgba(168,85,247,0.2)] transform-gpu active:scale-95"
        >
          작품 더보기
        </button>
      </motion.div>
    </section>
  );
}
