import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, LogOut, Menu, X, Users, MessageSquare, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const handleLogout = async (adminOnly = true) => {
    await signOut({ adminOnly });
    setShowLogoutModal(false);
    if (adminOnly) {
      navigate('/admin/login');
    } else {
      navigate('/');
    }
  };

  const menuItems = [
    { name: '대시보드', path: '/admin', icon: LayoutDashboard },
    { name: '회원 관리', path: '/admin/users', icon: Users },
    { name: '상품 관리', path: '/admin/products', icon: Package },
    { name: '주문 관리', path: '/admin/orders', icon: ShoppingCart },
    { name: 'CS 관리', path: '/admin/cs', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-white font-sans flex selection:bg-purple-500/30 selection:text-purple-200">
      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0A0A0A] border border-white/10 rounded-[32px] p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,1)]"
            >
              <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">로그아웃</h3>
              <p className="text-zinc-500 text-sm mb-8 font-medium">종료할 세션을 선택해 주세요.</p>
              
              <div className="space-y-4">
                <button
                  onClick={() => handleLogout(true)}
                  className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl transition-all font-bold border border-white/5"
                >
                  관리자 세션만 종료
                </button>
                {user && (
                  <button
                    onClick={() => handleLogout(false)}
                    className="w-full py-4 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-2xl transition-all font-bold border border-red-500/20"
                  >
                    모든 세션 종료
                  </button>
                )}
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full py-4 text-zinc-600 hover:text-white transition-colors text-sm font-bold"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 모바일 메뉴 토글 버튼 */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-zinc-900/80 backdrop-blur-md rounded-xl border border-white/10 shadow-xl"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* 사이드바 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-[#050505] border-r border-white/5 transform transition-transform duration-500 ease-[0.16, 1, 0.3, 1] lg:translate-x-0 lg:static lg:inset-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="h-24 flex items-center px-8">
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
              METALORA <span className="text-purple-500">ADMIN</span>
            </h1>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1.5">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 group ${
                    isActive
                      ? 'bg-white text-black font-bold shadow-[0_10px_20px_rgba(255,255,255,0.1)]'
                      : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-white'
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <item.icon size={22} className={isActive ? 'text-black' : 'group-hover:text-purple-500 transition-colors'} />
                  <span className="text-base tracking-tight">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-6">
            <button
              onClick={() => setShowLogoutModal(true)}
              className="flex items-center gap-4 w-full px-6 py-4 text-zinc-600 hover:text-red-400 hover:bg-red-500/5 rounded-2xl transition-all duration-300 border border-transparent hover:border-red-500/10"
            >
              <LogOut size={20} />
              <span className="font-bold text-sm tracking-tight">로그아웃</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#000000]">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 bg-black/60 backdrop-blur-xl border-b border-white/5 px-8 py-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              {menuItems.find(item => item.path === location.pathname)?.name || '관리자'}
            </h2>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <Link 
              to="/" 
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-full text-xs font-bold transition-all border border-white/5 flex items-center gap-2"
            >
              <span>스토어 바로가기</span>
              <Globe size={14} />
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* 모바일 오버레이 */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
