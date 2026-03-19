import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function AdminBanner() {
  const { adminProfile } = useAuth();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  // Only show on front store if admin is logged in
  if (!adminProfile?.is_admin || isAdminPage) return null;

  return (
    <div className="bg-indigo-600 text-white py-1.5 px-4 text-center text-xs font-medium flex items-center justify-center gap-2 sticky top-0 z-[60] shadow-md">
      <ShieldCheck size={14} />
      <span>관리자 권한으로 접속 중입니다.</span>
      <Link to="/admin" className="underline hover:text-indigo-200 flex items-center gap-1 ml-2">
        관리자 대시보드로 이동 <ArrowRight size={12} />
      </Link>
    </div>
  );
}
