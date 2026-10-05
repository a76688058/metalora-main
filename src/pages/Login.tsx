import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AccountDrawer from '../components/auth/AccountDrawer';
import LoginModal from '../components/LoginModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isPendingC1SocialCustomer, isUsableMemberProfile, safeInternalPath } from '../lib/authIntegrity';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = safeInternalPath(searchParams.get('redirect'));
  const { user, profile, isLoading, isProfileResolved } = useAuth();
  const { theme } = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const isDark = theme === 'dark';
  const authReady = !isLoading && isProfileResolved;
  const pendingSocial = authReady && isPendingC1SocialCustomer(user, profile);
  const drawerOpen = !pendingSocial;
  const modalOpen = pendingSocial || authOpen;

  useEffect(() => {
    if (!authReady || !user || !isUsableMemberProfile(profile)) return;
    navigate(redirectUrl, { replace: true });
  }, [user, profile, authReady, navigate, redirectUrl]);

  const handleSuccess = () => {
    navigate(redirectUrl, { replace: true });
  };

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${
        isDark ? 'bg-[#07080a]' : 'bg-[#ebe7ee]'
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src="/logo/metalora-wordmark.webp"
          alt=""
          width={384}
          height={124}
          className={`w-[11rem] opacity-[0.14] object-contain ${isDark ? 'invert' : ''}`}
          referrerPolicy="no-referrer"
        />
      </div>

      <AccountDrawer
        isOpen={drawerOpen}
        inert={authOpen && !pendingSocial}
        onClose={() => navigate('/')}
        onRequestAuth={() => setAuthOpen(true)}
      />

      <LoginModal
        isOpen={modalOpen}
        layered={!pendingSocial}
        onClose={() => {
          if (pendingSocial) {
            navigate('/');
            return;
          }
          setAuthOpen(false);
        }}
        onSuccess={handleSuccess}
        redirectUrl={redirectUrl}
      />
    </div>
  );
}
