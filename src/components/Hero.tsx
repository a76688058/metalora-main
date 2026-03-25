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
  const [randomProduct, setRandomProduct] = useState<Product | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (products && products.length > 0 && !randomProduct) {
      const randomIndex = Math.floor(Math.random() * products.length);
      setRandomProduct(products[randomIndex]);
    }
  }, [products, randomProduct]);

  const handleMoreClick = () => {
    navigate('/collection');
  };

  const frontImage = randomProduct?.front_image || randomProduct?.image;
  const backImage = randomProduct?.back_image || randomProduct?.backImage || frontImage;

  return (
    <section className="relative w-full flex flex-col items-center justify-center pt-10 pb-10 overflow-hidden bg-black min-h-[60vh]">
      {/* 3D Interactive Frame */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.17, 0.67, 0.83, 0.67] }}
        className="relative w-full max-w-[80vw] h-[60vh] mx-auto z-10 flex items-center justify-center"
      >
        {frontImage ? (
          <ErrorBoundary>
            <Canvas 
              frameloop="always" 
              camera={{ position: [0, 0, 4.5], fov: 45 }} 
              className="w-full h-full pointer-events-none" 
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
              onCreated={() => {
                // Dispatch event when 3D context is ready
                window.dispatchEvent(new CustomEvent('3d-poster-loaded'));
              }}
            >
              <Suspense fallback={<Html center><div className="w-full h-full bg-transparent" /></Html>}>
                <Poster3D 
                  interactive={false} 
                  scale={2.2}
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5, ease: [0.17, 0.67, 0.83, 0.67] }}
        className="relative z-20 mt-8 mb-8 flex justify-center items-center w-full"
      >
        <button 
          onClick={handleMoreClick}
          className="px-24 py-5 rounded-full bg-white text-black font-black tracking-tight text-xl hover:bg-zinc-200 transition-all duration-500 shadow-2xl transform-gpu active:scale-95"
        >
          작품 더보기
        </button>
      </motion.div>
    </section>
  );
}
