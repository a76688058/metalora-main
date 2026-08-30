import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-text-primary text-text-inverse border border-text-primary hover:opacity-90 active:opacity-95 dark:bg-text-primary dark:text-text-inverse',
  secondary:
    'bg-surface-elevated text-text-primary border border-border-subtle hover:bg-surface-interactive active:bg-surface-elevated',
  ghost:
    'bg-transparent text-text-primary border border-transparent hover:bg-surface-interactive active:bg-surface-elevated',
  destructive:
    'bg-error text-text-inverse border border-error hover:opacity-90 active:opacity-95',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 type-cta',
  lg: 'min-h-12 px-5 type-cta text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'lg',
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-md font-sans transition-opacity',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-disabled-bg disabled:text-disabled disabled:border-disabled-bg',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      style={{ transitionDuration: 'var(--duration-fast)' }}
      {...props}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
