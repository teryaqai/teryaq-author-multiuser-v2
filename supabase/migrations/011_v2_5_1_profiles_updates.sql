-- TERYAQ Master Tool v2.5.1
-- Profile avatars plus administrator-managed dashboard announcements.

-- Migration 010 replaced this broad legacy trigger with the narrower
-- protect_profile_role_change_trigger. Remove the legacy trigger so trusted
-- bootstrap/admin operations are not blocked by two conflicting checks.
drop trigger if exists protect_profile_role_trigger on public.profiles;

alter table public.profiles
  add column if not exists avatar_path text;

grant update (avatar_path) on table public.profiles to authenticated;

create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists app_updates_created_at_idx
  on public.app_updates(created_at desc);

create table if not exists public.app_update_reads (
  update_id uuid not null references public.app_updates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (update_id, user_id)
);

create index if not exists app_update_reads_user_idx
  on public.app_update_reads(user_id, read_at desc);

alter table public.app_updates enable row level security;
alter table public.app_update_reads enable row level security;

drop policy if exists app_updates_read on public.app_updates;
create policy app_updates_read on public.app_updates
for select to authenticated using (true);

drop policy if exists app_updates_admin_insert on public.app_updates;
create policy app_updates_admin_insert on public.app_updates
for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());

drop policy if exists app_updates_admin_delete on public.app_updates;
create policy app_updates_admin_delete on public.app_updates
for delete to authenticated using (public.is_admin());

drop policy if exists app_update_reads_own_select on public.app_update_reads;
create policy app_update_reads_own_select on public.app_update_reads
for select to authenticated using (user_id = auth.uid());

drop policy if exists app_update_reads_own_insert on public.app_update_reads;
create policy app_update_reads_own_insert on public.app_update_reads
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists app_update_reads_own_update on public.app_update_reads;
create policy app_update_reads_own_update on public.app_update_reads
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.app_updates from anon;
revoke all on table public.app_update_reads from anon;
grant select, insert, delete on table public.app_updates to authenticated;
grant select, insert, update on table public.app_update_reads to authenticated;

notify pgrst, 'reload schema';
