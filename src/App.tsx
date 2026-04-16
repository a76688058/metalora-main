import React, { useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigationType } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import Footer from './components/Footer';

// Lazy load pages
const Home = lazy(() => import('./pages/Home'));
const ProductDetail = lazy(() => import('./components/ProductDetail'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/AdminProducts'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const AdminCS = lazy(() => import('./pages/AdminCS'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminBestSellers = lazy(() => import('./pages/AdminBestSellers'));
const AdminBanners = lazy(() => import('./pages/AdminBanners'));
const Login = lazy(() => import('./pages/Login'));
const ProfileComplete = lazy(() => import('./pages/ProfileComplete'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const BrandStory = lazy(() => import('./pages/BrandStory'));
const Collection = lazy(() => import('./pages/Collection'));
const WorkshopDetail = lazy(() => import('./pages/WorkshopDetail'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFail = lazy(() => import('./pages/PaymentFail'));

import LoadingScreen from './components/LoadingScreen';
import AdminBanner from './components/AdminBanner';
import PresenceTracker from './components/PresenceTracker';
import Cart from './components/Cart';
import ProfileOverlay from './components/ProfileOverlay';
import ProfileEditModal from './components/ProfileEditModal';
import OrdersModal from './components/OrdersModal';
import InquiryModal from './components/InquiryModal';
import WorkshopOverlay from './components/WorkshopOverlay';
import { ProductProvider } from './context/ProductContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { CartProvider, useCart } from './context/CartContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';

import GlobalSplash from './components/GlobalSplash';
import CookieBanner from './components/CookieBanner';
import ErrorBoundary from './components/ErrorBoundary';

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

  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (requireAdmin) {
    // Allow access if either adminProfile or regular profile has is_admin flag
    const isAdmin = adminProfile?.is_admin || profile?.is_admin;
    if (!isAdmin) {
      if (user || adminUser) {
        // Logged in but not an admin
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
      <Suspense fallback={<LoadingScreen />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/workshop/detail" element={<WorkshopDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/brand-story" element={<BrandStory />} />
          <Route path="/collection" element={<Collection />} />
          
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
          <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
          <Route path="/payment/fail" element={<ProtectedRoute><PaymentFail /></ProtectedRoute>} />
          
          {/* Admin Routes - Protected */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/products" element={<ProtectedRoute requireAdmin={true}><AdminProducts /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute requireAdmin={true}><AdminOrders /></ProtectedRoute>} />
          <Route path="/admin/cs" element={<ProtectedRoute requireAdmin={true}><AdminCS /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requireAdmin={true}><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/best-sellers" element={<ProtectedRoute requireAdmin={true}><AdminBestSellers /></ProtectedRoute>} />
          <Route path="/admin/banners" element={<ProtectedRoute requireAdmin={true}><AdminBanners /></ProtectedRoute>} />
        </Routes>
      </Suspense>
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
      <ErrorBoundary>
        <AnimatePresence>
          {isCartOpen && <Cart key="cart-overlay" />}
          {isProfileOpen && <ProfileOverlay key="profile-overlay" isOpen={isProfileOpen} onClose={closeProfile} />}
          {isProfileEditOpen && <ProfileEditModal key="profile-edit-modal" isOpen={isProfileEditOpen} onClose={closeProfileEdit} />}
          {isOrdersOpen && <OrdersModal key="orders-modal" isOpen={isOrdersOpen} onClose={closeOrders} />}
          {isInquiryOpen && <InquiryModal key="inquiry-modal" isOpen={isInquiryOpen} onClose={closeInquiry} />}
          {isWorkshopOpen && <WorkshopOverlay key="workshop-overlay" isOpen={isWorkshopOpen} onClose={closeWorkshop} />}
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
      </ErrorBoundary>
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
              <PresenceTracker />
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
