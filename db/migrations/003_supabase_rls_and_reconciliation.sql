-- PostgreSQL Migration 003: Schema Integrity Guard, Durable Site Content,
-- Notification Deduplication, Completion Timestamps & Supabase Default-Deny RLS.
-- Safe to run idempotently on both standard PostgreSQL (CI/Railway) and Supabase PostgreSQL.

DO $$
DECLARE
  case_notes_id_type text;
  case_hist_id_type text;
BEGIN
  SELECT data_type INTO case_notes_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'case_notes' AND column_name = 'id';

  SELECT data_type INTO case_hist_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'case_status_history' AND column_name = 'id';

  IF case_notes_id_type = 'uuid' OR case_hist_id_type = 'uuid' THEN
    RAISE EXCEPTION
      'SCHEMA_CONFLICT_DETECTED: Legacy UUID case_notes/case_status_history tables exist in public schema. Apply supabase/migrations/20261120000002_canonical_case_management_reconcile.sql before starting the backend.';
  END IF;
END $$;

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE cases
SET completed_at = COALESCE(completed_at, updated_at, submitted_at)
WHERE status = 'Completed' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cases_completed_at
  ON cases (completed_at DESC);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_key
  ON notifications (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_content (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable default-deny Row Level Security on every canonical table so Supabase PostgREST
-- never exposes operational case or credential records to browser anon/authenticated roles.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON
      schema_migrations,
      users,
      cases,
      case_status_history,
      case_notes,
      case_activity,
      notifications,
      idempotency_keys,
      admin_sessions,
      password_recovery_tokens,
      admin_invitations,
      auth_audit_events,
      site_content
    FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON
      schema_migrations,
      users,
      cases,
      case_status_history,
      case_notes,
      case_activity,
      notifications,
      idempotency_keys,
      admin_sessions,
      password_recovery_tokens,
      admin_invitations,
      auth_audit_events,
      site_content
    FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('003_supabase_rls_and_reconciliation')
ON CONFLICT (version) DO NOTHING;
