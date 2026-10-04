-- TERYAQ Master Tool v2.8.7 — global icon overrides
begin;

create table if not exists public.icon_overrides (
  icon_key text primary key,
  override_value text not null,
  mime_type text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.icon_overrides enable row level security;
drop policy if exists icon_overrides_read on public.icon_overrides;
create policy icon_overrides_read on public.icon_overrides for select to authenticated using (true);
drop policy if exists icon_overrides_admin_insert on public.icon_overrides;
create policy icon_overrides_admin_insert on public.icon_overrides for insert to authenticated with check (public.is_admin(auth.uid()));
drop policy if exists icon_overrides_admin_update on public.icon_overrides;
create policy icon_overrides_admin_update on public.icon_overrides for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists icon_overrides_admin_delete on public.icon_overrides;
create policy icon_overrides_admin_delete on public.icon_overrides for delete to authenticated using (public.is_admin(auth.uid()));

grant select on table public.icon_overrides to authenticated;
grant insert,update,delete on table public.icon_overrides to authenticated;
grant select,insert,update,delete on table public.icon_overrides to service_role;

commit;
