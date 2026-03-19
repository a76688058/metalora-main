import React, { useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import Poster3D from '../components/Poster3D';
import Hero from '../components/Hero';
import LuxurySpacer from '../components/LuxurySpacer';
import AnodicBadge from '../components/AnodicBadge';
import Footer from '../components/Footer';
import SmoothScroll from '../components/SmoothScroll';
import Payment from '../components/Payment';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { ZoomIn, ShieldCheck, Truck, Layers, Zap, MousePointer2, Sparkles } from 'lucide-react';

const Reveal = ({ children, delay = 0, scale = 1, y = 40 }: { children: React.ReactNode, delay?: number, scale?: number, y?: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y, scale }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, margin: "-100px" }}
      transition={{ 
        duration: 0.8, 
        delay, 
        ease: [0.21, 0.47, 0.32, 0.98] 
      }}
    >
      {children}
    </motion.div>
  );
};

export default function Home() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { fetchProducts } = useProducts();
  const navigate = useNavigate();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleBuyClick = () => {
    if (!user) {
      navigate('/login?redirect=/');
      return;
    }
    setIsPaymentOpen(true);
  };

  return (
    <SmoothScroll>
      <div className="relative bg-black min-h-screen text-white selection:bg-white selection:text-black">
        {/* Luxury Header Area */}
        <div className="pt-32 pb-12 flex flex-col items-center gap-8">
          <AnodicBadge />
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-7xl md:text-9xl font-extrabold tracking-[-0.02em] uppercase text-center"
          >
            METALORA
          </motion.h1>
        </div>

        {/* Luxury Gap with Alchemy Particles */}
        <LuxurySpacer />

        {/* New Cinematic Hero */}
        <Hero />

        {/* Bento Grid Features */}
        <section id="technology" className="relative bg-black py-48 px-6 z-10">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Large Feature 1: Material */}
              <div className="md:col-span-2">
                <Reveal y={60} scale={0.95}>
                  <div className="relative h-[600px] rounded-[2.5rem] bg-zinc-900 overflow-hidden border border-white/5 group">
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/50 to-transparent z-10" />
                    <div className="absolute bottom-16 left-16 z-20 max-w-md">
                      <Layers className="mb-8 text-zinc-500" size={40} />
                      <h3 className="text-5xl font-semibold tracking-tight mb-6">{t('section_material_title')}</h3>
                      <p className="text-zinc-400 text-lg leading-relaxed">{t('section_material_desc')}</p>
                    </div>
                    <div className="absolute top-0 right-0 w-1/2 h-full opacity-30 group-hover:opacity-50 transition-opacity">
                      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                        <Poster3D interactive={false} imageUrl="https://picsum.photos/seed/metalora_material/1024/1448" />
                      </Canvas>
                    </div>
                  </div>
                </Reveal>
              </div>

              {/* Small Feature 1: Precision */}
              <Reveal delay={0.1} y={60} scale={0.95}>
                <div className="relative h-[600px] rounded-[2.5rem] bg-zinc-900 p-16 border border-white/5 flex flex-col justify-end">
                  <Zap className="mb-8 text-zinc-500" size={40} />
                  <h3 className="text-3xl font-semibold tracking-tight mb-6">{t('section_precision_title')}</h3>
                  <p className="text-zinc-500 text-base leading-relaxed">{t('section_precision_desc')}</p>
                </div>
              </Reveal>

              {/* Small Feature 2: Magnet */}
              <Reveal delay={0.2} y={60} scale={0.95}>
                <div className="relative h-[600px] rounded-[2.5rem] bg-zinc-900 p-16 border border-white/5 flex flex-col justify-end">
                  <MousePointer2 className="mb-8 text-zinc-500" size={40} />
                  <h3 className="text-3xl font-semibold tracking-tight mb-6">{t('section_magnet_title')}</h3>
                  <p className="text-zinc-500 text-base leading-relaxed">{t('section_magnet_desc')}</p>
                </div>
              </Reveal>

              {/* Large Feature 2: Light */}
              <div className="md:col-span-2">
                <Reveal delay={0.3} y={60} scale={0.95}>
                  <div className="relative h-[600px] rounded-[2.5rem] bg-gradient-to-tr from-zinc-900 to-zinc-800 overflow-hidden border border-white/5">
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                      <Sparkles size={400} className="text-white" />
                    </div>
                    <div className="absolute inset-0 p-16 flex flex-col justify-center max-w-xl">
                      <h3 className="text-5xl font-semibold tracking-tight mb-6">{t('section_light_title')}</h3>
                      <p className="text-zinc-400 text-lg leading-relaxed">{t('section_light_desc')}</p>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* Product Detail Section: The Object */}
        <section id="collection" className="relative min-h-screen bg-zinc-950 py-64 px-8 overflow-hidden z-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-32 items-center">
            <div className="space-y-20">
              <div className="space-y-8">
                <Reveal y={30}>
                  <span className="text-xs font-bold uppercase tracking-[0.4em] text-zinc-500 block mb-4">Edition 01</span>
                  <h2 className="text-7xl md:text-8xl font-semibold tracking-tighter leading-none">{t('the_object')}</h2>
                </Reveal>
                <Reveal delay={0.1} y={30}>
                  <p className="text-2xl text-zinc-400 leading-relaxed max-w-lg">
                    {t('object_desc')}
                  </p>
                </Reveal>
              </div>

              <div className="space-y-16">
                <Reveal delay={0.2} y={30}>
                  <div className="flex gap-10">
                    <div className="shrink-0 h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center border border-white/10">
                      <ZoomIn className="h-6 w-6 text-zinc-300" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-medium mb-3">{t('feat_8k_title')}</h3>
                      <p className="text-zinc-500 text-lg leading-relaxed">{t('feat_8k_desc')}</p>
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={0.3} y={30}>
                  <div className="flex gap-10">
                    <div className="shrink-0 h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center border border-white/10">
                      <ShieldCheck className="h-6 w-6 text-zinc-300" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-medium mb-3">{t('feat_mag_title')}</h3>
                      <p className="text-zinc-500 text-lg leading-relaxed">{t('feat_mag_desc')}</p>
                    </div>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={0.4} y={30}>
                <div className="flex flex-col sm:flex-row items-center gap-10 pt-16 border-t border-white/5">
                  <button
                    onClick={() => setIsPaymentOpen(true)}
                    className="w-full sm:w-auto px-16 py-6 rounded-full bg-white text-black font-bold text-base tracking-tight hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5"
                  >
                    {t('buy_button')}
                  </button>
                  <div className="flex items-center gap-4 text-xs text-zinc-500 uppercase tracking-[0.2em] font-semibold">
                    <Truck size={20} />
                    <span>{t('logistic_adv')}</span>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.2} scale={0.9} y={100}>
              <div className="relative aspect-[4/5] w-full rounded-[3rem] overflow-hidden bg-zinc-900 border border-white/5 shadow-[0_0_100px_rgba(255,255,255,0.02)]">
                <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                  <Poster3D interactive={true} imageUrl="https://picsum.photos/seed/metalora_detail/1024/1448" />
                </Canvas>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Comparison / CTA Section */}
        <section className="bg-zinc-900 text-white py-64 px-6 text-center overflow-hidden z-10 border-t border-white/5">
          <div className="max-w-5xl mx-auto space-y-16">
            <Reveal y={50}>
              <h2 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.85]">
                Beyond Paper.<br />Beyond Tradition.
              </h2>
            </Reveal>
            <Reveal delay={0.1} y={50}>
              <p className="text-2xl md:text-3xl text-zinc-400 max-w-3xl mx-auto font-medium leading-tight">
                Experience the future of wall art. Durable, magnetic, and breathtakingly sharp.
              </p>
            </Reveal>
            <Reveal delay={0.2} y={50}>
              <div className="pt-12">
                <button 
                  onClick={handleBuyClick}
                  className="px-16 py-6 rounded-full bg-white text-black font-bold text-lg tracking-tight hover:bg-zinc-200 transition-all active:scale-95 shadow-2xl"
                >
                  {t('buy_button')}
                </button>
              </div>
            </Reveal>
          </div>
        </section>

        <Footer />
      </div>

      <Payment isOpen={isPaymentOpen} onClose={() => setIsPaymentOpen(false)} price={129000} />
    </SmoothScroll>
  );
}
