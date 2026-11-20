import React from 'react';
import { getServiceDomainLabel, getTierLabel, isCaseDueSoon, isCaseOverdue } from '../../lib/caseAnalytics';
import type { CasePriority, CaseRecord, CaseStatus } from '../../types';

export function getStatusStyles(status: CaseStatus): string {
  switch (status) {
    case 'New':
      return 'border-[#D1A953]/45 bg-[#D1A953]/12 text-[#DFC585]';
    case 'Pending':
      return 'border-sky-400/40 bg-sky-500/12 text-sky-200';
    case 'Follow Up':
      return 'border-amber-400/40 bg-amber-500/12 text-amber-200';
    case 'Completed':
      return 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200';
  }
}

export function getPriorityStyles(priority: CasePriority): string {
  switch (priority) {
    case 'Urgent':
      return 'text-rose-300';
    case 'High':
      return 'text-amber-300';
    case 'Normal':
      return 'text-[#DFC585]';
    case 'Low':
      return 'text-[#C2D0D6]';
  }
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export const StatusLabel: React.FC<{ status: CaseStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${getStatusStyles(
      status
    )}`}
  >
    {status}
  </span>
);

export const DeadlineFlag: React.FC<{ record: CaseRecord }> = ({ record }) => {
  if (isCaseOverdue(record)) {
    return (
      <span className="inline-flex items-center rounded-md border border-rose-400/45 bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-200 whitespace-nowrap">
        Overdue
      </span>
    );
  }
  if (isCaseDueSoon(record)) {
    return (
      <span className="inline-flex items-center rounded-md border border-amber-400/45 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-200 whitespace-nowrap">
        Due Soon
      </span>
    );
  }
  return null;
};

export { getServiceDomainLabel, getTierLabel };
