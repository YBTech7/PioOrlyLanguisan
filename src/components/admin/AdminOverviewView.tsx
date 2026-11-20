import React from 'react';
import { ArrowRight, Calendar } from 'lucide-react';
import type { CaseRecord, CaseStatus, DashboardAnalytics } from '../../types';
import { DeadlineFlag, formatShortDate, getServiceDomainLabel, StatusLabel } from './AdminShared';

export type DatePreset = 'all' | '7d' | '30d' | '90d' | 'custom';

interface AdminOverviewViewProps {
  analytics: DashboardAnalytics;
  recentCases: CaseRecord[];
  datePreset: DatePreset;
  customFrom: string;
  customTo: string;
  comparePrevious: boolean;
  onDatePresetChange: (preset: DatePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onToggleCompare: (val: boolean) => void;
  onOpenCase: (caseId: string) => void;
  onNavigateStatus: (status: CaseStatus | 'All') => void;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({
  analytics,
  recentCases,
  datePreset,
  customFrom,
  customTo,
  comparePrevious,
  onDatePresetChange,
  onCustomFromChange,
  onCustomToChange,
  onToggleCompare,
  onOpenCase,
  onNavigateStatus,
}) => {
  const { kpis, previousKpis } = analytics;

  const formatDelta = (current: number, prev?: number, suffix = '') => {
    if (prev === undefined || !previousKpis) return null;
    const diff = Number((current - prev).toFixed(1));
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff}${suffix} vs prior period`;
  };

  const kpiCards = [
    {
      label: 'Total Requests',
      value: String(kpis.totalRequests),
      delta: formatDelta(kpis.totalRequests, previousKpis?.totalRequests),
      onClick: () => onNavigateStatus('All'),
    },
    {
      label: 'New Requests',
      value: String(kpis.newRequests),
      delta: formatDelta(kpis.newRequests, previousKpis?.newRequests),
      onClick: () => onNavigateStatus('New'),
    },
    {
      label: 'Pending Requests',
      value: String(kpis.pendingRequests),
      delta: formatDelta(kpis.pendingRequests, previousKpis?.pendingRequests),
      onClick: () => onNavigateStatus('Pending'),
    },
    {
      label: 'Follow Up Requests',
      value: String(kpis.followUpRequests),
      delta: formatDelta(kpis.followUpRequests, previousKpis?.followUpRequests),
      onClick: () => onNavigateStatus('Follow Up'),
    },
    {
      label: 'Completed Requests',
      value: String(kpis.completedRequests),
      delta: formatDelta(kpis.completedRequests, previousKpis?.completedRequests),
      onClick: () => onNavigateStatus('Completed'),
    },
    {
      label: 'Overdue Cases',
      value: String(kpis.overdueCases),
      delta: formatDelta(kpis.overdueCases, previousKpis?.overdueCases),
      emphasis: kpis.overdueCases > 0 ? 'text-rose-300' : 'text-[#F5F2EB]',
      onClick: () => onNavigateStatus('All'),
    },
    {
      label: 'Due Soon',
      value: String(kpis.dueSoonCases),
      delta: formatDelta(kpis.dueSoonCases, previousKpis?.dueSoonCases),
      emphasis: kpis.dueSoonCases > 0 ? 'text-amber-300' : 'text-[#F5F2EB]',
      onClick: () => onNavigateStatus('All'),
    },
    {
      label: 'Completion Rate',
      value: `${kpis.completionRate}%`,
      delta: formatDelta(kpis.completionRate, previousKpis?.completionRate, '%'),
      emphasis: 'text-[#DFC585]',
      onClick: () => onNavigateStatus('Completed'),
    },
  ];

  const maxDomainCount = Math.max(1, ...analytics.byServiceDomain.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Date Filter & Comparison Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-[#D1A953]" aria-hidden="true" />
          <span className="text-xs font-medium text-[#DFC585] mr-1">Date Range:</span>
          {(
            [
              { id: 'all', label: 'All Time' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: '90d', label: 'Last 90 Days' },
              { id: 'custom', label: 'Custom' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onDatePresetChange(opt.id)}
              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                datePreset === opt.id
                  ? 'bg-[#D1A953] text-[#061823]'
                  : 'border border-[#D1A953]/20 bg-[#061823] text-[#C2D0D6] hover:text-[#F5F2EB]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {datePreset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="sr-only" htmlFor="overview-date-from">
                From date
              </label>
              <input
                id="overview-date-from"
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFromChange(e.target.value)}
                className="min-h-[34px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-2.5 py-1 text-xs text-[#F5F2EB]"
              />
              <span className="text-[#C2D0D6]">to</span>
              <label className="sr-only" htmlFor="overview-date-to">
                To date
              </label>
              <input
                id="overview-date-to"
                type="date"
                value={customTo}
                onChange={(e) => onCustomToChange(e.target.value)}
                className="min-h-[34px] rounded-lg border border-[#D1A953]/25 bg-[#061823] px-2.5 py-1 text-xs text-[#F5F2EB]"
              />
            </div>
          )}

          {datePreset !== 'all' && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#C2D0D6]">
              <input
                type="checkbox"
                checked={comparePrevious}
                onChange={(e) => onToggleCompare(e.target.checked)}
                className="h-4 w-4 rounded border-[#D1A953]/40 bg-[#061823] accent-[#D1A953]"
              />
              <span>Compare with previous period</span>
            </label>
          )}
        </div>
      </div>

      {/* 8 Live KPI Cards */}
      <section aria-label="Key Performance Indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="flex flex-col justify-between rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 text-left transition-colors hover:border-[#D1A953]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
          >
            <span className="text-xs font-medium text-[#C2D0D6]">{card.label}</span>
            <span
              className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
                card.emphasis || 'text-[#F5F2EB]'
              }`}
            >
              {card.value}
            </span>
            <span className="mt-2 min-h-[16px] font-mono text-[11px] tabular-nums text-[#DFC585]/85">
              {card.delta || 'Live persisted total'}
            </span>
          </button>
        ))}
      </section>

      {/* 6-Stage Consultation Workflow Pipeline */}
      <section
        aria-label="Consultation Request Lifecycle"
        className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D1A953]/15 pb-3">
          <div>
            <h3 className="font-editorial text-base font-semibold text-[#F5F2EB]">
              Consultation Request Workflow
            </h3>
            <p className="text-xs text-[#C2D0D6]">
              End-to-end case lifecycle from public intake through completion
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-[#DFC585]">
            Overall Completion: {kpis.completionRate}%
          </span>
        </div>

        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { step: '01', title: 'Request Submitted', count: kpis.totalRequests, nav: 'All' as const },
            { step: '02', title: 'Case Created', count: kpis.totalRequests, nav: 'All' as const },
            { step: '03', title: 'Initial Status: New', count: kpis.newRequests, nav: 'New' as const },
            { step: '04', title: 'Administrator Review', count: kpis.pendingRequests, nav: 'Pending' as const },
            { step: '05', title: 'Status Update', count: kpis.followUpRequests, nav: 'Follow Up' as const },
            { step: '06', title: 'Case Completion', count: kpis.completedRequests, nav: 'Completed' as const },
          ].map((stage) => (
            <li key={stage.step}>
              <button
                type="button"
                onClick={() => onNavigateStatus(stage.nav)}
                className="flex h-full w-full flex-col justify-between rounded-lg border border-[#D1A953]/18 bg-[#061823]/75 p-3 text-left transition-colors hover:border-[#D1A953]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
              >
                <span className="font-mono text-[11px] tabular-nums text-[#DFC585]">
                  Stage {stage.step}
                </span>
                <span className="mt-1 text-xs font-medium text-[#F5F2EB] leading-snug">
                  {stage.title}
                </span>
                <span className="mt-2 font-mono text-lg font-semibold tabular-nums text-[#DFC585]">
                  {stage.count}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* Two-column Analytics Snapshot + Recent Cases */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
          <div className="border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Requests by Primary Service Domain
            </h3>
            <p className="mt-0.5 text-xs text-[#C2D0D6]">
              Distribution across all six official service pillars
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {analytics.byServiceDomain.map((row) => (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-[#F5F2EB]">{row.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-[#DFC585]">
                    {row.count} ({row.percentage}%)
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#061823]">
                  <div
                    className="h-full rounded-full bg-[#D1A953] transition-all duration-300"
                    style={{
                      width: row.count === 0 ? '0%' : `${Math.max(4, (row.count / maxDomainCount) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 border-b border-[#D1A953]/15 pb-3">
            <div>
              <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
                Recent Consultation Cases
              </h3>
              <p className="mt-0.5 text-xs text-[#C2D0D6]">
                Latest submissions awaiting triage or follow-up
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateStatus('All')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#DFC585] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {recentCases.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#C2D0D6]">
              No consultation cases recorded for the selected range.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#D1A953]/12">
              {recentCases.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenCase(item.id)}
                  className="flex w-full items-start justify-between gap-3 py-3 text-left transition-colors hover:bg-[#061823]/45 px-2 -mx-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#C2D0D6]">
                      <span className="font-mono font-semibold text-[#DFC585]">
                        {item.caseNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortDate(item.createdAt)}</span>
                      <DeadlineFlag record={item} />
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-[#F5F2EB]">
                      {item.name}
                      {item.company ? ` — ${item.company}` : ''}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#C2D0D6]">
                      {getServiceDomainLabel(item.serviceDomain)} · {item.timeline}
                    </p>
                  </div>
                  <StatusLabel status={item.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Target Timeline Distribution & Overall Case Completion Progress */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
          <div className="border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Target Timeline Distribution
            </h3>
            <p className="mt-0.5 text-xs text-[#C2D0D6]">
              Breakdown across exact target timelines submitted on consultation intake
            </p>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {analytics.byTimeline.map((row) => (
              <div
                key={row.key}
                className="rounded-lg border border-[#D1A953]/15 bg-[#061823]/65 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#F5F2EB]">{row.label}</span>
                  <span className="font-mono tabular-nums text-[#DFC585]">
                    {row.count} ({row.percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#061823]">
                  <div
                    className="h-full rounded-full bg-[#D1A953]"
                    style={{ width: row.count === 0 ? '0%' : `${Math.max(5, row.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Overall Case Resolution Progress
            </h3>
            <p className="mt-0.5 text-xs text-[#C2D0D6]">
              Proportion of recorded consultation requests reaching Completed status
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-3xl font-semibold tabular-nums text-[#DFC585]">
                {kpis.completionRate}%
              </span>
              <span className="font-mono text-xs tabular-nums text-[#C2D0D6]">
                {kpis.completedRequests} of {kpis.totalRequests} completed
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(kpis.completionRate)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Overall case completion progress"
              className="h-3 w-full overflow-hidden rounded-full bg-[#061823]"
            >
              <div
                className="h-full rounded-full bg-[#D1A953] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, kpis.completionRate))}%` }}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 border-t border-[#D1A953]/15 pt-3 text-xs">
            {analytics.byStatus.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2">
                <dt className="text-[#C2D0D6]">{s.label}</dt>
                <dd className="font-mono tabular-nums text-[#F5F2EB]">
                  {s.count} ({s.percentage}%)
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};
