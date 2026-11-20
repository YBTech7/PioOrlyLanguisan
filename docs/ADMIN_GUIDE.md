# Pio Languisan — Admin Authentication & Case Management Guide

## 1. Dedicated Admin Routes
All administrative workflows live under dedicated, protected application routes compatible with both root hosting and GitHub Pages subpath deployment (`/PioOrlyLanguisan/`):

- `/admin/login` — Dedicated Administrator Login Portal (Email & Password, Remember Email, MFA prompt, optional First-Time Super Admin Setup & Executive Passcode access)
- `/admin/forgot-password` — Request a single-use password recovery link (requires Gmail OAuth mailer configuration; returns an honest `503` notice if email delivery is not configured)
- `/admin/reset-password?token=...` — Set a new strong password (12+ chars, upper/lower/digit or symbol) and revoke prior sessions
- `/admin/accept-invite?token=...` — Activate an invited team account with a strong password
- `/admin/dashboard` — Executive KPI Overview & Recent Cases
- `/admin/cases` & `/admin/cases/:caseId` — Filterable case queue, status transitions, internal notes, deadlines, and audit history
- `/admin/analytics` — Service Domain & Target Timeline distributions and status matrices
- `/admin/reports` — Filtered CSV exports with spreadsheet formula-injection protection
- `/admin/notifications` — Real-time case arrival and assignment notifications
- `/admin/activity` — Immutable case operations log and (for Super Admins) authentication security events
- `/admin/settings` — Password changes, TOTP MFA setup, active session revocation, team user management, invitations, and portfolio/brand controls

## 2. Role-Based Access Control (RBAC)
1. **Super Admin (`super_admin`)**
   - Full platform access: team user provisioning, role changes, account deactivation, team invitations, authentication security audit logs, cross-account session revocation, portfolio case study CRUD, brand logo management, plus all Admin capabilities.
   - First-time bootstrap (`/api/auth/bootstrap`) automatically creates a `super_admin` user and locks itself once any account exists (`409 Conflict`).
2. **Admin (`admin`)**
   - Full case visibility across all team members, KPI overview, Service Domain & Target Timeline analytics, CSV report exports, case status/assignment management, notifications, activity log, and personal security settings (password change, TOTP MFA, own sessions).
   - Restricted (`403 Forbidden`) from modifying team users/roles, sending invitations, viewing raw authentication audit events, or modifying public portfolio/brand assets.
3. **Staff (`staff`)**
   - Scoped case access (`assignedTo === null` or assigned to the signed-in staff user), status updates, internal notes, notifications, and personal security settings.
   - Restricted (`403 Forbidden`) from viewing analytics, CSV exports, activity logs, team management, or cases assigned to another team member.

## 3. Password, Session & MFA Security
- **Password Policy**: Minimum 12 characters containing uppercase, lowercase, and a numeric digit or symbol. Hashed with per-user salted `scrypt`.
- **Sessions**: Stored in `admin_sessions` (PostgreSQL or transactional store) with `HttpOnly`, `SameSite`, and CSRF cookies. Deactivating a user, changing their role, resetting their password, or revoking a session increments `sessionVersion` / marks the session revoked so protected requests immediately return `401 SESSION_EXPIRED`.
- **MFA (TOTP)**: Optional RFC 6238 6-digit authenticator verification managed in **Settings → Authenticator MFA (TOTP)**.

## 4. Database & Deployment
- **PostgreSQL**: Set `CONSULTATION_DATABASE_URL` (or `DATABASE_URL`). On startup, `db/migrations/001_case_management.sql` and `002_admin_auth_security.sql` run idempotently.
- **GitHub Pages + External Backend (Railway)**:
  - Keep `VITE_BASE_PATH=/PioOrlyLanguisan/` and `VITE_API_BASE_URL=<your-backend-url>` during GitHub Pages builds.
  - `public/404.html` rewrites deep `/PioOrlyLanguisan/admin/*` refreshes cleanly to `?p=/admin/...`, which `src/lib/adminRouter.ts` restores without inline scripts in `index.html`.
  - Set `ALLOWED_ORIGINS=https://ybtech7.github.io` and `PUBLIC_APP_URL=https://ybtech7.github.io/PioOrlyLanguisan` on the backend service so CORS and generated recovery/invite links resolve to the live frontend URL.
