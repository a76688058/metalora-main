import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { normalizeKrMobilePhone } from '../../lib/phoneNormalize';
import { postCustomerAuth, readProofToken } from '../auth/customerAuthRequests';

type Step = 'explain' | 'verify' | 'processing' | 'done' | 'blocked';

type Eligibility = {
  eligible: boolean;
  method?: 'password' | 'otp';
  reason?: string;
};

const COPY: Record<string, string> = {
  financial_hold: '진행 중인 주문 또는 확인되지 않은 결제가 있어 탈퇴할 수 없습니다.',
  target_is_admin: '관리자 계정은 이 화면에서 탈퇴할 수 없습니다.',
  reauth_failed: '본인 확인에 실패했습니다. 다시 시도해 주세요.',
  config: '잠시 후 다시 시도해 주세요.',
  db_failed: '탈퇴를 완료하지 못했습니다. 계정은 유지됩니다.',
};

export default function AccountWithdrawalPanel({
  accessToken,
  isAdmin,
  isDark,
  onCancel,
  onCompleted,
}: {
  accessToken: string | null;
  isAdmin: boolean;
  isDark: boolean;
  onCancel: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<Step>(isAdmin ? 'blocked' : 'explain');
  const [eligibility, setEligibility] = useState<Eligibility | null>(isAdmin ? { eligible: false, reason: 'target_is_admin' } : null);
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin || !accessToken) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch('/api/account/withdrawal', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await response.json().catch(() => ({})) as { ok?: boolean; method?: string; reason_class?: string };
      if (cancelled) return;
      if (response.status === 200 && json.ok === true && (json.method === 'password' || json.method === 'otp')) {
        setEligibility({ eligible: true, method: json.method });
        return;
      }
      setEligibility({ eligible: false, reason: typeof json.reason_class === 'string' ? json.reason_class : 'config' });
      setStep('blocked');
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, isAdmin]);

  const reasonCopy = COPY[eligibility?.reason ?? ''] ?? COPY.config;
  const fieldClass = cn(
    'focus-ring type-body min-h-12 w-full rounded-md border bg-surface px-4 text-text-primary',
    'placeholder:text-text-tertiary border-border-subtle',
  );

  const sendOtp = async () => {
    if (!accessToken || !normalizeKrMobilePhone(phone).ok) {
      setError('휴대폰 번호를 확인해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await postCustomerAuth('/api/auth/otp/send', { purpose: 'withdrawal', phone }, { accessToken });
    setBusy(false);
    if (result.status !== 200 || result.json.ok !== true) {
      setError('등록된 휴대폰 번호로만 확인할 수 있습니다.');
      return;
    }
    setProof(null);
    setCode('');
  };

  const verifyOtp = async () => {
    if (!accessToken || !/^\d{6}$/.test(code.trim())) {
      setError('인증번호를 확인해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await postCustomerAuth(
      '/api/auth/otp/verify',
      { purpose: 'withdrawal', phone, code: code.trim() },
      { accessToken },
    );
    setBusy(false);
    const token = readProofToken(result.json);
    if (result.status !== 200 || result.json.ok !== true || !token) {
      setError('인증번호를 확인해주세요.');
      return;
    }
    setProof(token);
  };

  const submit = async () => {
    if (!accessToken || !confirmed || !eligibility?.method) return;
    setStep('processing');
    setError('');
    const body = eligibility.method === 'password'
      ? { password }
      : { proof_token: proof };
    const result = await postCustomerAuth('/api/account/withdrawal', body, { accessToken });
    if (result.status === 200 && result.json.ok === true) {
      setStep('done');
      onCompleted();
      return;
    }
    const reason = typeof result.json.reason_class === 'string' ? result.json.reason_class : 'db_failed';
    setEligibility({ eligible: reason !== 'financial_hold' && reason !== 'target_is_admin', method: eligibility.method, reason });
    setStep(reason === 'financial_hold' || reason === 'target_is_admin' ? 'blocked' : 'verify');
    setError(COPY[reason] ?? COPY.db_failed);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className={cn('text-[15px] leading-relaxed', isDark ? 'text-[#c9c4b8]' : 'text-[#3f3c36]')}>
        탈퇴하면 이 계정으로 로그인할 수 없습니다. 주문과 결제 기록은 법령에 따라 보관되며, 새 계정으로 이어지지 않습니다.
      </p>
      {step === 'explain' && (
        <button
          type="button"
          className="focus-ring min-h-12 rounded-[2px] bg-[#1a1914] px-4 text-[#f4f1eb] type-cta"
          disabled={!eligibility?.eligible || busy}
          onClick={() => setStep('verify')}
        >
          {eligibility ? '탈퇴 안내를 확인했습니다' : '자격 확인 중'}
        </button>
      )}
      {step === 'blocked' && <p className="text-[15px] text-text-primary">{reasonCopy}</p>}
      {step === 'verify' && eligibility?.method === 'password' && (
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="현재 비밀번호"
          className={fieldClass}
        />
      )}
      {step === 'verify' && eligibility?.method === 'otp' && (
        <div className="flex flex-col gap-3">
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="등록된 휴대폰 번호" className={fieldClass} inputMode="tel" />
          <button type="button" className="focus-ring min-h-12 rounded-md border border-border-subtle type-label" onClick={() => void sendOtp()} disabled={busy}>인증번호 받기</button>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="인증번호" className={fieldClass} inputMode="numeric" />
          <button type="button" className="focus-ring min-h-12 rounded-md border border-border-subtle type-label" onClick={() => void verifyOtp()} disabled={busy}>인증번호 확인</button>
        </div>
      )}
      {step === 'verify' && (
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={confirmed} onChange={() => setConfirmed((value) => !value)} />
          탈퇴를 진행합니다
        </label>
      )}
      {error && <p className="text-[14px] text-text-primary" role="alert">{error}</p>}
      {step === 'processing' && (
        <p className="flex items-center gap-2 text-[15px]"><Loader2 className="animate-spin" size={18} aria-hidden="true" />탈퇴를 처리하고 있습니다</p>
      )}
      <div className="flex gap-3">
        <button type="button" className="focus-ring min-h-12 flex-1 rounded-[2px] border border-border-subtle type-cta" onClick={onCancel}>돌아가기</button>
        {step === 'verify' && (
          <button
            type="button"
            className="focus-ring min-h-12 flex-1 rounded-[2px] bg-[#1a1914] text-[#f4f1eb] type-cta disabled:opacity-40"
            disabled={busy || !confirmed || (eligibility?.method === 'password' ? password.length < 8 : !proof)}
            onClick={() => void submit()}
          >
            회원탈퇴
          </button>
        )}
      </div>
    </div>
  );
}
