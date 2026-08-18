-- seed_users.sql
-- This script creates multiple organisations and seeds users with various roles into them.
-- It explicitly inserts into auth.users so that you can actually log in as these users!
-- Password for ALL seeded users is: password123

-- Enable pgcrypto for password hashing if not already enabled
create extension if not exists "pgcrypto";

do $$
declare
  -- Org A UUIDs
  org_a_id text := 'org-a-acme';
  admin_a_id uuid := 'a0000000-0000-0000-0000-000000000001';
  finance_a_id uuid := 'a0000000-0000-0000-0000-000000000002';
  reviewer_a_id uuid := 'a0000000-0000-0000-0000-000000000003';
  member_a_id uuid := 'a0000000-0000-0000-0000-000000000004';

  -- Org B UUIDs
  org_b_id text := 'org-b-globex';
  admin_b_id uuid := 'b0000000-0000-0000-0000-000000000001';
  finance_b_id uuid := 'b0000000-0000-0000-0000-000000000002';
  reviewer_b_id uuid := 'b0000000-0000-0000-0000-000000000003';
  member_b_id uuid := 'b0000000-0000-0000-0000-000000000004';

  -- Org C UUIDs
  org_c_id text := 'org-c-stark';
  admin_c_id uuid := 'c0000000-0000-0000-0000-000000000001';
  finance_c_id uuid := 'c0000000-0000-0000-0000-000000000002';
  reviewer_c_id uuid := 'c0000000-0000-0000-0000-000000000003';
  member_c_id uuid := 'c0000000-0000-0000-0000-000000000004';

  default_password text := crypt('password123', gen_salt('bf'));
begin
  ---------------------------------------------------------------------------
  -- 1. Create Organisations
  ---------------------------------------------------------------------------
  insert into public.organisations (id, name, currency) values 
    (org_a_id, 'Acme Corp (Org A)', 'USD'),
    (org_b_id, 'Globex Inc (Org B)', 'EUR'),
    (org_c_id, 'Stark Industries (Org C)', 'GBP')
  on conflict (id) do nothing;


  ---------------------------------------------------------------------------
  -- 2. Insert into auth.users
  ---------------------------------------------------------------------------
  -- Note: We temporarily disable the trigger to prevent duplicate public.users insertion
  -- since we want to handle it manually below to guarantee idempotency.
  
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values 
    -- Org A
    (admin_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@orga.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Org A"}', now(), now()),
    (finance_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance@orga.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Finance Org A"}', now(), now()),
    (reviewer_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer@orga.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Reviewer Org A"}', now(), now()),
    (member_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@orga.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Member Org A"}', now(), now()),
    
    -- Org B
    (admin_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@orgb.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Org B"}', now(), now()),
    (finance_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance@orgb.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Finance Org B"}', now(), now()),
    (reviewer_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer@orgb.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Reviewer Org B"}', now(), now()),
    (member_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@orgb.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Member Org B"}', now(), now()),

    -- Org C
    (admin_c_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@orgc.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Org C"}', now(), now()),
    (finance_c_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance@orgc.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Finance Org C"}', now(), now()),
    (reviewer_c_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer@orgc.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Reviewer Org C"}', now(), now()),
    (member_c_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@orgc.com', default_password, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Member Org C"}', now(), now())
  on conflict (id) do nothing;


  ---------------------------------------------------------------------------
  -- 3. Insert into public.users
  ---------------------------------------------------------------------------
  -- (If the trigger already caught some of these, it will just do nothing on conflict)
  insert into public.users (id, email, display_name) values 
    (admin_a_id, 'admin@orga.com', 'Admin Org A'),
    (finance_a_id, 'finance@orga.com', 'Finance Org A'),
    (reviewer_a_id, 'reviewer@orga.com', 'Reviewer Org A'),
    (member_a_id, 'member@orga.com', 'Member Org A'),

    (admin_b_id, 'admin@orgb.com', 'Admin Org B'),
    (finance_b_id, 'finance@orgb.com', 'Finance Org B'),
    (reviewer_b_id, 'reviewer@orgb.com', 'Reviewer Org B'),
    (member_b_id, 'member@orgb.com', 'Member Org B'),

    (admin_c_id, 'admin@orgc.com', 'Admin Org C'),
    (finance_c_id, 'finance@orgc.com', 'Finance Org C'),
    (reviewer_c_id, 'reviewer@orgc.com', 'Reviewer Org C'),
    (member_c_id, 'member@orgc.com', 'Member Org C')
  on conflict (id) do nothing;


  ---------------------------------------------------------------------------
  -- 4. Assign Roles in public.members
  ---------------------------------------------------------------------------
  insert into public.members (user_id, organisation_id, role) values 
    -- Org A
    (admin_a_id, org_a_id, 'ADMIN'),
    (finance_a_id, org_a_id, 'FINANCE'),
    (reviewer_a_id, org_a_id, 'REVIEWER'),
    (member_a_id, org_a_id, 'MEMBER'),

    -- Org B
    (admin_b_id, org_b_id, 'ADMIN'),
    (finance_b_id, org_b_id, 'FINANCE'),
    (reviewer_b_id, org_b_id, 'REVIEWER'),
    (member_b_id, org_b_id, 'MEMBER'),

    -- Org C
    (admin_c_id, org_c_id, 'ADMIN'),
    (finance_c_id, org_c_id, 'FINANCE'),
    (reviewer_c_id, org_c_id, 'REVIEWER'),
    (member_c_id, org_c_id, 'MEMBER')
  on conflict (user_id, organisation_id) do update set role = excluded.role;

end $$;
