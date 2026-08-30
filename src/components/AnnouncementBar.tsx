import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const FALLBACK_MESSAGES = [
  '지금 주문 시 무료 배송 (오늘 마감)',
  'ATELIER의 새로운 컬렉션을 만나보세요',
  '포스터가 아닌 엔지니어링 된 작품',
  '벽에 상처를 남기지 않는 혁신적인 거치 방식',
];

const AnnouncementBar = () => {
  const [messages, setMessages] = useState<string[]>(FALLBACK_MESSAGES);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const { data, error } = await supabase
          .from('banners')
          .select('content')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) {
          if (error.code === 'PGRST205') return;
          throw error;
        }

        if (data && data.length > 0) {
          setMessages(data.map((b) => b.content));
        }
      } catch (error) {
        console.error('Error fetching banners for bar:', error);
      }
    };

    fetchBanners();
  }, []);

  useEffect(() => {
    if (messages.length <= 1) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) return;

    const interval = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % messages.length);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [messages.length]);

  const displayMessage = messages[activeIndex] ?? messages[0];

  return (
    <div
      className="relative z-10 w-full shrink-0 border-b border-border-subtle bg-surface-elevated"
      style={{
        minHeight: 'var(--shell-announcement-height)',
        backgroundColor: 'var(--color-surface-elevated)',
      }}
      role="region"
      aria-label="공지"
    >
      <div className="mx-auto flex h-8 max-w-7xl items-center justify-center px-4 sm:px-6">
        <p className="type-metadata truncate text-center text-text-secondary">
          {displayMessage}
        </p>
        {messages.length > 1 ? (
          <span className="sr-only">
            {messages.map((msg, i) => (
              <span key={i}>{msg}. </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default AnnouncementBar;
