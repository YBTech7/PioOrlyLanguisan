# Pio Languisan — Admin Authentication & Case Management Guide

## 1. Dedicated Admin Routes
All administrative workflows live under dedicated, protected application routes compatible with both root hosting and GitHub Pages subpath deployment (`/PioOrlyLanguisan/`):

- `/admin/login` — Dedicated Administrator Login Portal (Email & Password, Remember Email, MFA prompt, optional First-Time Super Admin Setup & Executive Passcode access)
- `/admin/forgot-password` — Request a single-use password recovery link (requires Gmail OAuth mailer configuration; returns an honest `503` notice if email delivery is not configured)
- `/admin/reset-password?token=...` — Set a new strong password (12+ chars, upper/lower/digit or symbol) and revoke prior sessions
- `/admin/accept-invite?token=...` — Activate an invited team account with a strong password
- `/admin/dashboard` — Executive KPI Overview, 6-Stage Consultation Request Workflow Pipeline, Service Domain & Target Timeline summaries, Overall Completion Progress, and Recent Cases
- `/admin/cases` & `/admin/cases/:caseId` — Filterable case queue (`All`, `New`, `Pending`, `Follow Up`, `Completed`), status transitions, internal notes, deadlines, `Completed At` tracking, and audit history
- `/admin/analytics` — Service Domain & Target Timeline bar charts, accessible summary tables, and status matrices
- `/admin/reports` — Filtered CSV exports with spreadsheet formula-injection protection
- `/admin/notifications` — Synchronized case notifications (auto-refreshes every 60 seconds while the tab is visible and on manual Refresh; covers new inquiries, assignments, reassignments, status updates, completion, 48-hour due-soon alerts, and overdue reminders)
- `/admin/activity` — Immutable case operations log and (for Super Admins) authentication security events
- `/admin/users` — Team user management, role updates, account deactivation, pending invitations, and active session revocation (`admin` read-only view; `super_admin` management controls)
- `/admin/settings` — Password changes, TOTP MFA setup, personal active sessions, and portfolio/brand controls (`super_admin`)

## 2. Case Lifecycle, Status Governance & KPI Definitions
1. **Six-Stage Workflow Pipeline** (visualized on Dashboard Overview):
   - **01. Consultation Request Submitted** → **02. Individual Case Created** (`CASE-00000x`) → **03. Initial Status: New** → **04. Administrator Review** (`Pending`) → **05. Status Update** (`Follow Up`) → **06. Case Completion** (`Completed`).
2. **Completed Case Reopen Governance**:
   - **Staff** accounts cannot reopen a `Completed` case (`403 Forbidden`).
   - **Admin** and **Super Admin** accounts may reopen a `Completed` case back to `New`, `Pending`, or `Follow Up` **only by supplying a mandatory Reopen Reason (`>= 5` characters)**, which is recorded in `case_status_history` and clears `completedAt`.
3. **KPI Semantics**:
   - **Completion Rate** = `Completed Requests / Total Requests × 100` (returns `0%` safely when Total Requests is `0`).
   - **Overdue Cases** = incomplete cases (`status !== 'Completed'`) whose `deadlineAt` or `followUpAt` is earlier than the current UTC timestamp.
   - **Due Soon** = incomplete cases (`status !== 'Completed'`) not yet overdue whose `deadlineAt` or `followUpAt` falls within the next **48 hours**.
   - **Target Timeline Categories** (`Immediate (1–2 weeks)`, `Within 30 days`, `This quarter`, `Advisory / Ongoing`) represent client urgency preferences, distinct from explicit `deadlineAt`/`followUpAt` timestamps.

## 3. Role-Based Access Control (RBAC)
1. **Super Admin (`super_admin`)**
   - Full platform access: team user provisioning, role changes, account deactivation, team invitations, authentication security audit logs, cross-account session revocation, portfolio case study CRUD, brand logo management, plus all Admin capabilities.
   - First-time bootstrap (`/api/auth/bootstrap`) creates the initial `super_admin` user and permanently locks (`409 Conflict`) once any user exists.
2. **Admin (`admin`)**
   - Full case visibility across all team members, KPI overview, Service Domain & Target Timeline analytics, CSV report exports, case status/assignment management, reopening completed cases (with reason), notifications, activity log, read-only `/admin/users` directory view, and personal security settings.
   - Restricted (`403 Forbidden`) from creating/modifying team users or roles, sending invitations, viewing raw authentication audit events, or modifying public portfolio/brand assets.
3. **Staff (`staff`)**
   - Scoped case visibility (`assignedTo === null` or assigned to the signed-in staff user), status updates (except reopening `Completed` cases), internal notes, personal notifications, and personal security settings.
   - Restricted (`403 Forbidden`) from viewing analytics, CSV exports, activity logs, `/admin/users`, or cases assigned to another team member.

## 4. Password, Session & MFA Security
- **Password Policy**: Minimum 12 characters containing uppercase, lowercase, and a numeric digit or symbol. Hashed with per-user salted `scrypt`.
- **Sessions**: Stored in `admin_sessions` (PostgreSQL or transactional store) with `HttpOnly`, `SameSite`, and CSRF cookies. Deactivating a user, changing their role, resetting their password, or revoking a session increments `sessionVersion` / marks the session revoked so protected requests immediately return `401 SESSION_EXPIRED`.
- **MFA (TOTP)**: Optional RFC 6238 6-digit authenticator verification managed in **Settings → Authenticator MFA (TOTP)**.

## 5. Database & Deployment
- **PostgreSQL / Supabase**: Set `CONSULTATION_DATABASE_URL` (or `DATABASE_URL`). On startup, `db/migrations/001_case_management.sql`, `002_admin_auth_security.sql`, and `003_supabase_rls_and_reconciliation.sql` run idempotently after verifying no conflicting legacy UUID schema exists (`supabase/migrations/20261120000002_canonical_case_management_reconcile.sql`).
- **GitHub Pages + External Backend (Railway)**:
  - Keep `VITE_BASE_PATH=/PioOrlyLanguisan/` and `VITE_API_BASE_URL=<your-backend-url>` during GitHub Pages builds.
  - `public/404.html` rewrites deep `/PioOrlyLanguisan/admin/*` refreshes cleanly to `?p=/admin/...`, which `src/lib/adminRouter.ts` restores without inline scripts in `index.html`.
  - Set `ALLOWED_ORIGINS=https://ybtech7.github.io`, `PUBLIC_APP_URL=https://ybtech7.github.io/PioOrlyLanguisan`, and `SESSION_SECRET=<strong-random-secret>` on the backend service.
