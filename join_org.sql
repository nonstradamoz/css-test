-- Run this in your Supabase SQL Editor to allow new users to join the demo organisation
create or replace function public.join_demo_org()
returns void as $$
begin
  insert into public.members (user_id, organisation_id, role)
  values (auth.uid(), 'org-acme-corp', 'MEMBER')
  on conflict (user_id, organisation_id) do nothing;
end;
$$ language plpgsql security definer;
