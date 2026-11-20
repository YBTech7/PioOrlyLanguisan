import 'dotenv/config';
import {
  consultationInbox,
  getConsultationMailerConfig,
  runConsultationMailer,
} from './consultation.ts';
import {
  getCaseRepository,
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
  token: string;
  csrfToken: string;
  userId: string | null;
  email: string;
  name: string;
  role: AdminRole;
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

function createSession(actor: CaseActor): SessionRecord {
  pruneExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const session: SessionRecord = {
    token,
    csrfToken,
    userId: actor.id,
    email: actor.email,
    name: actor.name,
    role: actor.role,
    expiresAt: Date.now() + ADMIN_TOKEN_TTL_MS,
  };
  activeSessions.set(token, session);
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

function extractSessionFromRequest(req: Request): { session: SessionRecord | null; viaCookie: boolean } {
  pruneExpiredSessions();
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      const found = activeSessions.get(bearer);
      if (found && Date.now() <= found.expiresAt) {
        return { session: found, viaCookie: false };
      }
    }
    return { session: null, viaCookie: false };
  }

  const cookies = parseCookies(req.headers.cookie);
  const signedCookie = cookies[SESSION_COOKIE_NAME];
  if (signedCookie) {
    const rawToken = verifySignedToken(signedCookie);
    if (rawToken) {
      const found = activeSessions.get(rawToken);
      if (found && Date.now() <= found.expiresAt) {
        return { session: found, viaCookie: true };
      }
    }
  }

  return { session: null, viaCookie: false };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const { session, viaCookie } = extractSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Authentication required.' });
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
}

function requireAdminRole(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authSession) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authSession.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges are required for this action.' });
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
  // Authentication & Bootstrap (Email/Password + Server Passcode Fallback)
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

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const s = req.authSession!;
    res.json({
      user: {
        id: s.userId,
        email: s.email,
        name: s.name,
        role: s.role,
      },
      csrfToken: s.csrfToken,
    });
  });

  app.post('/api/auth/bootstrap', async (req, res) => {
    const repo = getCaseRepository();
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

    const ip = getClientIp(req);
    if (checkLoginLockout(ip, res)) return;

    const { bootstrapToken, email, name, password } = req.body ?? {};
    const suppliedToken = typeof bootstrapToken === 'string' ? bootstrapToken.trim() : '';
    if (!suppliedToken || !timingSafeMatch(suppliedToken, expectedSecret)) {
      recordLoginFailure(ip);
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
    if (cleanPassword.length < 12) {
      res.status(400).json({ error: 'Password must be at least 12 characters long.' });
      return;
    }

    try {
      const created = await repo.createUser({
        email: cleanEmail,
        name: cleanName,
        password: cleanPassword,
        role: 'admin',
      });
      await repo.recordUserLogin(created.id);
      const actor: CaseActor = {
        id: created.id,
        email: created.email,
        name: created.name,
        role: 'admin',
      };
      await repo.recordGlobalActivity(actor, 'admin_bootstrapped', { email: created.email });
      loginFailureBuckets.delete(ip);

      const session = createSession(actor);
      setSessionCookies(req, res, session);
      res.status(201).json({
        token: session.token,
        csrfToken: session.csrfToken,
        expiresInMs: ADMIN_TOKEN_TTL_MS,
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
          role: created.role,
        },
      });
    } catch {
      res.status(409).json({ error: 'Unable to create administrator account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = getClientIp(req);
    if (checkLoginLockout(ip, res)) return;

    const { email, password } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!cleanEmail || !cleanPassword) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const repo = getCaseRepository();
    const user = await repo.getUserByEmail(cleanEmail);
    if (!user || !user.isActive || !verifyPassword(cleanPassword, user.passwordHash)) {
      recordLoginFailure(ip);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    loginFailureBuckets.delete(ip);
    await repo.recordUserLogin(user.id);
    const session = createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setSessionCookies(req, res, session);
    res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      expiresInMs: ADMIN_TOKEN_TTL_MS,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const expected = process.env.ADMIN_PASSCODE?.trim();
    if (!expected) {
      res.status(503).json({
        error:
          'Administrator authentication is not configured on this server. Set ADMIN_PASSCODE in server environment variables.',
      });
      return;
    }

    const ip = getClientIp(req);
    if (checkLoginLockout(ip, res)) return;

    const { passcode } = req.body ?? {};
    const supplied = typeof passcode === 'string' ? passcode.trim() : '';

    if (!supplied || !timingSafeMatch(supplied, expected)) {
      recordLoginFailure(ip);
      res.status(401).json({ error: 'Invalid executive passcode.' });
      return;
    }

    loginFailureBuckets.delete(ip);
    const session = createSession({
      id: null,
      email: 'executive-admin',
      name: 'Executive Admin',
      role: 'admin',
    });
    setSessionCookies(req, res, session);
    res.json({
      token: session.token,
      csrfToken: session.csrfToken,
      expiresInMs: ADMIN_TOKEN_TTL_MS,
      user: {
        id: null,
        email: session.email,
        name: session.name,
        role: session.role,
      },
    });
  });

  const handleLogout = (req: AuthenticatedRequest, res: Response) => {
    const { session } = extractSessionFromRequest(req);
    if (session) {
      activeSessions.delete(session.token);
    }
    clearSessionCookies(req, res);
    res.json({ ok: true });
  };
  app.post('/api/admin/logout', requireAuth, handleLogout);
  app.post('/api/auth/logout', requireAuth, handleLogout);

  // -------------------------------------------------------------------------
  // Case Management API (Authenticated Admin & Staff)
  // -------------------------------------------------------------------------
  app.get('/api/admin/cases', requireAuth, async (req, res) => {
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
      const result = await repo.listCases(filters);
      res.json(result);
    } catch {
      res.status(503).json({ error: 'Unable to load consultation cases.' });
    }
  });

  app.get('/api/admin/cases/:id', requireAuth, async (req, res) => {
    const repo = getCaseRepository();
    try {
      const detail = await repo.getCaseDetail(req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'Case not found.' });
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
  // Analytics & Reports
  // -------------------------------------------------------------------------
  app.get('/api/admin/analytics', requireAuth, async (req, res) => {
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

  app.get('/api/admin/activity', requireAuth, async (req, res) => {
    const repo = getCaseRepository();
    const limit = Number(req.query.limit) || 100;
    try {
      const items = await repo.listActivity(limit);
      res.json({ activity: items });
    } catch {
      res.status(503).json({ error: 'Unable to load activity log.' });
    }
  });

  // -------------------------------------------------------------------------
  // Team & Access Management (RBAC: Admin Only for Mutations)
  // -------------------------------------------------------------------------
  app.get('/api/admin/users', requireAuth, async (_req, res) => {
    const repo = getCaseRepository();
    try {
      const users = await repo.listUsers();
      res.json({ users });
    } catch {
      res.status(503).json({ error: 'Unable to load team users.' });
    }
  });

  app.post('/api/admin/users', requireAuth, requireAdminRole, async (req: AuthenticatedRequest, res) => {
    const { email, name, role, password } = req.body ?? {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanRole: AdminRole = role === 'admin' ? 'admin' : role === 'staff' ? 'staff' : 'staff';
    const cleanPassword = typeof password === 'string' ? password : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Valid user email is required.' });
      return;
    }
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'User name must be between 2 and 80 characters.' });
      return;
    }
    if (role !== 'admin' && role !== 'staff') {
      res.status(400).json({ error: 'Role must be admin or staff.' });
      return;
    }
    if (cleanPassword.length < 10) {
      res.status(400).json({ error: 'Password must be at least 10 characters.' });
      return;
    }

    try {
      const repo = getCaseRepository();
      const created = await repo.createUser({
        email: cleanEmail,
        name: cleanName,
        role: cleanRole,
        password: cleanPassword,
      });
      await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'user_created', {
        email: created.email,
        role: created.role,
      });
      res.status(201).json({ user: created });
    } catch {
      res.status(409).json({ error: 'A user with that email already exists.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireAdminRole, async (req: AuthenticatedRequest, res) => {
    const { role, isActive, name } = req.body ?? {};
    const changes: { role?: AdminRole; isActive?: boolean; name?: string } = {};
    if (role !== undefined) {
      if (role !== 'admin' && role !== 'staff') {
        res.status(400).json({ error: 'Role must be admin or staff.' });
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
    await repo.recordGlobalActivity(sessionToActor(req.authSession!), 'user_updated', {
      targetUserId: updated.id,
      role: updated.role,
      isActive: updated.isActive,
    });
    res.json({ user: updated });
  });

  // -------------------------------------------------------------------------
  // Legacy Dashboard & Portfolio / Brand Endpoints (Preserved + RBAC hardened)
  // -------------------------------------------------------------------------
  app.get('/api/admin/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const repo = getCaseRepository();
      const [cases, content, notifications, users] = await Promise.all([
        repo.getAllCases(),
        repo.getSiteContent(),
        repo.listNotifications(req.authSession!.userId),
        repo.listUsers(),
      ]);
      const analytics = computeDashboardAnalytics(cases);
      res.json({
        inquiries: cases,
        cases,
        projects: content.projects,
        brand: content.brand,
        analytics,
        users,
        unreadNotifications: notifications.filter((n) => !n.readAt).length,
        currentUser: {
          id: req.authSession!.userId,
          email: req.authSession!.email,
          name: req.authSession!.name,
          role: req.authSession!.role,
        },
      });
    } catch {
      res.status(503).json({ error: 'The inquiry inbox is temporarily unavailable.' });
    }
  });

  app.post('/api/admin/projects', requireAuth, requireAdminRole, async (req: AuthenticatedRequest, res) => {
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

  app.delete('/api/admin/projects/:id', requireAuth, requireAdminRole, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/admin/brand', requireAuth, requireAdminRole, async (req: AuthenticatedRequest, res) => {
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
