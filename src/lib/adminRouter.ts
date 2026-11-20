import { useEffect, useState } from 'react';

export type AdminNavId =
  | 'overview'
  | 'all-cases'
  | 'new-requests'
  | 'pending'
  | 'follow-up'
  | 'completed'
  | 'service-analytics'
  | 'target-timelines'
  | 'reports'
  | 'notifications'
  | 'users'
  | 'activity'
  | 'settings';

export type AppRoute =
  | { kind: 'public'; appPath: string }
  | { kind: 'login'; appPath: string; redirectTo: string; reason: string | null }
  | { kind: 'forgot-password'; appPath: string }
  | { kind: 'reset-password'; appPath: string; token: string }
  | { kind: 'accept-invite'; appPath: string; token: string }
  | {
      kind: 'admin';
      appPath: string;
      nav: AdminNavId;
      caseId: string | null;
      statusFilter?: string | null;
      tab?: string | null;
    };

const ROUTE_EVENT = 'pl:routechange';

export function getRouterBasePath(): string {
  const raw = (import.meta.env.BASE_URL || '/').trim();
  if (!raw || raw === '/') return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Restores clean client URL when redirected from static host `404.html?p=...`.
 * Runs safely without any inline script in `index.html`.
 */
export function restoreRedirectedPathFromQuery(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const redirected = url.searchParams.get('p');
    if (!redirected) return;
    const base = getRouterBasePath();
    const cleanSub = redirected.startsWith('/') ? redirected : `/${redirected}`;
    // Reject any protocol injection inside `?p=`
    if (cleanSub.startsWith('//') || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(cleanSub)) {
      return;
    }
    const basePrefix = base === '/' ? '' : base.slice(0, -1);
    const nextUrl = `${basePrefix}${cleanSub}${url.hash || ''}`;
    window.history.replaceState(null, '', nextUrl);
  } catch {
    // Ignore malformed URLs safely
  }
}

restoreRedirectedPathFromQuery();

export function stripBasePath(pathname: string): string {
  const base = getRouterBasePath();
  if (base === '/') {
    return pathname || '/';
  }
  const baseNoSlash = base.slice(0, -1);
  if (pathname === baseNoSlash || pathname === base) {
    return '/';
  }
  if (pathname.startsWith(base)) {
    const sub = pathname.slice(baseNoSlash.length);
    return sub.startsWith('/') ? sub : `/${sub}`;
  }
  return pathname || '/';
}

export function buildAppHref(appPath: string): string {
  const base = getRouterBasePath();
  const normalized = appPath.startsWith('/') ? appPath : `/${appPath}`;
  if (base === '/') return normalized;
  const baseNoSlash = base.slice(0, -1);
  if (normalized === '/') return base;
  return `${baseNoSlash}${normalized}`;
}

export function sanitizeAdminRedirect(raw: string | null | undefined): string {
  const fallback = '/admin/dashboard';
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//') || trimmed.includes('\\')) return fallback;
  try {
    const parsed = new URL(trimmed, 'https://app.local');
    if (parsed.origin !== 'https://app.local') return fallback;
    const path = parsed.pathname;
    if (
      !path.startsWith('/admin/') ||
      path === '/admin/login' ||
      path === '/admin/forgot-password' ||
      path === '/admin/reset-password' ||
      path === '/admin/accept-invite'
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function parseLocationRoute(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  search = typeof window !== 'undefined' ? window.location.search : '',
  hash = typeof window !== 'undefined' ? window.location.hash : ''
): AppRoute {
  const subPath = stripBasePath(pathname).replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const appPath = `${subPath}${search}`;

  // Legacy `#admin` fallback support
  if (subPath === '/' && hash === '#admin') {
    return {
      kind: 'login',
      appPath: '/admin/login',
      redirectTo: '/admin/dashboard',
      reason: null,
    };
  }

  if (subPath === '/admin' || subPath === '/admin/login') {
    return {
      kind: 'login',
      appPath,
      redirectTo: sanitizeAdminRedirect(params.get('redirect')),
      reason: params.get('reason'),
    };
  }

  if (subPath === '/admin/forgot-password') {
    return { kind: 'forgot-password', appPath };
  }

  if (subPath === '/admin/reset-password') {
    return {
      kind: 'reset-password',
      appPath,
      token: params.get('token') || '',
    };
  }

  if (subPath === '/admin/accept-invite') {
    return {
      kind: 'accept-invite',
      appPath,
      token: params.get('token') || '',
    };
  }

  if (subPath === '/admin/dashboard') {
    return { kind: 'admin', appPath, nav: 'overview', caseId: null };
  }

  if (subPath === '/admin/cases') {
    const statusParam = params.get('status');
    let nav: AdminNavId = 'all-cases';
    if (statusParam === 'New') nav = 'new-requests';
    else if (statusParam === 'Pending') nav = 'pending';
    else if (statusParam === 'Follow Up') nav = 'follow-up';
    else if (statusParam === 'Completed') nav = 'completed';
    return { kind: 'admin', appPath, nav, caseId: null, statusFilter: statusParam };
  }

  if (subPath.startsWith('/admin/cases/')) {
    const caseId = decodeURIComponent(subPath.slice('/admin/cases/'.length)).trim();
    if (caseId) {
      return { kind: 'admin', appPath, nav: 'all-cases', caseId };
    }
    return { kind: 'admin', appPath: '/admin/cases', nav: 'all-cases', caseId: null };
  }

  if (subPath === '/admin/analytics') {
    const tab = params.get('tab');
    return {
      kind: 'admin',
      appPath,
      nav: tab === 'timelines' ? 'target-timelines' : 'service-analytics',
      caseId: null,
      tab,
    };
  }

  if (subPath === '/admin/reports') {
    return { kind: 'admin', appPath, nav: 'reports', caseId: null };
  }

  if (subPath === '/admin/notifications') {
    return { kind: 'admin', appPath, nav: 'notifications', caseId: null };
  }

  if (subPath === '/admin/users') {
    return { kind: 'admin', appPath, nav: 'users', caseId: null };
  }

  if (subPath === '/admin/activity') {
    return { kind: 'admin', appPath, nav: 'activity', caseId: null };
  }

  if (subPath === '/admin/settings') {
    return { kind: 'admin', appPath, nav: 'settings', caseId: null };
  }

  if (subPath.startsWith('/admin/')) {
    return { kind: 'admin', appPath: '/admin/dashboard', nav: 'overview', caseId: null };
  }

  return { kind: 'public', appPath };
}

export function adminNavToPath(nav: AdminNavId, caseId?: string | null): string {
  if (caseId) return `/admin/cases/${encodeURIComponent(caseId)}`;
  switch (nav) {
    case 'overview':
      return '/admin/dashboard';
    case 'all-cases':
      return '/admin/cases';
    case 'new-requests':
      return '/admin/cases?status=New';
    case 'pending':
      return '/admin/cases?status=Pending';
    case 'follow-up':
      return '/admin/cases?status=Follow+Up';
    case 'completed':
      return '/admin/cases?status=Completed';
    case 'service-analytics':
      return '/admin/analytics';
    case 'target-timelines':
      return '/admin/analytics?tab=timelines';
    case 'reports':
      return '/admin/reports';
    case 'notifications':
      return '/admin/notifications';
    case 'users':
      return '/admin/users';
    case 'activity':
      return '/admin/activity';
    case 'settings':
      return '/admin/settings';
    default:
      return '/admin/dashboard';
  }
}

export function navigateApp(appPath: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const href = buildAppHref(appPath);
  if (options.replace) {
    window.history.replaceState(null, '', href);
  } else {
    window.history.pushState(null, '', href);
  }
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function useAdminRouter(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseLocationRoute());

  useEffect(() => {
    const sync = () => setRoute(parseLocationRoute());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener(ROUTE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener(ROUTE_EVENT, sync);
    };
  }, []);

  return route;
}
