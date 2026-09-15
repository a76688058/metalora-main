import React, { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MOTION } from '../../constants/motion';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { cn } from '../../lib/cn';

/**
 * One-shot block editorial reveal for PDP factual chapters.
 * Not scrubbed. Not a spring. Not line-by-line.
 */
const EASE = MOTION.ease.enter;

/** Reveal when the block top reaches ~60% from the top of the viewport. */
const TRIGGER_RATIO = 0.6;

const BLOCK = {
  y: 24,
  duration: 0.84,
} as const;

/** Hairline follows the block; secondary to the content. */
export const HAIRLINE_DELAY = 0.1;

export function useEditorialInView<T extends Element>(): [
  (node: T | null) => void,
  boolean,
] {
  const [node, setNode] = useState<T | null>(null);
  const reduced = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const el = node;
    if (!el) return;

    let done = false;
    let io: IntersectionObserver;
    let poll = 0;

    const onScroll = () => {
      if (el.getBoundingClientRect().top / window.innerHeight <= TRIGGER_RATIO) {
        enter();
      }
    };

    const enter = () => {
      if (done) return;
      done = true;
      el.setAttribute('data-editorial-entered', 'true');
      setEntered(true);
      io.disconnect();
      window.clearInterval(poll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };

    io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) enter();
      },
      { threshold: 0.12, rootMargin: '0px 0px -40% 0px' },
    );
    io.observe(el);
    onScroll();
    poll = window.setInterval(onScroll, 180);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      done = true;
      io.disconnect();
      window.clearInterval(poll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, node]);

  return [setNode, reduced || entered];
}

interface EditorialRevealProps {
  show: boolean;
  children: ReactNode;
  className?: string;
}

export function EditorialReveal({ show, children, className }: EditorialRevealProps) {
  const reduced = usePrefersReducedMotion();
  const visible = reduced || show;

  return (
    <motion.div
      key={visible ? 'in' : 'out'}
      className={className}
      variants={{
        hidden: { opacity: 0, y: BLOCK.y },
        visible: { opacity: 1, y: 0 },
      }}
      initial={reduced ? 'visible' : 'hidden'}
      animate={visible ? 'visible' : 'hidden'}
      transition={{ duration: reduced ? 0 : BLOCK.duration, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

interface EditorialLineProps {
  show: boolean;
  className?: string;
  delay?: number;
}

export function EditorialLine({
  show,
  className,
  delay = HAIRLINE_DELAY,
}: EditorialLineProps) {
  const reduced = usePrefersReducedMotion();
  const visible = reduced || show;

  return (
    <motion.div
      key={visible ? 'in' : 'out'}
      aria-hidden="true"
      className={cn('h-px w-full origin-left bg-border-subtle', className)}
      initial={reduced ? 'visible' : 'hidden'}
      animate={visible ? 'visible' : 'hidden'}
      variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }}
      transition={{ duration: reduced ? 0 : 0.48, delay: reduced ? 0 : delay, ease: EASE }}
    />
  );
}
