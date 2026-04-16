import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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

  // Optimistic load from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('metalora-auth-token');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.user) {
          setUser(parsed.user);
          setSession(parsed);
          setAdminUser(parsed.user);
          setAdminSession(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored session', e);
    }
  }, []);

  const fetchProfile = async (userId: string, isAdmin = false, retryCount = 0) => {
    const client = supabase;
    const setter = isAdmin ? setAdminProfile : setProfile;

    try {
      const { data, error } = await client
        .from('profiles')
        .select('id, user_custom_id, full_name, email, phone_number, zip_code, address, address_detail, avatar_url, total_spent, is_admin, role, created_at, updated_at')
        .eq('id', userId)
        .single();
        
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
      if (retryCount < 3) {
        // Exponential backoff for profile fetch: 1s, 2s, 4s
        const backoffDelay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => fetchProfile(userId, isAdmin, retryCount + 1), backoffDelay);
      } else {
        console.warn('Profile fetch failed after retries, keeping session active.', error);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    // Loading Timeout: 인증 확인이 2초 이상 걸리면 무조건 로딩 상태 해제
    const authTimeout = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 2000);

    const initializeSessions = async () => {
      try {
        const { data: { session: sess }, error: sessErr } = await supabase.auth.getSession();
        
        if (sessErr) {
          throw sessErr;
        } 
        
        if (sess && mounted) {
          setSession(sess);
          setUser(sess.user);
          setAdminSession(sess);
          setAdminUser(sess.user);
          
          fetchProfile(sess.user.id, false);
          fetchProfile(sess.user.id, true);
        }
      } catch (error: any) {
        // DO NOT clear user/session here. If network is down, keep optimistic state.
        console.warn("Session validation failed, keeping optimistic state:", error.message || error);
      } finally {
        if (mounted) {
          setIsLoading(false);
          clearTimeout(authTimeout);
        }
      }
    };

    initializeSessions();

    // Subscribe to Auth Changes (Unified)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!mounted) return;

      try {
        if (event === 'INITIAL_SESSION' && !sess) {
          setIsLoading(false);
          return;
        }
        
        if (event === 'SIGNED_OUT') {
          // Only clear session on explicit SIGNED_OUT event
          setSession(null);
          setUser(null);
          setProfile(null);
          setAdminSession(null);
          setAdminUser(null);
          setAdminProfile(null);
          setIsLoading(false);
          window.dispatchEvent(new CustomEvent('refresh-products'));
          window.location.replace('/');
          return;
        } 
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (sess) {
            setSession(sess);
            setUser(sess.user);
            setAdminSession(sess);
            setAdminUser(sess.user);
            
            fetchProfile(sess.user.id, false);
            fetchProfile(sess.user.id, true);
          }
        }
        // Ignore other events or null sessions to prevent accidental logouts on network drops
      } catch (error: any) {
        console.warn("Auth state change error, keeping optimistic state:", error.message || error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    });

    // Multi-tab sync using BroadcastChannel
    const channel = new BroadcastChannel('metalora-auth-sync');
    channel.onmessage = (event) => {
      if (event.data.type === 'SYNC_SESSION') {
        supabase.auth.getSession().then(({ data: { session: sess } }) => {
          if (sess && mounted) {
            setSession(sess);
            setUser(sess.user);
            setAdminSession(sess);
            setAdminUser(sess.user);
          }
        });
      }
    };

    // Window focus event to trigger silent refresh
    const handleFocus = () => {
      if (user) {
        // Silently refresh session in background without blocking UI
        supabase.auth.getSession().catch(e => console.warn('Silent refresh failed', e));
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      clearTimeout(authTimeout);
      authSub.unsubscribe();
      channel.close();
      window.removeEventListener('focus', handleFocus);
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
        setAdminSession(null);
        setAdminUser(null);
        setAdminProfile(null);
      } else {
        // Sign out both safely
        await supabase.auth.signOut().catch(() => {});
        
        // Hard Cleanup immediately after signOut
        // Preserve theme and language preference
        const savedTheme = localStorage.getItem('theme');
        const savedLang = localStorage.getItem('language');
        localStorage.clear();
        if (savedTheme) localStorage.setItem('theme', savedTheme);
        if (savedLang) localStorage.setItem('language', savedLang);
        
        sessionStorage.clear();
        
        setSession(null);
        setUser(null);
        setProfile(null);
        setAdminSession(null);
        setAdminUser(null);
        setAdminProfile(null);
        window.dispatchEvent(new CustomEvent('refresh-products'));
        
        // Notify other tabs
        const channel = new BroadcastChannel('metalora-auth-sync');
        channel.postMessage({ type: 'SYNC_SESSION' });
        channel.close();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
      setIsLoading(false);
      if (!options?.adminOnly) {
        // Force clear all browser storage but preserve theme and language
        const savedTheme = localStorage.getItem('theme');
        const savedLang = localStorage.getItem('language');
        localStorage.clear();
        if (savedTheme) localStorage.setItem('theme', savedTheme);
        if (savedLang) localStorage.setItem('language', savedLang);
        
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
        throw error;
      }

      if (sess) {
        setSession(sess);
        setUser(sess.user);
        await fetchProfile(sess.user.id, false);
      }
    } catch (err) {
      console.warn('refreshSession failed, keeping optimistic state:', err);
    }
  };

  const value = React.useMemo(() => ({ 
    session, user, profile, 
    adminSession, adminUser, adminProfile,
    isLoading, isLoggingOut, isProfileOpen, isWorkshopOpen, isProfileEditOpen, isOrdersOpen, isInquiryOpen,
    signOut, refreshProfile, refreshSession,
    openProfile, closeProfile, openWorkshop, closeWorkshop,
    openProfileEdit, closeProfileEdit, openOrders, closeOrders,
    openInquiry, closeInquiry
  }), [
    session, user, profile, 
    adminSession, adminUser, adminProfile,
    isLoading, isLoggingOut, isProfileOpen, isWorkshopOpen, isProfileEditOpen, isOrdersOpen, isInquiryOpen
  ]);

  return (
    <AuthContext.Provider value={value}>
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
