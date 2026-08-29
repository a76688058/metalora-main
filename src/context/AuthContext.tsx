import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
  /** true once profile fetch settled for current session (or no session). */
  isProfileResolved: boolean;
  isLoggingOut: boolean;
  isProfileOpen: boolean;
  isWorkshopOpen: boolean;
  isProfileEditOpen: boolean;
  isOrdersOpen: boolean;
  isInquiryOpen: boolean;
  
  signOut: () => Promise<void>;
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

  // Dedupe same-user profile reads across initializeSessions + SIGNED_IN races / tab return.
  const loadedProfileUserIdRef = useRef<string | null>(null);
  /** In-flight profile fetch promise (same user shares one; always settles isProfileResolved). */
  const profileFetchPromiseRef = useRef<Promise<void> | null>(null);
  const profileFetchUserIdRef = useRef<string | null>(null);
  /** false until we know profile state for the current session (loaded / missing / failed). */
  const [isProfileResolved, setIsProfileResolved] = useState(false);

  // Optimistic load from local storage (session/user only — never is_admin)
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

  // Single DB read — same profiles row feeds both profile and adminProfile state.
  // Always settles isProfileResolved (success / no row / error). Safe to await outside auth callbacks.
  const fetchProfile = async (
    userId: string,
    options: { force?: boolean } = {},
  ): Promise<void> => {
    const force = options.force === true;

    if (!force && loadedProfileUserIdRef.current === userId) {
      setIsProfileResolved(true);
      return;
    }

    if (
      !force &&
      profileFetchPromiseRef.current &&
      profileFetchUserIdRef.current === userId
    ) {
      return profileFetchPromiseRef.current;
    }

    setIsProfileResolved(false);
    profileFetchUserIdRef.current = userId;

    const run = async () => {
      try {
        let lastError: any = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
          }
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();

            if (error) {
              if (error.code === 'PGRST116') {
                setProfile(null);
                setAdminProfile(null);
                loadedProfileUserIdRef.current = null;
                return;
              }
              throw error;
            }

            if (data) {
              setProfile(data);
              setAdminProfile(data);
              loadedProfileUserIdRef.current = userId;
            } else {
              setProfile(null);
              setAdminProfile(null);
              loadedProfileUserIdRef.current = null;
            }
            return;
          } catch (error: any) {
            lastError = error;
          }
        }
        console.warn('Profile fetch failed after retries, keeping session active.', lastError);
        if (loadedProfileUserIdRef.current === userId) {
          loadedProfileUserIdRef.current = null;
        }
      } finally {
        // Invariant: authenticated profile attempt always resolves (admin / non-admin / missing / error).
        setIsProfileResolved(true);
        if (profileFetchUserIdRef.current === userId) {
          profileFetchPromiseRef.current = null;
          profileFetchUserIdRef.current = null;
        }
      }
    };

    const promise = run();
    profileFetchPromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    let mounted = true;

    const initializeSessions = async () => {
      try {
        // Do not await profile (or other long work) inside onAuthStateChange — that deadlocks getSession.
        const { data: { session: sess }, error: sessErr } = await supabase.auth.getSession();

        if (sessErr) {
          throw sessErr;
        }

        if (!mounted) return;

        if (sess) {
          setSession(sess);
          setUser(sess.user);
          setAdminSession(sess);
          setAdminUser(sess.user);
          await fetchProfile(sess.user.id);
        } else {
          setIsProfileResolved(true);
        }
      } catch (error: any) {
        console.warn("Session validation failed, keeping optimistic state:", error.message || error);
        if (mounted) setIsProfileResolved(true);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initializeSessions();

    // Subscribe to Auth Changes (Unified)
    // IMPORTANT: callback must stay sync and must NOT start Supabase async I/O.
    // Even `void fetchProfile()` inside the callback can deadlock auth locks —
    // defer profile fetch to a macrotask after the callback returns (setTimeout 0).
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;

      try {
        if (event === 'INITIAL_SESSION') {
          if (!sess) {
            setIsProfileResolved(true);
            setIsLoading(false);
          }
          // Session present: initializeSessions owns getSession + fetchProfile.
          return;
        }

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setAdminSession(null);
          setAdminUser(null);
          setAdminProfile(null);
          loadedProfileUserIdRef.current = null;
          profileFetchPromiseRef.current = null;
          profileFetchUserIdRef.current = null;
          setIsProfileResolved(true);
          setIsLoading(false);
          window.dispatchEvent(new CustomEvent('refresh-products'));
          window.location.replace('/');
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (sess) {
            setSession(sess);
            setUser(sess.user);
            setAdminSession(sess);
            setAdminUser(sess.user);
          }
          return;
        }

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          if (sess) {
            setSession(sess);
            setUser(sess.user);
            setAdminSession(sess);
            setAdminUser(sess.user);
            // Mark unresolved immediately; start Supabase I/O only after callback returns.
            setIsProfileResolved(false);
            const userId = sess.user.id;
            const force = event === 'USER_UPDATED';
            setTimeout(() => {
              if (!mounted) return;
              void fetchProfile(userId, { force }).finally(() => {
                if (mounted) setIsLoading(false);
              });
            }, 0);
          }
          return;
        }
      } catch (error: any) {
        console.warn("Auth state change error, keeping optimistic state:", error.message || error);
        setIsProfileResolved(true);
        setIsLoading(false);
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
            void fetchProfile(sess.user.id);
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
          signOut();
          showToast("보안을 위해 장시간 미활동으로 세션이 만료되었습니다.", 'info');
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

  const signOut = async () => {
    setIsLoggingOut(true);
    (window as any).isLoggingOutFlag = true; // Set global flag for ProductContext
    try {
      await supabase.auth.signOut().catch(() => {});

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
      loadedProfileUserIdRef.current = null;
      profileFetchPromiseRef.current = null;
      profileFetchUserIdRef.current = null;
      setIsProfileResolved(true);
      window.dispatchEvent(new CustomEvent('refresh-products'));

      const channel = new BroadcastChannel('metalora-auth-sync');
      channel.postMessage({ type: 'SYNC_SESSION' });
      channel.close();

      showToast('로그아웃되었습니다.', 'success');
    } catch (error) {
      // Error handling without toast
    } finally {
      setIsLoggingOut(false);
      setIsLoading(false);

      const savedTheme = localStorage.getItem('theme');
      const savedLang = localStorage.getItem('language');
      localStorage.clear();
      if (savedTheme) localStorage.setItem('theme', savedTheme);
      if (savedLang) localStorage.setItem('language', savedLang);

      sessionStorage.clear();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      if (window.location.pathname === '/') {
        window.location.reload();
      } else {
        window.location.href = '/';
      }
    }
  };

  const refreshProfile = async (isAdmin = false) => {
    const u = isAdmin ? adminUser : user;
    if (u) await fetchProfile(u.id, { force: true });
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
        await fetchProfile(sess.user.id);
      }
    } catch (err) {
      console.warn('refreshSession failed, keeping optimistic state:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      session, user, profile, 
      adminSession, adminUser, adminProfile,
      isLoading, isProfileResolved, isLoggingOut, isProfileOpen, isWorkshopOpen, isProfileEditOpen, isOrdersOpen, isInquiryOpen,
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
