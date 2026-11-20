# Authentication Architecture Decision Record (ADR-001)

**Title:** Canonical Server-Enforced Custom Authentication & Session Architecture vs. Legacy Supabase Auth Draft  
**Status:** Accepted & Implemented  
**Date:** 2026-11-19  
**System:** Pio Languisan — Consultation Request Management System

---

## 1. Context

During repository remediation (Audit Finding B), two incompatible administrator authentication models were discovered:
1. **Canonical Express + PostgreSQL Custom Authentication (`server.ts`, `db/caseRepository.ts`, `db/migrations/002_admin_auth_security.sql`)** implementing per-user salted `scrypt` password hashes, server-stored `admin_sessions`, `HttpOnly` + `SameSite` + CSRF cookies, optional RFC 6238 TOTP MFA, `super_admin` / `admin` / `staff` 3-tier RBAC, single-use hashed password recovery tokens, and invitation onboarding.
2. **Legacy Supabase v1 Draft (`supabase/migrations/20261120000000_create_case_management.sql`)** assuming browser-direct Supabase Auth (`auth.users`) paired with a `staff_profiles` table.

Operating two independent identity systems simultaneously creates split-brain authorization, privilege escalation risk, and broken frontend/backend login integration.

---

## 2. Decision

We **retain and harden the custom Express + PostgreSQL authentication architecture** as the **sole active identity and session authority**, and enforce **default-deny RLS + `REVOKE ALL FROM anon, authenticated`** on all Supabase tables so browser clients have zero direct database access.

### Why Custom Backend Auth Was Chosen Over Migrating to Browser-Direct Supabase Auth
1. **Immediate Runtime & Schema Compatibility**: All frontend admin components (`AdminLoginPage`, `AdminRecoveryPages`, `AdminPortal`, `AdminSettingsView`) and API routes (`/api/auth/*`, `/api/admin/*`) already integrate cleanly against `users`, `admin_sessions`, `admin_invitations`, `password_recovery_tokens`, and `auth_audit_events`.
2. **Zero Silent Account Loss**: Retaining `users` avoids forcing existing operator passphrases or bootstrap credentials through an unverified `auth.users` migration.
3. **Zero Browser Exposure of Credentials or Service Keys**: GitHub Pages hosts only static assets; keeping all identity verification inside the Railway/Node Express API ensures `SUPABASE_SERVICE_ROLE_KEY` and PostgreSQL credentials never need to exist on the client, and `anon` keys are unnecessary.
4. **Full Control Over Governance Rules**: Enables unified enforcement of executive passcode fallback (when configured), cross-account session revocation (`session_version` bump), IP brute-force lockouts, TOTP MFA challenges, and `Completed` case reopen restrictions in one place.

---

## 3. Security Architecture & Guarantees

| Control | Implementation Detail |
|---|---|
| **Password Policy & Hashing** | Minimum 12 chars (upper, lower, digit/symbol). Hashed with Node `crypto.scryptSync` + 16-byte random salt (`N=16384`), verified via `crypto.timingSafeEqual`. |
| **First-Admin Bootstrap** | `POST /api/auth/bootstrap` requires a server-side `ADMIN_BOOTSTRAP_TOKEN` (timing-safe verified) and atomically creates the first `super_admin`. Returns `409 Conflict` once any user exists (`users.length > 0`). |
| **Session Persistence & Cookies** | `admin_sessions` stores SHA-256 `token_hash` (never raw token), `csrf_token`, `session_version`, `ip_address`, `user_agent`, `expires_at` (8-hour default), and `revoked_at`. Production responses issue `HttpOnly`, `Secure`, `SameSite=None` cookies alongside CSRF token header enforcement for state-changing cookie requests. |
| **Immediate Invalidation** | Deactivating a user, changing their role, resetting/changing their password, or revoking a session sets `revoked_at` and/or increments `users.session_version`. Protected requests verify `session.session_version === user.session_version` and return `401 SESSION_EXPIRED`. |
| **Production Session Secret** | `SESSION_SECRET` env var is documented in `.env.example` and checked at startup (`server.ts` logs a high-severity warning if `NODE_ENV=production` lacks `SESSION_SECRET`). |
| **MFA (TOTP)** | RFC 6238 SHA-1 6-digit codes stored in `users.mfa_secret` (`mfa_enabled` boolean). Login returns `202 { mfaRequired: true, mfaChallenge }` until `POST /api/auth/login/mfa` validates the code with ±1 window tolerance. |
| **Brute-Force & Rate Limits** | `/api/auth/login`, `/api/auth/login/mfa`, and `/api/admin/login` enforce 5 failures / 15 minutes IP lockout (`429 Retry-After`). Recovery/invite endpoints use dedicated `recoveryLimiter`. |
| **Audit Logging** | Immutable `auth_audit_events` captures bootstraps, logins, failed attempts, MFA changes, invitations, recoveries, role changes, and session revocations (`super_admin` view-only endpoint `/api/admin/audit-events`). |
| **3-Tier RBAC** | `super_admin` (user/role administration, invitations, audit logs, CMS/brand), `admin` (all cases, analytics, CSV exports, team listing, reopen completed cases), `staff` (scoped to unassigned or self-assigned cases, internal notes, personal notifications & MFA). |

---

## 4. Future Migration Path (If OAuth / SSO Is Adopted Later)

Column `users.auth_provider_id` is already provisioned in `002_admin_auth_security.sql` and reconciled in `20261120000002_canonical_case_management_reconcile.sql` so an external IdP/OIDC subject ID can be linked cleanly without breaking foreign keys on `cases`, `case_notes`, or `admin_sessions`. Any future migration must remain behind a single backend session boundary rather than re-enabling permissive browser RLS policies.
