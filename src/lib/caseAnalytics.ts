import {
  CLIENT_TIER_SOLUTIONS,
  SERVICE_OFFERINGS,
  TARGET_TIMELINES,
} from '../data/profileData.ts';
import type {
  CaseRecord,
  CaseStatus,
  ClientTierId,
  DashboardAnalytics,
  DistributionRow,
  KpiSummary,
  MatrixRow,
  MonthlyTrendPoint,
  ServiceDomainId,
  TargetTimelineValue,
} from '../types.ts';

export const CASE_STATUSES: CaseStatus[] = ['New', 'Pending', 'Follow Up', 'Completed'];

export const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

export function getServiceDomainLabel(id: ServiceDomainId): string {
  const match = SERVICE_OFFERINGS.find((s) => s.id === id);
  return match ? `${match.index}. ${match.title}` : id;
}

export function getServiceDomainShortLabel(id: ServiceDomainId): string {
  const match = SERVICE_OFFERINGS.find((s) => s.id === id);
  return match ? match.shortTitle : id;
}

export function getTierLabel(id: ClientTierId): string {
  const match = CLIENT_TIER_SOLUTIONS.find((t) => t.id === id);
  return match ? match.label : id;
}

export function isCaseOverdue(record: Pick<CaseRecord, 'status' | 'deadlineAt' | 'followUpAt'>, nowMs = Date.now()): boolean {
  if (record.status === 'Completed') return false;
  const deadlineMs = record.deadlineAt ? Date.parse(record.deadlineAt) : NaN;
  const followUpMs = record.followUpAt ? Date.parse(record.followUpAt) : NaN;
  if (!Number.isNaN(deadlineMs) && deadlineMs < nowMs) return true;
  if (!Number.isNaN(followUpMs) && followUpMs < nowMs) return true;
  return false;
}

export function isCaseDueSoon(record: Pick<CaseRecord, 'status' | 'deadlineAt' | 'followUpAt'>, nowMs = Date.now()): boolean {
  if (record.status === 'Completed') return false;
  if (isCaseOverdue(record, nowMs)) return false;
  const horizon = nowMs + DUE_SOON_WINDOW_MS;
  const deadlineMs = record.deadlineAt ? Date.parse(record.deadlineAt) : NaN;
  const followUpMs = record.followUpAt ? Date.parse(record.followUpAt) : NaN;
  if (!Number.isNaN(deadlineMs) && deadlineMs >= nowMs && deadlineMs <= horizon) return true;
  if (!Number.isNaN(followUpMs) && followUpMs >= nowMs && followUpMs <= horizon) return true;
  return false;
}

export function computeKpis(cases: readonly CaseRecord[], nowMs = Date.now()): KpiSummary {
  let newRequests = 0;
  let pendingRequests = 0;
  let followUpRequests = 0;
  let completedRequests = 0;
  let overdueCases = 0;
  let dueSoonCases = 0;

  for (const item of cases) {
    if (item.status === 'New') newRequests += 1;
    else if (item.status === 'Pending') pendingRequests += 1;
    else if (item.status === 'Follow Up') followUpRequests += 1;
    else if (item.status === 'Completed') completedRequests += 1;

    if (isCaseOverdue(item, nowMs)) overdueCases += 1;
    else if (isCaseDueSoon(item, nowMs)) dueSoonCases += 1;
  }

  const totalRequests = cases.length;
  const completionRate =
    totalRequests > 0 ? Number(((completedRequests / totalRequests) * 100).toFixed(1)) : 0;

  return {
    totalRequests,
    newRequests,
    pendingRequests,
    followUpRequests,
    completedRequests,
    overdueCases,
    dueSoonCases,
    completionRate,
  };
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Number(((count / total) * 100).toFixed(1));
}

export function filterCasesByDateRange(
  cases: readonly CaseRecord[],
  fromIso?: string,
  toIso?: string
): CaseRecord[] {
  const fromMs = fromIso ? Date.parse(fromIso) : NaN;
  const toMs = toIso ? Date.parse(toIso) : NaN;
  return cases.filter((c) => {
    const submittedMs = Date.parse(c.createdAt);
    if (Number.isNaN(submittedMs)) return false;
    if (!Number.isNaN(fromMs) && submittedMs < fromMs) return false;
    if (!Number.isNaN(toMs) && submittedMs > toMs) return false;
    return true;
  });
}

export function computeDashboardAnalytics(
  allCases: readonly CaseRecord[],
  options: {
    fromIso?: string;
    toIso?: string;
    comparePrevious?: boolean;
    nowMs?: number;
  } = {}
): DashboardAnalytics {
  const nowMs = options.nowMs ?? Date.now();
  const filtered = filterCasesByDateRange(allCases, options.fromIso, options.toIso);
  const kpis = computeKpis(filtered, nowMs);

  let previousKpis: KpiSummary | null = null;
  if (options.comparePrevious && options.fromIso && options.toIso) {
    const fromMs = Date.parse(options.fromIso);
    const toMs = Date.parse(options.toIso);
    if (!Number.isNaN(fromMs) && !Number.isNaN(toMs) && toMs > fromMs) {
      const span = toMs - fromMs;
      const prevFrom = new Date(fromMs - span).toISOString();
      const prevTo = new Date(fromMs - 1).toISOString();
      const prevFiltered = filterCasesByDateRange(allCases, prevFrom, prevTo);
      previousKpis = computeKpis(prevFiltered, nowMs);
    }
  }

  const total = filtered.length;

  const byStatus: DistributionRow[] = CASE_STATUSES.map((status) => {
    const count = filtered.filter((c) => c.status === status).length;
    return {
      key: status,
      label: status,
      count,
      percentage: pct(count, total),
    };
  });

  const byServiceDomain: DistributionRow[] = SERVICE_OFFERINGS.map((offering) => {
    const matching = filtered.filter((c) => c.serviceDomain === offering.id);
    return {
      key: offering.id,
      label: `${offering.index}. ${offering.title}`,
      count: matching.length,
      percentage: pct(matching.length, total),
      overdueCount: matching.filter((c) => isCaseOverdue(c, nowMs)).length,
      dueSoonCount: matching.filter((c) => isCaseDueSoon(c, nowMs)).length,
    };
  });

  const byTimeline: DistributionRow[] = TARGET_TIMELINES.map((timeline) => {
    const matching = filtered.filter((c) => c.timeline === timeline);
    return {
      key: timeline,
      label: timeline,
      count: matching.length,
      percentage: pct(matching.length, total),
      overdueCount: matching.filter((c) => isCaseOverdue(c, nowMs)).length,
      dueSoonCount: matching.filter((c) => isCaseDueSoon(c, nowMs)).length,
    };
  });

  const serviceDomainMatrix: MatrixRow[] = SERVICE_OFFERINGS.map((offering) => {
    const rows = filtered.filter((c) => c.serviceDomain === offering.id);
    const New = rows.filter((c) => c.status === 'New').length;
    const Pending = rows.filter((c) => c.status === 'Pending').length;
    const followUp = rows.filter((c) => c.status === 'Follow Up').length;
    const Completed = rows.filter((c) => c.status === 'Completed').length;
    const rowTotal = rows.length;
    return {
      key: offering.id,
      label: `${offering.index}. ${offering.title}`,
      New,
      Pending,
      'Follow Up': followUp,
      Completed,
      total: rowTotal,
      completionRate: pct(Completed, rowTotal),
    };
  });

  const timelineMatrix: MatrixRow[] = TARGET_TIMELINES.map((timeline: TargetTimelineValue) => {
    const rows = filtered.filter((c) => c.timeline === timeline);
    const New = rows.filter((c) => c.status === 'New').length;
    const Pending = rows.filter((c) => c.status === 'Pending').length;
    const followUp = rows.filter((c) => c.status === 'Follow Up').length;
    const Completed = rows.filter((c) => c.status === 'Completed').length;
    const rowTotal = rows.length;
    return {
      key: timeline,
      label: timeline,
      New,
      Pending,
      'Follow Up': followUp,
      Completed,
      total: rowTotal,
      completionRate: pct(Completed, rowTotal),
    };
  });

  const monthBuckets = new Map<string, { submitted: number; completed: number }>();
  for (const item of filtered) {
    const subMonth = item.createdAt.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(subMonth)) {
      const entry = monthBuckets.get(subMonth) ?? { submitted: 0, completed: 0 };
      entry.submitted += 1;
      monthBuckets.set(subMonth, entry);
    }
    if (item.status === 'Completed') {
      const compMonth = (item.completedAt || item.updatedAt || item.createdAt).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(compMonth)) {
        const entry = monthBuckets.get(compMonth) ?? { submitted: 0, completed: 0 };
        entry.completed += 1;
        monthBuckets.set(compMonth, entry);
      }
    }
  }

  const monthlyTrends: MonthlyTrendPoint[] = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, counts]) => ({
      month,
      submitted: counts.submitted,
      completed: counts.completed,
    }));

  return {
    kpis,
    previousKpis,
    byStatus,
    byServiceDomain,
    byTimeline,
    serviceDomainMatrix,
    timelineMatrix,
    monthlyTrends,
  };
}

/**
 * Spreadsheet formula-injection protection (OWASP CSV Injection):
 * Prefixes values beginning with =, +, -, @, tab, or CR (ignoring leading whitespace)
 * with a single apostrophe before CSV quoting.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmedLeading = raw.replace(/^\s+/, '');
  const needsFormulaGuard =
    /^[=+\-@\t\r]/.test(raw) || /^[=+\-@\t\r]/.test(trimmedLeading);
  const safe = needsFormulaGuard ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCasesCsvReport(
  cases: readonly CaseRecord[],
  analytics: DashboardAnalytics
): string {
  const lines: string[] = [];

  lines.push(
    [
      'Case Number',
      'Case ID',
      'Date Received (UTC)',
      'Requester Name',
      'Requester Email',
      'Phone Country',
      'Phone Number',
      'Organization',
      'Organization Tier',
      'Primary Service Domain',
      'Target Timeline',
      'Current Status',
      'Priority',
      'Assigned To',
      'Next Follow Up',
      'Deadline',
      'Overdue',
      'Last Updated (UTC)',
      'Project Context',
    ]
      .map(sanitizeCsvCell)
      .join(',')
  );

  for (const c of cases) {
    lines.push(
      [
        c.caseNumber,
        c.id,
        c.createdAt,
        c.name,
        c.email,
        c.phoneCountryCode ?? '',
        c.phone ?? '',
        c.company,
        getTierLabel(c.tier),
        getServiceDomainLabel(c.serviceDomain),
        c.timeline,
        c.status,
        c.priority,
        c.assignedToName || c.assignedToEmail || 'Unassigned',
        c.followUpAt ?? '',
        c.deadlineAt ?? '',
        isCaseOverdue(c) ? 'Yes' : 'No',
        c.updatedAt,
        c.message,
      ]
        .map(sanitizeCsvCell)
        .join(',')
    );
  }

  lines.push('');
  lines.push(['Status Summary', 'Count', 'Percentage'].map(sanitizeCsvCell).join(','));
  for (const row of analytics.byStatus) {
    lines.push([row.label, row.count, `${row.percentage}%`].map(sanitizeCsvCell).join(','));
  }

  lines.push('');
  lines.push(
    ['Service Domain Distribution', 'Count', 'Percentage'].map(sanitizeCsvCell).join(',')
  );
  for (const row of analytics.byServiceDomain) {
    lines.push([row.label, row.count, `${row.percentage}%`].map(sanitizeCsvCell).join(','));
  }

  lines.push('');
  lines.push(
    ['Target Timeline Distribution', 'Count', 'Percentage', 'Overdue'].map(sanitizeCsvCell).join(',')
  );
  for (const row of analytics.byTimeline) {
    lines.push(
      [row.label, row.count, `${row.percentage}%`, row.overdueCount ?? 0]
        .map(sanitizeCsvCell)
        .join(',')
    );
  }

  lines.push('');
  lines.push(
    ['Monthly Request Trends', 'Submitted', 'Completed'].map(sanitizeCsvCell).join(',')
  );
  for (const point of analytics.monthlyTrends) {
    lines.push([point.month, point.submitted, point.completed].map(sanitizeCsvCell).join(','));
  }

  return lines.join('\r\n');
}
