import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useToast } from './ToastContext';

interface Profile {
  id: string;
  user_custom_id: string | null;
  full_name: string | null;
  email?: string | null;
  phone_number: string | null;
  zip_code: string | null;
  address: string | null;
  address_detail: string | null;
  avatar_url?: string | null;
  total_spent: number;
  is_admin: boolean;
  role?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  // User Session
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  
  // Admin Session (Isolated)
  adminSession: Session | null;
  adminUser: User | null;
  adminProfile: Profile | null;
  
  isLoading: boolean;
  isLoggingOut: boolean;
  isProfileOpen: boolean;
  isWorkshopOpen: boolean;
  isProfileEditOpen: boolean;
  isOrdersOpen: boolean;
  isInquiryOpen: boolean;
  
  signOut: (options?: { adminOnly?: boolean }) => Promise<void>;
  refreshProfile: (isAdmin?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
  openProfile: () => void;
  closeProfile: () => void;
  openWorkshop: () => void;
  closeWorkshop: () => void;
  openProfileEdit: () => void;
  closeProfileEdit: () => void;
  openOrders: () => void;
  closeOrders: () => void;
  openInquiry: () => void;
  closeInquiry: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  
  // User State
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  
  // Admin State
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWorkshopOpen, setIsWorkshopOpen] = useState(false);
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);

  const openProfile = () => setIsProfileOpen(true);
  const closeProfile = () => setIsProfileOpen(false);
  const openWorkshop = () => setIsWorkshopOpen(true);
  const closeWorkshop = () => setIsWorkshopOpen(false);
  const openProfileEdit = () => setIsProfileEditOpen(true);
  const closeProfileEdit = () => setIsProfileEditOpen(false);
  const openOrders = () => setIsOrdersOpen(true);
  const closeOrders = () => setIsOrdersOpen(false);
  const openInquiry = () => setIsInquiryOpen(true);
  const closeInquiry = () => setIsInquiryOpen(false);

  const fetchProfile = async (userId: string, isAdmin = false) => {
    const client = isAdmin ? supabaseAdmin : supabase;
    const setter = isAdmin ? setAdminProfile : setProfile;

    let timeoutId: NodeJS.Timeout;

    try {
      const fetchPromise = client
        .from('profiles')
        .select('*, address_detail')
        .eq('id', userId)
        .single();
        
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Profile fetch timeout')), 30000);
      });

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      clearTimeout(timeoutId!);

      if (error) {
        if (error.code === 'PGRST116') {
          setter(null);
          return;
        }
        throw error;
      }
      
      if (data) {
        setter(data);
      }
    } catch (error: any) {
      clearTimeout(timeoutId!);
      if (error.message === 'Profile fetch timeout') {
        console.warn('Profile fetch timed out, but keeping session active.');
      } else {
        console.error('Profile fetch error:', error);
      }
    }
  };

  useEffect(() => {
    // Loading Timeout: 인증 확인이 2초 이상 걸리면 무조건 로딩 상태 해제
    const authTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    const initializeSessions = async () => {
      try {
        // Initialize Session (Unified)
        const { data: { session: sess }, error: sessErr } = await supabase.auth.getSession();
        
        if (sessErr) {
          const errMsg = sessErr.message || String(sessErr);
          if (errMsg.includes('Lock was stolen')) {
            console.warn('Session Init: Lock was stolen. Skipping.');
          } else if (errMsg.includes('Invalid Refresh Token') || errMsg.includes('Refresh Token Not Found')) {
            console.warn('Session Init: Invalid refresh token. Clearing session.');
            setSession(null);
            setUser(null);
            setProfile(null);
            setAdminSession(null);
            setAdminUser(null);
            setAdminProfile(null);
          } else {
            throw sessErr;
          }
        } else {
          // Set both user and admin states from the same session
          setSession(sess);
          setUser(sess?.user ?? null);
          setAdminSession(sess);
          setAdminUser(sess?.user ?? null);
          
          // Manually set session for admin client if it has a different storage key
          if (sess) {
            await supabaseAdmin.auth.setSession(sess);
          } else {
            await supabaseAdmin.auth.signOut().catch(() => {});
          }
          
          if (sess?.user) {
            try {
              // Fetch profile for both user and admin states
              await Promise.all([
                fetchProfile(sess.user.id, false),
                fetchProfile(sess.user.id, true)
              ]);
            } catch (e) {
              console.error('Ghost session detected during initialization:', e);
            }
          }
        }
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('Lock was stolen')) {
          console.warn('Session initialization caught lock stolen error. Skipping cleanup.');
          return;
        }
        
        if (errorMsg.includes('Invalid Refresh Token') || errorMsg.includes('Refresh Token Not Found')) {
          console.warn("Session expired or invalid refresh token. Clearing session.");
        } else {
          console.error("Session validation failed:", error);
        }
        
        // Only clear if it's a critical auth failure
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
        clearTimeout(authTimeout);
      }
    };

    initializeSessions();

    // Subscribe to Auth Changes (Unified)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      try {
        if (event === 'INITIAL_SESSION' && !sess) {
          setIsLoading(false);
          return;
        }
        
        // Update both user and admin states
        setSession(sess);
        setUser(sess?.user ?? null);
        setAdminSession(sess);
        setAdminUser(sess?.user ?? null);
        
        // Sync admin client
        if (sess) {
          await supabaseAdmin.auth.setSession(sess).catch(() => {});
        } else {
          await supabaseAdmin.auth.signOut().catch(() => {});
        }
        
        if (event === 'SIGNED_OUT' || !sess) {
          setProfile(null);
          setAdminProfile(null);
          setIsLoading(false);
          window.dispatchEvent(new CustomEvent('refresh-products'));
          
          if (event === 'SIGNED_OUT') {
            window.location.replace('/');
            return;
          }
        } else if (sess?.user) {
          try {
            await Promise.all([
              fetchProfile(sess.user.id, false),
              fetchProfile(sess.user.id, true)
            ]);
          } catch (e) {
            console.error('Ghost session detected during auth state change:', e);
            setProfile(null);
            setAdminProfile(null);
          }
        }
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('Lock was stolen')) {
          console.warn('Auth state change caught lock stolen error. Skipping cleanup.');
          return;
        }

        if (errorMsg.includes('Invalid Refresh Token') || errorMsg.includes('Refresh Token Not Found')) {
          console.warn("Auth state change: Invalid refresh token. Clearing session.");
        } else {
          console.error("Auth state change error:", error);
        }
        
        setSession(null);
        setUser(null);
        setProfile(null);
        setAdminSession(null);
        setAdminUser(null);
        setAdminProfile(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(authTimeout);
      authSub.unsubscribe();
    };
  }, []);

  // Inactivity Logic (Admin Only)
  useEffect(() => {
    let inactivityTimeout: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 30 * 60 * 1000;

    const resetInactivityTimer = () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      if (adminUser && adminProfile?.is_admin) {
        inactivityTimeout = setTimeout(() => {
          signOut({ adminOnly: true });
          showToast("보안을 위해 장시간 미활동으로 관리자 세션이 만료되었습니다.", 'info');
        }, INACTIVITY_LIMIT);
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    if (adminUser && adminProfile?.is_admin) {
      activityEvents.forEach(event => window.addEventListener(event, resetInactivityTimer));
      resetInactivityTimer();
    }

    return () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      activityEvents.forEach(event => window.removeEventListener(event, resetInactivityTimer));
    };
  }, [adminUser, adminProfile]);

  const signOut = async (options?: { adminOnly?: boolean }) => {
    setIsLoggingOut(true);
    (window as any).isLoggingOutFlag = true; // Set global flag for ProductContext
    try {
      if (options?.adminOnly) {
        await supabaseAdmin.auth.signOut().catch(() => {});
        setAdminSession(null);
        setAdminUser(null);
        setAdminProfile(null);
        showToast('관리자 세션이 종료되었습니다.', 'success');
      } else {
        // Sign out both safely
        await Promise.all([
          supabase.auth.signOut().catch(() => {}),
          supabaseAdmin.auth.signOut().catch(() => {})
        ]);
        
        // Hard Cleanup immediately after signOut
        localStorage.clear();
        sessionStorage.clear();
        
        setSession(null);
        setUser(null);
        setProfile(null);
        setAdminSession(null);
        setAdminUser(null);
        setAdminProfile(null);
        window.dispatchEvent(new CustomEvent('refresh-products'));
        showToast('모든 세션이 종료되었습니다.', 'success');
      }
    } catch (error) {
      showToast('로그아웃 중 에러가 발생했습니다.', 'error');
    } finally {
      setIsLoggingOut(false);
      setIsLoading(false);
      if (!options?.adminOnly) {
        // Force clear all browser storage
        localStorage.clear();
        sessionStorage.clear();
        // Clear all cookies
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        // Safe SignOut: Reload or redirect to root
        if (window.location.pathname === '/') {
          window.location.reload();
        } else {
          window.location.href = '/';
        }
      }
    }
  };

  const refreshProfile = async (isAdmin = false) => {
    const u = isAdmin ? adminUser : user;
    if (u) await fetchProfile(u.id, isAdmin);
  };

  const refreshSession = async () => {
    try {
      const { data: { session: sess }, error } = await supabase.auth.getSession();
      
      if (error) {
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('Lock was stolen')) {
          console.warn('refreshSession: Lock was stolen. Skipping.');
          return;
        }
        if (errorMsg.includes('Invalid Refresh Token') || errorMsg.includes('Refresh Token Not Found')) {
          console.warn('refreshSession: Invalid refresh token. Clearing session.');
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }
        throw error;
      }

      setSession(sess);
      setUser(sess?.user ?? null);
      
      // Sync admin client
      if (sess) {
        await supabaseAdmin.auth.setSession(sess).catch(() => {});
      } else {
        await supabaseAdmin.auth.signOut().catch(() => {});
      }
      
      if (sess?.user) {
        await fetchProfile(sess.user.id, false);
      }
    } catch (err) {
      if (String(err).includes('Lock was stolen')) {
        console.warn('refreshSession caught lock stolen error:', err);
        return;
      }
      console.error('refreshSession error:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      session, user, profile, 
      adminSession, adminUser, adminProfile,
      isLoading, isLoggingOut, isProfileOpen, isWorkshopOpen, isProfileEditOpen, isOrdersOpen, isInquiryOpen,
      signOut, refreshProfile, refreshSession,
      openProfile, closeProfile, openWorkshop, closeWorkshop,
      openProfileEdit, closeProfileEdit, openOrders, closeOrders,
      openInquiry, closeInquiry
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
