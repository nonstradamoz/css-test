-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Drop existing tables if they exist
drop table if exists audit_logs;
drop table if exists reimbursements;
drop table if exists expenses;
drop table if exists members;
drop table if exists organisations;
drop table if exists users;
drop table if exists idempotency_keys;

-- 1. Users Table
create table public.users (
  id uuid references auth.users(id) primary key,
  email text not null,
  display_name text,
  is_super_admin boolean default false,
  created_at timestamptz default now()
);

-- Handle new user registration via trigger
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Only create the trigger if it doesn't exist
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Organisations Table
create table public.organisations (
  id text primary key,
  name text not null,
  currency text not null default 'USD',
  created_at timestamptz default now()
);

-- Insert demo org
insert into public.organisations (id, name, currency) 
values ('org-acme-corp', 'Acme Corporation', 'USD')
on conflict (id) do nothing;

-- 3. Members Table
create table public.members (
  user_id uuid references public.users(id) on delete cascade,
  organisation_id text references public.organisations(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'FINANCE', 'REVIEWER', 'MEMBER')),
  created_at timestamptz default now(),
  primary key (user_id, organisation_id)
);

-- 4. Expenses Table
create table public.expenses (
  id text primary key,
  organisation_id text references public.organisations(id) on delete cascade,
  submitted_by uuid references public.users(id),
  submitter_email text,
  submitter_name text,
  amount integer not null,
  currency text not null,
  category text not null,
  merchant text not null,
  expense_date text not null,
  description text not null,
  status text not null,
  receipt jsonb,
  duplicate_warning jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Reimbursements Table
create table public.reimbursements (
  id text primary key,
  organisation_id text references public.organisations(id) on delete cascade,
  expense_id text references public.expenses(id) on delete cascade,
  submitted_by uuid references public.users(id),
  amount integer not null,
  currency text not null,
  status text not null,
  provider text not null,
  attempt_count integer default 0,
  max_attempts integer default 3,
  provider_reference text,
  failure_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  failed_at timestamptz
);

-- 6. Audit Logs Table
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  organisation_id text references public.organisations(id) on delete cascade,
  actor_id uuid references public.users(id),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz default now()
);

-- 7. Idempotency Keys Table
create table public.idempotency_keys (
  key text primary key,
  organisation_id text not null,
  user_id uuid not null,
  operation text not null,
  request_hash text not null,
  status text not null,
  result jsonb,
  error text,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

-- Enable RLS
alter table public.users enable row level security;
alter table public.organisations enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.reimbursements enable row level security;
alter table public.audit_logs enable row level security;

-- Helper Functions for RLS
create or replace function public.is_super_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and is_super_admin = true
  );
$$ language sql security definer;

create or replace function public.is_org_member(org_id text)
returns boolean as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and organisation_id = org_id
  );
$$ language sql security definer;

create or replace function public.is_org_admin_or_finance_or_reviewer(org_id text)
returns boolean as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and organisation_id = org_id
    and role in ('ADMIN', 'FINANCE', 'REVIEWER')
  );
$$ language sql security definer;

-- Users RLS
create policy "Users can read their own data or superadmin" on public.users
  for select using (auth.uid() = id or public.is_super_admin());

-- Organisations RLS
create policy "Anyone can read orgs if they are a member or superadmin" on public.organisations
  for select using (public.is_org_member(id) or public.is_super_admin());

-- Members RLS
create policy "Users can read members in their orgs or superadmin" on public.members
  for select using (public.is_org_member(organisation_id) or public.is_super_admin());

-- Expenses RLS
create policy "Read expenses" on public.expenses
  for select using (
    public.is_super_admin() or 
    public.is_org_admin_or_finance_or_reviewer(organisation_id) or 
    submitted_by = auth.uid()
  );

create policy "Insert draft expenses" on public.expenses
  for insert with check (
    (public.is_super_admin() or public.is_org_member(organisation_id)) and
    submitted_by = auth.uid() and
    status = 'DRAFT'
  );

create policy "Update draft expenses" on public.expenses
  for update using (
    (public.is_super_admin() or public.is_org_member(organisation_id)) and
    submitted_by = auth.uid() and
    status = 'DRAFT'
  ) with check (
    status = 'DRAFT' and submitted_by = auth.uid()
  );

-- Reimbursements RLS
create policy "Read reimbursements" on public.reimbursements
  for select using (
    public.is_super_admin() or 
    public.is_org_admin_or_finance_or_reviewer(organisation_id)
  );

-- Audit Logs RLS
create policy "Read audit logs" on public.audit_logs
  for select using (
    public.is_super_admin() or 
    public.is_org_admin_or_finance_or_reviewer(organisation_id)
  );
