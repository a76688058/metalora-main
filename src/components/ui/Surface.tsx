import React from 'react';
import { cn } from '../../lib/cn';

export type SurfaceVariant = 'flat' | 'raised' | 'floating' | 'modal' | 'glass';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  as?: 'div' | 'section' | 'article';
}

const variantClasses: Record<SurfaceVariant, string> = {
  flat: 'surface-flat',
  raised: 'surface-raised rounded-md',
  floating: 'surface-floating rounded-lg',
  modal: 'surface-modal rounded-lg',
  glass: 'surface-glass rounded-lg',
};

export function Surface({
  variant = 'raised',
  as: Component = 'div',
  className,
  children,
  ...props
}: SurfaceProps) {
  return (
    <Component className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </Component>
  );
}
