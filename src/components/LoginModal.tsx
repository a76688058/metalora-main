import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2, X, Check } from 'lucide-react';
import PolicyModal from './PolicyModal';
import { policies } from './Footer';

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
  onView 
}: { 
  label: string; 
  required?: boolean; 
  checked: boolean; 
  onChange: () => void; 
  onView?: () => void;
}) => (
  <div className="flex items-center gap-3 py-2">
    <button
      type="button"
      onClick={onChange}
      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
        checked ? 'bg-purple-600' : 'bg-zinc-800 border border-white/10'
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
      {required && <span className="text-purple-500 text-[14px] font-medium">[필수]</span>}
      <span className="text-zinc-400 text-[14px]">{label}</span>
    </button>
    {onView && (
      <button
        type="button"
        onClick={onView}
        className="text-[12px] text-zinc-600 underline ml-auto px-2 py-1"
      >
        보기
      </button>
    )}
  </div>
);

export default function LoginModal({ isOpen, onClose, onSuccess, redirectUrl = '/' }: LoginModalProps) {
  const { user, profile, refreshSession } = useAuth();
  const { showToast } = useToast();
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
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('user_custom_id')
          .eq('user_custom_id', formData.username)
          .maybeSingle();

        if (profileError || !profileData) {
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

        // Check profiles table first
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('user_custom_id', formData.username);

        if (count && count > 0) {
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

      // 2. Try sign up
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
          // 이미 가입된 경우 로그인을 시도하여 세션을 획득합니다.
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: formData.password,
          });

          if (signInError) {
            throw new Error('이미 사용 중인 아이디입니다. 비밀번호를 확인해주세요.');
          }
          
          authUser = signInData.user;
          authSession = signInData.session;
          
          // 로그인 성공 시 프로필이 있는지 확인하고 없으면 생성합니다.
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, is_admin')
            .eq('id', authUser.id)
            .single();

          if (!profile) {
            console.log('Profile missing for existing user, creating with new schema...');
            await supabase.from('profiles').insert({
              id: authUser.id,
              full_name: formData.full_name,
              phone_number: formData.phone_number,
              user_custom_id: formData.username,
              is_admin: false,
              total_spent: 0,
              agreed_to_terms_at: new Date().toISOString(),
              agreed_to_privacy_at: new Date().toISOString(),
              agreed_to_cookie_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
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

      if (authUser) {
        // 데이터 무결성 보장: profiles 테이블에 즉시 업데이트 시도 (Retry 로직 포함)
        let updateSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;

        // 트리거가 실행될 시간을 1초 대기
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 1. Check if profile was created by trigger
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', authUser.id)
          .maybeSingle();

        if (existingProfile) {
          updateSuccess = true;
          await supabase
            .from('profiles')
            .update({
              full_name: formData.full_name,
              phone_number: formData.phone_number,
              user_custom_id: formData.username,
              is_admin: false,
              total_spent: 0,
              agreed_to_terms_at: new Date().toISOString(),
              agreed_to_privacy_at: new Date().toISOString(),
              agreed_to_cookie_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', authUser.id);
        } else {
          while (!updateSuccess && retryCount < maxRetries) {
            try {
              const { error: updateError } = await supabase
                .from('profiles')
                .upsert({
                  id: authUser.id,
                  full_name: formData.full_name,
                  phone_number: formData.phone_number,
                  user_custom_id: formData.username,
                  is_admin: false,
                  total_spent: 0,
                  agreed_to_terms_at: new Date().toISOString(),
                  agreed_to_privacy_at: new Date().toISOString(),
                  agreed_to_cookie_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              
              if (!updateError) {
                updateSuccess = true;
              } else {
                console.warn(`[Profile Upsert Retry ${retryCount + 1}]:`, updateError);
                await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
                retryCount++;
              }
            } catch (err) {
              console.error(`[Profile Upsert Exception Retry ${retryCount + 1}]:`, err);
              retryCount++;
            }
          }
        }

        if (!updateSuccess) {
          throw new Error('계정 생성은 완료되었으나 추가 정보 저장에 실패했습니다. 관리자에게 문의해주세요.');
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
        
        showToast('METALORA 멤버십 가입을 환영합니다!', 'purple');
        setIsConsentOpen(false);
        if (onSuccess) {
          onSuccess();
        } else {
          onClose();
        }
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
    <AnimatePresence>
      {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[50000] bg-[#0c0c0c] flex items-center justify-center"
          >
            {/* Close Button - Moved outside scrolling container for visibility */}
            <button 
              onClick={handleClose}
              className="absolute top-6 right-6 md:top-8 md:right-8 text-white/70 hover:text-white transition-colors z-[10001] p-2"
              aria-label="닫기"
            >
              <X size={24} strokeWidth={2} />
            </button>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-lg h-full overflow-y-auto px-6 pt-24 pb-6 md:pb-10 will-change-transform scrollbar-hide flex flex-col items-center justify-center border border-white/5 shadow-[0_0_50px_-12px_rgba(0,0,0,1)]"
            >
            <div className="w-full flex flex-col items-center -mt-16 md:-mt-24">
            <div className="flex flex-col items-center mb-10">
              <img 
                src="https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840" 
                alt="METALORA" 
                className="w-36 md:w-44 object-contain filter invert mb-6" 
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
                      className="w-full bg-zinc-900 border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
                      className="w-full bg-zinc-900 border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
                  className="w-full bg-zinc-900 border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
                  className="w-full bg-zinc-900 border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
                    ? 'bg-white text-black hover:bg-zinc-200 shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'btn-cyberpunk text-white'
                }`}
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
                className="text-zinc-400 hover:text-white text-sm font-bold transition-colors tracking-tight"
              >
                {isLoginMode ? '계정이 없으신가요? 간편 가입하기' : '이미 계정이 있으신가요? 로그인하기'}
              </button>
            </div>

            <p className="text-center text-zinc-600 text-[11px] mt-12 font-medium tracking-tight">
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
          className="fixed inset-0 bg-[#0c0c0c] z-[60000] flex items-end sm:items-center justify-center"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-w-md bg-zinc-900 rounded-t-[32px] sm:rounded-[28px] p-8 text-white relative border border-white/5 shadow-[0_0_50px_-12px_rgba(0,0,0,1)] sm:-translate-y-12"
          >
            <button 
              onClick={() => setIsConsentOpen(false)}
              className="absolute top-8 right-8 text-zinc-500 hover:text-white transition-colors"
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
              />
              <CheckboxRow
                label="개인정보처리방침 동의"
                required
                checked={agreements.privacy}
                onChange={() => toggleAgreement('privacy')}
                onView={() => setPolicyModalState({ isOpen: true, key: 'privacy' })}
              />
              <CheckboxRow
                label="쿠키 정책 동의"
                required
                checked={agreements.cookie}
                onChange={() => toggleAgreement('cookie')}
                onView={() => setPolicyModalState({ isOpen: true, key: 'cookie' })}
              />

              <div className="h-[1px] bg-white/5 my-6" />

              <CheckboxRow
                label="전체 동의 (선택)"
                checked={allChecked}
                onChange={handleSelectAll}
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
