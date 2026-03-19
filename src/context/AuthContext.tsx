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
  total_spent: number;
  is_admin: boolean;
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
  
  signOut: (options?: { adminOnly?: boolean }) => Promise<void>;
  refreshProfile: (isAdmin?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
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

  const fetchProfile = async (userId: string, isAdmin = false) => {
    const client = isAdmin ? supabaseAdmin : supabase;
    const setter = isAdmin ? setAdminProfile : setProfile;

    try {
      const fetchPromise = client
        .from('profiles')
        .select('*, address_detail')
        .eq('id', userId)
        .single();
        
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
      );

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      if (error && error.code !== 'PGRST116') throw error;
      setter(data || null);
    } catch (error: any) {
      setter(null);
      if (error.message === 'Profile fetch timeout') {
        console.warn('Profile fetch timed out, but keeping session active.');
        return; // Do not throw, keep session
      }
      throw error; // Rethrow to handle ghost session
    }
  };

  useEffect(() => {
    // Loading Timeout: 인증 확인이 2초 이상 걸리면 무조건 로딩 상태 해제
    const authTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    const initializeSessions = async () => {
      try {
        // Initialize User Session
        const { data: { session: userSess }, error: userErr } = await supabase.auth.getSession();
        if (userErr) throw userErr;
        
        setSession(userSess);
        setUser(userSess?.user ?? null);
        if (userSess?.user) {
          try {
            await fetchProfile(userSess.user.id, false);
          } catch (e) {
            throw new Error('Ghost session detected during initialization');
          }
        }

        // Initialize Admin Session
        const { data: { session: adminSess } } = await supabaseAdmin.auth.getSession();
        setAdminSession(adminSess);
        setAdminUser(adminSess?.user ?? null);
        if (adminSess?.user) await fetchProfile(adminSess.user.id, true);

      } catch (error) {
        console.error("Session validation failed:", error);
        // Force clear ghost session
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((c) => {
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
        clearTimeout(authTimeout);
      }
    };

    initializeSessions();

    // Subscribe to User Auth Changes
    const { data: { subscription: userSub } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      try {
        if (event === 'INITIAL_SESSION' && !sess) {
          setIsLoading(false);
          return; // Skip DB calls if initial session is null
        }
        
        setSession(sess);
        setUser(sess?.user ?? null);
        
        if (event === 'SIGNED_OUT' || !sess) {
          setProfile(null);
          setIsLoading(false);
          // Stop any ongoing fetches by not calling fetchProfile
          window.dispatchEvent(new CustomEvent('refresh-products'));
          
          if (event === 'SIGNED_OUT') {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('/');
            return;
          }
        } else if (sess?.user) {
          try {
            await fetchProfile(sess.user.id, false);
          } catch (e) {
            console.error('Ghost session detected during auth state change:', e);
            // Don't throw, just clear the profile to prevent infinite loops
            setProfile(null);
          }
        }
      } catch (error) {
        console.error("Auth state change error:", error);
        // Force clear ghost session
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((c) => {
          document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    });

    // Subscribe to Admin Auth Changes
    const { data: { subscription: adminSub } } = supabaseAdmin.auth.onAuthStateChange(async (event, sess) => {
      try {
        setAdminSession(sess);
        setAdminUser(sess?.user ?? null);
        if (event === 'SIGNED_OUT') {
          setAdminProfile(null);
        } else if (sess?.user) {
          await fetchProfile(sess.user.id, true);
        }
      } catch (error) {
        console.error("Admin auth state change error:", error);
      } finally {
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(authTimeout);
      userSub.unsubscribe();
      adminSub.unsubscribe();
    };
  }, []);

  // Smart Fetching & Inactivity Logic (Admin Only)
  useEffect(() => {
    const handleResurrection = async () => {
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        // Refresh both if needed
        if (!session && !adminSession) {
          const { data: { session: uSess } } = await supabase.auth.getSession();
          const { data: { session: aSess } } = await supabaseAdmin.auth.getSession();
          if (uSess) { setSession(uSess); setUser(uSess.user); await fetchProfile(uSess.user.id, false); }
          if (aSess) { setAdminSession(aSess); setAdminUser(aSess.user); await fetchProfile(aSess.user.id, true); }
        }
      }
    };

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

    window.addEventListener('focus', handleResurrection);
    document.addEventListener('visibilitychange', handleResurrection);

    return () => {
      window.removeEventListener('focus', handleResurrection);
      document.removeEventListener('visibilitychange', handleResurrection);
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      activityEvents.forEach(event => window.removeEventListener(event, resetInactivityTimer));
    };
  }, [user, profile, session, adminUser, adminProfile, adminSession]);

  // Session Heartbeat (5 minutes)
  useEffect(() => {
    if (!user) return;
    
    const heartbeat = setInterval(async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          // Try silent refresh
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshData.session) {
            console.warn('Heartbeat: Session expired and refresh failed. Redirecting to login.');
            // Silent redirect
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/login';
          }
        }
      } catch (err) {
        console.error('Heartbeat error:', err);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(heartbeat);
  }, [user]);

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
    const { data: { session: sess } } = await supabase.auth.getSession();
    setSession(sess);
    setUser(sess?.user ?? null);
    if (sess?.user) {
      await fetchProfile(sess.user.id, false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      session, user, profile, 
      adminSession, adminUser, adminProfile,
      isLoading, isLoggingOut, signOut, refreshProfile,
      refreshSession
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
