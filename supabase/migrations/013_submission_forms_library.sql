-- TERYAQ Master Tool V 2.6.0: shared content hierarchy, editable forms, private submissions.
-- Run after migration 012. Existing courses are assigned to the Basic category.
create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(btrim(name))>0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.content_categories(name,sort_order) values
  ('Basic Stage',0),('Clinical Stage',10)
on conflict(name) do nothing;
alter table public.content_subjects add column if not exists category_id uuid references public.content_categories(id) on delete restrict;
update public.content_subjects set category_id=(select id from public.content_categories where name='Basic Stage') where category_id is null;
alter table public.content_subjects alter column category_id set not null;
create index if not exists content_subjects_category_idx on public.content_subjects(category_id,active,sort_order);
create or replace function public.admin_save_course_category(p_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_category uuid:=nullif(p_payload->>'category_id','')::uuid;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode='42501'; end if;
  if btrim(coalesce(p_payload->>'name',''))='' or not exists(select 1 from public.content_categories where id=v_category) then
    raise exception 'Course name and category are required' using errcode='22023'; end if;
  insert into public.content_subjects(id,name,category_id,active,sort_order,updated_at)
  values(v_id,btrim(p_payload->>'name'),v_category,coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0),now())
  on conflict(id) do update set name=excluded.name,category_id=excluded.category_id,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.admin_save_course_category(uuid,jsonb) from public;
grant execute on function public.admin_save_course_category(uuid,jsonb) to authenticated;
alter table public.content_categories enable row level security;
create policy categories_read on public.content_categories for select to authenticated using(active or public.is_admin());
create policy categories_insert on public.content_categories for insert to authenticated with check(public.is_admin());
create policy categories_update on public.content_categories for update to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.content_categories from anon,authenticated;
grant select,insert,update on public.content_categories to authenticated;

create table if not exists public.content_template_versions (
  template_id text not null,
  version_label text not null check(length(btrim(version_label))>0),
  active boolean not null default true,
  sort_order integer not null default 0,
  primary key(template_id,version_label)
);
insert into public.content_template_versions(template_id,version_label,sort_order) values
  ('scientific-draft-text','1',1),('scientific-draft-text','2',2),('scientific-draft-text','3',3),('scientific-draft-text','4',4),
  ('scientific-draft-figures','1',1),('scientific-draft-figures','2',2),('scientific-draft-figures','3',3),('scientific-draft-figures','4',4),
  ('shooting-script','1',1),('shooting-script','2',2)
on conflict do nothing;
alter table public.content_template_versions enable row level security;
create policy template_versions_read on public.content_template_versions for select to authenticated using(active or public.is_admin());
create policy template_versions_insert on public.content_template_versions for insert to authenticated with check(public.is_admin());
create policy template_versions_update on public.content_template_versions for update to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.content_template_versions from anon,authenticated;
grant select,insert,update on public.content_template_versions to authenticated;

create table if not exists public.submission_form_configs (
  id text primary key check(id ~ '^[a-z0-9-]{3,80}$'),
  title text not null,
  description text not null default '',
  template_id text not null,
  active boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.submission_form_configs(id,title,description,template_id,configuration) values
('scientific-draft','نموذج تسليم المسودة العلمية - Scientific Draft Submission form','تسليم ملفات المسودة العلمية ومراجعة جودة المخرجات','scientific-draft-text','{}'::jsonb)
on conflict(id) do nothing;
alter table public.submission_form_configs enable row level security;
create policy submission_forms_read on public.submission_form_configs for select to authenticated using(active or public.is_admin());
create policy submission_forms_insert on public.submission_form_configs for insert to authenticated with check(public.is_admin());
create policy submission_forms_update on public.submission_form_configs for update to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.submission_form_configs from anon,authenticated;
grant select,insert,update on public.submission_form_configs to authenticated;

create table if not exists public.content_submissions (
  id uuid primary key,
  form_id text not null references public.submission_form_configs(id) on delete restrict,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  category_id uuid references public.content_categories(id),
  course_id uuid references public.content_subjects(id),
  chapter_id uuid references public.content_chapters(id),
  template_id text not null,
  version_label text,
  answers jsonb not null default '{}'::jsonb,
  form_snapshot jsonb not null default '{}'::jsonb,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'uploading' check(status in ('uploading','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists content_submissions_browse_idx on public.content_submissions(category_id,course_id,chapter_id,template_id,version_label,created_at desc);
alter table public.content_submissions enable row level security;
create policy submissions_admin_read on public.content_submissions for select to authenticated using(public.is_admin() or (owner_id=auth.uid() and status='uploading'));
create policy submissions_owner_insert on public.content_submissions for insert to authenticated with check(owner_id=auth.uid() and status='uploading');
create policy submissions_owner_finish on public.content_submissions for update to authenticated using(owner_id=auth.uid() and status='uploading') with check(owner_id=auth.uid() and status='submitted');
revoke all on public.content_submissions from anon,authenticated;
grant select,insert on public.content_submissions to authenticated;
grant update(status,files,submitted_at) on public.content_submissions to authenticated;

create or replace function public.validate_content_submission() returns trigger language plpgsql
set search_path=public as $$
begin
  if new.course_id is not null and not exists(select 1 from public.content_subjects where id=new.course_id and active and (new.category_id is null or category_id=new.category_id)) then
    raise exception 'The selected course does not belong to this category'; end if;
  if new.chapter_id is not null and not exists(select 1 from public.content_chapters c join public.content_subjects s on s.id=c.subject_id where c.id=new.chapter_id and c.active and s.active and (new.course_id is null or c.subject_id=new.course_id) and (new.category_id is null or s.category_id=new.category_id)) then
    raise exception 'The selected chapter does not belong to this course'; end if;
  if new.version_label is not null and not exists(select 1 from public.content_template_versions where template_id=new.template_id and version_label=new.version_label and active) then
    raise exception 'This version is not available for the selected template'; end if;
  if not exists(select 1 from public.submission_form_configs where id=new.form_id and template_id=new.template_id and active) then
    raise exception 'The selected submission form is unavailable'; end if;
  if tg_op='UPDATE' and (new.owner_id is distinct from old.owner_id or new.form_id is distinct from old.form_id or new.category_id is distinct from old.category_id or new.course_id is distinct from old.course_id or new.chapter_id is distinct from old.chapter_id or new.template_id is distinct from old.template_id or new.version_label is distinct from old.version_label or new.answers is distinct from old.answers or new.form_snapshot is distinct from old.form_snapshot) then
    raise exception 'A submitted package cannot change its identity or answers'; end if;
  return new;
end $$;
create trigger validate_content_submission_trigger before insert or update on public.content_submissions for each row execute function public.validate_content_submission();

insert into storage.buckets(id,name,public) values('teryaq-submissions','teryaq-submissions',false) on conflict(id) do update set public=false;
-- Private library: authors can only upload their own unfinished submission; only admins can read files.
create policy submissions_storage_admin_read on storage.objects for select to authenticated
using(bucket_id='teryaq-submissions' and public.is_admin());
create policy submissions_storage_author_upload on storage.objects for insert to authenticated
with check(bucket_id='teryaq-submissions' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.content_submissions s where s.id::text=(storage.foldername(name))[2] and s.owner_id=auth.uid() and s.status='uploading'));
create policy submissions_storage_author_retry on storage.objects for update to authenticated
using(bucket_id='teryaq-submissions' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.content_submissions s where s.id::text=(storage.foldername(name))[2] and s.owner_id=auth.uid() and s.status='uploading'))
with check(bucket_id='teryaq-submissions' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.content_submissions s where s.id::text=(storage.foldername(name))[2] and s.owner_id=auth.uid() and s.status='uploading'));
notify pgrst, 'reload schema';
