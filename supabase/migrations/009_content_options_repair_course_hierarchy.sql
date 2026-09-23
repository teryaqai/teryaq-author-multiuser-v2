-- TERYAQ Master Tool v2.4.6 — repair content-option writes and enforce Course → Chapter hierarchy
-- Safe to run whether or not migration 008 completed successfully.

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

-- The existing physical table name is retained for backward compatibility.
-- In the application this entity is now presented consistently as Course.
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
for select to authenticated using (active or public.is_admin());
drop policy if exists content_authors_admin_insert on public.content_authors;
create policy content_authors_admin_insert on public.content_authors
for insert to authenticated with check (public.is_admin());
drop policy if exists content_authors_admin_update on public.content_authors;
create policy content_authors_admin_update on public.content_authors
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_subjects_select on public.content_subjects;
create policy content_subjects_select on public.content_subjects
for select to authenticated using (active or public.is_admin());
drop policy if exists content_subjects_admin_insert on public.content_subjects;
create policy content_subjects_admin_insert on public.content_subjects
for insert to authenticated with check (public.is_admin());
drop policy if exists content_subjects_admin_update on public.content_subjects;
create policy content_subjects_admin_update on public.content_subjects
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_chapters_select on public.content_chapters;
create policy content_chapters_select on public.content_chapters
for select to authenticated using (active or public.is_admin());
drop policy if exists content_chapters_admin_insert on public.content_chapters;
create policy content_chapters_admin_insert on public.content_chapters
for insert to authenticated with check (public.is_admin());
drop policy if exists content_chapters_admin_update on public.content_chapters;
create policy content_chapters_admin_update on public.content_chapters
for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on table public.content_authors from anon;
revoke all on table public.content_subjects from anon;
revoke all on table public.content_chapters from anon;
revoke all on table public.content_authors from authenticated;
revoke all on table public.content_subjects from authenticated;
revoke all on table public.content_chapters from authenticated;
grant select, insert, update on table public.content_authors to authenticated;
grant select, insert, update on table public.content_subjects to authenticated;
grant select, insert, update on table public.content_chapters to authenticated;

-- A single audited write path avoids silent Data API/RLS failures in the admin UI.
create or replace function public.admin_save_content_option(
  p_kind text,
  p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text;
  v_title text;
  v_number text;
  v_course_id uuid;
  v_sort integer := coalesce((p_payload->>'sort_order')::integer, 0);
  v_active boolean := coalesce((p_payload->>'active')::boolean, true);
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  if p_kind = 'author' then
    v_name := btrim(coalesce(p_payload->>'name',''));
    if v_name = '' then raise exception 'Author name is required' using errcode='22023'; end if;
    insert into public.content_authors(id,name,active,sort_order,updated_at)
    values(v_id,v_name,v_active,v_sort,now())
    on conflict (id) do update set
      name=excluded.name, active=excluded.active,
      sort_order=excluded.sort_order, updated_at=now();
  elsif p_kind in ('course','subject') then
    v_name := btrim(coalesce(p_payload->>'name',''));
    if v_name = '' then raise exception 'Course name is required' using errcode='22023'; end if;
    insert into public.content_subjects(id,name,active,sort_order,updated_at)
    values(v_id,v_name,v_active,v_sort,now())
    on conflict (id) do update set
      name=excluded.name, active=excluded.active,
      sort_order=excluded.sort_order, updated_at=now();
  elsif p_kind = 'chapter' then
    v_course_id := nullif(p_payload->>'subject_id','')::uuid;
    v_number := btrim(coalesce(p_payload->>'chapter_number',''));
    v_title := btrim(coalesce(p_payload->>'title',''));
    if v_course_id is null or not exists(select 1 from public.content_subjects where id=v_course_id) then
      raise exception 'Select a valid course first' using errcode='22023';
    end if;
    if v_number !~ '^[0-9]+([.][0-9]+)*$' then
      raise exception 'Chapter number must contain numbers and dots only' using errcode='22023';
    end if;
    if v_title = '' then raise exception 'Chapter title is required' using errcode='22023'; end if;
    insert into public.content_chapters(id,subject_id,chapter_number,title,active,sort_order,updated_at)
    values(v_id,v_course_id,v_number,v_title,v_active,v_sort,now())
    on conflict (id) do update set
      subject_id=excluded.subject_id, chapter_number=excluded.chapter_number,
      title=excluded.title, active=excluded.active,
      sort_order=excluded.sort_order, updated_at=now();
  else
    raise exception 'Unknown content option type' using errcode='22023';
  end if;

  return jsonb_build_object('status','ok','kind',p_kind,'id',v_id);
end $$;

revoke all on function public.admin_save_content_option(text,uuid,jsonb) from public;
grant execute on function public.admin_save_content_option(text,uuid,jsonb) to authenticated;

insert into public.system_config(key,value)
values ('content_options_schema','2')
on conflict (key) do update set value=excluded.value,updated_at=now();
