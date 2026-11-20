import React from 'react';
import { ChevronLeft, ChevronRight, Eye, Search } from 'lucide-react';
import { SERVICE_OFFERINGS, TARGET_TIMELINES } from '../../data/profileData';
import { CASE_STATUSES, getServiceDomainShortLabel, getTierLabel } from '../../lib/caseAnalytics';
import type {
  AdminUser,
  CaseListResponse,
  CaseStatus,
  ServiceDomainId,
  TargetTimelineValue,
} from '../../types';
import { DeadlineFlag, formatShortDate, StatusLabel } from './AdminShared';

export interface CasesFilterState {
  search: string;
  status: CaseStatus | 'All';
  serviceDomain: ServiceDomainId | 'All';
  timeline: TargetTimelineValue | 'All';
  assignedTo: string;
  from: string;
  to: string;
  sortBy: 'submittedAt' | 'updatedAt' | 'followUpAt' | 'caseNumber' | 'status';
  sortDir: 'asc' | 'desc';
  page: number;
}

interface AdminCasesViewProps {
  data: CaseListResponse;
  users: AdminUser[];
  filters: CasesFilterState;
  loading: boolean;
  onChangeFilters: (next: Partial<CasesFilterState>) => void;
  onStatusChange: (caseId: string, newStatus: CaseStatus) => Promise<void>;
  onOpenCase: (caseId: string) => void;
}

export const AdminCasesView: React.FC<AdminCasesViewProps> = ({
  data,
  users,
  filters,
  loading,
  onChangeFilters,
  onStatusChange,
  onOpenCase,
}) => {
  return (
    <div className="space-y-4">
      {/* Search and Combined Filter Controls */}
      <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#D1A953]/75"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search cases"
              value={filters.search}
              onChange={(e) => onChangeFilters({ search: e.target.value, page: 1 })}
              placeholder="Search CASE ID, requester, org, email..."
              className="min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] pl-9 pr-3 py-1.5 text-xs text-[#F5F2EB] placeholder:text-[#C2D0D6]/60 focus:border-[#D1A953] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
            />
          </div>

          <div className="md:col-span-2">
            <select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(e) =>
                onChangeFilters({ status: e.target.value as CaseStatus | 'All', page: 1 })
              }
              className="min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none"
            >
              <option value="All">All Statuses ({data.statusCounts.All ?? data.total})</option>
              {CASE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st} ({data.statusCounts[st] ?? 0})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              aria-label="Filter by service domain"
              value={filters.serviceDomain}
              onChange={(e) =>
                onChangeFilters({
                  serviceDomain: e.target.value as ServiceDomainId | 'All',
                  page: 1,
                })
              }
              className="min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none"
            >
              <option value="All">All Service Domains</option>
              {SERVICE_OFFERINGS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.index}. {s.title}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              aria-label="Filter by target timeline"
              value={filters.timeline}
              onChange={(e) =>
                onChangeFilters({
                  timeline: e.target.value as TargetTimelineValue | 'All',
                  page: 1,
                })
              }
              className="min-h-[40px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB] focus:border-[#D1A953] focus:outline-none"
            >
              <option value="All">All Target Timelines</option>
              {TARGET_TIMELINES.map((tl) => (
                <option key={tl} value={tl}>
                  {tl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            aria-label="Filter by assigned owner"
            value={filters.assignedTo}
            onChange={(e) => onChangeFilters({ assignedTo: e.target.value, page: 1 })}
            className="min-h-[38px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          >
            <option value="All">All Owners</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Submitted from date"
            value={filters.from}
            onChange={(e) => onChangeFilters({ from: e.target.value, page: 1 })}
            className="min-h-[38px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          />

          <input
            type="date"
            aria-label="Submitted to date"
            value={filters.to}
            onChange={(e) => onChangeFilters({ to: e.target.value, page: 1 })}
            className="min-h-[38px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          />

          <select
            aria-label="Sort cases by"
            value={`${filters.sortBy}:${filters.sortDir}`}
            onChange={(e) => {
              const [sortBy, sortDir] = e.target.value.split(':') as [
                CasesFilterState['sortBy'],
                CasesFilterState['sortDir'],
              ];
              onChangeFilters({ sortBy, sortDir, page: 1 });
            }}
            className="min-h-[38px] w-full rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1.5 text-xs text-[#F5F2EB]"
          >
            <option value="submittedAt:desc">Newest Received</option>
            <option value="submittedAt:asc">Oldest Received</option>
            <option value="updatedAt:desc">Recently Updated</option>
            <option value="followUpAt:asc">Next Follow Up</option>
            <option value="caseNumber:asc">Case ID (Ascending)</option>
            <option value="caseNumber:desc">Case ID (Descending)</option>
          </select>

          <button
            type="button"
            onClick={() =>
              onChangeFilters({
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
              })
            }
            className="min-h-[38px] rounded-lg border border-[#D1A953]/25 px-3 py-1.5 text-xs font-medium text-[#DFC585] hover:bg-[#061823]"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Desktop & Tablet Data Table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-[#D1A953]/20 bg-[#0C2935]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#D1A953]/20 bg-[#061823]/75 text-[11px] font-medium text-[#DFC585]">
              <th className="px-4 py-3 whitespace-nowrap">Case ID</th>
              <th className="px-4 py-3 whitespace-nowrap">Date Received</th>
              <th className="px-4 py-3">Requester</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Primary Service Domain</th>
              <th className="px-4 py-3 whitespace-nowrap">Target Timeline</th>
              <th className="px-4 py-3 whitespace-nowrap">Current Status</th>
              <th className="px-4 py-3 whitespace-nowrap">Assigned To</th>
              <th className="px-4 py-3 whitespace-nowrap">Next Follow Up</th>
              <th className="px-4 py-3 whitespace-nowrap">Last Updated</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D1A953]/12">
            {loading && data.items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-[#C2D0D6]">
                  Loading cases...
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-[#C2D0D6]">
                  No consultation cases match the active filters.
                </td>
              </tr>
            ) : (
              data.items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-[#061823]/45">
                  <td className="px-4 py-3 font-mono font-semibold text-[#DFC585] whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenCase(item.id)}
                      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953] rounded"
                    >
                      {item.caseNumber}
                    </button>
                    <div className="mt-1">
                      <DeadlineFlag record={item} />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-[#C2D0D6] whitespace-nowrap">
                    {formatShortDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#F5F2EB]">{item.name}</p>
                    <p className="text-[11px] text-[#C2D0D6]">{item.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#F5F2EB]">{item.company || 'Independent'}</p>
                    <p className="text-[11px] text-[#C2D0D6]">{getTierLabel(item.tier)}</p>
                  </td>
                  <td className="px-4 py-3 text-[#F5F2EB]">
                    {getServiceDomainShortLabel(item.serviceDomain)}
                  </td>
                  <td className="px-4 py-3 text-[#C2D0D6] whitespace-nowrap">{item.timeline}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      aria-label={`Status for ${item.name}`}
                      value={item.status}
                      onChange={(e) => onStatusChange(item.id, e.target.value as CaseStatus)}
                      className="min-h-[34px] rounded-lg border border-[#D1A953]/30 bg-[#061823] px-2.5 py-1 text-xs font-medium text-[#DFC585] focus:border-[#D1A953] focus:outline-none"
                    >
                      {CASE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[#C2D0D6] whitespace-nowrap">
                    {item.assignedToName || item.assignedToEmail || 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-[#C2D0D6] whitespace-nowrap">
                    {formatShortDate(item.followUpAt)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-[#C2D0D6] whitespace-nowrap">
                    {formatShortDate(item.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenCase(item.id)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#D1A953]/30 bg-[#061823] px-3 py-1 text-xs font-medium text-[#DFC585] hover:bg-[#123846] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D1A953]"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Details</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List (< md) */}
      <div className="space-y-3 md:hidden">
        {data.items.length === 0 ? (
          <div className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-6 text-center text-sm text-[#C2D0D6]">
            No consultation cases match the active filters.
          </div>
        ) : (
          data.items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-[#D1A953]/20 bg-[#0C2935] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#DFC585]">
                      {item.caseNumber}
                    </span>
                    <DeadlineFlag record={item} />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#F5F2EB]">{item.name}</p>
                  <p className="text-xs text-[#C2D0D6]">
                    {item.company || 'Independent'} · {getTierLabel(item.tier)}
                  </p>
                </div>
                <StatusLabel status={item.status} />
              </div>

              <div className="text-xs text-[#C2D0D6] space-y-1">
                <p>Service: {getServiceDomainShortLabel(item.serviceDomain)}</p>
                <p>Timeline: {item.timeline}</p>
                <p className="font-mono tabular-nums">
                  Received: {formatShortDate(item.createdAt)} · Follow-up:{' '}
                  {formatShortDate(item.followUpAt)}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[#D1A953]/12 pt-3">
                <select
                  aria-label={`Mobile status for ${item.name}`}
                  value={item.status}
                  onChange={(e) => onStatusChange(item.id, e.target.value as CaseStatus)}
                  className="min-h-[40px] rounded-lg border border-[#D1A953]/30 bg-[#061823] px-3 py-1.5 text-xs font-medium text-[#DFC585]"
                >
                  {CASE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onOpenCase(item.id)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#D1A953] px-3.5 py-1.5 text-xs font-semibold text-[#061823]"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open Case</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D1A953]/20 bg-[#0C2935] px-4 py-3 text-xs text-[#C2D0D6]">
        <span className="font-mono tabular-nums">
          Showing page {data.page} of {data.totalPages} ({data.total} total cases)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={data.page <= 1}
            onClick={() => onChangeFilters({ page: Math.max(1, data.page - 1) })}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1 text-xs font-medium text-[#F5F2EB] disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            disabled={data.page >= data.totalPages}
            onClick={() => onChangeFilters({ page: Math.min(data.totalPages, data.page + 1) })}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#D1A953]/25 bg-[#061823] px-3 py-1 text-xs font-medium text-[#F5F2EB] disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
