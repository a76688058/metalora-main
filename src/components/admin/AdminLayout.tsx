import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, LogOut, Menu, X, Users, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, adminUser, user } = useAuth();

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
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex">
      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">로그아웃 선택</h3>
            <p className="text-zinc-400 text-sm mb-6">어떤 세션을 종료하시겠습니까?</p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleLogout(true)}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors font-medium"
              >
                관리자 세션만 종료
              </button>
              {user && (
                <button
                  onClick={() => handleLogout(false)}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-medium"
                >
                  모든 세션 종료 (일반 계정 포함)
                </button>
              )}
              <button
                onClick={() => setShowLogoutModal(false)}
                className="w-full py-3 text-zinc-500 hover:text-white transition-colors text-sm"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 메뉴 토글 버튼 */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-zinc-900 rounded-md border border-zinc-800"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* 사이드바 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-zinc-900 border-r border-zinc-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="h-16 flex items-center justify-center border-b border-zinc-800">
            <h1 className="text-xl font-bold tracking-wider">METALORA 관리자</h1>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white text-black font-medium'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <item.icon size={20} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-zinc-800">
            <button
              onClick={() => setShowLogoutModal(true)}
              className="flex items-center gap-3 w-full px-4 py-3 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white hidden lg:block">관리자 대시보드</h2>
          <div className="flex items-center gap-4 ml-auto">
            <Link 
              to="/" 
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <span>스토어 바로가기</span>
              <LogOut size={16} className="rotate-180" />
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-black p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* 모바일 오버레이 */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsSidebarOpen(false);
          }}
        />
      )}
    </div>
  );
}
