-- Admin-confirmed backup copies for each submitted package.
alter table public.content_submissions
  add column if not exists hard_disk_backup boolean not null default false,
  add column if not exists hard_disk_backup_at timestamptz,
  add column if not exists hard_disk_backup_by uuid references public.profiles(id),
  add column if not exists telegram_uploaded boolean not null default false,
  add column if not exists telegram_uploaded_at timestamptz,
  add column if not exists telegram_uploaded_by uuid references public.profiles(id),
  add column if not exists drive_backup_url text not null default '',
  add column if not exists hard_disk_backup_details text not null default '',
  add column if not exists telegram_backup_details text not null default '';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='submission_backup_details_length'
                 and conrelid='public.content_submissions'::regclass) then
    alter table public.content_submissions
      add constraint submission_backup_details_length check (
        char_length(drive_backup_url)<=2048 and
        char_length(hard_disk_backup_details)<=500 and
        char_length(telegram_backup_details)<=500
      );
  end if;
end $$;

grant update(hard_disk_backup,telegram_uploaded,drive_backup_url,hard_disk_backup_details,telegram_backup_details)
on public.content_submissions to authenticated;

create or replace function public.guard_submission_backup_locations()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.hard_disk_backup is distinct from old.hard_disk_backup
     or new.telegram_uploaded is distinct from old.telegram_uploaded
     or new.drive_backup_url is distinct from old.drive_backup_url
     or new.hard_disk_backup_details is distinct from old.hard_disk_backup_details
     or new.telegram_backup_details is distinct from old.telegram_backup_details
     or new.hard_disk_backup_at is distinct from old.hard_disk_backup_at
     or new.hard_disk_backup_by is distinct from old.hard_disk_backup_by
     or new.telegram_uploaded_at is distinct from old.telegram_uploaded_at
     or new.telegram_uploaded_by is distinct from old.telegram_uploaded_by then
    if not public.is_admin() then
      raise exception 'Only administrators can confirm backup locations';
    end if;
    if new.hard_disk_backup is distinct from old.hard_disk_backup then
      new.hard_disk_backup_at:=case when new.hard_disk_backup then now() else null end;
      new.hard_disk_backup_by:=case when new.hard_disk_backup then auth.uid() else null end;
    end if;
    if new.telegram_uploaded is distinct from old.telegram_uploaded then
      new.telegram_uploaded_at:=case when new.telegram_uploaded then now() else null end;
      new.telegram_uploaded_by:=case when new.telegram_uploaded then auth.uid() else null end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_submission_backup_locations_trigger on public.content_submissions;
create trigger guard_submission_backup_locations_trigger
before update on public.content_submissions for each row
execute function public.guard_submission_backup_locations();

notify pgrst, 'reload schema';
