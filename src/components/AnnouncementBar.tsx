import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const FALLBACK_MESSAGES = [
  '새로운 컬렉션을 만나보세요',
  '포스터가 아닌 금속 작품',
  '못 없이 설치하는 마그네틱 마운트.',
];

const BLOCKED_CLAIM =
  /무료\s*배송|전\s*지역\s*무료|벽면 손상|상처를 남기지|자국 없음|4K|영원히|양면 승화/i;

function allowedMessages(list: string[]): string[] {
  const kept = list.filter((msg) => msg.trim() && !BLOCKED_CLAIM.test(msg));
  return kept.length > 0 ? kept : FALLBACK_MESSAGES;
}

const ANNOUNCEMENT_BLUE = '#0984E3';
const ANNOUNCEMENT_TEXT = '#FFFFFF';
/** Constant travel speed. Duration is derived from the measured loop width. */
const PIXELS_PER_SECOND = 36;

const AnnouncementBar = () => {
  const [messages, setMessages] = useState<string[]>(FALLBACK_MESSAGES);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [copies, setCopies] = useState(1);
  const [duration, setDuration] = useState(28);
  const viewRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<HTMLSpanElement>(null);

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
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduceMotion(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    if (reduceMotion) return;
    const run = runRef.current;
    const view = viewRef.current;
    if (!run || !view) return;

    const measure = () => {
      const runWidth = run.scrollWidth;
      const viewWidth = view.clientWidth;
      if (runWidth <= 0 || viewWidth <= 0) return;
      const needed = Math.max(1, Math.ceil(viewWidth / runWidth));
      if (needed !== copies) {
        setCopies(needed);
        return;
      }
      const next = (runWidth * needed) / PIXELS_PER_SECOND;
      setDuration((prev) => (Math.abs(prev - next) < 0.05 ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => observer.disconnect();
  }, [messages, copies, reduceMotion]);

  const renderRun = (copy: number, hidden: boolean) => (
    <span
      className="announcement-run"
      key={copy}
      ref={copy === 0 && !hidden ? runRef : undefined}
      aria-hidden={hidden ? true : undefined}
    >
      {messages.map((msg, index) => (
        <span className="announcement-slot" key={`${copy}-${index}`}>
          <span className="announcement-message">{msg}</span>
          <span className="announcement-sep" aria-hidden="true">·</span>
        </span>
      ))}
    </span>
  );

  const fillCount = reduceMotion ? 1 : copies;

  return (
    <div
      className="announcement-bar relative z-10 w-full shrink-0"
      style={{
        height: 'var(--shell-announcement-height)',
        backgroundColor: ANNOUNCEMENT_BLUE,
        color: ANNOUNCEMENT_TEXT,
        ['--announcement-duration' as string]: `${duration}s`,
      }}
      role="region"
      aria-label="공지"
      tabIndex={0}
    >
      <div className="announcement-viewport" ref={viewRef}>
        <div
          className={
            reduceMotion
              ? 'announcement-track'
              : 'announcement-track announcement-track--run'
          }
        >
          <div className="announcement-group">
            {Array.from({ length: fillCount }, (_, copy) => renderRun(copy, copy > 0))}
          </div>
          {reduceMotion ? null : (
            <div className="announcement-group announcement-clone" aria-hidden="true">
              {Array.from({ length: fillCount }, (_, copy) => renderRun(copy, true))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnouncementBar;
