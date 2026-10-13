-- TERYAQ v3.0.2: persistent, admin-controlled submission form positions.
-- Apply after migrations 001–030. No form definitions or submissions are removed.
begin;
alter table public.submission_form_configs
  add column if not exists sort_order integer not null default 0;

-- Match the previous title order on first installation. Unpositioned new forms
-- subsequently appear at the end until the admin moves them.
with existing as (
 select id,row_number() over(order by title,id)::integer as position
 from public.submission_form_configs
)
update public.submission_form_configs f set sort_order=e.position
from existing e where f.id=e.id and f.sort_order=0;

create or replace function public.submission_form_set_position(p_form_id text,p_position integer)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare ordered_ids text[];remaining_ids text[];form_count integer;
begin
 if auth.uid() is null or not coalesce(public.is_admin(),false) then
  raise exception 'Admin access required.' using errcode='42501';
 end if;
 -- Serialize changes so two admins cannot partially reorder the same directory.
 lock table public.submission_form_configs in share row exclusive mode;
 select array_agg(id order by case when sort_order>0 then sort_order else 2147483647 end,title,id)
 into ordered_ids from public.submission_form_configs;
 form_count:=coalesce(cardinality(ordered_ids),0);
 if p_form_id is null or not coalesce(p_form_id=any(ordered_ids),false) then
  raise exception 'Submission form not found.';
 end if;
 if p_position is null or p_position<1 or p_position>form_count then
  raise exception 'Choose a position from 1 to %.',form_count;
 end if;
 remaining_ids:=array_remove(ordered_ids,p_form_id);
 ordered_ids:=coalesce(remaining_ids[1:p_position-1],'{}'::text[])
   ||array[p_form_id]||coalesce(remaining_ids[p_position:form_count],'{}'::text[]);
 update public.submission_form_configs f
 set sort_order=r.position::integer,updated_at=now()
 from unnest(ordered_ids) with ordinality as r(id,position)
 where f.id=r.id and f.sort_order is distinct from r.position::integer;
 return jsonb_build_object('form_id',p_form_id,'position',p_position,'ordered_ids',to_jsonb(ordered_ids));
end;
$$;
revoke all on function public.submission_form_set_position(text,integer) from public,anon;
grant execute on function public.submission_form_set_position(text,integer) to authenticated;
commit;

-- v3.0.3. Install after 031. This migration deletes no user data.
begin;
-- Legacy check rejected unassigned tasks because NULL IS DISTINCT FROM NULL is false.
alter table public.workflow_tasks drop constraint if exists workflow_tasks_check;
alter table public.workflow_tasks add constraint workflow_tasks_check check(owner_id is null or reviewer_id is null or owner_id is distinct from reviewer_id);
alter table public.profiles
 add column if not exists member_code text,
 add column if not exists education_level text,
 add column if not exists education_other text,
 add column if not exists country text,
 add column if not exists institution text,
 add column if not exists specialty text;
create unique index if not exists profiles_member_code_unique on public.profiles(lower(member_code)) where nullif(btrim(member_code),'') is not null;
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin(auth.uid()) and coalesce(auth.role(),'')<>'service_role' and auth.uid() is not null then
  raise exception 'Only admin may edit profile details' using errcode='42501';
 end if;
 if new.education_level is not null and new.education_level not in ('1','2','3','4','5','6','internship','graduate','other') then raise exception 'Invalid education level'; end if;
 if new.education_level='other' and nullif(btrim(new.education_other),'') is null then raise exception 'Explain the Other education level'; end if;
 new.updated_at=now();return new;
end $$;
drop trigger if exists protect_profile_details on public.profiles;
create trigger protect_profile_details before update on public.profiles for each row execute function public.protect_profile_role();
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create or replace function public.admin_update_profile(p_user uuid,p_values jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_admin(auth.uid()),false) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_values->>'display_name',''))) not between 2 and 80 then raise exception 'Name must be 2–80 characters'; end if;
 if coalesce(p_values->>'role','user') not in ('user','admin') then raise exception 'Invalid role'; end if;
 if auth.role()<>'service_role' and exists(select 1 from public.profiles where id=p_user and email is distinct from (p_values->>'email')) then raise exception 'Use admin-governance to change the account email'; end if;
 update public.profiles set display_name=btrim(p_values->>'display_name'),email=p_values->>'email',role=p_values->>'role',member_code=nullif(btrim(p_values->>'member_code'),''),education_level=nullif(p_values->>'education_level',''),education_other=p_values->>'education_other',country=p_values->>'country',institution=p_values->>'institution',specialty=p_values->>'specialty',avatar_path=nullif(p_values->>'avatar_path','') where id=p_user;
 if not found then raise exception 'Unknown account'; end if;
end $$;
revoke all on function public.admin_update_profile(uuid,jsonb) from public,anon;
grant execute on function public.admin_update_profile(uuid,jsonb) to authenticated,service_role;
-- Restrictive policies apply alongside all existing permissive storage policies.
drop policy if exists profile_avatar_insert_guard on storage.objects;
create policy profile_avatar_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin());
drop policy if exists profile_avatar_update_guard on storage.objects;
create policy profile_avatar_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin()) with check(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin());
drop policy if exists profile_avatar_delete_guard on storage.objects;
create policy profile_avatar_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin());
drop policy if exists admin_profile_avatar_write on storage.objects;
create policy admin_profile_avatar_write on storage.objects for all to authenticated using(bucket_id='teryaq-author' and public.is_admin() and (storage.foldername(name))[2]='profile') with check(bucket_id='teryaq-author' and public.is_admin() and (storage.foldername(name))[2]='profile');
create or replace function public.guard_document_executor() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.document_json is null or coalesce(public.is_admin(auth.uid()),false) or auth.uid() is null then return new; end if;
 if tg_op='INSERT' then
  if nullif(new.document_json#>>'{metadata,taskExecutorId}','') is not null and new.document_json#>>'{metadata,taskExecutorId}'<>new.owner_id::text then raise exception 'File executor must match its creator' using errcode='42501'; end if;
 elsif (new.document_json#>'{metadata,taskExecutorId}') is distinct from (old.document_json#>'{metadata,taskExecutorId}') and old.document_json#>>'{metadata,taskExecutorId}' is not null then
  raise exception 'Only admin may change the file executor' using errcode='42501';
 end if;
 if tg_op='UPDATE' and new.document_json is not null and old.document_json is not null and ((new.document_json#>'{metadata,authorIds}') is distinct from (old.document_json#>'{metadata,authorIds}') or (new.document_json#>'{metadata,name}') is distinct from (old.document_json#>'{metadata,name}')) then raise exception 'Only admin may change the file author / executor' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists document_executor_guard on public.documents;
create trigger document_executor_guard before insert or update of document_json on public.documents for each row execute function public.guard_document_executor();
create or replace function public.workflow_accounts() returns table(id uuid,name text,active boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' · '||p.member_code end,true from public.profiles p order by 2;
end $$;
notify pgrst,'reload schema';
commit;

-- Installs a reset tool. Applying this migration does NOT perform a reset.
begin;
create table if not exists public.workspace_reset_state(id boolean primary key default true check(id),generation text not null default '',resetting boolean not null default false,completed_at timestamptz);
insert into public.workspace_reset_state(id) values(true) on conflict do nothing;
alter table public.workspace_reset_state enable row level security;
create or replace function public.workspace_generation() returns jsonb language sql stable security definer set search_path=public as $$ select jsonb_build_object('generation',generation,'resetting',resetting,'completed_at',completed_at) from public.workspace_reset_state where id $$;
revoke all on function public.workspace_generation() from public,anon;
grant execute on function public.workspace_generation() to authenticated,service_role;
create or replace function public.workspace_writes_open() returns boolean language sql stable security definer set search_path=public as $$ select not resetting from public.workspace_reset_state where id $$;
revoke all on function public.workspace_writes_open() from public,anon;
grant execute on function public.workspace_writes_open() to authenticated,service_role;
create or replace function public.workspace_reset_preview() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_admin(auth.uid()),false) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin access required' using errcode='42501'; end if;
 return jsonb_build_object('documents',(select count(*) from public.documents),'versions',(select count(*) from public.document_versions),'submissions',(select count(*) from public.content_submissions),'files',(select count(*) from storage.objects o where o.bucket_id in ('teryaq-submissions','teryaq-workflow') or (o.bucket_id='teryaq-author' and (storage.foldername(o.name))[2] is distinct from 'profile' and not exists(select 1 from public.profiles p where p.avatar_path=o.name))),'generation',(select generation from public.workspace_reset_state),'resetting',(select resetting from public.workspace_reset_state));
end $$;
revoke all on function public.workspace_reset_preview() from public,anon;
grant execute on function public.workspace_reset_preview() to authenticated,service_role;
create or replace function public.workspace_reset_files() returns table(bucket_id text,name text) language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 return query select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('teryaq-submissions','teryaq-workflow') or (o.bucket_id='teryaq-author' and (storage.foldername(o.name))[2] is distinct from 'profile' and not exists(select 1 from public.profiles p where p.avatar_path=o.name)) order by o.bucket_id,o.name limit 500;
end $$;
revoke all on function public.workspace_reset_files() from public,anon,authenticated;
grant execute on function public.workspace_reset_files() to service_role;
create or replace function public.workspace_reset_begin(p_expected text) returns text language plpgsql security definer set search_path=public as $$
declare state public.workspace_reset_state%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 select * into state from public.workspace_reset_state where id for update;
 if state.generation is distinct from p_expected then raise exception 'Workspace changed; refresh reset preview'; end if;
 update public.workspace_reset_state set resetting=true where id;
 return state.generation;
end $$;
revoke all on function public.workspace_reset_begin(text) from public,anon,authenticated;
grant execute on function public.workspace_reset_begin(text) to service_role;
create or replace function public.workspace_reset_finish(p_expected text) returns text language plpgsql security definer set search_path=public as $$
declare next_generation text:=gen_random_uuid()::text; wid uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 perform 1 from public.workspace_reset_state where id and resetting and generation=p_expected for update;
 if not found then raise exception 'No matching reset in progress'; end if;
 if exists(select 1 from public.workspace_reset_files()) then raise exception 'Uploaded file cleanup is not complete; resume the reset'; end if;
 delete from public.workflow_notifications;
 delete from public.workflow_events;
 delete from public.workflow_evidence;
 delete from public.workflow_task_comments;
 delete from public.workflow_task_check_state;
 delete from public.workflow_task_resources;
 delete from public.workflow_chapter_resources;
 update public.workflow_tasks set submitted_id=null,approved_id=null,status='planned',approved_at=null,approved_by=null,blocked_reason=null,impact_alerted_at=null,opened_at=null;
 delete from public.content_submissions;
 delete from public.sync_conflicts;
 delete from public.audit_log where entity_type in ('document','submission','workflow');
 delete from public.documents;
 -- FK cascades remove attachments and all document versions.
 for wid in select id from public.course_workflows loop perform public.workflow_open_ready(wid); end loop;
 update public.workspace_reset_state set generation=next_generation,resetting=false,completed_at=now() where id;
 return next_generation;
end $$;
revoke all on function public.workspace_reset_finish(text) from public,anon,authenticated;
grant execute on function public.workspace_reset_finish(text) to service_role;
create or replace function public.guard_workspace_document() returns trigger language plpgsql security definer set search_path=public as $$
declare state public.workspace_reset_state%rowtype;
begin
 select * into state from public.workspace_reset_state where id;
 if state.resetting and coalesce(auth.role(),'')<>'service_role' then raise exception 'Workspace reset is in progress; try again after completion' using errcode='42501'; end if;
 if new.document_json is not null and state.generation<>'' and coalesce(new.document_json->>'workspaceGeneration','')<>state.generation then raise exception 'Workspace was reset. Reload the updated app before saving.' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists workspace_document_guard on public.documents;
create trigger workspace_document_guard before insert or update of document_json on public.documents for each row execute function public.guard_workspace_document();
-- Suspend uploads while reset is removing bytes. Profiles stay usable.
drop policy if exists workspace_storage_insert_guard on storage.objects;
create policy workspace_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id not in ('teryaq-author','teryaq-workflow','teryaq-submissions') or public.workspace_writes_open() or (bucket_id='teryaq-author' and (storage.foldername(name))[2]='profile'));
drop policy if exists workspace_storage_update_guard on storage.objects;
create policy workspace_storage_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id not in ('teryaq-author','teryaq-workflow','teryaq-submissions') or public.workspace_writes_open() or (bucket_id='teryaq-author' and (storage.foldername(name))[2]='profile')) with check(bucket_id not in ('teryaq-author','teryaq-workflow','teryaq-submissions') or public.workspace_writes_open() or (bucket_id='teryaq-author' and (storage.foldername(name))[2]='profile'));
drop policy if exists workspace_submission_insert_guard on public.content_submissions;
create policy workspace_submission_insert_guard on public.content_submissions as restrictive for insert to authenticated with check(public.workspace_writes_open());
drop policy if exists workspace_submission_update_guard on public.content_submissions;
create policy workspace_submission_update_guard on public.content_submissions as restrictive for update to authenticated using(public.workspace_writes_open()) with check(public.workspace_writes_open());
notify pgrst,'reload schema';
commit;
