-- Permit a user to see their submitted records and finalize an early upload
-- with the answers completed after files were selected.
alter table public.content_submissions add column if not exists drive_uploaded boolean not null default false;
alter table public.content_submissions add column if not exists drive_uploaded_at timestamptz;
alter table public.content_submissions add column if not exists drive_uploaded_by uuid references public.profiles(id);
alter table public.content_submissions add column if not exists deleted_at timestamptz;
alter table public.content_submissions add column if not exists deleted_by uuid references public.profiles(id);
create index if not exists content_submissions_trash_idx on public.content_submissions(deleted_at) where deleted_at is not null;

drop policy if exists submissions_admin_read on public.content_submissions;
create policy submissions_admin_read on public.content_submissions for select to authenticated
using(public.is_admin() or owner_id=auth.uid());

drop policy if exists submissions_owner_finish on public.content_submissions;
create policy submissions_owner_finish on public.content_submissions for update to authenticated
using(owner_id=auth.uid() and status='uploading')
with check(owner_id=auth.uid() and status in ('uploading','submitted'));
drop policy if exists submissions_admin_update on public.content_submissions;
create policy submissions_admin_update on public.content_submissions for update to authenticated
using(public.is_admin()) with check(public.is_admin());

grant update(category_id,course_id,chapter_id,version_label,answers,form_snapshot,status,files,submitted_at,
  drive_uploaded,drive_uploaded_at,drive_uploaded_by,deleted_at,deleted_by)
on public.content_submissions to authenticated;

create or replace function public.validate_content_submission() returns trigger language plpgsql
set search_path=public as $$
begin
  if tg_op='INSERT' or old.status='uploading' then
  if new.course_id is not null and not exists(
    select 1 from public.content_subjects where id=new.course_id and active
      and (new.category_id is null or category_id=new.category_id)
  ) then raise exception 'The selected course does not belong to this category'; end if;
  if new.chapter_id is not null and not exists(
    select 1 from public.content_chapters c join public.content_subjects s on s.id=c.subject_id
    where c.id=new.chapter_id and c.active and s.active
      and (new.course_id is null or c.subject_id=new.course_id)
      and (new.category_id is null or s.category_id=new.category_id)
  ) then raise exception 'The selected chapter does not belong to this course'; end if;
  if new.version_label is not null and not exists(
    select 1 from public.content_template_versions
    where template_id=new.template_id and version_label=new.version_label and active
  ) then raise exception 'This version is not available for the selected template'; end if;
  if not exists(
    select 1 from public.submission_form_configs
    where id=new.form_id and template_id=new.template_id and active
  ) then raise exception 'The selected submission form is unavailable'; end if;
  end if;
  if tg_op='UPDATE' then
    if new.owner_id is distinct from old.owner_id or new.form_id is distinct from old.form_id
      or new.template_id is distinct from old.template_id then
      raise exception 'A submitted package cannot change its identity or answers';
    end if;
    if old.status='uploading' then
      if not public.is_admin() and (
        new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by
        or new.drive_uploaded is distinct from old.drive_uploaded
        or new.drive_uploaded_at is distinct from old.drive_uploaded_at
        or new.drive_uploaded_by is distinct from old.drive_uploaded_by
      ) then raise exception 'Only administrators can change archive or backup status'; end if;
    elsif old.status='submitted' then
      if not public.is_admin() or new.status<>'submitted'
        or new.category_id is distinct from old.category_id or new.course_id is distinct from old.course_id
        or new.chapter_id is distinct from old.chapter_id or new.version_label is distinct from old.version_label
        or new.answers is distinct from old.answers or new.form_snapshot is distinct from old.form_snapshot
        or new.files is distinct from old.files or new.submitted_at is distinct from old.submitted_at then
        raise exception 'A submitted package cannot change its identity or answers';
      end if;
    end if;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
