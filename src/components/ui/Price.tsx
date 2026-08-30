import React from 'react';
import { cn } from '../../lib/cn';

export type PriceVariant = 'primary' | 'secondary';

export interface PriceProps {
  amount: number;
  /** ISO currency; defaults to KRW display with ₩ prefix */
  currency?: 'KRW';
  variant?: PriceVariant;
  className?: string;
  /** Show sign for zero amounts (default true) */
  showZero?: boolean;
}

function formatKrw(amount: number): string {
  return amount.toLocaleString('ko-KR');
}

export function Price({
  amount,
  currency = 'KRW',
  variant = 'primary',
  className,
  showZero = true,
}: PriceProps) {
  if (!showZero && amount === 0) {
    return null;
  }

  const formatted = currency === 'KRW' ? `₩${formatKrw(amount)}` : formatKrw(amount);

  return (
    <span
      className={cn(
        variant === 'primary' ? 'type-price-primary text-text-primary' : 'type-price-secondary text-text-secondary',
        className,
      )}
    >
      {formatted}
    </span>
  );
}
