import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/cn';
import { memberPasswordError, MEMBER_PASSWORD_MIN_LEN } from '../lib/passwordPolicy';
import { Button } from '../components/ui/Button';
import PasswordVisibilityToggle from '../components/auth/PasswordVisibilityToggle';

type PageState = 'loading' | 'invalid' | 'form' | 'success';

function mapUpdatePasswordError(code?: string, message?: string): string {
  const normalizedCode = (code ?? '').trim().toLowerCase();
  const normalizedMessage = (message ?? '').trim().toLowerCase();
  if (
    normalizedCode === 'weak_password'
    || normalizedMessage.includes('weak')
    || normalizedMessage.includes('8')
  ) {
    return '비밀번호는 8자 이상이어야 합니다.';
  }
  if (
    normalizedCode === 'session_not_found'
    || normalizedCode === 'invalid_jwt'
    || normalizedMessage.includes('session')
    || normalizedMessage.includes('expired')
    || normalizedMessage.includes('jwt')
  ) {
    return '링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.';
  }
  return '비밀번호를 변경하지 못했습니다. 다시 시도해 주세요.';
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [pageState, setPageState] = useState<PageState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applySession = (id: string | null) => {
      if (cancelled) return;
      setUserId(id);
      setPageState((current) => {
        if (current === 'success') return current;
        return id ? 'form' : 'invalid';
      });
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session?.user?.id ?? null);
    }).catch(() => {
      applySession(null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const policyError = memberPasswordError(password);
  const mismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const canSubmit =
    !submitting
    && !policyError
    && password.length >= MEMBER_PASSWORD_MIN_LEN
    && password === passwordConfirm;

  const goLogin = () => {
    navigate('/login', { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || pageState !== 'form') return;

    const nextPolicyError = memberPasswordError(password);
    if (nextPolicyError) {
      setErrorMsg(nextPolicyError);
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMsg('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!userId) {
      setPageState('invalid');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSubmitting(false);
      setErrorMsg(mapUpdatePasswordError(error.code, error.message));
      if (
        (error.code ?? '').toLowerCase() === 'session_not_found'
        || (error.message ?? '').toLowerCase().includes('session')
        || (error.message ?? '').toLowerCase().includes('expired')
      ) {
        setPageState('invalid');
      }
      return;
    }

    setPageState('success');

    let isAdmin = false;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .maybeSingle();
      isAdmin = data?.is_admin === true;
    } catch {
      isAdmin = false;
    }

    await signOut({ redirect: false, toast: false });
    navigate(isAdmin ? '/admin/login' : '/login', { replace: true });
  };

  const shellClass = cn(
    'min-h-screen flex items-center justify-center p-4',
    isDark ? 'bg-[#07080a] text-zinc-100' : 'bg-[#ebe7ee] text-zinc-900',
  );

  const panelClass = cn(
    'w-full max-w-[26.5rem] rounded-[24px] px-5 py-7 sm:px-8 sm:py-8',
    isDark ? 'bg-[#121316]' : 'bg-[#f4f1eb]',
  );

  const labelClass = 'block text-[14px] font-medium tracking-tight mb-2 text-text-primary';
  const fieldClass = cn(
    'focus-ring type-body min-h-12 w-full rounded-md border bg-surface px-4 pr-12 text-text-primary',
    'placeholder:text-text-tertiary border-border-subtle',
  );

  return (
    <div className={shellClass}>
      <div className={panelClass}>
        <img
          src="/logo/metalora-wordmark.webp"
          alt="METALORA"
          width={384}
          height={124}
          className={cn('mx-auto mb-8 w-[6.25rem] object-contain', isDark && 'invert')}
          referrerPolicy="no-referrer"
        />

        {pageState === 'loading' && (
          <div className="flex flex-col items-center" aria-busy="true" aria-live="polite">
            <Loader2
              className={`animate-spin mb-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
              size={22}
              aria-hidden="true"
            />
            <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-600'}`}>확인 중</p>
          </div>
        )}

        {pageState === 'invalid' && (
          <div className="flex flex-col text-center">
            <h1 className="text-[15px] font-medium tracking-tight text-text-primary">
              링크가 만료되었거나 유효하지 않습니다.
            </h1>
            <p className={`mt-3 text-[13px] tracking-tight ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
              로그인으로 돌아가 다시 시도해 주세요.
            </p>
            <Button type="button" variant="primary" fullWidth className="mt-8" onClick={goLogin}>
              로그인
            </Button>
          </div>
        )}

        {pageState === 'success' && (
          <div className="flex flex-col items-center text-center" aria-live="polite">
            <Loader2
              className={`animate-spin mb-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
              size={22}
              aria-hidden="true"
            />
            <p className="text-[15px] font-medium tracking-tight text-text-primary">
              비밀번호가 변경되었습니다.
            </p>
          </div>
        )}

        {pageState === 'form' && (
          <form onSubmit={(event) => { void handleSubmit(event); }} className="flex flex-col gap-5">
            <h1 className="sr-only">비밀번호 재설정</h1>
            <div>
              <label htmlFor="recovery-new-password" className={labelClass}>새 비밀번호</label>
              <div className="relative">
                <input
                  id="recovery-new-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={MEMBER_PASSWORD_MIN_LEN}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrorMsg('');
                  }}
                  className={fieldClass}
                />
                <PasswordVisibilityToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                  dark={isDark}
                />
              </div>
              {password.length > 0 && password.length < MEMBER_PASSWORD_MIN_LEN && (
                <p className={`mt-1.5 text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>8자 이상</p>
              )}
            </div>

            <div>
              <label htmlFor="recovery-new-password-confirm" className={labelClass}>새 비밀번호 확인</label>
              <div className="relative">
                <input
                  id="recovery-new-password-confirm"
                  name="new-password-confirm"
                  type={showPasswordConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={MEMBER_PASSWORD_MIN_LEN}
                  value={passwordConfirm}
                  onChange={(event) => {
                    setPasswordConfirm(event.target.value);
                    setErrorMsg('');
                  }}
                  className={fieldClass}
                />
                <PasswordVisibilityToggle
                  visible={showPasswordConfirm}
                  onToggle={() => setShowPasswordConfirm((value) => !value)}
                  dark={isDark}
                />
              </div>
              {mismatch && (
                <p className="mt-1.5 text-[12px] font-medium text-error" role="alert">
                  비밀번호가 일치하지 않습니다.
                </p>
              )}
            </div>

            {errorMsg ? (
              <p className="text-[13px] font-medium text-error" role="alert">{errorMsg}</p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={submitting}
              disabled={!canSubmit}
            >
              {submitting ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
