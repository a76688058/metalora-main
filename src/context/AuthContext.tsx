import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastContext';
import type { Profile } from '../types/database';
import {
  AUTH_SYNC_CHANNEL,
  PROFILE_COLUMNS,
  broadcastAuthLogout,
  clearPersistedAuthToken,
} from '../lib/authIntegrity';

interface SignOutOptions {
  redirect?: boolean;
  toast?: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;

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
  pendingCustomAccess: boolean;

  signOut: (options?: SignOutOptions) => Promise<void>;
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
  requestCustomAccess: () => void;
  clearPendingCustomAccess: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

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
  const [pendingCustomAccess, setPendingCustomAccess] = useState(false);

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

  const loadedProfileUserIdRef = useRef<string | null>(null);
  const profileFetchPromiseRef = useRef<Promise<void> | null>(null);
  const profileFetchUserIdRef = useRef<string | null>(null);
  const [isProfileResolved, setIsProfileResolved] = useState(false);
  const droppingOrphanRef = useRef(false);
  const signingOutRef = useRef(false);
  const hadSessionUserRef = useRef(false);
  const customContinuationLock = useRef(false);

  const clearPendingCustomAccess = useCallback(() => {
    setPendingCustomAccess(false);
    customContinuationLock.current = false;
  }, []);

  const requestCustomAccess = useCallback(() => {
    if (user || adminUser) {
      setPendingCustomAccess(false);
      customContinuationLock.current = false;
      setIsWorkshopOpen(true);
      return;
    }
    customContinuationLock.current = false;
    setPendingCustomAccess(true);
  }, [user, adminUser]);

  const clearReactAuthState = () => {
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
    setPendingCustomAccess(false);
    customContinuationLock.current = false;
    hadSessionUserRef.current = false;
  };

  const applyVerifiedSession = (sess: Session) => {
    setSession(sess);
    setUser(sess.user);
    setAdminSession(sess);
    setAdminUser(sess.user);
  };

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
        let lastError: { code?: string } | null = null;
        let sawMissingRow = false;

        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
          }
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select(PROFILE_COLUMNS)
              .eq('id', userId)
              .maybeSingle();

            if (error) {
              if (error.code === 'PGRST116') {
                sawMissingRow = true;
                lastError = error;
                continue;
              }
              throw error;
            }

            if (data) {
              setProfile(data);
              setAdminProfile(data);
              loadedProfileUserIdRef.current = userId;
              return;
            }

            sawMissingRow = true;
            lastError = { code: 'PGRST116' };
          } catch (error: any) {
            lastError = error;
          }
        }

        if (sawMissingRow && !droppingOrphanRef.current && !signingOutRef.current) {
          droppingOrphanRef.current = true;
          console.warn('Profile row missing after retries; dropping session.', lastError);
          setProfile(null);
          setAdminProfile(null);
          loadedProfileUserIdRef.current = null;
          await supabase.auth.signOut().catch(() => {});
          clearPersistedAuthToken();
          droppingOrphanRef.current = false;
          return;
        }

        console.warn('Profile fetch failed after retries, keeping last known profile if any.', lastError);
        if (loadedProfileUserIdRef.current === userId && lastError) {
          loadedProfileUserIdRef.current = null;
        }
      } finally {
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
        const { data: { session: sess }, error: sessErr } = await supabase.auth.getSession();

        if (sessErr) {
          throw sessErr;
        }

        if (!mounted) return;

        if (sess) {
          applyVerifiedSession(sess);
          await fetchProfile(sess.user.id);
        } else {
          clearReactAuthState();
          clearPersistedAuthToken();
        }
      } catch (error: any) {
        console.warn('Session validation failed, clearing unverified auth state:', error.message || error);
        if (mounted) {
          clearReactAuthState();
          clearPersistedAuthToken();
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initializeSessions();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;

      try {
        if (event === 'INITIAL_SESSION') {
          if (!sess) {
            clearReactAuthState();
            setIsLoading(false);
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          clearReactAuthState();
          setIsLoading(false);
          window.dispatchEvent(new CustomEvent('refresh-products'));
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (sess) {
            applyVerifiedSession(sess);
            const userId = sess.user.id;
            setTimeout(() => {
              if (!mounted) return;
              void fetchProfile(userId, { force: true });
            }, 0);
          }
          return;
        }

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          if (sess) {
            applyVerifiedSession(sess);
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
        console.warn('Auth state change error:', error.message || error);
        setIsProfileResolved(true);
        setIsLoading(false);
      }
    });

    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.onmessage = (event) => {
      if (event.data?.type === 'LOGOUT') {
        clearReactAuthState();
        setIsLoading(false);
        window.dispatchEvent(new CustomEvent('refresh-products'));
        return;
      }
      if (event.data?.type === 'SYNC_SESSION') {
        supabase.auth.getSession().then(({ data: { session: sess } }) => {
          if (!mounted) return;
          if (sess) {
            applyVerifiedSession(sess);
            void fetchProfile(sess.user.id);
          } else {
            clearReactAuthState();
          }
        });
      }
    };

    const handleFocus = () => {
      void supabase.auth.getSession().then(({ data: { session: sess } }) => {
        if (!mounted) return;
        if (sess) {
          applyVerifiedSession(sess);
        } else if (!signingOutRef.current) {
          clearReactAuthState();
        }
      }).catch((e) => console.warn('Silent refresh failed', e));
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      mounted = false;
      authSub.unsubscribe();
      channel.close();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const signOut = useCallback(async (options: SignOutOptions = {}) => {
    const redirect = options.redirect !== false;
    const toastOn = options.toast !== false;
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setIsLoggingOut(true);
    (window as any).isLoggingOutFlag = true;

    try {
      await supabase.auth.signOut().catch(() => {});
      clearPersistedAuthToken();
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }

      clearReactAuthState();
      window.dispatchEvent(new CustomEvent('refresh-products'));
      broadcastAuthLogout();

      if (toastOn) {
        showToast('로그아웃되었습니다.', 'success');
      }
    } catch {
      // keep going to local cleanup
    } finally {
      setIsLoggingOut(false);
      setIsLoading(false);
      signingOutRef.current = false;
      (window as any).isLoggingOutFlag = false;

      if (redirect && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
  }, [showToast]);

  useEffect(() => {
    let inactivityTimeout: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 30 * 60 * 1000;

    const resetInactivityTimer = () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      if (adminUser && adminProfile?.is_admin) {
        inactivityTimeout = setTimeout(() => {
          void signOut({ redirect: true, toast: false });
          showToast('보안을 위해 장시간 미활동으로 세션이 만료되었습니다.', 'info');
        }, INACTIVITY_LIMIT);
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    if (adminUser && adminProfile?.is_admin) {
      activityEvents.forEach((event) => window.addEventListener(event, resetInactivityTimer));
      resetInactivityTimer();
    }

    return () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      activityEvents.forEach((event) => window.removeEventListener(event, resetInactivityTimer));
    };
  }, [adminUser, adminProfile, signOut, showToast]);

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
        applyVerifiedSession(sess);
        await fetchProfile(sess.user.id, { force: true });
      } else {
        clearReactAuthState();
      }
    } catch (err) {
      console.warn('refreshSession failed:', err);
    }
  };

  useEffect(() => {
    const authenticated = Boolean(user || adminUser);

    if (!authenticated) {
      if (hadSessionUserRef.current) {
        setPendingCustomAccess(false);
        customContinuationLock.current = false;
      }
      hadSessionUserRef.current = false;
      return;
    }

    const becameAuthenticated = !hadSessionUserRef.current;
    hadSessionUserRef.current = true;

    if (!pendingCustomAccess || customContinuationLock.current || !becameAuthenticated) {
      return;
    }

    customContinuationLock.current = true;
    setPendingCustomAccess(false);
    setIsWorkshopOpen(true);
  }, [user, adminUser, pendingCustomAccess]);

  return (
    <AuthContext.Provider value={{
      session, user, profile,
      adminSession, adminUser, adminProfile,
      isLoading, isProfileResolved, isLoggingOut, isProfileOpen, isWorkshopOpen, isProfileEditOpen, isOrdersOpen, isInquiryOpen,
      pendingCustomAccess,
      signOut, refreshProfile, refreshSession,
      openProfile, closeProfile, openWorkshop, closeWorkshop,
      openProfileEdit, closeProfileEdit, openOrders, closeOrders,
      openInquiry, closeInquiry,
      requestCustomAccess, clearPendingCustomAccess,
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
