# Pio Languisan — Admin Consultation Case Management Guide

## 1. Initial Setup & First-Admin Bootstrap
1. Set at least one server-side authentication secret before deploying:
   - `ADMIN_BOOTSTRAP_TOKEN` (used once to provision the first `admin` user via **First Setup**)
   - `ADMIN_PASSCODE` (enables passcode unlock and may also serve as the bootstrap secret)
   - `SESSION_SECRET` (signs `HttpOnly` session cookies)
2. Open the **Admin Console** from the footer or navigate directly to `/admin`.
3. Select **First Setup**, enter the `ADMIN_BOOTSTRAP_TOKEN` / `ADMIN_PASSCODE`, and create your administrator email + password (12+ characters).
4. Once an `admin` account exists, the bootstrap endpoint automatically locks (`409 Conflict`). Subsequent sign-ins use **Team Account** (email + password) or **Passcode**.

## 2. Role-Based Access Control (RBAC)
- **Admin (`admin`)**: Full case management, analytics, reports & CSV exports, team user creation/deactivation, portfolio blueprint CRUD, and brand logo management.
- **Staff (`staff`)**: Overview KPIs, case triage, status transitions, assigning owners, follow-up/deadline dates, adding private internal notes, viewing notifications and activity logs. Restricted (`403 Forbidden`) from CSV exports, user management, portfolio edits, and brand asset updates.

## 3. Case Lifecycle & Deadlines
- Every valid public consultation submission creates **exactly one** persisted case with status **`New`** and a transactionally allocated sequential reference (`CASE-000001`).
- Valid statuses: **`New`**, **`Pending`**, **`Follow Up`**, **`Completed`**.
- Statuses never change automatically based on time. **Overdue** (`deadlineAt` or `followUpAt` in the past while not `Completed`) and **Due Soon** (within 48 hours) are calculated separately.
- Every status change writes an immutable row to `case_status_history` and `case_activity`.

## 4. Database & Deployment
- **PostgreSQL**: Set `CONSULTATION_DATABASE_URL` (or `DATABASE_URL`). On startup, `db/migrations/001_case_management.sql` runs idempotently to provision `users`, `cases`, `case_status_history`, `case_notes`, `case_activity`, `notifications`, and `idempotency_keys`, plus `case_number_seq`.
- **GitHub Pages + External Backend (Railway)**:
  - Keep `VITE_BASE_PATH=/PioOrlyLanguisan/` and `VITE_API_BASE_URL=<your-backend-url>` during GitHub Pages builds.
  - Set `ALLOWED_ORIGINS=https://ybtech7.github.io` on the backend service so credentialed CORS requests succeed.
