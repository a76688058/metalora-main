import React from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'interactive' | 'new' | 'limited' | 'sold-out' | 'success';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-elevated text-text-secondary border-border-subtle',
  interactive: 'bg-accent-muted text-accent border-border-interactive/30',
  new: 'bg-accent-muted text-accent border-accent/20',
  limited: 'bg-warning-muted text-warning border-warning/20',
  'sold-out': 'bg-error-muted text-error border-error/20',
  success: 'bg-success-muted text-success border-success/20',
};

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 type-metadata font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
