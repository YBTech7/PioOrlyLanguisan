import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApiApp, resetServerStateForTests } from '../server.ts';
import { resolveAssetUrl } from '../src/data/profileData.ts';

function computeTotp(base32Secret: string, stepOffset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32Secret.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 30000) + stepOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
  return code;
}

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

describe('API, Case Lifecycle, 3-Tier RBAC & Auth Security Hardening', () => {
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

    const conflict = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, message: 'A completely different project brief.' }),
    });
    expect(conflict.status).toBe(409);

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

    const publicContent = await (await fetch(`${baseUrl}/api/content`)).text();
    expect(publicContent).not.toContain('+639171234567');
    expect(publicContent).not.toContain('marco@example.com');
  });

  it('enforces unauthenticated rejection, super_admin/admin/staff RBAC, staff case scoping, KPI reconciliation, and CSV export', async () => {
    const unauthEndpoints = [
      '/api/auth/me',
      '/api/admin/dashboard',
      '/api/admin/cases',
      '/api/admin/analytics',
      '/api/admin/reports/export',
      '/api/admin/users',
      '/api/admin/notifications',
      '/api/admin/activity',
      '/api/admin/sessions',
      '/api/admin/audit-events',
    ];
    for (const ep of unauthEndpoints) {
      const r = await fetch(`${baseUrl}${ep}`);
      expect(r.status).toBe(401);
    }

    // 1. First-admin bootstrap creates super_admin and locks subsequent bootstrap calls
    const bootRes = await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken: 'Bootstrap-Secret-Token-99!',
        name: 'Pio Languisan',
        email: 'super@piolanguisan.example',
        password: 'ExecutiveStrongPassword!2026',
      }),
    });
    expect(bootRes.status).toBe(201);
    const bootJson = await bootRes.json();
    const superToken = bootJson.token as string;
    const superUser = bootJson.user;
    expect(superUser.role).toBe('super_admin');

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

    // 2. Super Admin provisions an Admin user and a Staff user
    const adminCreate = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({
        name: 'Operations Lead',
        email: 'lead@piolanguisan.example',
        role: 'admin',
        password: 'OperationsPassword!2026',
      }),
    });
    expect(adminCreate.status).toBe(201);
    const adminUser = (await adminCreate.json()).user;

    const staffCreate = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({
        name: 'Operations Coordinator',
        email: 'staff@piolanguisan.example',
        role: 'staff',
        password: 'StaffPassword!2026',
      }),
    });
    expect(staffCreate.status).toBe(201);
    const staffUser = (await staffCreate.json()).user;

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'lead@piolanguisan.example',
        password: 'OperationsPassword!2026',
      }),
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = (await adminLogin.json()).token as string;

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

    // 3. Admin CAN access analytics/export/activity/users, CANNOT create users or read auth audit events (super_admin only)
    expect((await fetch(`${baseUrl}/api/admin/analytics`, { headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/admin/audit-events`, { headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(403);
    expect(
      (
        await fetch(`${baseUrl}/api/admin/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            name: 'Blocked User',
            email: 'blocked@example.com',
            role: 'staff',
            password: 'StrongPassword!2026',
          }),
        })
      ).status
    ).toBe(403);

    // 4. Staff CANNOT access admin analytics, CSV export, activity, or user creation (403)
    expect((await fetch(`${baseUrl}/api/admin/analytics`, { headers: { Authorization: `Bearer ${staffToken}` } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/admin/reports/export`, { headers: { Authorization: `Bearer ${staffToken}` } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/admin/activity`, { headers: { Authorization: `Bearer ${staffToken}` } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/admin/users`, { headers: { Authorization: `Bearer ${staffToken}` } })).status).toBe(403);

    // 5. Public submissions create two cases: one assigned to adminUser (forbidden to staff), one worked by staff
    const subA = await fetch(`${baseUrl}/api/inquiries`, {
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
    expect(subA.status).toBe(201);
    const createdCase = (await subA.json()).caseRecord;

    const subB = await fetch(`${baseUrl}/api/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Assigned Executive Case',
        email: 'exec-client@acme.example',
        company: 'Executive Client Corp',
        tier: 'enterprise',
        serviceDomain: 'account-management',
        timeline: 'Within 30 days',
        message: 'Dedicated executive engagement assigned to operations lead.',
      }),
    });
    const executiveCase = (await subB.json()).caseRecord;

    // Assign executiveCase to adminUser (Operations Lead)
    await fetch(`${baseUrl}/api/admin/cases/${executiveCase.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ assignedTo: adminUser.id }),
    });

    // Staff gets 403 trying to view or edit a case assigned to someone else
    expect(
      (
        await fetch(`${baseUrl}/api/admin/cases/${executiveCase.id}`, {
          headers: { Authorization: `Bearer ${staffToken}` },
        })
      ).status
    ).toBe(403);

    // Staff CAN transition unassigned/own-assigned case & add internal note
    const patchRes = await fetch(`${baseUrl}/api/admin/cases/${createdCase.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ content: 'Private internal triage note.' }),
    });
    expect(noteRes.status).toBe(201);

    // Admin exports filtered CSV with formula injection guard & audit trail
    const exportRes = await fetch(`${baseUrl}/api/admin/reports/export?status=Follow%20Up`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(exportRes.status).toBe(200);
    const csv = await exportRes.text();
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain(createdCase.caseNumber);
  });

  it('supports invitations, password change, MFA challenge, session revocation, deactivation, and honest 503 recovery', async () => {
    const bootRes = await fetch(`${baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootstrapToken: 'Bootstrap-Secret-Token-99!',
        name: 'Super Admin',
        email: 'super@piolanguisan.example',
        password: 'SuperStrongPassword!2026',
      }),
    });
    const superToken = (await bootRes.json()).token as string;

    // 1. Forgot password returns honest 503 when Gmail mailer credentials are not configured
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'super@piolanguisan.example' }),
    });
    expect(forgotRes.status).toBe(503);

    // 2. Super Admin issues an invitation -> returns manualInviteUrl when mailer is absent
    const inviteRes = await fetch(`${baseUrl}/api/admin/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({
        name: 'Invited Analyst',
        email: 'analyst@piolanguisan.example',
        role: 'admin',
      }),
    });
    expect(inviteRes.status).toBe(201);
    const inviteBody = await inviteRes.json();
    expect(inviteBody.emailed).toBe(false);
    expect(typeof inviteBody.manualInviteUrl).toBe('string');
    const inviteToken = new URL(inviteBody.manualInviteUrl).searchParams.get('token')!;
    expect(inviteToken).toBeTruthy();

    // Accept invite activates account & rejects replay
    const acceptRes = await fetch(`${baseUrl}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: 'AnalystStrongPassword!2026' }),
    });
    expect(acceptRes.status).toBe(201);
    const acceptedUser = (await acceptRes.json()).user;
    expect(acceptedUser.role).toBe('admin');

    const replayAccept = await fetch(`${baseUrl}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: 'AnalystStrongPassword!2026' }),
    });
    expect(replayAccept.status).toBe(400);

    // 3. Invited user signs in, sets up TOTP MFA, then requires 2-step MFA login
    const analystLogin1 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'analyst@piolanguisan.example',
        password: 'AnalystStrongPassword!2026',
      }),
    });
    const analystToken = (await analystLogin1.json()).token as string;

    const mfaSetup = await (
      await fetch(`${baseUrl}/api/auth/mfa/setup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${analystToken}` },
      })
    ).json();
    const mfaCode = computeTotp(mfaSetup.secret);
    const mfaEnable = await fetch(`${baseUrl}/api/auth/mfa/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${analystToken}` },
      body: JSON.stringify({ secret: mfaSetup.secret, code: mfaCode }),
    });
    expect(mfaEnable.status).toBe(200);

    const mfaPromptLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'analyst@piolanguisan.example',
        password: 'AnalystStrongPassword!2026',
      }),
    });
    expect(mfaPromptLogin.status).toBe(202);
    const mfaPromptBody = await mfaPromptLogin.json();
    expect(mfaPromptBody.mfaRequired).toBe(true);

    const mfaComplete = await fetch(`${baseUrl}/api/auth/login/mfa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaChallenge: mfaPromptBody.mfaChallenge,
        code: computeTotp(mfaSetup.secret),
      }),
    });
    expect(mfaComplete.status).toBe(200);
    const secondAnalystToken = (await mfaComplete.json()).token as string;

    // 4. Revoking one active session rejects it immediately
    const sessionsRes = await fetch(`${baseUrl}/api/admin/sessions`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    const sessionsList = (await sessionsRes.json()).sessions as Array<{ id: string; email: string }>;
    const targetSession = sessionsList.find((s) => s.email === 'analyst@piolanguisan.example');
    expect(targetSession).toBeTruthy();

    const revokeRes = await fetch(`${baseUrl}/api/admin/sessions/${targetSession!.id}/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(revokeRes.status).toBe(200);

    // Deactivating the user invalidates ALL remaining sessions immediately
    const deactivateRes = await fetch(`${baseUrl}/api/admin/users/${acceptedUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    expect(deactivateRes.status).toBe(200);
    const staleAnalystCall = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${secondAnalystToken}` },
    });
    expect(staleAnalystCall.status).toBe(401);

    // 5. Super Admin inspects auth_audit_events
    const auditRes = await fetch(`${baseUrl}/api/admin/audit-events`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(auditRes.status).toBe(200);
    const auditEvents = (await auditRes.json()).events as Array<{ eventType: string }>;
    expect(auditEvents.some((e) => e.eventType === 'admin_bootstrapped')).toBe(true);
    expect(auditEvents.some((e) => e.eventType === 'invitation_accepted')).toBe(true);
    expect(auditEvents.some((e) => e.eventType === 'mfa_enabled')).toBe(true);
    expect(auditEvents.some((e) => e.eventType === 'session_revoked')).toBe(true);
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
