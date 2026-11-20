const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  isStaticFallback: boolean;
  code?: string;

  constructor(message: string, status = 500, isStaticFallback = false, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isStaticFallback = isStaticFallback;
    this.code = code;
  }
}

export function getApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${RAW_API_BASE}${normalized}`;
}

export function isExternalApiConfigured(): boolean {
  return RAW_API_BASE.length > 0;
}

export function isStaticHostWithoutApi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io') && !isExternalApiConfigured();
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)pl_csrf=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  if (isStaticHostWithoutApi()) {
    throw new ApiError(
      'This static GitHub Pages site does not have a live backend URL configured. Direct inquiries can be sent to pioorly.languisan@gmail.com.',
      503,
      true
    );
  }

  const { timeoutMs = 15000, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const method = (rest.method || 'GET').toUpperCase();
  const csrfToken = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? readCsrfCookie() : null;

  try {
    const response = await fetch(getApiUrl(path), {
      credentials: 'include',
      ...rest,
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(headers || {}),
      },
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.toLowerCase().includes('application/json');

    if (!isJson) {
      const text = await response.text().catch(() => '');
      if (text.trim().startsWith('<')) {
        throw new ApiError(
          'Backend API endpoint returned HTML instead of JSON. Verify your backend server or VITE_API_BASE_URL configuration.',
          response.ok ? 502 : response.status,
          true
        );
      }
      throw new ApiError(
        `Unexpected response from server (${response.status}).`,
        response.ok ? 502 : response.status
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError('The backend returned an invalid response.', response.ok ? 502 : response.status);
    }
    if (!response.ok) {
      const obj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      const message =
        obj && typeof obj.error === 'string'
          ? obj.error
          : `Request failed with status ${response.status}.`;
      const code = obj && typeof obj.code === 'string' ? obj.code : undefined;
      throw new ApiError(message, response.status, false, code);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again in a moment.', 504);
    }
    throw new ApiError(
      'Unable to reach the backend service. Please verify your network connection.',
      503
    );
  } finally {
    window.clearTimeout(timer);
  }
}
