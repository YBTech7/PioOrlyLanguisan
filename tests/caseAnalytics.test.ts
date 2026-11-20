import { describe, expect, it } from 'vitest';
import {
  buildCasesCsvReport,
  computeDashboardAnalytics,
  computeKpis,
  isCaseDueSoon,
  isCaseOverdue,
  sanitizeCsvCell,
} from '../src/lib/caseAnalytics.ts';
import type { CaseRecord } from '../src/types.ts';

function makeCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: 'INQ-2026-0001',
    caseNumber: 'CASE-000001',
    name: 'Test Requester',
    email: 'test@example.com',
    company: 'Acme Ops',
    tier: 'startup',
    serviceDomain: 'technical-support',
    timeline: 'Within 30 days',
    message: 'Need technical support escalation framework.',
    status: 'New',
    priority: 'Normal',
    assignedTo: null,
    createdAt: '2026-11-10T10:00:00.000Z',
    followUpAt: null,
    deadlineAt: null,
    updatedAt: '2026-11-10T10:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('Case Analytics & CSV Export', () => {
  it('computes mutually consistent KPI totals, completion rate, overdue, and due soon separately from status', () => {
    const nowMs = Date.parse('2026-11-19T12:00:00.000Z');
    const records: CaseRecord[] = [
      makeCase({ id: '1', caseNumber: 'CASE-000001', status: 'New', deadlineAt: '2026-11-18T12:00:00.000Z' }), // Overdue
      makeCase({ id: '2', caseNumber: 'CASE-000002', status: 'Pending', followUpAt: '2026-11-20T12:00:00.000Z' }), // Due soon
      makeCase({ id: '3', caseNumber: 'CASE-000003', status: 'Follow Up' }),
      makeCase({ id: '4', caseNumber: 'CASE-000004', status: 'Completed', deadlineAt: '2026-11-01T12:00:00.000Z' }), // Completed never overdue
    ];

    expect(isCaseOverdue(records[0], nowMs)).toBe(true);
    expect(isCaseDueSoon(records[1], nowMs)).toBe(true);
    expect(isCaseOverdue(records[3], nowMs)).toBe(false);

    const kpis = computeKpis(records, nowMs);
    expect(kpis.totalRequests).toBe(4);
    expect(kpis.newRequests + kpis.pendingRequests + kpis.followUpRequests + kpis.completedRequests).toBe(
      kpis.totalRequests
    );
    expect(kpis.overdueCases).toBe(1);
    expect(kpis.dueSoonCases).toBe(1);
    expect(kpis.completionRate).toBe(25);
  });

  it('includes all 6 service domains (even zero-count) and all 4 target timelines', () => {
    const records: CaseRecord[] = [
      makeCase({ id: '1', serviceDomain: 'data-analytics', timeline: 'Immediate (1–2 weeks)' }),
      makeCase({ id: '2', serviceDomain: 'data-analytics', timeline: 'Within 30 days', status: 'Completed' }),
    ];

    const analytics = computeDashboardAnalytics(records, {
      nowMs: Date.parse('2026-11-19T12:00:00.000Z'),
    });

    expect(analytics.byServiceDomain).toHaveLength(6);
    expect(analytics.byServiceDomain.find((d) => d.key === 'data-analytics')?.count).toBe(2);
    expect(analytics.byServiceDomain.find((d) => d.key === 'data-analytics')?.percentage).toBe(100);
    expect(analytics.byServiceDomain.find((d) => d.key === 'web-creation')?.count).toBe(0);

    expect(analytics.byTimeline).toHaveLength(4);
    expect(analytics.byTimeline.find((t) => t.key === 'Immediate (1–2 weeks)')?.count).toBe(1);
    expect(analytics.byTimeline.find((t) => t.key === 'Within 30 days')?.count).toBe(1);
    expect(analytics.byTimeline.find((t) => t.key === 'This quarter')?.count).toBe(0);
  });

  it('protects CSV cells against spreadsheet formula injection', () => {
    expect(sanitizeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
    expect(sanitizeCsvCell('+1234')).toBe('"\'+1234"');
    expect(sanitizeCsvCell('-500')).toBe('"\'-500"');
    expect(sanitizeCsvCell('@SUM(A1:A2)')).toBe('"\'@SUM(A1:A2)"');
    expect(sanitizeCsvCell('  =HYPERLINK("http://evil")')).toBe('"\'  =HYPERLINK(""http://evil"")"');

    const record = makeCase({ name: '=EvilName', company: '+Org' });
    const analytics = computeDashboardAnalytics([record]);
    const csv = buildCasesCsvReport([record], analytics);
    expect(csv).toContain('"\'=EvilName"');
    expect(csv).toContain('"\'+Org"');
    expect(csv).toContain('"Status Summary"');
    expect(csv).toContain('"Service Domain Distribution"');
    expect(csv).toContain('"Target Timeline Distribution"');
    expect(csv).toContain('"Monthly Request Trends"');
  });

  it('handles division by zero safely when there are zero cases in scope', () => {
    const analytics = computeDashboardAnalytics([], {
      nowMs: Date.parse('2026-11-19T12:00:00.000Z'),
    });

    expect(analytics.kpis).toEqual({
      totalRequests: 0,
      newRequests: 0,
      pendingRequests: 0,
      followUpRequests: 0,
      completedRequests: 0,
      overdueCases: 0,
      dueSoonCases: 0,
      completionRate: 0,
    });
    expect(analytics.byStatus.every((row) => row.count === 0 && row.percentage === 0)).toBe(true);
    expect(analytics.byServiceDomain).toHaveLength(6);
    expect(analytics.byServiceDomain.every((row) => row.count === 0 && row.percentage === 0)).toBe(true);
    expect(analytics.byTimeline).toHaveLength(4);
    expect(analytics.byTimeline.every((row) => row.count === 0 && row.percentage === 0)).toBe(true);
    expect(analytics.serviceDomainMatrix.every((row) => row.completionRate === 0)).toBe(true);
  });

  it('enforces exact 48-hour Due Soon and Overdue boundaries', () => {
    const nowMs = Date.parse('2026-11-19T12:00:00.000Z');
    const overdueBy1Ms = makeCase({ id: 'o1', deadlineAt: '2026-11-19T11:59:59.999Z' });
    const dueNow = makeCase({ id: 'd1', deadlineAt: '2026-11-19T12:00:00.000Z' });
    const dueExact48h = makeCase({ id: 'd2', deadlineAt: '2026-11-21T12:00:00.000Z' });
    const beyond48h = makeCase({ id: 'd3', deadlineAt: '2026-11-21T12:00:00.001Z' });
    const completedPastDeadline = makeCase({
      id: 'c1',
      status: 'Completed',
      deadlineAt: '2026-11-01T00:00:00.000Z',
      followUpAt: '2026-11-02T00:00:00.000Z',
    });

    expect(isCaseOverdue(overdueBy1Ms, nowMs)).toBe(true);
    expect(isCaseDueSoon(overdueBy1Ms, nowMs)).toBe(false);

    expect(isCaseOverdue(dueNow, nowMs)).toBe(false);
    expect(isCaseDueSoon(dueNow, nowMs)).toBe(true);

    expect(isCaseOverdue(dueExact48h, nowMs)).toBe(false);
    expect(isCaseDueSoon(dueExact48h, nowMs)).toBe(true);

    expect(isCaseOverdue(beyond48h, nowMs)).toBe(false);
    expect(isCaseDueSoon(beyond48h, nowMs)).toBe(false);

    expect(isCaseOverdue(completedPastDeadline, nowMs)).toBe(false);
    expect(isCaseDueSoon(completedPastDeadline, nowMs)).toBe(false);
  });

  it('applies inclusive UTC date boundaries, previous-period comparison, and completedAt trend bucketing', () => {
    const records: CaseRecord[] = [
      makeCase({
        id: 'prev-1',
        createdAt: '2026-11-05T12:00:00.000Z',
        status: 'Completed',
        completedAt: '2026-11-06T09:00:00.000Z',
      }),
      makeCase({
        id: 'cur-start',
        createdAt: '2026-11-10T00:00:00.000Z',
        status: 'New',
      }),
      makeCase({
        id: 'cur-end',
        createdAt: '2026-11-19T23:59:59.999Z',
        status: 'Completed',
        completedAt: '2026-10-25T15:00:00.000Z',
        updatedAt: '2026-12-02T15:00:00.000Z',
      }),
      makeCase({
        id: 'out-after',
        createdAt: '2026-11-20T00:00:00.000Z',
        status: 'Pending',
      }),
    ];

    const analytics = computeDashboardAnalytics(records, {
      fromIso: '2026-11-10T00:00:00.000Z',
      toIso: '2026-11-19T23:59:59.999Z',
      comparePrevious: true,
      nowMs: Date.parse('2026-11-19T12:00:00.000Z'),
    });

    expect(analytics.kpis.totalRequests).toBe(2);
    expect(analytics.kpis.newRequests).toBe(1);
    expect(analytics.kpis.completedRequests).toBe(1);
    expect(analytics.kpis.completionRate).toBe(50);

    // Previous equal-length span (~10 days before Nov 10) captures prev-1
    expect(analytics.previousKpis?.totalRequests).toBe(1);
    expect(analytics.previousKpis?.completedRequests).toBe(1);

    // cur-end completed bucket must use completedAt (2026-10), not updatedAt (2026-12)
    expect(analytics.monthlyTrends.find((m) => m.month === '2026-10')?.completed).toBe(1);
    expect(analytics.monthlyTrends.find((m) => m.month === '2026-12')).toBeUndefined();
    expect(analytics.monthlyTrends.find((m) => m.month === '2026-11')?.submitted).toBe(2);
  });
});

