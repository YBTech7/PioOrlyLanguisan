-- Supabase Reconciliation Migration: Align public schema with canonical Express backend schema
-- Non-destructive: archives legacy v1 Supabase draft tables (if present) into `legacy_v1_archive`
-- without dropping any historical data, then establishes canonical tables and default-deny RLS.

DO $$
DECLARE
  has_legacy_notes boolean;
  has_legacy_history boolean;
  has_legacy_cases boolean;
  has_legacy_notif boolean;
  has_legacy_staff boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'case_notes' AND column_name = 'id' AND data_type = 'uuid'
  ) INTO has_legacy_notes;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'case_status_history' AND column_name = 'id' AND data_type = 'uuid'
  ) INTO has_legacy_history;

  SELECT to_regclass('public.consultation_cases') IS NOT NULL INTO has_legacy_cases;
  SELECT to_regclass('public.case_notifications') IS NOT NULL INTO has_legacy_notif;
  SELECT to_regclass('public.staff_profiles') IS NOT NULL INTO has_legacy_staff;

  IF has_legacy_notes OR has_legacy_history OR has_legacy_cases OR has_legacy_notif OR has_legacy_staff THEN
    CREATE SCHEMA IF NOT EXISTS legacy_v1_archive;
    REVOKE ALL ON SCHEMA legacy_v1_archive FROM public, anon, authenticated;

    IF has_legacy_notif AND to_regclass('legacy_v1_archive.case_notifications') IS NULL THEN
      ALTER TABLE public.case_notifications SET SCHEMA legacy_v1_archive;
    END IF;
    IF has_legacy_history AND to_regclass('legacy_v1_archive.case_status_history') IS NULL THEN
      ALTER TABLE public.case_status_history SET SCHEMA legacy_v1_archive;
    END IF;
    IF has_legacy_notes AND to_regclass('legacy_v1_archive.case_notes') IS NULL THEN
      ALTER TABLE public.case_notes SET SCHEMA legacy_v1_archive;
    END IF;
    IF has_legacy_cases AND to_regclass('legacy_v1_archive.consultation_cases') IS NULL THEN
      ALTER TABLE public.consultation_cases SET SCHEMA legacy_v1_archive;
    END IF;
    IF has_legacy_staff AND to_regclass('legacy_v1_archive.staff_profiles') IS NULL THEN
      ALTER TABLE public.staff_profiles SET SCHEMA legacy_v1_archive;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.case_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  auth_provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  password_updated_at timestamptz,
  session_version integer NOT NULL DEFAULT 1,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret text
);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

CREATE TABLE IF NOT EXISTS public.cases (
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
  assigned_to text REFERENCES public.users (id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  follow_up_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_service_domain ON public.cases (service_domain);
CREATE INDEX IF NOT EXISTS idx_cases_target_timeline ON public.cases (target_timeline);
CREATE INDEX IF NOT EXISTS idx_cases_submitted_at ON public.cases (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON public.cases (assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_follow_up_at ON public.cases (follow_up_at);
CREATE INDEX IF NOT EXISTS idx_cases_deadline_at ON public.cases (deadline_at);
CREATE INDEX IF NOT EXISTS idx_cases_completed_at ON public.cases (completed_at DESC);

CREATE TABLE IF NOT EXISTS public.case_status_history (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  previous_status text CHECK (
    previous_status IS NULL OR previous_status IN ('New', 'Pending', 'Follow Up', 'Completed')
  ),
  new_status text NOT NULL CHECK (
    new_status IN ('New', 'Pending', 'Follow Up', 'Completed')
  ),
  changed_by text REFERENCES public.users (id) ON DELETE SET NULL,
  changed_by_email text,
  note text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_id
  ON public.case_status_history (case_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.case_notes (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  author_id text REFERENCES public.users (id) ON DELETE SET NULL,
  author_email text NOT NULL DEFAULT '',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case_id
  ON public.case_notes (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.case_activity (
  id text PRIMARY KEY,
  case_id text REFERENCES public.cases (id) ON DELETE CASCADE,
  actor_id text REFERENCES public.users (id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_activity_case_id ON public.case_activity (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_activity_created_at ON public.case_activity (created_at DESC);

CREATE TABLE IF NOT EXISTS public.notifications (
  id text PRIMARY KEY,
  recipient_id text REFERENCES public.users (id) ON DELETE CASCADE,
  case_id text REFERENCES public.cases (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  dedup_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, read_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_key
  ON public.notifications (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key uuid PRIMARY KEY,
  request_hash text NOT NULL,
  case_id text NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id text PRIMARY KEY,
  user_id text REFERENCES public.users (id) ON DELETE CASCADE,
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
  ON public.admin_sessions (user_id, revoked_at, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.password_recovery_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_recovery_user
  ON public.password_recovery_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff')),
  token_hash text NOT NULL UNIQUE,
  invited_by text REFERENCES public.users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_invitations_email
  ON public.admin_invitations (email, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.auth_audit_events (
  id text PRIMARY KEY,
  user_id text REFERENCES public.users (id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'failure', 'blocked')),
  ip_address text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_events_created_at
  ON public.auth_audit_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.site_content (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable default-deny RLS across all canonical tables so direct browser access is blocked.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Supabase supplies anon/authenticated roles; standalone PostgreSQL used by CI does not.
-- Keep privileges revoked when those roles exist without requiring them in test databases.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON
      public.schema_migrations,
      public.users,
      public.cases,
      public.case_status_history,
      public.case_notes,
      public.case_activity,
      public.notifications,
      public.idempotency_keys,
      public.admin_sessions,
      public.password_recovery_tokens,
      public.admin_invitations,
      public.auth_audit_events,
      public.site_content
    FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON
      public.schema_migrations,
      public.users,
      public.cases,
      public.case_status_history,
      public.case_notes,
      public.case_activity,
      public.notifications,
      public.idempotency_keys,
      public.admin_sessions,
      public.password_recovery_tokens,
      public.admin_invitations,
      public.auth_audit_events,
      public.site_content
    FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END $$;

INSERT INTO public.schema_migrations (version)
VALUES
  ('001_case_management'),
  ('002_admin_auth_security'),
  ('003_supabase_rls_and_reconciliation')
ON CONFLICT (version) DO NOTHING;
