import React, { useState, useEffect } from 'react';
import PolicyModal from './PolicyModal';

const Divider = () => <div className="my-6 h-px bg-border-subtle" />;

import { policies } from '../constants/policies';

export { policies };

export default function Footer() {
  const [modalState, setModalState] = useState<{ isOpen: boolean; key: keyof typeof policies | null }>({
    isOpen: false,
    key: null,
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
    <footer className="w-full border-t border-border-subtle bg-canvas font-sans">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-12 md:grid-cols-3 md:py-14">
        {/* Company */}
        <div className="text-center md:text-left">
          <div className="mb-5 flex justify-center md:justify-start">
            <img
              src="/logo/metalora-wordmark.webp"
              alt="METALORA"
              width={384}
              height={124}
              className="h-5 w-auto object-contain opacity-70 dark:invert"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="type-supporting space-y-1 text-text-secondary">
            <p>상호명: 메탈로라(METALORA) | 대표자: 강동훈</p>
            <p>사업자등록번호: 776-19-02470</p>
            <p>통신판매업신고번호: 2026-울산울주-0166</p>
            <p>주소: 울산광역시 울주군 서생면 진하해변길 8, 12층 1202호 라-04호실(아성일마레)</p>
            <p>이메일: a76688058@gmail.com</p>
          </div>
          <p className="type-metadata mt-6 text-text-tertiary">© 2026 METALORA. All rights reserved.</p>
        </div>

        {/* Policies */}
        <div className="flex flex-wrap items-start justify-center gap-x-5 gap-y-3">
          {(
            [
              ['terms', '이용약관'],
              ['refund', '환불정책'],
              ['privacy', '개인정보 처리방침'],
              ['cookie', '쿠키 정책'],
              ['agreement', '제작동의서'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => openModal(key)}
              className="focus-ring type-label text-text-secondary transition-colors hover:text-text-primary"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Contact */}
        <div className="flex items-start justify-center md:justify-end">
          <a
            href="mailto:contact@metalora.me"
            className="focus-ring type-label text-text-secondary transition-colors hover:text-text-primary"
          >
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
