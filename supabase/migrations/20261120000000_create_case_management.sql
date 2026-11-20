-- Pio Languisan case-management schema v1
-- All application tables are private by default; backend integration must authorize operations.
create extension if not exists pgcrypto;
create table if not exists public.staff_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 role text not null default 'staff' check (role in ('admin','staff')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.consultation_cases (
 id uuid primary key default gen_random_uuid(),
 case_number bigint generated always as identity unique,
 client_name text not null,
 client_email text not null,
 contact_details text,
 service_domain text not null,
 description text not null,
 status text not null default 'New' check (status in ('New','Pending','Follow Up','Completed')),
 received_at timestamptz not null default now(),
 target_date date,
 completed_at timestamptz,
 assigned_to uuid references public.staff_profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.case_notes (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.consultation_cases(id) on delete cascade,
 author_id uuid references public.staff_profiles(user_id) on delete set null,
 note text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.case_status_history (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.consultation_cases(id) on delete cascade,
 old_status text,
 new_status text not null check (new_status in ('New','Pending','Follow Up','Completed')),
 changed_by uuid references public.staff_profiles(user_id) on delete set null,
 changed_at timestamptz not null default now()
);
create table if not exists public.case_notifications (
 id uuid primary key default gen_random_uuid(),
 case_id uuid references public.consultation_cases(id) on delete cascade,
 recipient_id uuid references public.staff_profiles(user_id) on delete cascade,
 message text not null,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists consultation_cases_status_idx on public.consultation_cases(status);
create index if not exists consultation_cases_target_date_idx on public.consultation_cases(target_date);
create index if not exists consultation_cases_received_idx on public.consultation_cases(received_at desc);
create index if not exists case_notes_case_idx on public.case_notes(case_id);
create index if not exists case_status_history_case_idx on public.case_status_history(case_id,changed_at desc);
create index if not exists case_notifications_recipient_idx on public.case_notifications(recipient_id,read_at);
alter table public.staff_profiles enable row level security;
alter table public.consultation_cases enable row level security;
alter table public.case_notes enable row level security;
alter table public.case_status_history enable row level security;
alter table public.case_notifications enable row level security;
-- No anon/authenticated policies yet: deny direct browser access until
-- authenticated role-based application policies are designed and tested.
revoke all on public.staff_profiles, public.consultation_cases, public.case_notes, public.case_status_history, public.case_notifications from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
