import { useEffect, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import Poster3D from './Poster3D';
import { useProducts } from '../context/ProductContext';
import { Product } from '../data/products';

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
    <section className="relative w-full flex flex-col items-center py-12 overflow-hidden bg-black min-h-[60vh]">
      {/* 3D Interactive Frame */}
      <div className="relative w-[80vw] h-[50vh] mx-auto z-10 flex items-center justify-center">
        {frontImage ? (
          <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }} className="w-full h-full pointer-events-none">
            <Suspense fallback={null}>
              <Poster3D 
                interactive={false} 
                scale={2.0}
                imageUrl={frontImage}
                backImageUrl={backImage}
              />
            </Suspense>
          </Canvas>
        ) : (
          <div className="w-full h-full bg-black" />
        )}
      </div>

      {/* CTA Button */}
      <div className="relative z-20 mt-12 mb-8">
        <button 
          onClick={handleMoreClick}
          className="px-24 py-4 rounded-full bg-white text-black font-bold tracking-tight text-lg hover:bg-zinc-200 transition-all duration-300 shadow-2xl transform-gpu"
        >
          작품 더보기
        </button>
      </div>
    </section>
  );
}
