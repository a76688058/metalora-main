import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigationType } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import ProfileComplete from './pages/ProfileComplete';
import AuthCallback from './pages/AuthCallback';
import PolicyPage from './pages/PolicyPage';
import LoadingScreen from './components/LoadingScreen';
import AdminBanner from './components/AdminBanner';
import ProfileOverlay from './components/ProfileOverlay';
const ProfileEditModal = lazy(() => import('./components/ProfileEditModal'));
const OrdersModal = lazy(() => import('./components/OrdersModal'));
const InquiryModal = lazy(() => import('./components/InquiryModal'));
import { ProductProvider } from './context/ProductContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { CartProvider, useCart } from './context/CartContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ShellOverlayProvider } from './context/ShellOverlayContext';
import { cn } from './lib/cn';

import CookieBanner from './components/CookieBanner';
import DocumentHead from './components/DocumentHead';
import AnalyticsRouteTracker from './components/AnalyticsRouteTracker';
import { isUsableMemberProfile, safeInternalPath } from './lib/authIntegrity';

const ProductDetail = lazy(() => import('./components/ProductDetail'));
const Login = lazy(() => import('./pages/Login'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFail = lazy(() => import('./pages/PaymentFail'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/AdminProducts'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const AdminCS = lazy(() => import('./pages/AdminCS'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminBestSellers = lazy(() => import('./pages/AdminBestSellers'));
const AdminBanners = lazy(() => import('./pages/AdminBanners'));
const WorkshopOverlay = lazy(() => import('./components/WorkshopOverlay'));
const Cart = lazy(() => import('./components/Cart'));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
      {children}
    </Suspense>
  );
}

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const lastPathname = useRef(pathname);

  useEffect(() => {
    if (navType === 'POP' || pathname === lastPathname.current) {
      lastPathname.current = pathname;
      return;
    }
    
    // Delay scroll to top to allow unmounting components to save state
    const timeoutId = setTimeout(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant'
      });
    }, 10);
    
    lastPathname.current = pathname;
    return () => clearTimeout(timeoutId);
  }, [pathname, navType]);

  return null;
}

function sessionProfile(
  user: { id: string } | null,
  adminUser: { id: string } | null,
  profile: { id?: string | null; user_custom_id?: string | null; is_admin?: boolean } | null,
  adminProfile: { id?: string | null; user_custom_id?: string | null; is_admin?: boolean } | null,
) {
  const sessionUser = user || adminUser;
  if (!sessionUser) return { sessionUser: null, resolved: null as typeof profile };
  if (profile?.id === sessionUser.id) return { sessionUser, resolved: profile };
  if (adminProfile?.id === sessionUser.id) return { sessionUser, resolved: adminProfile };
  return { sessionUser, resolved: profile || adminProfile };
}

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, profile, adminUser, adminProfile, isLoading, isProfileResolved } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const adminDeniedToastRef = useRef(false);
  const { sessionUser, resolved } = sessionProfile(user, adminUser, profile, adminProfile);
  const isAdmin = resolved?.is_admin === true;
  const usable = isUsableMemberProfile(resolved);
  const waitForAuth = isLoading;
  const waitForProfile = Boolean(sessionUser) && !isProfileResolved;

  useEffect(() => {
    if (waitForAuth || waitForProfile) return;
    if (requireAdmin && sessionUser && !isAdmin) {
      if (!adminDeniedToastRef.current) {
        adminDeniedToastRef.current = true;
        showToast('관리자 권한이 없습니다.', 'error');
      }
      return;
    }
    adminDeniedToastRef.current = false;
  }, [waitForAuth, waitForProfile, requireAdmin, sessionUser, isAdmin, showToast]);

  if (waitForAuth || waitForProfile) {
    return <LoadingScreen />;
  }

  if (requireAdmin) {
    if (!sessionUser) {
      return <Navigate to="/admin/login" replace />;
    }
    if (!isAdmin) {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  if (!sessionUser || !usable) {
    const next = safeInternalPath(`${location.pathname}${location.search}`);
    const loginTo = next === '/' ? '/login' : `/login?redirect=${encodeURIComponent(next)}`;
    return <Navigate to={loginTo} replace />;
  }

  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/product/:id" element={<LazyRoute><ProductDetail /></LazyRoute>} />
        <Route path="/login" element={<LazyRoute><Login /></LazyRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/policy/:type" element={<PolicyPage />} />

        <Route
          path="/profile/complete"
          element={<ProtectedRoute><ProfileComplete /></ProtectedRoute>}
        />
        
        {/* Member Only Routes */}
        <Route path="/payment/success" element={<ProtectedRoute><LazyRoute><PaymentSuccess /></LazyRoute></ProtectedRoute>} />
        <Route path="/payment/fail" element={<ProtectedRoute><LazyRoute><PaymentFail /></LazyRoute></ProtectedRoute>} />
        
        {/* Admin Routes - Protected */}
        <Route path="/admin/login" element={<LazyRoute><AdminLogin /></LazyRoute>} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminDashboard /></LazyRoute></ProtectedRoute>} />
        <Route path="/admin/products" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminProducts /></LazyRoute></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminOrders /></LazyRoute></ProtectedRoute>} />
        <Route path="/admin/cs" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminCS /></LazyRoute></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminUsers /></LazyRoute></ProtectedRoute>} />
        <Route path="/admin/best-sellers" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminBestSellers /></LazyRoute></ProtectedRoute>} />
        <Route path="/admin/banners" element={<ProtectedRoute requireAdmin={true}><LazyRoute><AdminBanners /></LazyRoute></ProtectedRoute>} />
      </Routes>
    </AnimatePresence>
  );
}

function Layout() {
  const location = useLocation();
  const { isProfileOpen, closeProfile, isWorkshopOpen, closeWorkshop, isProfileEditOpen, closeProfileEdit, isOrdersOpen, closeOrders, isInquiryOpen, closeInquiry } = useAuth();
  const { isCartOpen, closeCart } = useCart();
  const { theme } = useTheme();
  const [hasOpenedProfileEdit, setHasOpenedProfileEdit] = useState(false);
  const isAdminPage = location.pathname.startsWith('/admin');
  const isAuthPage = location.pathname === '/login' || location.pathname === '/profile/complete' || location.pathname === '/auth/callback';
  const isHome = location.pathname === '/';
  const showCustomerShell = !isAdminPage && !isAuthPage;

  useEffect(() => {
    if (isProfileEditOpen) setHasOpenedProfileEdit(true);
  }, [isProfileEditOpen]);

  const shouldRenderProfileEdit = hasOpenedProfileEdit || isProfileEditOpen;

  // Force dark mode for admin pages
  const currentTheme = isAdminPage ? 'dark' : theme;

  return (
    <div className={cn(
      'min-h-screen font-sans selection:bg-white selection:text-black flex flex-col transition-colors duration-300',
      showCustomerShell && 'overflow-x-clip',
      currentTheme === 'dark' ? 'bg-black text-white' : 'bg-white text-black',
    )}>
      <AnimatePresence>
        {isCartOpen && (
          <Suspense fallback={null}>
            <Cart key="cart-overlay" />
          </Suspense>
        )}
        {isProfileOpen && <ProfileOverlay key="profile-overlay" isOpen={isProfileOpen} onClose={closeProfile} />}
        {shouldRenderProfileEdit && (
          <Suspense fallback={null}>
            <ProfileEditModal key="profile-edit-modal" isOpen={isProfileEditOpen} onClose={closeProfileEdit} />
          </Suspense>
        )}
        {isOrdersOpen && (
          <Suspense fallback={null}>
            <OrdersModal key="orders-modal" isOpen={isOrdersOpen} onClose={closeOrders} />
          </Suspense>
        )}
        {isInquiryOpen && (
          <Suspense fallback={null}>
            <InquiryModal key="inquiry-modal" isOpen={isInquiryOpen} onClose={closeInquiry} />
          </Suspense>
        )}
        {isWorkshopOpen && (
          <Suspense fallback={null}>
            <WorkshopOverlay key="workshop-overlay" isOpen={isWorkshopOpen} onClose={closeWorkshop} />
          </Suspense>
        )}
      </AnimatePresence>
      <ScrollToTop />
      <AdminBanner />
      {!isAdminPage && !isAuthPage && <Header isHome={location.pathname === '/'} />}
      <div className="flex-1 flex flex-col">
        <main className={cn('flex-1', showCustomerShell && !isHome && 'shell-offset')}>
          <AnimatedRoutes />
        </main>
        {!isAdminPage && !isAuthPage && <Footer />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ProductProvider>
          <CartProvider>
            <ShellOverlayProvider>
              <ThemeProvider>
                <Router>
                  <DocumentHead />
                  <AnalyticsRouteTracker />
                  <Layout />
                </Router>
                <CookieBanner />
              </ThemeProvider>
            </ShellOverlayProvider>
          </CartProvider>
        </ProductProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
