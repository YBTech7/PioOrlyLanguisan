import React from 'react';
import type { DashboardAnalytics, MatrixRow } from '../../types';

interface AdminAnalyticsViewProps {
  mode: 'domains' | 'timelines';
  analytics: DashboardAnalytics;
}

const MatrixTable: React.FC<{ title: string; subtitle: string; rows: MatrixRow[] }> = ({
  title,
  subtitle,
  rows,
}) => (
  <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
    <div className="border-b border-[#D1A953]/15 pb-3">
      <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">{title}</h3>
      <p className="mt-0.5 text-xs text-[#C2D0D6]">{subtitle}</p>
    </div>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#D1A953]/20 text-[11px] font-medium text-[#DFC585]">
            <th className="py-2.5 pr-4">Category</th>
            <th className="px-3 py-2.5 text-right tabular-nums">New</th>
            <th className="px-3 py-2.5 text-right tabular-nums">Pending</th>
            <th className="px-3 py-2.5 text-right tabular-nums">Follow Up</th>
            <th className="px-3 py-2.5 text-right tabular-nums">Completed</th>
            <th className="px-3 py-2.5 text-right tabular-nums">Total</th>
            <th className="pl-3 py-2.5 text-right tabular-nums">Completion %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#D1A953]/12">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-[#061823]/40">
              <td className="py-2.5 pr-4 font-medium text-[#F5F2EB]">{r.label}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[#DFC585]">
                {r.New}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-sky-200">
                {r.Pending}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-200">
                {r['Follow Up']}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-200">
                {r.Completed}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-[#F5F2EB]">
                {r.total}
              </td>
              <td className="pl-3 py-2.5 text-right font-mono tabular-nums text-[#DFC585]">
                {r.completionRate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const AdminAnalyticsView: React.FC<AdminAnalyticsViewProps> = ({ mode, analytics }) => {
  const maxDomainCount = Math.max(1, ...analytics.byServiceDomain.map((d) => d.count));
  const maxTimelineCount = Math.max(1, ...analytics.byTimeline.map((d) => d.count));
  const maxMonthlyVal = Math.max(
    1,
    ...analytics.monthlyTrends.flatMap((m) => [m.submitted, m.completed])
  );

  return (
    <div className="space-y-6">
      {mode === 'domains' ? (
        <>
          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
            <div className="border-b border-[#D1A953]/15 pb-3">
              <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
                Request Quantity by Primary Service Domain
              </h3>
              <p className="mt-0.5 text-xs text-[#C2D0D6]">
                Exact service-domain choices from the public consultation form, including zero-count
                domains
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {analytics.byServiceDomain.map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#F5F2EB]">{row.label}</span>
                    <span className="font-mono tabular-nums text-[#DFC585]">
                      {row.count} requests · {row.percentage}%
                    </span>
                  </div>
                  <div className="h-3.5 w-full overflow-hidden rounded-lg bg-[#061823]">
                    <div
                      className="h-full rounded-lg bg-[#D1A953] transition-all duration-300"
                      style={{
                        width:
                          row.count === 0
                            ? '0%'
                            : `${Math.max(4, (row.count / maxDomainCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <MatrixTable
            title="Service Domain × Status Matrix"
            subtitle="Live breakdown across New, Pending, Follow Up, and Completed cases"
            rows={analytics.serviceDomainMatrix}
          />
        </>
      ) : (
        <>
          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
            <div className="border-b border-[#D1A953]/15 pb-3">
              <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
                Requests by Target Timeline
              </h3>
              <p className="mt-0.5 text-xs text-[#C2D0D6]">
                Based on exact public form timeline selections; overdue counts reflect explicit
                deadlines or follow-up dates only
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {analytics.byTimeline.map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#F5F2EB]">{row.label}</span>
                    <span className="font-mono tabular-nums text-[#DFC585]">
                      {row.count} requests ({row.percentage}%)
                      {(row.overdueCount ?? 0) > 0 && (
                        <span className="ml-2 text-rose-300">· {row.overdueCount} overdue</span>
                      )}
                      {(row.dueSoonCount ?? 0) > 0 && (
                        <span className="ml-2 text-amber-300">· {row.dueSoonCount} due soon</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3.5 w-full overflow-hidden rounded-lg bg-[#061823]">
                    <div
                      className="h-full rounded-lg bg-[#D1A953] transition-all duration-300"
                      style={{
                        width:
                          row.count === 0
                            ? '0%'
                            : `${Math.max(4, (row.count / maxTimelineCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <MatrixTable
            title="Target Timeline × Status Matrix"
            subtitle="Status distribution across each client target timeline selection"
            rows={analytics.timelineMatrix}
          />
        </>
      )}

      {/* Status Distribution & Monthly Trends */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
          <div className="border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Requests by Status
            </h3>
          </div>
          <div className="mt-4 space-y-3">
            {analytics.byStatus.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-xs">
                <span className="text-[#F5F2EB]">{s.label}</span>
                <span className="font-mono tabular-nums text-[#DFC585]">
                  {s.count} ({s.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D1A953]/15 pb-3">
            <h3 className="font-editorial text-lg font-semibold text-[#F5F2EB]">
              Monthly Submission &amp; Completion Trend
            </h3>
            <div className="flex items-center gap-4 text-[11px] text-[#C2D0D6]">
              <span>Submitted (Gold)</span>
              <span>Completed (Teal-Emerald)</span>
            </div>
          </div>

          {analytics.monthlyTrends.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#C2D0D6]">
              No monthly trend data recorded yet.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {analytics.monthlyTrends.map((m) => (
                <div key={m.month} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[#F5F2EB]">{m.month}</span>
                    <span className="font-mono tabular-nums text-[#C2D0D6]">
                      Submitted: <strong className="text-[#DFC585]">{m.submitted}</strong> ·
                      Completed: <strong className="text-emerald-300">{m.completed}</strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    <div className="h-2 w-full rounded bg-[#061823]">
                      <div
                        className="h-2 rounded bg-[#D1A953]"
                        style={{
                          width: m.submitted === 0 ? '0%' : `${Math.max(4, (m.submitted / maxMonthlyVal) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="h-2 w-full rounded bg-[#061823]">
                      <div
                        className="h-2 rounded bg-emerald-400/80"
                        style={{
                          width: m.completed === 0 ? '0%' : `${Math.max(4, (m.completed / maxMonthlyVal) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
