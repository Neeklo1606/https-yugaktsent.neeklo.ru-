import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { UserProfile, UserRole } from '@/shared/types';
import {
  apiPost,
  apiGet,
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
  AUTH_LOGOUT_EVENT,
} from '@/lib/api';
import {
  type AuthStatus,
  getAuthSessionSnapshot,
  resetAuthDiagnostics,
  setAuthSessionState,
  subscribeAuthSession,
} from '@/shared/lib/auth-session-state';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface MeResponse {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl?: string | null;
  role: string;
  telegramUsername?: string | null;
  telegramLinked?: boolean;
  isActive: boolean;
}

export interface AuthState {
  authStatus: AuthStatus;
  authReady: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  loginWithTelegram: (payload: Record<string, unknown>) => Promise<void>;
  linkTelegram: (payload: Record<string, unknown>) => Promise<void>;
  linkEmail: (email: string, password: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  register: (data: { name: string; phone: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider = AuthContext.Provider;

function meToProfile(me: MeResponse): UserProfile {
  const email = me.email ?? null;
  const display =
    me.fullName?.trim() ||
    (email ? email : me.telegramUsername ? `@${me.telegramUsername}` : 'Пользователь');
  return {
    id: me.id,
    name: display,
    phone: me.phone || '',
    email,
    role: me.role as UserRole,
    avatar: me.avatarUrl ?? undefined,
    telegramUsername: me.telegramUsername ?? null,
    telegramLinked:
      me.telegramLinked ??
      !!(me.telegramUsername && String(me.telegramUsername).trim()),
  };
}

function syncAuthSession(status: AuthStatus, isAuthenticated: boolean): void {
  const authReady = status !== 'loading' && status !== 'refreshing';
  setAuthSessionState({ status, authReady, isAuthenticated });
}

function readStoredUser(): UserProfile | null {
  if (!getAccessToken()) return null;
  try {
    const stored = localStorage.getItem('lg_user');
    return stored ? (JSON.parse(stored) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function useAuthState(): AuthState {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() =>
    getAccessToken() ? 'loading' : 'unauthenticated',
  );
  const [user, setUser] = useState<UserProfile | null>(readStoredUser);
  const initDone = useRef(false);

  const authReady = authStatus !== 'loading' && authStatus !== 'refreshing';
  const isAuthenticated = authStatus === 'authenticated';
  const loading = !authReady;

  const applyMe = useCallback((me: MeResponse) => {
    const profile = meToProfile(me);
    setUser(profile);
    localStorage.setItem('lg_user', JSON.stringify(profile));
    setAuthStatus('authenticated');
    syncAuthSession('authenticated', true);
    resetAuthDiagnostics();
  }, []);

  const clearSession = useCallback(() => {
    clearTokens();
    setUser(null);
    localStorage.removeItem('lg_user');
    setAuthStatus('unauthenticated');
    syncAuthSession('unauthenticated', false);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await apiGet<MeResponse>('/auth/me');
    applyMe(me);
  }, [applyMe]);

  useEffect(() => {
    syncAuthSession(authStatus, isAuthenticated);
  }, [authStatus, isAuthenticated]);

  useEffect(() => {
    const onLogout = () => clearSession();
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, [clearSession]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const token = getAccessToken();
    if (!token) {
      clearSession();
      return;
    }

    setAuthStatus('loading');
    syncAuthSession('loading', false);

    apiGet<MeResponse>('/auth/me')
      .then(applyMe)
      .catch(async () => {
        const rt = getRefreshToken();
        if (!rt) {
          clearSession();
          return;
        }
        const ok = await refreshAccessToken();
        if (!ok) {
          clearSession();
          return;
        }
        try {
          const me = await apiGet<MeResponse>('/auth/me');
          applyMe(me);
        } catch {
          clearSession();
        }
      });
  }, [applyMe, clearSession]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const trimmed = identifier.trim();
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      const body = looksLikeEmail ? { email: trimmed, password } : { phone: trimmed, password };
      const tokens = await apiPost<AuthTokens>('/auth/login', body);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiGet<MeResponse>('/auth/me');
      applyMe(me);
    },
    [applyMe],
  );

  const loginWithTelegram = useCallback(
    async (payload: Record<string, unknown>) => {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined || v === null) continue;
        body[k] = typeof v === 'string' ? v : String(v);
      }
      const tokens = await apiPost<AuthTokens>('/auth/telegram', body);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiGet<MeResponse>('/auth/me');
      applyMe(me);
    },
    [applyMe],
  );

  const linkTelegram = useCallback(
    async (payload: Record<string, unknown>) => {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined || v === null) continue;
        body[k] = typeof v === 'string' ? v : String(v);
      }
      const tokens = await apiPost<AuthTokens>('/auth/link-telegram', body);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiGet<MeResponse>('/auth/me');
      applyMe(me);
    },
    [applyMe],
  );

  const linkEmail = useCallback(
    async (email: string, password: string) => {
      const tokens = await apiPost<AuthTokens>('/auth/link-email', { email, password });
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiGet<MeResponse>('/auth/me');
      applyMe(me);
    },
    [applyMe],
  );

  const register = useCallback(
    async (data: { name: string; phone: string; email: string; password: string }) => {
      const tokens = await apiPost<AuthTokens>('/auth/register', {
        fullName: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email.trim(),
        password: data.password,
      });
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiGet<MeResponse>('/auth/me');
      applyMe(me);
    },
    [applyMe],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout', {});
    } catch {
      /* ignore */
    }
    clearSession();
  }, [clearSession]);

  return {
    authStatus,
    authReady,
    isAuthenticated,
    user,
    loading,
    login,
    loginWithTelegram,
    linkTelegram,
    linkEmail,
    refreshMe,
    register,
    logout,
  };
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

/** Subscribe to auth session snapshot (diagnostics, dev). */
export function useAuthSessionSnapshot() {
  const [, bump] = useState(0);
  useEffect(() => subscribeAuthSession(() => bump((n) => n + 1)), []);
  return getAuthSessionSnapshot();
}
