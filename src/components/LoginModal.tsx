import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2, X, Check, ChevronLeft } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import PolicyModal from './PolicyModal';
import { policies } from '../constants/policies';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { useShellOverlay } from '../context/ShellOverlayContext';
import {
  memberAuthEmail,
  memberUsernameSignupError,
  normalizeMemberUsername,
} from '../lib/memberUsername';
import { isUsableMemberProfile, PROFILE_COLUMNS } from '../lib/authIntegrity';
import { memberPasswordError } from '../lib/passwordPolicy';
import { normalizeKrMobilePhone } from '../lib/phoneNormalize';
import PasswordVisibilityToggle from './auth/PasswordVisibilityToggle';
import {
  mapOtpSendError,
  mapOtpVerifyError,
  mapPasswordResetError,
  mapRecoveryResolveError,
  mapSignupCompleteError,
  postCustomerAuth,
  readProofToken,
  readRecoverySessionToken,
} from './auth/customerAuthRequests';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  redirectUrl?: string;
}

type AuthView = 'login' | 'signup' | 'recovery' | 'reset';

const EMPTY_AUTH_FORM = {
  username: '',
  password: '',
  passwordConfirm: '',
  full_name: '',
  phone_number: '',
};

const OTP_RESEND_SECONDS = 60;
const USERNAME_CHECK_MS = 550;

const CheckboxRow = ({
  label,
  required,
  checked,
  onChange,
  onView,
  theme,
}: {
  label: string;
  required?: boolean;
  checked: boolean;
  onChange: () => void;
  onView?: () => void;
  theme?: string;
}) => (
  <div className="flex items-center gap-3 py-1">
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={required ? `${label} (필수)` : label}
      onClick={onChange}
      className={cn(
        'w-5 h-5 rounded-md flex items-center justify-center transition-colors flex-shrink-0 focus-ring border',
        checked
          ? (theme === 'dark' ? 'border-transparent bg-zinc-300' : 'border-transparent bg-zinc-800')
          : (theme === 'dark' ? 'bg-zinc-800 border-white/10' : 'bg-zinc-100 border-black/10'),
      )}
    >
      {checked && <Check size={12} className={theme === 'dark' ? 'text-zinc-900' : 'text-white'} strokeWidth={3} />}
    </button>
    <button
      type="button"
      onClick={onChange}
      className="flex-1 text-left flex items-center gap-1.5 min-w-0 focus-ring rounded-md"
    >
      {required && <span className="text-zinc-500 text-[13px] font-medium shrink-0">[필수]</span>}
      <span className={`text-[13px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{label}</span>
    </button>
    {onView && (
      <button
        type="button"
        onClick={onView}
        className={`text-[12px] underline underline-offset-4 ml-auto px-2 py-1 font-medium focus-ring rounded-md ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
      >
        보기
      </button>
    )}
  </div>
);

function dialogLabel(view: AuthView): string {
  if (view === 'signup') return '회원가입';
  if (view === 'recovery') return '계정 찾기';
  if (view === 'reset') return '비밀번호 재설정';
  return '로그인';
}

export default function LoginModal({ isOpen, onClose, onSuccess, redirectUrl = '/' }: LoginModalProps) {
  const { user, profile, refreshSession, signOut } = useAuth();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const { registerLoginOverlay } = useShellOverlay();
  const [view, setView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState(EMPTY_AUTH_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fieldFocus, setFieldFocus] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const leaveTimerRef = useRef<number | null>(null);

  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    cookie: false,
  });
  const [policyModalState, setPolicyModalState] = useState<{ isOpen: boolean; key: keyof typeof policies | null }>({
    isOpen: false,
    key: null,
  });

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [signupProof, setSignupProof] = useState<string | null>(null);
  const [recoveryProof, setRecoveryProof] = useState<string | null>(null);
  const [recoverySession, setRecoverySession] = useState<string | null>(null);
  const [recoverableUsername, setRecoverableUsername] = useState<string | null>(null);
  const [passwordResetAllowed, setPasswordResetAllowed] = useState(false);
  const [recoveryResolved, setRecoveryResolved] = useState(false);

  const allChecked = agreements.terms && agreements.privacy && agreements.cookie;
  const isDark = theme === 'dark';

  const setPanelVars = useCallback((xPct: number, yPct: number, live: number, tiltX: number, tiltY: number) => {
    const el = panelRef.current;
    if (!el) return;
    const nx = xPct / 100;
    const ny = yPct / 100;
    el.style.setProperty('--lx', `${xPct}%`);
    el.style.setProperty('--ly', `${yPct}%`);
    el.style.setProperty('--live', String(live));
    el.style.setProperty('--tx', String(tiltX));
    el.style.setProperty('--ty', String(tiltY));
    el.style.setProperty('--rot', `${26 + (nx - 0.5) * 8 + (ny - 0.5) * 4}deg`);
  }, []);

  const resetPanelLight = useCallback((live = 0) => {
    setPanelVars(52, 22, live, 0, 0);
  }, [setPanelVars]);

  const wakeSurface = useCallback(() => {
    if (!reduceMotion) setPanelVars(48, 28, 0.32, 0, 0);
  }, [reduceMotion, setPanelVars]);

  const handleSelectAll = () => {
    const newValue = !allChecked;
    setAgreements({
      terms: newValue,
      privacy: newValue,
      cookie: newValue,
    });
  };

  const toggleAgreement = (key: keyof typeof agreements) => {
    setAgreements(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const clearAlerts = () => setErrorMsg('');

  const resetTransientAuth = () => {
    setOtpCode('');
    setOtpSent(false);
    setOtpVerified(false);
    setOtpSending(false);
    setOtpVerifying(false);
    setResendIn(0);
    setSignupProof(null);
    setRecoveryProof(null);
    setRecoverySession(null);
    setRecoverableUsername(null);
    setPasswordResetAllowed(false);
    setRecoveryResolved(false);
    setResetPassword('');
    setResetPasswordConfirm('');
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
    setUsernameAvailable(null);
    setUsernameChecking(false);
    clearAlerts();
  };

  const resetAuthSurface = () => {
    setView('login');
    setIsLoading(false);
    setFormData(EMPTY_AUTH_FORM);
    setAgreements({ terms: false, privacy: false, cookie: false });
    setPolicyModalState({ isOpen: false, key: null });
    resetTransientAuth();
  };

  const goView = (next: AuthView) => {
    if (next === 'login' && view === 'signup') {
      setFormData(EMPTY_AUTH_FORM);
      setAgreements({ terms: false, privacy: false, cookie: false });
      setPolicyModalState({ isOpen: false, key: null });
      setIsLoading(false);
    } else if (next === 'login' && (view === 'recovery' || view === 'reset')) {
      setFormData((prev) => ({ ...prev, phone_number: '' }));
    }
    setView(next);
    resetTransientAuth();
    wakeSurface();
  };

  const goBack = () => {
    if (view === 'reset') {
      setView('recovery');
      setResetPassword('');
      setResetPasswordConfirm('');
      setShowResetPassword(false);
      setShowResetPasswordConfirm(false);
      clearAlerts();
      wakeSurface();
      return;
    }
    goView('login');
  };

  useLayoutEffect(() => {
    if (isOpen) {
      registerLoginOverlay('login', true);
    }
  }, [isOpen, registerLoginOverlay]);

  const handleLoginOverlayExit = () => {
    registerLoginOverlay('login', false);
  };

  useEffect(() => {
    if (user && profile && isOpen) {
      onClose();
    }
  }, [user, profile, isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      resetAuthSurface();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (policyModalState.isOpen) return;
      if (view !== 'login') {
        goBack();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, view, policyModalState.isOpen, onClose]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetPanelLight(reduceMotion ? 0.08 : 0.16);
    if (reduceMotion) return undefined;
    const settle = window.setTimeout(() => resetPanelLight(0), 800);
    return () => window.clearTimeout(settle);
  }, [isOpen, reduceMotion, resetPanelLight]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = window.setInterval(() => {
      setResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  useEffect(() => {
    if (view !== 'signup') return undefined;
    const signupError = memberUsernameSignupError(formData.username);
    if (signupError) {
      setUsernameAvailable(null);
      setUsernameChecking(false);
      return undefined;
    }
    setUsernameChecking(false);
    setUsernameAvailable(null);
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setUsernameChecking(true);
      const result = await postCustomerAuth('/api/auth/signup/username-check', {
        username: normalizeMemberUsername(formData.username),
      });
      if (cancelled) return;
      setUsernameChecking(false);
      if (result.status !== 200) {
        setUsernameAvailable(null);
        return;
      }
      setUsernameAvailable(result.json.available === true);
    }, USERNAME_CHECK_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [formData.username, view]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const tiltY = (nx - 0.5) * 0.45;
    const tiltX = (0.5 - ny) * 0.45;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setPanelVars(nx * 100, ny * 100, fieldFocus ? 0.48 : 0.36, tiltX, tiltY);
    });
  };

  const handlePointerLeave = () => {
    if (reduceMotion) return;
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      if (!fieldFocus) resetPanelLight(0);
    }, 160);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    if (event.pointerType === 'touch') handlePointerMove(event);
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  const finishAuthenticated = async (userId: string) => {
    await refreshSession();
    const { data: profileRow, error: memberProfileError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (memberProfileError || !isUsableMemberProfile(profileRow)) {
      await signOut({ redirect: false, toast: false });
      throw new Error('계정 정보를 불러올 수 없습니다. 관리자에게 문의해주세요.');
    }

    if (onSuccess) onSuccess();
    else onClose();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const username = normalizeMemberUsername(formData.username);
    if (username.length < 4 || !formData.password) {
      setErrorMsg('아이디 또는 비밀번호를 확인해주세요.');
      return;
    }

    setIsLoading(true);
    clearAlerts();
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: memberAuthEmail(username),
        password: formData.password,
      });

      if (signInError || !signInData.session?.user) {
        throw new Error('아이디 또는 비밀번호를 확인해주세요.');
      }

      await finishAuthenticated(signInData.session.user.id);
      resetAuthSurface();
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : '아이디 또는 비밀번호를 확인해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const sendOtp = async (purpose: 'signup' | 'recovery') => {
    const phone = formData.phone_number;
    if (!normalizeKrMobilePhone(phone).ok) {
      setErrorMsg('휴대폰 번호를 확인해주세요.');
      return;
    }
    setOtpSending(true);
    clearAlerts();
    setOtpVerified(false);
    setSignupProof(null);
    setRecoveryProof(null);
    const result = await postCustomerAuth('/api/auth/otp/send', { purpose, phone });
    setOtpSending(false);
    if (result.status !== 200 || result.json.ok !== true) {
      setErrorMsg(mapOtpSendError(result.status));
      return;
    }
    setOtpSent(true);
    setOtpCode('');
    setResendIn(OTP_RESEND_SECONDS);
  };

  const verifyOtp = async (purpose: 'signup' | 'recovery') => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setErrorMsg('인증번호를 확인해주세요.');
      return;
    }
    setOtpVerifying(true);
    clearAlerts();
    const result = await postCustomerAuth('/api/auth/otp/verify', {
      purpose,
      phone: formData.phone_number,
      code: otpCode.trim(),
    });
    setOtpVerifying(false);
    const token = readProofToken(result.json);
    if (result.status !== 200 || result.json.ok !== true || !token) {
      setErrorMsg(mapOtpVerifyError(result.status, result.json));
      return;
    }
    setOtpVerified(true);
    if (purpose === 'signup') {
      setSignupProof(token);
      return;
    }
    setRecoveryProof(token);
    const resolved = await postCustomerAuth('/api/auth/recovery/resolve', { proof_token: token });
    if (resolved.status !== 200 || resolved.json.ok !== true) {
      setErrorMsg(mapRecoveryResolveError(resolved.status));
      return;
    }
    const session = readRecoverySessionToken(resolved.json);
    setRecoverySession(session);
    setRecoveryResolved(true);
    const kind = resolved.json.account_kind;
    const allowed = resolved.json.password_reset_allowed === true;
    const username = typeof resolved.json.recoverable_username === 'string'
      ? resolved.json.recoverable_username
      : null;
    if (kind === 'password' && allowed && username) {
      setPasswordResetAllowed(true);
      setRecoverableUsername(username);
    } else {
      setPasswordResetAllowed(false);
      setRecoverableUsername(null);
    }
  };

  const handleSignupComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const usernameError = memberUsernameSignupError(formData.username);
    if (usernameError) {
      setErrorMsg(usernameError);
      return;
    }
    const passwordError = memberPasswordError(formData.password);
    if (passwordError) {
      setErrorMsg(passwordError);
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      setErrorMsg('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!formData.full_name.trim()) {
      setErrorMsg('필수 정보가 누락되었습니다.');
      return;
    }
    if (usernameAvailable === false) {
      setErrorMsg('사용할 수 없는 아이디입니다.');
      return;
    }
    if (!signupProof) {
      setErrorMsg('휴대폰 인증을 완료해 주세요.');
      return;
    }
    if (!allChecked) {
      setErrorMsg('필수 약관에 동의해 주세요.');
      return;
    }

    setIsLoading(true);
    clearAlerts();
    try {
      const complete = await postCustomerAuth('/api/auth/signup/complete', {
        proof_token: signupProof,
        username: normalizeMemberUsername(formData.username),
        password: formData.password,
        full_name: formData.full_name.trim(),
        consents: {
          terms: agreements.terms,
          privacy: agreements.privacy,
          cookie: agreements.cookie,
        },
      });
      if (complete.status !== 200 || complete.json.ok !== true) {
        setErrorMsg(mapSignupCompleteError(complete.status, complete.json));
        return;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: memberAuthEmail(normalizeMemberUsername(formData.username)),
        password: formData.password,
      });
      if (signInError || !signInData.session?.user) {
        throw new Error('가입은 완료되었습니다. 로그인해 주세요.');
      }
      showToast('가입되었습니다.', 'success');
      await finishAuthenticated(signInData.session.user.id);
      resetAuthSurface();
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : '요청을 처리할 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !recoverySession) return;
    const passwordError = memberPasswordError(resetPassword);
    if (passwordError) {
      setErrorMsg(passwordError);
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setErrorMsg('비밀번호가 일치하지 않습니다.');
      return;
    }
    setIsLoading(true);
    clearAlerts();
    const result = await postCustomerAuth('/api/auth/password-reset', {
      recovery_session_token: recoverySession,
      new_password: resetPassword,
    });
    setIsLoading(false);
    if (result.status !== 200 || result.json.ok !== true) {
      setErrorMsg(mapPasswordResetError(result.status, result.json));
      return;
    }
    showToast('비밀번호가 변경되었습니다.', 'success');
    goView('login');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errorMsg) clearAlerts();
    if (name === 'phone_number') {
      setOtpSent(false);
      setOtpVerified(false);
      setSignupProof(null);
    }
  };

  const isLoginValid = Boolean(formData.username && formData.password);
  const signupPasswordsMatch = formData.password === formData.passwordConfirm;
  const signupReady = Boolean(signupProof) && allChecked && signupPasswordsMatch && formData.passwordConfirm.length >= 8;
  const resetPasswordsMatch = resetPassword === resetPasswordConfirm;
  const resetReady = Boolean(recoverySession) && resetPassword.length >= 8 && resetPasswordsMatch;
  const fieldClass = cn(
    'ml-auth-field w-full rounded-[14px] px-5 py-3.5 text-base tracking-tight focus:outline-none',
    isDark ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400',
  );
  const labelClass = `block text-[13px] font-medium mb-2 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`;
  const ctaClass = (ready: boolean) =>
    cn(
      'ml-auth-cta w-full font-semibold py-4 rounded-[14px] flex items-center justify-center gap-2 text-base tracking-tight focus-ring',
      ready ? 'ml-auth-cta--ready' : 'ml-auth-cta--idle cursor-not-allowed',
    );

  const sideBtn = 'ml-auth-side focus-ring';
  const revealMotion = reduceMotion
    ? { duration: 0 }
    : {
      height: { type: 'tween' as const, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      opacity: { type: 'tween' as const, duration: 0.22, ease: [0.22, 1, 0.36, 1] },
    };
  const statusQuiet = isDark ? 'text-zinc-500' : 'text-zinc-400';
  const statusError = isDark ? 'text-red-400' : 'text-red-500';

  return (
    <>
    <style>{`
      .ml-auth-env--light {
        background:
          radial-gradient(ellipse 55% 40% at 6% 92%, rgba(120, 70, 150, 0.05), transparent 62%),
          radial-gradient(ellipse 50% 38% at 96% 8%, rgba(70, 130, 150, 0.045), transparent 58%),
          #ebe7ee;
      }
      .ml-auth-env--dark {
        background:
          radial-gradient(ellipse 52% 42% at 4% 96%, rgba(88, 46, 92, 0.055), transparent 64%),
          radial-gradient(ellipse 48% 38% at 98% 6%, rgba(28, 72, 88, 0.05), transparent 60%),
          #07080a;
      }
      .ml-auth-panel {
        --lx: 42%;
        --ly: 18%;
        --live: 0;
        --tx: 0;
        --ty: 0;
        --rot: 28deg;
        transform: perspective(1800px) rotateX(calc(var(--tx) * 1deg)) rotateY(calc(var(--ty) * 1deg));
        transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
        isolation: isolate;
      }
      .ml-auth-env--dark .ml-auth-panel {
        background:
          linear-gradient(180deg, #24252c 0%, #1c1d23 48%, #17181d 100%);
        box-shadow:
          inset 0 1px 0 rgba(232, 236, 242, 0.10),
          inset 0 -1px 0 rgba(0,0,0,0.38),
          0 1px 0 rgba(210, 216, 224, 0.05),
          0 32px 56px rgba(0,0,0,0.50);
      }
      .ml-auth-env--light .ml-auth-panel {
        background:
          linear-gradient(180deg, #f8f6f9 0%, #efeaf2 52%, #e6e1ea 100%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.82),
          inset 0 -1px 0 rgba(40,30,50,0.06),
          0 24px 56px rgba(40, 28, 48, 0.10);
      }
      .ml-auth-panel::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(165deg, rgba(214, 220, 228, 0.28), rgba(255,255,255,0.05) 34%, rgba(0,0,0,0.55));
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask-composite: exclude;
        opacity: 0.72;
        pointer-events: none;
        z-index: 4;
      }
      .ml-auth-env--light .ml-auth-panel::before {
        background: linear-gradient(165deg, rgba(255,255,255,0.9), rgba(180,170,190,0.18) 48%, rgba(40,30,50,0.12));
        opacity: 0.7;
      }
      .ml-auth-panel::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: radial-gradient(
          26% 20% at var(--lx) var(--ly),
          rgba(196, 82, 196, 0.42),
          rgba(124, 58, 180, 0.16) 42%,
          rgba(40, 150, 168, 0.12) 62%,
          transparent 78%
        );
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask-composite: exclude;
        opacity: calc(var(--live) * 0.55);
        pointer-events: none;
        z-index: 5;
      }
      .ml-auth-grain {
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        opacity: 0.045;
        mix-blend-mode: overlay;
        pointer-events: none;
      }
      .ml-auth-env--light .ml-auth-grain { opacity: 0.03; }
      .ml-auth-spec {
        overflow: hidden;
        pointer-events: none;
        opacity: calc(0.18 + (var(--live) * 0.40));
      }
      .ml-auth-spec::before {
        content: '';
        position: absolute;
        width: 34%;
        height: 240%;
        left: var(--lx);
        top: var(--ly);
        transform: translate(-50%, -50%) rotate(var(--rot));
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(186, 196, 208, 0.0) 32%,
          rgba(214, 222, 230, 0.24) 50%,
          rgba(168, 188, 198, 0.05) 62%,
          transparent 78%
        );
        filter: blur(16px);
        pointer-events: none;
      }
      .ml-auth-env--light .ml-auth-spec::before {
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255,255,255,0.0) 34%,
          rgba(255,255,255,0.34) 50%,
          rgba(210, 190, 220, 0.06) 62%,
          transparent 78%
        );
      }
      .ml-auth-field {
        border: 1px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, #191a1f 0%, #1d1e24 100%);
        box-shadow:
          inset 0 1px 2px rgba(0,0,0,0.28),
          inset 0 0 0 1px rgba(255,255,255,0.03);
      }
      .ml-auth-env--light .ml-auth-field {
        border: 1px solid rgba(40, 30, 50, 0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.62), rgba(236, 232, 240, 0.9));
        box-shadow: inset 0 1px 1px rgba(40, 30, 50, 0.06);
      }
      .ml-auth-field:focus-visible {
        border-color: rgba(214, 220, 228, 0.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 0 0 1px rgba(214, 220, 228, 0.18);
      }
      .ml-auth-env--light .ml-auth-field:focus-visible {
        border-color: rgba(70, 60, 80, 0.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.7),
          0 0 0 1px rgba(70, 60, 80, 0.16);
      }
      .ml-auth-cta {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.06);
      }
      .ml-auth-cta--idle {
        color: rgba(232, 234, 238, 0.50);
        background: linear-gradient(180deg, #2c2d34 0%, #22232a 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
      }
      .ml-auth-cta--ready {
        color: #f4f5f7;
        background: linear-gradient(180deg, #3a3c45 0%, #27282f 100%);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.14),
          0 1px 0 rgba(0,0,0,0.28);
      }
      .ml-auth-cta--ready:hover,
      .ml-auth-cta--ready:focus-visible {
        background: linear-gradient(180deg, #42444e 0%, #2b2c34 100%);
      }
      .ml-auth-cta--ready:active { transform: translateY(1px); }
      .ml-auth-env--light .ml-auth-cta {
        border-color: rgba(40, 30, 50, 0.08);
      }
      .ml-auth-env--light .ml-auth-cta--idle {
        color: rgba(40, 32, 48, 0.38);
        background: linear-gradient(180deg, #ece8ef 0%, #ddd8e2 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
      }
      .ml-auth-env--light .ml-auth-cta--ready {
        color: #f7f6f8;
        background: linear-gradient(180deg, #3a3344 0%, #2a2432 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.14);
      }
      .ml-auth-env--light .ml-auth-cta--ready:hover,
      .ml-auth-env--light .ml-auth-cta--ready:focus-visible {
        background: linear-gradient(180deg, #443c50 0%, #2f2838 100%);
      }
      .ml-auth-side {
        height: 3.25rem;
        padding: 0 1rem;
        border-radius: 14px;
        font-size: 0.8125rem;
        font-weight: 500;
        flex-shrink: 0;
        border: 1px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, #2c2d34 0%, #22232a 100%);
        color: rgba(244, 245, 247, 0.82);
      }
      .ml-auth-side:disabled { color: rgba(244, 245, 247, 0.42); }
      .ml-auth-env--light .ml-auth-side {
        border-color: rgba(40, 30, 50, 0.08);
        background: linear-gradient(180deg, #ece8ef 0%, #ddd8e2 100%);
        color: rgba(40, 32, 48, 0.72);
      }
      .ml-auth-status {
        margin-top: 0.375rem;
        font-size: 0.75rem;
        line-height: 1.3;
      }
      @media (prefers-reduced-motion: reduce) {
        .ml-auth-panel { transform: none !important; transition: none !important; }
        .ml-auth-spec::before {
          left: 42% !important;
          top: 18% !important;
          transform: translate(-50%, -50%) rotate(28deg) !important;
          filter: blur(18px);
        }
        .ml-auth-spec { opacity: 0.2; }
        .ml-auth-panel::after { opacity: 0 !important; }
        .ml-auth-cta--ready:active { transform: none; }
      }
    `}</style>
    <AnimatePresence onExitComplete={handleLoginOverlayExit}>
      {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel(view)}
            className={cn(
              'fixed inset-0 flex items-center justify-center p-4 sm:p-8 overflow-y-auto',
              zClass('dialog'),
              isDark ? 'ml-auth-env--dark' : 'ml-auth-env--light',
            )}
          >
            <motion.div
              ref={panelRef}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onPointerDown={handlePointerDown}
              className="ml-auth-panel relative my-auto w-full max-w-[34rem] rounded-[26px] overflow-hidden"
            >
              <div className="ml-auth-grain absolute inset-0 z-[1]" aria-hidden="true" />
              <div className="ml-auth-spec absolute inset-0 z-[2]" aria-hidden="true" />
              <div className="relative z-[3] flex flex-col px-6 pt-7 pb-8 sm:px-10 sm:pt-8 sm:pb-10">
                <div className="flex items-center justify-between gap-4 mb-11 sm:mb-12">
                  <div className="flex items-center gap-2 min-w-0">
                    {view !== 'login' && (
                      <button
                        type="button"
                        onClick={goBack}
                        aria-label={view === 'reset' ? '아이디 확인으로 돌아가기' : '로그인으로 돌아가기'}
                        className={cn(
                          'p-2 rounded-full focus-ring -ml-2',
                          isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black',
                        )}
                      >
                        <ChevronLeft size={20} />
                      </button>
                    )}
                    <img
                      src="/logo/metalora-wordmark.webp"
                      alt="METALORA"
                      width={384}
                      height={124}
                      className={`w-[6.75rem] sm:w-[7.75rem] object-contain ${isDark ? 'filter invert' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className={cn(
                      'shrink-0 p-2 rounded-full focus-ring transition-colors',
                      isDark
                        ? 'text-zinc-400 hover:text-white hover:bg-white/5'
                        : 'text-zinc-500 hover:text-black hover:bg-black/5',
                    )}
                    aria-label="닫기"
                  >
                    <X size={20} strokeWidth={2} />
                  </button>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {view === 'login' && (
                    <motion.form
                      key="login"
                      onSubmit={handleLogin}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-4"
                    >
                      <div>
                        <label htmlFor="auth-username" className={labelClass}>아이디</label>
                        <input
                          id="auth-username"
                          type="text"
                          name="username"
                          autoComplete="username"
                          required
                          value={formData.username}
                          onChange={handleInputChange}
                          onFocus={() => setFieldFocus(true)}
                          onBlur={() => setFieldFocus(false)}
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="auth-password" className={labelClass}>비밀번호</label>
                        <div className="relative">
                          <input
                            id="auth-password"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            autoComplete="current-password"
                            required
                            value={formData.password}
                            onChange={handleInputChange}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => setFieldFocus(false)}
                            className={cn(fieldClass, 'pr-12')}
                          />
                          <PasswordVisibilityToggle
                            visible={showPassword}
                            onToggle={() => setShowPassword((v) => !v)}
                            dark={isDark}
                          />
                        </div>
                      </div>
                      {errorMsg && (
                        <div role="alert" className="text-red-500 text-sm font-medium">{errorMsg}</div>
                      )}
                      <button type="submit" disabled={isLoading || !isLoginValid} className={ctaClass(!isLoading && isLoginValid)}>
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : null}
                        {isLoading ? '로그인 중...' : '로그인'}
                      </button>
                      <div className="flex flex-col items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => goView('recovery')}
                          className={`text-sm font-medium focus-ring rounded-md px-2 py-1 ${isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-800'}`}
                        >
                          아이디/비밀번호를 모르겠어요
                        </button>
                        <button
                          type="button"
                          onClick={() => goView('signup')}
                          className={`text-[13px] font-medium focus-ring rounded-md px-2 py-1 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-800'}`}
                        >
                          계정이 없으신가요? 회원가입
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {view === 'signup' && (
                    <motion.form
                      key="signup"
                      onSubmit={handleSignupComplete}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3.5"
                    >
                      <div>
                        <label htmlFor="signup-full-name" className={labelClass}>이름</label>
                        <input
                          id="signup-full-name"
                          type="text"
                          name="full_name"
                          autoComplete="name"
                          required
                          value={formData.full_name}
                          onChange={handleInputChange}
                          onFocus={() => setFieldFocus(true)}
                          onBlur={() => setFieldFocus(false)}
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="signup-username" className={labelClass}>아이디</label>
                        <input
                          id="signup-username"
                          type="text"
                          name="username"
                          autoComplete="username"
                          required
                          value={formData.username}
                          onChange={handleInputChange}
                          onFocus={() => setFieldFocus(true)}
                          onBlur={() => setFieldFocus(false)}
                          className={fieldClass}
                          aria-describedby={usernameChecking || usernameAvailable !== null ? 'signup-username-status' : undefined}
                        />
                        {(usernameChecking || usernameAvailable !== null) && (
                          <p id="signup-username-status" className={cn('ml-auth-status', usernameAvailable === false ? statusError : statusQuiet)} role="status">
                            {usernameChecking ? '확인 중' : usernameAvailable === false ? '사용할 수 없는 아이디입니다.' : '사용 가능'}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="signup-password" className={labelClass}>비밀번호</label>
                        <div className="relative">
                          <input
                            id="signup-password"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={formData.password}
                            onChange={handleInputChange}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => setFieldFocus(false)}
                            className={cn(fieldClass, 'pr-12')}
                          />
                          <PasswordVisibilityToggle
                            visible={showPassword}
                            onToggle={() => setShowPassword((v) => !v)}
                            dark={isDark}
                          />
                        </div>
                        <p className={`ml-auth-status ${statusQuiet}`}>8자 이상</p>
                      </div>
                      <div>
                        <label htmlFor="signup-password-confirm" className={labelClass}>비밀번호 확인</label>
                        <div className="relative">
                          <input
                            id="signup-password-confirm"
                            type={showPasswordConfirm ? 'text' : 'password'}
                            name="passwordConfirm"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={formData.passwordConfirm}
                            onChange={handleInputChange}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => setFieldFocus(false)}
                            className={cn(fieldClass, 'pr-12')}
                          />
                          <PasswordVisibilityToggle
                            visible={showPasswordConfirm}
                            onToggle={() => setShowPasswordConfirm((v) => !v)}
                            dark={isDark}
                          />
                        </div>
                        {formData.passwordConfirm.length > 0 && formData.password !== formData.passwordConfirm && (
                          <p className={cn('ml-auth-status', statusError)} role="alert">비밀번호가 일치하지 않습니다.</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="signup-phone" className={labelClass}>전화번호</label>
                        <div className="flex gap-2">
                          <input
                            id="signup-phone"
                            type="tel"
                            name="phone_number"
                            autoComplete="tel"
                            required
                            value={formData.phone_number}
                            onChange={handleInputChange}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => setFieldFocus(false)}
                            disabled={otpVerified}
                            className={cn(fieldClass, 'min-w-0')}
                          />
                          <button
                            type="button"
                            onClick={() => { void sendOtp('signup'); }}
                            disabled={otpSending || resendIn > 0 || otpVerified}
                            className={sideBtn}
                          >
                            {otpSending ? <Loader2 className="animate-spin mx-auto" size={16} /> : (otpVerified ? '확인됨' : (otpSent && resendIn > 0 ? `${resendIn}s` : '인증'))}
                          </button>
                        </div>
                      </div>
                      <AnimatePresence initial={false}>
                        {otpSent && !otpVerified && (
                          <motion.div
                            key="signup-otp"
                            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                            transition={revealMotion}
                            className="overflow-hidden"
                          >
                            <label htmlFor="signup-otp" className={labelClass}>인증번호</label>
                            <div className="flex gap-2">
                              <input
                                id="signup-otp"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={otpCode}
                                onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearAlerts(); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void verifyOtp('signup');
                                  }
                                }}
                                className={cn(fieldClass, 'min-w-0 tracking-[0.3em]')}
                              />
                              <button
                                type="button"
                                onClick={() => { void verifyOtp('signup'); }}
                                disabled={otpVerifying || otpVerified}
                                className={sideBtn}
                              >
                                {otpVerifying ? <Loader2 className="animate-spin mx-auto" size={16} /> : '확인'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <AnimatePresence initial={false}>
                        {otpVerified && (
                          <motion.div
                            key="signup-consent"
                            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                            transition={revealMotion}
                            className="overflow-hidden pt-0.5"
                          >
                            <CheckboxRow label="이용약관 동의" required checked={agreements.terms} onChange={() => toggleAgreement('terms')} onView={() => setPolicyModalState({ isOpen: true, key: 'terms' })} theme={theme} />
                            <CheckboxRow label="개인정보처리방침 동의" required checked={agreements.privacy} onChange={() => toggleAgreement('privacy')} onView={() => setPolicyModalState({ isOpen: true, key: 'privacy' })} theme={theme} />
                            <CheckboxRow label="쿠키 정책 동의" required checked={agreements.cookie} onChange={() => toggleAgreement('cookie')} onView={() => setPolicyModalState({ isOpen: true, key: 'cookie' })} theme={theme} />
                            <div className={`h-px my-2 ${isDark ? 'bg-white/5' : 'bg-black/5'}`} />
                            <CheckboxRow label="필수 항목 전체 동의" required checked={allChecked} onChange={handleSelectAll} theme={theme} />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {errorMsg && (
                        <div role="alert" className="text-red-400 text-sm font-medium">{errorMsg}</div>
                      )}
                      <button
                        type="submit"
                        disabled={isLoading || !signupReady}
                        className={ctaClass(!isLoading && signupReady)}
                      >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : null}
                        {isLoading ? '가입 중...' : '가입하기'}
                      </button>
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => goView('login')}
                          className={`text-[13px] font-medium focus-ring rounded-md px-2 py-1 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-800'}`}
                        >
                          이미 계정이 있으신가요? 로그인
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {view === 'recovery' && (
                    <motion.form
                      key="recovery"
                      onSubmit={(e) => { e.preventDefault(); void (otpSent ? verifyOtp('recovery') : sendOtp('recovery')); }}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3.5"
                    >
                      {!recoveryResolved && (
                        <>
                          <div>
                            <label htmlFor="recovery-phone" className={labelClass}>전화번호</label>
                            <div className="flex gap-2">
                              <input
                                id="recovery-phone"
                                type="tel"
                                name="phone_number"
                                autoComplete="tel"
                                value={formData.phone_number}
                                onChange={handleInputChange}
                                onFocus={() => setFieldFocus(true)}
                                onBlur={() => setFieldFocus(false)}
                                className={cn(fieldClass, 'min-w-0')}
                              />
                              <button
                                type="button"
                                onClick={() => { void sendOtp('recovery'); }}
                                disabled={otpSending || resendIn > 0}
                                className={sideBtn}
                              >
                                {otpSending ? <Loader2 className="animate-spin mx-auto" size={16} /> : (otpSent && resendIn > 0 ? `${resendIn}s` : '인증')}
                              </button>
                            </div>
                          </div>
                          <AnimatePresence initial={false}>
                            {otpSent && (
                              <motion.div
                                key="recovery-otp"
                                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                                transition={revealMotion}
                                className="overflow-hidden"
                              >
                                <label htmlFor="recovery-otp" className={labelClass}>인증번호</label>
                                <div className="flex gap-2">
                                  <input
                                    id="recovery-otp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={otpCode}
                                    onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearAlerts(); }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void verifyOtp('recovery');
                                      }
                                    }}
                                    className={cn(fieldClass, 'min-w-0 tracking-[0.3em]')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => { void verifyOtp('recovery'); }}
                                    disabled={otpVerifying}
                                    className={sideBtn}
                                  >
                                    {otpVerifying ? <Loader2 className="animate-spin mx-auto" size={16} /> : '확인'}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}

                      {recoveryResolved && passwordResetAllowed && recoverableUsername && (
                        <div className="space-y-5">
                          <div>
                            <p className={labelClass}>아이디</p>
                            <p className={`text-[17px] font-medium tracking-tight ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>{recoverableUsername}</p>
                          </div>
                          <button type="button" onClick={() => { setView('reset'); clearAlerts(); wakeSurface(); }} className={ctaClass(true)}>
                            비밀번호 재설정
                          </button>
                        </div>
                      )}

                      {recoveryResolved && !passwordResetAllowed && (
                        <div className="space-y-5">
                          <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>비밀번호로 찾을 수 없는 계정입니다.</p>
                          <button type="button" onClick={() => goView('login')} className={ctaClass(true)}>
                            로그인
                          </button>
                        </div>
                      )}

                      {errorMsg && (
                        <div role="alert" className="text-red-400 text-sm font-medium">{errorMsg}</div>
                      )}
                    </motion.form>
                  )}

                  {view === 'reset' && (
                    <motion.form
                      key="reset"
                      onSubmit={handlePasswordReset}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3.5"
                    >
                      <div>
                        <label htmlFor="reset-password" className={labelClass}>새 비밀번호</label>
                        <div className="relative">
                          <input
                            id="reset-password"
                            type={showResetPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            minLength={8}
                            value={resetPassword}
                            onChange={(e) => { setResetPassword(e.target.value); clearAlerts(); }}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => setFieldFocus(false)}
                            className={cn(fieldClass, 'pr-12')}
                          />
                          <PasswordVisibilityToggle
                            visible={showResetPassword}
                            onToggle={() => setShowResetPassword((v) => !v)}
                            dark={isDark}
                          />
                        </div>
                        <p className={`ml-auth-status ${statusQuiet}`}>8자 이상</p>
                      </div>
                      <div>
                        <label htmlFor="reset-password-confirm" className={labelClass}>새 비밀번호 확인</label>
                        <div className="relative">
                          <input
                            id="reset-password-confirm"
                            type={showResetPasswordConfirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            minLength={8}
                            value={resetPasswordConfirm}
                            onChange={(e) => { setResetPasswordConfirm(e.target.value); clearAlerts(); }}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => setFieldFocus(false)}
                            className={cn(fieldClass, 'pr-12')}
                          />
                          <PasswordVisibilityToggle
                            visible={showResetPasswordConfirm}
                            onToggle={() => setShowResetPasswordConfirm((v) => !v)}
                            dark={isDark}
                          />
                        </div>
                        {resetPasswordConfirm.length > 0 && resetPassword !== resetPasswordConfirm && (
                          <p className={cn('ml-auth-status', statusError)} role="alert">비밀번호가 일치하지 않습니다.</p>
                        )}
                      </div>
                      {errorMsg && (
                        <div role="alert" className="text-red-400 text-sm font-medium">{errorMsg}</div>
                      )}
                      <button
                        type="submit"
                        disabled={isLoading || !resetReady}
                        className={ctaClass(!isLoading && resetReady)}
                      >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : null}
                        {isLoading ? '변경 중...' : '비밀번호 변경'}
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
      )}
    </AnimatePresence>

    <PolicyModal
      isOpen={policyModalState.isOpen}
      onClose={() => setPolicyModalState({ isOpen: false, key: null })}
      title={policyModalState.key ? policies[policyModalState.key].title : ''}
      content={policyModalState.key ? policies[policyModalState.key].content : null}
    />
    </>
  );
}
