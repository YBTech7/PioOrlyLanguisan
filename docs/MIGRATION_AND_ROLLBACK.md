# Database Migration & Rollback Runbook

**Canonical Source Directory (GitHub):** `db/migrations/` and `supabase/migrations/`  
**Target Production Database:** Supabase Project `wkyahxeqbndgmhoszagg` (`https://wkyahxeqbndgmhoszagg.supabase.co`)

---

## 1. Authoritative Migration Execution Order

### Clean PostgreSQL Database (Railway / Local Docker / CI)
Execute in strict numerical order (or allow `createPostgresAdapter.ensureReady()` to run them inside advisory lock `88421003` on startup):
1. `db/migrations/001_case_management.sql` — Creates `schema_migrations`, `case_number_seq`, `users`, `cases`, `case_status_history`, `case_notes`, `case_activity`, `notifications`, `idempotency_keys`.
2. `db/migrations/002_admin_auth_security.sql` — Expands `users` (`super_admin`, `session_version`, `mfa_*`, `auth_provider_id`), creates `admin_sessions`, `password_recovery_tokens`, `admin_invitations`, `auth_audit_events`.
3. `db/migrations/003_supabase_rls_and_reconciliation.sql` — Verifies no conflicting legacy UUID tables exist (`SCHEMA_CONFLICT_DETECTED` guard), adds `cases.completed_at` (with backfill) + `idx_cases_completed_at`, adds `notifications.dedup_key` + partial unique index `idx_notifications_dedup_key`, creates `site_content`, enables RLS on all 13 tables, and revokes privileges from `anon` and `authenticated`.

### Existing Supabase Database (`wkyahxeqbndgmhoszagg`)
Before starting the backend against Supabase if `20261120000000_create_case_management.sql` was previously applied:
1. Run `supabase/migrations/20261120000002_canonical_case_management_reconcile.sql` via Supabase CLI (`supabase db push`) or Supabase SQL Editor.
   - **What it does safely**: Detects any legacy v1 draft tables (`case_notifications`, `case_status_history` [uuid], `case_notes` [uuid], `consultation_cases`, `staff_profiles`) and moves them non-destructively into schema `legacy_v1_archive` (revoking `public, anon, authenticated` access). **Zero `DROP TABLE` statements are executed.**
   - **What it establishes**: Creates the complete canonical schema (`001` + `002` + `003`), enables default-deny RLS on all 13 tables, revokes `anon`/`authenticated` privileges, and records all 3 migration versions in `public.schema_migrations`.
2. Verify post-migration state with:
   ```sql
   SELECT version, applied_at FROM public.schema_migrations ORDER BY version;
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'legacy_v1_archive';
   ```
   All 13 canonical tables must show `rowsecurity = true`.

---

## 2. Schema Drift Detection & Reconciliation

1. **Automated Runtime Detection**: Whenever the Express backend starts with `CONSULTATION_DATABASE_URL`, `003_supabase_rls_and_reconciliation.sql` runs `DO $$ ... IF case_notes_id_type = 'uuid' ... RAISE EXCEPTION 'SCHEMA_CONFLICT_DETECTED' ... END $$;`. Unreconciled drift stops startup cleanly without mutating data.
2. **CI Validation**: `.github/workflows/deploy.yml` spins up a `postgres:18` service, executes `001`, `002`, and `003` (twice to prove idempotency), and applies `20261120000002_canonical_case_management_reconcile.sql` against a separate test database (`portfolio_reconcile_test`).
3. **Never Bypass GitHub**: Never run ad-hoc DDL directly in the Supabase Table Editor. Create a numbered `.sql` migration file on a feature branch, verify in CI, merge to `main`, and apply cleanly.

---

## 3. Rollback & Recovery Procedures

### Scenario A: Rolling Back Migration 003 Additions
If application deployment must revert prior to `003_supabase_rls_and_reconciliation.sql` (note: only drop new indexes/columns if the target code does not reference them):
```sql
BEGIN;
DROP INDEX IF EXISTS public.idx_notifications_dedup_key;
ALTER TABLE public.notifications DROP COLUMN IF EXISTS dedup_key;
DROP INDEX IF EXISTS public.idx_cases_completed_at;
ALTER TABLE public.cases DROP COLUMN IF EXISTS completed_at;
DROP TABLE IF EXISTS public.site_content;
DELETE FROM public.schema_migrations WHERE version = '003_supabase_rls_and_reconciliation';
COMMIT;
```

### Scenario B: Restoring Archived Legacy v1 Supabase Tables (If Required)
Because `20261120000002_canonical_case_management_reconcile.sql` preserved any prior Supabase v1 tables inside `legacy_v1_archive`, operators can inspect archived rows or restore them into a recovery schema at any time:
```sql
-- Inspect archived consultation rows
SELECT * FROM legacy_v1_archive.consultation_cases LIMIT 25;
```
If migrating historical records from `legacy_v1_archive.consultation_cases` into `public.cases`, author a dedicated forward-only backfill migration mapping `id::text`, `reference_code` -> `case_number`, and domain/status enums explicitly rather than dropping `public.cases`.

### Scenario C: Point-in-Time Recovery (PITR) / Database Snapshot
Before running any reconciliation script in Supabase production:
1. Trigger a manual Supabase database backup / snapshot (`Dashboard -> Database -> Backups`).
2. Confirm `psql` / `pg_dump` logical export of `public` schema completes cleanly before applying schema changes.
