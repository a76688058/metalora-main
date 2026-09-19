import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PolicyModal from './PolicyModal';

const Divider = () => <div className="my-6 h-px bg-border-subtle" />;

import { policies } from '../constants/policies';

export { policies };

function isUnmodifiedPrimaryClick(event: React.MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

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
    <footer className="w-full font-sans">
      {/* Opaque in-flow surface above Home's leaked sticky hero (z-[1]). PolicyModal stays a sibling so overlay z-index is not trapped. */}
      <div className="relative z-[2] isolate overflow-hidden border-t border-border-subtle bg-canvas">
        <div className="container-shell grid grid-cols-1 gap-10 py-12 md:grid-cols-3 md:py-14">
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
              <p>
                전화:{' '}
                <a
                  href="tel:01055950541"
                  className="focus-ring rounded-sm text-text-secondary underline-offset-2 hover:underline hover:text-text-primary"
                >
                  010-5595-0541
                </a>
              </p>
            </div>
            <p className="type-metadata mt-6 text-text-tertiary">© 2026 METALORA. All rights reserved.</p>
          </div>

          {/* Policies */}
          <div className="flex justify-center self-start">
            <div className="flex w-full flex-wrap items-start justify-center gap-x-5 gap-y-3 md:grid md:w-max md:grid-cols-3 md:auto-rows-min md:justify-items-start">
              {(
                [
                  ['terms', '이용약관'],
                  ['refund', '환불정책'],
                  ['privacy', '개인정보 처리방침'],
                  ['cookie', '쿠키 정책'],
                  ['agreement', '제작동의서'],
                ] as const
              ).map(([key, label]) => (
                <Link
                  key={key}
                  to={`/policy/${key}`}
                  className="focus-ring type-label text-text-secondary transition-colors hover:text-text-primary"
                  onClick={(event) => {
                    if (!isUnmodifiedPrimaryClick(event)) return;
                    event.preventDefault();
                    openModal(key);
                  }}
                >
                  {label}
                </Link>
              ))}
              <button
                type="button"
                className="focus-ring type-label border-0 bg-transparent p-0 text-text-secondary transition-colors hover:text-text-primary"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-cookie-settings'));
                }}
              >
                쿠키 설정
              </button>
            </div>
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
