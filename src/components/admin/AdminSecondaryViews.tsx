import React, { useState } from 'react';
import { Bell, CheckCheck, Plus, Trash2, Upload } from 'lucide-react';
import type {
  AdminNotification,
  AdminRole,
  AdminUser,
  BrandSettings,
  CaseActivityEntry,
  ProjectCase,
} from '../../types';
import { formatDateTime } from './AdminShared';

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
          Real-time alerts for newly persisted consultation cases and assignments
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
  onOpenCase: (caseId: string) => void;
}> = ({ activity, onOpenCase }) => {
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
    <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D1A953]/15 pb-3">
        <div>
          <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
            Immutable Activity Audit Log
          </h3>
          <p className="text-xs text-[#C2D0D6]">
            Chronological trail of case submissions, status transitions, notes, exports, and team
            changes
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
                  <p className="font-mono text-[11px] text-[#C2D0D6]/85">
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
  );
};

export const AdminSettingsView: React.FC<{
  userRole: AdminRole;
  users: AdminUser[];
  projects: ProjectCase[];
  brand: BrandSettings;
  storageMode: string;
  mailerConfigured: boolean;
  onCreateUser: (payload: {
    email: string;
    name: string;
    role: AdminRole;
    password: string;
  }) => Promise<void>;
  onToggleUserActive: (userId: string, isActive: boolean) => Promise<void>;
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
  userRole,
  users,
  projects,
  brand,
  storageMode,
  mailerConfigured,
  onCreateUser,
  onToggleUserActive,
  onAddProject,
  onDeleteProject,
  onUploadLogo,
  onResetLogo,
}) => {
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userRoleInput, setUserRoleInput] = useState<AdminRole>('staff');
  const [userPassword, setUserPassword] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newDomain, setNewDomain] = useState('Data Analytics');
  const [newTier, setNewTier] = useState('SMB & Enterprise');
  const [newMetricValue, setNewMetricValue] = useState('+35%');
  const [newMetricLabel, setNewMetricLabel] = useState('Operational throughput improvement');
  const [newSummary, setNewSummary] = useState('');

  const isAdmin = userRole === 'admin';

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
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

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newTitle.trim() || !newSummary.trim()) return;
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
      <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
        <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
          Storage &amp; Notification Integrations
        </h3>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div>
            <dt className="text-[#DFC585]">Case Persistence Engine</dt>
            <dd className="mt-1 font-mono text-[#F5F2EB]">
              {storageMode === 'postgres' ? 'PostgreSQL Relational Database' : 'Transactional File/Memory Store'}
            </dd>
          </div>
          <div>
            <dt className="text-[#DFC585]">External Gmail Notification Mailer</dt>
            <dd className="mt-1 font-mono text-[#F5F2EB]">
              {mailerConfigured
                ? 'Configured (Retryable Background Outbox Active)'
                : 'Optional / Not Configured (In-App Notifications Active)'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Team Access Control (RBAC) */}
      <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-5">
        <div className="border-b border-[#D1A953]/15 pb-3">
          <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
            Team Accounts &amp; Role-Based Access
          </h3>
          <p className="text-xs text-[#C2D0D6]">
            Administrators manage team accounts, CSV exports, and portfolio settings; Staff manage
            case triage, statuses, and internal notes.
          </p>
        </div>

        {isAdmin ? (
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
            </select>
            <input
              type="password"
              minLength={10}
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="Password (10+ chars)"
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
        ) : (
          <p className="text-xs text-[#C2D0D6]">
            Team user provisioning is restricted to Administrator accounts.
          </p>
        )}

        <div className="divide-y divide-[#D1A953]/12">
          {users.length === 0 ? (
            <p className="py-4 text-xs text-[#C2D0D6]">
              No individual team user accounts provisioned yet.
            </p>
          ) : (
            users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div>
                  <p className="font-medium text-[#F5F2EB]">
                    {u.name} · <span className="font-mono text-[#DFC585]">{u.role}</span>
                  </p>
                  <p className="text-[#C2D0D6]">{u.email}</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onToggleUserActive(u.id, !u.isActive)}
                    className="rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
                  >
                    {u.isActive ? 'Active (Disable)' : 'Disabled (Enable)'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Portfolio Case Studies & Brand Assets (Admin Only) */}
      {isAdmin && (
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
