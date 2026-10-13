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
