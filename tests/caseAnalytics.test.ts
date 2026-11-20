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
});
