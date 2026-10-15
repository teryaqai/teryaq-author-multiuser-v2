-- v3.0.4: refresh reset implementation. Installing it does not reset work.
begin;
create or replace function public.workspace_reset_finish(p_expected text) returns text language plpgsql security definer set search_path=public as $$
declare next_generation text:=gen_random_uuid()::text; wid uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 perform 1 from public.workspace_reset_state where id and resetting and generation=p_expected for update;
 if not found then raise exception 'No matching reset in progress'; end if;
 if exists(select 1 from public.workspace_reset_files()) then raise exception 'Uploaded file cleanup is not complete; resume the reset'; end if;
 delete from public.qf_audit_data;
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
notify pgrst,'reload schema';
commit;
