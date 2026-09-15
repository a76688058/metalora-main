import React from 'react';

interface ProductTheatreLayoutProps {
  stage: React.ReactNode;
  rail: React.ReactNode;
}

/**
 * Desktop theatre: viewport-tall media + 24rem rail from 1100px.
 * Stacked fallback below 1100px (mobile polish is PDP-005).
 */
export function ProductTheatreLayout({ stage, rail }: ProductTheatreLayoutProps) {
  return (
    <div className="bg-canvas text-text-primary">
      <div className="flex min-h-0 flex-col min-[1100px]:h-[calc(100svh-var(--shell-offset))] min-[1100px]:flex-row">
        <div className="relative min-h-[70svh] w-full min-[1100px]:h-full min-[1100px]:min-h-0 min-[1100px]:min-w-0 min-[1100px]:flex-1">
          {stage}
        </div>
        <aside className="w-full shrink-0 border-t border-border-subtle min-[1100px]:h-full min-[1100px]:w-96 min-[1100px]:overflow-y-auto min-[1100px]:border-l min-[1100px]:border-t-0">
          {rail}
        </aside>
      </div>
    </div>
  );
}
