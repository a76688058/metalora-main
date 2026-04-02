import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginModal from '../components/LoginModal';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';
  const { user, profile, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user && profile) {
      navigate(redirectUrl, { replace: true });
    }
  }, [user, profile, isLoading, navigate, redirectUrl]);

  return (
    <div className="min-h-screen bg-[#040D12] flex items-center justify-center relative overflow-hidden">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#040D12] via-[#2E073F]/20 to-[#040D12]">
      </div>
      
      <LoginModal 
        isOpen={true} 
        onClose={() => navigate('/')} 
        onSuccess={() => navigate(redirectUrl, { replace: true })}
        redirectUrl={redirectUrl} 
      />
    </div>
  );
}
