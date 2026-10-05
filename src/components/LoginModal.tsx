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
  isGeneratedSocialUsername,
  MEMBER_USERNAME_MIN_LEN,
  MEMBER_USERNAME_MAX_LEN,
} from '../lib/memberUsername';
import { isPendingC1SocialCustomer, isUsableMemberProfile, PROFILE_COLUMNS } from '../lib/authIntegrity';
import { memberPasswordError } from '../lib/passwordPolicy';
import { normalizeKrMobilePhone } from '../lib/phoneNormalize';
import PasswordVisibilityToggle from './auth/PasswordVisibilityToggle';
import SocialContinueRow, { AuthNotice, SocialDivider } from './auth/SocialContinueRow';
import {
  PHONE_ALREADY_REGISTERED_COPY,
  SOCIAL_OAUTH_FAIL,
  oauthCallbackUrl,
  readLinkedProviders,
  startBrowserSocialOAuth,
  type C1SocialProvider,
} from './auth/socialOAuth';
import {
  isPhoneAlreadyRegistered,
  isOtpExpiryCustomerCopy,
  mapOtpSendError,
  mapOtpVerifyError,
  mapPasswordResetError,
  mapRecoveryResolveError,
  mapSignupCompleteError,
  mapSocialCompleteError,
  postCustomerAuth,
  readProofToken,
  readRecoverySessionToken,
} from './auth/customerAuthRequests';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  redirectUrl?: string;
  /** When true, dim the page/drawer instead of replacing it. Drawer stays spatially behind. */
  layered?: boolean;
}

type AuthView = 'login' | 'signup' | 'recovery' | 'reset' | 'social';

const EMPTY_AUTH_FORM = {
  username: '',
  password: '',
  passwordConfirm: '',
  full_name: '',
  phone_number: '',
};

const OTP_RESEND_SECONDS = 60;
const USERNAME_CHECK_MS = 550;
const NAME_IDLE_MS = 480;
const PASSWORD_IDLE_MS = 400;
const SIGNUP_REVEAL_STEPS = ['name', 'username', 'password', 'phone'] as const;
const SIGNUP_CREATE_USERNAME_RE = /^[A-Za-z0-9]{4,32}$/;
type SignupRevealStep = (typeof SIGNUP_REVEAL_STEPS)[number];
type SignupEditStage = 'identity' | 'password' | null;

function signupRevealRank(step: SignupRevealStep): number {
  return SIGNUP_REVEAL_STEPS.indexOf(step);
}

function isSignupCreateUsernameCandidate(raw: string): boolean {
  return SIGNUP_CREATE_USERNAME_RE.test(normalizeMemberUsername(raw));
}

function signupCreateUsernameHasUnsupported(raw: string): boolean {
  const value = normalizeMemberUsername(raw);
  if (!value) return false;
  return /[^A-Za-z0-9]/.test(value);
}

function maskSignupPhoneSummary(raw: string): string {
  const normalized = normalizeKrMobilePhone(raw);
  const national = normalized.ok ? `0${normalized.e164.slice(3)}` : raw.replace(/\D/g, '');
  if (national.length >= 10 && national.startsWith('01')) {
    return `${national.slice(0, 3)}-${national.slice(3, 5)}**-****`;
  }
  return '인증 완료';
}

const COLLISION_PRIMARY = '이미 가입된 휴대폰 번호입니다.';
const COLLISION_SUPPORT = '새 계정으로 연결하지 않았습니다. 기존 계정으로 로그인해 주세요.';

function SignupStepReveal({
  show,
  reduceMotion,
  children,
}: {
  show: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={reduceMotion ? { opacity: 1, height: 'auto' } : { opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, height: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SignupSummaryRow({
  text,
  onEdit,
  isDark,
}: {
  text: string;
  onEdit: () => void;
  isDark: boolean;
}) {
  return (
    <div className="ml-auth-signup-summary">
      <p className={`min-w-0 truncate text-[13px] tracking-tight ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
        {text}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className={`shrink-0 text-[12px] font-medium focus-ring rounded-md px-1.5 py-1 ${
          isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'
        }`}
      >
        수정
      </button>
    </div>
  );
}

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
  <div className="flex items-center gap-2.5 py-1 min-h-[2.5rem]">
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
      <span className="text-[13px] font-medium text-text-primary">{label}</span>
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
  if (view === 'social') return '계정 설정';
  return '로그인';
}

export default function LoginModal({ isOpen, onClose, onSuccess, redirectUrl = '/', layered = false }: LoginModalProps) {
  const { user, profile, session, refreshSession, refreshProfile, signOut, isProfileResolved } = useAuth();
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
  const [usernameCheckError, setUsernameCheckError] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [signupProof, setSignupProof] = useState<string | null>(null);
  const [identityLinkProof, setIdentityLinkProof] = useState<string | null>(null);
  const [recoveryProof, setRecoveryProof] = useState<string | null>(null);
  const [recoverySession, setRecoverySession] = useState<string | null>(null);
  const [recoverableUsername, setRecoverableUsername] = useState<string | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<C1SocialProvider[]>([]);
  const [passwordResetAllowed, setPasswordResetAllowed] = useState(false);
  const [recoveryResolved, setRecoveryResolved] = useState(false);
  const [recoveryResetOpen, setRecoveryResetOpen] = useState(false);
  const [recoveryAccountKind, setRecoveryAccountKind] = useState<string | null>(null);
  const [oauthStarting, setOauthStarting] = useState<C1SocialProvider | null>(null);
  const [abandoningPending, setAbandoningPending] = useState(false);
  const [phoneCollisionNotice, setPhoneCollisionNotice] = useState(false);
  const [signupReveal, setSignupReveal] = useState<SignupRevealStep>('name');
  const [signupEdit, setSignupEdit] = useState<SignupEditStage>(null);
  const [nameComposing, setNameComposing] = useState(false);
  const signupFocusRef = useRef<string | null>(null);
  const usernameAdvanceRef = useRef(false);
  const usernameCheckSeqRef = useRef(0);

  const pendingSocial = isProfileResolved && isPendingC1SocialCustomer(user, profile);
  const sessionSettling = Boolean(user) && !isProfileResolved;
  const surfaceView: AuthView = pendingSocial ? 'social' : view;
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
    setIdentityLinkProof(null);
    setRecoveryProof(null);
    setRecoverySession(null);
    setRecoverableUsername(null);
    setLinkedProviders([]);
    setPasswordResetAllowed(false);
    setRecoveryResolved(false);
    setRecoveryResetOpen(false);
    setRecoveryAccountKind(null);
    setResetPassword('');
    setResetPasswordConfirm('');
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
    setUsernameAvailable(null);
    setUsernameChecking(false);
    setUsernameCheckError(false);
    setOauthStarting(null);
    setPhoneCollisionNotice(false);
    clearAlerts();
  };

  const resetAuthSurface = () => {
    setView('login');
    setIsLoading(false);
    setFormData(EMPTY_AUTH_FORM);
    setAgreements({ terms: false, privacy: false, cookie: false });
    setPolicyModalState({ isOpen: false, key: null });
    setSignupReveal('name');
    setSignupEdit(null);
    setNameComposing(false);
    usernameAdvanceRef.current = false;
    resetTransientAuth();
  };

  const goView = (next: AuthView) => {
    if (next === 'signup') {
      setSignupReveal('name');
      setSignupEdit(null);
      setNameComposing(false);
      usernameAdvanceRef.current = false;
      setFormData(EMPTY_AUTH_FORM);
      setAgreements({ terms: false, privacy: false, cookie: false });
      setPolicyModalState({ isOpen: false, key: null });
      setIsLoading(false);
    } else if (next === 'login' && view === 'signup') {
      setFormData(EMPTY_AUTH_FORM);
      setAgreements({ terms: false, privacy: false, cookie: false });
      setPolicyModalState({ isOpen: false, key: null });
      setIsLoading(false);
      setSignupReveal('name');
      setSignupEdit(null);
      setNameComposing(false);
      usernameAdvanceRef.current = false;
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
      setRecoveryResetOpen(false);
      clearAlerts();
      wakeSurface();
      return;
    }
    if (view === 'recovery') {
      const recoveredId = recoverableUsername && !isGeneratedSocialUsername(recoverableUsername)
        ? recoverableUsername
        : '';
      setView('login');
      resetTransientAuth();
      setFormData({ ...EMPTY_AUTH_FORM, username: recoveredId, password: '' });
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
    if (user && isUsableMemberProfile(profile) && isOpen) {
      onClose();
    }
  }, [user, profile, isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setView('login');
    } else {
      document.body.style.overflow = 'unset';
      resetAuthSurface();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
    // Drawer and Cart both open Login directly. Choice view is removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (policyModalState.isOpen) return;
      if (surfaceView === 'login' || surfaceView === "signup" || surfaceView === "recovery") return;
      if (surfaceView !== 'social') {
        goBack();
        return;
      }
      void abandonOrClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, surfaceView, policyModalState.isOpen, onClose, pendingSocial, abandoningPending]);

  useEffect(() => {
    if (otpVerified && isOtpExpiryCustomerCopy(errorMsg)) clearAlerts();
  }, [otpVerified, errorMsg]);

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

  useLayoutEffect(() => {
    const id = signupFocusRef.current;
    if (!id) return;
    signupFocusRef.current = null;
    document.getElementById(id)?.focus();
  }, [signupReveal, signupEdit, otpSent, otpVerified, recoveryResolved]);

  useEffect(() => {
    if (view !== 'signup') return undefined;
    if (signupRevealRank(signupReveal) >= signupRevealRank('username')) return undefined;
    if (nameComposing) return undefined;
    if (!formData.full_name.trim()) return undefined;
    const handle = window.setTimeout(() => {
      setSignupReveal((prev) => (signupRevealRank(prev) >= signupRevealRank('username') ? prev : 'username'));
    }, NAME_IDLE_MS);
    return () => window.clearTimeout(handle);
  }, [formData.full_name, view, signupReveal, nameComposing]);

  useEffect(() => {
    if (view !== 'signup' || signupRevealRank(signupReveal) < 1) return undefined;
    if (!isSignupCreateUsernameCandidate(formData.username)) {
      setUsernameAvailable(null);
      setUsernameChecking(false);
      setUsernameCheckError(false);
      return undefined;
    }
    const seq = ++usernameCheckSeqRef.current;
    const requested = normalizeMemberUsername(formData.username);
    setUsernameChecking(true);
    setUsernameAvailable(null);
    setUsernameCheckError(false);
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const result = await postCustomerAuth('/api/auth/signup/username-check', {
        username: requested,
      });
      if (cancelled || seq !== usernameCheckSeqRef.current) return;
      setUsernameChecking(false);
      if (result.status !== 200) {
        setUsernameAvailable(null);
        setUsernameCheckError(true);
        return;
      }
      setUsernameCheckError(false);
      setUsernameAvailable(result.json.available === true);
    }, USERNAME_CHECK_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [formData.username, view, signupReveal]);

  useEffect(() => {
    if (view !== 'signup') return;
    if (usernameChecking || usernameAvailable !== true) return;
    if (!formData.full_name.trim()) return;
    setSignupReveal((prev) => (signupRevealRank(prev) >= signupRevealRank('password') ? prev : 'password'));
    setSignupEdit((prev) => (prev === 'identity' ? null : prev));
    if (usernameAdvanceRef.current) {
      usernameAdvanceRef.current = false;
      signupFocusRef.current = 'signup-password';
    }
  }, [usernameAvailable, usernameChecking, view, formData.full_name]);

  useEffect(() => {
    if (view !== 'signup') return undefined;
    if (signupEdit === 'identity') return undefined;
    if (signupRevealRank(signupReveal) < signupRevealRank('password')) return undefined;
    if (memberPasswordError(formData.password) !== null) return undefined;
    if (formData.password !== formData.passwordConfirm || formData.passwordConfirm.length < 8) return undefined;
    const handle = window.setTimeout(() => {
      setSignupReveal((prev) => (signupRevealRank(prev) >= signupRevealRank('phone') ? prev : 'phone'));
      setSignupEdit((prev) => (prev === 'password' ? null : prev));
    }, PASSWORD_IDLE_MS);
    return () => window.clearTimeout(handle);
  }, [formData.password, formData.passwordConfirm, view, signupReveal, signupEdit]);

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

  const abandonOrClose = async () => {
    if (abandoningPending) return;
    if (!pendingSocial) {
      onClose();
      return;
    }
    setAbandoningPending(true);
    clearAlerts();
    try {
      await signOut({ redirect: false, toast: false });
      resetAuthSurface();
      onClose();
    } catch {
      setAbandoningPending(false);
      setErrorMsg('요청을 처리할 수 없습니다.');
    }
  };

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    void abandonOrClose();
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
    if (isLoading || oauthStarting || pendingSocial) return;
    const username = normalizeMemberUsername(formData.username);
    const loginUsesEmail = username.includes('@');
    if ((!loginUsesEmail && username.length < 4) || !formData.password) {
      setErrorMsg('아이디 또는 비밀번호를 확인해주세요.');
      return;
    }

    setIsLoading(true);
    clearAlerts();
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginUsesEmail ? username : memberAuthEmail(username),
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

  const sendOtp = async (purpose: 'signup' | 'recovery' | 'identity_link') => {
    const phone = formData.phone_number;
    if (!normalizeKrMobilePhone(phone).ok) {
      setErrorMsg('휴대폰 번호를 확인해주세요.');
      return;
    }
    const accessToken = purpose === 'identity_link' ? session?.access_token : undefined;
    if (purpose === 'identity_link' && !accessToken) {
      setErrorMsg('인증이 필요합니다.');
      return;
    }
    setOtpSending(true);
    clearAlerts();
    setOtpVerified(false);
    if (purpose === 'signup') setSignupProof(null);
    if (purpose === 'recovery') setRecoveryProof(null);
    if (purpose === 'identity_link') setIdentityLinkProof(null);
    const result = await postCustomerAuth(
      '/api/auth/otp/send',
      { purpose, phone },
      accessToken ? { accessToken } : undefined,
    );
    setOtpSending(false);
    if (result.status !== 200 || result.json.ok !== true) {
      setErrorMsg(mapOtpSendError(result.status));
      return;
    }
    setOtpSent(true);
    setOtpCode('');
    setResendIn(OTP_RESEND_SECONDS);
    if (purpose === 'signup') signupFocusRef.current = 'signup-otp';
    if (purpose === 'identity_link') signupFocusRef.current = 'social-otp';
    if (purpose === 'recovery') signupFocusRef.current = 'recovery-otp';
  };

  const verifyOtp = async (purpose: 'signup' | 'recovery' | 'identity_link') => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setErrorMsg('인증번호를 확인해주세요.');
      return;
    }
    const accessToken = purpose === 'identity_link' ? session?.access_token : undefined;
    if (purpose === 'identity_link' && !accessToken) {
      setErrorMsg('인증이 필요합니다.');
      return;
    }
    setOtpVerifying(true);
    clearAlerts();
    const result = await postCustomerAuth(
      '/api/auth/otp/verify',
      {
        purpose,
        phone: formData.phone_number,
        code: otpCode.trim(),
      },
      accessToken ? { accessToken } : undefined,
    );
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
    if (purpose === 'identity_link') {
      setIdentityLinkProof(token);
      return;
    }
    setRecoveryProof(token);
    const resolved = await postCustomerAuth('/api/auth/recovery/resolve', { proof_token: token });
    if (resolved.status !== 200 || resolved.json.ok !== true) {
      setOtpVerified(false);
      setRecoveryProof(null);
      setErrorMsg(mapRecoveryResolveError(resolved.status));
      return;
    }
    const sessionToken = readRecoverySessionToken(resolved.json);
    setRecoverySession(sessionToken);
    setRecoveryResolved(true);
    setLinkedProviders(readLinkedProviders(resolved.json.linked_providers));
    const kind = typeof resolved.json.account_kind === 'string' ? resolved.json.account_kind : null;
    setRecoveryAccountKind(kind);
    const allowed = resolved.json.password_reset_allowed === true;
    const username = typeof resolved.json.recoverable_username === 'string'
      ? resolved.json.recoverable_username
      : null;
    setPasswordResetAllowed(allowed);
    if (allowed && username && !isGeneratedSocialUsername(username)) {
      setRecoverableUsername(username);
    } else {
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
    if (usernameAvailable !== true) {
      setErrorMsg(usernameAvailable === false ? '이미 사용 중인 아이디입니다.' : '아이디를 확인해 주세요.');
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
    const recoveredId = recoverableUsername && !isGeneratedSocialUsername(recoverableUsername)
      ? recoverableUsername
      : '';
    setView('login');
    resetTransientAuth();
    setFormData({ ...EMPTY_AUTH_FORM, username: recoveredId, password: '' });
    wakeSurface();
  };

  const handleSocialContinue = async (provider: C1SocialProvider) => {
    if (oauthStarting || isLoading) return;
    setOauthStarting(provider);
    clearAlerts();
    const redirectTo = oauthCallbackUrl(window.location.origin, redirectUrl);
    const result = await startBrowserSocialOAuth(supabase, provider, redirectTo);
    if (result.ok === false) {
      setOauthStarting(null);
      setErrorMsg(SOCIAL_OAUTH_FAIL);
    }
  };

  const returnToLoginAfterCollision = async () => {
    setPhoneCollisionNotice(true);
    await signOut({ redirect: false, toast: false });
    resetAuthSurface();
    setPhoneCollisionNotice(true);
  };

  const handleSocialComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || oauthStarting) return;
    if (!identityLinkProof) {
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
    setIsLoading(true);
    clearAlerts();
    const complete = await postCustomerAuth(
      '/api/auth/social/complete',
      {
        proof_token: identityLinkProof,
        consents: {
          terms: agreements.terms,
          privacy: agreements.privacy,
          cookie: agreements.cookie,
        },
      },
      { accessToken },
    );
    if (isPhoneAlreadyRegistered(complete.status, complete.json)) {
      await returnToLoginAfterCollision();
      return;
    }
    if (complete.status !== 200 || complete.json.ok !== true) {
      setIsLoading(false);
      setErrorMsg(mapSocialCompleteError(complete.status, complete.json));
      return;
    }
    await refreshProfile();
    const userId = user?.id;
    if (!userId) {
      setIsLoading(false);
      setErrorMsg('요청을 처리할 수 없습니다.');
      return;
    }
    const { data: profileRow, error: memberProfileError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    setIsLoading(false);
    if (memberProfileError || !isUsableMemberProfile(profileRow)) {
      setErrorMsg('계정 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    resetAuthSurface();
    if (onSuccess) onSuccess();
    else onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errorMsg) clearAlerts();
    if (name === 'username') {
      usernameCheckSeqRef.current += 1;
      setUsernameAvailable(null);
      setUsernameCheckError(false);
    }
    if (name === 'phone_number') {
      setOtpSent(false);
      setOtpVerified(false);
      setSignupProof(null);
      setIdentityLinkProof(null);
      setRecoveryProof(null);
      setRecoverySession(null);
      setRecoverableUsername(null);
      setLinkedProviders([]);
      setPasswordResetAllowed(false);
      setRecoveryResolved(false);
      setRecoveryResetOpen(false);
      setRecoveryAccountKind(null);
    }
  };

  const isLoginValid = Boolean(formData.username && formData.password);
  const signupPasswordsMatch = formData.password === formData.passwordConfirm;
  const signupNameReady = formData.full_name.trim().length > 0;
  const signupUsernameFormatOk = isSignupCreateUsernameCandidate(formData.username);
  const signupUsernameReady = signupUsernameFormatOk && usernameAvailable === true && !usernameChecking;
  const signupPasswordReady = memberPasswordError(formData.password) === null;
  const signupConfirmReady = signupPasswordsMatch && formData.passwordConfirm.length >= 8;
  const signupReady = Boolean(signupProof)
    && allChecked
    && signupUsernameReady
    && signupNameReady
    && signupPasswordsMatch
    && formData.passwordConfirm.length >= 8;
  const showSignupUsername = signupRevealRank(signupReveal) >= signupRevealRank('username');
  const showSignupPassword = signupRevealRank(signupReveal) >= signupRevealRank('password');
  const showSignupPhone = signupRevealRank(signupReveal) >= signupRevealRank('phone');
  const identityCompressed = showSignupPassword && signupEdit !== 'identity' && signupNameReady && signupUsernameReady;
  const passwordCompressed = showSignupPhone && signupEdit !== 'password' && signupPasswordReady && signupConfirmReady;
  const phoneCompressed = Boolean(otpVerified);
  const showSignupSocialAlternatives = !showSignupUsername;
  const bumpSignupReveal = (next: SignupRevealStep) => {
    setSignupReveal((prev) => (signupRevealRank(next) > signupRevealRank(prev) ? next : prev));
  };
  const commitSignupName = (focusNext: boolean) => {
    if (!signupNameReady || nameComposing) return;
    bumpSignupReveal('username');
    if (focusNext) signupFocusRef.current = 'signup-username';
  };
  const commitSignupUsername = (focusNext: boolean) => {
    if (!signupUsernameFormatOk) return;
    if (!signupUsernameReady) {
      usernameAdvanceRef.current = focusNext;
      return;
    }
    bumpSignupReveal('password');
    setSignupEdit(null);
    if (focusNext) signupFocusRef.current = 'signup-password';
  };
  const commitSignupPasswordPair = (focusNext: boolean) => {
    if (!signupPasswordReady) {
      if (focusNext) signupFocusRef.current = 'signup-password-confirm';
      return;
    }
    if (!signupConfirmReady) {
      if (focusNext) signupFocusRef.current = 'signup-password-confirm';
      return;
    }
    bumpSignupReveal('phone');
    setSignupEdit(null);
    if (focusNext) signupFocusRef.current = 'signup-phone';
  };
  const editSignupIdentity = () => {
    usernameCheckSeqRef.current += 1;
    usernameAdvanceRef.current = false;
    setNameComposing(false);
    setUsernameAvailable(null);
    setUsernameChecking(false);
    setUsernameCheckError(false);
    setFormData((prev) => ({ ...prev, full_name: '', username: '' }));
    setSignupReveal('name');
    setSignupEdit(null);
    signupFocusRef.current = 'signup-full-name';
  };
  const editSignupPassword = () => {
    setFormData((prev) => ({ ...prev, password: '', passwordConfirm: '' }));
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setSignupReveal('password');
    setSignupEdit('password');
    signupFocusRef.current = 'signup-password';
  };
  const editSignupPhone = () => {
    setFormData((prev) => ({ ...prev, phone_number: '' }));
    setOtpCode('');
    setOtpSent(false);
    setOtpVerified(false);
    setOtpSending(false);
    setOtpVerifying(false);
    setSignupProof(null);
    setResendIn(0);
    setSignupReveal('phone');
    signupFocusRef.current = 'signup-phone';
  };
  const editSocialPhone = () => {
    setFormData((prev) => ({ ...prev, phone_number: '' }));
    setOtpCode('');
    setOtpSent(false);
    setOtpVerified(false);
    setOtpSending(false);
    setOtpVerifying(false);
    setIdentityLinkProof(null);
    setResendIn(0);
    signupFocusRef.current = 'social-phone';
  };
  const editRecoveryPhone = () => {
    setFormData((prev) => ({ ...prev, phone_number: '' }));
    setOtpCode('');
    setOtpSent(false);
    setOtpVerified(false);
    setOtpSending(false);
    setOtpVerifying(false);
    setRecoveryProof(null);
    setRecoverySession(null);
    setRecoverableUsername(null);
    setLinkedProviders([]);
    setPasswordResetAllowed(false);
    setRecoveryResolved(false);
    setRecoveryResetOpen(false);
    setRecoveryAccountKind(null);
    setResetPassword('');
    setResetPasswordConfirm('');
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
    setResendIn(0);
    signupFocusRef.current = 'recovery-phone';
  };
  const signupUsernameHelper = (() => {
    if (!showSignupUsername) return null;
    const username = normalizeMemberUsername(formData.username);
    if (!username) return null;
    if (signupCreateUsernameHasUnsupported(formData.username)) {
      return { text: '영문과 숫자만 입력해 주세요.', tone: 'alert' as const };
    }
    if (username.length > MEMBER_USERNAME_MAX_LEN) {
      return { text: '32자 이하로 입력해 주세요.', tone: 'quiet' as const };
    }
    if (username.length < MEMBER_USERNAME_MIN_LEN) {
      return { text: '영문/숫자 4자 이상', tone: 'quiet' as const };
    }
    if (usernameChecking) return { text: '확인 중...', tone: 'quiet' as const };
    if (usernameCheckError) return { text: '아이디를 확인할 수 없습니다.', tone: 'alert' as const };
    if (usernameAvailable === false) return { text: '이미 사용 중인 아이디입니다.', tone: 'alert' as const };
    if (usernameAvailable === true) return { text: '사용 가능', tone: 'quiet' as const };
    return null;
  })();
  const resetPasswordsMatch = resetPassword === resetPasswordConfirm;
  const resetReady = Boolean(recoverySession) && resetPassword.length >= 8 && resetPasswordsMatch;
  const recoveryLoginId = recoverableUsername && !isGeneratedSocialUsername(recoverableUsername)
    ? recoverableUsername
    : null;
  const recoveryPhoneCompressed = recoveryResolved;
  const socialReady = Boolean(identityLinkProof) && allChecked;
  const socialBusy = Boolean(oauthStarting) || isLoading;
  const dividerLine = isDark ? 'bg-white/6' : 'bg-black/8';
  const fieldClass = cn(
    'ml-auth-field w-full rounded-[14px] px-4 sm:px-5 py-3 text-[15px] sm:text-base tracking-tight focus:outline-none',
    isDark ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400',
  );
  const loginFieldClass = cn(
    'ml-auth-login-field w-full px-3.5 text-[15px] tracking-tight focus:outline-none',
    isDark ? 'text-[#f3f1ec]' : 'text-[#16150f]',
  );
  const labelClass = 'block text-[13px] font-medium mb-1.5 text-text-primary';
  const loginLabelClass = 'block text-[14px] font-medium tracking-tight mb-2 text-text-primary';
  const isSceneLogin = surfaceView === 'login' && !phoneCollisionNotice;
  const isSceneSignup = surfaceView === "signup";
  const isSceneRecovery = surfaceView === "recovery";
  const isSceneCollision = surfaceView === 'login' && phoneCollisionNotice;
  const isSceneShell = isSceneLogin || isSceneSignup || isSceneRecovery || isSceneCollision || pendingSocial;
  const authFormLocksDismiss = isSceneLogin || isSceneSignup || isSceneRecovery || isSceneCollision || pendingSocial;
  const settleHidesForms = sessionSettling && !isSceneLogin && !isSceneSignup && !pendingSocial && !isSceneRecovery && !isSceneCollision;
  const alertClass = 'ml-auth-alert';
  const ctaClass = (ready: boolean) =>
    cn(
      'ml-auth-cta w-full font-semibold py-4 rounded-[14px] flex items-center justify-center gap-2 text-base tracking-tight focus-ring',
      ready ? 'ml-auth-cta--ready' : 'ml-auth-cta--idle cursor-not-allowed',
    );

  const sideBtn = 'ml-auth-side focus-ring';
  const sideBtnConfirm = 'ml-auth-side ml-auth-side--confirm focus-ring';
  const revealMotion = reduceMotion
    ? { duration: 0 }
    : {
      height: { type: 'tween' as const, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      opacity: { type: 'tween' as const, duration: 0.22, ease: [0.22, 1, 0.36, 1] },
    };
  const statusQuiet = isDark ? 'text-zinc-500' : 'text-zinc-400';
  const visibleError = otpVerified && isOtpExpiryCustomerCopy(errorMsg) ? '' : errorMsg;
  const viewMotion = {
    initial: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  };

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
      .ml-auth-env--layered.ml-auth-env--dark {
        background: rgba(5, 6, 8, 0.28);
      }
      .ml-auth-env--layered.ml-auth-env--light {
        background: rgba(28, 22, 34, 0.14);
      }
      .ml-auth-login-signup {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 3rem;
        width: 100%;
        border-radius: 2px;
        letter-spacing: -0.02em;
        background: transparent;
      }
      .ml-auth-env--dark .ml-auth-login-signup {
        color: #f3f1ec;
        border: 1px solid rgba(243, 241, 236, 0.22);
      }
      .ml-auth-env--light .ml-auth-login-signup {
        color: #16150f;
        border: 1px solid rgba(22, 21, 15, 0.18);
      }
      .ml-auth-login-signup:hover,
      .ml-auth-login-signup:focus-visible {
        filter: brightness(1.06);
      }
      .ml-auth-login-signup:active { transform: translateY(1px); }
      @media (prefers-reduced-motion: reduce) {
        .ml-auth-login-signup:active { transform: none; }
      }
      .ml-auth-login-or span {
        font-size: 13px;
      }
      .ml-auth-signup-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        min-height: 2.25rem;
      }
      .ml-auth-login-field {
        height: 3rem;
        border-radius: 2px;
        background: transparent;
        box-shadow: none;
      }
      .ml-auth-env--dark .ml-auth-login-field {
        border: 1px solid rgba(243, 241, 236, 0.16);
      }
      .ml-auth-env--light .ml-auth-login-field {
        border: 1px solid rgba(22, 21, 15, 0.16);
      }
      .ml-auth-env--dark .ml-auth-login-field:focus-visible {
        border-color: rgba(243, 241, 236, 0.42);
        box-shadow: 0 0 0 1px rgba(243, 241, 236, 0.18);
      }
      .ml-auth-env--light .ml-auth-login-field:focus-visible {
        border-color: rgba(22, 21, 15, 0.42);
        box-shadow: 0 0 0 1px rgba(22, 21, 15, 0.14);
      }
      .ml-auth-login-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        height: 3rem;
        width: 100%;
        border: none;
        border-radius: 2px;
        letter-spacing: -0.02em;
        cursor: not-allowed;
      }
      .ml-auth-env--dark .ml-auth-login-cta {
        color: rgba(243, 241, 236, 0.34);
        background: #2a2b31;
      }
      .ml-auth-env--light .ml-auth-login-cta {
        color: rgba(22, 21, 15, 0.32);
        background: #e4dfd6;
      }
      .ml-auth-env--dark .ml-auth-login-cta--ready {
        color: #16150f;
        background: #f2f0ea;
        cursor: pointer;
      }
      .ml-auth-env--light .ml-auth-login-cta--ready {
        color: #f4f1eb;
        background: #1a1914;
        cursor: pointer;
      }
      .ml-auth-login-cta--ready:hover,
      .ml-auth-login-cta--ready:focus-visible {
        filter: brightness(1.06);
      }
      .ml-auth-login-cta--ready:active { transform: translateY(1px); }
      @media (prefers-reduced-motion: reduce) {
        .ml-auth-login-cta--ready:active { transform: none; }
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
      .ml-auth-env--dark .ml-auth-panel--login {
        background: #1e1f25;
        transform: none;
      }
      .ml-auth-env--light .ml-auth-panel--login {
        background: #f6f3ed;
        transform: none;
      }
      .ml-auth-env--dark .ml-auth-panel--login::before,
      .ml-auth-env--light .ml-auth-panel--login::before,
      .ml-auth-env--dark .ml-auth-panel--login::after,
      .ml-auth-env--light .ml-auth-panel--login::after {
        content: none;
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
        border: 1px solid rgba(40, 30, 50, 0.12);
        background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(238, 234, 241, 0.94));
        box-shadow: inset 0 1px 1px rgba(40, 30, 50, 0.05);
      }
      .ml-auth-field:focus-visible {
        border-color: rgba(196, 130, 196, 0.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 0 0 1px rgba(124, 90, 168, 0.16),
          0 0 22px rgba(40, 150, 168, 0.08);
      }
      .ml-auth-env--light .ml-auth-field:focus-visible {
        border-color: rgba(110, 70, 120, 0.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.7),
          0 0 0 1px rgba(90, 70, 110, 0.12),
          0 0 18px rgba(70, 130, 150, 0.08);
      }
      .ml-auth-field:disabled {
        opacity: 0.58;
        cursor: not-allowed;
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
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.16),
          0 0 0 1px rgba(150, 90, 170, 0.14),
          0 0 20px rgba(40, 150, 168, 0.08);
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
        height: 3.125rem;
        min-width: 4.75rem;
        padding: 0 0.9rem;
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
      .ml-auth-social {
        display: grid;
        grid-template-columns: 18px auto;
        align-items: center;
        justify-content: center;
        column-gap: 0.7rem;
        width: 100%;
        height: 3.125rem;
        border-radius: 14px;
        font-size: 0.9375rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        border: 1px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, #1f2026 0%, #23242b 100%);
        color: rgba(244, 245, 247, 0.88);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .ml-auth-social:hover:not(:disabled),
      .ml-auth-social:focus-visible {
        background: linear-gradient(180deg, #26272e 0%, #2a2b33 100%);
      }
      .ml-auth-social:disabled { opacity: 0.55; cursor: not-allowed; }
      .ml-auth-env--light .ml-auth-social {
        border-color: rgba(40, 30, 50, 0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.7), rgba(236, 232, 240, 0.94));
        color: rgba(36, 32, 42, 0.88);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
      }
      .ml-auth-env--light .ml-auth-social:hover:not(:disabled),
      .ml-auth-env--light .ml-auth-social:focus-visible {
        background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(232, 226, 236, 0.98));
      }
      .ml-auth-social-family {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.75rem;
      }
      .ml-auth-social--family {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 3.25rem;
        height: 3.25rem;
        min-width: 3.25rem;
        min-height: 3.25rem;
        padding: 0;
        border-radius: 2px;
        box-shadow: none;
        grid-template-columns: none;
      }
      .ml-auth-env--dark .ml-auth-social--family {
        color: #f3f1ec;
        background: transparent;
        border: 1px solid rgba(243, 241, 236, 0.18);
      }
      .ml-auth-env--light .ml-auth-social--family {
        color: #16150f;
        background: transparent;
        border: 1px solid rgba(22, 21, 15, 0.16);
      }
      .ml-auth-env--dark .ml-auth-social--family:hover:not(:disabled),
      .ml-auth-env--dark .ml-auth-social--family:focus-visible {
        background: rgba(243, 241, 236, 0.06);
      }
      .ml-auth-env--light .ml-auth-social--family:hover:not(:disabled),
      .ml-auth-env--light .ml-auth-social--family:focus-visible {
        background: rgba(22, 21, 15, 0.04);
      }
      .ml-auth-social--family .ml-auth-social-mark {
        width: auto;
        height: auto;
      }
      .ml-auth-social-slot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .ml-auth-social-slot svg {
        display: block;
        flex-shrink: 0;
      }
      .ml-auth-social-slot--google svg {
        width: 1.375rem;
        height: 1.375rem;
      }
      .ml-auth-social-slot--kakao svg,
      .ml-auth-social-slot--naver svg {
        width: 1.625rem;
        height: 1.625rem;
      }
      .ml-auth-social-mark {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .ml-auth-notice {
        border-radius: 14px;
        padding: 1rem 1.1rem;
        border: 1px solid rgba(255,255,255,0.07);
        background: linear-gradient(180deg, #1c1d23 0%, #202128 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .ml-auth-notice p {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        letter-spacing: -0.02em;
        color: rgba(232, 234, 238, 0.82);
      }
      .ml-auth-notice p + p {
        margin-top: 0.35rem;
        color: rgba(196, 200, 208, 0.62);
        font-size: 0.8125rem;
      }
      .ml-auth-notice .ml-auth-notice-id,
      .ml-auth-notice .ml-auth-notice-primary {
        margin-top: 0.4rem;
        font-size: 1.0625rem;
        font-weight: 500;
        letter-spacing: -0.03em;
        color: var(--color-text-primary);
      }
      .ml-auth-notice .ml-auth-notice-primary {
        margin-top: 0;
        font-size: 0.875rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        line-height: 1.5;
      }
      .ml-auth-env--light .ml-auth-notice {
        border-color: rgba(40, 30, 50, 0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.72), rgba(236, 232, 240, 0.94));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
      }
      .ml-auth-env--light .ml-auth-notice p { color: rgba(40, 32, 48, 0.82); }
      .ml-auth-env--light .ml-auth-notice p + p { color: rgba(40, 32, 48, 0.52); }
      .ml-auth-env--light .ml-auth-notice .ml-auth-notice-id,
      .ml-auth-env--light .ml-auth-notice .ml-auth-notice-primary {
        color: var(--color-text-primary);
      }
      .ml-auth-alert {
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1.45;
        color: #d7a3a8;
      }
      .ml-auth-env--light .ml-auth-alert { color: #9a4d56; }
      .ml-auth-consent {
        padding: 0.55rem 0.8rem 0.45rem;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.06);
        background: linear-gradient(180deg, rgba(28,29,35,0.55), rgba(24,25,30,0.72));
      }
      .ml-auth-env--light .ml-auth-consent {
        border-color: rgba(40, 30, 50, 0.08);
        background: linear-gradient(180deg, rgba(255,255,255,0.55), rgba(236, 232, 240, 0.78));
      }
      .ml-auth-side--done {
        color: rgba(244, 245, 247, 0.72);
      }
      .ml-auth-env--light .ml-auth-side--done {
        color: rgba(40, 32, 48, 0.55);
      }
      .ml-auth-side--confirm {
        background: linear-gradient(180deg, #3a3c45 0%, #27282f 100%);
        color: #f4f5f7;
      }
      .ml-auth-side--confirm:disabled {
        background: linear-gradient(180deg, #2c2d34 0%, #22232a 100%);
        color: rgba(244, 245, 247, 0.42);
      }
      .ml-auth-env--light .ml-auth-side--confirm {
        background: linear-gradient(180deg, #3a3344 0%, #2a2432 100%);
        color: #f7f6f8;
      }
      .ml-auth-env--light .ml-auth-side--confirm:disabled {
        background: linear-gradient(180deg, #ece8ef 0%, #ddd8e2 100%);
        color: rgba(40, 32, 48, 0.38);
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
            aria-label={isSceneCollision ? COLLISION_PRIMARY : dialogLabel(surfaceView)}
            className={cn(
              'fixed inset-0 overflow-y-auto',
              zClass('dialog'),
              isDark ? 'ml-auth-env--dark' : 'ml-auth-env--light',
              layered && 'ml-auth-env--layered',
            )}
            onClick={(event) => {
              if (authFormLocksDismiss) return;
              if (event.target === event.currentTarget && !abandoningPending) {
                void abandonOrClose();
              }
            }}
          >
            <div
              className="flex min-h-full items-center justify-center p-4 sm:p-8"
              onClick={(event) => {
                if (authFormLocksDismiss) return;
                if (event.target === event.currentTarget && !abandoningPending) {
                  void abandonOrClose();
                }
              }}
            >
            <motion.div
              ref={panelRef}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              onPointerMove={isSceneShell ? undefined : handlePointerMove}
              onPointerLeave={isSceneShell ? undefined : handlePointerLeave}
              onPointerDown={isSceneShell ? undefined : handlePointerDown}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                'ml-auth-panel relative w-full rounded-[24px] overflow-hidden',
                isSceneShell
                  ? 'ml-auth-panel--login max-w-[26.5rem] sm:max-w-[27rem]'
                  : layered ? 'max-w-[26.5rem]' : 'max-w-[32rem]',
              )}
            >
              <div className={cn('ml-auth-grain absolute inset-0 z-[1]', isSceneShell && 'hidden')} aria-hidden="true" />
              <div className={cn('ml-auth-spec absolute inset-0 z-[2]', isSceneShell && 'hidden')} aria-hidden="true" />
              <div
                className={cn(
                  'relative z-[3] flex flex-col px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-8',
                  isSceneShell && 'min-h-0',
                )}
              >
                {isSceneLogin || isSceneCollision || pendingSocial ? (
                  <div className="relative mb-6 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
                    <div aria-hidden="true" />
                    <img
                      src="/logo/metalora-wordmark.webp"
                      alt="METALORA"
                      width={384}
                      height={124}
                      className={`ml-auth-login-wordmark justify-self-center w-[6.25rem] sm:w-[7.25rem] object-contain ${isDark ? 'filter invert' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={abandoningPending}
                      aria-busy={abandoningPending}
                      className={cn(
                        'justify-self-end shrink-0 p-2 rounded-full focus-ring transition-colors disabled:opacity-40 disabled:pointer-events-none',
                        isDark
                          ? 'text-zinc-400 hover:text-white hover:bg-white/5'
                          : 'text-zinc-500 hover:text-black hover:bg-black/5',
                      )}
                      aria-label="닫기"
                    >
                      <X size={20} strokeWidth={2} />
                    </button>
                  </div>
                ) : isSceneSignup || isSceneRecovery ? (
                  <div className="relative mb-6 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
                    <div className="flex justify-start">
                      <button
                        type="button"
                        onClick={goBack}
                        aria-label="로그인으로 돌아가기"
                        className={cn(
                          'p-2 rounded-full focus-ring -ml-2',
                          isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black',
                        )}
                      >
                        <ChevronLeft size={20} />
                      </button>
                    </div>
                    <img
                      src="/logo/metalora-wordmark.webp"
                      alt="METALORA"
                      width={384}
                      height={124}
                      className={`ml-auth-login-wordmark justify-self-center w-[6.25rem] sm:w-[7.25rem] object-contain ${isDark ? 'filter invert' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={abandoningPending}
                      aria-busy={abandoningPending}
                      className={cn(
                        'justify-self-end shrink-0 p-2 rounded-full focus-ring transition-colors disabled:opacity-40 disabled:pointer-events-none',
                        isDark
                          ? 'text-zinc-400 hover:text-white hover:bg-white/5'
                          : 'text-zinc-500 hover:text-black hover:bg-black/5',
                      )}
                      aria-label="닫기"
                    >
                      <X size={20} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                <div
                  className="flex items-center justify-between gap-4 mb-7 sm:mb-8"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {surfaceView !== 'social' && surfaceView !== 'login' && (
                      <button
                        type="button"
                        onClick={goBack}
                        aria-label={
                          view === 'reset'
                            ? '아이디 확인으로 돌아가기'
                            : '로그인으로 돌아가기'
                        }
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
                      className={`w-[6.25rem] sm:w-[7.25rem] object-contain ${isDark ? 'filter invert' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={abandoningPending}
                    aria-busy={abandoningPending}
                    className={cn(
                      'shrink-0 p-2 rounded-full focus-ring transition-colors disabled:opacity-40 disabled:pointer-events-none',
                      isDark
                        ? 'text-zinc-400 hover:text-white hover:bg-white/5'
                        : 'text-zinc-500 hover:text-black hover:bg-black/5',
                    )}
                    aria-label="닫기"
                  >
                    <X size={20} strokeWidth={2} />
                  </button>
                </div>
                )}

                <AnimatePresence mode="wait" initial={false}>
                  {settleHidesForms && (
                    <motion.div
                      key="auth-settle"
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col items-center justify-center gap-3 py-10"
                      aria-busy="true"
                      aria-live="polite"
                    >
                      <Loader2 className={`animate-spin ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`} size={22} aria-hidden="true" />
                      <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-600'}`}>확인 중</p>
                    </motion.div>
                  )}

                  {!settleHidesForms && surfaceView === 'login' && phoneCollisionNotice && (
                    <motion.div
                      key="login-collision"
                      initial={viewMotion.initial}
                      animate={viewMotion.animate}
                      exit={viewMotion.exit}
                      transition={viewMotion.transition}
                      className="flex flex-col"
                    >
                      <div className="flex flex-col gap-3">
                        <p className="text-[15px] font-medium tracking-tight text-text-primary">
                          {COLLISION_PRIMARY}
                        </p>
                        <p className={`text-[13px] tracking-tight ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                          {COLLISION_SUPPORT}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="아이디로 로그인"
                        onClick={() => {
                          setFormData(EMPTY_AUTH_FORM);
                          setView('login');
                          resetTransientAuth();
                          wakeSurface();
                        }}
                        className="ml-auth-login-cta type-cta focus-ring mt-8 ml-auth-login-cta--ready"
                      >
                        로그인
                      </button>
                      <button
                        type="button"
                        onClick={() => goView('recovery')}
                        className="ml-auth-login-signup type-cta focus-ring mt-3"
                      >
                        아이디/비밀번호 찾기
                      </button>
                    </motion.div>
                  )}

                  {!settleHidesForms && surfaceView === 'login' && !phoneCollisionNotice && (
                    <motion.form
                      key="login"
                      onSubmit={handleLogin}
                      initial={viewMotion.initial}
                      animate={viewMotion.animate}
                      exit={viewMotion.exit}
                      transition={viewMotion.transition}
                      className="flex flex-col"
                    >
                      <div className="flex flex-col gap-5">
                        <div>
                          <label htmlFor="auth-username" className={loginLabelClass}>아이디</label>
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
                            className={loginFieldClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="auth-password" className={loginLabelClass}>비밀번호</label>
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
                              className={cn(loginFieldClass, 'pr-12')}
                            />
                            <PasswordVisibilityToggle
                              visible={showPassword}
                              onToggle={() => setShowPassword((v) => !v)}
                              dark={isDark}
                            />
                          </div>
                        </div>
                      </div>
                      {errorMsg && (
                        <div role="alert" className={`${alertClass} mt-4 whitespace-pre-line`}>{errorMsg}</div>
                      )}
                      <button
                        type="submit"
                        disabled={socialBusy || !isLoginValid}
                        className={cn(
                          'ml-auth-login-cta type-cta focus-ring mt-6',
                          !socialBusy && isLoginValid && 'ml-auth-login-cta--ready',
                        )}
                      >
                        {isLoading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : null}
                        {isLoading ? '로그인 중...' : '로그인'}
                      </button>
                      <button
                        type="button"
                        onClick={() => goView('signup')}
                        className="ml-auth-login-signup type-cta focus-ring mt-3"
                      >
                        회원가입
                      </button>
                      <div className="mt-6 ml-auth-login-or">
                        <SocialDivider quiet={dividerLine} compact />
                      </div>
                      <div className="mt-4">
                        <SocialContinueRow
                          density="family"
                          busyProvider={oauthStarting}
                          disabled={isLoading}
                          onContinue={(provider) => { void handleSocialContinue(provider); }}
                        />
                      </div>
                      <div className="mt-6 flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => goView('recovery')}
                          className={`text-[12px] font-medium focus-ring rounded-md px-2 py-1 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-800'}`}
                        >
                          아이디/비밀번호를 모르겠어요
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {!settleHidesForms && surfaceView === 'signup' && (
                    <motion.form
                      key="signup"
                      onSubmit={(e) => {
                        if (!signupReady) {
                          e.preventDefault();
                          return;
                        }
                        void handleSignupComplete(e);
                      }}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col gap-5"
                    >
                      <SignupStepReveal show={identityCompressed} reduceMotion={reduceMotion}>
                        <SignupSummaryRow
                          text={`${formData.full_name.trim()} · ${formData.username}`}
                          onEdit={editSignupIdentity}
                          isDark={isDark}
                        />
                      </SignupStepReveal>
                      <div className={identityCompressed ? 'hidden' : undefined} aria-hidden={identityCompressed}>
                        <div>
                          <label htmlFor="signup-full-name" className={loginLabelClass}>이름</label>
                          <input
                            id="signup-full-name"
                            type="text"
                            name="full_name"
                            autoComplete="name"
                            required
                            value={formData.full_name}
                            onChange={handleInputChange}
                            onCompositionStart={() => setNameComposing(true)}
                            onCompositionEnd={() => setNameComposing(false)}
                            onFocus={() => setFieldFocus(true)}
                            onBlur={() => { setFieldFocus(false); commitSignupName(false); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitSignupName(true);
                              }
                            }}
                            className={loginFieldClass}
                          />
                        </div>
                        <SignupStepReveal show={showSignupUsername} reduceMotion={reduceMotion}>
                          <div className="pt-5">
                            <label htmlFor="signup-username" className={loginLabelClass}>아이디</label>
                            <input
                              id="signup-username"
                              type="text"
                              name="username"
                              autoComplete="username"
                              required={showSignupUsername}
                              value={formData.username}
                              onChange={handleInputChange}
                              onFocus={() => setFieldFocus(true)}
                              onBlur={() => { setFieldFocus(false); commitSignupUsername(false); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitSignupUsername(true);
                                }
                              }}
                              className={loginFieldClass}
                              aria-describedby={signupUsernameHelper ? 'signup-username-status' : undefined}
                            />
                            {signupUsernameHelper && (
                              <p
                                id="signup-username-status"
                                className={cn('ml-auth-status', signupUsernameHelper.tone === 'alert' ? alertClass : statusQuiet)}
                                role="status"
                              >
                                {signupUsernameHelper.text}
                              </p>
                            )}
                          </div>
                        </SignupStepReveal>
                      </div>
                      <SignupStepReveal show={passwordCompressed} reduceMotion={reduceMotion}>
                        <SignupSummaryRow
                          text="비밀번호 설정 완료"
                          onEdit={editSignupPassword}
                          isDark={isDark}
                        />
                      </SignupStepReveal>
                      {showSignupPassword && (
                        <div className={passwordCompressed ? 'hidden' : undefined} aria-hidden={passwordCompressed}>
                          <motion.div
                            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-col gap-5"
                          >
                          <div>
                            <label htmlFor="signup-password" className={loginLabelClass}>비밀번호</label>
                            <div className="relative">
                              <input
                                id="signup-password"
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                autoComplete="new-password"
                                required={showSignupPassword && !passwordCompressed}
                                minLength={8}
                                value={formData.password}
                                onChange={handleInputChange}
                                onFocus={() => setFieldFocus(true)}
                                onBlur={() => { setFieldFocus(false); commitSignupPasswordPair(false); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitSignupPasswordPair(true);
                                  }
                                }}
                                className={cn(loginFieldClass, 'pr-12')}
                              />
                              <PasswordVisibilityToggle
                                visible={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                dark={isDark}
                              />
                            </div>
                            {formData.password.length < 8 && (
                              <p className={`ml-auth-status ${statusQuiet}`}>8자 이상</p>
                            )}
                          </div>
                          <div>
                            <label htmlFor="signup-password-confirm" className={loginLabelClass}>비밀번호 확인</label>
                            <div className="relative">
                              <input
                                id="signup-password-confirm"
                                type={showPasswordConfirm ? 'text' : 'password'}
                                name="passwordConfirm"
                                autoComplete="new-password"
                                required={showSignupPassword && !passwordCompressed}
                                minLength={8}
                                value={formData.passwordConfirm}
                                onChange={handleInputChange}
                                onFocus={() => setFieldFocus(true)}
                                onBlur={() => { setFieldFocus(false); commitSignupPasswordPair(false); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitSignupPasswordPair(true);
                                  }
                                }}
                                className={cn(loginFieldClass, 'pr-12')}
                              />
                              <PasswordVisibilityToggle
                                visible={showPasswordConfirm}
                                onToggle={() => setShowPasswordConfirm((v) => !v)}
                                dark={isDark}
                              />
                            </div>
                            {formData.passwordConfirm.length > 0 && formData.password !== formData.passwordConfirm && (
                              <p className={cn('ml-auth-status', alertClass)} role="alert">비밀번호가 일치하지 않습니다.</p>
                            )}
                          </div>
                          </motion.div>
                        </div>
                      )}
                      <SignupStepReveal show={phoneCompressed} reduceMotion={reduceMotion}>
                        <SignupSummaryRow
                          text={`${maskSignupPhoneSummary(formData.phone_number)} · 인증 완료`}
                          onEdit={editSignupPhone}
                          isDark={isDark}
                        />
                      </SignupStepReveal>
                      <SignupStepReveal show={Boolean(showSignupPhone && !phoneCompressed)} reduceMotion={reduceMotion}>
                        <div>
                          <label htmlFor="signup-phone" className={loginLabelClass}>전화번호</label>
                          <div className="flex gap-2">
                            <input
                              id="signup-phone"
                              type="tel"
                              name="phone_number"
                              autoComplete="tel"
                              required={showSignupPhone && !phoneCompressed}
                              value={formData.phone_number}
                              onChange={handleInputChange}
                              onFocus={() => setFieldFocus(true)}
                              onBlur={() => setFieldFocus(false)}
                              disabled={otpVerified}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                              className={cn(loginFieldClass, 'min-w-0')}
                            />
                            <button
                              type="button"
                              onClick={() => { void sendOtp('signup'); }}
                              disabled={otpSending || resendIn > 0 || otpVerified}
                              aria-busy={otpSending}
                              aria-label={otpVerified ? '전화번호 확인됨' : (otpSending ? '인증번호 전송 중' : (otpSent ? '인증번호 재전송' : '인증번호 받기'))}
                              className={cn(sideBtn, otpVerified && 'ml-auth-side--done')}
                            >
                              {otpSending ? '전송 중...' : (otpVerified ? '확인됨' : (otpSent && resendIn > 0 ? `${resendIn}s` : '인증'))}
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>
                      <SignupStepReveal show={Boolean(otpSent && !otpVerified && showSignupPhone)} reduceMotion={reduceMotion}>
                        <div>
                          <label htmlFor="signup-otp" className={loginLabelClass}>인증번호</label>
                          <p id="signup-otp-hint" className={`ml-auth-status ${statusQuiet}`}>인증번호를 입력해 주세요.</p>
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
                              aria-describedby="signup-otp-hint"
                              className={cn(loginFieldClass, 'min-w-0 tracking-[0.3em]')}
                            />
                            <button
                              type="button"
                              onClick={() => { void verifyOtp('signup'); }}
                              disabled={otpVerifying || otpVerified || otpCode.length !== 6}
                              aria-busy={otpVerifying}
                              className={sideBtnConfirm}
                            >
                              {otpVerifying ? '확인 중...' : '확인'}
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>
                      <SignupStepReveal show={Boolean(otpVerified)} reduceMotion={reduceMotion}>
                        <div className="flex flex-col gap-5">
                          <div className="ml-auth-consent" role="group" aria-label="필수 동의">
                            <CheckboxRow label="이용약관 동의" required checked={agreements.terms} onChange={() => toggleAgreement('terms')} onView={() => setPolicyModalState({ isOpen: true, key: 'terms' })} theme={theme} />
                            <CheckboxRow label="개인정보처리방침 동의" required checked={agreements.privacy} onChange={() => toggleAgreement('privacy')} onView={() => setPolicyModalState({ isOpen: true, key: 'privacy' })} theme={theme} />
                            <CheckboxRow label="쿠키 정책 동의" required checked={agreements.cookie} onChange={() => toggleAgreement('cookie')} onView={() => setPolicyModalState({ isOpen: true, key: 'cookie' })} theme={theme} />
                            <div className={`h-px my-1.5 ${isDark ? 'bg-white/8' : 'bg-black/8'}`} />
                            <CheckboxRow label="필수 항목 전체 동의" required checked={allChecked} onChange={handleSelectAll} theme={theme} />
                          </div>
                          <button
                            type="submit"
                            disabled={socialBusy || !signupReady}
                            className={cn(
                              'ml-auth-login-cta type-cta focus-ring',
                              !socialBusy && signupReady && 'ml-auth-login-cta--ready',
                            )}
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : null}
                            {isLoading ? '가입 중...' : '가입하기'}
                          </button>
                        </div>
                      </SignupStepReveal>
                      {visibleError && (
                        <div role="alert" className={alertClass}>{visibleError}</div>
                      )}
                      <SignupStepReveal show={showSignupSocialAlternatives} reduceMotion={reduceMotion}>
                        <div>
                          <div className="mt-1">
                            <SocialDivider quiet={dividerLine} compact />
                          </div>
                          <div className="mt-4">
                            <SocialContinueRow
                              density="family"
                              busyProvider={oauthStarting}
                              disabled={isLoading}
                              onContinue={(provider) => { void handleSocialContinue(provider); }}
                            />
                          </div>
                          <div className="mt-4 flex flex-col items-center">
                            <button
                              type="button"
                              onClick={() => goView('login')}
                              className={`text-[12px] font-medium focus-ring rounded-md px-2 py-1 ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-800'}`}
                            >
                              이미 계정이 있으신가요? 로그인
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>
                    </motion.form>
                  )}

                  {!settleHidesForms && surfaceView === 'recovery' && (
                    <motion.form
                      key="recovery"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (recoveryResolved && recoveryResetOpen && passwordResetAllowed) {
                          void handlePasswordReset(e);
                        }
                      }}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-5"
                    >
                      <SignupStepReveal show={!recoveryPhoneCompressed} reduceMotion={reduceMotion}>
                        <p className={`text-[13px] tracking-tight ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>가입할 때 인증한 휴대폰 번호를 입력해 주세요.</p>
                      </SignupStepReveal>
                      <SignupStepReveal show={recoveryPhoneCompressed} reduceMotion={reduceMotion}>
                        <SignupSummaryRow
                          text={`${maskSignupPhoneSummary(formData.phone_number)} · 인증 완료`}
                          onEdit={editRecoveryPhone}
                          isDark={isDark}
                        />
                      </SignupStepReveal>
                      <SignupStepReveal show={!recoveryPhoneCompressed} reduceMotion={reduceMotion}>
                        <div>
                          <label htmlFor="recovery-phone" className={loginLabelClass}>전화번호</label>
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
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                              className={cn(loginFieldClass, 'min-w-0')}
                            />
                            <button
                              type="button"
                              onClick={() => { void sendOtp('recovery'); }}
                              disabled={otpSending || resendIn > 0 || recoveryResolved}
                              aria-busy={otpSending}
                              aria-label={otpSent ? '인증번호 재전송' : '인증번호 받기'}
                              className={sideBtn}
                            >
                              {otpSending ? '전송 중...' : (otpSent && resendIn > 0 ? `${resendIn}s` : '인증')}
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>
                      <SignupStepReveal show={Boolean(otpSent && !otpVerified && !recoveryResolved)} reduceMotion={reduceMotion}>
                        <div>
                          <label htmlFor="recovery-otp" className={loginLabelClass}>인증번호</label>
                          <p id="recovery-otp-hint" className={`ml-auth-status ${statusQuiet}`}>인증번호를 입력해 주세요.</p>
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
                              aria-describedby="recovery-otp-hint"
                              className={cn(loginFieldClass, 'min-w-0 tracking-[0.3em]')}
                            />
                            <button
                              type="button"
                              onClick={() => { void verifyOtp('recovery'); }}
                              disabled={otpVerifying || otpCode.length !== 6}
                              aria-busy={otpVerifying}
                              className={sideBtnConfirm}
                            >
                              {otpVerifying ? '확인 중...' : '확인'}
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>

                      <SignupStepReveal show={recoveryResolved} reduceMotion={reduceMotion}>
                        <div className="flex flex-col gap-5">
                          {passwordResetAllowed && recoveryLoginId && (
                            <AuthNotice>
                              <p className="ml-auth-notice-primary">아이디</p>
                              <p className="ml-auth-notice-id">{recoveryLoginId}</p>
                            </AuthNotice>
                          )}
                          {passwordResetAllowed && !recoveryResetOpen && (
                            <button
                              type="button"
                              onClick={() => { setRecoveryResetOpen(true); clearAlerts(); }}
                              className="ml-auth-login-cta type-cta focus-ring ml-auth-login-cta--ready"
                            >
                              비밀번호 재설정
                            </button>
                          )}
                          {passwordResetAllowed && recoveryResetOpen && (
                            <div className="flex flex-col gap-5">
                              <div>
                                <label htmlFor="reset-password" className={loginLabelClass}>새 비밀번호</label>
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
                                    className={cn(loginFieldClass, 'pr-12')}
                                  />
                                  <PasswordVisibilityToggle
                                    visible={showResetPassword}
                                    onToggle={() => setShowResetPassword((v) => !v)}
                                    dark={isDark}
                                  />
                                </div>
                                {resetPassword.length < 8 && (
                                  <p className={`ml-auth-status ${statusQuiet}`}>8자 이상</p>
                                )}
                              </div>
                              <div>
                                <label htmlFor="reset-password-confirm" className={loginLabelClass}>새 비밀번호 확인</label>
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
                                    className={cn(loginFieldClass, 'pr-12')}
                                  />
                                  <PasswordVisibilityToggle
                                    visible={showResetPasswordConfirm}
                                    onToggle={() => setShowResetPasswordConfirm((v) => !v)}
                                    dark={isDark}
                                  />
                                </div>
                                {resetPasswordConfirm.length > 0 && resetPassword !== resetPasswordConfirm && (
                                  <p className={cn('ml-auth-status', alertClass)} role="alert">비밀번호가 일치하지 않습니다.</p>
                                )}
                              </div>
                              <button
                                type="submit"
                                disabled={isLoading || !resetReady}
                                className={cn(
                                  'ml-auth-login-cta type-cta focus-ring',
                                  !isLoading && resetReady && 'ml-auth-login-cta--ready',
                                )}
                              >
                                {isLoading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : null}
                                {isLoading ? '변경 중...' : '비밀번호 변경'}
                              </button>
                            </div>
                          )}
                          {linkedProviders.length > 0 && (
                            <div className="space-y-3">
                              {!passwordResetAllowed && (
                                <AuthNotice>
                                  <p>
                                    {recoveryAccountKind === 'social'
                                      ? '소셜 로그인으로 가입한 계정입니다.'
                                      : '가입하신 방법으로 계속해 주세요.'}
                                  </p>
                                  {recoveryAccountKind === 'social' && (
                                    <p>가입하신 방법으로 계속해 주세요.</p>
                                  )}
                                </AuthNotice>
                              )}
                              <SocialContinueRow
                                providers={linkedProviders}
                                density="family"
                                busyProvider={oauthStarting}
                                disabled={isLoading}
                                onContinue={(provider) => { void handleSocialContinue(provider); }}
                              />
                            </div>
                          )}
                          {!passwordResetAllowed && linkedProviders.length === 0 && (
                            <div className="space-y-4">
                              <AuthNotice>
                                <p>비밀번호로 찾을 수 없는 계정입니다.</p>
                              </AuthNotice>
                              <button
                                type="button"
                                onClick={() => goView('login')}
                                className="ml-auth-login-cta type-cta focus-ring ml-auth-login-cta--ready"
                              >
                                로그인
                              </button>
                            </div>
                          )}
                        </div>
                      </SignupStepReveal>

                      {errorMsg && (
                        <div role="alert" className={alertClass}>{errorMsg}</div>
                      )}
                    </motion.form>
                  )}

                  {!settleHidesForms && surfaceView === 'social' && (
                    <motion.form
                      key="social"
                      onSubmit={handleSocialComplete}
                      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-5"
                    >
                      <SignupStepReveal show={!phoneCompressed} reduceMotion={reduceMotion}>
                        <p className={`text-[13px] tracking-tight ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>휴대폰 인증으로 가입을 완료해 주세요.</p>
                      </SignupStepReveal>
                      <SignupStepReveal show={phoneCompressed} reduceMotion={reduceMotion}>
                        <SignupSummaryRow
                          text={`${maskSignupPhoneSummary(formData.phone_number)} · 인증 완료`}
                          onEdit={editSocialPhone}
                          isDark={isDark}
                        />
                      </SignupStepReveal>
                      <SignupStepReveal show={!phoneCompressed} reduceMotion={reduceMotion}>
                        <div>
                          <label htmlFor="social-phone" className={loginLabelClass}>전화번호</label>
                          <div className="flex gap-2">
                            <input
                              id="social-phone"
                              type="tel"
                              name="phone_number"
                              autoComplete="tel"
                              required={!phoneCompressed}
                              value={formData.phone_number}
                              onChange={handleInputChange}
                              onFocus={() => setFieldFocus(true)}
                              onBlur={() => setFieldFocus(false)}
                              disabled={otpVerified}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                              className={cn(loginFieldClass, 'min-w-0')}
                            />
                            <button
                              type="button"
                              onClick={() => { void sendOtp('identity_link'); }}
                              disabled={otpSending || resendIn > 0 || otpVerified || isLoading}
                              aria-busy={otpSending}
                              aria-label={otpVerified ? '전화번호 확인됨' : (otpSending ? '인증번호 전송 중' : (otpSent ? '인증번호 재전송' : '인증번호 받기'))}
                              className={cn(sideBtn, otpVerified && 'ml-auth-side--done')}
                            >
                              {otpSending ? '전송 중...' : (otpVerified ? '확인됨' : (otpSent && resendIn > 0 ? `${resendIn}s` : '인증'))}
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>
                      <SignupStepReveal show={Boolean(otpSent && !otpVerified)} reduceMotion={reduceMotion}>
                        <div>
                          <label htmlFor="social-otp" className={loginLabelClass}>인증번호</label>
                          <p id="social-otp-hint" className={`ml-auth-status ${statusQuiet}`}>인증번호를 입력해 주세요.</p>
                          <div className="flex gap-2">
                            <input
                              id="social-otp"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearAlerts(); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void verifyOtp('identity_link');
                                }
                              }}
                              aria-describedby="social-otp-hint"
                              className={cn(loginFieldClass, 'min-w-0 tracking-[0.3em]')}
                            />
                            <button
                              type="button"
                              onClick={() => { void verifyOtp('identity_link'); }}
                              disabled={otpVerifying || otpVerified || isLoading || otpCode.length !== 6}
                              aria-busy={otpVerifying}
                              className={sideBtnConfirm}
                            >
                              {otpVerifying ? '확인 중...' : '확인'}
                            </button>
                          </div>
                        </div>
                      </SignupStepReveal>
                      <SignupStepReveal show={Boolean(otpVerified)} reduceMotion={reduceMotion}>
                        <div className="flex flex-col gap-5">
                          <div className="ml-auth-consent" role="group" aria-label="필수 동의">
                            <CheckboxRow label="이용약관 동의" required checked={agreements.terms} onChange={() => toggleAgreement('terms')} onView={() => setPolicyModalState({ isOpen: true, key: 'terms' })} theme={theme} />
                            <CheckboxRow label="개인정보처리방침 동의" required checked={agreements.privacy} onChange={() => toggleAgreement('privacy')} onView={() => setPolicyModalState({ isOpen: true, key: 'privacy' })} theme={theme} />
                            <CheckboxRow label="쿠키 정책 동의" required checked={agreements.cookie} onChange={() => toggleAgreement('cookie')} onView={() => setPolicyModalState({ isOpen: true, key: 'cookie' })} theme={theme} />
                            <div className={`h-px my-1.5 ${isDark ? 'bg-white/8' : 'bg-black/8'}`} />
                            <CheckboxRow label="필수 항목 전체 동의" required checked={allChecked} onChange={handleSelectAll} theme={theme} />
                          </div>
                          <button
                            type="submit"
                            disabled={isLoading || !socialReady || abandoningPending}
                            className={cn(
                              'ml-auth-login-cta type-cta focus-ring',
                              !isLoading && socialReady && !abandoningPending && 'ml-auth-login-cta--ready',
                            )}
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : null}
                            {isLoading ? '가입 중...' : '가입하기'}
                          </button>
                        </div>
                      </SignupStepReveal>
                      {visibleError && (
                        <div role="alert" className={`${alertClass} whitespace-pre-line`}>{visibleError}</div>
                      )}
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
            </div>
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
