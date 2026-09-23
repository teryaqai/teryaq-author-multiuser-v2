-- TERYAQ Master Tool v2.4.5 — administrator-managed author, subject, and chapter options
-- Apply once after 007_auto_rls_function_hardening.sql.

create table if not exists public.content_authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_authors_name_not_blank check (length(btrim(name)) > 0),
  constraint content_authors_name_unique unique (name)
);

create table if not exists public.content_subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_subjects_name_not_blank check (length(btrim(name)) > 0),
  constraint content_subjects_name_unique unique (name)
);

create table if not exists public.content_chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.content_subjects(id) on delete restrict,
  chapter_number text not null,
  title text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_chapters_number_format check (chapter_number ~ '^[0-9]+([.][0-9]+)*$'),
  constraint content_chapters_title_not_blank check (length(btrim(title)) > 0),
  constraint content_chapters_subject_number_unique unique (subject_id, chapter_number)
);

create index if not exists content_authors_active_sort_idx
  on public.content_authors(active, sort_order, name);
create index if not exists content_subjects_active_sort_idx
  on public.content_subjects(active, sort_order, name);
create index if not exists content_chapters_subject_active_sort_idx
  on public.content_chapters(subject_id, active, sort_order, chapter_number);

alter table public.content_authors enable row level security;
alter table public.content_subjects enable row level security;
alter table public.content_chapters enable row level security;

drop policy if exists content_authors_select on public.content_authors;
create policy content_authors_select on public.content_authors
for select to authenticated
using (active or public.is_admin());

drop policy if exists content_authors_admin_insert on public.content_authors;
create policy content_authors_admin_insert on public.content_authors
for insert to authenticated
with check (public.is_admin());

drop policy if exists content_authors_admin_update on public.content_authors;
create policy content_authors_admin_update on public.content_authors
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_subjects_select on public.content_subjects;
create policy content_subjects_select on public.content_subjects
for select to authenticated
using (active or public.is_admin());

drop policy if exists content_subjects_admin_insert on public.content_subjects;
create policy content_subjects_admin_insert on public.content_subjects
for insert to authenticated
with check (public.is_admin());

drop policy if exists content_subjects_admin_update on public.content_subjects;
create policy content_subjects_admin_update on public.content_subjects
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_chapters_select on public.content_chapters;
create policy content_chapters_select on public.content_chapters
for select to authenticated
using (active or public.is_admin());

drop policy if exists content_chapters_admin_insert on public.content_chapters;
create policy content_chapters_admin_insert on public.content_chapters
for insert to authenticated
with check (public.is_admin());

drop policy if exists content_chapters_admin_update on public.content_chapters;
create policy content_chapters_admin_update on public.content_chapters
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on table public.content_authors from anon;
revoke all on table public.content_subjects from anon;
revoke all on table public.content_chapters from anon;

revoke all on table public.content_authors from authenticated;
revoke all on table public.content_subjects from authenticated;
revoke all on table public.content_chapters from authenticated;

grant select, insert, update on table public.content_authors to authenticated;
grant select, insert, update on table public.content_subjects to authenticated;
grant select, insert, update on table public.content_chapters to authenticated;

insert into public.system_config(key,value)
values ('content_options_schema','1')
on conflict (key) do update set value=excluded.value;
