import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export type IconButtonVariant = 'default' | 'ghost' | 'destructive';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required for accessibility */
  'aria-label': string;
  variant?: IconButtonVariant;
}

const variantClasses: Record<IconButtonVariant, string> = {
  default:
    'bg-surface-elevated text-text-primary border border-border-subtle hover:bg-surface-interactive',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-surface-interactive hover:text-text-primary',
  destructive:
    'bg-error-muted text-error border border-transparent hover:opacity-90',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        className,
      )}
      style={{ transitionDuration: 'var(--duration-fast)' }}
      {...props}
    >
      {children}
    </button>
  );
});
