import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { user, profile, isLoading: authLoading, refreshSession } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectUrl = searchParams.get('redirect') || '/';

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
    // 세션 자동 복구: 앱 시작 시 세션 확인
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate(redirectUrl);
      }
    };
    checkSession();

    // 세션 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate(redirectUrl);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, redirectUrl]);

  useEffect(() => {
    if (!authLoading && user) {
      if (profile) {
        navigate(redirectUrl);
      }
    }
  }, [user, profile, authLoading, navigate, redirectUrl]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    // Step 0: 사전 검증
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
        // Step 1: 로그인 시도 (가상 이메일 시스템 사용)
        const virtualEmail = `${formData.username}@metalora.me`;
        
        // Clear any existing sessions before login to prevent ghost sessions
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((c) => {
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: virtualEmail,
          password: formData.password,
        });
        
        if (signInError) {
          console.error('[Login Error]:', signInError);
          let errMsg = '아이디 또는 비밀번호가 올바르지 않습니다.';
          if (signInError.message.includes('Invalid login credentials')) {
            errMsg = '아이디 또는 비밀번호가 올바르지 않습니다.';
          }
          showToast(errMsg, 'error');
          throw new Error(errMsg);
        }

        // 세션 확정 및 프로필 로드 대기
        if (signInData.session) {
          await refreshSession();
        }
        
        // Step 2: 성공 시 즉시 메인 페이지로 이동
        window.location.href = '/';
      } else {
        // Signup logic
        if (!formData.username || !formData.full_name || !formData.phone_number) {
          showToast('필수 정보가 누락되었습니다.', 'error');
          setIsLoading(false);
          return;
        }

        const email = `${formData.username}@metalora.me`;
        
        // 1. Check profiles table first
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('user_custom_id', formData.username);

        if (count && count > 0) {
          showToast('이미 사용 중인 아이디입니다.', 'error');
          setIsLoading(false);
          return;
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
              errMsg = '이미 사용 중인 아이디입니다.';
              showToast(errMsg, 'error');
              throw new Error(errMsg);
            } else {
              // Sign in succeeded! We recovered the ghost account.
              authUser = signInData.user;
              authSession = signInData.session;
            }
          } else {
            console.error('[SignUp Error]:', error);
            if (error.message?.includes('Email address is invalid')) {
              errMsg = '올바른 아이디 형식이 아닙니다.';
              showToast(errMsg, 'error');
              throw new Error(errMsg);
            } else if (error.message?.includes('Password should be at least')) {
              errMsg = '비밀번호가 너무 짧습니다. 6자 이상으로 설정해주세요.';
              showToast(errMsg, 'error');
              throw new Error(errMsg);
            } else {
              showToast(errMsg, 'error');
              throw error;
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
            showToast('계정 생성은 완료되었으나 추가 정보 저장에 실패했습니다. 관리자에게 문의해주세요.', 'error');
            setIsLoading(false);
            return;
          }

          // 세션 확인 및 강제 로그인 (이메일 인증이 켜져있을 경우 대비)
          if (!authSession) {
            // 이메일 인증이 켜져있을 경우 세션이 즉시 반환되지 않음
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password: formData.password,
            });
            
            if (signInError) {
              if (signInError.message.includes('Email not confirmed')) {
                const confirmMsg = '회원가입은 완료되었으나 이메일 인증이 필요합니다. 이메일을 확인해주세요.';
                showToast(confirmMsg, 'info');
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
        }
      }
    } catch (error: any) {
      console.error('[Auth Error]:', error);
      showToast(error.message || '인증 중 오류가 발생했습니다.', 'error');
      setErrorMsg(error.message || '인증 중 오류가 발생했습니다.');
    } finally {
      // 무한 로딩 강제 셧다운
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errorMsg) setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 pt-20">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
      >
        {/* Close Button */}
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(-1);
          }}
          className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors z-50 p-2"
          aria-label="닫기"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">METALORA</h1>
          <p className="text-zinc-400">프리미엄 메탈 포스터 멤버십</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-white transition-colors text-lg"
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-white transition-colors text-lg"
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
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-white transition-colors text-lg"
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
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-4 text-white placeholder:text-zinc-500 focus:outline-none focus:border-white transition-colors text-lg"
            />
          </div>

          {errorMsg && (
            <div className="text-red-500 text-sm px-2 pt-1 font-medium">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="text-emerald-400 text-sm px-2 pt-1">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="relative z-10 w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 text-lg mt-4 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : null}
            {isLoginMode ? '로그인' : '가입하기'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLoginMode(!isLoginMode);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="text-zinc-400 hover:text-white text-sm transition-colors relative z-10 pointer-events-auto"
          >
            {isLoginMode ? '계정이 없으신가요? 간편 가입하기' : '이미 계정이 있으신가요? 로그인하기'}
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-8">
          가입 시 METALORA의 이용약관 및 개인정보처리방침에 동의하게 됩니다.
        </p>
      </motion.div>
    </div>
  );
}
