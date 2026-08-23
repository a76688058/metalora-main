import React, { useEffect, useRef, lazy, Suspense } from 'react';
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
import Cart from './components/Cart';
import ProfileOverlay from './components/ProfileOverlay';
import ProfileEditModal from './components/ProfileEditModal';
import OrdersModal from './components/OrdersModal';
import InquiryModal from './components/InquiryModal';
import { ProductProvider } from './context/ProductContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { CartProvider, useCart } from './context/CartContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

import GlobalSplash from './components/GlobalSplash';
import CookieBanner from './components/CookieBanner';

const ProductDetail = lazy(() => import('./components/ProductDetail'));
const Collection = lazy(() => import('./pages/Collection'));
const BrandStory = lazy(() => import('./pages/BrandStory'));
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

// Middleware Protected Route Component
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, profile, adminUser, adminProfile, isLoading } = useAuth();
  const { showToast } = useToast();

  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (requireAdmin) {
    // Allow access if either adminProfile or regular profile has is_admin flag
    const isAdmin = adminProfile?.is_admin || profile?.is_admin;
    if (!isAdmin) {
      if (user || adminUser) {
        // Logged in but not an admin
        showToast('관리자 권한이 없습니다.', 'error');
        return <Navigate to="/" replace />;
      }
      return <Navigate to="/admin/login" replace />;
    }
    return <>{children}</>;
  }

  // Regular User Protection
  if (!user) {
    // If not logged in as user, but logged in as admin, allow browsing but might need user login for some actions
    // However, for protected user routes like /profile, we need a user session
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  const { profile, adminProfile } = useAuth();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/product/:id" element={<LazyRoute><ProductDetail /></LazyRoute>} />
        <Route path="/login" element={<LazyRoute><Login /></LazyRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/brand-story" element={<LazyRoute><BrandStory /></LazyRoute>} />
        <Route path="/collection" element={<LazyRoute><Collection /></LazyRoute>} />
        <Route path="/policy/:type" element={<PolicyPage />} />
        
        {/* Profile Complete - Skip for Admins */}
        <Route 
          path="/profile/complete" 
          element={
            (adminProfile?.is_admin || profile?.is_admin) ? 
            <Navigate to="/admin" replace /> : 
            <ProtectedRoute><ProfileComplete /></ProtectedRoute>
          } 
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
  const isAdminPage = location.pathname.startsWith('/admin');
  const isAuthPage = location.pathname === '/login' || location.pathname === '/profile/complete' || location.pathname === '/auth/callback';

  // Force dark mode for admin pages
  const currentTheme = isAdminPage ? 'dark' : theme;

  return (
    <div className={`min-h-screen font-sans selection:bg-white selection:text-black flex flex-col transition-colors duration-300 ${
      currentTheme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'
    }`}>
      <AnimatePresence>
        {isCartOpen && <Cart key="cart-overlay" />}
        {isProfileOpen && <ProfileOverlay key="profile-overlay" isOpen={isProfileOpen} onClose={closeProfile} />}
        {isProfileEditOpen && <ProfileEditModal key="profile-edit-modal" isOpen={isProfileEditOpen} onClose={closeProfileEdit} />}
        {isOrdersOpen && <OrdersModal key="orders-modal" isOpen={isOrdersOpen} onClose={closeOrders} />}
        {isInquiryOpen && <InquiryModal key="inquiry-modal" isOpen={isInquiryOpen} onClose={closeInquiry} />}
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
        <main className={`flex-1 ${!isAdminPage && !isAuthPage ? 'pt-28' : ''}`}>
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
            <ThemeProvider>
              <GlobalSplash />
              <Router>
                <Layout />
              </Router>
              <CookieBanner />
            </ThemeProvider>
          </CartProvider>
        </ProductProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
