export type ClientTierId = 'individual' | 'startup' | 'smb' | 'enterprise';

export type ServiceDomainId =
  | 'technical-support'
  | 'customer-service'
  | 'data-analytics'
  | 'admin-operations'
  | 'account-management'
  | 'web-creation';

export type TargetTimelineValue =
  | 'Immediate (1–2 weeks)'
  | 'Within 30 days'
  | 'This quarter'
  | 'Advisory / Ongoing';

export type CaseStatus = 'New' | 'Pending' | 'Follow Up' | 'Completed';
export type InquiryStatus = CaseStatus;

export type CasePriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type AdminRole = 'super_admin' | 'admin' | 'staff';

export interface ServiceOffering {
  id: ServiceDomainId;
  index: string;
  title: string;
  shortTitle: string;
  summary: string;
  outcomes: string[];
  deliverables: string[];
  cadence: string;
}

export interface ClientTierSolution {
  id: ClientTierId;
  label: string;
  headline: string;
  description: string;
  recommendedServices: string[];
  engagementModel: string;
  typicalTimeline: string;
  keyDeliverable: string;
}

export interface ProjectCase {
  id: string;
  title: string;
  domain: string;
  tier: string;
  timeframe: string;
  metricValue: string;
  metricLabel: string;
  summary: string;
  architecture: string[];
  imageUrl: string;
}

export interface InsightArticle {
  id: string;
  title: string;
  category: string;
  readTime: string;
  publishedAt: string;
  excerpt: string;
  paragraphs: string[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  topic: string;
}

export type EmailDeliveryState = 'pending' | 'sending' | 'sent' | 'review';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  authProviderId?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt: string | null;
  passwordUpdatedAt?: string | null;
  mfaEnabled?: boolean;
}

export interface AdminInvitation {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface AdminSessionInfo {
  id: string;
  userId: string | null;
  email: string;
  name: string;
  role: AdminRole;
  ipAddress: string;
  userAgent: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent?: boolean;
}

export interface AuthAuditEvent {
  id: string;
  userId: string | null;
  actorEmail: string;
  eventType: string;
  result: 'success' | 'failure' | 'blocked';
  ipAddress: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  name: string;
  email: string;
  phoneCountryCode?: string | null;
  phone?: string;
  company: string;
  tier: ClientTierId;
  serviceDomain: ServiceDomainId;
  timeline: TargetTimelineValue;
  message: string;
  status: CaseStatus;
  priority: CasePriority;
  assignedTo: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  createdAt: string;
  followUpAt: string | null;
  deadlineAt: string | null;
  updatedAt: string;
  version: number;
  notes?: string;
  emailStatus?: EmailDeliveryState;
  emailAttempts?: number;
  providerMessageId?: string | null;
  lastEmailHttpStatus?: number | null;
  lastEmailStage?: string | null;
}

export type InquiryRecord = CaseRecord;

export interface CaseStatusHistoryEntry {
  id: string;
  caseId: string;
  previousStatus: CaseStatus | null;
  newStatus: CaseStatus;
  changedBy: string | null;
  changedByEmail: string;
  note: string;
  changedAt: string;
}

export interface CaseNote {
  id: string;
  caseId: string;
  authorId: string | null;
  authorEmail: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseActivityEntry {
  id: string;
  caseId: string | null;
  caseNumber?: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminNotification {
  id: string;
  recipientId: string | null;
  caseId: string | null;
  caseNumber?: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface CaseDetailPayload {
  caseRecord: CaseRecord;
  statusHistory: CaseStatusHistoryEntry[];
  notes: CaseNote[];
  activity: CaseActivityEntry[];
}

export interface KpiSummary {
  totalRequests: number;
  newRequests: number;
  pendingRequests: number;
  followUpRequests: number;
  completedRequests: number;
  overdueCases: number;
  dueSoonCases: number;
  completionRate: number;
}

export interface DistributionRow {
  key: string;
  label: string;
  count: number;
  percentage: number;
  overdueCount?: number;
  dueSoonCount?: number;
}

export interface MatrixRow {
  key: string;
  label: string;
  New: number;
  Pending: number;
  'Follow Up': number;
  Completed: number;
  total: number;
  completionRate: number;
}

export interface MonthlyTrendPoint {
  month: string;
  submitted: number;
  completed: number;
}

export interface DashboardAnalytics {
  kpis: KpiSummary;
  previousKpis: KpiSummary | null;
  byStatus: DistributionRow[];
  byServiceDomain: DistributionRow[];
  byTimeline: DistributionRow[];
  serviceDomainMatrix: MatrixRow[];
  timelineMatrix: MatrixRow[];
  monthlyTrends: MonthlyTrendPoint[];
}

export interface CaseListResponse {
  items: CaseRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<CaseStatus | 'All', number>;
}

export interface BrandSettings {
  customPortraitDataUrl: string | null;
  customLogoDataUrl: string | null;
  motionEnabled: boolean;
  motionSensitivity: number;
}

export interface SiteContentPayload {
  projects: ProjectCase[];
  insights: InsightArticle[];
  faqs: FaqItem[];
  brand: BrandSettings;
}

export interface AiScopeRecommendation {
  recommendedTier: ClientTierId;
  recommendedService: ServiceDomainId;
  recommendedTimeline: string;
  executiveSummary: string;
  actionPlan: string[];
}
