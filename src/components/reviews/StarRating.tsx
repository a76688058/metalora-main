import { useId } from 'react';
import { cn } from '../../lib/cn';

type StarRatingProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
};

export function StarRating({ value, onChange, disabled = false, className }: StarRatingProps) {
  const name = useId();

  return (
    <div role="radiogroup" aria-label="별점" className={cn('flex gap-1 text-xl', className)}>
      {[1, 2, 3, 4, 5].map((score) => {
        const selected = value === score;
        return (
          <label
            key={score}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[1em]',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]',
              selected || score <= value ? 'text-text-primary' : 'text-text-tertiary',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={score}
              checked={selected}
              disabled={disabled}
              aria-label={`${score}점`}
              onChange={() => onChange(score)}
              className="sr-only"
            />
            <span aria-hidden="true" className="pointer-events-none">{selected || score <= value ? '★' : '☆'}</span>
          </label>
        );
      })}
    </div>
  );
}
