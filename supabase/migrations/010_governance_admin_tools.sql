-- TERYAQ Master Tool v2.5.0
-- Governance, account approval, cloud conflict metadata, audit, retention,
-- administrator restore/purge, and analytics.
-- This migration is additive. Do not edit migrations 001-009 after production use.

begin;

create extension if not exists pgcrypto;

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 320),
  executor_type text not null check (char_length(executor_type) between 2 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','invited','activated')),
  decision_note text not null default '',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  invitation_sent_at timestamptz,
  activated_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists account_requests_status_created_idx
  on public.account_requests(status, created_at desc);
create unique index if not exists account_requests_open_email_idx
  on public.account_requests(lower(email))
  where status in ('pending','approved','invited');

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  owner_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_event_idx on public.audit_log(event_type, created_at desc);
create index if not exists audit_log_owner_idx on public.audit_log(owner_id, created_at desc);

create table if not exists public.sync_conflicts (
  id bigint generated always as identity primary key,
  document_id text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  conflict_type text not null,
  local_base_version bigint not null default 0,
  server_version bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  unique(owner_id, document_id, device_id)
);
create index if not exists sync_conflicts_open_idx
  on public.sync_conflicts(resolved_at, detected_at desc);
create index if not exists sync_conflicts_owner_idx
  on public.sync_conflicts(owner_id, detected_at desc);

alter table public.account_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.sync_conflicts enable row level security;

grant usage on schema public to anon, authenticated, service_role;

drop policy if exists account_requests_admin_select on public.account_requests;
create policy account_requests_admin_select on public.account_requests
for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists sync_conflicts_select on public.sync_conflicts;
create policy sync_conflicts_select on public.sync_conflicts
for select to authenticated
using (owner_id = auth.uid() or public.is_admin(auth.uid()));

revoke all on table public.account_requests from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.sync_conflicts from anon, authenticated;
grant select on table public.account_requests to authenticated;
grant select on table public.audit_log to authenticated;
grant select on table public.sync_conflicts to authenticated;
grant select,insert,update,delete on table public.account_requests to service_role;
grant select,insert,update,delete on table public.audit_log to service_role;
grant select,insert,update,delete on table public.sync_conflicts to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;
grant usage,select on sequence public.sync_conflicts_id_seq to service_role;

create or replace function public.submit_account_request(
  p_name text,
  p_email text,
  p_executor_type text,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  clean_name text := trim(coalesce(p_name,''));
  clean_email text := lower(trim(coalesce(p_email,'')));
  clean_type text := trim(coalesce(p_executor_type,''));
  clean_note text := left(trim(coalesce(p_note,'')),2000);
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 120 then
    raise exception 'Enter your full name';
  end if;
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if char_length(clean_type) < 2 or char_length(clean_type) > 120 then
    raise exception 'Enter the task or executor type';
  end if;

  -- Neutral response prevents account enumeration and repeated spam.
  if exists (
    select 1 from public.account_requests
    where lower(email)=clean_email
      and status in ('pending','approved','invited','activated')
      and created_at > now() - interval '24 hours'
  ) or exists (select 1 from public.profiles where lower(email)=clean_email) then
    return jsonb_build_object('received',true);
  end if;

  begin
    insert into public.account_requests(requester_name,email,executor_type,note)
    values(clean_name,clean_email,clean_type,clean_note);
  exception when unique_violation then
    null;
  end;
  return jsonb_build_object('received',true);
end $$;
revoke all on function public.submit_account_request(text,text,text,text) from public;
grant execute on function public.submit_account_request(text,text,text,text) to anon, authenticated;

create or replace function public.activate_own_account_request()
returns void
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  user_email text;
  activated_request uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select lower(email) into user_email from public.profiles where id=uid;
  if user_email is null then return; end if;
  update public.account_requests
  set status='activated',activated_user_id=uid,updated_at=now()
  where lower(email)=user_email and status in ('approved','invited')
  returning id into activated_request;
  if activated_request is not null then
    insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata)
    values(uid,'account_request.activated','account_request',activated_request::text,uid,
      jsonb_build_object('email',user_email));
  end if;
end $$;
revoke all on function public.activate_own_account_request() from public;
grant execute on function public.activate_own_account_request() to authenticated;

create or replace function public.report_sync_conflict(
  p_document_id text,
  p_device_id text,
  p_conflict_type text,
  p_local_base_version bigint,
  p_server_version bigint,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.documents where id=p_document_id and owner_id=uid) then
    raise exception 'Document ownership mismatch';
  end if;
  insert into public.sync_conflicts(
    document_id,owner_id,device_id,conflict_type,local_base_version,server_version,metadata
  ) values(
    p_document_id,uid,left(p_device_id,160),left(p_conflict_type,80),
    greatest(coalesce(p_local_base_version,0),0),greatest(coalesce(p_server_version,0),0),
    jsonb_build_object(
      'detected_at',left(coalesce(p_metadata->>'detected_at',''),64),
      'app_version',left(coalesce(p_metadata->>'app_version',''),32)
    )
  )
  on conflict(owner_id,document_id,device_id) do update set
    conflict_type=excluded.conflict_type,
    local_base_version=excluded.local_base_version,
    server_version=excluded.server_version,
    metadata=excluded.metadata,
    last_seen_at=now(),
    resolved_at=null,
    resolution=null;
end $$;
revoke all on function public.report_sync_conflict(text,text,text,bigint,bigint,jsonb) from public;
grant execute on function public.report_sync_conflict(text,text,text,bigint,bigint,jsonb) to authenticated;

create or replace function public.resolve_sync_conflict(
  p_document_id text,
  p_device_id text,
  p_resolution text
) returns void
language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  update public.sync_conflicts
  set resolved_at=now(),resolution=left(coalesce(p_resolution,'resolved'),80),last_seen_at=now()
  where owner_id=uid and document_id=p_document_id and device_id=p_device_id and resolved_at is null;
end $$;
revoke all on function public.resolve_sync_conflict(text,text,text) from public;
grant execute on function public.resolve_sync_conflict(text,text,text) to authenticated;

create or replace function public.audit_document_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_name text;
begin
  if tg_op='INSERT' then event_name:='document.created';
  elsif old.deleted_at is null and new.deleted_at is not null then event_name:='document.deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then event_name:='document.restored';
  elsif old.current_version is distinct from new.current_version then event_name:='document.synced';
  else return new;
  end if;
  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata)
  values(auth.uid(),event_name,'document',new.id,new.owner_id,
    jsonb_build_object('version',new.current_version,'title',new.title));
  return new;
end $$;
drop trigger if exists audit_documents_trigger on public.documents;
create trigger audit_documents_trigger after insert or update on public.documents
for each row execute function public.audit_document_change();
revoke all on function public.audit_document_change() from public,anon,authenticated;

create or replace function public.audit_content_option_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  row_id text;
  event_name text := 'content_option.'||lower(tg_op);
  details jsonb;
begin
  row_id:=case when tg_op='DELETE' then old.id::text else new.id::text end;
  details:=case when tg_op='DELETE' then jsonb_build_object('before',to_jsonb(old))
    when tg_op='INSERT' then jsonb_build_object('after',to_jsonb(new))
    else jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)) end;
  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,metadata)
  values(auth.uid(),event_name,tg_table_name,row_id,details);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists audit_content_authors_trigger on public.content_authors;
create trigger audit_content_authors_trigger after insert or update or delete on public.content_authors
for each row execute function public.audit_content_option_change();
drop trigger if exists audit_content_subjects_trigger on public.content_subjects;
create trigger audit_content_subjects_trigger after insert or update or delete on public.content_subjects
for each row execute function public.audit_content_option_change();
drop trigger if exists audit_content_chapters_trigger on public.content_chapters;
create trigger audit_content_chapters_trigger after insert or update or delete on public.content_chapters
for each row execute function public.audit_content_option_change();
revoke all on function public.audit_content_option_change() from public,anon,authenticated;

create or replace function public.audit_profile_role_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.role is distinct from new.role then
    insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata)
    values(auth.uid(),'profile.role_changed','profile',new.id::text,new.id,
      jsonb_build_object('from',old.role,'to',new.role,'email',new.email));
  end if;
  return new;
end $$;

-- Migration 001 allowed users to update their own profile so they can change
-- display_name. Keep that behavior, but block a client from promoting its own
-- role. Role changes remain possible from trusted service-role operations or by
-- an existing administrator through a separately authorized admin workflow.
create or replace function public.protect_profile_role_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.role is distinct from new.role
    and auth.role() <> 'service_role'
    and not public.is_admin(auth.uid()) then
    raise exception 'Admin access required to change roles';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_role_change_trigger on public.profiles;
create trigger protect_profile_role_change_trigger before update of role on public.profiles
for each row execute function public.protect_profile_role_change();
revoke all on function public.protect_profile_role_change() from public,anon,authenticated;

drop trigger if exists audit_profile_role_change_trigger on public.profiles;
create trigger audit_profile_role_change_trigger after update of role on public.profiles
for each row execute function public.audit_profile_role_change();
revoke all on function public.audit_profile_role_change() from public,anon,authenticated;

create or replace function public.admin_restore_document(p_document_id text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  existing public.documents%rowtype;
  new_version bigint;
begin
  if uid is null or not public.is_admin(uid) then raise exception 'Admin access required'; end if;
  select * into existing from public.documents where id=p_document_id for update;
  if not found then raise exception 'Document not found'; end if;
  if existing.deleted_at is null then raise exception 'Document is not deleted'; end if;
  new_version:=existing.current_version+1;
  update public.documents set deleted_at=null,updated_at=now(),current_version=new_version
  where id=p_document_id;
  insert into public.document_versions(document_id,owner_id,version,document_json,is_deleted,created_by)
  values(existing.id,existing.owner_id,new_version,existing.document_json,false,uid);
  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata)
  values(uid,'document.admin_restored','document',existing.id,existing.owner_id,
    jsonb_build_object('version',new_version,'previous_deleted_at',existing.deleted_at));
  return jsonb_build_object('status','ok','current_version',new_version,'owner_id',existing.owner_id);
end $$;
revoke all on function public.admin_restore_document(text) from public;
grant execute on function public.admin_restore_document(text) to authenticated;

insert into public.system_config(key,value)
values
  ('trash_retention_days','30'::jsonb),
  ('account_request_mode','"approval_required"'::jsonb),
  ('cloud_migration_version','10'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

create or replace function public.admin_purge_document(p_document_id text,p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  existing public.documents%rowtype;
  retention_days integer := 30;
begin
  if auth.role() <> 'service_role' or p_actor_id is null or not public.is_admin(p_actor_id) then
    raise exception 'Protected server operation required';
  end if;
  select coalesce((value #>> '{}')::integer,30) into retention_days
  from public.system_config where key='trash_retention_days';
  retention_days:=coalesce(retention_days,30);
  select * into existing from public.documents where id=p_document_id for update;
  if not found then raise exception 'Document not found'; end if;
  if existing.deleted_at is null then raise exception 'Only deleted documents can be purged'; end if;
  if existing.deleted_at > now() - make_interval(days=>retention_days) then
    raise exception 'Retention period has not expired';
  end if;
  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata)
  values(p_actor_id,'document.purged','document',existing.id,existing.owner_id,
    jsonb_build_object('title',existing.title,'final_version',existing.current_version,
      'deleted_at',existing.deleted_at,'retention_days',retention_days));
  delete from public.sync_conflicts where document_id=p_document_id;
  delete from public.documents where id=p_document_id;
  return jsonb_build_object('status','purged','document_id',p_document_id);
end $$;
revoke all on function public.admin_purge_document(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_purge_document(text,uuid) to service_role;

create or replace function public.record_admin_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text default null,
  p_owner_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  clean_event text := left(trim(coalesce(p_event_type,'')),120);
  clean_entity text := left(trim(coalesce(p_entity_type,'')),80);
begin
  if uid is null or not public.is_admin(uid) then raise exception 'Admin access required'; end if;
  if clean_event='' or clean_entity='' then raise exception 'Event and entity types are required'; end if;
  insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata)
  values(uid,clean_event,clean_entity,left(p_entity_id,240),p_owner_id,coalesce(p_metadata,'{}'::jsonb));
end $$;
revoke all on function public.record_admin_event(text,text,text,uuid,jsonb) from public;
grant execute on function public.record_admin_event(text,text,text,uuid,jsonb) to authenticated;

create or replace function public.admin_analytics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null or not public.is_admin(uid) then raise exception 'Admin access required'; end if;
  p_days:=greatest(1,least(coalesce(p_days,30),365));
  select jsonb_build_object(
    'period_days',p_days,
    'users',(select count(*) from public.profiles),
    'active_documents',(select count(*) from public.documents where deleted_at is null),
    'deleted_documents',(select count(*) from public.documents where deleted_at is not null),
    'versions',(select count(*) from public.document_versions),
    'open_conflicts',(select count(*) from public.sync_conflicts where resolved_at is null),
    'pending_requests',(select count(*) from public.account_requests where status='pending'),
    'events_in_period',(select count(*) from public.audit_log where created_at>=now()-make_interval(days=>p_days)),
    'daily_versions',coalesce((
      select jsonb_agg(
        jsonb_build_object('day',activity_date,'count',version_count)
        order by activity_date
      )
      from (
        select created_at::date as activity_date,count(*) as version_count
        from public.document_versions
        where created_at>=now()-make_interval(days=>p_days)
        group by created_at::date
      ) q
    ),'[]'::jsonb),
    'top_users',coalesce((
      select jsonb_agg(jsonb_build_object('user_id',owner_id,'email',email,'display_name',display_name,'documents',documents) order by documents desc)
      from (
        select p.id owner_id,p.email,p.display_name,count(d.id) filter(where d.deleted_at is null) documents
        from public.profiles p left join public.documents d on d.owner_id=p.id
        group by p.id,p.email,p.display_name order by documents desc limit 10
      ) q
    ),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_analytics(integer) from public;
grant execute on function public.admin_analytics(integer) to authenticated;

commit;

-- Make the newly added tables and RPC functions immediately visible to the
-- Supabase Data API after this migration succeeds.
notify pgrst, 'reload schema';
