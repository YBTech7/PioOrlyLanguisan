import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Timer,
  X,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/apiClient';
import { computeDashboardAnalytics } from '../lib/caseAnalytics';
import type {
  AdminNotification,
  AdminRole,
  AdminUser,
  BrandSettings,
  CaseActivityEntry,
  CaseDetailPayload,
  CaseListResponse,
  CasePriority,
  CaseStatus,
  ClientTierId,
  DashboardAnalytics,
  ProjectCase,
  ServiceDomainId,
  TargetTimelineValue,
} from '../types';
import { BrandMark } from './BrandMark';
import { AdminAnalyticsView } from './admin/AdminAnalyticsView';
import { AdminAuthScreen, type AuthSessionInfo } from './admin/AdminAuthScreen';
import { AdminCaseDetailView } from './admin/AdminCaseDetailView';
import { AdminCasesView, type CasesFilterState } from './admin/AdminCasesView';
import { AdminOverviewView, type DatePreset } from './admin/AdminOverviewView';
import { AdminReportsView } from './admin/AdminReportsView';
import {
  AdminActivityView,
  AdminNotificationsView,
  AdminSettingsView,
} from './admin/AdminSecondaryViews';

interface AdminPortalProps {
  open: boolean;
  onClose: () => void;
  onContentUpdated: () => void;
}

type AdminNavId =
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
  | 'activity'
  | 'settings';

const EMPTY_ANALYTICS: DashboardAnalytics = computeDashboardAnalytics([]);
const EMPTY_CASE_LIST: CaseListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  statusCounts: { All: 0, New: 0, Pending: 0, 'Follow Up': 0, Completed: 0 },
};

function computeDateBounds(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { fromIso?: string; toIso?: string } {
  if (preset === 'all') return {};
  const now = new Date();
  if (preset === 'custom') {
    return {
      fromIso: customFrom ? new Date(`${customFrom}T00:00:00.000Z`).toISOString() : undefined,
      toIso: customTo ? new Date(`${customTo}T23:59:59.999Z`).toISOString() : undefined,
    };
  }
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  return {
    fromIso: new Date(now.getTime() - days * 86400000).toISOString(),
    toIso: now.toISOString(),
  };
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  open,
  onClose,
  onContentUpdated,
}) => {
  const [session, setSession] = useState<AuthSessionInfo | null>(null);
  const [authStatus, setAuthStatus] = useState<{
    hasAdminUsers: boolean;
    bootstrapConfigured: boolean;
    passcodeConfigured: boolean;
    storageMode: string;
    mailerConfigured: boolean;
  }>({
    hasAdminUsers: false,
    bootstrapConfigured: false,
    passcodeConfigured: true,
    storageMode: 'file',
    mailerConfigured: false,
  });

  const [activeNav, setActiveNav] = useState<AdminNavId>('overview');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetailPayload | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Overview date filter
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [comparePrevious, setComparePrevious] = useState(false);

  // Data state
  const [analytics, setAnalytics] = useState<DashboardAnalytics>(EMPTY_ANALYTICS);
  const [caseList, setCaseList] = useState<CaseListResponse>(EMPTY_CASE_LIST);
  const [caseFilters, setCaseFilters] = useState<CasesFilterState>({
    search: '',
    status: 'All',
    serviceDomain: 'All',
    timeline: 'All',
    assignedTo: 'All',
    from: '',
    to: '',
    sortBy: 'submittedAt',
    sortDir: 'desc',
    page: 1,
  });
  const [casesLoading, setCasesLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activity, setActivity] = useState<CaseActivityEntry[]>([]);
  const [projects, setProjects] = useState<ProjectCase[]>([]);
  const [brand, setBrand] = useState<BrandSettings>({
    customPortraitDataUrl: null,
    customLogoDataUrl: null,
    motionEnabled: true,
    motionSensitivity: 1,
  });

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileDrawerOpen) {
          setMobileDrawerOpen(false);
        } else if (selectedCaseId) {
          setSelectedCaseId(null);
          setCaseDetail(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mobileDrawerOpen, selectedCaseId, onClose]);

  const loadAuthBootstrapStatus = useCallback(async () => {
    try {
      const status = await apiFetch<typeof authStatus>('/api/auth/status');
      setAuthStatus(status);
    } catch {
      // Keep default status if backend probe fails
    }
    try {
      const me = await apiFetch<{ user: AuthSessionInfo['user']; csrfToken: string }>('/api/auth/me');
      if (me.user) {
        setSession({ token: '', csrfToken: me.csrfToken, user: me.user });
      }
    } catch {
      // Not signed in via cookie
    }
  }, []);

  useEffect(() => {
    if (open && !session) {
      loadAuthBootstrapStatus();
    }
  }, [open, session, loadAuthBootstrapStatus]);

  const authHeaders = useCallback(
    (authToken?: string): Record<string, string> => {
      const tok = authToken ?? session?.token ?? '';
      return tok ? { Authorization: `Bearer ${tok}` } : {};
    },
    [session]
  );

  const loadAnalytics = useCallback(
    async (authToken?: string) => {
      const bounds = computeDateBounds(datePreset, customFrom, customTo);
      const params = new URLSearchParams();
      if (bounds.fromIso) params.set('from', bounds.fromIso);
      if (bounds.toIso) params.set('to', bounds.toIso);
      if (comparePrevious && bounds.fromIso && bounds.toIso) {
        params.set('comparePrevious', 'true');
      }
      const data = await apiFetch<DashboardAnalytics>(
        `/api/admin/analytics?${params.toString()}`,
        { headers: authHeaders(authToken) }
      );
      setAnalytics(data);
    },
    [datePreset, customFrom, customTo, comparePrevious, authHeaders]
  );

  const loadCases = useCallback(
    async (filtersOverride?: CasesFilterState, authToken?: string) => {
      const f = filtersOverride ?? caseFilters;
      setCasesLoading(true);
      try {
        const params = new URLSearchParams();
        if (f.search.trim()) params.set('search', f.search.trim());
        if (f.status !== 'All') params.set('status', f.status);
        if (f.serviceDomain !== 'All') params.set('serviceDomain', f.serviceDomain);
        if (f.timeline !== 'All') params.set('timeline', f.timeline);
        if (f.assignedTo !== 'All') params.set('assignedTo', f.assignedTo);
        if (f.from) params.set('from', new Date(`${f.from}T00:00:00.000Z`).toISOString());
        if (f.to) params.set('to', new Date(`${f.to}T23:59:59.999Z`).toISOString());
        params.set('sortBy', f.sortBy);
        params.set('sortDir', f.sortDir);
        params.set('page', String(f.page));
        params.set('pageSize', '15');

        const data = await apiFetch<CaseListResponse>(
          `/api/admin/cases?${params.toString()}`,
          { headers: authHeaders(authToken) }
        );
        setCaseList(data);
      } finally {
        setCasesLoading(false);
      }
    },
    [caseFilters, authHeaders]
  );

  const loadNotifications = useCallback(
    async (authToken?: string) => {
      const data = await apiFetch<{ notifications: AdminNotification[]; unreadCount: number }>(
        '/api/admin/notifications',
        { headers: authHeaders(authToken) }
      );
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    },
    [authHeaders]
  );

  const loadActivity = useCallback(
    async (authToken?: string) => {
      const data = await apiFetch<{ activity: CaseActivityEntry[] }>(
        '/api/admin/activity?limit=150',
        { headers: authHeaders(authToken) }
      );
      setActivity(data.activity || []);
    },
    [authHeaders]
  );

  const loadFullWorkspace = useCallback(
    async (authToken?: string) => {
      try {
        const dash = await apiFetch<{
          inquiries: CaseListResponse['items'];
          projects: ProjectCase[];
          brand: BrandSettings;
          analytics?: DashboardAnalytics;
          users?: AdminUser[];
          unreadNotifications?: number;
        }>('/api/admin/dashboard', { headers: authHeaders(authToken) });

        setProjects(dash.projects || []);
        if (dash.brand) setBrand(dash.brand);
        if (dash.users) setUsers(dash.users);
        if (dash.analytics) setAnalytics(dash.analytics);
        if (typeof dash.unreadNotifications === 'number') {
          setUnreadCount(dash.unreadNotifications);
        }

        await Promise.all([
          loadCases(undefined, authToken),
          loadNotifications(authToken).catch(() => {}),
          loadActivity(authToken).catch(() => {}),
        ]);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setSession(null);
        }
        showToast('err', err instanceof Error ? err.message : 'Unable to load dashboard.');
      }
    },
    [authHeaders, loadCases, loadNotifications, loadActivity, showToast]
  );

  useEffect(() => {
    if (open && session) {
      loadAnalytics().catch(() => {});
    }
  }, [open, session, datePreset, customFrom, customTo, comparePrevious, loadAnalytics]);

  useEffect(() => {
    if (open && session) {
      loadCases().catch(() => {});
    }
  }, [open, session, caseFilters, loadCases]);

  const handleOpenCase = async (caseId: string) => {
    if (!session) return;
    try {
      const detail = await apiFetch<CaseDetailPayload>(`/api/admin/cases/${caseId}`, {
        headers: authHeaders(),
      });
      setSelectedCaseId(caseId);
      setCaseDetail(detail);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to open case details.');
    }
  };

  const handleNavSelect = (navId: AdminNavId) => {
    setActiveNav(navId);
    setSelectedCaseId(null);
    setCaseDetail(null);
    setMobileDrawerOpen(false);

    if (navId === 'all-cases') {
      setCaseFilters((prev) => ({ ...prev, status: 'All', page: 1 }));
    } else if (navId === 'new-requests') {
      setCaseFilters((prev) => ({ ...prev, status: 'New', page: 1 }));
    } else if (navId === 'pending') {
      setCaseFilters((prev) => ({ ...prev, status: 'Pending', page: 1 }));
    } else if (navId === 'follow-up') {
      setCaseFilters((prev) => ({ ...prev, status: 'Follow Up', page: 1 }));
    } else if (navId === 'completed') {
      setCaseFilters((prev) => ({ ...prev, status: 'Completed', page: 1 }));
    }
  };

  const handleUpdateCase = async (
    caseId: string,
    updates: {
      status?: CaseStatus;
      statusNote?: string;
      priority?: CasePriority;
      assignedTo?: string | null;
      followUpAt?: string | null;
      deadlineAt?: string | null;
      company?: string;
      tier?: ClientTierId;
      serviceDomain?: ServiceDomainId;
      timeline?: TargetTimelineValue;
    }
  ) => {
    if (!session) return;
    try {
      const data = await apiFetch<{ caseRecord: CaseDetailPayload['caseRecord'] }>(
        `/api/admin/cases/${caseId}`,
        {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify(updates),
        }
      );
      showToast(
        'ok',
        updates.status
          ? `Updated ${data.caseRecord.caseNumber} status to ${updates.status}.`
          : `Saved updates for ${data.caseRecord.caseNumber}.`
      );
      await Promise.all([loadAnalytics(), loadCases(), loadActivity(), loadNotifications()]);
      if (selectedCaseId === caseId) {
        const refreshed = await apiFetch<CaseDetailPayload>(`/api/admin/cases/${caseId}`, {
          headers: authHeaders(),
        });
        setCaseDetail(refreshed);
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to update case.');
    }
  };

  const handleAddNote = async (caseId: string, content: string) => {
    if (!session) return;
    try {
      await apiFetch(`/api/admin/cases/${caseId}/notes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      });
      showToast('ok', 'Internal note recorded.');
      const refreshed = await apiFetch<CaseDetailPayload>(`/api/admin/cases/${caseId}`, {
        headers: authHeaders(),
      });
      setCaseDetail(refreshed);
      await loadActivity();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to save note.');
    }
  };

  const handleLogout = async () => {
    if (session) {
      await apiFetch('/api/admin/logout', {
        method: 'POST',
        headers: authHeaders(),
      }).catch(() => {});
    }
    setSession(null);
    setSelectedCaseId(null);
    setCaseDetail(null);
    setToast(null);
  };

  const handleCreateUser = async (payload: {
    email: string;
    name: string;
    role: AdminRole;
    password: string;
  }) => {
    if (!session) return;
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const res = await apiFetch<{ users: AdminUser[] }>('/api/admin/users', {
        headers: authHeaders(),
      });
      setUsers(res.users);
      showToast('ok', `Provisioned ${payload.role} account for ${payload.email}.`);
      await loadActivity();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to create user.');
    }
  };

  const handleToggleUserActive = async (userId: string, isActive: boolean) => {
    if (!session) return;
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ isActive }),
      });
      const res = await apiFetch<{ users: AdminUser[] }>('/api/admin/users', {
        headers: authHeaders(),
      });
      setUsers(res.users);
      showToast('ok', isActive ? 'User account enabled.' : 'User account disabled.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to update user.');
    }
  };

  const handleAddProject = async (payload: {
    title: string;
    domain: string;
    tier: string;
    metricValue: string;
    metricLabel: string;
    summary: string;
  }) => {
    if (!session) return;
    try {
      const data = await apiFetch<{ projects: ProjectCase[] }>('/api/admin/projects', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      setProjects(data.projects);
      showToast('ok', 'Portfolio case study added.');
      onContentUpdated();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to add blueprint.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!session) return;
    try {
      const data = await apiFetch<{ projects: ProjectCase[] }>(`/api/admin/projects/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setProjects(data.projects);
      showToast('ok', 'Portfolio case study removed.');
      onContentUpdated();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to remove blueprint.');
    }
  };

  const handleUploadLogo = (file: File | undefined) => {
    if (!file || !session) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('err', 'Only PNG, JPEG, or WebP logo files are permitted.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('err', 'Logo upload must be 2MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      try {
        const data = await apiFetch<{ brand: BrandSettings }>('/api/admin/brand', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ customLogoDataUrl: dataUrl }),
        });
        setBrand(data.brand);
        showToast('ok', 'Brand logo updated.');
        onContentUpdated();
      } catch (err) {
        showToast('err', err instanceof Error ? err.message : 'Unable to save logo.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
    if (!session) return;
    try {
      const data = await apiFetch<{ brand: BrandSettings }>('/api/admin/brand', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ customLogoDataUrl: null }),
      });
      setBrand(data.brand);
      showToast('ok', 'Restored default circular emblem.');
      onContentUpdated();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Unable to restore emblem.');
    }
  };

  if (!open) return null;

  const navItems: Array<{
    id: AdminNavId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'all-cases', label: 'All Cases', icon: FolderKanban, badge: caseList.statusCounts.All },
    { id: 'new-requests', label: 'New Requests', icon: Inbox, badge: caseList.statusCounts.New },
    { id: 'pending', label: 'Pending', icon: Clock, badge: caseList.statusCounts.Pending },
    {
      id: 'follow-up',
      label: 'Follow Up',
      icon: RefreshCw,
      badge: caseList.statusCounts['Follow Up'],
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: CheckCircle2,
      badge: caseList.statusCounts.Completed,
    },
    { id: 'service-analytics', label: 'Service Domain Analytics', icon: BarChart3 },
    { id: 'target-timelines', label: 'Target Timelines', icon: Timer },
    { id: 'reports', label: 'Reports and Exports', icon: FileSpreadsheet },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    { id: 'activity', label: 'Activity Log', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const activeTitle = selectedCaseId
    ? `Case Detail — ${caseDetail?.caseRecord.caseNumber || selectedCaseId}`
    : navItems.find((i) => i.id === activeNav)?.label || 'Overview';

  const isCaseListView =
    !selectedCaseId &&
    ['all-cases', 'new-requests', 'pending', 'follow-up', 'completed'].includes(activeNav);

  const renderSidebarNav = (compact = false) => (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <BrandMark customLogoUrl={brand.customLogoDataUrl} size={32} decorative />
          {!compact && (
            <div className="min-w-0">
              <p className="font-editorial truncate text-sm font-semibold text-[#F5F2EB]">
                Pio Languisan
              </p>
              <p className="truncate text-[11px] text-[#DFC585]">Case Management</p>
            </div>
          )}
        </div>

        <nav aria-label="Admin Navigation" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = !selectedCaseId && activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavSelect(item.id)}
                className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953] ${
                  isActive
                    ? 'bg-[#D1A953] text-[#061823]'
                    : 'text-[#C2D0D6] hover:bg-[#123846]/70 hover:text-[#F5F2EB]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!compact && <span className="truncate">{item.label}</span>}
                </span>
                {!compact && typeof item.badge === 'number' && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      isActive ? 'text-[#061823] font-semibold' : 'text-[#DFC585]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[#D1A953]/15 pt-3 space-y-1">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#C2D0D6] hover:bg-[#123846]/70 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!compact && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-portal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#061823] text-[#F5F2EB]"
    >
      {!session ? (
        <AdminAuthScreen
          hasAdminUsers={authStatus.hasAdminUsers}
          bootstrapConfigured={authStatus.bootstrapConfigured}
          passcodeConfigured={authStatus.passcodeConfigured}
          onAuthenticated={(auth) => {
            setSession(auth);
            loadFullWorkspace(auth.token);
          }}
          onClose={onClose}
        />
      ) : (
        <div className="flex min-h-screen">
          {/* Desktop & Tablet Collapsible Sidebar */}
          <aside
            className={`hidden md:flex shrink-0 flex-col border-r border-[#D1A953]/18 bg-[#081F2B] transition-all ${
              sidebarCollapsed ? 'w-[72px]' : 'w-64'
            }`}
          >
            {renderSidebarNav(sidebarCollapsed)}
          </aside>

          {/* Mobile Drawer Overlay */}
          {mobileDrawerOpen && (
            <div className="fixed inset-0 z-50 flex md:hidden">
              <div
                className="fixed inset-0 bg-black/70"
                onClick={() => setMobileDrawerOpen(false)}
              />
              <aside className="relative z-10 w-72 max-w-[85vw] overflow-y-auto border-r border-[#D1A953]/20 bg-[#081F2B]">
                <div className="flex justify-end p-3 border-b border-[#D1A953]/15">
                  <button
                    type="button"
                    aria-label="Close navigation drawer"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="rounded-lg border border-[#D1A953]/25 p-2 text-[#F5F2EB]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {renderSidebarNav(false)}
              </aside>
            </div>
          )}

          {/* Main Workspace Area */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[#D1A953]/18 bg-[#061823]/95 px-4 py-3 sm:px-6 backdrop-blur-md">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  aria-label="Open admin navigation menu"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="inline-flex md:hidden min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[#D1A953]/25 bg-[#0C2935] text-[#F5F2EB]"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  onClick={() => setSidebarCollapsed((c) => !c)}
                  className="hidden md:inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#D1A953]/25 bg-[#0C2935] text-[#DFC585] hover:bg-[#123846]"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#DFC585]">
                    Admin Case Management
                  </p>
                  <h2
                    id="admin-portal-title"
                    className="font-editorial truncate text-lg sm:text-xl font-semibold text-[#F5F2EB]"
                  >
                    {activeTitle}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="hidden sm:inline-block text-xs text-[#C2D0D6]">
                  {session.user.name} ·{' '}
                  <span className="font-mono text-[#DFC585]">{session.user.role}</span>
                </span>
                <button
                  type="button"
                  onClick={() => loadFullWorkspace()}
                  aria-label="Refresh dashboard data"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D1A953]/25 bg-[#0C2935] px-3 py-1.5 text-xs font-medium text-[#DFC585] hover:bg-[#123846]"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D1A953]/25 bg-[#0C2935] px-3 py-1.5 text-xs font-medium text-[#F5F2EB] hover:bg-[#123846]"
                >
                  <span>Public Site</span>
                </button>
              </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6">
              {toast && (
                <div
                  role={toast.kind === 'err' ? 'alert' : 'status'}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
                    toast.kind === 'err'
                      ? 'border-amber-400/40 bg-amber-500/12 text-amber-200'
                      : 'border-[#D1A953]/40 bg-[#0C2935] text-[#DFC585]'
                  }`}
                >
                  <span>{toast.text}</span>
                  <button
                    type="button"
                    onClick={() => setToast(null)}
                    aria-label="Dismiss notification"
                    className="rounded p-1 hover:bg-[#061823]/40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {selectedCaseId && caseDetail ? (
                <AdminCaseDetailView
                  detail={caseDetail}
                  users={users}
                  onBack={() => {
                    setSelectedCaseId(null);
                    setCaseDetail(null);
                  }}
                  onUpdateCase={handleUpdateCase}
                  onAddNote={handleAddNote}
                />
              ) : activeNav === 'overview' ? (
                <AdminOverviewView
                  analytics={analytics}
                  recentCases={caseList.items}
                  datePreset={datePreset}
                  customFrom={customFrom}
                  customTo={customTo}
                  comparePrevious={comparePrevious}
                  onDatePresetChange={setDatePreset}
                  onCustomFromChange={setCustomFrom}
                  onCustomToChange={setCustomTo}
                  onToggleCompare={setComparePrevious}
                  onOpenCase={handleOpenCase}
                  onNavigateStatus={(status) => {
                    if (status === 'All') handleNavSelect('all-cases');
                    else if (status === 'New') handleNavSelect('new-requests');
                    else if (status === 'Pending') handleNavSelect('pending');
                    else if (status === 'Follow Up') handleNavSelect('follow-up');
                    else if (status === 'Completed') handleNavSelect('completed');
                  }}
                />
              ) : isCaseListView ? (
                <AdminCasesView
                  data={caseList}
                  users={users}
                  filters={caseFilters}
                  loading={casesLoading}
                  onChangeFilters={(next) => setCaseFilters((prev) => ({ ...prev, ...next }))}
                  onStatusChange={(id, status) => handleUpdateCase(id, { status })}
                  onOpenCase={handleOpenCase}
                />
              ) : activeNav === 'service-analytics' ? (
                <AdminAnalyticsView mode="domains" analytics={analytics} />
              ) : activeNav === 'target-timelines' ? (
                <AdminAnalyticsView mode="timelines" analytics={analytics} />
              ) : activeNav === 'reports' ? (
                <AdminReportsView
                  analytics={analytics}
                  userRole={session.user.role}
                  authToken={session.token}
                  onExportMessage={(msg) => showToast('ok', msg)}
                />
              ) : activeNav === 'notifications' ? (
                <AdminNotificationsView
                  notifications={notifications}
                  onMarkRead={async (id) => {
                    await apiFetch(`/api/admin/notifications/${id}/read`, {
                      method: 'PATCH',
                      headers: authHeaders(),
                    });
                    await loadNotifications();
                  }}
                  onMarkAllRead={async () => {
                    await apiFetch('/api/admin/notifications/read-all', {
                      method: 'POST',
                      headers: authHeaders(),
                    });
                    await loadNotifications();
                  }}
                  onOpenCase={handleOpenCase}
                />
              ) : activeNav === 'activity' ? (
                <AdminActivityView activity={activity} onOpenCase={handleOpenCase} />
              ) : (
                <AdminSettingsView
                  userRole={session.user.role}
                  users={users}
                  projects={projects}
                  brand={brand}
                  storageMode={authStatus.storageMode}
                  mailerConfigured={authStatus.mailerConfigured}
                  onCreateUser={handleCreateUser}
                  onToggleUserActive={handleToggleUserActive}
                  onAddProject={handleAddProject}
                  onDeleteProject={handleDeleteProject}
                  onUploadLogo={handleUploadLogo}
                  onResetLogo={handleResetLogo}
                />
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
};
