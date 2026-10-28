import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './auth-store';
import { getApiBase } from './utils';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${getApiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const body = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  setTokens(body.accessToken, body.refreshToken);
  return body.accessToken;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  clearTokens();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; skipAuthRefresh?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = options.token ?? getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && !options.skipAuthRefresh && !path.startsWith('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const nextToken = await refreshPromise;
    if (!nextToken) {
      redirectToLogin();
      throw new ApiError('Session expired. Please sign in again.', 401);
    }
    return apiFetch<T>(path, {
      ...options,
      token: nextToken,
      skipAuthRefresh: true,
    });
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as {
        message?: string | string[] | { message?: string; code?: string };
      };
      if (Array.isArray(body.message)) {
        message = body.message.join(', ');
      } else if (typeof body.message === 'string') {
        message = body.message;
      } else if (body.message && typeof body.message === 'object') {
        message = body.message.message ?? message;
      }
    } catch {
      // ignore
    }
    if (res.status === 401) {
      redirectToLogin();
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
