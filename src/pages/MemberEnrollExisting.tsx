import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';
import PolicyModal from '../components/PolicyModal';
import { policies } from '../constants/policies';
import { cn } from '../lib/cn';
import { isPendingC1SocialCustomer, isUsableMemberProfile } from '../lib/authIntegrity';
import {
  memberUsernameSignupError,
  MEMBER_USERNAME_MIN_LEN,
  normalizeMemberUsername,
} from '../lib/memberUsername';
import { normalizeKrMobilePhone } from '../lib/phoneNormalize';
import {
  mapOtpSendError,
  mapOtpVerifyError,
  mapSignupCompleteError,
  postCustomerAuth,
  readProofToken,
} from '../components/auth/customerAuthRequests';

const OTP_RESEND_SECONDS = 60;

function ConsentRow({
  label,
  checked,
  onChange,
  onView,
  isDark,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  onView?: () => void;
  isDark: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1 min-h-[2.5rem]">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${label} (필수)`}
        onClick={onChange}
        className={cn(
          'w-5 h-5 rounded-md flex items-center justify-center transition-colors flex-shrink-0 focus-ring border',
          checked
            ? (isDark ? 'border-transparent bg-zinc-300' : 'border-transparent bg-zinc-800')
            : (isDark ? 'bg-zinc-800 border-white/10' : 'bg-zinc-100 border-black/10'),
        )}
      >
        {checked && <Check size={12} className={isDark ? 'text-zinc-900' : 'text-white'} strokeWidth={3} />}
      </button>
      <button type="button" onClick={onChange} className="flex-1 text-left flex items-center gap-1.5 min-w-0 focus-ring rounded-md">
        <span className="text-zinc-500 text-[13px] font-medium shrink-0">[필수]</span>
        <span className="text-[13px] font-medium text-text-primary">{label}</span>
      </button>
      {onView ? (
        <button
          type="button"
          onClick={onView}
          className={`text-[12px] underline underline-offset-4 ml-auto px-2 py-1 font-medium focus-ring rounded-md ${
            isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          보기
        </button>
      ) : null}
    </div>
  );
}

export default function MemberEnrollExisting() {
  const navigate = useNavigate();
  const { user, session, profile, isLoading, isProfileResolved, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [proofToken, setProofToken] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [agreements, setAgreements] = useState({ terms: false, privacy: false, cookie: false });
  const [policyKey, setPolicyKey] = useState<keyof typeof policies | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const authReady = !isLoading && isProfileResolved;
  const pendingSocial = authReady && isPendingC1SocialCustomer(user, profile);
  const usable = isUsableMemberProfile(profile);
  const allChecked = agreements.terms && agreements.privacy && agreements.cookie;
  const usernameError = username ? memberUsernameSignupError(username) : null;
  const canEnroll = Boolean(proofToken) && !usernameError && username.length >= MEMBER_USERNAME_MIN_LEN && allChecked && !submitting;

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (pendingSocial) {
      navigate('/login', { replace: true });
      return;
    }
    if (usable) {
      navigate('/', { replace: true });
    }
  }, [authReady, user, pendingSocial, usable, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const clearError = () => setErrorMsg('');

  const sendOtp = async () => {
    if (!normalizeKrMobilePhone(phone).ok) {
      setErrorMsg('휴대폰 번호를 확인해주세요.');
      return;
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      setErrorMsg('인증이 필요합니다.');
      return;
    }
    setOtpSending(true);
    clearError();
    setOtpVerified(false);
    setProofToken(null);
    const result = await postCustomerAuth(
      '/api/auth/otp/send',
      { purpose: 'identity_link', phone },
      { accessToken },
    );
    setOtpSending(false);
    if (result.status !== 200 || result.json.ok !== true) {
      setErrorMsg(mapOtpSendError(result.status));
      return;
    }
    setOtpSent(true);
    setOtpCode('');
    setResendIn(OTP_RESEND_SECONDS);
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setErrorMsg('인증번호를 확인해주세요.');
      return;
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      setErrorMsg('인증이 필요합니다.');
      return;
    }
    setOtpVerifying(true);
    clearError();
    const result = await postCustomerAuth(
      '/api/auth/otp/verify',
      { purpose: 'identity_link', phone, code: otpCode.trim() },
      { accessToken },
    );
    setOtpVerifying(false);
    const token = readProofToken(result.json);
    if (result.status !== 200 || result.json.ok !== true || !token) {
      setErrorMsg(mapOtpVerifyError(result.status, result.json));
      return;
    }
    setOtpVerified(true);
    setProofToken(token);
  };

  const handleEnroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || done) return;
    const nextUsernameError = memberUsernameSignupError(username);
    if (nextUsernameError) {
      setErrorMsg(nextUsernameError);
      return;
    }
    if (!proofToken) {
      setErrorMsg('휴대폰 인증을 완료해 주세요.');
      return;
    }
    if (!allChecked) {
      setErrorMsg('필수 약관에 동의해 주세요.');
      return;
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      setErrorMsg('인증이 필요합니다.');
      return;
    }

    setSubmitting(true);
    clearError();
    const result = await postCustomerAuth(
      '/api/auth/member-enroll-existing',
      {
        proof_token: proofToken,
        username: normalizeMemberUsername(username),
        consents: {
          terms: agreements.terms,
          privacy: agreements.privacy,
          cookie: agreements.cookie,
        },
      },
      { accessToken },
    );
    if (result.status !== 200 || result.json.ok !== true) {
      setSubmitting(false);
      setErrorMsg(mapSignupCompleteError(result.status, result.json));
      return;
    }

    setDone(true);
    await refreshProfile();
    navigate('/', { replace: true });
  };

  const labelClass = 'block text-[14px] font-medium tracking-tight mb-2 text-text-primary';
  const fieldClass = cn(
    'focus-ring type-body min-h-12 w-full rounded-md border bg-surface px-4 text-text-primary',
    'placeholder:text-text-tertiary border-border-subtle',
  );
  const sideBtn = cn(
    'focus-ring shrink-0 min-h-12 min-w-[4.75rem] px-3 rounded-md type-label',
    isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-200 text-zinc-800',
  );

  const shellClass = cn(
    'min-h-screen flex items-center justify-center p-4',
    isDark ? 'bg-[#07080a] text-zinc-100' : 'bg-[#ebe7ee] text-zinc-900',
  );

  if (!authReady || !user || pendingSocial || usable) {
    return (
      <div className={shellClass} aria-busy="true" aria-live="polite">
        <Loader2 className={`animate-spin ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} size={22} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={cn('w-full max-w-[26.5rem] rounded-[24px] px-5 py-7 sm:px-8 sm:py-8', isDark ? 'bg-[#121316]' : 'bg-[#f4f1eb]')}>
        <img
          src="/logo/metalora-wordmark.webp"
          alt="METALORA"
          width={384}
          height={124}
          className={cn('mx-auto mb-8 w-[6.25rem] object-contain', isDark && 'invert')}
          referrerPolicy="no-referrer"
        />

        {done ? (
          <div className="flex flex-col items-center text-center" aria-live="polite">
            <Loader2 className={`animate-spin mb-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} size={22} aria-hidden="true" />
            <p className="text-[15px] font-medium tracking-tight text-text-primary">회원 전환 완료</p>
          </div>
        ) : (
          <form onSubmit={(event) => { void handleEnroll(event); }} className="flex flex-col gap-5">
            <h1 className="text-[15px] font-medium tracking-tight text-text-primary">스토어 회원으로 전환</h1>
            <p className={`text-[13px] tracking-tight ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
              같은 계정으로 스토어를 이용할 수 있습니다.
            </p>

            <div>
              <label htmlFor="enroll-username" className={labelClass}>회원 아이디</label>
              <input
                id="enroll-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                minLength={MEMBER_USERNAME_MIN_LEN}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  clearError();
                }}
                className={fieldClass}
              />
              {username.length > 0 && username.length < MEMBER_USERNAME_MIN_LEN && (
                <p className={`mt-1.5 text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>영문/숫자 4자 이상</p>
              )}
              {username.length >= MEMBER_USERNAME_MIN_LEN && usernameError && (
                <p className="mt-1.5 text-[12px] font-medium text-error" role="alert">{usernameError}</p>
              )}
            </div>

            <div>
              <label htmlFor="enroll-phone" className={labelClass}>휴대폰 번호</label>
              <div className="flex gap-2">
                <input
                  id="enroll-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  disabled={otpVerified}
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setOtpSent(false);
                    setOtpVerified(false);
                    setProofToken(null);
                    setOtpCode('');
                    clearError();
                  }}
                  className={cn(fieldClass, 'min-w-0')}
                />
                <button
                  type="button"
                  onClick={() => { void sendOtp(); }}
                  disabled={otpSending || resendIn > 0 || otpVerified}
                  aria-busy={otpSending}
                  className={sideBtn}
                >
                  {otpSending ? '전송 중...' : (otpVerified ? '확인됨' : (otpSent && resendIn > 0 ? `${resendIn}s` : '인증번호 발송'))}
                </button>
              </div>
            </div>

            {otpSent && !otpVerified && (
              <div>
                <label htmlFor="enroll-otp" className={labelClass}>인증번호</label>
                <p id="enroll-otp-hint" className={`mb-1.5 text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  인증번호를 입력해 주세요.
                </p>
                <div className="flex gap-2">
                  <input
                    id="enroll-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(event) => {
                      setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                      clearError();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void verifyOtp();
                      }
                    }}
                    aria-describedby="enroll-otp-hint"
                    className={cn(fieldClass, 'min-w-0 tracking-[0.3em]')}
                  />
                  <button
                    type="button"
                    onClick={() => { void verifyOtp(); }}
                    disabled={otpVerifying || otpCode.length !== 6}
                    aria-busy={otpVerifying}
                    className={sideBtn}
                  >
                    {otpVerifying ? '확인 중...' : '인증'}
                  </button>
                </div>
              </div>
            )}

            {otpVerified && (
              <div className="flex flex-col gap-1" role="group" aria-label="필수 동의">
                <ConsentRow
                  label="이용약관 동의"
                  checked={agreements.terms}
                  onChange={() => setAgreements((prev) => ({ ...prev, terms: !prev.terms }))}
                  onView={() => setPolicyKey('terms')}
                  isDark={isDark}
                />
                <ConsentRow
                  label="개인정보처리방침 동의"
                  checked={agreements.privacy}
                  onChange={() => setAgreements((prev) => ({ ...prev, privacy: !prev.privacy }))}
                  onView={() => setPolicyKey('privacy')}
                  isDark={isDark}
                />
                <ConsentRow
                  label="쿠키 정책 동의"
                  checked={agreements.cookie}
                  onChange={() => setAgreements((prev) => ({ ...prev, cookie: !prev.cookie }))}
                  onView={() => setPolicyKey('cookie')}
                  isDark={isDark}
                />
              </div>
            )}

            {errorMsg ? (
              <p className="text-[13px] font-medium text-error" role="alert">{errorMsg}</p>
            ) : null}

            <Button type="submit" variant="primary" fullWidth loading={submitting} disabled={!canEnroll}>
              {submitting ? '전환 중...' : '회원 전환 완료'}
            </Button>
          </form>
        )}
      </div>

      <PolicyModal
        isOpen={policyKey !== null}
        onClose={() => setPolicyKey(null)}
        title={policyKey ? policies[policyKey].title : ''}
        content={policyKey ? policies[policyKey].content : null}
      />
    </div>
  );
}
