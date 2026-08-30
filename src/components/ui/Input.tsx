import React, { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  hideLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, hideLabel = false, className, id: idProp, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, !error ? helperId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={inputId}
          className={cn('type-label text-text-secondary', hideLabel && 'sr-only')}
        >
          {label}
          {required ? <span className="text-error ml-0.5" aria-hidden>*</span> : null}
        </label>
      ) : null}

      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'focus-ring type-body min-h-12 w-full rounded-md border bg-surface px-4 text-text-primary',
          'placeholder:text-text-tertiary',
          'border-border-subtle focus:border-border-interactive',
          'disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled',
          error && 'border-error focus:border-error',
          className,
        )}
        style={{ transitionDuration: 'var(--duration-fast)' }}
        {...props}
      />

      {error ? (
        <p id={errorId} className="type-supporting text-error" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="type-supporting text-text-tertiary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
