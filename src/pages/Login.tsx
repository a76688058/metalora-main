import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginModal from '../components/LoginModal';
import { useAuth } from '../context/AuthContext';
import { isUsableMemberProfile, safeInternalPath } from '../lib/authIntegrity';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = safeInternalPath(searchParams.get('redirect'));
  const { user, profile, isLoading, isProfileResolved } = useAuth();

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
    <div className="min-h-screen bg-[#040D12] flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#040D12] via-[#2E073F]/20 to-[#040D12]">
      </div>
      
      <LoginModal 
        isOpen={true} 
        onClose={() => navigate('/')} 
        onSuccess={handleSuccess}
        redirectUrl={redirectUrl} 
      />
    </div>
  );
}
