import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2, X, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import PolicyModal from './PolicyModal';
import { policies } from './Footer';
import { cn } from '../lib/cn';
import { zClass } from '../constants/overlays';
import { useShellOverlay } from '../context/ShellOverlayContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  redirectUrl?: string;
}

const CheckboxRow = ({ 
  label, 
  required, 
  checked, 
  onChange, 
  onView,
  theme
}: { 
  label: string; 
  required?: boolean; 
  checked: boolean; 
  onChange: () => void; 
  onView?: () => void;
  theme?: string;
}) => (
  <div className="flex items-center gap-3 py-2">
    <button
      type="button"
      onClick={onChange}
      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
        checked 
          ? 'bg-purple-600' 
          : (theme === 'dark' ? 'bg-zinc-800 border border-white/10' : 'bg-zinc-100 border border-black/10')
      }`}
    >
      <AnimatePresence mode="wait">
        {checked && (
          <motion.div
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
          >
            <Check size={14} className="text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
    <button 
      type="button" 
      onClick={onChange}
      className="flex-1 text-left flex items-center gap-1.5"
    >
      {required && <span className="text-purple-500 text-[15px] font-bold">[필수]</span>}
      <span className={`text-[15px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{label}</span>
    </button>
    {onView && (
      <button
        type="button"
        onClick={onView}
        className={`text-[13px] underline ml-auto px-2 py-1 font-medium ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
      >
        보기
      </button>
    )}
  </div>
);

export default function LoginModal({ isOpen, onClose, onSuccess, redirectUrl = '/' }: LoginModalProps) {
  const { user, profile, refreshSession } = useAuth();
  const { showToast } = useToast();
  const { theme } = useTheme();
  const { registerLoginOverlay } = useShellOverlay();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    phone_number: '',
  });

  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    cookie: false,
  });
  const [policyModalState, setPolicyModalState] = useState<{ isOpen: boolean; key: keyof typeof policies | null }>({
    isOpen: false,
    key: null,
  });

  const allChecked = agreements.terms && agreements.privacy && agreements.cookie;

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
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (formData.username.length < 4) {
      setErrorMsg('아이디는 4자 이상으로 입력해주세요.');
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isLoginMode) {
        const { data: usernameExists, error: profileError } = await supabase.rpc(
          'profiles_username_exists',
          { username: formData.username },
        );

        if (profileError || !usernameExists) {
          throw new Error('존재하지 않는 아이디입니다.');
        }

        const virtualEmail = `${formData.username}@metalora.me`;
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: virtualEmail,
          password: formData.password,
        });
        
        if (signInError) {
          let errMsg = '인증 중 오류가 발생했습니다.';
          if (signInError.message.includes('Invalid login credentials')) {
            errMsg = '아이디 또는 비밀번호가 올바르지 않습니다.';
          }
          throw new Error(errMsg);
        }

        if (signInData.session) {
          await refreshSession();
        }
        
        if (onSuccess) {
          onSuccess();
        } else {
          onClose();
        }
      } else {
        // Step 1: Validation before showing consent overlay
        if (!formData.username || !formData.full_name || !formData.phone_number) {
          throw new Error('필수 정보가 누락되었습니다.');
        }

        // Check username availability via RPC (no direct profiles SELECT)
        const { data: usernameExists, error: usernameCheckError } = await supabase.rpc(
          'profiles_username_exists',
          { username: formData.username },
        );

        if (usernameCheckError) {
          throw new Error('아이디 확인 중 오류가 발생했습니다.');
        }

        if (usernameExists) {
          throw new Error('이미 사용 중인 아이디입니다.');
        }

        // If valid, open consent overlay
        setIsConsentOpen(true);
        setIsLoading(false);
      }
    } catch (error: any) {
      setErrorMsg(error.message || '인증 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  const handleFinalSignUp = async () => {
    if (isLoading || !allChecked) return;
    
    setIsLoading(true);
    setErrorMsg('');

    try {
      const email = `${formData.username}@metalora.me`;
      
      let authUser = null;
      let authSession = null;

      const { data, error } = await supabase.auth.signUp({
        email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
            phone_number: formData.phone_number,
            user_custom_id: formData.username,
            agreed_to_terms_at: new Date().toISOString(),
            agreed_to_privacy_at: new Date().toISOString(),
            agreed_to_cookie_at: new Date().toISOString(),
          },
        },
      });
      
      if (error) {
        console.error('Supabase SignUp Error:', error);
        
        if (error.message?.includes('User already registered')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: formData.password,
          });

          if (signInError) {
            throw new Error('이미 사용 중인 아이디입니다. 비밀번호를 확인해주세요.');
          }
          
          authUser = signInData.user;
          authSession = signInData.session;
        } else {
          let errMsg = error.message || "정보를 저장하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요";
          if (error.message?.includes('Email address is invalid')) {
            errMsg = '올바른 아이디 형식이 아닙니다.';
          } else if (error.message?.includes('Password should be at least')) {
            errMsg = '비밀번호가 너무 짧습니다. 6자 이상으로 설정해주세요.';
          }
          throw new Error(errMsg);
        }
      } else {
        authUser = data?.user;
        authSession = data?.session;
      }

      if (!authUser) {
        throw new Error('가입 중 오류가 발생했습니다.');
      }

      if (authSession) {
        await refreshSession();
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: formData.password,
        });

        if (signInError) {
          if (signInError.message.includes('Email not confirmed')) {
            showToast('회원가입은 완료되었으나 이메일 인증이 필요합니다.', 'info');
            setIsConsentOpen(false);
            return;
          }
          throw new Error('회원가입은 완료되었으나 자동 로그인에 실패했습니다.');
        }

        if (signInData.session) {
          await refreshSession();
        }
      }

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileError || !profileRow) {
        throw new Error('계정 정보를 불러올 수 없습니다. 관리자에게 문의해주세요.');
      }

      showToast('METALORA 멤버십 가입을 환영합니다!', 'purple');
      setIsConsentOpen(false);
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (error: any) {
      setErrorMsg(error.message || '가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errorMsg) setErrorMsg('');
  };

  const isSignUpValid = Boolean(formData.full_name && formData.phone_number && formData.username && formData.password);
  const isLoginValid = Boolean(formData.username && formData.password);

  return (
    <>
    <AnimatePresence onExitComplete={handleLoginOverlayExit}>
      {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'fixed inset-0 flex items-center justify-center transform-gpu will-change-transform motion-safe-transition',
              zClass('dialog'),
              theme === 'dark' ? 'bg-canvas' : 'bg-canvas',
            )}
          >
            {/* Close Button - Moved outside scrolling container for visibility */}
            <button 
              onClick={handleClose}
              className={cn(
                'absolute right-4 top-4 z-10 p-2 motion-safe-transition sm:right-6 sm:top-6',
                'focus-ring text-text-secondary hover:text-text-primary',
              )}
              aria-label="닫기"
            >
              <X size={24} strokeWidth={2} />
            </button>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className={cn(
                'relative flex h-full w-full max-w-lg flex-col items-center justify-center overflow-y-auto border border-border-subtle px-6 pb-6 pt-20 md:pb-10',
                'surface-raised scrollbar-hide transform-gpu will-change-transform',
              )}
            >
            <div className="w-full flex flex-col items-center -mt-16 md:-mt-24">
            <div className="flex flex-col items-center mb-10">
              <img 
                src="/logo/metalora-wordmark.webp" 
                alt="METALORA" 
                width={384}
                height={124}
                className={`w-36 md:w-44 object-contain mb-6 ${theme === 'dark' ? 'filter invert' : ''}`} 
                referrerPolicy="no-referrer"
              />
              <p className="text-zinc-400 font-medium tracking-tight">프리미엄 메탈 포스터 멤버십</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6 w-full">
              {!isLoginMode && (
                <>
                  <div>
                    <input
                      type="text"
                      name="full_name"
                      required
                      value={formData.full_name}
                      onChange={handleInputChange}
                      placeholder="실명"
                      className={`w-full border rounded-2xl px-6 py-5 placeholder:text-zinc-600 focus:outline-none transition-colors text-lg tracking-tight ${
                        theme === 'dark' ? 'bg-zinc-900 border-white/5 text-white focus:border-white/20' : 'bg-zinc-50 border-black/5 text-black focus:border-black/20'
                      }`}
                    />
                  </div>
                  <div>
                    <input
                      type="tel"
                      name="phone_number"
                      required
                      value={formData.phone_number}
                      onChange={handleInputChange}
                      placeholder="휴대폰 번호 (010-0000-0000)"
                      className={`w-full border rounded-2xl px-6 py-5 placeholder:text-zinc-600 focus:outline-none transition-colors text-lg tracking-tight ${
                        theme === 'dark' ? 'bg-zinc-900 border-white/5 text-white focus:border-white/20' : 'bg-zinc-50 border-black/5 text-black focus:border-black/20'
                      }`}
                    />
                  </div>
                </>
              )}
              <div>
                <input
                  type="text"
                  name="username"
                  required
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="아이디"
                  className={`w-full border rounded-2xl px-6 py-5 placeholder:text-zinc-600 focus:outline-none transition-colors text-lg tracking-tight ${
                    theme === 'dark' ? 'bg-zinc-900 border-white/5 text-white focus:border-white/20' : 'bg-zinc-50 border-black/5 text-black focus:border-black/20'
                  }`}
                />
              </div>
              <div>
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="비밀번호"
                  className={`w-full border rounded-2xl px-6 py-5 placeholder:text-zinc-600 focus:outline-none transition-colors text-lg tracking-tight ${
                    theme === 'dark' ? 'bg-zinc-900 border-white/5 text-white focus:border-white/20' : 'bg-zinc-50 border-black/5 text-black focus:border-black/20'
                  }`}
                />
              </div>

              {errorMsg && (
                <div className="text-red-500 text-sm px-2 pt-1 font-bold tracking-tight text-center">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="text-emerald-400 text-sm px-2 pt-1 font-bold tracking-tight text-center">
                  {successMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (isLoginMode ? !isLoginValid : !isSignUpValid)}
                className={`w-full font-bold py-6 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xl mt-8 shadow-2xl tracking-tight ${
                  isLoginMode 
                    ? (theme === 'dark' ? 'bg-white text-black hover:bg-zinc-200 shadow-white/5' : 'bg-black text-white hover:bg-zinc-800 shadow-black/5')
                    : 'btn-cyberpunk text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading ? <Loader2 className="animate-spin" size={24} /> : null}
                {isLoginMode ? '로그인' : '가입하기'}
              </button>
            </form>

            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLoginMode(!isLoginMode);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`text-sm font-bold transition-colors tracking-tight ${
                  theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'
                }`}
              >
                {isLoginMode ? '계정이 없으신가요? 간편 가입하기' : '이미 계정이 있으신가요? 로그인하기'}
              </button>
            </div>

            <p className="text-center text-zinc-500 text-[12px] mt-12 font-bold tracking-tight">
              가입 시 METALORA의 이용약관 및 개인정보처리방침에 동의하게 됩니다.
            </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Consent Overlay */}
    <AnimatePresence>
      {isConsentOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'fixed inset-0 flex items-end justify-center sm:items-center transform-gpu will-change-transform',
            zClass('sheet'),
            theme === 'dark' ? 'bg-overlay-backdrop-heavy' : 'bg-overlay-backdrop backdrop-blur-sm',
          )}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              'relative w-full max-w-md rounded-t-lg border border-border-subtle p-8 sm:rounded-lg sm:-translate-y-8',
              'surface-modal transform-gpu will-change-transform',
            )}
          >
            <button 
              onClick={() => setIsConsentOpen(false)}
              className="absolute top-8 right-8 text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <X size={24} />
            </button>

            <h3 className="text-xl font-bold mb-8 tracking-tight">[서비스 이용을 위한 약관 동의]</h3>

            <div className="space-y-1">
              <CheckboxRow
                label="이용약관 동의"
                required
                checked={agreements.terms}
                onChange={() => toggleAgreement('terms')}
                onView={() => setPolicyModalState({ isOpen: true, key: 'terms' })}
                theme={theme}
              />
              <CheckboxRow
                label="개인정보처리방침 동의"
                required
                checked={agreements.privacy}
                onChange={() => toggleAgreement('privacy')}
                onView={() => setPolicyModalState({ isOpen: true, key: 'privacy' })}
                theme={theme}
              />
              <CheckboxRow
                label="쿠키 정책 동의"
                required
                checked={agreements.cookie}
                onChange={() => toggleAgreement('cookie')}
                onView={() => setPolicyModalState({ isOpen: true, key: 'cookie' })}
                theme={theme}
              />

              <div className={`h-[1px] my-6 ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`} />

              <CheckboxRow
                label="전체 동의 (선택)"
                checked={allChecked}
                onChange={handleSelectAll}
                theme={theme}
              />
            </div>

            <button
              onClick={handleFinalSignUp}
              disabled={isLoading || !allChecked}
              className="w-full font-bold py-5 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-lg mt-10 shadow-2xl tracking-tight btn-cyberpunk text-white"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : null}
              동의하고 가입하기
            </button>
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
