import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2, X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  redirectUrl?: string;
}

export default function LoginModal({ isOpen, onClose, redirectUrl = '/' }: LoginModalProps) {
  const { user, profile, refreshSession } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    phone_number: '',
  });

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
          console.error('[Login Error]:', signInError);
          let errMsg = '인증 중 오류가 발생했습니다.';
          if (signInError.message.includes('Invalid login credentials')) {
            errMsg = '비밀번호가 틀렸습니다.';
          }
          throw new Error(errMsg);
        }

        if (signInData.session) {
          await refreshSession();
        }
        
        onClose();
      } else {
        if (!formData.username || !formData.full_name || !formData.phone_number) {
          throw new Error('필수 정보가 누락되었습니다.');
        }

        const email = `${formData.username}@metalora.me`;
        
        // 1. Check profiles table first
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('user_custom_id', formData.username);

        if (count && count > 0) {
          throw new Error('이미 사용 중인 아이디입니다.');
        }

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
              user_custom_id: formData.username
            },
          },
        });
        
        if (error) {
          let errMsg = "정보를 저장하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요";
          
          if (error.message?.includes('User already registered')) {
            // 3. Partial failure recovery: try to sign in
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password: formData.password,
            });
            
            if (signInError) {
              // If sign in fails, it means the ID is taken by someone else or wrong password
              console.error('[SignUp Error - Ghost Account Recovery Failed]:', signInError);
              throw new Error('이미 사용 중인 아이디입니다.');
            } else {
              // Sign in succeeded! We recovered the ghost account.
              authUser = signInData.user;
              authSession = signInData.session;
            }
          } else {
            console.error('[SignUp Error]:', error);
            if (error.message?.includes('Email address is invalid')) {
              errMsg = '올바른 아이디 형식이 아닙니다.';
              throw new Error(errMsg);
            } else if (error.message?.includes('Password should be at least')) {
              errMsg = '비밀번호가 너무 짧습니다. 6자 이상으로 설정해주세요.';
              throw new Error(errMsg);
            } else {
              throw new Error(errMsg);
            }
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
            // Trigger succeeded, just update the fields to be safe
            updateSuccess = true;
            await supabase
              .from('profiles')
              .update({
                full_name: formData.full_name,
                phone_number: formData.phone_number,
                user_custom_id: formData.username
              })
              .eq('id', authUser.id);
          } else {
            // Trigger failed or delayed, manual upsert
            while (!updateSuccess && retryCount < maxRetries) {
              try {
                const { error: updateError } = await supabase
                  .from('profiles')
                  .upsert({
                    id: authUser.id,
                    full_name: formData.full_name,
                    phone_number: formData.phone_number,
                    user_custom_id: formData.username
                  });
                
                if (!updateError) {
                  updateSuccess = true;
                } else {
                  console.warn(`[Profile Upsert Retry ${retryCount + 1}]:`, updateError);
                  await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1))); // 지수 백오프
                  retryCount++;
                }
              } catch (err) {
                console.error(`[Profile Upsert Exception Retry ${retryCount + 1}]:`, err);
                retryCount++;
              }
            }
          }

          if (!updateSuccess) {
            console.error('[Profile Upsert Failed after retries]');
            throw new Error('계정 생성은 완료되었으나 추가 정보 저장에 실패했습니다. 관리자에게 문의해주세요.');
          }

          if (!authSession) {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password: formData.password,
            });
            
            if (signInError) {
              if (signInError.message.includes('Email not confirmed')) {
                const confirmMsg = '회원가입은 완료되었으나 이메일 인증이 필요합니다.';
                setSuccessMsg(confirmMsg);
                return;
              }
              throw new Error('회원가입은 완료되었으나 자동 로그인에 실패했습니다.');
            }

            if (signInData.session) {
              await refreshSession();
            }
          } else {
            await refreshSession();
          }
          
          setSuccessMsg('METALORA 멤버십 가입을 환영합니다!');
          window.location.href = '/';
          onClose();
        }
      }
    } catch (error: any) {
      console.error('[Auth Error]:', error);
      setErrorMsg(error.message || '인증 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errorMsg) setErrorMsg('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] bg-[#121212] w-screen h-screen flex flex-col overflow-y-auto p-6 md:p-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="relative w-full max-w-lg mx-auto my-auto will-change-transform"
          >
            {/* Close Button */}
            <button 
              onClick={handleClose}
              className="fixed top-6 right-6 text-zinc-500 hover:text-white transition-colors z-[10000] p-2 bg-white/5 rounded-full"
              aria-label="닫기"
            >
              <X size={28} />
            </button>

            <div className="text-center mb-12">
              <img 
                src="https://postfiles.pstatic.net/MjAyNjAzMTZfMjM2/MDAxNzczNjQzMzQ3MDUw.zR_7l4ozVWSXDJOr1CA_6tw0H8LF8ZQenQvN8Tw3swEg.i_g5v5uqKHopzrE-iqVmSsuKM-nhT3X3N0tWVC_DDBgg.PNG/METALORA_LOGO.png?type=w3840" 
                alt="METALORA" 
                className="h-10 object-contain mb-4 dark:invert filter invert mx-auto" 
                referrerPolicy="no-referrer"
              />
              <p className="text-zinc-400 font-medium tracking-tight">프리미엄 메탈 포스터 멤버십</p>
            </div>

        <form onSubmit={handleAuth} className="space-y-6">
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
                  className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
                  className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
              className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
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
              className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-6 py-5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20 transition-colors text-lg tracking-tight"
            />
          </div>

          {errorMsg && (
            <div className="text-red-500 text-sm px-2 pt-1 font-bold tracking-tight">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="text-emerald-400 text-sm px-2 pt-1 font-bold tracking-tight">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white text-black font-bold py-6 rounded-2xl hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-xl mt-8 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-white/5 tracking-tight"
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
