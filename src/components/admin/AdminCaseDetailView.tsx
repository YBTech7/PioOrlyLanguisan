import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, Plus } from 'lucide-react';
import {
  CLIENT_TIER_SOLUTIONS,
  SERVICE_OFFERINGS,
  TARGET_TIMELINES,
} from '../../data/profileData';
import { CASE_STATUSES, getServiceDomainLabel, getTierLabel } from '../../lib/caseAnalytics';
import type {
  AdminUser,
  CaseDetailPayload,
  CasePriority,
  CaseStatus,
  ClientTierId,
  ServiceDomainId,
  TargetTimelineValue,
} from '../../types';
import {
  DeadlineFlag,
  formatDateTime,
  getPriorityStyles,
  StatusLabel,
  toLocalDateTimeInput,
} from './AdminShared';

interface AdminCaseDetailViewProps {
  detail: CaseDetailPayload;
  users: AdminUser[];
  onBack: () => void;
  onUpdateCase: (
    caseId: string,
    payload: {
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
  ) => Promise<void>;
  onAddNote: (caseId: string, content: string) => Promise<void>;
}

const PRIORITIES: CasePriority[] = ['Low', 'Normal', 'High', 'Urgent'];

export const AdminCaseDetailView: React.FC<AdminCaseDetailViewProps> = ({
  detail,
  users,
  onBack,
  onUpdateCase,
  onAddNote,
}) => {
  const { caseRecord, statusHistory, notes, activity } = detail;

  const [copied, setCopied] = useState(false);
  const [statusDraft, setStatusDraft] = useState<CaseStatus>(caseRecord.status);
  const [statusNote, setStatusNote] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<CasePriority>(caseRecord.priority);
  const [assignedToDraft, setAssignedToDraft] = useState<string>(caseRecord.assignedTo || '');
  const [followUpDraft, setFollowUpDraft] = useState<string>(
    toLocalDateTimeInput(caseRecord.followUpAt)
  );
  const [deadlineDraft, setDeadlineDraft] = useState<string>(
    toLocalDateTimeInput(caseRecord.deadlineAt)
  );
  const [companyDraft, setCompanyDraft] = useState<string>(caseRecord.company);
  const [tierDraft, setTierDraft] = useState<ClientTierId>(caseRecord.tier);
  const [domainDraft, setDomainDraft] = useState<ServiceDomainId>(caseRecord.serviceDomain);
  const [timelineDraft, setTimelineDraft] = useState<TargetTimelineValue>(caseRecord.timeline);

  const [noteContent, setNoteContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCopyRef = async () => {
    try {
      await navigator.clipboard.writeText(caseRecord.caseNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard is unavailable
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdateCase(caseRecord.id, {
        status: statusDraft,
        statusNote: statusNote.trim() || undefined,
      });
      setStatusNote('');
    } finally {
      setSaving(false);
    }
  };

  const handleOperationsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdateCase(caseRecord.id, {
        priority: priorityDraft,
        assignedTo: assignedToDraft || null,
        followUpAt: followUpDraft ? new Date(followUpDraft).toISOString() : null,
        deadlineAt: deadlineDraft ? new Date(deadlineDraft).toISOString() : null,
        company: companyDraft.trim(),
        tier: tierDraft,
        serviceDomain: domainDraft,
        timeline: timelineDraft,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSaving(true);
    try {
      await onAddNote(caseRecord.id, noteContent.trim());
      setNoteContent('');
    } finally {
      setSaving(false);
    }
  };

  const rawPhone = typeof caseRecord.phone === 'string' ? caseRecord.phone.trim() : '';
  const telTarget = rawPhone.replace(/[^\d+]/g, '');
  const hasDialablePhone = Boolean(rawPhone && /^\+?\d+$/.test(telTarget));

  const emailLabel =
    caseRecord.emailStatus === 'pending'
      ? 'Queued'
      : caseRecord.emailStatus === 'sending'
        ? 'Sending'
        : caseRecord.emailStatus === 'sent'
          ? 'Accepted by Gmail'
          : caseRecord.emailStatus === 'review'
            ? 'Needs review'
            : null;

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#DFC585] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953] rounded"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Return to Case List</span>
          </button>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h3 className="font-editorial text-2xl font-semibold text-[#F5F2EB]">
              {caseRecord.caseNumber}
            </h3>
            <StatusLabel status={caseRecord.status} />
            <DeadlineFlag record={caseRecord} />
            <span className={`text-xs font-medium ${getPriorityStyles(caseRecord.priority)}`}>
              Priority: {caseRecord.priority}
            </span>
          </div>
          <p className="font-mono text-xs text-[#C2D0D6]">
            Tracking ID: {caseRecord.id} · Submitted {formatDateTime(caseRecord.createdAt)} ·
            Updated {formatDateTime(caseRecord.updatedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopyRef}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D1A953]/30 bg-[#061823] px-3.5 py-2 text-xs font-medium text-[#DFC585] hover:bg-[#123846] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copied {caseRecord.caseNumber}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copy Case Reference</span>
            </>
          )}
        </button>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Requester Info, Context, Internal Notes, Status History, Activity Timeline */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
            <h4 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
              Requester &amp; Engagement Brief
            </h4>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div>
                <dt className="text-[#DFC585]">Requester Name</dt>
                <dd className="mt-1 text-sm font-medium text-[#F5F2EB]">{caseRecord.name}</dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Email Address</dt>
                <dd className="mt-1">
                  <a
                    href={`mailto:${caseRecord.email}`}
                    className="font-mono text-[#F5F2EB] underline decoration-[#D1A953]/50 underline-offset-2 hover:text-[#DFC585]"
                  >
                    {caseRecord.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Contact Number</dt>
                <dd className="mt-1 font-mono text-[#F5F2EB]">
                  {hasDialablePhone ? (
                    <a
                      href={`tel:${telTarget}`}
                      className="text-[#DFC585] underline decoration-[#D1A953]/50 underline-offset-2 hover:text-[#F5F2EB]"
                    >
                      {rawPhone}
                    </a>
                  ) : (
                    'Not provided'
                  )}
                  {caseRecord.phoneCountryCode && (
                    <span className="ml-2 text-[#C2D0D6]">({caseRecord.phoneCountryCode})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Organization &amp; Tier</dt>
                <dd className="mt-1 text-[#F5F2EB]">
                  {caseRecord.company || 'Independent'} · {getTierLabel(caseRecord.tier)}
                </dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Primary Service Domain</dt>
                <dd className="mt-1 text-[#F5F2EB]">
                  {getServiceDomainLabel(caseRecord.serviceDomain)}
                </dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Target Timeline</dt>
                <dd className="mt-1 text-[#F5F2EB]">{caseRecord.timeline}</dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Assigned Administrator</dt>
                <dd className="mt-1 text-[#F5F2EB]">
                  {caseRecord.assignedToName || caseRecord.assignedToEmail || 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt className="text-[#DFC585]">Follow-Up / Deadline</dt>
                <dd className="mt-1 font-mono tabular-nums text-[#F5F2EB]">
                  Follow-up: {formatDateTime(caseRecord.followUpAt)} · Deadline:{' '}
                  {formatDateTime(caseRecord.deadlineAt)}
                </dd>
              </div>
            </dl>

            {emailLabel && (
              <p className="border-t border-[#D1A953]/12 pt-3 text-xs text-[#DFC585]">
                Notification Mailer: <span className="font-semibold">{emailLabel}</span>
                {caseRecord.providerMessageId && (
                  <span className="ml-2 font-mono text-[#C2D0D6]">
                    (Gmail ID: {caseRecord.providerMessageId})
                  </span>
                )}
              </p>
            )}

            <div className="border-t border-[#D1A953]/15 pt-4">
              <p className="text-xs font-medium text-[#DFC585]">Project Context &amp; Objectives</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#F5F2EB]/90">
                {caseRecord.message}
              </p>
            </div>
          </div>

          {/* Private Internal Notes */}
          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
            <div className="border-b border-[#D1A953]/15 pb-3">
              <h4 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
                Internal Notes
              </h4>
              <p className="text-xs text-[#C2D0D6]">
                Private to authenticated administrators and staff — never exposed publicly.
              </p>
            </div>

            <form onSubmit={handleNoteSubmit} className="space-y-3">
              <label htmlFor="case-internal-note" className="sr-only">
                Add internal note
              </label>
              <textarea
                id="case-internal-note"
                rows={3}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Record triage findings, call notes, or next steps..."
                className="w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3.5 py-2.5 text-xs text-[#F5F2EB] placeholder:text-[#C2D0D6]/50 focus:border-[#D1A953] focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !noteContent.trim()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#D1A953] px-4 py-1.5 text-xs font-semibold text-[#061823] hover:bg-[#DFC585] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Internal Note</span>
                </button>
              </div>
            </form>

            <div className="divide-y divide-[#D1A953]/12">
              {notes.length === 0 ? (
                <p className="py-4 text-xs text-[#C2D0D6]">No internal notes recorded yet.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#DFC585]">
                      <span className="font-medium">{n.authorEmail || 'Admin'}</span>
                      <span className="font-mono tabular-nums text-[#C2D0D6]">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#F5F2EB]">
                      {n.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Immutable Status History & Activity Timeline */}
          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-5">
            <div>
              <h4 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
                Status Change History
              </h4>
              <div className="mt-3 divide-y divide-[#D1A953]/12">
                {statusHistory.map((h) => (
                  <div key={h.id} className="py-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-[#F5F2EB]">
                        {h.previousStatus ? `${h.previousStatus} → ${h.newStatus}` : `Created as ${h.newStatus}`}
                      </span>
                      <span className="font-mono tabular-nums text-[#C2D0D6]">
                        {formatDateTime(h.changedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#DFC585]">By: {h.changedByEmail}</p>
                    {h.note && <p className="text-[#C2D0D6]">Note: {h.note}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
                Case Activity Timeline
              </h4>
              <div className="mt-3 divide-y divide-[#D1A953]/12">
                {activity.map((a) => (
                  <div key={a.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-mono text-[#DFC585]">{a.action}</span>
                      <span className="ml-2 text-[#C2D0D6]">by {a.actorEmail}</span>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[#C2D0D6]">
                      {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Workflow Actions & Metadata Editor */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleStatusSubmit}
            className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4"
          >
            <h4 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
              Change Case Status
            </h4>
            <div>
              <label htmlFor="detail-status" className="block text-xs font-medium text-[#DFC585]">
                Case Status
              </label>
              <select
                id="detail-status"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as CaseStatus)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              >
                {CASE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="detail-status-note" className="block text-xs font-medium text-[#DFC585]">
                Transition Note (Optional, audited)
              </label>
              <input
                id="detail-status-note"
                type="text"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Reason for status update..."
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[42px] rounded-lg bg-[#D1A953] px-4 py-2 text-xs font-semibold text-[#061823] hover:bg-[#DFC585] disabled:opacity-50"
            >
              Update Status
            </button>
          </form>

          <form
            onSubmit={handleOperationsSubmit}
            className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4"
          >
            <h4 className="font-editorial text-lg font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-3">
              Assignment, Schedule &amp; Metadata
            </h4>

            <div>
              <label htmlFor="detail-owner" className="block text-xs font-medium text-[#DFC585]">
                Assign Owner
              </label>
              <select
                id="detail-owner"
                value={assignedToDraft}
                onChange={(e) => setAssignedToDraft(e.target.value)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              >
                <option value="">Unassigned</option>
                {users
                  .filter((u) => u.isActive)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="detail-priority" className="block text-xs font-medium text-[#DFC585]">
                Priority
              </label>
              <select
                id="detail-priority"
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value as CasePriority)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="detail-followup" className="block text-xs font-medium text-[#DFC585]">
                  Follow-Up Date
                </label>
                <input
                  id="detail-followup"
                  type="datetime-local"
                  value={followUpDraft}
                  onChange={(e) => setFollowUpDraft(e.target.value)}
                  className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-2.5 py-2 text-xs text-[#F5F2EB]"
                />
              </div>
              <div>
                <label htmlFor="detail-deadline" className="block text-xs font-medium text-[#DFC585]">
                  Explicit Deadline
                </label>
                <input
                  id="detail-deadline"
                  type="datetime-local"
                  value={deadlineDraft}
                  onChange={(e) => setDeadlineDraft(e.target.value)}
                  className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-2.5 py-2 text-xs text-[#F5F2EB]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="detail-company" className="block text-xs font-medium text-[#DFC585]">
                Organization / Practice
              </label>
              <input
                id="detail-company"
                type="text"
                value={companyDraft}
                onChange={(e) => setCompanyDraft(e.target.value)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              />
            </div>

            <div>
              <label htmlFor="detail-tier" className="block text-xs font-medium text-[#DFC585]">
                Organization Tier
              </label>
              <select
                id="detail-tier"
                value={tierDraft}
                onChange={(e) => setTierDraft(e.target.value as ClientTierId)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              >
                {CLIENT_TIER_SOLUTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="detail-domain" className="block text-xs font-medium text-[#DFC585]">
                Primary Service Domain
              </label>
              <select
                id="detail-domain"
                value={domainDraft}
                onChange={(e) => setDomainDraft(e.target.value as ServiceDomainId)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              >
                {SERVICE_OFFERINGS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.index}. {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="detail-timeline" className="block text-xs font-medium text-[#DFC585]">
                Target Timeline
              </label>
              <select
                id="detail-timeline"
                value={timelineDraft}
                onChange={(e) => setTimelineDraft(e.target.value as TargetTimelineValue)}
                className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#F5F2EB]"
              >
                {TARGET_TIMELINES.map((tl) => (
                  <option key={tl} value={tl}>
                    {tl}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[42px] rounded-lg border border-[#D1A953]/40 bg-[#123846] px-4 py-2 text-xs font-semibold text-[#F5F2EB] hover:bg-[#194B5C] disabled:opacity-50"
            >
              Save Case Metadata
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
