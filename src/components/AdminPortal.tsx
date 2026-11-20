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
  ShieldAlert,
  Timer,
  X,
} from 'lucide-react';
import { adminNavToPath, type AdminNavId } from '../lib/adminRouter';
import { apiFetch, ApiError } from '../lib/apiClient';
import { computeDashboardAnalytics } from '../lib/caseAnalytics';
import type {
  AdminInvitation,
  AdminNotification,
  AdminRole,
  AdminSessionInfo,
  AdminUser,
  AuthAuditEvent,
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
import type { AuthSessionInfo } from './admin/AdminLoginPage';
import { AdminCaseDetailView } from './admin/AdminCaseDetailView';
import { AdminCasesView, type CasesFilterState } from './admin/AdminCasesView';
import { AdminOverviewView, type DatePreset } from './admin/AdminOverviewView';
import { AdminReportsView } from './admin/AdminReportsView';
import {
  AdminActivityView,
  AdminNotificationsView,
  AdminSettingsView,
  formatRoleLabel,
} from './admin/AdminSecondaryViews';

export interface AdminPortalProps {
  session: AuthSessionInfo;
  authStatus: {
    hasAdminUsers: boolean;
    bootstrapConfigured: boolean;
    passcodeConfigured: boolean;
    storageMode: string;
    mailerConfigured: boolean;
  };
  routeNav: AdminNavId;
  routeCaseId: string | null;
  onNavigatePath: (appPath: string) => void;
  onLogout: () => Promise<void>;
  onSessionExpired: () => void;
  onSessionUserUpdate: (patch: Partial<AuthSessionInfo['user']>) => void;
  onContentUpdated: () => void;
}

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

function navToStatusFilter(navId: AdminNavId): CaseStatus | 'All' {
  if (navId === 'new-requests') return 'New';
  if (navId === 'pending') return 'Pending';
  if (navId === 'follow-up') return 'Follow Up';
  if (navId === 'completed') return 'Completed';
  return 'All';
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  session,
  authStatus,
  routeNav,
  routeCaseId,
  onNavigatePath,
  onLogout,
  onSessionExpired,
  onSessionUserUpdate,
  onContentUpdated,
}) => {
  const [caseDetail, setCaseDetail] = useState<CaseDetailPayload | null>(null);
  const [caseDetailError, setCaseDetailError] = useState<string | null>(null);
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
  const [caseFilters, setCaseFilters] = useState<CasesFilterState>(() => ({
    search: '',
    status: navToStatusFilter(routeNav),
    serviceDomain: 'All',
    timeline: 'All',
    assignedTo: 'All',
    from: '',
    to: '',
    sortBy: 'submittedAt',
    sortDir: 'desc',
    page: 1,
  }));
  const [casesLoading, setCasesLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [sessions, setSessions] = useState<AdminSessionInfo[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuthAuditEvent[]>([]);
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

  const isSuperAdmin = session.user.role === 'super_admin';
  const isAdminOrSuper = session.user.role === 'super_admin' || session.user.role === 'admin';

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
  }, []);

  const wipeLocalState = useCallback(() => {
    setCaseDetail(null);
    setCaseDetailError(null);
    setAnalytics(EMPTY_ANALYTICS);
    setCaseList(EMPTY_CASE_LIST);
    setUsers([]);
    setInvitations([]);
    setSessions([]);
    setAuditEvents([]);
    setNotifications([]);
    setUnreadCount(0);
    setActivity([]);
    setProjects([]);
    setToast(null);
  }, []);

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'SESSION_EXPIRED')) {
        wipeLocalState();
        onSessionExpired();
        return;
      }
      showToast('err', err instanceof Error ? err.message : fallbackMessage);
    },
    [wipeLocalState, onSessionExpired, showToast]
  );

  const authHeaders = useCallback((): Record<string, string> => {
    return session.token ? { Authorization: `Bearer ${session.token}` } : {};
  }, [session.token]);

  // Synchronize URL-selected status filter
  useEffect(() => {
    if (['all-cases', 'new-requests', 'pending', 'follow-up', 'completed'].includes(routeNav)) {
      const targetStatus = navToStatusFilter(routeNav);
      setCaseFilters((prev) =>
        prev.status === targetStatus ? prev : { ...prev, status: targetStatus, page: 1 }
      );
    }
  }, [routeNav]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileDrawerOpen) {
          setMobileDrawerOpen(false);
        } else if (routeCaseId) {
          onNavigatePath('/admin/cases');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileDrawerOpen, routeCaseId, onNavigatePath]);

  const loadAnalytics = useCallback(async () => {
    if (!isAdminOrSuper) return;
    const bounds = computeDateBounds(datePreset, customFrom, customTo);
    const params = new URLSearchParams();
    if (bounds.fromIso) params.set('from', bounds.fromIso);
    if (bounds.toIso) params.set('to', bounds.toIso);
    if (comparePrevious && bounds.fromIso && bounds.toIso) {
      params.set('comparePrevious', 'true');
    }
    const data = await apiFetch<DashboardAnalytics>(
      `/api/admin/analytics?${params.toString()}`,
      { headers: authHeaders() }
    );
    setAnalytics(data);
  }, [isAdminOrSuper, datePreset, customFrom, customTo, comparePrevious, authHeaders]);

  const loadCases = useCallback(
    async (filtersOverride?: CasesFilterState) => {
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
          { headers: authHeaders() }
        );
        setCaseList(data);
      } finally {
        setCasesLoading(false);
      }
    },
    [caseFilters, authHeaders]
  );

  const loadNotifications = useCallback(async () => {
    const data = await apiFetch<{ notifications: AdminNotification[]; unreadCount: number }>(
      '/api/admin/notifications',
      { headers: authHeaders() }
    );
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  }, [authHeaders]);

  const loadActivity = useCallback(async () => {
    if (!isAdminOrSuper) return;
    const data = await apiFetch<{ activity: CaseActivityEntry[] }>(
      '/api/admin/activity?limit=150',
      { headers: authHeaders() }
    );
    setActivity(data.activity || []);
  }, [isAdminOrSuper, authHeaders]);

  const loadSessions = useCallback(async () => {
    const data = await apiFetch<{ sessions: AdminSessionInfo[] }>('/api/admin/sessions', {
      headers: authHeaders(),
    });
    setSessions(data.sessions || []);
  }, [authHeaders]);

  const loadSecurityExtras = useCallback(async () => {
    if (!isSuperAdmin) return;
    const [invRes, auditRes] = await Promise.all([
      apiFetch<{ invitations: AdminInvitation[] }>('/api/admin/invitations', {
        headers: authHeaders(),
      }).catch(() => ({ invitations: [] })),
      apiFetch<{ events: AuthAuditEvent[] }>('/api/admin/audit-events?limit=100', {
        headers: authHeaders(),
      }).catch(() => ({ events: [] })),
    ]);
    setInvitations(invRes.invitations || []);
    setAuditEvents(auditRes.events || []);
  }, [isSuperAdmin, authHeaders]);

  const loadFullWorkspace = useCallback(async () => {
    try {
      const dash = await apiFetch<{
        inquiries: CaseListResponse['items'];
        projects: ProjectCase[];
        brand: BrandSettings;
        analytics?: DashboardAnalytics;
        users?: AdminUser[];
        unreadNotifications?: number;
      }>('/api/admin/dashboard', { headers: authHeaders() });

      setProjects(dash.projects || []);
      if (dash.brand) setBrand(dash.brand);
      if (dash.users) setUsers(dash.users);
      if (dash.analytics) setAnalytics(dash.analytics);
      if (typeof dash.unreadNotifications === 'number') {
        setUnreadCount(dash.unreadNotifications);
      }

      const tasks: Promise<unknown>[] = [
        loadCases(),
        loadNotifications().catch(() => {}),
        loadSessions().catch(() => {}),
      ];
      if (isAdminOrSuper) {
        tasks.push(loadActivity().catch(() => {}));
      }
      if (isSuperAdmin) {
        tasks.push(loadSecurityExtras().catch(() => {}));
      }
      await Promise.all(tasks);
    } catch (err) {
      handleApiError(err, 'Unable to load dashboard.');
    }
  }, [
    authHeaders,
    loadCases,
    loadNotifications,
    loadSessions,
    isAdminOrSuper,
    loadActivity,
    isSuperAdmin,
    loadSecurityExtras,
    handleApiError,
  ]);

  useEffect(() => {
    loadFullWorkspace();
  }, [loadFullWorkspace]);

  useEffect(() => {
    if (isAdminOrSuper) {
      loadAnalytics().catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.code === 'SESSION_EXPIRED')) {
          handleApiError(err, 'Session expired.');
        }
      });
    }
  }, [isAdminOrSuper, datePreset, customFrom, customTo, comparePrevious, loadAnalytics, handleApiError]);

  useEffect(() => {
    loadCases().catch((err) => {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'SESSION_EXPIRED')) {
        handleApiError(err, 'Session expired.');
      }
    });
  }, [caseFilters, loadCases, handleApiError]);

  // Synchronize selected case detail with /admin/cases/:caseId route
  useEffect(() => {
    if (!routeCaseId) {
      setCaseDetail(null);
      setCaseDetailError(null);
      return;
    }
    let cancelled = false;
    setCaseDetailError(null);
    apiFetch<CaseDetailPayload>(`/api/admin/cases/${encodeURIComponent(routeCaseId)}`, {
      headers: authHeaders(),
    })
      .then((detail) => {
        if (!cancelled) setCaseDetail(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.code === 'SESSION_EXPIRED')) {
          handleApiError(err, 'Session expired.');
          return;
        }
        setCaseDetail(null);
        setCaseDetailError(
          err instanceof Error ? err.message : 'Unable to open requested consultation case.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [routeCaseId, authHeaders, handleApiError]);

  const handleOpenCase = (caseId: string) => {
    setMobileDrawerOpen(false);
    onNavigatePath(adminNavToPath('all-cases', caseId));
  };

  const handleNavSelect = (navId: AdminNavId) => {
    setMobileDrawerOpen(false);
    onNavigatePath(adminNavToPath(navId));
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
      await Promise.all([
        isAdminOrSuper ? loadAnalytics() : loadFullWorkspace(),
        loadCases(),
        isAdminOrSuper ? loadActivity() : Promise.resolve(),
        loadNotifications(),
      ]);
      if (routeCaseId === caseId) {
        const refreshed = await apiFetch<CaseDetailPayload>(`/api/admin/cases/${caseId}`, {
          headers: authHeaders(),
        });
        setCaseDetail(refreshed);
      }
    } catch (err) {
      handleApiError(err, 'Unable to update case.');
    }
  };

  const handleAddNote = async (caseId: string, content: string) => {
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
      if (isAdminOrSuper) await loadActivity();
    } catch (err) {
      handleApiError(err, 'Unable to save note.');
    }
  };

  const handleLogoutClick = async () => {
    wipeLocalState();
    await onLogout();
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const res = await apiFetch<{ message?: string }>('/api/auth/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showToast('ok', res.message || 'Password updated cleanly.');
      await loadSessions();
    } catch (err) {
      handleApiError(err, 'Unable to update password.');
    }
  };

  const handleSetupMfa = async (): Promise<{ secret: string; otpauthUrl: string } | null> => {
    try {
      return await apiFetch<{ secret: string; otpauthUrl: string }>('/api/auth/mfa/setup', {
        method: 'POST',
        headers: authHeaders(),
      });
    } catch (err) {
      handleApiError(err, 'Unable to initiate MFA setup.');
      return null;
    }
  };

  const handleEnableMfa = async (secret: string, code: string) => {
    try {
      await apiFetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ secret, code }),
      });
      onSessionUserUpdate({ mfaEnabled: true });
      showToast('ok', 'Two-factor authenticator verification enabled.');
      await loadSecurityExtras();
    } catch (err) {
      handleApiError(err, 'Unable to verify MFA code.');
    }
  };

  const handleDisableMfa = async () => {
    try {
      await apiFetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: authHeaders(),
      });
      onSessionUserUpdate({ mfaEnabled: false });
      showToast('ok', 'Two-factor authentication disabled.');
      await loadSecurityExtras();
    } catch (err) {
      handleApiError(err, 'Unable to disable MFA.');
    }
  };

  const handleCreateUser = async (payload: {
    email: string;
    name: string;
    role: AdminRole;
    password: string;
  }) => {
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
      showToast('ok', `Provisioned ${formatRoleLabel(payload.role)} account for ${payload.email}.`);
      await Promise.all([loadActivity(), loadSecurityExtras()]);
    } catch (err) {
      handleApiError(err, 'Unable to create user.');
    }
  };

  const handleUpdateUser = async (
    userId: string,
    changes: { role?: AdminRole; isActive?: boolean }
  ) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(changes),
      });
      const res = await apiFetch<{ users: AdminUser[] }>('/api/admin/users', {
        headers: authHeaders(),
      });
      setUsers(res.users);
      showToast('ok', 'Team account updated and affected sessions synchronized.');
      await Promise.all([loadSessions(), loadSecurityExtras()]);
    } catch (err) {
      handleApiError(err, 'Unable to update user.');
    }
  };

  const handleCreateInvitation = async (payload: {
    email: string;
    name: string;
    role: AdminRole;
  }): Promise<{ emailed: boolean; manualInviteUrl?: string } | null> => {
    try {
      const res = await apiFetch<{
        invitation: AdminInvitation;
        emailed: boolean;
        manualInviteUrl?: string;
      }>('/api/admin/invitations', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      showToast(
        'ok',
        res.emailed
          ? `Invitation email sent to ${payload.email}.`
          : `Created single-use invitation for ${payload.email}.`
      );
      await loadSecurityExtras();
      return { emailed: res.emailed, manualInviteUrl: res.manualInviteUrl };
    } catch (err) {
      handleApiError(err, 'Unable to create invitation.');
      return null;
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiFetch(`/api/admin/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: authHeaders(),
      });
      showToast('ok', 'Active session revoked.');
      await Promise.all([loadSessions(), loadSecurityExtras()]);
    } catch (err) {
      handleApiError(err, 'Unable to revoke session.');
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
      handleApiError(err, 'Unable to add blueprint.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const data = await apiFetch<{ projects: ProjectCase[] }>(`/api/admin/projects/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setProjects(data.projects);
      showToast('ok', 'Portfolio case study removed.');
      onContentUpdated();
    } catch (err) {
      handleApiError(err, 'Unable to remove blueprint.');
    }
  };

  const handleUploadLogo = (file: File | undefined) => {
    if (!file) return;
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
        handleApiError(err, 'Unable to save logo.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
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
      handleApiError(err, 'Unable to restore emblem.');
    }
  };

  const allNavItems: Array<{
    id: AdminNavId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    adminOnly?: boolean;
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
    { id: 'service-analytics', label: 'Service Domain Analytics', icon: BarChart3, adminOnly: true },
    { id: 'target-timelines', label: 'Target Timelines', icon: Timer, adminOnly: true },
    { id: 'reports', label: 'Reports and Exports', icon: FileSpreadsheet, adminOnly: true },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    { id: 'activity', label: 'Activity Log', icon: Activity, adminOnly: true },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdminOrSuper);

  const activeTitle = routeCaseId
    ? `Case Detail — ${caseDetail?.caseRecord.caseNumber || routeCaseId}`
    : allNavItems.find((i) => i.id === routeNav)?.label || 'Overview';

  const isCaseListView =
    !routeCaseId &&
    ['all-cases', 'new-requests', 'pending', 'follow-up', 'completed'].includes(routeNav);

  const isRestrictedRoute =
    !isAdminOrSuper &&
    ['service-analytics', 'target-timelines', 'reports', 'activity'].includes(routeNav);

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
            const isActive = !routeCaseId && routeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
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
          onClick={handleLogoutClick}
          className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#C2D0D6] hover:bg-[#123846]/70 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!compact && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#061823] text-[#F5F2EB]">
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
                <h1
                  id="admin-portal-title"
                  className="font-editorial truncate text-lg sm:text-xl font-semibold text-[#F5F2EB]"
                >
                  {activeTitle}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <span className="hidden sm:inline-block text-xs text-[#C2D0D6]">
                {session.user.name} ·{' '}
                <span className="font-mono text-[#DFC585]">
                  {formatRoleLabel(session.user.role)}
                </span>
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
                onClick={() => onNavigatePath('/')}
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

            {isRestrictedRoute ? (
              <div className="rounded-xl border border-amber-400/35 bg-[#0C2935] p-6 space-y-3">
                <div className="flex items-center gap-2 text-amber-200">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  <h2 className="font-editorial text-lg font-semibold">
                    Administrator Role Required
                  </h2>
                </div>
                <p className="text-xs leading-relaxed text-[#C2D0D6]">
                  Your current account role ({formatRoleLabel(session.user.role)}) does not permit
                  access to organization-wide analytics, CSV exports, or immutable audit logs.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigatePath('/admin/dashboard')}
                  className="min-h-[38px] rounded-lg bg-[#D1A953] px-4 py-1.5 text-xs font-semibold text-[#061823]"
                >
                  Return to Overview
                </button>
              </div>
            ) : routeCaseId ? (
              caseDetailError ? (
                <div className="rounded-xl border border-amber-400/35 bg-[#0C2935] p-6 space-y-3">
                  <p className="text-sm font-medium text-amber-200">{caseDetailError}</p>
                  <button
                    type="button"
                    onClick={() => onNavigatePath('/admin/cases')}
                    className="min-h-[38px] rounded-lg bg-[#D1A953] px-4 py-1.5 text-xs font-semibold text-[#061823]"
                  >
                    Return to Case List
                  </button>
                </div>
              ) : caseDetail ? (
                <AdminCaseDetailView
                  detail={caseDetail}
                  users={users}
                  onBack={() => onNavigatePath('/admin/cases')}
                  onUpdateCase={handleUpdateCase}
                  onAddNote={handleAddNote}
                />
              ) : (
                <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-8 text-center text-xs text-[#C2D0D6]">
                  Loading consultation case…
                </div>
              )
            ) : routeNav === 'overview' ? (
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
            ) : routeNav === 'service-analytics' ? (
              <AdminAnalyticsView mode="domains" analytics={analytics} />
            ) : routeNav === 'target-timelines' ? (
              <AdminAnalyticsView mode="timelines" analytics={analytics} />
            ) : routeNav === 'reports' ? (
              <AdminReportsView
                analytics={analytics}
                userRole={session.user.role}
                authToken={session.token}
                onExportMessage={(msg) => showToast('ok', msg)}
              />
            ) : routeNav === 'notifications' ? (
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
            ) : routeNav === 'activity' ? (
              <AdminActivityView
                activity={activity}
                auditEvents={auditEvents}
                userRole={session.user.role}
                onOpenCase={handleOpenCase}
              />
            ) : (
              <AdminSettingsView
                currentUserId={session.user.id}
                userRole={session.user.role}
                mfaEnabled={Boolean(session.user.mfaEnabled)}
                users={users}
                invitations={invitations}
                sessions={sessions}
                projects={projects}
                brand={brand}
                storageMode={authStatus.storageMode}
                mailerConfigured={authStatus.mailerConfigured}
                onChangePassword={handleChangePassword}
                onSetupMfa={handleSetupMfa}
                onEnableMfa={handleEnableMfa}
                onDisableMfa={handleDisableMfa}
                onCreateUser={handleCreateUser}
                onUpdateUser={handleUpdateUser}
                onCreateInvitation={handleCreateInvitation}
                onRevokeSession={handleRevokeSession}
                onAddProject={handleAddProject}
                onDeleteProject={handleDeleteProject}
                onUploadLogo={handleUploadLogo}
                onResetLogo={handleResetLogo}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
