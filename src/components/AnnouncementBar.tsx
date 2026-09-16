import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const FALLBACK_MESSAGES = [
  '새로운 컬렉션을 만나보세요',
  '포스터가 아닌 알루미늄 작품',
  '못 없이 설치하는 마그네틱 마운트.',
];

const BLOCKED_CLAIM =
  /무료\s*배송|전\s*지역\s*무료|벽면 손상|상처를 남기지|자국 없음|4K|영원히|양면 승화/i;

function allowedMessages(list: string[]): string[] {
  const kept = list.filter((msg) => msg.trim() && !BLOCKED_CLAIM.test(msg));
  return kept.length > 0 ? kept : FALLBACK_MESSAGES;
}

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
          setMessages(allowedMessages(data.map((b) => b.content)));
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
      <div className="container-shell flex h-8 items-center justify-center">
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
