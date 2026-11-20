# Database Architecture & Canonical Schema Specification

**Application:** Pio Languisan — Consultation Request Management System  
**Authoritative Migrations:** `db/migrations/001_case_management.sql`, `db/migrations/002_admin_auth_security.sql`, `db/migrations/003_supabase_rls_and_reconciliation.sql`, and `supabase/migrations/20261120000002_canonical_case_management_reconcile.sql`  
**Target Production Supabase Project:** `YBTech7's Project` (`wkyahxeqbndgmhoszagg`, `https://wkyahxeqbndgmhoszagg.supabase.co`)

---

## 1. Schema Conflict Audit & Canonical Selection

### Root Conflict Discovered
The repository previously contained two diverging schema lineages:
1. **Express Backend Lineage (`db/migrations/001_case_management.sql` + `002_admin_auth_security.sql`)** using `text` primary keys (`INQ-...`, `usr-...`, `sess-...`, `ntf-...`), sequence-backed `CASE-00000x` identifiers (`case_number_seq`), `users`, `cases`, `case_status_history`, `case_notes`, `case_activity`, `notifications`, `idempotency_keys`, `admin_sessions`, `password_recovery_tokens`, `admin_invitations`, and `auth_audit_events`.
2. **Legacy Supabase v1 Draft (`supabase/migrations/20261120000000_create_case_management.sql` + `20261120000001_restrict_rls_trigger_function.sql`)** using `uuid` primary keys (`staff_profiles`, `consultation_cases`, `case_notes`, `case_status_history`, `case_notifications`) bound to `auth.users(id)`.

Because `case_notes` and `case_status_history` shared identical table names with incompatible `uuid` vs. `text` primary/foreign keys, relying on `CREATE TABLE IF NOT EXISTS` would silently fail or leave incompatible column definitions in place if applied on a database initialized from the v1 Supabase draft.

### Canonical Resolution
The **Express + PostgreSQL relational model (`001` → `002` → `003`)** is established as the single canonical schema:
- **Zero-Loss Reconciliation (`supabase/migrations/20261120000002_canonical_case_management_reconcile.sql`)**: Checks `information_schema.columns` for `uuid` primary keys on `case_notes` / `case_status_history` or existence of `consultation_cases` / `case_notifications` / `staff_profiles`. Any legacy v1 draft tables present in `public` are moved non-destructively into a restricted `legacy_v1_archive` schema (`ALTER TABLE ... SET SCHEMA legacy_v1_archive;`) rather than dropped, then canonical tables and default-deny RLS are created cleanly.
- **Startup Conflict Guard (`db/migrations/003_supabase_rls_and_reconciliation.sql` & `db/caseRepository.ts`)**: `createPostgresAdapter.ensureReady()` explicitly checks for legacy UUID `case_notes`/`case_status_history` schemas before executing migrations and aborts with `SCHEMA_CONFLICT_DETECTED` so the runtime never corrupts or half-migrates an unreconciled database.

---

## 2. Canonical Entity-Relationship Overview

```
users (1) ──────< (0..*) cases (assigned_to)
  │                        │
  │                        ├──< case_status_history (case_id, changed_by -> users.id)
  │                        ├──< case_notes (case_id, author_id -> users.id)
  │                        ├──< case_activity (case_id, actor_id -> users.id)
  │                        ├──< notifications (case_id, recipient_id -> users.id, UNIQUE dedup_key)
  │                        └──< idempotency_keys (key uuid PK, case_id)
  │
  ├──< admin_sessions (user_id, session_version, token_hash)
  ├──< password_recovery_tokens (user_id, token_hash)
  ├──< admin_invitations (invited_by, token_hash)
  └──< auth_audit_events (user_id)

site_content (standalone JSONB key/value record id='default' for portfolio projects & brand controls)
schema_migrations (applied version ledger)
```

---

## 3. Canonical Table & Index Inventory (13 Tables + 1 Sequence)

| Table / Sequence | Primary Key | Key Columns & Constraints | Indexes |
|---|---|---|---|
| `schema_migrations` | `version text` | `applied_at timestamptz` | PK on `version` |
| `case_number_seq` | Sequence | `START WITH 1 INCREMENT BY 1` -> `CASE-000001` | — |
| `users` | `id text` | `email UNIQUE`, `name`, `password_hash`, `role IN ('super_admin','admin','staff')`, `is_active`, `auth_provider_id`, `session_version`, `mfa_enabled`, `mfa_secret`, timestamps | `idx_users_role (role)` |
| `cases` | `id text` | `case_number UNIQUE`, `requester_name`, `requester_email`, `phone_country_code`, `phone_number` (E.164), `organization`, `organization_tier` (`individual`/`startup`/`smb`/`enterprise`), `service_domain` (6 slugs), `target_timeline` (4 labels), `project_context`, `status` (`New`/`Pending`/`Follow Up`/`Completed`), `priority`, `assigned_to FK -> users(id)`, `submitted_at`, `follow_up_at`, `deadline_at`, `completed_at`, `updated_at`, `version`, Gmail delivery columns | `idx_cases_status`, `idx_cases_service_domain`, `idx_cases_target_timeline`, `idx_cases_submitted_at`, `idx_cases_assigned_to`, `idx_cases_follow_up_at`, `idx_cases_deadline_at`, `idx_cases_completed_at` |
| `case_status_history` | `id text` | `case_id FK -> cases(id) ON DELETE CASCADE`, `previous_status`, `new_status`, `changed_by FK -> users(id)`, `changed_by_email`, `note`, `changed_at` | `idx_case_status_history_case_id (case_id, changed_at DESC)` |
| `case_notes` | `id text` | `case_id FK -> cases(id) ON DELETE CASCADE`, `author_id FK -> users(id)`, `author_email`, `content`, timestamps | `idx_case_notes_case_id (case_id, created_at DESC)` |
| `case_activity` | `id text` | `case_id FK -> cases(id) ON DELETE CASCADE`, `actor_id FK -> users(id)`, `actor_email`, `action`, `metadata jsonb`, `created_at` | `idx_case_activity_case_id`, `idx_case_activity_created_at` |
| `notifications` | `id text` | `recipient_id FK -> users(id)`, `case_id FK -> cases(id)`, `type`, `title`, `message`, `dedup_key text`, `read_at`, `created_at` | `idx_notifications_recipient_unread`, `idx_notifications_dedup_key UNIQUE WHERE dedup_key IS NOT NULL` |
| `idempotency_keys` | `key uuid` | `request_hash text`, `case_id FK -> cases(id) ON DELETE CASCADE`, `created_at` | PK on `key` |
| `admin_sessions` | `id text` | `user_id FK -> users(id)`, `token_hash UNIQUE`, `csrf_token`, `role`, `email`, `name`, `user_agent`, `ip_address`, `session_version`, `expires_at`, `revoked_at`, timestamps | `idx_admin_sessions_user_active` |
| `password_recovery_tokens` | `id text` | `user_id FK -> users(id)`, `token_hash UNIQUE`, `expires_at`, `used_at`, `created_at` | `idx_password_recovery_user` |
| `admin_invitations` | `id text` | `email`, `name`, `role`, `token_hash UNIQUE`, `invited_by FK -> users(id)`, `expires_at`, `accepted_at`, `created_at` | `idx_admin_invitations_email` |
| `auth_audit_events` | `id text` | `user_id FK -> users(id)`, `actor_email`, `event_type`, `result IN ('success','failure','blocked')`, `ip_address`, `metadata jsonb`, `created_at` | `idx_auth_audit_events_created_at` |
| `site_content` | `id text` | `payload jsonb NOT NULL`, `updated_at timestamptz` | PK on `id` |

---

## 4. Transactional Guarantees & Lifecycle Rules

1. **Atomic Case Intake (`createCase`)**: Within a single `sql.begin` transaction, the backend checks `idempotency_keys` (`409 Conflict` if the same UUID key arrives with a mismatched `request_hash`), allocates `CASE-00000x` via `nextval('case_number_seq')`, inserts into `cases` with default `status = 'New'`, writes the initial `case_status_history` row (`previous_status = NULL`, `new_status = 'New'`), appends a `case_created` record to `case_activity`, creates an unread `new_case` broadcast notification (`recipient_id = NULL`), and stores the idempotency ledger entry.
2. **Completed Timestamp Lifecycle (`completed_at`)**: Transitioning into `'Completed'` sets `completed_at = now()`. Reopening out of `'Completed'` requires `admin` or `super_admin` (`staff` receives `403 Forbidden`), requires an audit transition note of at least 5 characters (`400 Bad Request`), and clears `completed_at = NULL`.
3. **Notification Deduplication**: `syncDeadlineNotifications()` computes overdue and 48-hour due-soon alerts (`isCaseOverdue` / `isCaseDueSoon`) using deterministic daily keys (`overdue:${caseId}:${YYYY-MM-DD}` and `due_soon:${caseId}:${YYYY-MM-DD}`) enforced by the partial unique index `idx_notifications_dedup_key`.
4. **Durable CMS Content (`site_content`)**: In PostgreSQL mode, public portfolio projects and brand settings persist in `site_content` (`id = 'default'`) instead of container-ephemeral `data/store.json`.

---

## 5. Supabase Row Level Security & Direct Browser Access Policy

All 13 canonical tables have `ENABLE ROW LEVEL SECURITY` active via `003_supabase_rls_and_reconciliation.sql` and `20261120000002_canonical_case_management_reconcile.sql`, and all schema/table/sequence privileges are explicitly revoked from `anon` and `authenticated` roles:

- No client bundle ever receives a database connection string or Supabase service key.
- Direct browser requests against Supabase PostgREST receive default-deny (`401`/`403`/empty) because no permissive RLS policies exist for `anon` or `authenticated`.
- All reads and mutations flow exclusively through the trusted Express backend using the restricted server-side PostgreSQL connection (`CONSULTATION_DATABASE_URL`).
