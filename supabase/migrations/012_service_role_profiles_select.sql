-- TERYAQ Master Tool: repair the Edge Function's table privilege.
-- Run once in the SQL Editor of the same Supabase project used by the app.
-- No user roles, RLS policies, or anon/authenticated grants are changed.

select
  has_schema_privilege('service_role', 'public', 'USAGE') as schema_usage_before,
  has_table_privilege('service_role', 'public.profiles', 'SELECT') as profiles_select_before;

begin;
grant usage on schema public to service_role;
grant select on table public.profiles to service_role;
commit;

select
  has_schema_privilege('service_role', 'public', 'USAGE') as schema_usage_after,
  has_table_privilege('service_role', 'public.profiles', 'SELECT') as profiles_select_after;
