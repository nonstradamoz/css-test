-- This seed script assumes you have ALREADY created at least one user via the signup page.
-- It will assign all the sample data to the first user it finds in the database.

do $$
declare
  first_user_id uuid;
begin
  -- Get the first user ID
  select id into first_user_id from public.users limit 1;

  if first_user_id is null then
    raise exception 'No users found! Please create an account via the signup page first.';
  end if;

  -- 1. Create a demo organisation (if it doesn't exist)
  insert into public.organisations (id, name, currency) 
  values ('org-acme-corp', 'Acme Corporation', 'USD')
  on conflict (id) do nothing;

  -- 2. Make the user an ADMIN of the demo organisation
  insert into public.members (user_id, organisation_id, role)
  values (first_user_id, 'org-acme-corp', 'ADMIN')
  on conflict (user_id, organisation_id) do update set role = 'ADMIN';

  -- 3. Insert sample expenses
  insert into public.expenses (id, organisation_id, submitted_by, submitter_email, submitter_name, amount, currency, category, merchant, expense_date, description, status)
  values 
    ('exp_1001', 'org-acme-corp', first_user_id, 'demo@acme.com', 'Demo User', 15000, 'USD', 'TRAVEL', 'Delta Airlines', '2023-10-15', 'Flight to NY Conference', 'APPROVED'),
    ('exp_1002', 'org-acme-corp', first_user_id, 'demo@acme.com', 'Demo User', 4550, 'USD', 'MEALS', 'Shake Shack', '2023-10-16', 'Team Lunch', 'REJECTED'),
    ('exp_1003', 'org-acme-corp', first_user_id, 'demo@acme.com', 'Demo User', 120000, 'USD', 'SOFTWARE', 'GitHub', '2023-10-17', 'Annual Enterprise License', 'REIMBURSED'),
    ('exp_1004', 'org-acme-corp', first_user_id, 'demo@acme.com', 'Demo User', 2500, 'USD', 'OFFICE', 'Staples', '2023-10-18', 'Printer Ink', 'PENDING_APPROVAL'),
    ('exp_1005', 'org-acme-corp', first_user_id, 'demo@acme.com', 'Demo User', 8500, 'USD', 'TRAVEL', 'Uber', '2023-10-19', 'Ride to Airport', 'DRAFT')
  on conflict (id) do nothing;

  -- 4. Insert sample reimbursements for the APPROVED/REIMBURSED expenses
  insert into public.reimbursements (id, organisation_id, expense_id, submitted_by, amount, currency, status, provider, provider_reference)
  values 
    ('reimb_2001', 'org-acme-corp', 'exp_1003', first_user_id, 120000, 'USD', 'COMPLETED', 'STRIPE', 'ch_1Mxyz123'),
    ('reimb_2002', 'org-acme-corp', 'exp_1001', first_user_id, 15000, 'USD', 'PROCESSING', 'STRIPE', null)
  on conflict (id) do nothing;

end $$;
