import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';

interface ProfileOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileOverlay({ isOpen, onClose }: ProfileOverlayProps) {
  const { profile, signOut, openWorkshop, openProfileEdit, openOrders, openInquiry } = useAuth();
  const { theme } = useTheme();
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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const menuItems = [
    ...(profile?.is_admin ? [{
      id: 'admin',
      label: '관리자 대시보드',
      description: '매출 분석 및 전체 시스템 관리',
      onClick: () => {
        onClose();
        navigate('/admin');
      }
    }] : []),
    {
      id: 'workshop',
      label: '커스텀 제작',
      description: '내가 가지고 있는 이미지로 제작하기',
      onClick: () => {
        onClose();
        openWorkshop();
      }
    },
    {
      id: 'profile',
      label: '프로필 수정',
      description: '이름, 연락처, 배송지를 수정합니다.',
      onClick: () => {
        onClose();
        openProfileEdit();
      }
    },
    {
      id: 'orders',
      label: '주문 내역',
      description: '제작 중인 상품과 지난 주문을 확인합니다.',
      onClick: () => {
        onClose();
        openOrders();
      }
    },
    {
      id: 'cs',
      label: '1:1 문의',
      description: '궁금한 점이나 불편한 사항을 해결해 드립니다.',
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-overlay-title"
      className={cn('fixed inset-0 flex justify-end pointer-events-auto', zClass('sheet'))}
    >
      <button
        type="button"
        aria-label="내 정보 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto touch-none"
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`relative w-full max-w-lg h-full flex flex-col pointer-events-auto transform-gpu ${
          theme === 'dark' ? 'bg-[#101114] text-[#f3f1ec]' : 'bg-[#f6f4ef] text-[#16150f]'
        }`}
      >
        <div className={`flex items-center justify-between px-6 py-5 border-b ${theme === 'dark' ? 'border-white/5' : 'border-black/5'}`}>
          <h2 id="profile-overlay-title" className="text-[1.75rem] font-medium tracking-[-0.02em]">내 정보</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="내 정보 닫기"
            className={`focus-ring p-2 ${theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar">
          <div className="mb-10 px-1 pt-2">
            <p className="text-[1.75rem] font-medium tracking-[-0.02em] leading-tight">
              {profile?.full_name || '사용자'}님,<br />
              반갑습니다.
            </p>
          </div>

          <div>
            {menuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={cn(
                  'group w-full border-b py-5 text-left focus-ring',
                  theme === 'dark' ? 'border-white/10' : 'border-black/10',
                )}
              >
                <span className="block text-lg font-medium tracking-[-0.02em] transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1">
                  {item.label}
                </span>
                <span
                  aria-hidden
                  className={`mt-2 block h-px w-6 transition-[width] duration-300 group-hover:w-14 group-focus-visible:w-14 ${
                    theme === 'dark' ? 'bg-[#c9c4b8]' : 'bg-[#16150f]'
                  }`}
                />
                <span className={`mt-2 block text-sm ${theme === 'dark' ? 'text-[#c9c4b8]' : 'text-[#3f3c36]'}`}>
                  {item.description}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-10 flex justify-center pb-10">
            <button
              type="button"
              onClick={() => {
                onClose();
                signOut();
              }}
              className={`text-sm font-medium focus-ring rounded-md px-3 py-2 ${theme === 'dark' ? 'text-[#c9c4b8] hover:text-[#f3f1ec]' : 'text-[#3f3c36] hover:text-[#16150f]'}`}
            >
              로그아웃
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
