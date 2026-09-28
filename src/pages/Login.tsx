import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginModal from '../components/LoginModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isUsableMemberProfile, safeInternalPath } from '../lib/authIntegrity';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = safeInternalPath(searchParams.get('redirect'));
  const { user, profile, isLoading, isProfileResolved } = useAuth();
  const { theme } = useTheme();

  useEffect(() => {
    if (!isLoading && isProfileResolved && user && isUsableMemberProfile(profile)) {
      if (profile.is_admin) {
        navigate('/admin', { replace: true });
      } else {
        navigate(redirectUrl, { replace: true });
      }
    }
  }, [user, profile, isLoading, isProfileResolved, navigate, redirectUrl]);

  const handleSuccess = () => {
    if (!profile) return;
    if (profile.is_admin) {
      navigate('/admin', { replace: true });
    } else {
      navigate(redirectUrl, { replace: true });
    }
  };

  return (
    <div
      className={`min-h-screen ${
        theme === 'dark'
          ? 'bg-[#07080a]'
          : 'bg-[#ebe7ee]'
      }`}
    >
      <LoginModal
        isOpen={true}
        onClose={() => navigate('/')}
        onSuccess={handleSuccess}
        redirectUrl={redirectUrl}
      />
    </div>
  );
}
