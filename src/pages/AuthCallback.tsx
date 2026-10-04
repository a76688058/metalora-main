import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  authCallbackHasOAuthError,
  isPasswordRecoveryAuthCallback,
  markPasswordRecoveryEvent,
  passwordRecoveryEventWasSeen,
  resolveAuthCallbackPath,
} from '../lib/authIntegrity';
import { supabase } from '../lib/supabase';

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') markPasswordRecoveryEvent();
});

/**
 * PKCE: supabase-js detectSessionInUrl + flowType pkce owns the URL `code`
 * exchange during client initialize. getSession() awaits that initialize.
 * Do not duplicate the code exchange on this page.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();
  const { user, profile, isLoading, isProfileResolved } = useAuth();
  const [pkceReady, setPkceReady] = useState(false);
  const [recoveryEvent, setRecoveryEvent] = useState(() => passwordRecoveryEventWasSeen());
  const recoveryTypeAtMount = useRef(
    isPasswordRecoveryAuthCallback({
      search: searchParams,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
    }),
  );

  const oauthError = authCallbackHasOAuthError(searchParams);
  const redirectRaw = searchParams.get('redirect');
  const isDark = theme === 'dark';
  const passwordRecovery =
    recoveryTypeAtMount.current
    || recoveryEvent
    || isPasswordRecoveryAuthCallback({
      search: searchParams,
      hash: typeof window !== 'undefined' ? window.location.hash : '',
    });

  useEffect(() => {
    let cancelled = false;

    const waitForPkceInitialize = async () => {
      try {
        await supabase.auth.getSession();
      } catch {
        // Settled routing handles missing session. Do not surface OAuth payloads.
      }
      if (!cancelled) setPkceReady(true);
    };

    void waitForPkceInitialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecoveryEvent();
        setRecoveryEvent(true);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (oauthError) {
      navigate('/login', { replace: true });
      return;
    }

    if (!pkceReady || isLoading) return;
    if (passwordRecovery) {
      const next = resolveAuthCallbackPath({
        oauthError: false,
        passwordRecovery: true,
        sessionUser: user,
        profile,
        redirectRaw,
      });
      navigate(next, { replace: true });
      return;
    }
    if (user && !isProfileResolved) return;

    const next = resolveAuthCallbackPath({
      oauthError: false,
      sessionUser: user,
      profile,
      redirectRaw,
    });
    navigate(next, { replace: true });
  }, [
    oauthError,
    passwordRecovery,
    pkceReady,
    isLoading,
    isProfileResolved,
    user,
    profile,
    redirectRaw,
    navigate,
  ]);

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center ${
        isDark ? 'bg-[#07080a] text-zinc-100' : 'bg-[#ebe7ee] text-zinc-900'
      }`}
      aria-busy="true"
      aria-live="polite"
    >
      <Loader2
        className={`animate-spin mb-4 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
        size={28}
        aria-hidden="true"
      />
      <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-600'}`}>인증 처리 중</p>
    </div>
  );
}
