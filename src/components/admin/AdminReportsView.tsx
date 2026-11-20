import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { SERVICE_OFFERINGS, TARGET_TIMELINES } from '../../data/profileData';
import { getApiUrl } from '../../lib/apiClient';
import { CASE_STATUSES } from '../../lib/caseAnalytics';
import type {
  AdminRole,
  CaseStatus,
  DashboardAnalytics,
  ServiceDomainId,
  TargetTimelineValue,
} from '../../types';

interface AdminReportsViewProps {
  analytics: DashboardAnalytics;
  userRole: AdminRole;
  authToken: string;
  onExportMessage: (msg: string) => void;
}

export const AdminReportsView: React.FC<AdminReportsViewProps> = ({
  analytics,
  userRole,
  authToken,
  onExportMessage,
}) => {
  const [status, setStatus] = useState<CaseStatus | 'All'>('All');
  const [serviceDomain, setServiceDomain] = useState<ServiceDomainId | 'All'>('All');
  const [timeline, setTimeline] = useState<TargetTimelineValue | 'All'>('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState(false);

  const handleExportCsv = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'All') params.set('status', status);
      if (serviceDomain !== 'All') params.set('serviceDomain', serviceDomain);
      if (timeline !== 'All') params.set('timeline', timeline);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());

      const res = await fetch(getApiUrl(`/api/admin/reports/export?${params.toString()}`), {
        credentials: 'include',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed.' }));
        throw new Error(err.error || 'Unable to export CSV report.');
      }

      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consultation-cases-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onExportMessage('Filtered CSV report downloaded and audited.');
    } catch (err) {
      onExportMessage(err instanceof Error ? err.message : 'Unable to export report.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#D1A953]/15 pb-4">
          <div>
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Executive Reports &amp; CSV Export
            </h3>
            <p className="mt-0.5 text-xs text-[#C2D0D6]">
              Exports filtered case records with status summary, service-domain distribution,
              timeline distribution, monthly trends, and spreadsheet formula-injection protection.
            </p>
          </div>
          {userRole === 'admin' ? (
            <button
              type="button"
              disabled={downloading}
              onClick={handleExportCsv}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#D1A953] px-4 py-2 text-xs font-semibold text-[#061823] hover:bg-[#DFC585] disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{downloading ? 'Exporting...' : 'Download CSV Report'}</span>
            </button>
          ) : (
            <span className="rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-2 text-xs text-[#C2D0D6]">
              CSV exports are restricted to Administrator role
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            aria-label="Export status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus | 'All')}
            className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          >
            <option value="All">All Statuses</option>
            {CASE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            aria-label="Export service domain filter"
            value={serviceDomain}
            onChange={(e) => setServiceDomain(e.target.value as ServiceDomainId | 'All')}
            className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          >
            <option value="All">All Service Domains</option>
            {SERVICE_OFFERINGS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.index}. {s.title}
              </option>
            ))}
          </select>

          <select
            aria-label="Export timeline filter"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value as TargetTimelineValue | 'All')}
            className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          >
            <option value="All">All Target Timelines</option>
            {TARGET_TIMELINES.map((tl) => (
              <option key={tl} value={tl}>
                {tl}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Export from date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          />

          <input
            type="date"
            aria-label="Export to date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="min-h-[40px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          />
        </div>
      </div>

      {/* Live Summary Tables Included in Export */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 space-y-3">
          <h4 className="font-editorial text-base font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-2">
            Status Summary
          </h4>
          {analytics.byStatus.map((row) => (
            <div key={row.key} className="flex justify-between text-xs">
              <span className="text-[#F5F2EB]">{row.label}</span>
              <span className="font-mono tabular-nums text-[#DFC585]">
                {row.count} ({row.percentage}%)
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 space-y-3">
          <h4 className="font-editorial text-base font-semibold text-[#F5F2EB] border-b border-[#D1A953]/15 pb-2">
            Target Timeline Distribution
          </h4>
          {analytics.byTimeline.map((row) => (
            <div key={row.key} className="flex justify-between text-xs">
              <span className="text-[#F5F2EB]">{row.label}</span>
              <span className="font-mono tabular-nums text-[#DFC585]">
                {row.count} ({row.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
