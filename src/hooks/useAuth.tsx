import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { supabase as supabaseReal } from '@/integrations/supabase/client';

async function logLoginEntry(userId: string) {
  try {
    const hasVpsToken = typeof window !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
    const profileClient = hasVpsToken ? (supabase as any) : supabaseReal;
    const { data: prof } = await profileClient.from('profiles').select('name, role').eq('id', userId).maybeSingle();
    if (prof) {
      await supabaseReal.from('login_logs').insert({
        user_id: userId,
        user_name: (prof as any)?.name || '',
        user_role: (prof as any)?.role || '',
      });
    }
  } catch (err) {
    console.warn('logLoginEntry failed:', err);
  }
}


export type AppRole = 'admin' | 'videomaker' | 'social_media' | 'editor' | 'endomarketing' | 'parceiro' | 'fotografo' | 'designer';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  avatar_url?: string;
  display_name?: string;
  job_title?: string;
  bio?: string;
  font_scale?: string;
}

interface VpsAuthUser {
  id: string;
  email: string;
  name?: string;
  role?: AppRole;
  avatar_url?: string;
  job_title?: string;
}

interface VpsAuthPayload {
  token?: string;
  user?: VpsAuthUser;
  id?: string;
  email?: string;
}

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  session: { access_token: string } | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, role: AppRole, isSelfRegister?: boolean, cities?: string[], primaryCity?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';
const CITY_KEY = 'pulse:active_city';

function getActiveCityHeader(): string {
  if (typeof window === 'undefined') return 'minacu';
  const inMemoryCity = (window as any).__PULSE_ACTIVE_CITY__;
  if (inMemoryCity === 'minacu' || inMemoryCity === 'uruacu') return inMemoryCity;
  return localStorage.getItem(CITY_KEY) === 'uruacu' ? 'uruacu' : 'minacu';
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshVpsSession = useCallback(async (token: string): Promise<VpsAuthPayload | null> => {
    try {
      const response = await fetch(`${VPS_API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
            'x-pulse-city': getActiveCityHeader(),
        },
      });

      const payload = await response.json().catch(() => null) as VpsAuthPayload | null;
      if (!response.ok || !payload?.token) return null;

      localStorage.setItem(TOKEN_KEY, payload.token);
      return payload;
    } catch (error) {
      console.warn('refreshVpsSession failed:', error);
      return null;
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const hasVpsToken = typeof window !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
    const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

    if (!hasVpsToken) {
      const { data: sbData, error: sbErr } = await supabaseReal
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (sbData && !sbErr) {
        setProfile(sbData as unknown as Profile);
      }
      return;
    }

    let authProfile: Partial<Profile> | null = null;
    if (token) {
      try {
        const response = await fetch(`${VPS_API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-pulse-city': getActiveCityHeader(),
          },
        });

        if (response.ok) {
          authProfile = await response.json();
        }
      } catch (error) {
        console.warn('fetchProfile auth/me failed:', error);
      }
    }

    // Try VPS first
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data && !error) {
      setProfile({
        ...(data as Profile),
        role: (authProfile?.role as AppRole) || (data as Profile).role,
        email: authProfile?.email || (data as Profile).email,
        name: authProfile?.name || (data as Profile).name,
      });
      return;
    }

    if (authProfile?.role) {
      setProfile({
        id: userId,
        name: authProfile.name || authProfile.display_name || '',
        email: authProfile.email || '',
        role: authProfile.role as AppRole,
        avatar_url: authProfile.avatar_url,
        display_name: authProfile.display_name || authProfile.name,
        job_title: authProfile.job_title,
        bio: authProfile.bio,
        font_scale: authProfile.font_scale,
      });
      return;
    }

    // Fallback: try Supabase directly (preview environment)
    const { data: sbData, error: sbErr } = await supabaseReal
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (sbData && !sbErr) {
      setProfile({
        ...(sbData as unknown as Profile),
        role: (authProfile?.role as AppRole) || (sbData as unknown as Profile).role,
      });
    }
  }, []);

  // On mount, check for existing JWT token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      let cancelled = false;

      async function restoreVpsSession() {
        try {
          const response = await fetch(`${VPS_API_BASE}/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'x-pulse-city': getActiveCityHeader(),
            },
          });

          let activeToken = token;
          let data: VpsAuthPayload | VpsAuthUser | null = response.ok
            ? await response.json().catch(() => null)
            : null;

          if (!response.ok || !data) {
            const refreshed = await refreshVpsSession(token);
            if (!refreshed?.token) throw new Error('Session expired');
            activeToken = refreshed.token;
            data = refreshed;
          }

          if (cancelled) return;
          const userData = 'user' in data && data.user ? data.user : data;
          if (!userData?.id || !userData?.email) throw new Error('Invalid auth payload');
          const u = { id: userData.id, email: userData.email };
          setUser(u);
          setSession({ access_token: activeToken });
          fetchProfile(u.id);
        } catch {
          if (cancelled) return;
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          setProfile(null);
          setSession(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      restoreVpsSession();
      return () => { cancelled = true; };
    } else {
      // Check Supabase session as fallback (preview environment)
      supabaseReal.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const u = { id: session.user.id, email: session.user.email || '' };
          setUser(u);
          setSession({ access_token: session.access_token });
          fetchProfile(u.id);
        }
        setLoading(false);
      });
    }
  }, [fetchProfile, refreshVpsSession]);

  useEffect(() => {
    const handleTokenRefresh = (event: Event) => {
      const token = (event as CustomEvent<{ token?: string }>).detail?.token;
      if (token) setSession({ access_token: token });
    };

    window.addEventListener('pulse:auth-token-refreshed', handleTokenRefresh);
    return () => window.removeEventListener('pulse:auth-token-refreshed', handleTokenRefresh);
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch(`${VPS_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await res.json().catch(() => null)
        : await res.text().catch(() => '');

      if (res.ok && payload && typeof payload === 'object' && 'token' in payload) {
        const data = payload as { token: string; user: { id: string; email: string } };
        localStorage.setItem(TOKEN_KEY, data.token);
        const u = { id: data.user.id, email: data.user.email };
        setUser(u);
        setSession({ access_token: data.token });
        await fetchProfile(u.id);
        logLoginEntry(u.id);
        return { error: null };}

      if (res.status === 401 || res.status === 400) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : 'Email ou senha inválidos';
        return { error: message };
      }

      if (res.status >= 500 || !contentType.includes('application/json')) {
        // VPS unavailable, try Supabase Auth fallback
        try {
          const { data: sbData, error: sbError } = await supabaseReal.auth.signInWithPassword({ email, password });
          if (sbError || !sbData?.user) {
            return { error: 'Servidor de autenticação indisponível no momento. Tente novamente em instantes.' };
          }
          const u = { id: sbData.user.id, email: sbData.user.email || email };
          setUser(u);
          setSession({ access_token: sbData.session?.access_token || '' });
          await fetchProfile(u.id);
          logLoginEntry(u.id);
          return { error: null };
        } catch {
          return { error: 'Servidor de autenticação indisponível no momento. Tente novamente em instantes.' };
        }
      }

      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'Falha ao conectar com o servidor de autenticação';
      return { error: message };
    } catch {
      // Fallback: try Supabase Auth (for preview environment)
      try {
        const { data: sbData, error: sbError } = await supabaseReal.auth.signInWithPassword({ email, password });
        if (sbError || !sbData?.user) {
          return { error: sbError?.message || 'Não foi possível conectar ao servidor de autenticação' };
        }
        const u = { id: sbData.user.id, email: sbData.user.email || email };
        setUser(u);
        setSession({ access_token: sbData.session?.access_token || '' });
        await fetchProfile(u.id);
        logLoginEntry(u.id);
        return { error: null };
      } catch {
        return { error: 'Não foi possível conectar ao servidor de autenticação' };
      }
    }
  };

  const signUp = async (email: string, password: string, name: string, role: AppRole, isSelfRegister: boolean = false, cities?: string[], primaryCity?: string) => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${VPS_API_BASE}/auth/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, password, name, role, isSelfRegister, cities, primaryCity }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Erro ao cadastrar usuário' };
      return { error: null };
    } catch {
      return { error: 'Erro de conexão com o servidor' };
    }
  };

  const signOut = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;
    const { role, id, ...safeUpdates } = updates as any;
    await supabase.from('profiles').update(safeUpdates).eq('id', user.id);
    await fetchProfile(user.id);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signIn, signUp, signOut, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
