import React from 'react';
import { cn } from '../../lib/cn';

/** Shared factual-zone canvas. Inner copy width stays narrower per module. */
export const FACTUAL_SHELL =
  'mx-auto w-full min-w-0 max-w-[72.5rem] px-5 sm:px-8 lg:px-12';

export function FactualIndex({
  index,
  label,
  invert = false,
}: {
  index: string;
  label: string;
  invert?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <span
        className={cn(
          'type-metadata tabular-nums',
          invert ? 'text-[#8c877e]' : 'text-text-tertiary',
        )}
      >
        {index}
      </span>
      <span
        aria-hidden="true"
        className={cn('type-metadata', invert ? 'text-[#8c877e]' : 'text-text-tertiary')}
      >
        —
      </span>
      <h3
        className={cn(
          'type-label tracking-[0.16em]',
          invert ? 'text-[#c8c3b8]' : 'text-text-secondary',
        )}
      >
        {label}
      </h3>
    </div>
  );
}

/** Illustrative thin-panel form. Edge depth is not a measured 1.15 mm. */
export function AluminumPanelVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative mx-auto w-full max-w-[17.5rem]', className)}
    >
      <div className="relative aspect-[200/283] w-full">
        <div className="absolute inset-0 bg-[linear-gradient(155deg,var(--color-metal-light)_0%,#d9d6d0_48%,#c5c2bb_100%)] dark:bg-[linear-gradient(155deg,#c8ccd3_0%,#9aa1ab_100%)]" />
        <div className="absolute inset-0 ring-1 ring-black/12 dark:ring-white/15" />
        <div className="absolute inset-y-[12%] right-0 w-px bg-black/10 dark:bg-white/20" />
        <div
          className="absolute top-[7px] right-[-8px] bottom-[-5px] w-[8px] origin-top bg-[linear-gradient(180deg,#b7b3ac,#8e8a84)] dark:bg-[linear-gradient(180deg,#8b919a,#5c636c)]"
          style={{ transform: 'skewY(-22deg)' }}
        />
        <div
          className="absolute right-[-3px] bottom-[-8px] left-[8px] h-[8px] bg-[linear-gradient(90deg,#c4c0b9,#8a8680)] dark:bg-[linear-gradient(90deg,#8b919a,#4e555e)]"
          style={{ transform: 'skewX(-22deg)' }}
        />
      </div>
    </div>
  );
}

/** Typography-led process cue. No thermal imagery. */
export function SublimationHeatVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative flex min-h-[14rem] items-center lg:min-h-[20rem]', className)}
    >
      <div className="w-full max-w-[28rem]">
        <p className="text-[clamp(4.5rem,12vw,7.5rem)] font-semibold leading-[0.82] tracking-[-0.055em] text-text-primary">
          180℃
        </p>
        <div className="relative mt-10 h-10 w-full max-w-[22rem]">
          <div className="absolute inset-x-0 top-3 h-[7px] bg-[#d8d4cc] ring-1 ring-black/10 dark:bg-[#5c6168]" />
          <div className="absolute inset-x-[8%] top-0 h-px bg-text-primary" />
          <div className="absolute inset-x-[8%] top-[22px] h-px bg-text-primary/35" />
        </div>
      </div>
    </div>
  );
}

export function ImageSurfaceVisual({
  src,
  className,
}: {
  src: string | null;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn('relative mx-auto w-full max-w-[18rem]', className)}>
      <div className="relative aspect-[200/283] w-full">
        <div className="absolute inset-0 overflow-hidden bg-metal-light">
          {src ? (
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[linear-gradient(160deg,var(--color-metal-light),var(--color-metal-mid))]" />
          )}
        </div>
        <div className="absolute inset-0 ring-1 ring-black/15 dark:ring-white/20" />
        <div
          className="absolute top-[7px] right-[-7px] bottom-[-4px] w-[7px] origin-top bg-[linear-gradient(180deg,#b0ada7,#7d7a74)] dark:bg-[#6b717a]"
          style={{ transform: 'skewY(-22deg)' }}
        />
        <div
          className="absolute right-[-2px] bottom-[-7px] left-[8px] h-[7px] bg-[linear-gradient(90deg,#b8b4ae,#7a7771)] dark:bg-[#6b717a]"
          style={{ transform: 'skewX(-22deg)' }}
        />
      </div>
    </div>
  );
}

const PROCESS_STEPS = [
  '이미지 준비',
  '출력',
  '승화전사',
  '후면 작업',
  '부품 조립',
  '검수',
  '포장',
] as const;

export function ProcessRailVisual({ className }: { className?: string }) {
  return (
    <ol
      aria-hidden="true"
      className={cn(
        'm-0 flex min-h-[5.5rem] list-none flex-wrap content-center items-baseline gap-x-3 gap-y-4 p-0 text-[0.8125rem] font-medium tracking-[0.04em] text-text-primary sm:min-h-[6.25rem] sm:gap-x-4 sm:gap-y-5 sm:text-[0.875rem] sm:tracking-[0.03em]',
        className,
      )}
    >
      {PROCESS_STEPS.map((step, index) => (
        <li key={step} className="flex min-w-0 items-baseline gap-2 sm:gap-2.5">
          {index > 0 ? (
            <span className="text-text-tertiary" aria-hidden="true">
              →
            </span>
          ) : null}
          <span className="whitespace-nowrap text-text-primary [word-break:keep-all]">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

const MOUNT_LAYERS = [
  {
    key: 'wall',
    label: '벽면',
    box: 'left-0 top-0 h-[25rem] w-[10.5rem] bg-[#e6e2da] dark:bg-[#2c3036]',
    labelClass: 'top-[22.25rem]',
  },
  {
    key: 'sticker',
    label: '보호 스티커',
    box: 'left-[2.35rem] top-[7.75rem] h-[7.25rem] w-[10rem] bg-[#f2eee7] ring-1 ring-black/10 dark:bg-[#3d4148] dark:ring-white/10',
    labelClass: 'top-[8.4rem]',
  },
  {
    key: 'wall-magnet',
    label: '벽면 자석',
    box: 'left-[4.35rem] top-[10.6rem] size-[4.15rem] bg-[#3d3d3a] dark:bg-[#1a1a18]',
    labelClass: 'top-[11.2rem]',
  },
  {
    key: 'art-magnet',
    label: '액자 자석',
    box: 'left-[5.85rem] top-[13.15rem] size-[4.15rem] bg-[#2a2a28] dark:bg-[#10100e]',
    labelClass: 'top-[13.7rem]',
  },
  {
    key: 'artwork',
    label: '액자',
    box: 'left-[8.1rem] top-[1.75rem] h-[18.05rem] w-[12.75rem] bg-[#d4d0c8] ring-1 ring-black/15 dark:bg-[#4a4e55] dark:ring-white/15',
    labelClass: 'top-[2.4rem]',
  },
] as const;

export function MountSchematicVisual({
  imageSrc,
  className,
}: {
  imageSrc?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="relative mx-auto h-[28rem] w-full max-w-[34rem]">
        <div aria-hidden="true" className="absolute inset-0">
          {MOUNT_LAYERS.map((layer) => (
            <div key={layer.key} className={cn('absolute overflow-hidden', layer.box)}>
              {layer.key === 'artwork' && imageSrc ? (
                <img src={imageSrc} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          ))}
        </div>
        <ol
          aria-label="설치 구조"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[7.5rem] list-none p-0 lg:block"
        >
          {MOUNT_LAYERS.map((layer) => (
            <li key={layer.key} className={cn('absolute right-0 type-body', layer.labelClass)}>
              {layer.label}
            </li>
          ))}
        </ol>
      </div>
      <ol
        aria-label="설치 구조"
        className="mt-6 m-0 flex list-none flex-col gap-1.5 p-0 type-supporting text-text-secondary lg:hidden"
      >
        {MOUNT_LAYERS.map((layer) => (
          <li key={layer.key}>{layer.label}</li>
        ))}
      </ol>
    </div>
  );
}

type IncludedKind = 'artwork' | 'ppf' | 'sticker' | 'magnets';

export function IncludedSilhouette({
  kind,
  imageSrc,
}: {
  kind: IncludedKind;
  imageSrc?: string | null;
}) {
  if (kind === 'artwork') {
    return (
      <div
        aria-hidden="true"
        className="aspect-[200/283] w-[8.75rem] bg-metal-light ring-1 ring-black/12 sm:w-[10.5rem] lg:w-[11.5rem] dark:ring-white/15"
      >
        {imageSrc ? (
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
    );
  }
  if (kind === 'ppf') {
    return (
      <div
        aria-hidden="true"
        className="h-[12.5rem] w-[7.25rem] bg-[rgba(108,104,96,0.16)] ring-1 ring-black/30 sm:h-[14.5rem] sm:w-[8.25rem] dark:bg-white/14 dark:ring-white/40"
      />
    );
  }
  if (kind === 'sticker') {
    return (
      <div
        aria-hidden="true"
        className="aspect-[190/145] w-[8.75rem] bg-[#ece9e2] ring-1 ring-black/10 sm:w-[10rem] dark:bg-[#3a3d42] dark:ring-white/10"
      />
    );
  }
  return (
    <div aria-hidden="true" className="flex items-end gap-2.5">
      <div className="size-[4.5rem] bg-[#3a3a37] sm:size-[5.25rem] dark:bg-[#1c1c1a]" />
      <div className="size-[4.5rem] bg-[#2f2f2c] sm:size-[5.25rem] dark:bg-[#141412]" />
    </div>
  );
}
