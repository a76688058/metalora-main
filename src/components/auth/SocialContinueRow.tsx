import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { C1SocialProvider } from './socialOAuth';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.17.26-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function KakaoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect width="18" height="18" rx="5" fill="#FEE500" />
      <path
        fill="#191919"
        d="M9 4.2c-2.7 0-4.9 1.72-4.9 3.84 0 1.36.9 2.56 2.26 3.24l-.58 2.16 2.5-1.32c.23.03.47.05.72.05 2.7 0 4.9-1.72 4.9-3.84S11.7 4.2 9 4.2Z"
      />
    </svg>
  );
}

export default function SocialContinueRow({
  busyProvider,
  disabled,
  providers = ['google', 'kakao'],
  onContinue,
}: {
  busyProvider: C1SocialProvider | null;
  disabled?: boolean;
  providers?: C1SocialProvider[];
  onContinue: (provider: C1SocialProvider) => void;
}) {
  const googleBusy = busyProvider === 'google';
  const kakaoBusy = busyProvider === 'kakao';
  const locked = Boolean(disabled || busyProvider);
  const showGoogle = providers.includes('google');
  const showKakao = providers.includes('kakao');
  if (!showGoogle && !showKakao) return null;

  return (
    <div className="flex flex-col gap-2">
      {showGoogle && (
        <button
          type="button"
          onClick={() => onContinue('google')}
          disabled={locked}
          aria-label="Google로 계속"
          aria-busy={googleBusy}
          className="ml-auth-social focus-ring"
        >
          <span className="ml-auth-social-mark" aria-hidden="true">
            {googleBusy ? <Loader2 className="animate-spin" size={16} /> : <GoogleMark />}
          </span>
          <span>Google로 계속</span>
        </button>
      )}
      {showKakao && (
        <button
          type="button"
          onClick={() => onContinue('kakao')}
          disabled={locked}
          aria-label="카카오로 계속"
          aria-busy={kakaoBusy}
          className="ml-auth-social focus-ring"
        >
          <span className="ml-auth-social-mark" aria-hidden="true">
            {kakaoBusy ? <Loader2 className="animate-spin" size={16} /> : <KakaoMark />}
          </span>
          <span>카카오로 계속</span>
        </button>
      )}
    </div>
  );
}

export function SocialDivider({ label = '또는', quiet }: { label?: string; quiet: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5" role="separator" aria-label={label}>
      <div className={cn('h-px flex-1', quiet)} />
      <span className="text-[11px] tracking-[0.14em] text-zinc-500">{label}</span>
      <div className={cn('h-px flex-1', quiet)} />
    </div>
  );
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="ml-auth-notice">
      {children}
    </div>
  );
}
