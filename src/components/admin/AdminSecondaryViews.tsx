import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  KeyRound,
  Monitor,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import type {
  AdminInvitation,
  AdminNotification,
  AdminRole,
  AdminSessionInfo,
  AdminUser,
  AuthAuditEvent,
  BrandSettings,
  CaseActivityEntry,
  ProjectCase,
} from '../../types';
import { formatDateTime } from './AdminShared';

export function formatRoleLabel(role: AdminRole): string {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Staff';
}

export const AdminNotificationsView: React.FC<{
  notifications: AdminNotification[];
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenCase: (caseId: string) => void;
}> = ({ notifications, onMarkRead, onMarkAllRead, onOpenCase }) => (
  <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D1A953]/15 pb-3">
      <div>
        <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">Notifications</h3>
        <p className="text-xs text-[#C2D0D6]">
          Synchronized alerts (auto-refreshes every 60s and on manual refresh) for consultation
          cases, assignments, status changes, and upcoming or overdue deadlines
        </p>
      </div>
      <button
        type="button"
        onClick={onMarkAllRead}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D1A953]/30 bg-[#061823] px-3 py-1.5 text-xs font-medium text-[#DFC585] hover:bg-[#123846]"
      >
        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Mark All Read</span>
      </button>
    </div>

    {notifications.length === 0 ? (
      <p className="py-8 text-center text-sm text-[#C2D0D6]">No notifications yet.</p>
    ) : (
      <div className="divide-y divide-[#D1A953]/12">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex flex-wrap items-start justify-between gap-3 py-3.5 px-2 rounded-lg ${
              n.readAt ? 'opacity-75' : 'bg-[#061823]/45'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Bell className="h-3.5 w-3.5 text-[#D1A953]" aria-hidden="true" />
                <span className="font-semibold text-[#F5F2EB]">{n.title}</span>
                {!n.readAt && (
                  <span className="text-[11px] font-medium text-[#DFC585]">· Unread</span>
                )}
              </div>
              <p className="text-xs text-[#C2D0D6]">{n.message}</p>
              <p className="font-mono text-[11px] text-[#C2D0D6]/80">
                {formatDateTime(n.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {n.caseId && (
                <button
                  type="button"
                  onClick={() => onOpenCase(n.caseId!)}
                  className="rounded-lg border border-[#D1A953]/30 bg-[#061823] px-3 py-1.5 text-xs font-medium text-[#DFC585] hover:bg-[#123846]"
                >
                  Open Case
                </button>
              )}
              {!n.readAt && (
                <button
                  type="button"
                  onClick={() => onMarkRead(n.id)}
                  className="rounded-lg border border-[#D1A953]/20 px-3 py-1.5 text-xs text-[#C2D0D6] hover:text-[#F5F2EB]"
                >
                  Mark Read
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const AdminActivityView: React.FC<{
  activity: CaseActivityEntry[];
  auditEvents?: AuthAuditEvent[];
  userRole: AdminRole;
  onOpenCase: (caseId: string) => void;
}> = ({ activity, auditEvents = [], userRole, onOpenCase }) => {
  const [query, setQuery] = useState('');
  const filtered = activity.filter((item) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      item.action.toLowerCase().includes(q) ||
      item.actorEmail.toLowerCase().includes(q) ||
      (item.caseNumber || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D1A953]/15 pb-3">
          <div>
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Immutable Case &amp; Operations Activity Log
            </h3>
            <p className="text-xs text-[#C2D0D6]">
              Chronological trail of case submissions, status transitions, notes, exports, and team
              updates
            </p>
          </div>
          <input
            type="search"
            aria-label="Filter activity log"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by action, actor, or CASE ID..."
            className="min-h-[38px] w-full sm:w-64 rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#C2D0D6]">No activity entries found.</p>
        ) : (
          <div className="divide-y divide-[#D1A953]/12">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-[#DFC585]">{item.action}</span>
                    {item.caseNumber && item.caseId && (
                      <button
                        type="button"
                        onClick={() => onOpenCase(item.caseId!)}
                        className="font-mono text-[#F5F2EB] underline decoration-[#D1A953]/50 underline-offset-2 hover:text-[#DFC585]"
                      >
                        {item.caseNumber}
                      </button>
                    )}
                    <span className="text-[#C2D0D6]">by {item.actorEmail}</span>
                  </div>
                  {Object.keys(item.metadata || {}).length > 0 && (
                    <p className="font-mono text-[11px] text-[#C2D0D6]/85 break-all">
                      {JSON.stringify(item.metadata)}
                    </p>
                  )}
                </div>
                <span className="font-mono tabular-nums text-[11px] text-[#C2D0D6]">
                  {formatDateTime(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {userRole === 'super_admin' && (
        <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
          <div className="border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Authentication Security Events
            </h3>
            <p className="text-xs text-[#C2D0D6]">
              Sign-in attempts, MFA challenges, password recoveries, invitation acceptances, and
              session revocations (Super Admin only)
            </p>
          </div>
          {auditEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#C2D0D6]">
              No authentication security events recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-[#D1A953]/12">
              {auditEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-[#DFC585]">{ev.eventType}</span>
                      <span
                        className={`font-mono text-[11px] ${
                          ev.result === 'success' ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        [{ev.result}]
                      </span>
                      <span className="text-[#C2D0D6]">{ev.actorEmail || 'anonymous'}</span>
                    </div>
                    <p className="font-mono text-[11px] text-[#C2D0D6]/75">
                      IP: {ev.ipAddress || 'unknown'}
                      {Object.keys(ev.metadata || {}).length > 0
                        ? ` · ${JSON.stringify(ev.metadata)}`
                        : ''}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-[#C2D0D6]">
                    {formatDateTime(ev.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AdminSettingsView: React.FC<{
  viewMode?: 'users' | 'settings';
  currentUserId: string | null;
  userRole: AdminRole;
  mfaEnabled: boolean;
  users: AdminUser[];
  invitations: AdminInvitation[];
  sessions: AdminSessionInfo[];
  projects: ProjectCase[];
  brand: BrandSettings;
  storageMode: string;
  mailerConfigured: boolean;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onSetupMfa: () => Promise<{ secret: string; otpauthUrl: string } | null>;
  onEnableMfa: (secret: string, code: string) => Promise<void>;
  onDisableMfa: () => Promise<void>;
  onCreateUser: (payload: {
    email: string;
    name: string;
    role: AdminRole;
    password: string;
  }) => Promise<void>;
  onUpdateUser: (userId: string, changes: { role?: AdminRole; isActive?: boolean }) => Promise<void>;
  onCreateInvitation: (payload: {
    email: string;
    name: string;
    role: AdminRole;
  }) => Promise<{ emailed: boolean; manualInviteUrl?: string } | null>;
  onRevokeSession: (sessionId: string) => Promise<void>;
  onAddProject: (payload: {
    title: string;
    domain: string;
    tier: string;
    metricValue: string;
    metricLabel: string;
    summary: string;
  }) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onUploadLogo: (file: File | undefined) => void;
  onResetLogo: () => Promise<void>;
}> = ({
  viewMode = 'settings',
  currentUserId,
  userRole,
  mfaEnabled,
  users,
  invitations,
  sessions,
  projects,
  brand,
  storageMode,
  mailerConfigured,
  onChangePassword,
  onSetupMfa,
  onEnableMfa,
  onDisableMfa,
  onCreateUser,
  onUpdateUser,
  onCreateInvitation,
  onRevokeSession,
  onAddProject,
  onDeleteProject,
  onUploadLogo,
  onResetLogo,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [mfaSetupSecret, setMfaSetupSecret] = useState<string | null>(null);
  const [mfaSetupUri, setMfaSetupUri] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');

  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userRoleInput, setUserRoleInput] = useState<AdminRole>('staff');
  const [userPassword, setUserPassword] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('staff');
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDomain, setNewDomain] = useState('Data Analytics');
  const [newTier, setNewTier] = useState('SMB & Enterprise');
  const [newMetricValue, setNewMetricValue] = useState('+35%');
  const [newMetricLabel, setNewMetricLabel] = useState('Operational throughput improvement');
  const [newSummary, setNewSummary] = useState('');

  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmUserToggleId, setConfirmUserToggleId] = useState<string | null>(null);

  const isSuperAdmin = userRole === 'super_admin';
  const isAdminOrSuper = userRole === 'super_admin' || userRole === 'admin';
  const showSettingsSections = viewMode === 'settings';
  const showUsersSection = viewMode === 'users' || viewMode === 'settings';

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onChangePassword(currentPassword, newPassword);
    setCurrentPassword('');
    setNewPassword('');
  };

  const handleStartMfa = async () => {
    const setup = await onSetupMfa();
    if (setup) {
      setMfaSetupSecret(setup.secret);
      setMfaSetupUri(setup.otpauthUrl);
      setMfaVerifyCode('');
    }
  };

  const handleConfirmMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaSetupSecret) return;
    await onEnableMfa(mfaSetupSecret, mfaVerifyCode.trim());
    setMfaSetupSecret(null);
    setMfaSetupUri(null);
    setMfaVerifyCode('');
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    await onCreateUser({
      email: userEmail.trim(),
      name: userName.trim(),
      role: userRoleInput,
      password: userPassword,
    });
    setUserEmail('');
    setUserName('');
    setUserPassword('');
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    const res = await onCreateInvitation({
      email: inviteEmail.trim(),
      name: inviteName.trim(),
      role: inviteRole,
    });
    if (res) {
      setInviteEmail('');
      setInviteName('');
      setGeneratedInviteUrl(res.manualInviteUrl || null);
    }
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !newTitle.trim() || !newSummary.trim()) return;
    await onAddProject({
      title: newTitle.trim(),
      domain: newDomain,
      tier: newTier,
      metricValue: newMetricValue,
      metricLabel: newMetricLabel,
      summary: newSummary.trim(),
    });
    setNewTitle('');
    setNewSummary('');
  };

  return (
    <div className="space-y-6">
      {/* System Configuration Status */}
      {showSettingsSections && (
        <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
          <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
            Storage &amp; Notification Integrations
          </h3>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
            <div>
              <dt className="text-[#DFC585]">Case &amp; Auth Persistence Engine</dt>
              <dd className="mt-1 font-mono text-[#F5F2EB]">
                {storageMode === 'postgres'
                  ? 'PostgreSQL Relational Database'
                  : 'Transactional File/Memory Store'}
              </dd>
            </div>
            <div>
              <dt className="text-[#DFC585]">External Gmail Mailer (Cases &amp; Recovery)</dt>
              <dd className="mt-1 font-mono text-[#F5F2EB]">
                {mailerConfigured
                  ? 'Configured (Active for Case Alerts & Recovery Links)'
                  : 'Not Configured (In-App Notifications Active)'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Account Password & Multi-Factor Authentication */}
      {showSettingsSections && currentUserId && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={handlePasswordSubmit}
            className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4"
          >
            <div className="border-b border-[#D1A953]/15 pb-3">
              <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
                Change Account Password
              </h3>
              <p className="text-xs text-[#C2D0D6]">
                Requires 12+ characters with uppercase, lowercase, and a digit or symbol.
              </p>
            </div>
            <div>
              <label htmlFor="sec-cur-pw" className="block text-xs font-medium text-[#DFC585]">
                Current Password
              </label>
              <input
                id="sec-cur-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
              />
            </div>
            <div>
              <label htmlFor="sec-new-pw" className="block text-xs font-medium text-[#DFC585]">
                New Strong Password
              </label>
              <input
                id="sec-new-pw"
                type="password"
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#D1A953] px-4 py-2 text-xs font-semibold text-[#061823] hover:bg-[#DFC585]"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Update Password</span>
            </button>
          </form>

          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
            <div className="border-b border-[#D1A953]/15 pb-3">
              <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
                Authenticator MFA (TOTP)
              </h3>
              <p className="text-xs text-[#C2D0D6]">
                Protect your administrator session with 6-digit authenticator verification codes.
              </p>
            </div>

            {mfaEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Multi-factor authentication is currently active on your account.</span>
                </div>
                <button
                  type="button"
                  onClick={onDisableMfa}
                  className="min-h-[40px] rounded-lg border border-[#D1A953]/30 bg-[#061823] px-4 py-2 text-xs font-medium text-[#F5F2EB] hover:border-amber-400/50 hover:text-amber-200"
                >
                  Disable MFA
                </button>
              </div>
            ) : mfaSetupSecret ? (
              <form onSubmit={handleConfirmMfa} className="space-y-3">
                <div className="rounded-lg border border-[#D1A953]/25 bg-[#061823] p-3 text-xs space-y-1.5">
                  <p className="text-[#DFC585] font-medium">
                    Add this secret key to your authenticator app:
                  </p>
                  <p className="font-mono text-[#F5F2EB] select-all break-all">{mfaSetupSecret}</p>
                  {mfaSetupUri && (
                    <p className="font-mono text-[11px] text-[#C2D0D6] break-all">
                      URI: {mfaSetupUri}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="mfa-verify-code" className="block text-xs text-[#DFC585]">
                    Enter 6-Digit Code to Confirm
                  </label>
                  <input
                    id="mfa-verify-code"
                    type="text"
                    inputMode="numeric"
                    value={mfaVerifyCode}
                    onChange={(e) => setMfaVerifyCode(e.target.value)}
                    placeholder="000000"
                    required
                    className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 font-mono text-sm text-[#F5F2EB]"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="min-h-[38px] rounded-lg bg-[#D1A953] px-4 py-1.5 text-xs font-semibold text-[#061823]"
                  >
                    Verify &amp; Enable MFA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaSetupSecret(null);
                      setMfaSetupUri(null);
                    }}
                    className="min-h-[38px] rounded-lg border border-[#D1A953]/25 px-3 py-1.5 text-xs text-[#C2D0D6]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-[#C2D0D6]">
                  <ShieldAlert className="h-4 w-4 text-[#D1A953]" aria-hidden="true" />
                  <span>MFA is currently not enabled on your account.</span>
                </div>
                <button
                  type="button"
                  onClick={handleStartMfa}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D1A953]/35 bg-[#061823] px-4 py-2 text-xs font-medium text-[#DFC585] hover:bg-[#123846]"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Configure Authenticator MFA</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Sessions */}
      <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
        <div className="border-b border-[#D1A953]/15 pb-3">
          <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
            Active Console Sessions ({sessions.filter((s) => !s.revokedAt).length})
          </h3>
          <p className="text-xs text-[#C2D0D6]">
            {isSuperAdmin
              ? 'View and revoke active administrator and staff login sessions across the platform.'
              : 'Monitor and revoke your own active login sessions.'}
          </p>
        </div>

        {sessions.length === 0 ? (
          <p className="py-4 text-xs text-[#C2D0D6]">No active session records found.</p>
        ) : (
          <div className="divide-y divide-[#D1A953]/12">
            {sessions.slice(0, 15).map((sess) => (
              <div
                key={sess.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Monitor className="h-3.5 w-3.5 text-[#D1A953] shrink-0" aria-hidden="true" />
                    <span className="font-medium text-[#F5F2EB]">
                      {sess.name} ({formatRoleLabel(sess.role)})
                    </span>
                    <span className="text-[#C2D0D6]">{sess.email}</span>
                    {sess.isCurrent && (
                      <span className="font-mono text-[11px] text-[#DFC585]">· Current</span>
                    )}
                    {sess.revokedAt && (
                      <span className="font-mono text-[11px] text-amber-300">· Revoked</span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-[#C2D0D6]/80 truncate">
                    IP: {sess.ipAddress || 'unknown'} · Expires {formatDateTime(sess.expiresAt)}
                  </p>
                </div>
                {!sess.revokedAt && !sess.isCurrent && (
                  confirmRevokeId === sess.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await onRevokeSession(sess.id);
                          setConfirmRevokeId(null);
                        }}
                        className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#061823]"
                      >
                        Confirm Revoke
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(null)}
                        className="rounded-lg border border-[#D1A953]/25 px-2.5 py-1.5 text-xs text-[#C2D0D6]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(sess.id)}
                      className="rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB] hover:border-amber-400/50 hover:text-amber-200"
                    >
                      Revoke Session
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Access Control (RBAC) */}
      {showUsersSection && isAdminOrSuper && (
        <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-5">
          <div className="border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Team Accounts &amp; Role-Based Access
            </h3>
            <p className="text-xs text-[#C2D0D6]">
              Super Admins manage roles, invitations, and security policies; Admins oversee full
              analytics and reports; Staff manage assigned or unassigned cases.
            </p>
          </div>

          {isSuperAdmin ? (
            <div className="space-y-6">
              <form onSubmit={handleUserSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                />
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="Work email"
                  required
                  className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                />
                <select
                  aria-label="New user role"
                  value={userRoleInput}
                  onChange={(e) => setUserRoleInput(e.target.value as AdminRole)}
                  className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <input
                  type="password"
                  minLength={12}
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="Strong password (12+ chars)"
                  required
                  className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                />
                <div className="sm:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#D1A953] px-4 py-1.5 text-xs font-semibold text-[#061823]"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Create Team User</span>
                  </button>
                </div>
              </form>

              {/* Team Invitations */}
              <div className="border-t border-[#D1A953]/15 pt-5 space-y-3">
                <h4 className="font-editorial text-base font-semibold text-[#F5F2EB]">
                  Invite Team Member (Single-Use Activation Link)
                </h4>
                <form onSubmit={handleInviteSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Invitee full name"
                    required
                    className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                  />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Invitee email"
                    required
                    className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                  />
                  <select
                    aria-label="Invitee role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as AdminRole)}
                    className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[#D1A953]/40 bg-[#123846] px-4 py-1.5 text-xs font-semibold text-[#F5F2EB] hover:bg-[#194B5C]"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Create Invite</span>
                  </button>
                </form>

                {generatedInviteUrl && (
                  <div className="rounded-lg border border-[#D1A953]/30 bg-[#061823] p-3 text-xs space-y-1">
                    <p className="text-[#DFC585] font-medium">
                      Email mailer is not configured; share this single-use 72-hour invite link
                      securely:
                    </p>
                    <p className="font-mono text-[#F5F2EB] break-all select-all">
                      {generatedInviteUrl}
                    </p>
                  </div>
                )}

                {invitations.length > 0 && (
                  <div className="divide-y divide-[#D1A953]/10">
                    {invitations.slice(0, 8).map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                      >
                        <span className="text-[#F5F2EB]">
                          {inv.name} ({inv.email}) ·{' '}
                          <span className="font-mono text-[#DFC585]">
                            {formatRoleLabel(inv.role)}
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-[#C2D0D6]">
                          {inv.acceptedAt
                            ? `Accepted ${formatDateTime(inv.acceptedAt)}`
                            : `Expires ${formatDateTime(inv.expiresAt)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#C2D0D6]">
              Creating, inviting, or deactivating team accounts is restricted to Super
              Administrators.
            </p>
          )}

          <div className="divide-y divide-[#D1A953]/12">
            {users.length === 0 ? (
              <p className="py-4 text-xs text-[#C2D0D6]">
                No individual team user accounts provisioned yet.
              </p>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
                >
                  <div>
                    <p className="font-medium text-[#F5F2EB]">
                      {u.name} ·{' '}
                      <span className="font-mono text-[#DFC585]">{formatRoleLabel(u.role)}</span>
                      {u.mfaEnabled && (
                        <span className="ml-2 font-mono text-[11px] text-emerald-300">
                          [MFA]
                        </span>
                      )}
                    </p>
                    <p className="text-[#C2D0D6]">{u.email}</p>
                  </div>
                  {isSuperAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Change role for ${u.name}`}
                        value={u.role}
                        onChange={(e) => onUpdateUser(u.id, { role: e.target.value as AdminRole })}
                        className="min-h-[34px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-2.5 py-1 text-xs text-[#F5F2EB]"
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                      {u.isActive ? (
                        confirmUserToggleId === u.id ? (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                await onUpdateUser(u.id, { isActive: false });
                                setConfirmUserToggleId(null);
                              }}
                              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#061823]"
                            >
                              Confirm Disable
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmUserToggleId(null)}
                              className="rounded-lg border border-[#D1A953]/25 px-2.5 py-1.5 text-xs text-[#C2D0D6]"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmUserToggleId(u.id)}
                            className="rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB] hover:border-amber-400/50 hover:text-amber-200"
                          >
                            Active (Disable)
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpdateUser(u.id, { isActive: true })}
                          className="rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#DFC585]"
                        >
                          Disabled (Enable)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Portfolio Case Studies & Brand Assets (Super Admin Only) */}
      {showSettingsSections && isSuperAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
              Public Portfolio Case Studies ({projects.length})
            </h3>
            <form onSubmit={handleProjectSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Project title"
                required
                className="min-h-[38px] rounded-lg border border-[#D1A953]/20 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Domain"
                className="min-h-[38px] rounded-lg border border-[#D1A953]/20 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
              <input
                type="text"
                value={newMetricValue}
                onChange={(e) => setNewMetricValue(e.target.value)}
                placeholder="Metric (e.g. -40%)"
                className="min-h-[38px] rounded-lg border border-[#D1A953]/20 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
              <input
                type="text"
                value={newMetricLabel}
                onChange={(e) => setNewMetricLabel(e.target.value)}
                placeholder="Metric description"
                className="min-h-[38px] rounded-lg border border-[#D1A953]/20 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
              <textarea
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
                placeholder="Project summary..."
                required
                rows={2}
                className="sm:col-span-2 rounded-lg border border-[#D1A953]/20 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#D1A953] px-4 py-1.5 text-xs font-semibold text-[#061823]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Blueprint</span>
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-[#D1A953]/15 bg-[#061823]/60 p-3"
                >
                  <div>
                    <p className="text-[11px] text-[#DFC585]">
                      {p.domain} · {p.metricValue} {p.metricLabel}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-[#F5F2EB]">{p.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteProject(p.id)}
                    aria-label={`Delete ${p.title}`}
                    className="rounded-lg border border-[#D1A953]/20 p-2 text-[#C2D0D6] hover:text-amber-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 space-y-3">
              <h3 className="font-editorial text-base font-semibold text-[#F5F2EB]">
                Official PL Monogram Logo
              </h3>
              <p className="text-xs leading-relaxed text-[#C2D0D6]">
                Upload a custom PL logo file (PNG, JPEG, or WebP, max 2MB) to override the circular
                emblem in the public navigation bar and footer.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#123846] px-4 py-2 text-xs font-semibold text-[#F5F2EB] hover:bg-[#194B5C]">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Upload PL Logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => onUploadLogo(e.target.files?.[0])}
                />
              </label>
              {brand.customLogoDataUrl && (
                <button
                  type="button"
                  onClick={onResetLogo}
                  className="ml-3 text-xs text-[#DFC585] underline"
                >
                  Restore Default
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
