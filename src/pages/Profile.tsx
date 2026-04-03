import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Loader2, User, MessageCircle, ChevronRight, ChevronLeft, X, 
  ShoppingBag, Package, Zap, Frame
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';
import Header from '../components/Header';

import LoadingScreen from '../components/LoadingScreen';

// --- Sub-components ---

export default function Profile() {
  const { user, profile, refreshProfile, signOut, isLoading: authLoading, openWorkshop } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  // Only show loading screen on initial load when profile data is missing
  if (authLoading && !profile) {
    return <LoadingScreen />;
  }

  if (!user || !profile) return null;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Header />
      
      <main className="flex-1 w-full max-w-xl mx-auto px-6 pt-12 pb-32 pb-[env(safe-area-inset-bottom)] overflow-y-auto custom-scrollbar">
        {/* The Core 4 Cards (Vertical List) */}
        <section className="space-y-6 px-1 min-h-fit">
          {[
            ...(profile?.is_admin ? [{ 
              id: 'admin',
              label: '🛠️ 관리자 대시보드', 
              description: '매출 분석 및 전체 시스템 관리',
              icon: <Zap size={24} />, 
              isPrimary: true,
              neonColor: 'rgba(139, 92, 246, 0.6)', // Deep Purple
              flashColor: 'rgba(139, 92, 246, 0.3)',
              borderColor: 'border-purple-600/80',
              shadow: 'shadow-[0_0_25px_rgba(139,92,246,0.4)]',
              hoverShadow: 'hover:shadow-[0_0_40px_rgba(139,92,246,0.6)]',
              iconColor: 'text-purple-100',
              iconBg: 'bg-gradient-to-br from-purple-600 to-indigo-700',
              onClick: () => navigate('/admin')
            }] : []),
            { 
              id: 'workshop',
              label: '커스텀 제작', 
              description: '내가 가지고 있는 이미지로 제작하기',
              icon: <Zap size={24} />, 
              isPrimary: true,
              neonColor: 'rgba(168, 85, 247, 0.5)', // Purple
              flashColor: 'rgba(168, 85, 247, 0.25)',
              borderColor: 'border-purple-500/60',
              shadow: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]',
              hoverShadow: 'hover:shadow-[0_0_35px_rgba(168,85,247,0.5)]',
              iconColor: 'text-purple-400',
              iconBg: 'bg-purple-500/10',
              onClick: () => openWorkshop()
            },
            { 
              id: 'profile',
              label: '프로필 수정', 
              description: '내 계정의 배송지 관리하기',
              icon: <User size={24} />, 
              neonColor: 'rgba(6, 182, 212, 0.3)', // Cyan
              flashColor: 'rgba(6, 182, 212, 0.15)',
              borderColor: 'border-cyan-500/40',
              shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]',
              hoverShadow: 'hover:shadow-[0_0_25px_rgba(6,182,212,0.4)]',
              iconColor: 'text-cyan-400',
              iconBg: 'bg-cyan-500/10',
              onClick: () => navigate('/mypage/profile')
            },
            { 
              id: 'orders',
              label: '주문 내역', 
              description: '제작 중인 상품과 지난 주문을 확인합니다.',
              icon: <ShoppingBag size={24} />, 
              neonColor: 'rgba(16, 185, 129, 0.3)', // Emerald
              flashColor: 'rgba(16, 185, 129, 0.15)',
              borderColor: 'border-emerald-500/40',
              shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]',
              hoverShadow: 'hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]',
              iconColor: 'text-emerald-400',
              iconBg: 'bg-emerald-500/10',
              onClick: () => navigate('/mypage/orders')
            },
            { 
              id: 'cs',
              label: '1:1 문의', 
              description: '궁금한 점이나 불편한 사항을 해결해 드립니다.',
              icon: <MessageCircle size={24} />, 
              neonColor: 'rgba(245, 158, 11, 0.3)', // Amber
              flashColor: 'rgba(245, 158, 11, 0.15)',
              borderColor: 'border-amber-500/40',
              shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
              hoverShadow: 'hover:shadow-[0_0_25px_rgba(245,158,11,0.4)]',
              iconColor: 'text-amber-400',
              iconBg: 'bg-amber-500/10',
              onClick: () => navigate('/mypage/inquiry')
            },
          ].map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              whileTap={{ scale: 0.98, backgroundColor: item.flashColor }}
              onClick={item.onClick}
              className={`
                bg-zinc-900/40 p-8 flex justify-between items-center group cursor-pointer 
                transition-all duration-300 rounded-3xl border-2 relative overflow-hidden
                ${item.borderColor} ${item.shadow} ${item.hoverShadow}
              `}
            >
              <div className="flex items-center gap-6">
                <div className={`
                  w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300
                  ${item.iconBg} ${item.iconColor} group-hover:scale-110
                `}>
                  {item.icon}
                </div>
                <div className="text-left">
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {item.label}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1 font-light">{item.description}</p>
                </div>
              </div>
              <ChevronRight size={24} className="text-zinc-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
            </motion.div>
          ))}
        </section>

        {/* Logout Button (Final Clean Version) */}
        <section className="mt-10 flex justify-center">
          <button
            onClick={() => signOut()}
            className="text-zinc-600 hover:text-red-500 transition-all text-sm font-medium"
          >
            로그아웃
          </button>
        </section>
      </main>
    </div>
  );
}
