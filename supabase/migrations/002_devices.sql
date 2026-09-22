-- Device registry. One account may safely use multiple devices.
create table if not exists public.devices (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_name text,
  platform text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists devices_user_idx on public.devices(user_id,last_seen_at desc);
alter table public.devices enable row level security;
drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices for insert to authenticated with check(user_id=auth.uid());
drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
