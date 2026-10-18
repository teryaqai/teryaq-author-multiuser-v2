-- v3.0.4 reset compatibility: explicit primary-key predicates for safe-update protection.
-- This file only updates the reset function; it does NOT execute a reset.
begin;
create or replace function public.workspace_reset_finish(p_expected text) returns text language plpgsql security definer set search_path=public as $$
declare next_generation text:=gen_random_uuid()::text; wid uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
 perform 1 from public.workspace_reset_state where id and resetting and generation=p_expected for update;
 if not found then raise exception 'No matching reset in progress'; end if;
 if exists(select 1 from public.workspace_reset_files()) then raise exception 'Uploaded file cleanup is not complete; resume the reset'; end if;
 delete from public.qf_audit_data where task_id is not null;
 delete from public.workflow_notifications where id is not null;
 delete from public.workflow_events where id is not null;
 delete from public.workflow_evidence where id is not null;
 delete from public.workflow_task_comments where id is not null;
 delete from public.workflow_task_check_state where instruction_id is not null;
 delete from public.workflow_task_resources where id is not null;
 delete from public.workflow_chapter_resources where id is not null;
 update public.workflow_tasks set submitted_id=null,approved_id=null,status='planned',approved_at=null,approved_by=null,blocked_reason=null,impact_alerted_at=null,opened_at=null where id is not null;
 delete from public.content_submissions where id is not null;
 delete from public.sync_conflicts where id is not null;
 delete from public.audit_log where entity_type in ('document','submission','workflow');
 delete from public.documents where id is not null;
 -- FK cascades remove attachments and all document versions.
 for wid in select id from public.course_workflows loop perform public.workflow_open_ready(wid); end loop;
 update public.workspace_reset_state set generation=next_generation,resetting=false,completed_at=now() where id;
 return next_generation;
end $$;
notify pgrst,'reload schema';
commit;
