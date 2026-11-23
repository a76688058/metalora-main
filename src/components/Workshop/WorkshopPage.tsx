import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { WorkshopStudio } from './WorkshopStudio';

export default function WorkshopPage() {
  const navigate = useNavigate();
  const { user, adminUser, isLoading, requestCustomAccess } = useAuth();
  const askedRef = useRef(false);
  const allowed = Boolean(user || adminUser);

  useEffect(() => {
    if (isLoading || allowed || askedRef.current) return;
    askedRef.current = true;
    requestCustomAccess();
  }, [isLoading, allowed, requestCustomAccess]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6 text-center text-sm text-text-secondary">
        맞춤 제작을 시작하려면 로그인해 주세요.
      </div>
    );
  }

  return <WorkshopStudio onClose={() => navigate('/')} />;
}
