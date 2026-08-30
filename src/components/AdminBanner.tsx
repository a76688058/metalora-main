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
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 border-b border-border-subtle bg-surface-elevated px-4 py-1.5 text-center type-metadata text-text-secondary">
      <ShieldCheck size={14} className="shrink-0 text-text-tertiary" aria-hidden />
      <span>관리자 권한으로 접속 중입니다.</span>
      <Link
        to="/admin"
        className="ml-2 inline-flex items-center gap-1 text-text-primary underline decoration-border-strong underline-offset-2 hover:text-accent"
      >
        관리자 대시보드로 이동 <ArrowRight size={12} aria-hidden />
      </Link>
    </div>
  );
}
