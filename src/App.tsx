import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import Footer from './components/Footer';
import ProductGrid from './components/ProductGrid';
import ProductDetail from './components/ProductDetail';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import AdminCS from './pages/AdminCS';
import AdminUsers from './pages/AdminUsers';
import Login from './pages/Login';
import ProfileComplete from './pages/ProfileComplete';
import AuthCallback from './pages/AuthCallback';
import Profile from './pages/Profile';
import BrandStory from './pages/BrandStory';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFail from './pages/PaymentFail';
import AnisotropicHybrid from './components/AnisotropicHybrid';
import LoadingScreen from './components/LoadingScreen';
import NoPermission from './components/NoPermission';
import AdminBanner from './components/AdminBanner';
import { ProductProvider } from './context/ProductContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { CartProvider } from './context/CartContext';

// Middleware Protected Route Component
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, profile, adminUser, adminProfile, isLoading } = useAuth();
  const [isChecking, setIsChecking] = React.useState(true);
  
  React.useEffect(() => {
    if (!isLoading) {
      setIsChecking(false);
    }
  }, [isLoading]);

  if (isLoading || isChecking) {
    return <LoadingScreen />;
  }
  
  if (requireAdmin) {
    if (!adminUser || !adminProfile?.is_admin) {
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
        <Route path="/" element={<ProductGrid />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/brand-story" element={<BrandStory />} />
        <Route path="/anisotropic" element={<AnisotropicHybrid />} />
        
        {/* Profile Complete - Skip for Admins */}
        <Route 
          path="/profile/complete" 
          element={
            (adminProfile?.is_admin || profile?.is_admin) ? 
            <Navigate to="/admin" replace /> : 
            <ProtectedRoute><ProfileComplete /></ProtectedRoute>
          } 
        />
        
        <Route 
          path="/profile" 
          element={
            (adminProfile?.is_admin || profile?.is_admin) ? 
            <Navigate to="/admin" replace /> : 
            <ProtectedRoute><Profile /></ProtectedRoute>
          } 
        />
        
        {/* Member Only Routes */}
        <Route path="/cart" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
        <Route path="/inquiry" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
        <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
        <Route path="/payment/fail" element={<ProtectedRoute><PaymentFail /></ProtectedRoute>} />
        
        {/* Admin Routes - Protected */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/products" element={<ProtectedRoute requireAdmin={true}><AdminProducts /></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute requireAdmin={true}><AdminOrders /></ProtectedRoute>} />
        <Route path="/admin/cs" element={<ProtectedRoute requireAdmin={true}><AdminCS /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute requireAdmin={true}><AdminUsers /></ProtectedRoute>} />
      </Routes>
    </AnimatePresence>
  );
}

function Layout() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isAuthPage = location.pathname === '/login' || location.pathname === '/profile/complete' || location.pathname === '/auth/callback';

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-white selection:text-black flex flex-col">
      <AdminBanner />
      {!isAdminPage && !isAuthPage && <Header />}
      <main className={`flex-1 ${isAdminPage || isAuthPage ? '' : 'pt-20 md:pt-24'}`}>
        <AnimatedRoutes />
      </main>
      {!isAdminPage && !isAuthPage && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ProductProvider>
          <CartProvider>
            <Router>
              <Layout />
            </Router>
          </CartProvider>
        </ProductProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
