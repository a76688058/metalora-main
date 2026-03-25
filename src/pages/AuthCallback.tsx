import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        if (error.message?.includes('Lock was stolen') || String(error).includes('Lock was stolen')) {
          console.warn('Auth callback: Lock was stolen by another request. Retrying in 1s...');
          setTimeout(handleAuthCallback, 1000);
          return;
        }
        console.error('Auth callback error:', error);
        navigate('/login');
        return;
      }

      if (session?.user) {
        navigate(redirectUrl);
      } else {
        navigate('/login');
      }
    };

    handleAuthCallback();
  }, [navigate, redirectUrl]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
      <h2 className="text-xl font-bold tracking-tight">인증 처리 중...</h2>
      <p className="text-zinc-400 mt-2">잠시만 기다려주세요.</p>
    </div>
  );
}
