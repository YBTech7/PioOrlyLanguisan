import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp, resetServerStateForTests } from '../server.ts';
import { resolveAssetUrl } from '../src/data/profileData.ts';

describe('Asset URL Resolution', () => {
  it('normalizes relative, leading-slash, and legacy /src/assets paths for root base', () => {
    expect(resolveAssetUrl('assets/images/example.jpg', '/')).toBe('/assets/images/example.jpg');
    expect(resolveAssetUrl('/assets/images/example.jpg', '/')).toBe('/assets/images/example.jpg');
    expect(resolveAssetUrl('/src/assets/images/example.jpg', '/')).toBe('/assets/images/example.jpg');
  });

  it('prefixes assets properly for GitHub Pages subpath deployment', () => {
    expect(resolveAssetUrl('assets/images/example.jpg', '/PioOrlyLanguisan/')).toBe(
      '/PioOrlyLanguisan/assets/images/example.jpg'
    );
    expect(resolveAssetUrl('/src/assets/images/example.jpg', '/PioOrlyLanguisan/')).toBe(
      '/PioOrlyLanguisan/assets/images/example.jpg'
    );
    expect(resolveAssetUrl('data:image/png;base64,AAAA', '/PioOrlyLanguisan/')).toBe(
      'data:image/png;base64,AAAA'
    );
    expect(resolveAssetUrl('https://example.com/a.png', '/PioOrlyLanguisan/')).toBe(
      'https://example.com/a.png'
    );
  });
});

describe('API, Case Lifecycle, RBAC & Security Hardening', () => {
  let server: http.Server;
  let baseUrl: string;
  let tempStorePath: string;
  const originalEnv = {
    ADMIN_PASSCODE: process.env.ADMIN_PASSCODE,
    ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    DATA_STORE_PATH: process.env.DATA_STORE_PATH,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  beforeAll(async () => {
    tempStorePath = path.join(os.tmpdir(), `pio-api-test-${process.pid}-${Date.now()}.json`);
    process.env.DATA_STORE_PATH = tempStorePath;
    process.env.ALLOWED_ORIGINS = 'https://ybtech7.github.io';
    delete process.env.GEMINI_API_KEY;
    process.env.ADMIN_PASSCODE = 'Test-Strong-Passcode-99!';
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'Bootstrap-Secret-Token-99!';
    resetServerStateForTests();

    const app = createApiApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(() => {
    resetServerStateForTests();
    process.env.ADMIN_PASSCODE = 'Test-Strong-Passcode-99!';
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'Bootstrap-Secret-Token-99!';
    delete process.env.GEMINI_API_KEY;
    if (fs.existsSync(tempStorePath)) {
      fs.unlinkSync(tempStorePath);
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (fs.existsSync(tempStorePath)) {
      fs.unlinkSync(tempStorePath);
    }
    process.env.ADMIN_PASSCODE = originalEnv.ADMIN_PASSCODE;
    process.env.ADMIN_BOOTSTRAP_TOKEN = originalEnv.ADMIN_BOOTSTRAP_TOKEN;
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
    process.env.DATA_STORE_PATH = originalEnv.DATA_STORE_PATH;
    process.env.ALLOWED_ORIGINS = originalEnv.ALLOWED_ORIGINS;
  });

  it('serves health metadata and security headers without x-powered-by', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.geminiConfigured).toBe(false);
    expect(body.adminConfigured).toBe(true);
    expect(body.consultationStorage).toBe('file');
  });

  it('applies strict CORS origin allowlist with credentials', async () => {
    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://ybtech7.github.io' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://ybtech7.github.io');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    const disallowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(disallowed.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns content with clean subpath-safe asset URLs and never exposes private cases', async () => {
    const res = await fetch(`${baseUrl}/api/content`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.projects)).toBe(true);
    for (const p of data.projects) {
      expect(p.imageUrl).not.toContain('/src/assets/');
      expect(p.imageUrl.startsWith('assets/')).toBe(true);
    }
    expect(data.brand.customPortraitDataUrl).toBeNull();
    expect(data.cases).toBeUndefined();
    expect(data.inquiries).toBeUndefined();
  });

  it('creates unique sequential CASE-00000x cases with New default, idempotent retries, and concurrent uniqueness', async () => {
    const submissionKey = '11111111-1111-4111-8111-111111111111';
    const payload = {
      name: 'Marco Reyes',
      email: 'marco@example.com',
      phone: '(0917) 123-4567',
      phoneCountry: 'PH',
      company: 'Manila Ops',
      tier: 'smb',
      serviceDomain: 'technical-support',
      timeline: 'Within 30 days',
      message: 'Testing normalized Philippine phone storage and sequential case allocation.',
      submissionKey,
    };

    const first = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    expect(firstJson.inquiry.status).toBe('New');
    expect(firstJson.inquiry.caseNumber).toBe('CASE-000002');
    expect(firstJson.inquiry.phone).toBe('+639171234567');
    expect(firstJson.deduplicated).toBe(false);

    // Identical retry is idempotent and returns same case
    const retry = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(retry.status).toBe(201);
    const retryJson = await retry.json();
    expect(retryJson.deduplicated).toBe(true);
    expect(retryJson.inquiry.id).toBe(firstJson.inquiry.id);
    expect(retryJson.inquiry.caseNumber).toBe('CASE-000002');

    // Different payload with same submissionKey returns 409 Conflict
    const conflict = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, message: 'A completely different project brief.' }),
    });
    expect(conflict.status).toBe(409);

    // Concurrent submissions produce strictly unique sequential CASE numbers
    const concurrent = await Promise.all(
      [0, 1, 2].map((idx) =>
        fetch(`${baseUrl}/api/inquiries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Concurrent Client ${idx}`,
            email: `concurrent${idx}@example.com`,
            company: 'Parallel Co',
            tier: 'startup',
            serviceDomain: 'data-analytics',
            timeline: 'Immediate (1–2 weeks)',
            message: `Concurrent consultation request payload number ${idx}.`,
          }),
        }).then((r) => r.json())
      )
    );
    const caseNums = concurrent.map((r) => r.inquiry.caseNumber);
    expect(new Set(caseNums).size).toBe(3);
    expect(caseNums.sort()).toEqual(['CASE-000003', 'CASE-000004', 'CASE-000005']);

    // Ensure public /api/content does not expose requester PII
    const publicContent = await (await fetch(`${baseUrl}/api/content`)).text();
    expect(publicContent).not.toContain('+639171234567');
    expect(publicContent).not.toContain('marco@example.com');
  });

  it('enforces unauthenticated rejection, bootstrap + RBAC (admin vs staff), status audit history, notes, KPI reconciliation, and CSV export', async () => {
    // 1. Unauthenticated access rejected on all admin routes
    const unauthEndpoints = [
      '/api/admin/dashboard',
      '/api/admin/cases',
      '/api/admin/analytics',
      '/api/admin/reports/export',
      '/api/admin/users',
      '/api/admin/notifications',
      '/api/admin/activity',
    ];
    for (const ep of unauthEndpoints) {
      const r = await fetch(`${baseUrl}${ep}`);
      expect(r.status).toBe(401);
    }

    // 2. First-admin bootstrap creates admin account and locks out second bootstrap
    const bootRes = await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken: 'Bootstrap-Secret-Token-99!',
        name: 'Pio Languisan',
        email: 'admin@piolanguisan.example',
        password: 'ExecutiveStrongPassword!2026',
      }),
    });
    expect(bootRes.status).toBe(201);
    const bootJson = await bootRes.json();
    const adminToken = bootJson.token as string;
    expect(bootJson.user.role).toBe('admin');

    const secondBoot = await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken: 'Bootstrap-Secret-Token-99!',
        name: 'Rogue Admin',
        email: 'rogue@example.com',
        password: 'AnotherStrongPassword!2026',
      }),
    });
    expect(secondBoot.status).toBe(409);

    // 3. Admin creates a Staff user
    const staffCreate = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Operations Coordinator',
        email: 'staff@piolanguisan.example',
        role: 'staff',
        password: 'StaffPassword!2026',
      }),
    });
    expect(staffCreate.status).toBe(201);
    const staffUser = (await staffCreate.json()).user;

    // 4. Staff logs in via email/password
    const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@piolanguisan.example',
        password: 'StaffPassword!2026',
      }),
    });
    expect(staffLogin.status).toBe(200);
    const staffToken = (await staffLogin.json()).token as string;

    // Staff CANNOT perform admin-only actions (403)
    const staffCreateUser = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        name: 'X',
        email: 'x@example.com',
        role: 'admin',
        password: 'Password123456!',
      }),
    });
    expect(staffCreateUser.status).toBe(403);

    const staffExport = await fetch(`${baseUrl}/api/admin/reports/export`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(staffExport.status).toBe(403);

    const staffAddProject = await fetch(`${baseUrl}/api/admin/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        title: 'Unauthorized Project',
        domain: 'Data Analytics',
        summary: 'Should be rejected with 403.',
      }),
    });
    expect(staffAddProject.status).toBe(403);

    // 5. Public submission creates a case with formula-like company name & triggers notification
    const subRes = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jordan Taylor',
        email: 'jordan@acme.example',
        company: '=SUM(1,2)',
        tier: 'enterprise',
        serviceDomain: 'web-creation',
        timeline: 'This quarter',
        message: 'We need a unified web portal with automated operational intake.',
      }),
    });
    expect(subRes.status).toBe(201);
    const createdCase = (await subRes.json()).caseRecord;
    expect(createdCase.status).toBe('New');

    // Notifications list contains new case notification
    const notifRes = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const notifJson = await notifRes.json();
    expect(notifJson.unreadCount).toBeGreaterThanOrEqual(1);

    // 6. Staff CAN transition case status, assign owner, and add private internal note
    const patchRes = await fetch(`${baseUrl}/api/admin/cases/${createdCase.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        status: 'Follow Up',
        statusNote: 'Discovery agenda sent to client.',
        assignedTo: staffUser.id,
        priority: 'High',
      }),
    });
    expect(patchRes.status).toBe(200);

    const noteRes = await fetch(`${baseUrl}/api/admin/cases/${createdCase.id}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({ content: 'Private internal triage note.' }),
    });
    expect(noteRes.status).toBe(201);

    // Verify immutable status history + notes + activity on case detail
    const detailRes = await fetch(`${baseUrl}/api/admin/cases/${createdCase.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const detailJson = await detailRes.json();
    expect(detailJson.caseRecord.status).toBe('Follow Up');
    expect(detailJson.caseRecord.assignedTo).toBe(staffUser.id);
    expect(detailJson.statusHistory.length).toBe(2);
    expect(detailJson.statusHistory[0].previousStatus).toBe('New');
    expect(detailJson.statusHistory[0].newStatus).toBe('Follow Up');
    expect(detailJson.notes[0].content).toBe('Private internal triage note.');

    // Verify KPI reconciliation
    const analyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const analyticsJson = await analyticsRes.json();
    expect(analyticsJson.kpis.totalRequests).toBe(2); // Sample + Jordan Taylor
    expect(analyticsJson.kpis.followUpRequests).toBe(1);
    expect(analyticsJson.kpis.pendingRequests).toBe(1);

    // 7. Admin exports filtered CSV with formula injection protection & audit log entry
    const exportRes = await fetch(`${baseUrl}/api/admin/reports/export?status=Follow%20Up`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(exportRes.status).toBe(200);
    const csv = await exportRes.text();
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain(createdCase.caseNumber);

    const actRes = await fetch(`${baseUrl}/api/admin/activity`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const actJson = await actRes.json();
    expect(actJson.activity.some((a: { action: string }) => a.action === 'report_exported_csv')).toBe(
      true
    );
  });

  it('enforces passcode brute-force lockout, SVG XSS rejection, and logout revocation', async () => {
    for (let i = 0; i < 5; i++) {
      const bad = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: `wrong-${i}` }),
      });
      expect(bad.status).toBe(401);
    }
    const locked = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'Test-Strong-Passcode-99!' }),
    });
    expect(locked.status).toBe(429);

    resetServerStateForTests();
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'Test-Strong-Passcode-99!' }),
    });
    expect(loginRes.status).toBe(200);
    const { token } = await loginRes.json();

    const svgUpload = await fetch(`${baseUrl}/api/admin/brand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customLogoDataUrl: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=',
      }),
    });
    expect(svgUpload.status).toBe(400);

    const logoutRes = await fetch(`${baseUrl}/api/admin/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(200);

    const afterLogout = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('validates Gemini assistant inputs and returns clean 503 when GEMINI_API_KEY is missing', async () => {
    const noKeyChat = await fetch(`${baseUrl}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'How do you organize weekly SLA reports?' }],
      }),
    });
    expect(noKeyChat.status).toBe(503);
    const chatErr = await noKeyChat.json();
    expect(chatErr.error).not.toContain('GEMINI_API_KEY');
  });
});
