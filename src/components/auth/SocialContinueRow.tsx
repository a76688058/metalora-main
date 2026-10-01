import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { C1_SOCIAL_PROVIDERS, type C1SocialProvider } from './socialOAuth';

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.17.26-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function KakaoMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect width="18" height="18" rx="5" fill="#FEE500" />
      <path
        fill="#191919"
        d="M9 4.2c-2.7 0-4.9 1.72-4.9 3.84 0 1.36.9 2.56 2.26 3.24l-.58 2.16 2.5-1.32c.23.03.47.05.72.05 2.7 0 4.9-1.72 4.9-3.84S11.7 4.2 9 4.2Z"
      />
    </svg>
  );
}

function NaverMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect width="18" height="18" rx="5" fill="#03C75A" />
      <path fill="#fff" d="M7.12 4.7h2.02l1.86 2.72V4.7H13.6v8.6h-2.02L9.72 10.58V13.3H7.12V4.7Z" />
    </svg>
  );
}

export default function SocialContinueRow({
  busyProvider,
  disabled,
  providers = [...C1_SOCIAL_PROVIDERS],
  density = 'stack',
  onContinue,
}: {
  busyProvider: C1SocialProvider | null;
  disabled?: boolean;
  providers?: C1SocialProvider[];
  density?: 'stack' | 'family';
  onContinue: (provider: C1SocialProvider) => void;
}) {
  const googleBusy = busyProvider === 'google';
  const kakaoBusy = busyProvider === 'kakao';
  const naverBusy = busyProvider === 'naver';
  const locked = Boolean(disabled || busyProvider);
  const showGoogle = providers.includes('google');
  const showKakao = providers.includes('kakao');
  const showNaver = providers.includes('naver');
  const family = density === 'family';
  if (!showGoogle && !showKakao && !showNaver) return null;

  const item = (
    provider: C1SocialProvider,
    label: string,
    busy: boolean,
    mark: React.ReactNode,
    slot: 'google' | 'kakao' | 'naver',
  ) => (
    <button
      type="button"
      onClick={() => onContinue(provider)}
      disabled={locked}
      aria-label={label}
      aria-busy={busy}
      className={cn('ml-auth-social focus-ring', family && 'ml-auth-social--family')}
    >
      <span className={cn('ml-auth-social-mark', family && `ml-auth-social-slot ml-auth-social-slot--${slot}`)} aria-hidden="true">
        {busy ? <Loader2 className="animate-spin" size={16} /> : mark}
      </span>
      {!family && <span>{label}</span>}
    </button>
  );

  return (
    <div
      className={family ? 'ml-auth-social-family' : 'flex flex-col gap-2'}
      role="group"
      aria-label="다른 방법으로 계속"
    >
      {showGoogle && item('google', 'Google로 계속', googleBusy, <GoogleMark size={18} />, 'google')}
      {showKakao && item('kakao', '카카오로 계속', kakaoBusy, <KakaoMark size={18} />, 'kakao')}
      {showNaver && item('naver', 'Naver로 계속', naverBusy, <NaverMark size={18} />, 'naver')}
    </div>
  );
}

export function SocialDivider({ label = '또는', quiet, compact }: { label?: string; quiet: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', compact ? 'py-0' : 'py-0.5')} role="separator" aria-label={label}>
      <div className={cn('h-px flex-1', quiet)} />
      <span className={cn('text-[11px] text-zinc-500', compact ? 'tracking-[0.08em] opacity-70' : 'tracking-[0.14em]')}>{label}</span>
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
