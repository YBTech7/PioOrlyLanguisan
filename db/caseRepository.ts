import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import {
  INITIAL_FAQS,
  INITIAL_INSIGHTS,
  INITIAL_PROJECTS,
  WORKFLOW_VISUAL_URL,
} from '../src/data/profileData.ts';
import type {
  AdminNotification,
  AdminRole,
  AdminUser,
  BrandSettings,
  CaseActivityEntry,
  CaseDetailPayload,
  CaseListResponse,
  CaseNote,
  CasePriority,
  CaseRecord,
  CaseStatus,
  CaseStatusHistoryEntry,
  ClientTierId,
  EmailDeliveryState,
  FaqItem,
  InsightArticle,
  ProjectCase,
  ServiceDomainId,
  TargetTimelineValue,
} from '../src/types.ts';

export interface StoredUser extends AdminUser {
  passwordHash: string;
}

interface IdempotencyEntry {
  key: string;
  requestHash: string;
  caseId: string;
  createdAt: string;
}

export interface PersistentCaseStore {
  caseSequence: number;
  users: StoredUser[];
  cases: CaseRecord[];
  caseStatusHistory: CaseStatusHistoryEntry[];
  caseNotes: CaseNote[];
  caseActivity: CaseActivityEntry[];
  notifications: AdminNotification[];
  idempotencyKeys: IdempotencyEntry[];
  projects: ProjectCase[];
  insights: InsightArticle[];
  faqs: FaqItem[];
  brand: BrandSettings;
}

export interface CreateCaseInput {
  id?: string;
  name: string;
  email: string;
  phoneCountryCode?: string | null;
  phone?: string;
  company: string;
  tier: ClientTierId;
  serviceDomain: ServiceDomainId;
  timeline: TargetTimelineValue;
  message: string;
}

export interface CaseActor {
  id: string | null;
  email: string;
  name: string;
  role: AdminRole;
}

export interface CaseQueryFilters {
  search?: string;
  status?: CaseStatus | 'All';
  serviceDomain?: ServiceDomainId | 'All';
  timeline?: TargetTimelineValue | 'All';
  assignedTo?: string | 'All' | 'unassigned';
  fromIso?: string;
  toIso?: string;
  sortBy?: 'submittedAt' | 'updatedAt' | 'followUpAt' | 'caseNumber' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CaseUpdateInput {
  status?: CaseStatus;
  statusNote?: string;
  priority?: CasePriority;
  assignedTo?: string | null;
  followUpAt?: string | null;
  deadlineAt?: string | null;
  company?: string;
  tier?: ClientTierId;
  serviceDomain?: ServiceDomainId;
  timeline?: TargetTimelineValue;
  notes?: string;
}

export const DEFAULT_BRAND: BrandSettings = {
  customPortraitDataUrl: null,
  customLogoDataUrl: null,
  motionEnabled: true,
  motionSensitivity: 1,
};

const DATA_DIR = path.resolve(process.cwd(), 'data');

function getStorePath(): string {
  return process.env.DATA_STORE_PATH
    ? path.resolve(process.env.DATA_STORE_PATH)
    : path.join(DATA_DIR, 'store.json');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function computeRequestHash(input: CreateCaseInput): string {
  const canonical = JSON.stringify({
    name: input.name,
    email: input.email.toLowerCase(),
    phoneCountryCode: input.phoneCountryCode ?? null,
    phone: input.phone ?? null,
    company: input.company,
    tier: input.tier,
    serviceDomain: input.serviceDomain,
    timeline: input.timeline,
    message: input.message,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function normalizeLegacyStatus(raw: unknown): CaseStatus {
  if (raw === 'New' || raw === 'Pending' || raw === 'Follow Up' || raw === 'Completed') {
    return raw;
  }
  if (raw === 'In Review') return 'Pending';
  if (raw === 'Scheduled') return 'Follow Up';
  return 'New';
}

function normalizeAssetPath(imageUrl: string): string {
  if (!imageUrl) return WORKFLOW_VISUAL_URL;
  if (imageUrl.startsWith('/src/assets/')) {
    return imageUrl.slice(5);
  }
  if (imageUrl.startsWith('/assets/')) {
    return imageUrl.slice(1);
  }
  return imageUrl;
}

function formatCaseNumber(seq: number): string {
  return `CASE-${String(seq).padStart(6, '0')}`;
}

function createInitialStore(): PersistentCaseStore {
  const isProd = process.env.NODE_ENV === 'production';
  const sampleId = 'INQ-2026-SAMPLE01';
  const sampleCase: CaseRecord = {
    id: sampleId,
    caseNumber: 'CASE-000001',
    name: 'Elena Rostova',
    email: 'elena@northstar-ops.example',
    phoneCountryCode: null,
    company: 'Northstar Logistics',
    tier: 'smb',
    serviceDomain: 'data-analytics',
    timeline: 'Within 30 days',
    message:
      'Looking to consolidate weekly customer support and account renewal spreadsheets into a single executive KPI dashboard.',
    status: 'Pending',
    priority: 'Normal',
    assignedTo: null,
    assignedToName: null,
    assignedToEmail: null,
    createdAt: '2026-11-15T14:20:00.000Z',
    followUpAt: null,
    deadlineAt: null,
    updatedAt: '2026-11-15T14:20:00.000Z',
    version: 1,
    notes: 'Sample development record.',
  };

  return {
    caseSequence: isProd ? 0 : 1,
    users: [],
    cases: isProd ? [] : [sampleCase],
    caseStatusHistory: isProd
      ? []
      : [
          {
            id: 'hist-sample-01',
            caseId: sampleId,
            previousStatus: null,
            newStatus: 'New',
            changedBy: null,
            changedByEmail: 'system',
            note: 'Consultation request recorded.',
            changedAt: '2026-11-15T14:20:00.000Z',
          },
          {
            id: 'hist-sample-02',
            caseId: sampleId,
            previousStatus: 'New',
            newStatus: 'Pending',
            changedBy: null,
            changedByEmail: 'system',
            note: 'Sample development record.',
            changedAt: '2026-11-15T14:21:00.000Z',
          },
        ],
    caseNotes: isProd
      ? []
      : [
          {
            id: 'note-sample-01',
            caseId: sampleId,
            authorId: null,
            authorEmail: 'system',
            content: 'Sample development record.',
            createdAt: '2026-11-15T14:21:00.000Z',
            updatedAt: '2026-11-15T14:21:00.000Z',
          },
        ],
    caseActivity: isProd
      ? []
      : [
          {
            id: 'act-sample-01',
            caseId: sampleId,
            caseNumber: 'CASE-000001',
            actorId: null,
            actorEmail: 'public-form',
            action: 'case_created',
            metadata: { serviceDomain: 'data-analytics', tier: 'smb' },
            createdAt: '2026-11-15T14:20:00.000Z',
          },
        ],
    notifications: [],
    idempotencyKeys: [],
    projects: INITIAL_PROJECTS,
    insights: INITIAL_INSIGHTS,
    faqs: INITIAL_FAQS,
    brand: DEFAULT_BRAND,
  };
}

let memoryStore: PersistentCaseStore | null = null;
let storeLock: Promise<void> = Promise.resolve();

function withStoreLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = storeLock.then(() => fn());
  storeLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function hydrateLegacyRecord(raw: Record<string, unknown>, seq: number): CaseRecord {
  const status = normalizeLegacyStatus(raw.status);
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString();
  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt;
  return {
    id: String(raw.id || `INQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`),
    caseNumber:
      typeof raw.caseNumber === 'string' && raw.caseNumber
        ? raw.caseNumber
        : formatCaseNumber(seq),
    name: String(raw.name || ''),
    email: String(raw.email || ''),
    phoneCountryCode: typeof raw.phoneCountryCode === 'string' ? raw.phoneCountryCode : null,
    ...(typeof raw.phone === 'string' && raw.phone ? { phone: raw.phone } : {}),
    company: String(raw.company ?? ''),
    tier: (raw.tier as ClientTierId) || 'startup',
    serviceDomain: (raw.serviceDomain as ServiceDomainId) || 'technical-support',
    timeline: (raw.timeline as TargetTimelineValue) || 'Within 30 days',
    message: String(raw.message || ''),
    status,
    priority: (raw.priority as CasePriority) || 'Normal',
    assignedTo: typeof raw.assignedTo === 'string' ? raw.assignedTo : null,
    assignedToName: typeof raw.assignedToName === 'string' ? raw.assignedToName : null,
    assignedToEmail: typeof raw.assignedToEmail === 'string' ? raw.assignedToEmail : null,
    createdAt,
    followUpAt: typeof raw.followUpAt === 'string' ? raw.followUpAt : null,
    deadlineAt: typeof raw.deadlineAt === 'string' ? raw.deadlineAt : null,
    updatedAt,
    version: typeof raw.version === 'number' ? raw.version : 1,
    ...(typeof raw.notes === 'string' ? { notes: raw.notes } : {}),
    ...(raw.emailStatus ? { emailStatus: raw.emailStatus as EmailDeliveryState } : {}),
  };
}

function ensureFileStore(): PersistentCaseStore {
  if (memoryStore) return memoryStore;
  const storePath = getStorePath();
  const dir = path.dirname(storePath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(storePath)) {
      const initial = createInitialStore();
      fs.writeFileSync(storePath, JSON.stringify(initial, null, 2), 'utf-8');
      memoryStore = initial;
      return initial;
    }

    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistentCaseStore> & {
      inquiries?: Array<Record<string, unknown>>;
    };

    const rawCases = Array.isArray(parsed.cases)
      ? (parsed.cases as unknown as Array<Record<string, unknown>>)
      : Array.isArray(parsed.inquiries)
        ? parsed.inquiries
        : [];

    let seqCounter = typeof parsed.caseSequence === 'number' ? parsed.caseSequence : 0;
    const hydratedCases = rawCases.map((item) => {
      seqCounter = Math.max(seqCounter, 0);
      if (typeof item.caseNumber === 'string' && /^CASE-\d+$/.test(item.caseNumber)) {
        const num = Number.parseInt(item.caseNumber.replace('CASE-', ''), 10);
        if (Number.isFinite(num) && num > seqCounter) seqCounter = num;
        return hydrateLegacyRecord(item, num);
      }
      seqCounter += 1;
      return hydrateLegacyRecord(item, seqCounter);
    });

    const projects =
      Array.isArray(parsed.projects) && parsed.projects.length > 0
        ? parsed.projects.map((p) => ({
            ...p,
            imageUrl: normalizeAssetPath(p.imageUrl),
          }))
        : INITIAL_PROJECTS;

    const hydrated: PersistentCaseStore = {
      caseSequence: seqCounter,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      cases: hydratedCases,
      caseStatusHistory: Array.isArray(parsed.caseStatusHistory) ? parsed.caseStatusHistory : [],
      caseNotes: Array.isArray(parsed.caseNotes) ? parsed.caseNotes : [],
      caseActivity: Array.isArray(parsed.caseActivity) ? parsed.caseActivity : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      idempotencyKeys: Array.isArray(parsed.idempotencyKeys) ? parsed.idempotencyKeys : [],
      projects,
      insights:
        Array.isArray(parsed.insights) && parsed.insights.length > 0
          ? parsed.insights
          : INITIAL_INSIGHTS,
      faqs:
        Array.isArray(parsed.faqs) && parsed.faqs.length > 0 ? parsed.faqs : INITIAL_FAQS,
      brand: { ...DEFAULT_BRAND, ...(parsed.brand || {}) },
    };

    memoryStore = hydrated;
    return hydrated;
  } catch {
    memoryStore = createInitialStore();
    return memoryStore;
  }
}

function persistFileStore(store: PersistentCaseStore): void {
  memoryStore = store;
  const storePath = getStorePath();
  const dir = path.dirname(storePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Keep updated in memoryStore if filesystem is read-only
  }
}

export function resetRepositoryForTests(): void {
  memoryStore = null;
}

function sanitizePublicUser(u: StoredUser): AdminUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function applyCaseFilters(cases: readonly CaseRecord[], filters: CaseQueryFilters): CaseRecord[] {
  const search = (filters.search || '').trim().toLowerCase();
  const fromMs = filters.fromIso ? Date.parse(filters.fromIso) : NaN;
  const toMs = filters.toIso ? Date.parse(filters.toIso) : NaN;

  return cases.filter((c) => {
    if (filters.status && filters.status !== 'All' && c.status !== filters.status) return false;
    if (
      filters.serviceDomain &&
      filters.serviceDomain !== 'All' &&
      c.serviceDomain !== filters.serviceDomain
    ) {
      return false;
    }
    if (filters.timeline && filters.timeline !== 'All' && c.timeline !== filters.timeline) {
      return false;
    }
    if (filters.assignedTo && filters.assignedTo !== 'All') {
      if (filters.assignedTo === 'unassigned') {
        if (c.assignedTo !== null) return false;
      } else if (c.assignedTo !== filters.assignedTo) {
        return false;
      }
    }
    if (!Number.isNaN(fromMs) || !Number.isNaN(toMs)) {
      const subMs = Date.parse(c.createdAt);
      if (!Number.isNaN(fromMs) && subMs < fromMs) return false;
      if (!Number.isNaN(toMs) && subMs > toMs) return false;
    }
    if (search) {
      const haystack = [
        c.caseNumber,
        c.id,
        c.name,
        c.email,
        c.company,
        c.message,
        c.phone || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function sortCases(cases: CaseRecord[], sortBy = 'submittedAt', sortDir = 'desc'): CaseRecord[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...cases].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'caseNumber') {
      cmp = a.caseNumber.localeCompare(b.caseNumber);
    } else if (sortBy === 'status') {
      cmp = a.status.localeCompare(b.status);
    } else if (sortBy === 'updatedAt') {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    } else if (sortBy === 'followUpAt') {
      cmp = (a.followUpAt || '9999').localeCompare(b.followUpAt || '9999');
    } else {
      cmp = a.createdAt.localeCompare(b.createdAt);
    }
    return cmp * dir;
  });
}

function buildStatusCounts(cases: readonly CaseRecord[]): Record<CaseStatus | 'All', number> {
  return {
    All: cases.length,
    New: cases.filter((c) => c.status === 'New').length,
    Pending: cases.filter((c) => c.status === 'Pending').length,
    'Follow Up': cases.filter((c) => c.status === 'Follow Up').length,
    Completed: cases.filter((c) => c.status === 'Completed').length,
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL Backend Adapter
// ---------------------------------------------------------------------------

function createPostgresAdapter(dbUrl: string) {
  const sql = postgres(dbUrl, { max: 5, connect_timeout: 5 });
  let readyPromise: Promise<void> | null = null;

  const ensureReady = (): Promise<void> => {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const migrationPath = path.resolve(process.cwd(), 'db/migrations/001_case_management.sql');
      const ddl = fs.readFileSync(migrationPath, 'utf-8');
      await sql.unsafe(ddl);
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
    return readyPromise;
  };

  const mapPgCaseRow = (row: Record<string, unknown>): CaseRecord => ({
    id: String(row.id),
    caseNumber: String(row.case_number),
    name: String(row.requester_name),
    email: String(row.requester_email),
    phoneCountryCode: row.phone_country_code ? String(row.phone_country_code) : null,
    ...(row.phone_number ? { phone: String(row.phone_number) } : {}),
    company: String(row.organization ?? ''),
    tier: row.organization_tier as ClientTierId,
    serviceDomain: row.service_domain as ServiceDomainId,
    timeline: row.target_timeline as TargetTimelineValue,
    message: String(row.project_context),
    status: row.status as CaseStatus,
    priority: row.priority as CasePriority,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    assignedToName: row.assigned_to_name ? String(row.assigned_to_name) : null,
    assignedToEmail: row.assigned_to_email ? String(row.assigned_to_email) : null,
    createdAt: new Date(String(row.submitted_at)).toISOString(),
    followUpAt: row.follow_up_at ? new Date(String(row.follow_up_at)).toISOString() : null,
    deadlineAt: row.deadline_at ? new Date(String(row.deadline_at)).toISOString() : null,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    version: Number(row.version ?? 1),
    ...(row.latest_note ? { notes: String(row.latest_note) } : {}),
    emailStatus: (row.email_state as EmailDeliveryState) || 'pending',
    emailAttempts: Number(row.email_attempts ?? 0),
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    lastEmailHttpStatus:
      typeof row.last_email_http_status === 'number' ? row.last_email_http_status : null,
    lastEmailStage: row.last_email_stage ? String(row.last_email_stage) : null,
  });

  return {
    storageMode: 'postgres' as const,
    close: () => sql.end(),

    async hasAnyAdminUser(): Promise<boolean> {
      await ensureReady();
      const [row] = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin' AND is_active = true
      `;
      return Number(row?.count || 0) > 0;
    },

    async listUsers(): Promise<AdminUser[]> {
      await ensureReady();
      const rows = await sql<Record<string, unknown>[]>`
        SELECT id, email, name, role, is_active, created_at, last_login_at
        FROM users ORDER BY created_at ASC
      `;
      return rows.map((r) => ({
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        role: r.role as AdminRole,
        isActive: Boolean(r.is_active),
        createdAt: new Date(String(r.created_at)).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(String(r.last_login_at)).toISOString() : null,
      }));
    },

    async getUserByEmail(email: string): Promise<StoredUser | null> {
      await ensureReady();
      const [r] = await sql<Record<string, unknown>[]>`
        SELECT * FROM users WHERE lower(email) = lower(${email}) LIMIT 1
      `;
      if (!r) return null;
      return {
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        passwordHash: String(r.password_hash),
        role: r.role as AdminRole,
        isActive: Boolean(r.is_active),
        createdAt: new Date(String(r.created_at)).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(String(r.last_login_at)).toISOString() : null,
      };
    },

    async getUserById(id: string): Promise<AdminUser | null> {
      await ensureReady();
      const [r] = await sql<Record<string, unknown>[]>`
        SELECT id, email, name, role, is_active, created_at, last_login_at
        FROM users WHERE id = ${id} LIMIT 1
      `;
      if (!r) return null;
      return {
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        role: r.role as AdminRole,
        isActive: Boolean(r.is_active),
        createdAt: new Date(String(r.created_at)).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(String(r.last_login_at)).toISOString() : null,
      };
    },

    async createUser(input: {
      email: string;
      name: string;
      password: string;
      role: AdminRole;
    }): Promise<AdminUser> {
      await ensureReady();
      const id = `usr-${crypto.randomUUID().slice(0, 12)}`;
      const passwordHash = hashPassword(input.password);
      const [r] = await sql<Record<string, unknown>[]>`
        INSERT INTO users (id, email, name, password_hash, role, is_active)
        VALUES (${id}, ${input.email.toLowerCase()}, ${input.name}, ${passwordHash}, ${input.role}, true)
        RETURNING id, email, name, role, is_active, created_at, last_login_at
      `;
      return {
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        role: r.role as AdminRole,
        isActive: Boolean(r.is_active),
        createdAt: new Date(String(r.created_at)).toISOString(),
        lastLoginAt: null,
      };
    },

    async updateUser(
      id: string,
      changes: { role?: AdminRole; isActive?: boolean; name?: string }
    ): Promise<AdminUser | null> {
      await ensureReady();
      const existing = await this.getUserById(id);
      if (!existing) return null;
      const [r] = await sql<Record<string, unknown>[]>`
        UPDATE users
        SET role = ${changes.role ?? existing.role},
            is_active = ${changes.isActive ?? existing.isActive},
            name = ${changes.name ?? existing.name}
        WHERE id = ${id}
        RETURNING id, email, name, role, is_active, created_at, last_login_at
      `;
      if (!r) return null;
      return {
        id: String(r.id),
        email: String(r.email),
        name: String(r.name),
        role: r.role as AdminRole,
        isActive: Boolean(r.is_active),
        createdAt: new Date(String(r.created_at)).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(String(r.last_login_at)).toISOString() : null,
      };
    },

    async recordUserLogin(id: string): Promise<void> {
      await ensureReady();
      await sql`UPDATE users SET last_login_at = now() WHERE id = ${id}`;
    },

    async createCase(
      input: CreateCaseInput,
      submissionKey: string
    ): Promise<{ caseRecord: CaseRecord; deduplicated: boolean } | { conflict: true }> {
      await ensureReady();
      const requestHash = computeRequestHash(input);

      return sql.begin(async (tx) => {
        const [existingKey] = await tx<
          { request_hash: string; case_id: string }[]
        >`SELECT request_hash, case_id FROM idempotency_keys WHERE key = ${submissionKey} FOR UPDATE`;

        if (existingKey) {
          if (existingKey.request_hash !== requestHash) {
            return { conflict: true } as const;
          }
          const [existingCase] = await tx<Record<string, unknown>[]>`
            SELECT c.*, u.name AS assigned_to_name, u.email AS assigned_to_email
            FROM cases c
            LEFT JOIN users u ON u.id = c.assigned_to
            WHERE c.id = ${existingKey.case_id}
          `;
          if (existingCase) {
            return { caseRecord: mapPgCaseRow(existingCase), deduplicated: true };
          }
        }

        const [seqRow] = await tx<{ nextval: string }[]>`SELECT nextval('case_number_seq')::text AS nextval`;
        const caseNumber = formatCaseNumber(Number(seqRow.nextval));
        const id =
          input.id ||
          `INQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        const [inserted] = await tx<Record<string, unknown>[]>`
          INSERT INTO cases (
            id, case_number, legacy_tracking_id, requester_name, requester_email,
            phone_country_code, phone_number, organization, organization_tier,
            service_domain, target_timeline, project_context, status, priority
          ) VALUES (
            ${id}, ${caseNumber}, ${id}, ${input.name}, ${input.email},
            ${input.phoneCountryCode ?? null}, ${input.phone ?? null},
            ${input.company}, ${input.tier}, ${input.serviceDomain},
            ${input.timeline}, ${input.message}, 'New', 'Normal'
          )
          RETURNING *
        `;

        await tx`
          INSERT INTO idempotency_keys (key, request_hash, case_id)
          VALUES (${submissionKey}, ${requestHash}, ${id})
        `;

        await tx`
          INSERT INTO case_status_history (id, case_id, previous_status, new_status, changed_by, changed_by_email, note)
          VALUES (${`hist-${crypto.randomUUID().slice(0, 12)}`}, ${id}, ${null}, 'New', ${null}, 'public-form', 'Consultation request created via public intake form.')
        `;

        await tx`
          INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
          VALUES (
            ${`act-${crypto.randomUUID().slice(0, 12)}`},
            ${id},
            ${null},
            'public-form',
            'case_created',
            ${tx.json({ caseNumber, serviceDomain: input.serviceDomain, tier: input.tier, timeline: input.timeline })}
          )
        `;

        const recipients = await tx<{ id: string }[]>`SELECT id FROM users WHERE is_active = true`;
        if (recipients.length === 0) {
          await tx`
            INSERT INTO notifications (id, recipient_id, case_id, type, title, message)
            VALUES (
              ${`ntf-${crypto.randomUUID().slice(0, 12)}`},
              ${null},
              ${id},
              'new_case',
              ${`New case ${caseNumber}`},
              ${`${input.name} submitted a consultation request for ${input.serviceDomain}.`}
            )
          `;
        } else {
          for (const rec of recipients) {
            await tx`
              INSERT INTO notifications (id, recipient_id, case_id, type, title, message)
              VALUES (
                ${`ntf-${crypto.randomUUID().slice(0, 12)}`},
                ${rec.id},
                ${id},
                'new_case',
                ${`New case ${caseNumber}`},
                ${`${input.name} submitted a consultation request for ${input.serviceDomain}.`}
              )
            `;
          }
        }

        return { caseRecord: mapPgCaseRow(inserted), deduplicated: false };
      });
    },

    async getAllCases(): Promise<CaseRecord[]> {
      await ensureReady();
      const rows = await sql<Record<string, unknown>[]>`
        SELECT c.*, u.name AS assigned_to_name, u.email AS assigned_to_email,
          (SELECT content FROM case_notes n WHERE n.case_id = c.id ORDER BY n.created_at DESC LIMIT 1) AS latest_note
        FROM cases c
        LEFT JOIN users u ON u.id = c.assigned_to
        ORDER BY c.submitted_at DESC
      `;
      return rows.map(mapPgCaseRow);
    },

    async listCases(filters: CaseQueryFilters): Promise<CaseListResponse> {
      const all = await this.getAllCases();
      const filtered = applyCaseFilters(all, filters);
      const sorted = sortCases(filtered, filters.sortBy, filters.sortDir);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
      const total = sorted.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(totalPages, Math.max(1, filters.page ?? 1));
      const offset = (page - 1) * pageSize;
      return {
        items: sorted.slice(offset, offset + pageSize),
        total,
        page,
        pageSize,
        totalPages,
        statusCounts: buildStatusCounts(all),
      };
    },

    async getCaseDetail(idOrCaseNumber: string): Promise<CaseDetailPayload | null> {
      await ensureReady();
      const [row] = await sql<Record<string, unknown>[]>`
        SELECT c.*, u.name AS assigned_to_name, u.email AS assigned_to_email,
          (SELECT content FROM case_notes n WHERE n.case_id = c.id ORDER BY n.created_at DESC LIMIT 1) AS latest_note
        FROM cases c
        LEFT JOIN users u ON u.id = c.assigned_to
        WHERE c.id = ${idOrCaseNumber} OR c.case_number = ${idOrCaseNumber}
        LIMIT 1
      `;
      if (!row) return null;
      const caseRecord = mapPgCaseRow(row);

      const historyRows = await sql<Record<string, unknown>[]>`
        SELECT * FROM case_status_history WHERE case_id = ${caseRecord.id} ORDER BY changed_at DESC
      `;
      const noteRows = await sql<Record<string, unknown>[]>`
        SELECT * FROM case_notes WHERE case_id = ${caseRecord.id} ORDER BY created_at DESC
      `;
      const activityRows = await sql<Record<string, unknown>[]>`
        SELECT a.*, c.case_number
        FROM case_activity a
        LEFT JOIN cases c ON c.id = a.case_id
        WHERE a.case_id = ${caseRecord.id}
        ORDER BY a.created_at DESC
      `;

      return {
        caseRecord,
        statusHistory: historyRows.map((h) => ({
          id: String(h.id),
          caseId: String(h.case_id),
          previousStatus: (h.previous_status as CaseStatus) ?? null,
          newStatus: h.new_status as CaseStatus,
          changedBy: h.changed_by ? String(h.changed_by) : null,
          changedByEmail: String(h.changed_by_email || 'system'),
          note: String(h.note || ''),
          changedAt: new Date(String(h.changed_at)).toISOString(),
        })),
        notes: noteRows.map((n) => ({
          id: String(n.id),
          caseId: String(n.case_id),
          authorId: n.author_id ? String(n.author_id) : null,
          authorEmail: String(n.author_email || ''),
          content: String(n.content),
          createdAt: new Date(String(n.created_at)).toISOString(),
          updatedAt: new Date(String(n.updated_at)).toISOString(),
        })),
        activity: activityRows.map((a) => ({
          id: String(a.id),
          caseId: a.case_id ? String(a.case_id) : null,
          caseNumber: a.case_number ? String(a.case_number) : undefined,
          actorId: a.actor_id ? String(a.actor_id) : null,
          actorEmail: String(a.actor_email || ''),
          action: String(a.action),
          metadata: (a.metadata as Record<string, unknown>) || {},
          createdAt: new Date(String(a.created_at)).toISOString(),
        })),
      };
    },

    async updateCase(
      id: string,
      updates: CaseUpdateInput,
      actor: CaseActor
    ): Promise<CaseRecord | null> {
      await ensureReady();
      return sql.begin(async (tx) => {
        const [existingRow] = await tx<Record<string, unknown>[]>`
          SELECT * FROM cases WHERE id = ${id} OR case_number = ${id} FOR UPDATE
        `;
        if (!existingRow) return null;

        const existing = mapPgCaseRow(existingRow);
        const nextStatus = updates.status ?? existing.status;
        const nextPriority = updates.priority ?? existing.priority;
        const nextAssigned =
          updates.assignedTo === undefined ? existing.assignedTo : updates.assignedTo;
        const nextFollowUp =
          updates.followUpAt === undefined ? existing.followUpAt : updates.followUpAt;
        const nextDeadline =
          updates.deadlineAt === undefined ? existing.deadlineAt : updates.deadlineAt;
        const nextCompany = updates.company ?? existing.company;
        const nextTier = updates.tier ?? existing.tier;
        const nextDomain = updates.serviceDomain ?? existing.serviceDomain;
        const nextTimeline = updates.timeline ?? existing.timeline;

        await tx`
          UPDATE cases
          SET status = ${nextStatus},
              priority = ${nextPriority},
              assigned_to = ${nextAssigned},
              follow_up_at = ${nextFollowUp},
              deadline_at = ${nextDeadline},
              organization = ${nextCompany},
              organization_tier = ${nextTier},
              service_domain = ${nextDomain},
              target_timeline = ${nextTimeline},
              updated_at = now(),
              version = version + 1
          WHERE id = ${existing.id}
        `;

        if (updates.status !== undefined && updates.status !== existing.status) {
          await tx`
            INSERT INTO case_status_history (id, case_id, previous_status, new_status, changed_by, changed_by_email, note)
            VALUES (
              ${`hist-${crypto.randomUUID().slice(0, 12)}`},
              ${existing.id},
              ${existing.status},
              ${updates.status},
              ${actor.id},
              ${actor.email},
              ${updates.statusNote ?? ''}
            )
          `;
          await tx`
            INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
            VALUES (
              ${`act-${crypto.randomUUID().slice(0, 12)}`},
              ${existing.id},
              ${actor.id},
              ${actor.email},
              'status_changed',
              ${tx.json({ from: existing.status, to: updates.status, note: updates.statusNote || '' })}
            )
          `;
        }

        if (updates.assignedTo !== undefined && updates.assignedTo !== existing.assignedTo) {
          await tx`
            INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
            VALUES (
              ${`act-${crypto.randomUUID().slice(0, 12)}`},
              ${existing.id},
              ${actor.id},
              ${actor.email},
              'owner_assigned',
              ${tx.json({ from: existing.assignedTo, to: updates.assignedTo })}
            )
          `;
          if (updates.assignedTo) {
            await tx`
              INSERT INTO notifications (id, recipient_id, case_id, type, title, message)
              VALUES (
                ${`ntf-${crypto.randomUUID().slice(0, 12)}`},
                ${updates.assignedTo},
                ${existing.id},
                'case_assigned',
                ${`Assigned ${existing.caseNumber}`},
                ${`${actor.email} assigned case ${existing.caseNumber} (${existing.name}) to you.`}
              )
            `;
          }
        }

        if (updates.notes !== undefined && updates.notes.trim().length > 0) {
          await tx`
            INSERT INTO case_notes (id, case_id, author_id, author_email, content)
            VALUES (${`note-${crypto.randomUUID().slice(0, 12)}`}, ${existing.id}, ${actor.id}, ${actor.email}, ${updates.notes.trim()})
          `;
          await tx`
            INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
            VALUES (${`act-${crypto.randomUUID().slice(0, 12)}`}, ${existing.id}, ${actor.id}, ${actor.email}, 'note_added', ${tx.json({ preview: updates.notes.trim().slice(0, 80) })})
          `;
        }

        const otherMetadataChanged =
          (updates.priority !== undefined && updates.priority !== existing.priority) ||
          (updates.followUpAt !== undefined && updates.followUpAt !== existing.followUpAt) ||
          (updates.deadlineAt !== undefined && updates.deadlineAt !== existing.deadlineAt) ||
          (updates.company !== undefined && updates.company !== existing.company) ||
          (updates.tier !== undefined && updates.tier !== existing.tier) ||
          (updates.serviceDomain !== undefined && updates.serviceDomain !== existing.serviceDomain) ||
          (updates.timeline !== undefined && updates.timeline !== existing.timeline);

        if (otherMetadataChanged) {
          await tx`
            INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
            VALUES (
              ${`act-${crypto.randomUUID().slice(0, 12)}`},
              ${existing.id},
              ${actor.id},
              ${actor.email},
              'metadata_updated',
              ${tx.json({ priority: nextPriority, followUpAt: nextFollowUp, deadlineAt: nextDeadline })}
            )
          `;
        }

        const [updatedRow] = await tx<Record<string, unknown>[]>`
          SELECT c.*, u.name AS assigned_to_name, u.email AS assigned_to_email,
            (SELECT content FROM case_notes n WHERE n.case_id = c.id ORDER BY n.created_at DESC LIMIT 1) AS latest_note
          FROM cases c
          LEFT JOIN users u ON u.id = c.assigned_to
          WHERE c.id = ${existing.id}
        `;
        return mapPgCaseRow(updatedRow);
      });
    },

    async addCaseNote(
      caseId: string,
      content: string,
      actor: CaseActor
    ): Promise<CaseNote | null> {
      await ensureReady();
      const [existingRow] = await sql<{ id: string }[]>`
        SELECT id FROM cases WHERE id = ${caseId} OR case_number = ${caseId} LIMIT 1
      `;
      if (!existingRow) return null;
      const noteId = `note-${crypto.randomUUID().slice(0, 12)}`;
      const [inserted] = await sql<Record<string, unknown>[]>`
        INSERT INTO case_notes (id, case_id, author_id, author_email, content)
        VALUES (${noteId}, ${existingRow.id}, ${actor.id}, ${actor.email}, ${content})
        RETURNING *
      `;
      await sql`UPDATE cases SET updated_at = now() WHERE id = ${existingRow.id}`;
      await sql`
        INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
        VALUES (${`act-${crypto.randomUUID().slice(0, 12)}`}, ${existingRow.id}, ${actor.id}, ${actor.email}, 'note_added', ${sql.json({ preview: content.slice(0, 80) })})
      `;
      return {
        id: String(inserted.id),
        caseId: String(inserted.case_id),
        authorId: inserted.author_id ? String(inserted.author_id) : null,
        authorEmail: String(inserted.author_email),
        content: String(inserted.content),
        createdAt: new Date(String(inserted.created_at)).toISOString(),
        updatedAt: new Date(String(inserted.updated_at)).toISOString(),
      };
    },

    async recordGlobalActivity(
      actor: CaseActor,
      action: string,
      metadata: Record<string, unknown> = {},
      caseId: string | null = null
    ): Promise<void> {
      await ensureReady();
      await sql`
        INSERT INTO case_activity (id, case_id, actor_id, actor_email, action, metadata)
        VALUES (${`act-${crypto.randomUUID().slice(0, 12)}`}, ${caseId}, ${actor.id}, ${actor.email}, ${action}, ${sql.json(metadata as postgres.JSONValue)})
      `;
    },

    async listActivity(limit = 100): Promise<CaseActivityEntry[]> {
      await ensureReady();
      const rows = await sql<Record<string, unknown>[]>`
        SELECT a.*, c.case_number
        FROM case_activity a
        LEFT JOIN cases c ON c.id = a.case_id
        ORDER BY a.created_at DESC
        LIMIT ${Math.min(500, Math.max(1, limit))}
      `;
      return rows.map((a) => ({
        id: String(a.id),
        caseId: a.case_id ? String(a.case_id) : null,
        caseNumber: a.case_number ? String(a.case_number) : undefined,
        actorId: a.actor_id ? String(a.actor_id) : null,
        actorEmail: String(a.actor_email || ''),
        action: String(a.action),
        metadata: (a.metadata as Record<string, unknown>) || {},
        createdAt: new Date(String(a.created_at)).toISOString(),
      }));
    },

    async listNotifications(recipientId: string | null): Promise<AdminNotification[]> {
      await ensureReady();
      const rows = recipientId
        ? await sql<Record<string, unknown>[]>`
            SELECT n.*, c.case_number
            FROM notifications n
            LEFT JOIN cases c ON c.id = n.case_id
            WHERE n.recipient_id = ${recipientId} OR n.recipient_id IS NULL
            ORDER BY n.created_at DESC LIMIT 100
          `
        : await sql<Record<string, unknown>[]>`
            SELECT n.*, c.case_number
            FROM notifications n
            LEFT JOIN cases c ON c.id = n.case_id
            ORDER BY n.created_at DESC LIMIT 100
          `;
      return rows.map((n) => ({
        id: String(n.id),
        recipientId: n.recipient_id ? String(n.recipient_id) : null,
        caseId: n.case_id ? String(n.case_id) : null,
        caseNumber: n.case_number ? String(n.case_number) : undefined,
        type: String(n.type),
        title: String(n.title),
        message: String(n.message),
        readAt: n.read_at ? new Date(String(n.read_at)).toISOString() : null,
        createdAt: new Date(String(n.created_at)).toISOString(),
      }));
    },

    async markNotificationRead(id: string): Promise<boolean> {
      await ensureReady();
      const rows = await sql`
        UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = ${id} RETURNING id
      `;
      return rows.length > 0;
    },

    async markAllNotificationsRead(recipientId: string | null): Promise<void> {
      await ensureReady();
      if (recipientId) {
        await sql`
          UPDATE notifications SET read_at = now()
          WHERE read_at IS NULL AND (recipient_id = ${recipientId} OR recipient_id IS NULL)
        `;
      } else {
        await sql`UPDATE notifications SET read_at = now() WHERE read_at IS NULL`;
      }
    },

    async getSiteContent() {
      const store = ensureFileStore();
      return {
        projects: store.projects,
        insights: store.insights,
        faqs: store.faqs,
        brand: store.brand,
      };
    },

    async saveSiteContent(updates: {
      projects?: ProjectCase[];
      brand?: BrandSettings;
    }) {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        if (updates.projects) store.projects = updates.projects;
        if (updates.brand) store.brand = updates.brand;
        persistFileStore(store);
        return {
          projects: store.projects,
          insights: store.insights,
          faqs: store.faqs,
          brand: store.brand,
        };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// File / Memory Store Adapter (100% feature parity when PostgreSQL is unset)
// ---------------------------------------------------------------------------

function createFileAdapter() {
  const enrichCaseWithOwner = (
    c: CaseRecord,
    users: readonly StoredUser[]
  ): CaseRecord => {
    const owner = c.assignedTo ? users.find((u) => u.id === c.assignedTo) : undefined;
    return {
      ...c,
      assignedToName: owner?.name ?? c.assignedToName ?? null,
      assignedToEmail: owner?.email ?? c.assignedToEmail ?? null,
    };
  };

  return {
    storageMode: 'file' as const,
    close: async () => undefined,

    async hasAnyAdminUser(): Promise<boolean> {
      const store = ensureFileStore();
      return store.users.some((u) => u.role === 'admin' && u.isActive);
    },

    async listUsers(): Promise<AdminUser[]> {
      const store = ensureFileStore();
      return store.users.map(sanitizePublicUser);
    },

    async getUserByEmail(email: string): Promise<StoredUser | null> {
      const store = ensureFileStore();
      const target = email.toLowerCase();
      return store.users.find((u) => u.email.toLowerCase() === target) ?? null;
    },

    async getUserById(id: string): Promise<AdminUser | null> {
      const store = ensureFileStore();
      const found = store.users.find((u) => u.id === id);
      return found ? sanitizePublicUser(found) : null;
    },

    async createUser(input: {
      email: string;
      name: string;
      password: string;
      role: AdminRole;
    }): Promise<AdminUser> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const normalizedEmail = input.email.toLowerCase();
        if (store.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          throw new Error('DUPLICATE_EMAIL');
        }
        const user: StoredUser = {
          id: `usr-${crypto.randomUUID().slice(0, 12)}`,
          email: normalizedEmail,
          name: input.name,
          passwordHash: hashPassword(input.password),
          role: input.role,
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        };
        store.users.push(user);
        persistFileStore(store);
        return sanitizePublicUser(user);
      });
    },

    async updateUser(
      id: string,
      changes: { role?: AdminRole; isActive?: boolean; name?: string }
    ): Promise<AdminUser | null> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const user = store.users.find((u) => u.id === id);
        if (!user) return null;
        if (changes.role !== undefined) user.role = changes.role;
        if (changes.isActive !== undefined) user.isActive = changes.isActive;
        if (changes.name !== undefined) user.name = changes.name;
        persistFileStore(store);
        return sanitizePublicUser(user);
      });
    },

    async recordUserLogin(id: string): Promise<void> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const user = store.users.find((u) => u.id === id);
        if (user) {
          user.lastLoginAt = new Date().toISOString();
          persistFileStore(store);
        }
      });
    },

    async createCase(
      input: CreateCaseInput,
      submissionKey: string
    ): Promise<{ caseRecord: CaseRecord; deduplicated: boolean } | { conflict: true }> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const requestHash = computeRequestHash(input);

        const existingKey = store.idempotencyKeys.find((k) => k.key === submissionKey);
        if (existingKey) {
          if (existingKey.requestHash !== requestHash) {
            return { conflict: true } as const;
          }
          const existingCase = store.cases.find((c) => c.id === existingKey.caseId);
          if (existingCase) {
            return {
              caseRecord: enrichCaseWithOwner(existingCase, store.users),
              deduplicated: true,
            };
          }
        }

        store.caseSequence += 1;
        const caseNumber = formatCaseNumber(store.caseSequence);
        const now = new Date().toISOString();
        const id =
          input.id ||
          `INQ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        const record: CaseRecord = {
          id,
          caseNumber,
          name: input.name,
          email: input.email,
          phoneCountryCode: input.phoneCountryCode ?? null,
          ...(input.phone ? { phone: input.phone } : {}),
          company: input.company,
          tier: input.tier,
          serviceDomain: input.serviceDomain,
          timeline: input.timeline,
          message: input.message,
          status: 'New',
          priority: 'Normal',
          assignedTo: null,
          assignedToName: null,
          assignedToEmail: null,
          createdAt: now,
          followUpAt: null,
          deadlineAt: null,
          updatedAt: now,
          version: 1,
        };

        store.cases.unshift(record);
        store.idempotencyKeys.push({
          key: submissionKey,
          requestHash,
          caseId: id,
          createdAt: now,
        });
        store.caseStatusHistory.unshift({
          id: `hist-${crypto.randomUUID().slice(0, 12)}`,
          caseId: id,
          previousStatus: null,
          newStatus: 'New',
          changedBy: null,
          changedByEmail: 'public-form',
          note: 'Consultation request created via public intake form.',
          changedAt: now,
        });
        store.caseActivity.unshift({
          id: `act-${crypto.randomUUID().slice(0, 12)}`,
          caseId: id,
          caseNumber,
          actorId: null,
          actorEmail: 'public-form',
          action: 'case_created',
          metadata: {
            caseNumber,
            serviceDomain: input.serviceDomain,
            tier: input.tier,
            timeline: input.timeline,
          },
          createdAt: now,
        });

        const activeRecipients = store.users.filter((u) => u.isActive);
        if (activeRecipients.length === 0) {
          store.notifications.unshift({
            id: `ntf-${crypto.randomUUID().slice(0, 12)}`,
            recipientId: null,
            caseId: id,
            caseNumber,
            type: 'new_case',
            title: `New case ${caseNumber}`,
            message: `${input.name} submitted a consultation request for ${input.serviceDomain}.`,
            readAt: null,
            createdAt: now,
          });
        } else {
          for (const rec of activeRecipients) {
            store.notifications.unshift({
              id: `ntf-${crypto.randomUUID().slice(0, 12)}`,
              recipientId: rec.id,
              caseId: id,
              caseNumber,
              type: 'new_case',
              title: `New case ${caseNumber}`,
              message: `${input.name} submitted a consultation request for ${input.serviceDomain}.`,
              readAt: null,
              createdAt: now,
            });
          }
        }

        persistFileStore(store);
        return { caseRecord: record, deduplicated: false };
      });
    },

    async getAllCases(): Promise<CaseRecord[]> {
      const store = ensureFileStore();
      return store.cases.map((c) => enrichCaseWithOwner(c, store.users));
    },

    async listCases(filters: CaseQueryFilters): Promise<CaseListResponse> {
      const all = await this.getAllCases();
      const filtered = applyCaseFilters(all, filters);
      const sorted = sortCases(filtered, filters.sortBy, filters.sortDir);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
      const total = sorted.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(totalPages, Math.max(1, filters.page ?? 1));
      const offset = (page - 1) * pageSize;
      return {
        items: sorted.slice(offset, offset + pageSize),
        total,
        page,
        pageSize,
        totalPages,
        statusCounts: buildStatusCounts(all),
      };
    },

    async getCaseDetail(idOrCaseNumber: string): Promise<CaseDetailPayload | null> {
      const store = ensureFileStore();
      const found = store.cases.find(
        (c) => c.id === idOrCaseNumber || c.caseNumber === idOrCaseNumber
      );
      if (!found) return null;
      return {
        caseRecord: enrichCaseWithOwner(found, store.users),
        statusHistory: store.caseStatusHistory
          .filter((h) => h.caseId === found.id)
          .sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
        notes: store.caseNotes
          .filter((n) => n.caseId === found.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        activity: store.caseActivity
          .filter((a) => a.caseId === found.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    },

    async updateCase(
      id: string,
      updates: CaseUpdateInput,
      actor: CaseActor
    ): Promise<CaseRecord | null> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const target = store.cases.find((c) => c.id === id || c.caseNumber === id);
        if (!target) return null;

        const now = new Date().toISOString();
        const prevStatus = target.status;
        const prevAssigned = target.assignedTo;

        if (updates.status !== undefined && updates.status !== prevStatus) {
          target.status = updates.status;
          store.caseStatusHistory.unshift({
            id: `hist-${crypto.randomUUID().slice(0, 12)}`,
            caseId: target.id,
            previousStatus: prevStatus,
            newStatus: updates.status,
            changedBy: actor.id,
            changedByEmail: actor.email,
            note: updates.statusNote ?? '',
            changedAt: now,
          });
          store.caseActivity.unshift({
            id: `act-${crypto.randomUUID().slice(0, 12)}`,
            caseId: target.id,
            caseNumber: target.caseNumber,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'status_changed',
            metadata: { from: prevStatus, to: updates.status, note: updates.statusNote || '' },
            createdAt: now,
          });
        }

        if (updates.assignedTo !== undefined && updates.assignedTo !== prevAssigned) {
          target.assignedTo = updates.assignedTo;
          store.caseActivity.unshift({
            id: `act-${crypto.randomUUID().slice(0, 12)}`,
            caseId: target.id,
            caseNumber: target.caseNumber,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'owner_assigned',
            metadata: { from: prevAssigned, to: updates.assignedTo },
            createdAt: now,
          });
          if (updates.assignedTo) {
            store.notifications.unshift({
              id: `ntf-${crypto.randomUUID().slice(0, 12)}`,
              recipientId: updates.assignedTo,
              caseId: target.id,
              caseNumber: target.caseNumber,
              type: 'case_assigned',
              title: `Assigned ${target.caseNumber}`,
              message: `${actor.email} assigned case ${target.caseNumber} (${target.name}) to you.`,
              readAt: null,
              createdAt: now,
            });
          }
        }

        const otherMetadataChanged =
          (updates.priority !== undefined && updates.priority !== target.priority) ||
          (updates.followUpAt !== undefined && updates.followUpAt !== target.followUpAt) ||
          (updates.deadlineAt !== undefined && updates.deadlineAt !== target.deadlineAt) ||
          (updates.company !== undefined && updates.company !== target.company) ||
          (updates.tier !== undefined && updates.tier !== target.tier) ||
          (updates.serviceDomain !== undefined && updates.serviceDomain !== target.serviceDomain) ||
          (updates.timeline !== undefined && updates.timeline !== target.timeline);

        if (updates.priority !== undefined) target.priority = updates.priority;
        if (updates.followUpAt !== undefined) target.followUpAt = updates.followUpAt;
        if (updates.deadlineAt !== undefined) target.deadlineAt = updates.deadlineAt;
        if (updates.company !== undefined) target.company = updates.company;
        if (updates.tier !== undefined) target.tier = updates.tier;
        if (updates.serviceDomain !== undefined) target.serviceDomain = updates.serviceDomain;
        if (updates.timeline !== undefined) target.timeline = updates.timeline;

        if (otherMetadataChanged) {
          store.caseActivity.unshift({
            id: `act-${crypto.randomUUID().slice(0, 12)}`,
            caseId: target.id,
            caseNumber: target.caseNumber,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'metadata_updated',
            metadata: {
              priority: target.priority,
              followUpAt: target.followUpAt,
              deadlineAt: target.deadlineAt,
            },
            createdAt: now,
          });
        }

        if (updates.notes !== undefined) {
          target.notes = updates.notes;
          if (updates.notes.trim().length > 0) {
            store.caseNotes.unshift({
              id: `note-${crypto.randomUUID().slice(0, 12)}`,
              caseId: target.id,
              authorId: actor.id,
              authorEmail: actor.email,
              content: updates.notes.trim(),
              createdAt: now,
              updatedAt: now,
            });
            store.caseActivity.unshift({
              id: `act-${crypto.randomUUID().slice(0, 12)}`,
              caseId: target.id,
              caseNumber: target.caseNumber,
              actorId: actor.id,
              actorEmail: actor.email,
              action: 'note_added',
              metadata: { preview: updates.notes.trim().slice(0, 80) },
              createdAt: now,
            });
          }
        }

        target.updatedAt = now;
        target.version = (target.version || 1) + 1;

        persistFileStore(store);
        return enrichCaseWithOwner(target, store.users);
      });
    },

    async addCaseNote(
      caseId: string,
      content: string,
      actor: CaseActor
    ): Promise<CaseNote | null> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const target = store.cases.find((c) => c.id === caseId || c.caseNumber === caseId);
        if (!target) return null;
        const now = new Date().toISOString();
        const note: CaseNote = {
          id: `note-${crypto.randomUUID().slice(0, 12)}`,
          caseId: target.id,
          authorId: actor.id,
          authorEmail: actor.email,
          content,
          createdAt: now,
          updatedAt: now,
        };
        store.caseNotes.unshift(note);
        target.notes = content;
        target.updatedAt = now;
        store.caseActivity.unshift({
          id: `act-${crypto.randomUUID().slice(0, 12)}`,
          caseId: target.id,
          caseNumber: target.caseNumber,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'note_added',
          metadata: { preview: content.slice(0, 80) },
          createdAt: now,
        });
        persistFileStore(store);
        return note;
      });
    },

    async recordGlobalActivity(
      actor: CaseActor,
      action: string,
      metadata: Record<string, unknown> = {},
      caseId: string | null = null
    ): Promise<void> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        store.caseActivity.unshift({
          id: `act-${crypto.randomUUID().slice(0, 12)}`,
          caseId,
          actorId: actor.id,
          actorEmail: actor.email,
          action,
          metadata,
          createdAt: new Date().toISOString(),
        });
        persistFileStore(store);
      });
    },

    async listActivity(limit = 100): Promise<CaseActivityEntry[]> {
      const store = ensureFileStore();
      return [...store.caseActivity]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.min(500, Math.max(1, limit)));
    },

    async listNotifications(recipientId: string | null): Promise<AdminNotification[]> {
      const store = ensureFileStore();
      return store.notifications
        .filter((n) => !recipientId || n.recipientId === recipientId || n.recipientId === null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100);
    },

    async markNotificationRead(id: string): Promise<boolean> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const target = store.notifications.find((n) => n.id === id);
        if (!target) return false;
        if (!target.readAt) target.readAt = new Date().toISOString();
        persistFileStore(store);
        return true;
      });
    },

    async markAllNotificationsRead(recipientId: string | null): Promise<void> {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        const now = new Date().toISOString();
        for (const n of store.notifications) {
          if (
            !n.readAt &&
            (!recipientId || n.recipientId === recipientId || n.recipientId === null)
          ) {
            n.readAt = now;
          }
        }
        persistFileStore(store);
      });
    },

    async getSiteContent() {
      const store = ensureFileStore();
      return {
        projects: store.projects,
        insights: store.insights,
        faqs: store.faqs,
        brand: store.brand,
      };
    },

    async saveSiteContent(updates: {
      projects?: ProjectCase[];
      brand?: BrandSettings;
    }) {
      return withStoreLock(() => {
        const store = structuredClone(ensureFileStore());
        if (updates.projects) store.projects = updates.projects;
        if (updates.brand) store.brand = updates.brand;
        persistFileStore(store);
        return {
          projects: store.projects,
          insights: store.insights,
          faqs: store.faqs,
          brand: store.brand,
        };
      });
    },
  };
}

export type CaseRepository = ReturnType<typeof createFileAdapter> | ReturnType<typeof createPostgresAdapter>;

let cachedRepo: CaseRepository | null = null;

export function getCaseRepository(): CaseRepository {
  if (cachedRepo) return cachedRepo;
  const dbUrl = (process.env.CONSULTATION_DATABASE_URL || process.env.DATABASE_URL || '').trim();
  if (dbUrl && process.env.NODE_ENV !== 'test') {
    try {
      cachedRepo = createPostgresAdapter(dbUrl);
      return cachedRepo;
    } catch {
      console.warn('PostgreSQL initialization deferred — using file/memory case repository');
    }
  }
  cachedRepo = createFileAdapter();
  return cachedRepo;
}
