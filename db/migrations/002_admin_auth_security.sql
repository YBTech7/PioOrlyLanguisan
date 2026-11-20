-- PostgreSQL Migration 002: Administrator Authentication, Sessions, Recovery & Audit Events
-- Safe to run idempotently on application startup or CI/CD migration jobs.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret text;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'admin', 'staff'));

CREATE TABLE IF NOT EXISTS admin_sessions (
  id text PRIMARY KEY,
  user_id text REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff')),
  email text NOT NULL,
  name text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT '',
  session_version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_active
  ON admin_sessions (user_id, revoked_at, expires_at DESC);

CREATE TABLE IF NOT EXISTS password_recovery_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_recovery_user
  ON password_recovery_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_invitations (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff')),
  token_hash text NOT NULL UNIQUE,
  invited_by text REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_email
  ON admin_invitations (email, expires_at DESC);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id text PRIMARY KEY,
  user_id text REFERENCES users (id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'failure', 'blocked')),
  ip_address text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_events_created_at
  ON auth_audit_events (created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('002_admin_auth_security')
ON CONFLICT (version) DO NOTHING;
