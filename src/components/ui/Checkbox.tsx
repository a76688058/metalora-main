import React, { forwardRef, useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id: idProp, disabled, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const descriptionId = description ? `${inputId}-desc` : undefined;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group flex min-h-11 cursor-pointer items-start gap-3 py-1',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="relative mt-0.5 flex size-11 shrink-0 items-center justify-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          aria-describedby={descriptionId}
          className="sr-only"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none flex size-5 items-center justify-center rounded-sm border transition-colors',
            'border-border-strong bg-surface',
            'group-has-[:checked]:border-accent group-has-[:checked]:bg-accent',
            'group-has-[:focus-visible]:outline group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-2 group-has-[:focus-visible]:outline-[var(--color-accent)]',
            disabled && 'border-disabled bg-disabled-bg',
          )}
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          <Check
            className="size-3.5 text-text-inverse opacity-0 transition-opacity group-has-[:checked]:opacity-100"
            strokeWidth={3}
          />
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
        <span className="type-body text-text-primary">{label}</span>
        {description ? (
          <span id={descriptionId} className="type-supporting text-text-tertiary">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});
