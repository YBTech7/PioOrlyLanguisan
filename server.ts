import 'dotenv/config';
import {
  consultationInbox,
  getConsultationMailerConfig,
  runConsultationMailer,
  sendTransactionalEmail,
} from './consultation.ts';
import {
  getCaseRepository,
  hashSecretToken,
  resetRepositoryForTests,
  verifyPassword,
  type CaseActor,
  type CaseQueryFilters,
  type CaseUpdateInput,
} from './db/caseRepository.ts';
import {
  buildCasesCsvReport,
  CASE_STATUSES,
  computeDashboardAnalytics,
} from './src/lib/caseAnalytics.ts';
import express from 'express';
import type { Request, Response, NextFunction, Express } from 'express';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  SERVICE_OFFERINGS,
  CLIENT_TIER_SOLUTIONS,
  TARGET_TIMELINES,
  WORKFLOW_VISUAL_URL,
} from './src/data/profileData.ts';
import {
  isValidCountryCode,
  validateAndNormalizePhone,
} from './src/lib/phone.ts';
import type {
  AdminRole,
  AiScopeRecommendation,
  CasePriority,
  CaseStatus,
  ClientTierId,
  ProjectCase,
  ServiceDomainId,
  TargetTimelineValue,
} from './src/types.ts';

interface SessionRecord {
  id: string;
  token: string;
  tokenHash: string;
  csrfToken: string;
  userId: string | null;
  email: string;
  name: string;
  role: AdminRole;
  sessionVersion: number;
  expiresAt: number;
}

interface AuthenticatedRequest extends Request {
  authSession?: SessionRecord;
  authViaCookie?: boolean;
}

const VALID_TIERS: ClientTierId[] = ['individual', 'startup', 'smb', 'enterprise'];
const VALID_SERVICES: ServiceDomainId[] = [
  'technical-support',
  'customer-service',
  'data-analytics',
  'admin-operations',
  'account-management',
  'web-creation',
];
const VALID_TIMELINES: readonly string[] = TARGET_TIMELINES;
const VALID_PRIORITIES: CasePriority[] = ['Low', 'Normal', 'High', 'Urgent'];
const ALLOWED_RASTER_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 4;
const RECOVERY_TOKEN_TTL_MS = 1000 * 60 * 30;
const INVITATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 72;
const GEMINI_TIMEOUT_MS = 20000;
const SESSION_COOKIE_NAME = 'pl_session';
const CSRF_COOKIE_NAME = 'pl_csrf';

const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
function getSessionSecret(): string {
  return (process.env.SESSION_SECRET || process.env.ADMIN_PASSCODE || EPHEMERAL_SESSION_SECRET).trim();
}

const activeSessions = new Map<string, SessionRecord>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const loginFailureBuckets = new Map<string, { failures: number; lockedUntil: number; resetAt: number }>();

export function resetServerStateForTests(): void {
  resetRepositoryForTests();
  activeSessions.clear();
  rateLimitBuckets.clear();
  loginFailureBuckets.clear();
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please configure GEMINI_API_KEY on the server.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getGeminiModel(): string {
  return (process.env.GEMINI_MODEL || 'gemini-4-hydrogen').trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SYSTEM_CONTEXT = `You are the Service Advisor for Pio Languisan (PL — Technology · Operations · Analytics).
Your role is to help prospective individual, startup, small-to-medium business (SMB), and enterprise clients understand how Pio's actual experience applies to their goals.

Core Service Pillars:
${SERVICE_OFFERINGS.map(
  (s) => `- ${s.index}. ${s.title} (${s.id}): ${s.summary} Deliverables: ${s.deliverables.join(', ')}.`
).join('\n')}

Client Tiers:
${CLIENT_TIER_SOLUTIONS.map(
  (t) => `- ${t.label} (${t.id}): ${t.description} Typical timeline: ${t.typicalTimeline}.`
).join('\n')}

Guidelines:
1. Be concise, executive, practical, and grounded strictly in the six service areas above (technical support, customer service, data analytics, administrative operations, account management, and web creation).
2. Never invent fabricated past employers, degrees, certifications, or fake client names.
3. Recommend concrete deliverables and suggest scheduling a consultation when ready.`;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(bucketPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${bucketPrefix}:${getClientIp(req)}`;
    const now = Date.now();
    const existing = rateLimitBuckets.get(key);
    if (!existing || now > existing.resetAt) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (existing.count >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Too many requests. Please retry in ${retryAfterSec} seconds.`,
      });
      return;
    }
    existing.count += 1;
    next();
  };
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [tok, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(tok);
    }
  }
}

function timingSafeMatch(provided: string, expected: string): boolean {
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function signToken(token: string): string {
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(token)
    .digest('hex');
  return `${token}.${sig}`;
}

function verifySignedToken(signedValue: string): string | null {
  const dotIdx = signedValue.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const rawToken = signedValue.slice(0, dotIdx);
  const providedSig = signedValue.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(rawToken)
    .digest('hex');
  if (providedSig.length !== expectedSig.length) return null;
  const ok = crypto.timingSafeEqual(
    Buffer.from(providedSig, 'utf-8'),
    Buffer.from(expectedSig, 'utf-8')
  );
  return ok ? rawToken : null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

async function createSession(
  actor: CaseActor & { sessionVersion?: number },
  req: Request
): Promise<SessionRecord> {
  pruneExpiredSessions();
  const id = `ses-${crypto.randomUUID().slice(0, 12)}`;
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSecretToken(token);
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  const session: SessionRecord = {
    id,
    token,
    tokenHash,
    csrfToken,
    userId: actor.id,
    email: actor.email,
    name: actor.name,
    role: actor.role,
    sessionVersion: actor.sessionVersion ?? 1,
    expiresAt,
  };
  activeSessions.set(token, session);
  const repo = getCaseRepository();
  await repo.createSessionRecord({
    id,
    userId: actor.id,
    tokenHash,
    csrfToken,
    role: actor.role,
    email: actor.email,
    name: actor.name,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    ipAddress: getClientIp(req),
    sessionVersion: session.sessionVersion,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  return session;
}

function setSessionCookies(req: Request, res: Response, session: SessionRecord): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSite = isHttps ? 'None' : 'Lax';
  const secureFlag = isHttps ? '; Secure' : '';
  const maxAge = Math.floor(ADMIN_TOKEN_TTL_MS / 1000);
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signToken(session.token))}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secureFlag}`,
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(session.csrfToken)}; Path=/; SameSite=${sameSite}; Max-Age=${maxAge}${secureFlag}`,
  ]);
}

function clearSessionCookies(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSite = isHttps ? 'None' : 'Lax';
  const secureFlag = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secureFlag}`,
    `${CSRF_COOKIE_NAME}=; Path=/; SameSite=${sameSite}; Max-Age=0${secureFlag}`,
  ]);
}

async function extractSessionFromRequest(
  req: Request
): Promise<{ session: SessionRecord | null; viaCookie: boolean; expired: boolean }> {
  pruneExpiredSessions();
  const authHeader = req.headers.authorization || '';
  let rawToken: string | null = null;
  let viaCookie = false;

  if (authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7).trim() || null;
  } else {
    const cookies = parseCookies(req.headers.cookie);
    const signedCookie = cookies[SESSION_COOKIE_NAME];
    if (signedCookie) {
      rawToken = verifySignedToken(signedCookie);
      viaCookie = true;
    }
  }

  if (!rawToken) {
    return { session: null, viaCookie, expired: false };
  }

  const repo = getCaseRepository();
  const tokenHash = hashSecretToken(rawToken);
  const storedSession = await repo.getSessionByTokenHash(tokenHash);
  if (!storedSession) {
    activeSessions.delete(rawToken);
    return { session: null, viaCookie, expired: false };
  }
  if (storedSession.revokedAt || Date.parse(storedSession.expiresAt) <= Date.now()) {
    activeSessions.delete(rawToken);
    return { session: null, viaCookie, expired: true };
  }

  let resolvedRole: AdminRole = storedSession.role;
  let resolvedEmail = storedSession.email;
  let resolvedName = storedSession.name;
  let resolvedVersion = storedSession.sessionVersion;

  if (storedSession.userId) {
    const user = await repo.getUserById(storedSession.userId);
    if (!user || !user.isActive || (user.sessionVersion ?? 1) !== storedSession.sessionVersion) {
      activeSessions.delete(rawToken);
      return { session: null, viaCookie, expired: true };
    }
    resolvedRole = user.role;
    resolvedEmail = user.email;
    resolvedName = user.name;
    resolvedVersion = user.sessionVersion ?? 1;
  }

  const hydrated: SessionRecord = {
    id: storedSession.id,
    token: rawToken,
    tokenHash: storedSession.tokenHash,
    csrfToken: storedSession.csrfToken,
    userId: storedSession.userId,
    email: resolvedEmail,
    name: resolvedName,
    role: resolvedRole,
    sessionVersion: resolvedVersion,
    expiresAt: Date.parse(storedSession.expiresAt),
  };
  activeSessions.set(rawToken, hydrated);
  return { session: hydrated, viaCookie, expired: false };
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { session, viaCookie, expired } = await extractSessionFromRequest(req);
    if (!session) {
      if (viaCookie) clearSessionCookies(req, res);
      res.status(401).json({
        error: expired
          ? 'Your administrator session has expired or was revoked. Please sign in again.'
          : 'Authentication required.',
        code: expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED',
      });
      return;
    }

    if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      const headerCsrf = String(req.headers['x-csrf-token'] || '');
      if (!headerCsrf || !timingSafeMatch(headerCsrf, session.csrfToken)) {
        res.status(403).json({ error: 'Invalid or missing CSRF verification token.' });
        return;
      }
    }

    req.authSession = session;
    req.authViaCookie = viaCookie;
    next();
  } catch {
    res.status(503).json({ error: 'Authentication verification service unavailable.' });
  }
}

function isAdminOrSuper(role: AdminRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

function isSuperAdmin(role: AdminRole): boolean {
  return role === 'super_admin';
}

function requireAdminRole(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authSession) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (!isAdminOrSuper(req.authSession.role)) {
    res.status(403).json({ error: 'Administrator privileges are required for this action.' });
    return;
  }
  next();
}

function requireSuperAdminRole(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authSession) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (!isSuperAdmin(req.authSession.role)) {
    res.status(403).json({ error: 'Super Administrator privileges are required for this action.' });
    return;
  }
  next();
}

function sessionToActor(session: SessionRecord): CaseActor {
  return {
    id: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
  };
}

// RFC 4648 Base32 & RFC 6238 TOTP helpers (optional MFA)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function generateBase32Secret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function verifyTotpCode(secret: string, code: string): boolean {
  const cleanCode = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const key = decodeBase32(secret);
  const currentStep = Math.floor(Date.now() / 30000);
  for (const delta of [-1, 0, 1]) {
    const stepBuf = Buffer.alloc(8);
    stepBuf.writeBigUInt64BE(BigInt(currentStep + delta));
    const hmac = crypto.createHmac('sha1', key).update(stepBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binCode =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const otp = String(binCode % 1000000).padStart(6, '0');
    if (timingSafeMatch(cleanCode, otp)) return true;
  }
  return false;
}

function signMfaChallenge(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + 5 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyMfaChallenge(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  if (!timingSafeMatch(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      userId?: string;
      exp?: number;
    };
    if (!parsed.userId || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

function validateStrongPassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 12) {
    return 'Password must be at least 12 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password must include uppercase, lowercase, and at least one number or special character.';
  }
  return null;
}

function resolvePublicAppBaseUrl(req: Request, allowedOrigins: string[]): string {
  const configured = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin && allowedOrigins.includes(origin)) {
    const isGhPages = origin === 'https://ybtech7.github.io';
    return isGhPages ? `${origin}/PioOrlyLanguisan` : origin;
  }
  const host = req.get('host');
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return host ? `${proto}://${host}` : 'https://ybtech7.github.io/PioOrlyLanguisan';
}

function normalizeStatusInput(value: unknown): CaseStatus | null {
  if (value === 'New' || value === 'Pending' || value === 'Follow Up' || value === 'Completed') {
    return value;
  }
  if (value === 'In Review') return 'Pending';
  if (value === 'Scheduled') return 'Follow Up';
  return null;
}

function validateRasterDataUrl(value: unknown): { valid: boolean; error?: string } {
  if (value === null) return { valid: true };
  if (typeof value !== 'string') {
    return { valid: false, error: 'Image upload must be a valid data URL or null.' };
  }
  const match = value.match(ALLOWED_RASTER_DATA_URL_RE);
  if (!match) {
    return {
      valid: false,
      error: 'Only PNG, JPEG, or WebP image uploads are permitted.',
    };
  }
  const base64Body = match[2];
  const approxBytes = Math.floor((base64Body.length * 3) / 4);
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      error: 'Uploaded image exceeds the 2MB maximum size limit.',
    };
  }
  return { valid: true };
}

function sanitizeScopeOutput(parsed: Record<string, unknown>): AiScopeRecommendation {
  const rawTier = String(parsed.recommendedTier || '').trim() as ClientTierId;
  const rawService = String(parsed.recommendedService || '').trim() as ServiceDomainId;
  const recommendedTier: ClientTierId = VALID_TIERS.includes(rawTier) ? rawTier : 'startup';
  const recommendedService: ServiceDomainId = VALID_SERVICES.includes(rawService)
    ? rawService
    : 'technical-support';
  const recommendedTimeline = String(parsed.recommendedTimeline || 'Within 30 days')
    .trim()
    .slice(0, 60);
  const executiveSummary = String(
    parsed.executiveSummary || 'Structured discovery sprint tailored to your operational goals.'
  )
    .trim()
    .slice(0, 500);
  const actionPlan = Array.isArray(parsed.actionPlan)
    ? parsed.actionPlan
        .map((step) => String(step).trim().slice(0, 180))
        .filter(Boolean)
        .slice(0, 5)
    : ['Audit current workflows', 'Establish reporting baseline', 'Execute sprint deliverables'];

  return {
    recommendedTier,
    recommendedService,
    recommendedTimeline,
    executiveSummary,
    actionPlan: actionPlan.length > 0 ? actionPlan : ['Audit current workflows'],
  };
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('GEMINI_API_KEY')) {
    return {
      status: 503,
      message: 'AI Service Advisor is not configured on this server.',
    };
  }
  if (msg.includes('GEMINI_TIMEOUT')) {
    return {
      status: 504,
      message: 'AI Service Advisor timed out. Please try again in a moment.',
    };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'AI service credentials could not be validated.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI service quota temporarily reached. Please retry shortly.',
    };
  }
  return {
    status: 502,
    message: 'Unable to process AI guidance request right now.',
  };
}

function checkLoginLockout(ip: string, res: Response): boolean {
  const now = Date.now();
  const record = loginFailureBuckets.get(ip);
  if (record && record.lockedUntil > now) {
    const waitSec = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
    res.setHeader('Retry-After', String(waitSec));
    res.status(429).json({
      error: `Too many failed login attempts. Try again in ${waitSec} seconds.`,
    });
    return true;
  }
  return false;
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const record = loginFailureBuckets.get(ip);
  const current =
    record && now <= record.resetAt
      ? record
      : { failures: 0, lockedUntil: 0, resetAt: now + 15 * 60 * 1000 };
  current.failures += 1;
  if (current.failures >= 5) {
    current.lockedUntil = now + 15 * 60 * 1000;
  }
  loginFailureBuckets.set(ip, current);
}

export function createApiApp(): Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(express.json({ limit: '3mb' }));

  // HTTP Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api')) {
      res.setHeader('X-Frame-Options', 'DENY');
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self';"
      );
    }
    next();
  });

  // Strict CORS origin allowlist for decoupled static frontend (e.g., GitHub Pages)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    const repo = getCaseRepository();
    const mailerConfig = getConsultationMailerConfig();
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      adminConfigured: Boolean(process.env.ADMIN_PASSCODE),
      consultationStorage: repo.storageMode,
      consultationMailerConfigured: Boolean(mailerConfig),
      consultationSameSenderRecipient: mailerConfig ? mailerConfig.sameSenderRecipient : null,
    });
  });

  app.get('/api/content', async (_req, res) => {
    const repo = getCaseRepository();
    const content = await repo.getSiteContent();
    res.json(content);
  });

  // -------------------------------------------------------------------------
  // Public Consultation Submission -> Persisted Case with Status "New"
  // -------------------------------------------------------------------------
  const inquiryLimiter = createRateLimiter('inquiries', 10, 15 * 60 * 1000);
  app.post('/api/inquiries', inquiryLimiter, async (req, res) => {
    const {
      name,
      email,
      phone,
      phoneCountry,
      company,
      tier,
      serviceDomain,
      timeline,
      message,
      website,
    } = req.body ?? {};

    // Honeypot spam trap
    if (typeof website === 'string' && website.trim().length > 0) {
      res.status(201).json({
        inquiry: {
          id: `INQ-${new Date().getFullYear()}-ACCEPTED`,
          caseNumber: 'CASE-000000',
          name: 'Submitted',
          email: '',
          company: '',
          tier: 'startup',
          serviceDomain: 'technical-support',
          timeline: 'Within 30 days',
          message: '',
          status: 'New',
          priority: 'Normal',
          assignedTo: null,
          followUpAt: null,
          deadlineAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      });
      return;
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedCompany = typeof company === 'string' ? company.trim() : '';
    const trimmedTimeline = typeof timeline === 'string' ? timeline.trim() : 'Within 30 days';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      res.status(400).json({ error: 'Full name must be between 2 and 100 characters.' });
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail) || trimmedEmail.length > 160) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    const rawCountry =
      typeof phoneCountry === 'string' && isValidCountryCode(phoneCountry)
        ? (phoneCountry.toUpperCase() as Parameters<typeof validateAndNormalizePhone>[1])
        : undefined;
    const phoneCheck = validateAndNormalizePhone(phone, rawCountry);
    if (!phoneCheck.valid) {
      res.status(400).json({
        error: phoneCheck.error || 'Please enter a valid international contact number.',
      });
      return;
    }
    if (trimmedCompany.length > 120) {
      res.status(400).json({ error: 'Organization name must be 120 characters or fewer.' });
      return;
    }
    if (!VALID_TIERS.includes(tier)) {
      res.status(400).json({ error: 'Invalid organization tier selected.' });
      return;
    }
    if (!VALID_SERVICES.includes(serviceDomain)) {
      res.status(400).json({ error: 'Invalid service domain selected.' });
      return;
    }
    if (!VALID_TIMELINES.includes(trimmedTimeline)) {
      res.status(400).json({ error: 'Please choose a valid target timeline.' });
      return;
    }
    if (trimmedMessage.length < 10 || trimmedMessage.length > 2500) {
      res.status(400).json({
        error: 'Project context must be between 10 and 2500 characters.',
      });
      return;
    }

    const key = req.body?.submissionKey;
    if (
      key !== undefined &&
      (typeof key !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))
    ) {
      res.status(400).json({ error: 'Invalid submission reference.' });
      return;
    }

    const submissionKey = key ?? crypto.randomUUID();
    const repo = getCaseRepository();

    try {
      const outcome = await repo.createCase(
        {
          name: trimmedName,
          email: trimmedEmail,
          phoneCountryCode: phoneCheck.country ?? rawCountry ?? null,
          ...(phoneCheck.e164 ? { phone: phoneCheck.e164 } : {}),
          company: trimmedCompany || (repo.storageMode === 'postgres' ? '' : 'Independent'),
          tier,
          serviceDomain,
          timeline: trimmedTimeline as TargetTimelineValue,
          message: trimmedMessage,
        },
        submissionKey
      );

      if ('conflict' in outcome) {
        res.status(409).json({
          error: 'The submission reference is already in use for a different request. Please try again.',
        });
        return;
      }

      if (!outcome.deduplicated && consultationInbox) {
        try {
          await consultationInbox.save(outcome.caseRecord, submissionKey);
        } catch {
          console.warn('Email notification queue deferred; case remains safely persisted', {
            caseNumber: outcome.caseRecord.caseNumber,
            inquiryId: outcome.caseRecord.id,
          });
        }
      }

      console.info('Consultation case recorded', {
        caseNumber: outcome.caseRecord.caseNumber,
        inquiryId: outcome.caseRecord.id,
        httpStatus: 201,
        storage: repo.storageMode,
        deduplicated: outcome.deduplicated,
      });

      res.status(201).json({
        inquiry: outcome.caseRecord,
        caseRecord: outcome.caseRecord,
        deduplicated: outcome.deduplicated,
      });
    } catch {
      console.error('Consultation storage failed', { httpStatus: 503 });
      res.status(503).json({ error: 'We could not save your request. Please try again.' });
    }
  });

  // -------------------------------------------------------------------------
  // Gemini AI Service Advisor
  // -------------------------------------------------------------------------
  const aiLimiter = createRateLimiter('assistant', 20, 5 * 60 * 1000);
  app.post('/api/assistant', aiLimiter, async (req, res) => {
    try {
      const { messages } = req.body ?? {};
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Conversation messages are required.' });
        return;
      }

      const sanitized = messages.slice(-10).map((m: { role?: unknown; content?: unknown }) => ({
        role: m?.role === 'assistant' ? 'Advisor' : 'Client',
        content: typeof m?.content === 'string' ? m.content.trim().slice(0, 1500) : '',
      }));

      if (!sanitized.some((m) => m.content.length > 0)) {
        res.status(400).json({ error: 'Message content cannot be empty.' });
        return;
      }

      const ai = getGeminiClient();
      const transcript = sanitized
        .filter((m) => m.content.length > 0)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n\n');

      const response = await withTimeout(
        ai.models.generateContent({
          model: getGeminiModel(),
          contents: `Respond directly to the latest Client message in this conversation:\n\n${transcript}`,
          config: {
            systemInstruction: SYSTEM_CONTEXT,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        GEMINI_TIMEOUT_MS
      );

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'No response generated. Please try rephrasing your question.' });
        return;
      }

      res.json({ reply });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/assistant/scope', aiLimiter, async (req, res) => {
    try {
      const { goal } = req.body ?? {};
      const trimmedGoal = typeof goal === 'string' ? goal.trim() : '';
      if (trimmedGoal.length < 5 || trimmedGoal.length > 1000) {
        res.status(400).json({
          error: 'Goal description must be between 5 and 1000 characters.',
        });
        return;
      }

      const ai = getGeminiClient();
      const response = await withTimeout(
        ai.models.generateContent({
          model: getGeminiModel(),
          contents: `Evaluate this prospective client goal and map it to Pio Languisan's services:\n"${trimmedGoal}"`,
          config: {
            systemInstruction: SYSTEM_CONTEXT,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recommendedTier: {
                  type: Type.STRING,
                  description: "Must be one of: 'individual', 'startup', 'smb', 'enterprise'",
                },
                recommendedService: {
                  type: Type.STRING,
                  description:
                    "Must be one of: 'technical-support', 'customer-service', 'data-analytics', 'admin-operations', 'account-management', 'web-creation'",
                },
                recommendedTimeline: {
                  type: Type.STRING,
                  description: "Suggested engagement timeline, e.g. 'Within 30 days'",
                },
                executiveSummary: {
                  type: Type.STRING,
                  description: 'Concise 2-sentence executive summary of the recommended scope.',
                },
                actionPlan: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 concrete milestone steps for the initial sprint.',
                },
              },
              required: [
                'recommendedTier',
                'recommendedService',
                'recommendedTimeline',
                'executiveSummary',
                'actionPlan',
              ],
            },
          },
        }),
        GEMINI_TIMEOUT_MS
      );

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const scope = sanitizeScopeOutput(parsed);
      res.json({ scope });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // -------------------------------------------------------------------------
  // Authentication, Bootstrap, Recovery, Invitations, MFA & Sessions
  // -------------------------------------------------------------------------
  app.get('/api/auth/status', async (_req, res) => {
    const repo = getCaseRepository();
    const hasAdminUsers = await repo.hasAnyAdminUser();
    const bootstrapSecret = (process.env.ADMIN_BOOTSTRAP_TOKEN || process.env.ADMIN_PASSCODE || '').trim();
    const mailerConfig = getConsultationMailerConfig();
    res.json({
      hasAdminUsers,
      bootstrapConfigured: Boolean(bootstrapSecret),
      passcodeConfigured: Boolean(process.env.ADMIN_PASSCODE?.trim()),
      storageMode: repo.storageMode,
      mailerConfigured: Boolean(mailerConfig),
    });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const s = req.authSession!;
    const repo = getCaseRepository();
    const user = s.userId ? await repo.getUserById(s.userId) : null;
    res.json({
      user: {
        id: s.userId,
        email: s.email,
        name: s.name,
        role: s.role,
        mfaEnabled: Boolean(user?.mfaEnabled),
      },
      csrfToken: s.csrfToken,
      expiresAt: s.expiresAt,
    });
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    const repo = getCaseRepository();
    const ip = getClientIp(req);
    const hasAdmin = await repo.hasAnyAdminUser();
    if (hasAdmin) {
      res.status(409).json({ error: 'An administrator account already exists. Please sign in.' });
      return;
    }

    const expectedSecret = (
      process.env.ADMIN_BOOTSTRAP_TOKEN ||
      process.env.ADMIN_PASSCODE ||
      ''
    ).trim();
    if (!expectedSecret) {
      res.status(503).json({
        error:
          'First-admin bootstrap is not configured. Set ADMIN_BOOTSTRAP_TOKEN or ADMIN_PASSCODE on the server.',
      });
      return;
    }

    if (checkLoginLockout(ip, res)) return;

    const { bootstrapToken, email, name, password } = req.body ?? {};
    const suppliedToken = typeof bootstrapToken === 'string' ? bootstrapToken.trim() : '';
    if (!suppliedToken || !timingSafeMatch(suppliedToken, expectedSecret)) {
      recordLoginFailure(ip);
      await repo.recordAuthAuditEvent({
        userId: null,
        actorEmail: typeof email === 'string' ? email.trim().toLowerCase() : '',
        eventType: 'bootstrap_failed',
        result: 'failure',
        ipAddress: ip,
      });
      res.status(401).json({ error: 'Invalid bootstrap verification token.' });
      return;
    }

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid administrator email address.' });
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'Administrator name must be between 2 and 80 characters.' });
      return;
    }
    const pwError = validateStrongPassword(cleanPassword);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    try {
      const created = await repo.createUser({
        email: cleanEmail,
        name: cleanName,
        password: cleanPassword,
        role: 'super_admin',
      });
      await repo.recordUserLogin(created.id);
      const actor: CaseActor = {
        id: created.id,
        email: created.email,
        name: created.name,
        role: 'super_admin',
      };
      await repo.recordGlobalActivity(actor, 'super_admin_bootstrapped', { email: created.email });
      await repo.recordAuthAuditEvent({
        userId: created.id,
        actorEmail: created.email,
        eventType: 'admin_bootstrapped',
        result: 'success',
        ipAddress: ip,
        metadata: { role: 'super_admin' },
      });
      loginFailureBuckets.delete(ip);

      const session = await createSession({ ...actor, sessionVersion: 1 }, req);
      setSessionCookies(req, res, session);
      res.status(201).json({
        token: session.token,
        csrfToken: session.csrfToken,
        expiresInMs: ADMIN_TOKEN_TTL_MS,
        expiresAt: session.expiresAt,
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
          role: created.role,
          mfaEnabled: false,
        },
      });
    } catch {
      res.status(409).json({ error: 'Unable to create administrator account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = getClientIp(req);
    const repo = getCaseRepository();
    if (checkLoginLockout(ip, res)) {
      await repo.recordAuthAuditEvent({
        userId: null,
        actorEmail: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '',
        eventType: 'login_rate_limited',
        result: 'blocked',
        ipAddress: ip,
      });
      return;
    }

    const { email, password } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!cleanEmail || !cleanPassword) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await repo.getUserByEmail(cleanEmail);
    if (!user || !verifyPassword(cleanPassword, user.passwordHash)) {
      recordLoginFailure(ip);
      await repo.recordAuthAuditEvent({
        userId: user?.id ?? null,
        actorEmail: cleanEmail,
        eventType: 'login_failed',
        result: 'failure',
        ipAddress: ip,
      });
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user.isActive) {
      await repo.recordAuthAuditEvent({
        userId: user.id,
        actorEmail: cleanEmail,
        eventType: 'login_disabled_account',
        result: 'blocked',
        ipAddress: ip,
      });
      res.status(403).json({
        error: 'This account has been deactivated. Contact a Super Administrator for access.',
      });
      return;
    }

    if (user.mfaEnabled && user.mfaSecret) {
      loginFailureBuckets.delete(ip);
      res.status(202).json({
        mfaRequired: true,
        mfaChallenge: signMfaChallenge(user.id),
      });
      return;
    }

    loginFailureBuckets.delete(ip);
    await repo.recordUserLogin(user.id);
    await repo.recordAuthAuditEvent({
      userId: user.id,
      actorEmail: user.email,
      eventType: 'login_succeeded',
      result: 'success',
      ipAddress: ip,
      metadata: { role: user.role },
    });

    const session = await createSession(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionVersion: user.sessionVersion ?? 1,
      },
      req
    );
    setSessionCookies(req, res, session);
    res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      expiresInMs: ADMIN_TOKEN_TTL_MS,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: Boolean(user.mfaEnabled),
      },
    });
  });

  app.post('/api/auth/login/mfa', async (req, res) => {
    const ip = getClientIp(req);
    const repo = getCaseRepository();
    if (checkLoginLockout(ip, res)) return;

    const { mfaChallenge, code } = req.body ?? {};
    const userId = typeof mfaChallenge === 'string' ? verifyMfaChallenge(mfaChallenge) : null;
    if (!userId) {
      res.status(401).json({ error: 'MFA verification challenge is invalid or expired.' });
      return;
    }
    const user = await repo.getUserById(userId);
    if (!user || !user.isActive || !user.mfaEnabled || !user.mfaSecret) {
      res.status(401).json({ error: 'Unable to verify multi-factor authentication.' });
      return;
    }
    if (!verifyTotpCode(user.mfaSecret, String(code || ''))) {
      recordLoginFailure(ip);
      await repo.recordAuthAuditEvent({
        userId: user.id,
        actorEmail: user.email,
        eventType: 'mfa_failed',
        result: 'failure',
        ipAddress: ip,
      });
      res.status(401).json({ error: 'Invalid verification code.' });
      return;
    }

    loginFailureBuckets.delete(ip);
    await repo.recordUserLogin(user.id);
    await repo.recordAuthAuditEvent({
      userId: user.id,
      actorEmail: user.email,
      eventType: 'login_mfa_succeeded',
      result: 'success',
      ipAddress: ip,
    });

    const session = await createSession(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionVersion: user.sessionVersion ?? 1,
      },
      req
    );
    setSessionCookies(req, res, session);
    res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      expiresInMs: ADMIN_TOKEN_TTL_MS,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: true,
      },
    });
  });

  app.post('/api/admin/login', async (req, res) => {
    const expected = process.env.ADMIN_PASSCODE?.trim();
    if (!expected) {
      res.status(503).json({
        error:
          'Administrator passcode authentication is not configured on this server. Sign in with your administrator email and password.',
      });
      return;
    }

    const ip = getClientIp(req);
    const repo = getCaseRepository();
    if (checkLoginLockout(ip, res)) return;

    const { passcode } = req.body ?? {};
    const supplied = typeof passcode === 'string' ? passcode.trim() : '';

    if (!supplied || !timingSafeMatch(supplied, expected)) {
      recordLoginFailure(ip);
      await repo.recordAuthAuditEvent({
        userId: null,
        actorEmail: 'executive-passcode',
        eventType: 'passcode_login_failed',
        result: 'failure',
        ipAddress: ip,
      });
      res.status(401).json({ error: 'Invalid executive passcode.' });
      return;
    }

    loginFailureBuckets.delete(ip);
    const session = await createSession(
      {
        id: null,
        email: 'executive-admin',
        name: 'Executive Admin',
        role: 'super_admin',
        sessionVersion: 1,
      },
      req
    );
    await repo.recordAuthAuditEvent({
      userId: null,
      actorEmail: 'executive-admin',
      eventType: 'passcode_login_succeeded',
      result: 'success',
      ipAddress: ip,
    });
    setSessionCookies(req, res, session);
    res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      expiresInMs: ADMIN_TOKEN_TTL_MS,
      expiresAt: session.expiresAt,
      user: {
        id: null,
        email: session.email,
        name: session.name,
        role: session.role,
        mfaEnabled: false,
      },
    });
  });

  const handleLogout = async (req: AuthenticatedRequest, res: Response) => {
    const repo = getCaseRepository();
    if (req.authSession) {
      activeSessions.delete(req.authSession.token);
      await repo.revokeSessionByTokenHash(req.authSession.tokenHash);
      await repo.recordAuthAuditEvent({
        userId: req.authSession.userId,
        actorEmail: req.authSession.email,
        eventType: 'logout',
        result: 'success',
        ipAddress: getClientIp(req),
      });
    }
    clearSessionCookies(req, res);
    res.json({ ok: true });
  };
  app.post('/api/admin/logout', requireAuth, handleLogout);
  app.post('/api/auth/logout', requireAuth, handleLogout);

  // -------------------------------------------------------------------------
  // Password Recovery & Invitation Acceptance (Public Rate-Limited Flows)
  // -------------------------------------------------------------------------
  const recoveryLimiter = createRateLimiter('recovery', 5, 15 * 60 * 1000);
  app.post('/api/auth/forgot-password', recoveryLimiter, async (req, res) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const mailerConfig = getConsultationMailerConfig();
    if (!mailerConfig) {
      res.status(503).json({
        error:
          'Password recovery email delivery is not configured on this server. Contact a Super Administrator or configure Gmail delivery credentials.',
      });
      return;
    }

    const repo = getCaseRepository();
    const ip = getClientIp(req);
    const user = await repo.getUserByEmail(rawEmail);

    if (user && user.isActive) {
      const rawToken = await repo.createPasswordRecoveryToken(user.id, RECOVERY_TOKEN_TTL_MS);
      const baseAppUrl = resolvePublicAppBaseUrl(req, allowedOrigins);
      const resetUrl = `${baseAppUrl}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;
      const sent = await sendTransactionalEmail({
        to: user.email,
        subject: 'Pio Languisan Admin Console — Password Recovery',
        textBody: [
          `Hello ${user.name},`,
          '',
          'A password recovery link was requested for your Pio Languisan Admin Console account.',
          'Open the link below within 30 minutes to set a new password:',
          resetUrl,
          '',
          'If you did not request this reset, you can safely ignore this message.',
        ].join('\r\n'),
      });
      await repo.recordAuthAuditEvent({
        userId: user.id,
        actorEmail: user.email,
        eventType: 'password_recovery_requested',
        result: sent.delivered ? 'success' : 'failure',
        ipAddress: ip,
        metadata: { delivered: sent.delivered },
      });
    } else {
      await repo.recordAuthAuditEvent({
        userId: user?.id ?? null,
        actorEmail: rawEmail,
        eventType: 'password_recovery_requested',
        result: 'failure',
        ipAddress: ip,
      });
    }

    res.json({
      ok: true,
      message:
        'If an active administrator account matches that email, a password recovery link has been sent.',
    });
  });

  app.post('/api/auth/reset-password', recoveryLimiter, async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!token) {
      res.status(400).json({ error: 'A valid recovery token is required.' });
      return;
    }
    const pwErr = validateStrongPassword(newPassword);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const repo = getCaseRepository();
    const ip = getClientIp(req);
    const consumed = await repo.consumePasswordRecoveryToken(token, newPassword);
    if (!consumed) {
      await repo.recordAuthAuditEvent({
        userId: null,
        actorEmail: '',
        eventType: 'password_reset_failed',
        result: 'failure',
        ipAddress: ip,
      });
      res.status(400).json({ error: 'This password recovery link is invalid or has expired.' });
      return;
    }

    for (const [k, s] of activeSessions.entries()) {
      if (s.userId === consumed.userId) activeSessions.delete(k);
    }
    await repo.recordAuthAuditEvent({
      userId: consumed.userId,
      actorEmail: consumed.email,
      eventType: 'password_reset_completed',
      result: 'success',
      ipAddress: ip,
    });
    clearSessionCookies(req, res);
    res.json({ ok: true, message: 'Your password has been updated. Please sign in.' });
  });

  app.post('/api/auth/accept-invite', recoveryLimiter, async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!token) {
      res.status(400).json({ error: 'A valid invitation token is required.' });
      return;
    }
    const pwErr = validateStrongPassword(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    const repo = getCaseRepository();
    const ip = getClientIp(req);
    const created = await repo.acceptInvitation(token, password);
    if (!created) {
      res.status(400).json({ error: 'This invitation link is invalid, expired, or already used.' });
      return;
    }
    await repo.recordAuthAuditEvent({
      userId: created.id,
      actorEmail: created.email,
      eventType: 'invitation_accepted',
      result: 'success',
      ipAddress: ip,
      metadata: { role: created.role },
    });
    res.status(201).json({ ok: true, user: created });
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    const session = req.authSession!;
    if (!session.userId) {
      res.status(400).json({ error: 'Passcode sessions do not support password updates.' });
      return;
    }
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required.' });
      return;
    }
    const pwErr = validateStrongPassword(newPassword);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    const repo = getCaseRepository();
    const user = await repo.getUserById(session.userId);
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    await repo.updateUserPassword(user.id, newPassword, session.id);
    session.sessionVersion = (user.sessionVersion ?? 1) + 1;
    for (const [k, s] of activeSessions.entries()) {
      if (s.userId === user.id && s.id !== session.id) activeSessions.delete(k);
    }
    await repo.recordAuthAuditEvent({
      userId: user.id,
      actorEmail: user.email,
      eventType: 'password_changed',
      result: 'success',
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true, message: 'Password updated and other active sessions revoked.' });
  });

  app.post('/api/auth/mfa/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
    const session = req.authSession!;
    if (!session.userId) {
      res.status(400).json({ error: 'MFA setup requires a named user account.' });
      return;
    }
    const secret = generateBase32Secret();
    const issuer = encodeURIComponent('Pio Languisan Admin');
    const account = encodeURIComponent(session.email);
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
    res.json({ secret, otpauthUrl });
  });

  app.post('/api/auth/mfa/enable', requireAuth, async (req: AuthenticatedRequest, res) => {
    const session = req.authSession!;
    if (!session.userId) {
      res.status(400).json({ error: 'MFA requires a named user account.' });
      return;
    }
    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!secret || !verifyTotpCode(secret, code)) {
      res.status(400).json({ error: 'Invalid authenticator verification code.' });
      return;
    }
    const repo = getCaseRepository();
    await repo.updateUserMfa(session.userId, { enabled: true, secret });
    await repo.recordAuthAuditEvent({
      userId: session.userId,
      actorEmail: session.email,
      eventType: 'mfa_enabled',
      result: 'success',
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true });
  });

  app.post('/api/auth/mfa/disable', requireAuth, async (req: AuthenticatedRequest, res) => {
    const session = req.authSession!;
    if (!session.userId) {
      res.status(400).json({ error: 'MFA requires a named user account.' });
      return;
    }
    const repo = getCaseRepository();
    await repo.updateUserMfa(session.userId, { enabled: false, secret: null });
    await repo.recordAuthAuditEvent({
      userId: session.userId,
      actorEmail: session.email,
      eventType: 'mfa_disabled',
      result: 'success',
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Case Management API (Authenticated Super Admin, Admin & Scoped Staff)
  // -------------------------------------------------------------------------
  app.get('/api/admin/cases', requireAuth, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    const session = req.authSession!;
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'All';
    const normalizedStatus =
      statusRaw === 'All' ? 'All' : normalizeStatusInput(statusRaw) || 'All';

    const filters: CaseQueryFilters = {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: normalizedStatus,
      serviceDomain:
        typeof req.query.serviceDomain === 'string' &&
        (req.query.serviceDomain === 'All' ||
          VALID_SERVICES.includes(req.query.serviceDomain as ServiceDomainId))
          ? (req.query.serviceDomain as ServiceDomainId | 'All')
          : 'All',
      timeline:
        typeof req.query.timeline === 'string' &&
        (req.query.timeline === 'All' || VALID_TIMELINES.includes(req.query.timeline))
          ? (req.query.timeline as TargetTimelineValue | 'All')
          : 'All',
      assignedTo: typeof req.query.assignedTo === 'string' ? req.query.assignedTo : 'All',
      fromIso: typeof req.query.from === 'string' ? req.query.from : undefined,
      toIso: typeof req.query.to === 'string' ? req.query.to : undefined,
      sortBy:
        typeof req.query.sortBy === 'string' &&
        ['submittedAt', 'updatedAt', 'followUpAt', 'caseNumber', 'status'].includes(req.query.sortBy)
          ? (req.query.sortBy as CaseQueryFilters['sortBy'])
          : 'submittedAt',
      sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
    };

    try {
      if (session.role === 'staff') {
        const all = await repo.getAllCases();
        const permitted = all.filter(
          (c) => c.assignedTo === null || c.assignedTo === session.userId
        );
        const search = (filters.search || '').trim().toLowerCase();
        const filtered = permitted.filter((c) => {
          if (filters.status && filters.status !== 'All' && c.status !== filters.status) return false;
          if (filters.serviceDomain && filters.serviceDomain !== 'All' && c.serviceDomain !== filters.serviceDomain) return false;
          if (filters.timeline && filters.timeline !== 'All' && c.timeline !== filters.timeline) return false;
          if (search && ![c.caseNumber, c.id, c.name, c.email, c.company, c.message].join(' ').toLowerCase().includes(search)) return false;
          return true;
        });
        const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(totalPages, Math.max(1, filters.page ?? 1));
        const offset = (page - 1) * pageSize;
        res.json({
          items: filtered.slice(offset, offset + pageSize),
          total,
          page,
          pageSize,
          totalPages,
          statusCounts: {
            All: permitted.length,
            New: permitted.filter((c) => c.status === 'New').length,
            Pending: permitted.filter((c) => c.status === 'Pending').length,
            'Follow Up': permitted.filter((c) => c.status === 'Follow Up').length,
            Completed: permitted.filter((c) => c.status === 'Completed').length,
          },
        });
        return;
      }
      const result = await repo.listCases(filters);
      res.json(result);
    } catch {
      res.status(503).json({ error: 'Unable to load consultation cases.' });
    }
  });

  app.get('/api/admin/cases/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    const session = req.authSession!;
    try {
      const detail = await repo.getCaseDetail(req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      if (
        session.role === 'staff' &&
        detail.caseRecord.assignedTo !== null &&
        detail.caseRecord.assignedTo !== session.userId
      ) {
        res.status(403).json({ error: 'You do not have permission to view this assigned case.' });
        return;
      }
      res.json(detail);
    } catch {
      res.status(503).json({ error: 'Unable to load case details.' });
    }
  });

  const handleUpdateCase = async (req: AuthenticatedRequest, res: Response) => {
    const repo = getCaseRepository();
    const {
      status,
      statusNote,
      priority,
      assignedTo,
      followUpAt,
      deadlineAt,
      company,
      tier,
      serviceDomain,
      timeline,
      notes,
    } = req.body ?? {};

    const updates: CaseUpdateInput = {};

    if (status !== undefined) {
      const normalized = normalizeStatusInput(status);
      if (!normalized || !CASE_STATUSES.includes(normalized)) {
        res.status(400).json({ error: 'Invalid case status value.' });
        return;
      }
      updates.status = normalized;
    }

    if (statusNote !== undefined) {
      if (typeof statusNote !== 'string' || statusNote.length > 500) {
        res.status(400).json({ error: 'Status note must be 500 characters or fewer.' });
        return;
      }
      updates.statusNote = statusNote.trim();
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        res.status(400).json({ error: 'Invalid case priority value.' });
        return;
      }
      updates.priority = priority;
    }

    if (assignedTo !== undefined) {
      if (assignedTo !== null && typeof assignedTo !== 'string') {
        res.status(400).json({ error: 'Invalid assignee identifier.' });
        return;
      }
      if (typeof assignedTo === 'string' && assignedTo.length > 0) {
        const user = await repo.getUserById(assignedTo);
        if (!user || !user.isActive) {
          res.status(400).json({ error: 'Assigned owner must be an active team user.' });
          return;
        }
        updates.assignedTo = user.id;
      } else {
        updates.assignedTo = null;
      }
    }

    if (followUpAt !== undefined) {
      if (followUpAt !== null && (typeof followUpAt !== 'string' || Number.isNaN(Date.parse(followUpAt)))) {
        res.status(400).json({ error: 'Follow-up date must be a valid ISO timestamp or null.' });
        return;
      }
      updates.followUpAt = followUpAt ? new Date(followUpAt).toISOString() : null;
    }

    if (deadlineAt !== undefined) {
      if (deadlineAt !== null && (typeof deadlineAt !== 'string' || Number.isNaN(Date.parse(deadlineAt)))) {
        res.status(400).json({ error: 'Deadline date must be a valid ISO timestamp or null.' });
        return;
      }
      updates.deadlineAt = deadlineAt ? new Date(deadlineAt).toISOString() : null;
    }

    if (company !== undefined) {
      if (typeof company !== 'string' || company.length > 120) {
        res.status(400).json({ error: 'Organization name must be 120 characters or fewer.' });
        return;
      }
      updates.company = company.trim();
    }

    if (tier !== undefined) {
      if (!VALID_TIERS.includes(tier)) {
        res.status(400).json({ error: 'Invalid organization tier.' });
        return;
      }
      updates.tier = tier;
    }

    if (serviceDomain !== undefined) {
      if (!VALID_SERVICES.includes(serviceDomain)) {
        res.status(400).json({ error: 'Invalid service domain.' });
        return;
      }
      updates.serviceDomain = serviceDomain;
    }

    if (timeline !== undefined) {
      if (!VALID_TIMELINES.includes(timeline)) {
        res.status(400).json({ error: 'Invalid target timeline.' });
        return;
      }
      updates.timeline = timeline;
    }

    if (notes !== undefined) {
      if (typeof notes !== 'string' || notes.length > 2000) {
        res.status(400).json({ error: 'Notes must be a string of 2000 characters or fewer.' });
        return;
      }
      updates.notes = notes.trim();
    }

    try {
      const existingDetail = await repo.getCaseDetail(req.params.id);
      if (!existingDetail) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      if (
        req.authSession!.role === 'staff' &&
        existingDetail.caseRecord.assignedTo !== null &&
        existingDetail.caseRecord.assignedTo !== req.authSession!.userId
      ) {
        res.status(403).json({ error: 'You do not have permission to modify another team member’s assigned case.' });
        return;
      }
      if (
        req.authSession!.role === 'staff' &&
        updates.assignedTo !== undefined &&
        updates.assignedTo !== null &&
        updates.assignedTo !== req.authSession!.userId
      ) {
        res.status(403).json({ error: 'Staff accounts may only claim unassigned cases or manage their own cases.' });
        return;
      }

      const updated = await repo.updateCase(
        req.params.id,
        updates,
        sessionToActor(req.authSession!)
      );
      if (!updated) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      console.info('Consultation case updated', {
        caseNumber: updated.caseNumber,
        inquiryId: updated.id,
        httpStatus: 200,
        status: updated.status,
      });
      res.json({ inquiry: updated, caseRecord: updated });
    } catch {
      res.status(503).json({ error: 'The case could not be updated. Please try again.' });
    }
  };

  app.patch('/api/admin/cases/:id', requireAuth, handleUpdateCase);
  app.patch('/api/admin/inquiries/:id', requireAuth, handleUpdateCase);

  app.post('/api/admin/cases/:id/notes', requireAuth, async (req: AuthenticatedRequest, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (content.length < 1 || content.length > 2000) {
      res.status(400).json({ error: 'Internal note must be between 1 and 2000 characters.' });
      return;
    }
    try {
      const repo = getCaseRepository();
      const existingDetail = await repo.getCaseDetail(req.params.id);
      if (!existingDetail) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      if (
        req.authSession!.role === 'staff' &&
        existingDetail.caseRecord.assignedTo !== null &&
        existingDetail.caseRecord.assignedTo !== req.authSession!.userId
      ) {
        res.status(403).json({ error: 'You do not have permission to add notes to this assigned case.' });
        return;
      }
      const note = await repo.addCaseNote(req.params.id, content, sessionToActor(req.authSession!));
      if (!note) {
        res.status(404).json({ error: 'Case not found.' });
        return;
      }
      res.status(201).json({ note });
    } catch {
      res.status(503).json({ error: 'Unable to save internal note.' });
    }
  });

  // -------------------------------------------------------------------------
  // Analytics & Reports (Super Admin & Admin)
  // -------------------------------------------------------------------------
  app.get('/api/admin/analytics', requireAuth, requireAdminRole, async (req, res) => {
    const repo = getCaseRepository();
    const fromIso = typeof req.query.from === 'string' ? req.query.from : undefined;
    const toIso = typeof req.query.to === 'string' ? req.query.to : undefined;
    const comparePrevious = req.query.comparePrevious === 'true';

    try {
      const allCases = await repo.getAllCases();
      const analytics = computeDashboardAnalytics(allCases, {
        fromIso,
        toIso,
        comparePrevious,
      });
      res.json(analytics);
    } catch {
      res.status(503).json({ error: 'Unable to compute analytics.' });
    }
  });

  app.get('/api/admin/reports/export', requireAuth, requireAdminRole, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'All';
    const normalizedStatus =
      statusRaw === 'All' ? 'All' : normalizeStatusInput(statusRaw) || 'All';

    const filters: CaseQueryFilters = {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: normalizedStatus,
      serviceDomain:
        typeof req.query.serviceDomain === 'string' &&
        (req.query.serviceDomain === 'All' ||
          VALID_SERVICES.includes(req.query.serviceDomain as ServiceDomainId))
          ? (req.query.serviceDomain as ServiceDomainId | 'All')
          : 'All',
      timeline:
        typeof req.query.timeline === 'string' &&
        (req.query.timeline === 'All' || VALID_TIMELINES.includes(req.query.timeline))
          ? (req.query.timeline as TargetTimelineValue | 'All')
          : 'All',
      fromIso: typeof req.query.from === 'string' ? req.query.from : undefined,
      toIso: typeof req.query.to === 'string' ? req.query.to : undefined,
      page: 1,
      pageSize: 10000,
    };

    try {
      const list = await repo.listCases(filters);
      const analytics = computeDashboardAnalytics(list.items);
      const csv = buildCasesCsvReport(list.items, analytics);

      await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'report_exported_csv', {
        rowCount: list.items.length,
        status: filters.status,
        serviceDomain: filters.serviceDomain,
        timeline: filters.timeline,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="consultation-cases-report.csv"');
      res.send(csv);
    } catch {
      res.status(503).json({ error: 'Unable to export CSV report.' });
    }
  });

  // -------------------------------------------------------------------------
  // Notifications & Global Activity Log
  // -------------------------------------------------------------------------
  app.get('/api/admin/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    try {
      const items = await repo.listNotifications(req.authSession!.userId);
      const unreadCount = items.filter((n) => !n.readAt).length;
      res.json({ notifications: items, unreadCount });
    } catch {
      res.status(503).json({ error: 'Unable to load notifications.' });
    }
  });

  app.patch('/api/admin/notifications/:id/read', requireAuth, async (req, res) => {
    const repo = getCaseRepository();
    const ok = await repo.markNotificationRead(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    await repo.markAllNotificationsRead(req.authSession!.userId);
    res.json({ ok: true });
  });

  app.get('/api/admin/activity', requireAuth, requireAdminRole, async (req, res) => {
    const repo = getCaseRepository();
    const limit = Number(req.query.limit) || 100;
    try {
      const items = await repo.listActivity(limit);
      res.json({ activity: items });
    } catch {
      res.status(503).json({ error: 'Unable to load activity log.' });
    }
  });

  app.get('/api/admin/audit-events', requireAuth, requireSuperAdminRole, async (req, res) => {
    const repo = getCaseRepository();
    const limit = Number(req.query.limit) || 100;
    try {
      const events = await repo.listAuthAuditEvents(limit);
      res.json({ events });
    } catch {
      res.status(503).json({ error: 'Unable to load authentication audit events.' });
    }
  });

  // -------------------------------------------------------------------------
  // Team, Invitations, Sessions & Access Management (Super Admin for Admin Settings)
  // -------------------------------------------------------------------------
  app.get('/api/admin/users', requireAuth, requireAdminRole, async (_req, res) => {
    const repo = getCaseRepository();
    try {
      const users = await repo.listUsers();
      res.json({ users });
    } catch {
      res.status(503).json({ error: 'Unable to load team users.' });
    }
  });

  app.post('/api/admin/users', requireAuth, requireSuperAdminRole, async (req: AuthenticatedRequest, res) => {
    const { email, name, role, password } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Valid user email is required.' });
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'User name must be between 2 and 80 characters.' });
      return;
    }
    if (role !== 'super_admin' && role !== 'admin' && role !== 'staff') {
      res.status(400).json({ error: 'Role must be super_admin, admin, or staff.' });
      return;
    }
    const pwErr = validateStrongPassword(cleanPassword);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    try {
      const repo = getCaseRepository();
      const created = await repo.createUser({
        email: cleanEmail,
        name: cleanName,
        role,
        password: cleanPassword,
      });
      await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'user_created', {
        email: created.email,
        role: created.role,
      });
      await repo.recordAuthAuditEvent({
        userId: req.authSession!.userId,
        actorEmail: req.authSession!.email,
        eventType: 'user_created',
        result: 'success',
        ipAddress: getClientIp(req),
        metadata: { targetEmail: created.email, role: created.role },
      });
      res.status(201).json({ user: created });
    } catch {
      res.status(409).json({ error: 'A user with that email already exists.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireSuperAdminRole, async (req: AuthenticatedRequest, res) => {
    const { role, isActive, name } = req.body ?? {};
    const changes: { role?: AdminRole; isActive?: boolean; name?: string } = {};
    if (role !== undefined) {
      if (role !== 'super_admin' && role !== 'admin' && role !== 'staff') {
        res.status(400).json({ error: 'Role must be super_admin, admin, or staff.' });
        return;
      }
      changes.role = role;
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'isActive must be a boolean.' });
        return;
      }
      changes.isActive = isActive;
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
        res.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
        return;
      }
      changes.name = name.trim();
    }

    const repo = getCaseRepository();
    const updated = await repo.updateUser(req.params.id, changes);
    if (!updated) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (updated.isActive === false) {
      for (const [k, s] of activeSessions.entries()) {
        if (s.userId === updated.id) activeSessions.delete(k);
      }
    }
    await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'user_updated', {
      targetUserId: updated.id,
      role: updated.role,
      isActive: updated.isActive,
    });
    await repo.recordAuthAuditEvent({
      userId: req.authSession!.userId,
      actorEmail: req.authSession!.email,
      eventType: 'user_updated',
      result: 'success',
      ipAddress: getClientIp(req),
      metadata: { targetUserId: updated.id, role: updated.role, isActive: updated.isActive },
    });
    res.json({ user: updated });
  });

  app.get('/api/admin/invitations', requireAuth, requireSuperAdminRole, async (_req, res) => {
    const repo = getCaseRepository();
    const invitations = await repo.listInvitations();
    res.json({ invitations });
  });

  app.post('/api/admin/invitations', requireAuth, requireSuperAdminRole, async (req: AuthenticatedRequest, res) => {
    const { email, name, role } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Valid invitee email is required.' });
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'Invitee name must be between 2 and 80 characters.' });
      return;
    }
    if (role !== 'super_admin' && role !== 'admin' && role !== 'staff') {
      res.status(400).json({ error: 'Role must be super_admin, admin, or staff.' });
      return;
    }

    const repo = getCaseRepository();
    const existing = await repo.getUserByEmail(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const { invitation, rawToken } = await repo.createInvitation({
      email: cleanEmail,
      name: cleanName,
      role,
      invitedBy: req.authSession!.userId,
      ttlMs: INVITATION_TOKEN_TTL_MS,
    });
    const baseAppUrl = resolvePublicAppBaseUrl(req, allowedOrigins);
    const inviteUrl = `${baseAppUrl}/admin/accept-invite?token=${encodeURIComponent(rawToken)}`;

    let emailed = false;
    if (getConsultationMailerConfig()) {
      const result = await sendTransactionalEmail({
        to: cleanEmail,
        subject: 'Pio Languisan Admin Console — Team Invitation',
        textBody: [
          `Hello ${cleanName},`,
          '',
          `You have been invited to join the Pio Languisan Admin Console as ${role}.`,
          'Accept your invitation and set your password using the link below (valid for 72 hours):',
          inviteUrl,
        ].join('\r\n'),
      });
      emailed = result.delivered;
    }

    await repo.recordAuthAuditEvent({
      userId: req.authSession!.userId,
      actorEmail: req.authSession!.email,
      eventType: 'invitation_created',
      result: 'success',
      ipAddress: getClientIp(req),
      metadata: { targetEmail: cleanEmail, role, emailed },
    });

    res.status(201).json({
      invitation,
      emailed,
      ...(emailed ? {} : { manualInviteUrl: inviteUrl }),
    });
  });

  app.get('/api/admin/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    const s = req.authSession!;
    const sessions = isSuperAdmin(s.role)
      ? await repo.listSessions()
      : s.userId
        ? await repo.listSessions(s.userId)
        : [];
    res.json({
      sessions: sessions.map((item) => ({
        ...item,
        isCurrent: item.id === s.id,
      })),
    });
  });

  app.post('/api/admin/sessions/:id/revoke', requireAuth, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    const s = req.authSession!;
    const targetUserScope = isSuperAdmin(s.role) ? undefined : s.userId ?? '__none__';
    const revoked = await repo.revokeSessionById(req.params.id, targetUserScope);
    if (!revoked) {
      res.status(404).json({ error: 'Active session not found.' });
      return;
    }
    for (const [k, active] of activeSessions.entries()) {
      if (active.id === req.params.id) activeSessions.delete(k);
    }
    await repo.recordAuthAuditEvent({
      userId: s.userId,
      actorEmail: s.email,
      eventType: 'session_revoked',
      result: 'success',
      ipAddress: getClientIp(req),
      metadata: { revokedSessionId: req.params.id },
    });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Dashboard Overview & Portfolio / Brand Endpoints (RBAC Enforced)
  // -------------------------------------------------------------------------
  app.get('/api/admin/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const repo = getCaseRepository();
      const s = req.authSession!;
      const allCases = await repo.getAllCases();
      const visibleCases =
        s.role === 'staff'
          ? allCases.filter((c) => c.assignedTo === null || c.assignedTo === s.userId)
          : allCases;

      const [content, notifications, users] = await Promise.all([
        repo.getSiteContent(),
        repo.listNotifications(s.userId),
        isAdminOrSuper(s.role) ? repo.listUsers() : Promise.resolve([]),
      ]);
      const analytics = computeDashboardAnalytics(visibleCases);
      res.json({
        inquiries: visibleCases,
        cases: visibleCases,
        projects: content.projects,
        brand: content.brand,
        analytics,
        users,
        unreadNotifications: notifications.filter((n) => !n.readAt).length,
        currentUser: {
          id: s.userId,
          email: s.email,
          name: s.name,
          role: s.role,
        },
      });
    } catch {
      res.status(503).json({ error: 'The inquiry inbox is temporarily unavailable.' });
    }
  });

  app.post('/api/admin/projects', requireAuth, requireSuperAdminRole, async (req: AuthenticatedRequest, res) => {
    const { title, domain, tier, timeframe, metricValue, metricLabel, summary, architecture } =
      req.body ?? {};
    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const trimmedDomain = typeof domain === 'string' ? domain.trim() : '';
    const trimmedSummary = typeof summary === 'string' ? summary.trim() : '';

    if (trimmedTitle.length < 3 || trimmedTitle.length > 140) {
      res.status(400).json({ error: 'Title must be between 3 and 140 characters.' });
      return;
    }
    if (trimmedDomain.length < 2 || trimmedDomain.length > 80) {
      res.status(400).json({ error: 'Domain must be between 2 and 80 characters.' });
      return;
    }
    if (trimmedSummary.length < 10 || trimmedSummary.length > 1200) {
      res.status(400).json({ error: 'Summary must be between 10 and 1200 characters.' });
      return;
    }

    const repo = getCaseRepository();
    const content = await repo.getSiteContent();
    const newProject: ProjectCase = {
      id: `proj-${crypto.randomUUID().slice(0, 8)}`,
      title: trimmedTitle,
      domain: trimmedDomain,
      tier: String(tier || 'SMB & Enterprise').trim().slice(0, 60),
      timeframe: String(timeframe || '4 Weeks').trim().slice(0, 40),
      metricValue: String(metricValue || '+35%').trim().slice(0, 24),
      metricLabel: String(metricLabel || 'Operational efficiency gain').trim().slice(0, 100),
      summary: trimmedSummary,
      architecture: Array.isArray(architecture)
        ? architecture
            .map((a) => String(a).trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, 8)
        : ['Structured operational framework', 'Automated reporting baseline'],
      imageUrl: WORKFLOW_VISUAL_URL,
    };
    const nextProjects = [newProject, ...content.projects];
    await repo.saveSiteContent({ projects: nextProjects });
    await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'project_created', {
      projectId: newProject.id,
      title: newProject.title,
    });
    res.status(201).json({ project: newProject, projects: nextProjects });
  });

  app.delete('/api/admin/projects/:id', requireAuth, requireSuperAdminRole, async (req: AuthenticatedRequest, res) => {
    const repo = getCaseRepository();
    const content = await repo.getSiteContent();
    const next = content.projects.filter((p) => p.id !== req.params.id);
    if (next.length === content.projects.length) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    await repo.saveSiteContent({ projects: next });
    await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'project_deleted', {
      projectId: req.params.id,
    });
    res.json({ projects: next });
  });

  app.post('/api/admin/brand', requireAuth, requireSuperAdminRole, async (req: AuthenticatedRequest, res) => {
    const { customLogoDataUrl, motionEnabled, motionSensitivity } = req.body ?? {};
    if (customLogoDataUrl !== undefined) {
      const check = validateRasterDataUrl(customLogoDataUrl);
      if (!check.valid) {
        res.status(400).json({ error: check.error });
        return;
      }
    }

    const repo = getCaseRepository();
    const content = await repo.getSiteContent();
    const nextBrand = {
      customPortraitDataUrl: null,
      customLogoDataUrl:
        customLogoDataUrl === undefined ? content.brand.customLogoDataUrl : customLogoDataUrl,
      motionEnabled:
        typeof motionEnabled === 'boolean' ? motionEnabled : content.brand.motionEnabled,
      motionSensitivity:
        typeof motionSensitivity === 'number'
          ? Math.min(2, Math.max(0, motionSensitivity))
          : content.brand.motionSensitivity,
    };
    await repo.saveSiteContent({ brand: nextBrand });
    await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'brand_updated', {});
    res.json({ brand: nextBrand });
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (consultationInbox) runConsultationMailer(consultationInbox);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
