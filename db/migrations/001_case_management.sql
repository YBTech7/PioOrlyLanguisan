-- PostgreSQL Migration 001: Consultation Case Management Dashboard Schema
-- Safe to run idempotently on application startup or via CI/CD migration job.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS case_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS cases (
  id text PRIMARY KEY,
  case_number text NOT NULL UNIQUE,
  legacy_tracking_id text,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  phone_country_code text,
  phone_number text,
  organization text NOT NULL DEFAULT '',
  organization_tier text NOT NULL CHECK (
    organization_tier IN ('individual', 'startup', 'smb', 'enterprise')
  ),
  service_domain text NOT NULL CHECK (
    service_domain IN (
      'technical-support',
      'customer-service',
      'data-analytics',
      'admin-operations',
      'account-management',
      'web-creation'
    )
  ),
  target_timeline text NOT NULL CHECK (
    target_timeline IN (
      'Immediate (1–2 weeks)',
      'Within 30 days',
      'This quarter',
      'Advisory / Ongoing'
    )
  ),
  project_context text NOT NULL,
  status text NOT NULL DEFAULT 'New' CHECK (
    status IN ('New', 'Pending', 'Follow Up', 'Completed')
  ),
  priority text NOT NULL DEFAULT 'Normal' CHECK (
    priority IN ('Low', 'Normal', 'High', 'Urgent')
  ),
  assigned_to text REFERENCES users (id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  follow_up_at timestamptz,
  deadline_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  email_state text NOT NULL DEFAULT 'pending' CHECK (
    email_state IN ('pending', 'sending', 'sent', 'review')
  ),
  email_attempts integer NOT NULL DEFAULT 0,
  next_email_attempt timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_email_http_status integer,
  last_email_stage text
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_service_domain ON cases (service_domain);
CREATE INDEX IF NOT EXISTS idx_cases_target_timeline ON cases (target_timeline);
CREATE INDEX IF NOT EXISTS idx_cases_submitted_at ON cases (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases (assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_follow_up_at ON cases (follow_up_at);
CREATE INDEX IF NOT EXISTS idx_cases_deadline_at ON cases (deadline_at);

CREATE TABLE IF NOT EXISTS case_status_history (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  previous_status text CHECK (
    previous_status IS NULL OR previous_status IN ('New', 'Pending', 'Follow Up', 'Completed')
  ),
  new_status text NOT NULL CHECK (
    new_status IN ('New', 'Pending', 'Follow Up', 'Completed')
  ),
  changed_by text REFERENCES users (id) ON DELETE SET NULL,
  changed_by_email text,
  note text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_id
  ON case_status_history (case_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS case_notes (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  author_id text REFERENCES users (id) ON DELETE SET NULL,
  author_email text NOT NULL DEFAULT '',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case_id
  ON case_notes (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS case_activity (
  id text PRIMARY KEY,
  case_id text REFERENCES cases (id) ON DELETE CASCADE,
  actor_id text REFERENCES users (id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_activity_case_id
  ON case_activity (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_activity_created_at
  ON case_activity (created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  recipient_id text REFERENCES users (id) ON DELETE CASCADE,
  case_id text REFERENCES cases (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key uuid PRIMARY KEY,
  request_hash text NOT NULL,
  case_id text NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('001_case_management')
ON CONFLICT (version) DO NOTHING;
