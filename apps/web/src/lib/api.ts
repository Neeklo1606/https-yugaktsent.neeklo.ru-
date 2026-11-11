/**
 * Базовый клиент к NestJS API.
 * В dev Vite проксирует `/api` → `http://127.0.0.1:3000`.
 * В prod запросы идут на тот же origin (nginx → Node).
 */
import {
  incrementRefreshFailure,
  recordAuthError,
  setAuthSessionState,
} from '@/shared/lib/auth-session-state';

const API_PREFIX = '/api/v1';

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  // Пререндер в Node: относительный адрес не работает, базу задаёт scripts/prerender-seo.mjs
  const ssrOrigin = typeof window === 'undefined' ? (globalThis as { __SSR_API_ORIGIN__?: string }).__SSR_API_ORIGIN__ : undefined;
  return `${ssrOrigin ?? ''}${API_PREFIX}${p}`;
}

/* ─── token storage (in-memory + localStorage backup) ─── */

const TOKEN_KEY = 'lg_access_token';
const REFRESH_KEY = 'lg_refresh_token';

let _accessToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  _accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export const AUTH_LOGOUT_EVENT = 'lg:auth:logout';

function emitAuthLogout(): void {
  clearTokens();
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

/* ─── auth headers helper ─── */

function authHeaders(extra?: HeadersInit): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (_accessToken) h['Authorization'] = `Bearer ${_accessToken}`;
  if (extra) {
    const entries = extra instanceof Headers ? [...extra.entries()] : Object.entries(extra);
    for (const [k, v] of entries) h[k] = v as string;
  }
  return h;
}

function isAuthRefreshPath(path: string): boolean {
  return (
    path.startsWith('/auth/refresh') ||
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/telegram')
  );
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh used by apiFetch and AuthProvider hydration. */
export async function refreshAccessToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;

  if (!refreshInFlight) {
    setAuthSessionState({ status: 'refreshing' });
    refreshInFlight = (async () => {
      try {
        const res = await fetch(apiUrl('/auth/refresh'), {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          incrementRefreshFailure();
          recordAuthError(`refresh ${res.status}`);
          emitAuthLogout();
          return false;
        }
        const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
        setTokens(tokens.accessToken, tokens.refreshToken);
        setAuthSessionState({ status: 'authenticated', isAuthenticated: true, lastAuthError: null });
        return true;
      } catch {
        incrementRefreshFailure();
        recordAuthError('refresh network error');
        emitAuthLogout();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function parseResponse(res: Response): Promise<{ ok: true; data: unknown } | { ok: false; status: number; text: string }> {
  if (res.ok) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { ok: true, data };
  }
  const text = await res.text().catch(() => '');
  return { ok: false, status: res.status, text: text || `${res.status} ${res.statusText}` };
}

async function apiFetch(path: string, init?: RequestInit, allowRefresh = true): Promise<Response> {
  const doFetch = () =>
    fetch(apiUrl(path), {
      credentials: 'include',
      ...init,
      headers: authHeaders(init?.headers),
    });

  let res = await doFetch();

  if (
    res.status === 401 &&
    allowRefresh &&
    !isAuthRefreshPath(path) &&
    getRefreshToken()
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (res.status === 401 && !isAuthRefreshPath(path)) {
    recordAuthError('401 unauthorized');
    if (!getRefreshToken()) emitAuthLogout();
  }

  return res;
}

/* ─── fetch wrappers ─── */

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiGetOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await apiFetch(path, init);
  if (res.status === 404) return null;
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiPostForm<T>(path: string, form: FormData, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', ...init, body: form });
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiGetOptionalAuth<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await apiFetch(path, init, false);
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    ...init,
    headers: { ...authHeaders(init?.headers), 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiPut<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    method: 'PUT',
    ...init,
    headers: { ...authHeaders(init?.headers), 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    method: 'PATCH',
    ...init,
    headers: { ...authHeaders(init?.headers), 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
  return parsed.data as T;
}

export async function apiDelete(path: string, init?: RequestInit): Promise<void> {
  const res = await apiFetch(path, { method: 'DELETE', ...init });
  const parsed = await parseResponse(res);
  if (!parsed.ok) throw new ApiError(parsed.status, parsed.text);
}

/** Скачивание бинарного файла (PDF и т.д.) с Bearer-токеном при наличии сессии. */
export async function apiDownloadBlob(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path, { method: 'GET', headers: { Accept: 'application/pdf' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
