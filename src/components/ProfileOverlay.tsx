import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, MessageCircle, ChevronRight, X, 
  ShoppingBag, Zap 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ProfileOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileOverlay({ isOpen, onClose }: ProfileOverlayProps) {
    const { user, profile, signOut, openWorkshop, openProfileEdit, openOrders, openInquiry } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const menuItems = [
    ...(profile?.is_admin ? [{ 
      id: 'admin',
      label: '🛠️ 관리자 대시보드', 
      description: '매출 분석 및 전체 시스템 관리',
      icon: <Zap size={24} />, 
      isPrimary: true,
      borderColor: 'border-purple-600/80',
      shadow: 'shadow-[0_0_25px_rgba(139,92,246,0.4)]',
      iconColor: 'text-purple-100',
      iconBg: 'bg-gradient-to-br from-purple-600 to-indigo-700',
      onClick: () => {
        onClose();
        navigate('/admin');
      }
    }] : []),
    { 
      id: 'workshop',
      label: '커스텀 제작', 
      description: '내가 가지고 있는 이미지로 제작하기',
      icon: <Zap size={24} />, 
      isPrimary: true,
      borderColor: 'border-purple-500/60',
      shadow: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]',
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
      onClick: () => {
        onClose();
        openWorkshop();
      }
    },
    { 
      id: 'profile',
      label: '프로필 수정', 
      description: '내 계정의 배송지 관리하기',
      icon: <User size={24} />, 
      borderColor: 'border-cyan-500/40',
      shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]',
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
      onClick: () => {
        onClose();
        openProfileEdit();
      }
    },
    { 
      id: 'orders',
      label: '주문 내역', 
      description: '제작 중인 상품과 지난 주문을 확인합니다.',
      icon: <ShoppingBag size={24} />, 
      borderColor: 'border-emerald-500/40',
      shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]',
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
      onClick: () => {
        onClose();
        openOrders();
      }
    },
    { 
      id: 'cs',
      label: '1:1 문의', 
      description: '궁금한 점이나 불편한 사항을 해결해 드립니다.',
      icon: <MessageCircle size={24} />, 
      borderColor: 'border-amber-500/40',
      shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      onClick: () => {
        onClose();
        openInquiry();
      }
    },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[20000] flex justify-end pointer-events-auto"
    >
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
      />

      {/* Profile Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-lg bg-[#0F0F11] h-full flex flex-col shadow-2xl pointer-events-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="text-2xl font-bold text-white tracking-tight">내 정보</h2>
          <button 
            onClick={onClose}
            className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar">
          {/* User Greeting */}
          <div className="mb-10 px-2 pt-4">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
            >
              <h2 className="text-[32px] font-light text-white tracking-tight leading-tight">
                <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-400 drop-shadow-sm">
                  {profile?.full_name || '사용자'}
                </span>님,<br />
                반갑습니다.
              </h2>
            </motion.div>
          </div>

          {/* Menu Items */}
          <div className="space-y-4">
            {menuItems.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={item.onClick}
                className={`
                  bg-zinc-900/40 p-6 flex justify-between items-center group cursor-pointer 
                  transition-all duration-300 rounded-2xl border border-white/5 relative overflow-hidden
                  hover:bg-zinc-800/60
                `}
              >
                <div className="flex items-center gap-5">
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300
                    ${item.iconBg} ${item.iconColor} group-hover:scale-110
                  `}>
                    {item.icon}
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {item.label}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5 font-light">{item.description}</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-zinc-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </motion.div>
            ))}
          </div>

          {/* Logout */}
          <div className="mt-10 flex justify-center pb-10">
            <button
              onClick={() => {
                onClose();
                signOut();
              }}
              className="text-zinc-600 hover:text-red-500 transition-all text-sm font-medium"
            >
              로그아웃
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
