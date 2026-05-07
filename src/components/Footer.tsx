import React, { useState, useEffect } from 'react';
import PolicyModal from './PolicyModal';
import { ShieldCheck, AlertCircle, Settings, BarChart3 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const Divider = () => <div className="h-[1px] bg-current opacity-10 my-8" />;

import { policies } from '../constants/policies';

export { policies };

export default function Footer() {
  const { theme } = useTheme();
  const [modalState, setModalState] = useState<{ isOpen: boolean; key: keyof typeof policies | null }>({
    isOpen: false,
    key: null
  });

  const openModal = (key: keyof typeof policies) => {
    setModalState({ isOpen: true, key });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, key: null });
  };

  useEffect(() => {
    const handleOpenPolicy = (e: CustomEvent) => {
      if (e.detail && policies[e.detail as keyof typeof policies]) {
        openModal(e.detail as keyof typeof policies);
      }
    };
    
    window.addEventListener('open-policy', handleOpenPolicy as EventListener);
    return () => window.removeEventListener('open-policy', handleOpenPolicy as EventListener);
  }, []);

  return (
    <footer className={`border-t w-full font-sans transition-colors duration-500 ${theme === 'dark' ? 'bg-zinc-950 border-white/5' : 'bg-white border-black/5'}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 px-6 py-16 max-w-7xl mx-auto">
        {/* Left: Company Info */}
        <div className="text-center md:text-left text-zinc-900 dark:text-zinc-200 text-[14px] leading-relaxed">
          <div className="mb-6 flex justify-center">
            <img 
              src="https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840" 
              alt="METALORA" 
              className={`h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-all ${theme === 'dark' ? 'filter invert' : ''}`} 
              referrerPolicy="no-referrer"
            />
          </div>
          <p>상호명: 메탈로라(METALORA) | 대표자: 강동훈</p>
          <p>사업자등록번호: 776-19-02470</p>
          <p>통신판매업신고번호: 2026-울산울주-0166</p>
          <p>주소: 울산광역시 울주군 서생면 진하해변길 8, 12층 1202호 라-04호실(아성일마레)</p>
          <p>이메일: a76688058@gmail.com</p>
          <p className="mt-8 text-zinc-950 dark:text-zinc-400 font-medium">© 2026 METALORA. All rights reserved.</p>
        </div>

        {/* Center: Policy Links */}
        <div className="flex flex-wrap justify-center items-start gap-x-6 gap-y-4 text-sm font-medium">
          <button onClick={() => openModal('terms')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>이용약관</button>
          <button onClick={() => openModal('refund')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>환불정책</button>
          <button onClick={() => openModal('privacy')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>개인정보 처리방침</button>
          <button onClick={() => openModal('cookie')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>쿠키 정책</button>
          <button onClick={() => openModal('agreement')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>제작동의서</button>
        </div>

        {/* Right: Contact */}
        <div className="flex justify-center md:justify-end items-start text-sm font-medium">
          <a href="mailto:contact@metalora.me" className={`${theme === 'dark' ? 'text-zinc-200 hover:text-white' : 'text-zinc-800 hover:text-black'} transition-colors cursor-pointer`}>
            제휴/입점 문의
          </a>
        </div>
      </div>

      <PolicyModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.key ? policies[modalState.key].title : ''}
        content={modalState.key ? policies[modalState.key].content : null}
      />
    </footer>
  );
}
