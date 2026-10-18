-- TERYAQ Master Tool v3.0.6: run after completed 001–036 (v3.0.4+).
-- Installs 037–041 atomically; does not reset data or publish anything.
begin;
do $$begin
 if to_regclass('public.qf_audit_data') is null or to_regprocedure('public.qf_submission_context(uuid,uuid,text,text)') is null then
 raise exception 'Complete the corrected v3.0.4 upgrade through 036 before this update';end if;
end$$;

-- 037_reset_explicit_predicates.sql
-- v3.0.4 reset compatibility: explicit primary-key predicates for safe-update protection.
-- This file only updates the reset function; it does NOT execute a reset.
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

-- 038_workflow_scope_ai_access.sql
-- v3.0.5: scope Course Progress by assignment/leadership; AI Handoff only for AI Leads.
create or replace function public.workflow_is_ai_lead(p_course uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.course_management_roles where course_id=p_course and user_id=auth.uid() and role='ai_lead')
$$;
create or replace function public.workflow_can_view_cycle(p_workflow uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or exists(
 select 1 from public.course_workflows w where w.id=p_workflow and (
 exists(select 1 from public.course_management_roles r where r.course_id=w.course_id and r.user_id=auth.uid())
 or exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and public.workflow_task_is_executor(t.id,auth.uid())))))
$$;
create or replace function public.workflow_can_view_course(p_course uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_admin() or exists(select 1 from public.course_management_roles where course_id=p_course and user_id=auth.uid()) or exists(select 1 from public.course_workflows where course_id=p_course and public.workflow_can_view_cycle(id)))
$$;
create or replace function public.workflow_can_view_task(p_task uuid) returns boolean
language sql stable security definer set search_path=public as $$select exists(select 1 from public.workflow_tasks where id=p_task and public.workflow_can_view_cycle(workflow_id))$$;
create or replace function public.workflow_task_payload(p_task public.workflow_tasks) returns jsonb
language sql stable security definer set search_path=public as $$
 select case when public.workflow_is_ai_lead((select course_id from public.course_workflows where id=p_task.workflow_id)) then to_jsonb(p_task) else to_jsonb(p_task)-array['ai_prompt','ai_expected_output','ai_handoff_notes','ai_handoff_enabled'] end
$$;
-- Expose a safe task snapshot; raw configurable AI columns have no client read grant.
create or replace function public.workflow_visible_tasks() returns jsonb
language sql stable security definer set search_path=public as $$select coalesce(jsonb_agg(public.workflow_task_payload(t) order by t.sort_order),'[]'::jsonb) from public.workflow_tasks t where public.workflow_can_view_cycle(t.workflow_id)$$;
revoke select on public.workflow_tasks from public,anon,authenticated;
revoke select(ai_prompt,ai_expected_output,ai_handoff_notes,ai_handoff_enabled) on public.workflow_tasks from public,anon,authenticated;
do $$declare cols text;begin select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid='public.workflow_tasks'::regclass and attnum>0 and not attisdropped and attname not in ('ai_prompt','ai_expected_output','ai_handoff_notes','ai_handoff_enabled');execute 'grant select('||cols||') on public.workflow_tasks to authenticated';end$$;

drop policy if exists v305_scope on public.course_workflows;
create policy v305_scope on public.course_workflows as restrictive for select to authenticated using(public.workflow_can_view_cycle(id));

drop policy if exists v305_scope on public.workflow_tasks;
create policy v305_scope on public.workflow_tasks as restrictive for select to authenticated using(public.workflow_can_view_cycle(workflow_id));

drop policy if exists v305_scope on public.workflow_task_executors;
create policy v305_scope on public.workflow_task_executors as restrictive for select to authenticated using(public.workflow_can_view_task(task_id));

drop policy if exists v305_scope on public.workflow_chapter_roles;
create policy v305_scope on public.workflow_chapter_roles as restrictive for select to authenticated using(public.workflow_can_view_cycle(workflow_id));

drop policy if exists v305_scope on public.workflow_task_instructions;
create policy v305_scope on public.workflow_task_instructions as restrictive for select to authenticated using(public.workflow_can_view_task(task_id));

drop policy if exists v305_scope on public.workflow_task_comments;
create policy v305_scope on public.workflow_task_comments as restrictive for select to authenticated using(public.workflow_can_view_task(task_id));

drop policy if exists v305_scope on public.workflow_task_check_state;
create policy v305_scope on public.workflow_task_check_state as restrictive for select to authenticated using(exists(select 1 from public.workflow_task_instructions i where i.id=instruction_id and public.workflow_can_view_task(i.task_id)));

drop policy if exists v305_scope on public.workflow_chapter_resources;
create policy v305_scope on public.workflow_chapter_resources as restrictive for select to authenticated using(public.workflow_can_view_cycle(workflow_id));

drop policy if exists v305_scope on public.workflow_task_resources;
create policy v305_scope on public.workflow_task_resources as restrictive for select to authenticated using(public.workflow_can_view_task(task_id));

drop policy if exists v305_scope on public.workflow_events;
create policy v305_scope on public.workflow_events as restrictive for select to authenticated using(public.workflow_can_view_cycle(workflow_id));

drop policy if exists v305_scope on public.workflow_evidence;
create policy v305_scope on public.workflow_evidence as restrictive for select to authenticated using(public.workflow_can_view_task(task_id));

drop policy if exists v305_scope on public.course_management_roles;
create policy v305_scope on public.course_management_roles as restrictive for select to authenticated using(user_id=auth.uid() or public.workflow_can_view_course(course_id));

drop policy if exists v305_scope on public.course_leads;
create policy v305_scope on public.course_leads as restrictive for select to authenticated using(user_id=auth.uid() or public.workflow_can_view_course(course_id));

create or replace function public.workflow_can_view_required_inputs(p_task uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id where t.id=p_task and (
 public.workflow_task_is_executor(t.id,auth.uid()) or public.workflow_can_manage_stage(w.course_id,t.stage)
 or (public.workflow_is_ai_lead(w.course_id) and public.workflow_ai_task_spec(t.task_key,t.stage) is not null)))
$$;
-- Preparation is shared within the visible chapter; task files still require their existing permissions.
create or replace function public.workflow_scoped_resource_read(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.workflow_chapter_resources r where r.storage_path=p_path and public.workflow_can_view_cycle(r.workflow_id))
 or exists(select 1 from public.workflow_task_resources r where r.storage_path=p_path and public.workflow_can_view_required_inputs(r.task_id))
$$;
drop policy if exists workflow_v305_file_scope on storage.objects;
create policy workflow_v305_file_scope on storage.objects as restrictive for select to authenticated using(bucket_id<>'teryaq-workflow' or public.workflow_scoped_resource_read(name));
-- Every definer-based reader validates scope as well as RLS. Preserve exact return shapes.
do $wrap$
declare row record; backup text; args text; callargs text; result text; body text; gate text; rec record;
begin
 for row in select * from (values
 ('workflow_people','course'),('workflow_directory','course'),('workflow_team_tasks','course'),
 ('workflow_task_collaboration','task'),('workflow_task_submission_history','task'),('workflow_required_inputs','task')) v(fn,kind) loop
  backup:=row.fn||'_pre305';
  select p.* into rec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=row.fn and p.pronargs=1;
  if rec.oid is null then raise exception 'Missing prerequisite function: %',row.fn;end if;
  args:=pg_get_function_arguments(rec.oid);result:=pg_get_function_result(rec.oid);callargs:=quote_ident(rec.proargnames[1]);
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=backup) then
   execute format('alter function public.%I(uuid) rename to %I',row.fn,backup);
  end if;
  gate:=case row.kind when 'course' then 'public.workflow_can_view_course('||callargs||')' else 'public.workflow_can_view_task('||callargs||')' end;
  body:='begin if not coalesce('||gate||',false) then raise exception ''Course/chapter access required'' using errcode=''42501''; end if; '||case when rec.proretset then 'return query select * from ' else 'return ' end||format('public.%I(%s); end',backup,callargs);
  if row.fn='workflow_team_tasks' then body:='begin if not coalesce('||gate||',false) then raise exception ''Course access required'' using errcode=''42501'';end if;return query select q.* from public.workflow_team_tasks_pre305('||callargs||') q where public.workflow_can_view_cycle(q.workflow_id);end';end if;
  execute format('create or replace function public.%I(%s) returns %s language plpgsql stable security definer set search_path=public as %L',row.fn,args,result,body);
  execute format('revoke all on function public.%I(uuid) from public,anon,authenticated',backup);
  execute format('grant execute on function public.%I(uuid) to service_role',backup);
  execute format('revoke all on function public.%I(uuid) from public,anon',row.fn);
  execute format('grant execute on function public.%I(uuid) to authenticated',row.fn);
 end loop;
end $wrap$;
create or replace function public.workflow_set_ai_handoff(
  p_task uuid,
  p_enabled boolean,
  p_prompt text,
  p_expected_output text,
  p_notes text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  t public.workflow_tasks%rowtype;
  w public.course_workflows%rowtype;
begin
  select * into t from public.workflow_tasks where id=p_task;
  if not found then raise exception 'Task not found'; end if;
  if public.workflow_ai_task_spec(t.task_key,t.stage) is null then raise exception 'AI Hand Off is limited to the yellow AI tasks in the approved workflow'; end if;
  select * into w from public.course_workflows where id=t.workflow_id;
  if not public.workflow_is_ai_lead(w.course_id) then
    raise exception 'AI Lead access required to configure AI Hand Off';
  end if;

  update public.workflow_tasks
  set ai_handoff_enabled=coalesce(p_enabled,false),
      ai_prompt=nullif(trim(coalesce(p_prompt,'')),''),
      ai_expected_output=nullif(trim(coalesce(p_expected_output,'')),''),
      ai_handoff_notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=p_task;

  insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
  values(p_task,t.workflow_id,auth.uid(),'ai_handoff_updated',jsonb_build_object('enabled',coalesce(p_enabled,false)));
end
$$;

revoke all on function public.workflow_set_ai_handoff(uuid,boolean,text,text,text) from public;
grant execute on function public.workflow_set_ai_handoff(uuid,boolean,text,text,text) to authenticated;

create or replace function public.qf_submission_context(p_course uuid,p_chapter uuid,p_form text,p_round text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w public.course_workflows%rowtype;t public.workflow_tasks%rowtype;person public.profiles%rowtype;key text;dest text;stage_label text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 key:=case p_form when 'qf-review' then case p_round when '1' then 'qf-review-r1' when '2' then 'qf-review-r2' end when 'qf-comprehensive-audit' then 'qf-audit' when 'qf-final-outputs' then 'qf-final-qc' end;
 if key is null then raise exception 'Choose Review Round 1 or 2';end if;
 select * into w from public.course_workflows where course_id=p_course and chapter_id=p_chapter order by cycle desc limit 1;
 select * into t from public.workflow_tasks where workflow_id=w.id and task_key=key;
 if t.id is null then raise exception 'Start the chapter and apply the Questions & Flashcards update first';end if;
 if not(public.workflow_task_is_executor(t.id,auth.uid()) or public.workflow_can_manage_stage(w.course_id,t.stage)) then raise exception 'Task executor or course management access required' using errcode='42501';end if;
 if p_form='qf-review' then
  select p.* into person from public.workflow_chapter_roles r join public.profiles p on p.id=r.user_id where r.workflow_id=w.id and r.role='scientific_author';
  if person.id is null then raise exception 'Assign the chapter Scientific Draft Author first';end if;
 else select * into person from public.profiles where id=auth.uid();end if;
 dest:=case key when 'qf-review-r1' then 'qf-generate-v2' when 'qf-audit' then 'qf-review-r2' when 'qf-review-r2' then 'qf-generate-v3' when 'qf-final-qc' then 'qf-publish' end;
 stage_label:=case key when 'qf-review-r1' then 'Review — Round 1' when 'qf-review-r2' then 'Review — Round 2' when 'qf-audit' then 'Comprehensive Audit' else 'Final Outputs' end;
 return jsonb_build_object('task',public.workflow_task_payload(t),'workflow',to_jsonb(w),'person',jsonb_build_object('id',person.id,'name',person.display_name,'memberCode',coalesce(person.member_code,''),'label',coalesce(person.display_name,'')||case when nullif(person.member_code,'') is null then '' else ' — '||person.member_code end),'round',p_round,'stage',stage_label,'destination',dest,'destinationLabel',(select title from public.workflow_tasks where workflow_id=w.id and task_key=dest));
end $$;
revoke all on function public.qf_submission_context(uuid,uuid,text,text) from public,anon;grant execute on function public.qf_submission_context(uuid,uuid,text,text) to authenticated;

-- Renamed implementations are internal, never alternate public API routes.
do $$declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%_v3_0_3' or p.proname like '%_pre305') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);end loop;end$$;
revoke all on function public.workflow_task_payload(public.workflow_tasks) from public,anon,authenticated;
revoke all on function public.workflow_is_ai_lead(uuid),public.workflow_can_view_cycle(uuid),public.workflow_can_view_course(uuid),public.workflow_can_view_task(uuid),public.workflow_visible_tasks(),public.workflow_scoped_resource_read(text) from public,anon;
grant execute on function public.workflow_is_ai_lead(uuid),public.workflow_can_view_cycle(uuid),public.workflow_can_view_course(uuid),public.workflow_can_view_task(uuid),public.workflow_visible_tasks(),public.workflow_scoped_resource_read(text) to authenticated;

-- Download access follows the exact resolved input files, not obsolete task names.
create or replace function public.workflow_submission_file_visible(p_path text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare submission_id text;package public.content_submissions%rowtype;target record;inputs jsonb;
begin
 if auth.uid() is null then return false;end if;
 if public.is_admin() then return true;end if;
 submission_id:=(storage.foldername(p_path))[2];
 if submission_id is null or submission_id !~ '^[0-9a-fA-F-]{36}$' then return false;end if;
 select * into package from public.content_submissions where id::text=submission_id and deleted_at is null;
 if not found or split_part(p_path,'/',1)<>package.owner_id::text then return false;end if;
 if package.owner_id=auth.uid() then return true;end if;
 if package.status<>'submitted' then return false;end if;
 if package.workflow_task_id is not null and exists(select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id where t.id=package.workflow_task_id and (public.workflow_task_is_executor(t.id,auth.uid()) or public.workflow_can_manage_stage(w.course_id,t.stage))) then return true;end if;
 for target in select t.id from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id where w.course_id=package.course_id and w.chapter_id=package.chapter_id and public.workflow_can_view_cycle(w.id) and public.workflow_can_view_required_inputs(t.id) loop
  inputs:=public.workflow_required_inputs_pre305(target.id);
  if exists(select 1 from jsonb_path_query(coalesce(inputs,'[]'::jsonb),'$.**.storage_path') path where path#>>'{}'=p_path) then return true;end if;
 end loop;
 return false;
end$$;
revoke all on function public.workflow_submission_file_visible(text) from public,anon;
grant execute on function public.workflow_submission_file_visible(text) to authenticated;
drop policy if exists workflow_storage_v305_inputs on storage.objects;
create policy workflow_storage_v305_inputs on storage.objects for select to authenticated using(bucket_id='teryaq-submissions' and public.workflow_submission_file_visible(name));
drop policy if exists workflow_storage_v305_scope on storage.objects;
create policy workflow_storage_v305_scope on storage.objects as restrictive for select to authenticated using(bucket_id<>'teryaq-submissions' or public.workflow_submission_file_visible(name));

notify pgrst,'reload schema';

-- 039_submission_task_linking.sql
-- v3.0.5: native forms and Course Progress share the same task binding.
-- Installation does not submit/approve old work. Existing packages are linked explicitly in the UI.
create or replace function public.workflow_user_can_submit(p_task uuid,p_user uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select p_user is not null and exists(select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id where t.id=p_task and (
 public.workflow_task_is_executor(t.id,p_user) or public.is_admin(p_user) or exists(select 1 from public.course_management_roles r where r.course_id=w.course_id and r.user_id=p_user and (r.role='course_lead' or r.role=public.workflow_role_for_stage(t.stage)))))
$$;
create or replace function public.workflow_submission_context(p_course uuid,p_chapter uuid,p_form text,p_version text default null,p_task uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare w public.course_workflows%rowtype;t public.workflow_tasks%rowtype;cfg public.submission_form_configs%rowtype;person public.profiles%rowtype;ids uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into cfg from public.submission_form_configs where id=p_form and active;
 if not found then raise exception 'Submission form is unavailable';end if;
 if p_task is not null then
  select * into t from public.workflow_tasks where id=p_task;
  select * into w from public.course_workflows where id=t.workflow_id;
  if t.id is null then raise exception 'The linked task is unavailable';end if;
  if w.course_id is distinct from p_course then raise exception 'Course does not match the linked task';end if;
  if w.chapter_id is distinct from p_chapter then raise exception 'Chapter does not match the linked task';end if;
  if t.template_id is distinct from cfg.template_id then raise exception 'Form/template does not match the linked task';end if;
  if t.expected_version is not null and t.expected_version is distinct from p_version then raise exception 'Version does not match the linked task: expected %',t.expected_version;end if;
 else
  select * into w from public.course_workflows where course_id=p_course and chapter_id=p_chapter order by cycle desc limit 1;
  if w.id is null then raise exception 'Start this chapter from Courses before submitting';end if;
  select array_agg(id) into ids from public.workflow_tasks x where x.workflow_id=w.id and x.template_id=cfg.template_id and (x.expected_version is null or x.expected_version=p_version) and public.workflow_user_can_submit(x.id,auth.uid());
  if coalesce(cardinality(ids),0)=0 then raise exception 'No assigned task matches this form and version in the chapter';end if;
  if cardinality(ids)>1 then raise exception 'More than one task matches this form; open Submit Work from the intended task';end if;
  select * into t from public.workflow_tasks where id=ids[1];
 end if;
 if not public.workflow_user_can_submit(t.id,auth.uid()) then raise exception 'Task executor or responsible course manager access required' using errcode='42501';end if;
 if t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task is not open for submission: %',t.status;end if;
 if exists(select 1 from unnest(t.depends_on) d where not exists(select 1 from public.workflow_tasks prev where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then raise exception 'Approve prerequisite tasks before uploading or submitting';end if;
 if t.template_id='scientific-draft-text' then select p.* into person from public.workflow_chapter_roles r join public.profiles p on p.id=r.user_id where r.workflow_id=w.id and r.role='scientific_author';end if;
 if person.id is null then select * into person from public.profiles where id=auth.uid();end if;
 return jsonb_build_object('task',public.workflow_task_payload(t),'workflow',to_jsonb(w),'person',jsonb_build_object('id',person.id,'name',person.display_name,'memberCode',coalesce(person.member_code,''),'label',coalesce(person.display_name,'')||case when nullif(person.member_code,'') is null then '' else ' — '||person.member_code end),'category',(select category_id from public.content_subjects where id=w.course_id));
end $$;
create or replace function public.workflow_bind_directory_submission() returns trigger
language plpgsql security definer set search_path=public as $$declare ctx jsonb;begin
 if new.form_id in ('qf-review','qf-comprehensive-audit','qf-final-outputs') then return new;end if;
 if tg_op='UPDATE' and old.status='submitted' then return new;end if;
 if new.workflow_task_id is null then
  ctx:=public.workflow_submission_context(new.course_id,new.chapter_id,new.form_id,new.version_label,null);
  new.workflow_task_id:=(ctx#>>'{task,id}')::uuid;
 end if;
 return new;
end$$;
drop trigger if exists aa_bind_directory_submission on public.content_submissions;
create trigger aa_bind_directory_submission before insert or update on public.content_submissions for each row execute function public.workflow_bind_directory_submission();
create or replace function public.workflow_submission_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;w public.course_workflows%rowtype;cfg jsonb;field jsonb;entry jsonb;shown boolean;author uuid;linking boolean:=false;
begin
 if tg_op='UPDATE' then
  linking:=old.status='submitted' and old.workflow_task_id is null and new.workflow_task_id is not null;
  if new.workflow_task_id is distinct from old.workflow_task_id and not linking then raise exception 'Task link cannot change; discard the pending form to choose another task';end if;
  if old.status='submitted' and not linking then
   if new.deleted_at is distinct from old.deleted_at and exists(select 1 from public.workflow_tasks where id=old.workflow_task_id and status in ('in_review','approved')) then raise exception 'A submission linked to an active or approved review cannot be moved to Trash';end if;
   return new;
  end if;
 end if;
 if new.workflow_task_id is null then raise exception 'Choose the matching task before submission';end if;
 select * into t from public.workflow_tasks where id=new.workflow_task_id for update;
 if not found then raise exception 'Unknown workflow task';end if;
 if t.stage='Questions & Flashcards' and new.form_id in ('qf-review','qf-comprehensive-audit','qf-final-outputs') then return new;end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_user_can_submit(t.id,new.owner_id) then raise exception 'Submission owner is not a task executor or responsible course manager' using errcode='42501';end if;
 if auth.uid() is distinct from new.owner_id and not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'You cannot submit work for this account' using errcode='42501';end if;
 if new.course_id is distinct from w.course_id then raise exception 'Course does not match task';end if;
 if new.chapter_id is distinct from w.chapter_id then raise exception 'Chapter does not match task';end if;
 if new.category_id is distinct from (select category_id from public.content_subjects where id=w.course_id) then raise exception 'Category does not match task course';end if;
 if new.template_id is distinct from t.template_id then raise exception 'Form/template does not match task';end if;
 if t.expected_version is not null and new.version_label is distinct from t.expected_version then raise exception 'Version does not match task: expected %',t.expected_version;end if;
 if t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task is not open for submission: %',t.status;end if;
 if exists(select 1 from unnest(t.depends_on) d where not exists(select 1 from public.workflow_tasks prev where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then raise exception 'Approve prerequisite tasks before uploading or submitting';end if;
 new.workflow_stage:=t.stage;
 if new.status='submitted' then
  if t.template_id='scientific-draft-text' then
   select user_id into author from public.workflow_chapter_roles where workflow_id=w.id and role='scientific_author';
   if author is not null and new.answers->>'writer' is distinct from author::text then raise exception 'Writer does not match the chapter Scientific Draft Author';end if;
  end if;
  if nullif(new.answers->>'writer','') is not null and not exists(select 1 from public.profiles where id::text=new.answers->>'writer') then raise exception 'Select the writer from central user records';end if;
  select configuration into cfg from public.submission_form_configs where id=new.form_id and template_id=t.template_id and active;
  if cfg is null then raise exception 'Submission form is unavailable';end if;
  for field in select f from jsonb_array_elements(cfg->'sections') sec cross join lateral jsonb_array_elements(sec->'fields') f loop
   shown:=field->'showWhen' is null or new.answers->>(field#>>'{showWhen,field}')=field#>>'{showWhen,equals}';
   if not coalesce(shown,false) or field->>'type'='info' then continue;end if;
   if field->>'type'='file' then
    if coalesce((field->>'required')::boolean,false) and not exists(select 1 from jsonb_array_elements(new.files) x where x->>'fieldId'=field->>'id') then raise exception 'Required output missing: %',field->>'label';end if;
   elsif coalesce((field->>'required')::boolean,false) and (nullif(new.answers->>(field->>'id'),'') is null or (field->>'type'='checkbox' and new.answers->>(field->>'id')<>'true')) then raise exception 'Required field missing: %',field->>'label';end if;
  end loop;
  for entry in select value from jsonb_array_elements(new.files) loop
   if coalesce(entry->>'path','') not like new.owner_id::text||'/'||new.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='teryaq-submissions' and name=entry->>'path') then raise exception 'Uploaded file is missing or belongs to a different submission';end if;
  end loop;
 end if;
 return new;
end $$;
create or replace function public.workflow_submission_finished() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;w public.course_workflows%rowtype;recipient uuid;
begin
 if new.workflow_task_id is null or new.status<>'submitted' then return new;end if;
 if tg_op='UPDATE' and old.status='submitted' and old.workflow_task_id is not null then return new;end if;
 select * into t from public.workflow_tasks where id=new.workflow_task_id for update;
 if not public.workflow_user_can_submit(t.id,new.owner_id) then raise exception 'Task submission access required' using errcode='42501';end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 update public.workflow_tasks set submitted_id=new.id,status='in_review' where id=t.id;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details) values(t.id,t.workflow_id,auth.uid(),'submission',jsonb_build_object('submission_id',new.id,'version',new.version_label,'linked_existing',tg_op='UPDATE' and old.status='submitted'));
 for recipient in select r.user_id from public.course_management_roles r where r.course_id=w.course_id and (r.role='course_lead' or r.role=public.workflow_role_for_stage(t.stage)) loop insert into public.workflow_notifications(recipient_id,task_id,title,body) values(recipient,t.id,'Review requested',t.title);end loop;
 return new;
end $$;
create or replace function public.qf_guard_submission() returns trigger language plpgsql security definer set search_path=public as $$
declare ctx jsonb;t public.workflow_tasks%rowtype;cfg jsonb;field jsonb;entry jsonb;visible boolean;missing text;key text;
begin
 if new.form_id not in ('qf-review','qf-comprehensive-audit','qf-final-outputs') then return new;end if;
 if tg_op='UPDATE' and old.status='submitted' then if new.review_round is distinct from old.review_round or new.workflow_stage is distinct from old.workflow_stage or new.destination_task_key is distinct from old.destination_task_key or new.workflow_task_id is distinct from old.workflow_task_id then raise exception 'A submitted package cannot change its round or stage';end if;return new;end if;
 ctx:=public.qf_submission_context(new.course_id,new.chapter_id,new.form_id,new.answers->>'reviewRound');
 select * into t from public.workflow_tasks where id=(ctx#>>'{task,id}')::uuid for update;
 if new.template_id is distinct from t.template_id then raise exception 'Form type does not match its workflow task';end if;
 if new.workflow_task_id is not null and new.workflow_task_id<>t.id then raise exception 'Form or review round does not match its task';end if;
 if t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task is not open for submission';end if;
 if exists(select 1 from unnest(t.depends_on) d where not exists(select 1 from public.workflow_tasks prev where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then raise exception 'Approve prerequisite tasks before uploading or submitting';end if;
 if tg_op='UPDATE' and old.workflow_task_id is distinct from t.id then raise exception 'Discard the current form before changing its round or task';end if;
 if not(public.workflow_user_can_submit(t.id,new.owner_id)) then raise exception 'Task executor or responsible course manager access required' using errcode='42501';end if;
 new.category_id:=(select category_id from public.content_subjects where id=new.course_id);new.workflow_task_id:=t.id;new.workflow_stage:=t.stage;new.review_round:=case when new.form_id='qf-review' then new.answers->>'reviewRound' else null end;new.destination_task_key:=ctx->>'destination';
 new.answers:=new.answers||jsonb_build_object('course',new.course_id::text,'chapter',new.chapter_id::text,'category',new.category_id::text,'version',new.version_label,'stage',ctx->>'stage','destination',ctx->>'destinationLabel','writer',ctx#>>'{person,id}','memberCode',ctx#>>'{person,memberCode}','inputVersion',case when new.form_id='qf-comprehensive-audit' then '2' else null end);
 if new.status='submitted' then
  select configuration into cfg from public.submission_form_configs where id=new.form_id;
  for field in select f from jsonb_array_elements(cfg->'sections') s cross join lateral jsonb_array_elements(s->'fields') f loop
   visible:=field->'showWhen' is null or new.answers->>(field#>>'{showWhen,field}')=field#>>'{showWhen,equals}';
   if not coalesce(visible,false) or field->>'type'='info' then continue;end if;
   if field->>'type'='file' then
    if coalesce((field->>'required')::boolean,false) and not exists(select 1 from jsonb_array_elements(new.files) x where x->>'fieldId'=field->>'id') then raise exception 'Required output missing: %',field->>'label';end if;
   elsif coalesce((field->>'required')::boolean,false) and (nullif(new.answers->>(field->>'id'),'') is null or (field->>'type'='checkbox' and new.answers->>(field->>'id')<>'true')) then raise exception 'Required field missing: %',field->>'label';end if;
  end loop;
  for entry in select value from jsonb_array_elements(new.files) loop
   if coalesce(entry->>'path','') not like new.owner_id::text||'/'||new.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='teryaq-submissions' and name=entry->>'path') then raise exception 'Uploaded file is missing or does not belong to this submission';end if;
  end loop;
 end if;
 return new;
end $$;

create or replace function public.workflow_unlinked_submissions(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$declare t public.workflow_tasks%rowtype;w public.course_workflows%rowtype;begin
 if not public.workflow_can_view_task(p_task) then raise exception 'Task access required' using errcode='42501';end if;
 select * into t from public.workflow_tasks where id=p_task;select * into w from public.course_workflows where id=t.workflow_id;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'submitted_at',s.submitted_at,'version_label',s.version_label,'owner_name',coalesce(p.display_name,p.email)) order by s.submitted_at desc),'[]'::jsonb) from public.content_submissions s join public.profiles p on p.id=s.owner_id where s.workflow_task_id is null and s.status='submitted' and s.deleted_at is null and s.course_id=w.course_id and s.chapter_id=w.chapter_id and s.template_id=t.template_id and (t.expected_version is null or s.version_label=t.expected_version) and (s.form_id<>'qf-review' or s.answers->>'reviewRound'=case t.task_key when 'qf-review-r1' then '1' when 'qf-review-r2' then '2' end) and public.workflow_user_can_submit(p_task,s.owner_id) and (s.owner_id=auth.uid() or public.workflow_can_manage_stage(w.course_id,t.stage)));
end$$;
create or replace function public.workflow_link_submission(p_task uuid,p_submission uuid) returns void
language plpgsql security definer set search_path=public as $$declare s public.content_submissions%rowtype;begin
 if not exists(select 1 from jsonb_array_elements(public.workflow_unlinked_submissions(p_task)) x where x->>'id'=p_submission::text) then raise exception 'No eligible matching submission is available for this task';end if;
 select * into s from public.content_submissions where id=p_submission for update;
 if s.workflow_task_id is not null then raise exception 'Submission has already been linked';end if;
 if s.form_id in ('qf-review','qf-comprehensive-audit','qf-final-outputs') then
  perform public.qf_submission_context(s.course_id,s.chapter_id,s.form_id,s.answers->>'reviewRound');
  if exists(select 1 from public.workflow_tasks t cross join unnest(t.depends_on) d where t.id=p_task and not exists(select 1 from public.workflow_tasks prev where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then raise exception 'Approve prerequisite tasks before linking';end if;
 else perform public.workflow_submission_context(s.course_id,s.chapter_id,s.form_id,s.version_label,p_task);end if;
 update public.content_submissions set workflow_task_id=p_task where id=p_submission;
end$$;
revoke all on function public.workflow_bind_directory_submission(),public.workflow_submission_guard(),public.workflow_submission_finished() from public,anon,authenticated;
revoke all on function public.workflow_user_can_submit(uuid,uuid) from public,anon,authenticated;
revoke all on function public.workflow_submission_context(uuid,uuid,text,text,uuid),public.workflow_unlinked_submissions(uuid),public.workflow_link_submission(uuid,uuid) from public,anon;
grant execute on function public.workflow_submission_context(uuid,uuid,text,text,uuid),public.workflow_unlinked_submissions(uuid),public.workflow_link_submission(uuid,uuid) to authenticated;
create or replace function public.validate_content_submission() returns trigger language plpgsql
set search_path=public as $$
begin
  -- Sole identity change allowed on an archived package is its first validated task link.
  if tg_op='UPDATE' and old.status='submitted' and old.workflow_task_id is null and new.workflow_task_id is not null
     and (to_jsonb(new)-'workflow_task_id')=(to_jsonb(old)-'workflow_task_id') then
    if not public.workflow_can_view_task(new.workflow_task_id) or not (old.owner_id=auth.uid() or exists(select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id where t.id=new.workflow_task_id and public.workflow_can_manage_stage(w.course_id,t.stage))) then
      raise exception 'Task link access required' using errcode='42501';
    end if;
    return new;
  end if;
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
notify pgrst,'reload schema';

-- 040_role_teams_task_codes_checklists.sql
-- v3.0.6: stable codes, chapter role teams and full checklist editing.
create sequence if not exists public.workflow_task_code_seq;
alter table public.workflow_tasks add column if not exists task_code text;
create or replace function public.workflow_assign_task_code() returns trigger language plpgsql security definer set search_path=public as $$begin
 if tg_op='UPDATE' and old.task_code is not null then new.task_code:=old.task_code;
 else new.task_code:='TSK-'||lpad(nextval('public.workflow_task_code_seq')::text,6,'0');end if;return new;end$$;
-- lpad must never truncate codes beyond 999999.
create or replace function public.workflow_assign_task_code() returns trigger language plpgsql security definer set search_path=public as $$declare n text;begin
 if tg_op='UPDATE' and old.task_code is not null then new.task_code:=old.task_code;
 else n:=nextval('public.workflow_task_code_seq')::text;new.task_code:='TSK-'||lpad(n,greatest(6,length(n)),'0');end if;return new;end$$;
drop trigger if exists workflow_task_code on public.workflow_tasks;
create trigger workflow_task_code before insert or update of task_code on public.workflow_tasks for each row execute function public.workflow_assign_task_code();
update public.workflow_tasks set task_code=task_code where task_code is null and id is not null;
alter table public.workflow_tasks alter column task_code set not null;
create unique index if not exists workflow_task_code_unique on public.workflow_tasks(task_code);
grant select(task_code) on public.workflow_tasks to authenticated;
revoke all on sequence public.workflow_task_code_seq from public,anon,authenticated;

create or replace function public.workflow_required_role(p_key text,p_stage text) returns text language sql immutable set search_path=public as $$select case
 when p_key in ('scope','sources','timeline','roles','qf-source') then 'shared_team'
 when p_key in ('draft-v1','draft-v2','draft-v3','draft-v4','draft-v5','author-review','qf-review-r1','qf-review-r2','script-scientific-review') then 'scientific_author'
 when public.workflow_ai_task_spec(p_key,p_stage) is not null or p_key in ('qf-blueprint','qf-generate-v1','qf-generate-v2','qf-audit','qf-generate-v3','qf-final-qc') then 'ai_team'
 when p_key in ('responsible-review','design-v1','design-v2') then case when p_key like 'design-%' then 'designer' else 'scientific_lead' end
 when p_key='script-lead-review' then 'script_lead'
 when p_key in ('script-read','presenter-revision','script-voice-version') then 'presenter'
 when p_stage='Shooting Script' then 'script_writer'
 when p_stage='Editing' then 'montage_team' else 'task_executor' end$$;
revoke all on function public.workflow_required_role(text,text) from public;
grant execute on function public.workflow_required_role(text,text) to authenticated;
create table if not exists public.workflow_role_assignments(
 workflow_id uuid not null references public.course_workflows(id) on delete cascade,
 stage text not null,role text not null,user_id uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id),assigned_at timestamptz not null default now(),
 primary key(workflow_id,stage,role,user_id));
alter table public.workflow_role_assignments enable row level security;
revoke all on public.workflow_role_assignments from public,anon,authenticated;
grant select on public.workflow_role_assignments to authenticated;
drop policy if exists role_assignments_read on public.workflow_role_assignments;
create policy role_assignments_read on public.workflow_role_assignments for select to authenticated using(public.workflow_can_view_cycle(workflow_id));
-- Legacy author assignments remain supported until a role team is explicitly saved.

create or replace function public.workflow_set_role_team(p_workflow uuid,p_stage text,p_role text,p_users uuid[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare w public.course_workflows%rowtype;t public.workflow_tasks%rowtype;uid uuid;target_ids uuid[];changed integer:=0;locked integer:=0;
begin
 select * into w from public.course_workflows where id=p_workflow for update;
 if auth.uid() is null or w.id is null or not public.workflow_can_manage_stage(w.course_id,p_stage) then raise exception 'Responsible course management access required' using errcode='42501';end if;
 if p_role not in ('scientific_author','script_writer','ai_team','shared_team','designer','presenter','montage_team') then raise exception 'Unsupported assignment role';end if;
 -- A scientific lead cannot assign other stages through the author shortcut.
 select array_agg(id) into target_ids from public.workflow_tasks where workflow_id=w.id and (stage=p_stage or (p_role='scientific_author' and p_stage='Scientific Draft')) and public.workflow_required_role(task_key,stage)=p_role;
 if coalesce(cardinality(target_ids),0)=0 then raise exception 'No tasks match this role in this work area';end if;
 if coalesce(cardinality(p_users),0)>200 then raise exception 'Too many executors';end if;
 if exists(select 1 from unnest(coalesce(p_users,'{}'::uuid[])) x where not exists(select 1 from public.profiles where id=x and role<>'disabled')) then raise exception 'Choose approved central user accounts';end if;
 delete from public.workflow_role_assignments where workflow_id=w.id and stage=p_stage and role=p_role;
 foreach uid in array coalesce(p_users,'{}'::uuid[]) loop
 insert into public.workflow_role_assignments(workflow_id,stage,role,user_id,assigned_by) values(w.id,p_stage,p_role,uid,auth.uid()) on conflict do nothing;end loop;
 for t in select * from public.workflow_tasks where id=any(target_ids) for update loop
 if t.status in ('approved','in_review') then locked:=locked+1;continue;end if;
 if t.stage=p_stage then perform public.workflow_set_task_executors(t.id,p_users,false);
 else
 -- The chapter's scientific authors also handle their scientific review tasks in Script and QF.
 delete from public.workflow_task_executors where task_id=t.id;
 foreach uid in array coalesce(p_users,'{}'::uuid[]) loop insert into public.workflow_task_executors(task_id,user_id,assigned_by) values(t.id,uid,auth.uid()) on conflict do nothing;end loop;
 update public.workflow_tasks set assignment_mode='users',owner_id=(select user_id from public.workflow_task_executors where task_id=t.id order by user_id limit 1) where id=t.id;
 end if;changed:=changed+1;
 end loop;
 insert into public.workflow_events(workflow_id,actor_id,action,details) values(w.id,auth.uid(),'role_team_updated',jsonb_build_object('stage',p_stage,'role',p_role,'changed',changed,'locked',locked));
 return jsonb_build_object('changed',changed,'locked',locked);
end$$;
revoke all on function public.workflow_set_role_team(uuid,text,text,uuid[]) from public;
grant execute on function public.workflow_set_role_team(uuid,text,text,uuid[]) to authenticated;

create or replace function public.workflow_update_checklist(p_instruction uuid,p_title text,p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare src public.workflow_task_instructions%rowtype;t public.workflow_tasks%rowtype;c uuid;target record;
begin
 select * into src from public.workflow_task_instructions where id=p_instruction and kind='checklist' for update;
 select * into t from public.workflow_tasks where id=src.task_id;
 select course_id into c from public.course_workflows where id=t.workflow_id;
 if auth.uid() is null or src.id is null or not public.workflow_can_manage_stage(c,t.stage) then raise exception 'Course management access required' using errcode='42501';end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Checklist items must be an array';end if;
 if jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Add 1 to 200 checklist items';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where nullif(btrim(x->>'id'),'') is null or length(x->>'id')>100 or nullif(btrim(x->>'label'),'') is null or length(x->>'label')>1000) or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_items) x) then raise exception 'Every item needs a unique ID and a label of 1–1000 characters';end if;
 if length(coalesce(p_title,''))>200 then raise exception 'Checklist title is too long';end if;
 for target in select i.id from public.workflow_task_instructions i join public.workflow_tasks tt on tt.id=i.task_id join public.course_workflows w on w.id=tt.workflow_id
 where i.id=src.id or (src.scope='similar_tasks' and src.scope_group is not null and i.scope_group=src.scope_group and i.kind='checklist' and w.course_id=c and tt.task_key=t.task_key) for update of i loop
 update public.workflow_task_instructions set title=p_title,content=jsonb_build_object('items',p_items) where id=target.id;
 end loop;
 -- Retained item IDs preserve their per-executor completion state. New IDs start unchecked.
 insert into public.workflow_events(workflow_id,task_id,actor_id,action,details) values(t.workflow_id,t.id,auth.uid(),'checklist_updated',jsonb_build_object('instruction',src.id,'scope',src.scope));
end$$;
revoke all on function public.workflow_update_checklist(uuid,text,jsonb) from public;
grant execute on function public.workflow_update_checklist(uuid,text,jsonb) to authenticated;

create or replace function public.workflow_submission_context(p_course uuid,p_chapter uuid,p_form text,p_version text default null,p_task uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare w public.course_workflows%rowtype;t public.workflow_tasks%rowtype;cfg public.submission_form_configs%rowtype;person public.profiles%rowtype;ids uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into cfg from public.submission_form_configs where id=p_form and active;
 if not found then raise exception 'Submission form is unavailable';end if;
 if p_task is not null then
  select * into t from public.workflow_tasks where id=p_task;
  select * into w from public.course_workflows where id=t.workflow_id;
  if t.id is null then raise exception 'The linked task is unavailable';end if;
  if w.course_id is distinct from p_course then raise exception 'Course does not match the linked task';end if;
  if w.chapter_id is distinct from p_chapter then raise exception 'Chapter does not match the linked task';end if;
  if t.template_id is distinct from cfg.template_id then raise exception 'Form/template does not match the linked task';end if;
  if t.expected_version is not null and t.expected_version is distinct from p_version then raise exception 'Version does not match the linked task: expected %',t.expected_version;end if;
 else
  select * into w from public.course_workflows where course_id=p_course and chapter_id=p_chapter order by cycle desc limit 1;
  if w.id is null then raise exception 'Start this chapter from Courses before submitting';end if;
  select array_agg(id) into ids from public.workflow_tasks x where x.workflow_id=w.id and x.template_id=cfg.template_id and (x.expected_version is null or x.expected_version=p_version) and public.workflow_user_can_submit(x.id,auth.uid());
  if coalesce(cardinality(ids),0)=0 then raise exception 'No assigned task matches this form and version in the chapter';end if;
  if cardinality(ids)>1 then raise exception 'More than one task matches this form; open Submit Work from the intended task';end if;
  select * into t from public.workflow_tasks where id=ids[1];
 end if;
 if not public.workflow_user_can_submit(t.id,auth.uid()) then raise exception 'Task executor or responsible course manager access required' using errcode='42501';end if;
 if t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task is not open for submission: %',t.status;end if;
 if exists(select 1 from unnest(t.depends_on) d where not exists(select 1 from public.workflow_tasks prev where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then raise exception 'Approve prerequisite tasks before uploading or submitting';end if;
 if t.template_id='scientific-draft-text' then select p.* into person from public.workflow_chapter_roles r join public.profiles p on p.id=r.user_id where r.workflow_id=w.id and r.role='scientific_author';end if;
 if exists(select 1 from public.workflow_role_assignments r where r.workflow_id=w.id and r.role='scientific_author') then
   select p.* into person from public.profiles p where p.id=auth.uid();
  end if;
  if person.id is null then select * into person from public.profiles where id=auth.uid();end if;
 return jsonb_build_object('task',public.workflow_task_payload(t),'workflow',to_jsonb(w),'person',jsonb_build_object('id',person.id,'name',person.display_name,'memberCode',coalesce(person.member_code,''),'label',coalesce(person.display_name,'')||case when nullif(person.member_code,'') is null then '' else ' — '||person.member_code end),'category',(select category_id from public.content_subjects where id=w.course_id));
end $$;

create or replace function public.qf_submission_context(p_course uuid,p_chapter uuid,p_form text,p_round text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w public.course_workflows%rowtype;t public.workflow_tasks%rowtype;person public.profiles%rowtype;key text;dest text;stage_label text;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 key:=case p_form when 'qf-review' then case p_round when '1' then 'qf-review-r1' when '2' then 'qf-review-r2' end when 'qf-comprehensive-audit' then 'qf-audit' when 'qf-final-outputs' then 'qf-final-qc' end;
 if key is null then raise exception 'Choose Review Round 1 or 2';end if;
 select * into w from public.course_workflows where course_id=p_course and chapter_id=p_chapter order by cycle desc limit 1;
 select * into t from public.workflow_tasks where workflow_id=w.id and task_key=key;
 if t.id is null then raise exception 'Start the chapter and apply the Questions & Flashcards update first';end if;
 if not(public.workflow_task_is_executor(t.id,auth.uid()) or public.workflow_can_manage_stage(w.course_id,t.stage)) then raise exception 'Task executor or course management access required' using errcode='42501';end if;
 if p_form='qf-review' then
  select p.* into person from public.workflow_chapter_roles r join public.profiles p on p.id=r.user_id where r.workflow_id=w.id and r.role='scientific_author';
  if exists(select 1 from public.workflow_role_assignments r where r.workflow_id=w.id and r.role='scientific_author') then select * into person from public.profiles where id=auth.uid();end if; if person.id is null then raise exception 'Assign the chapter Scientific Draft Author first';end if;
 else select * into person from public.profiles where id=auth.uid();end if;
 dest:=case key when 'qf-review-r1' then 'qf-generate-v2' when 'qf-audit' then 'qf-review-r2' when 'qf-review-r2' then 'qf-generate-v3' when 'qf-final-qc' then 'qf-publish' end;
 stage_label:=case key when 'qf-review-r1' then 'Review — Round 1' when 'qf-review-r2' then 'Review — Round 2' when 'qf-audit' then 'Comprehensive Audit' else 'Final Outputs' end;
 return jsonb_build_object('task',public.workflow_task_payload(t),'workflow',to_jsonb(w),'person',jsonb_build_object('id',person.id,'name',person.display_name,'memberCode',coalesce(person.member_code,''),'label',coalesce(person.display_name,'')||case when nullif(person.member_code,'') is null then '' else ' — '||person.member_code end),'round',p_round,'stage',stage_label,'destination',dest,'destinationLabel',(select title from public.workflow_tasks where workflow_id=w.id and task_key=dest));
end $$;

create or replace function public.workflow_submission_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;w public.course_workflows%rowtype;cfg jsonb;field jsonb;entry jsonb;shown boolean;author uuid;linking boolean:=false;
begin
 if tg_op='UPDATE' then
  linking:=old.status='submitted' and old.workflow_task_id is null and new.workflow_task_id is not null;
  if new.workflow_task_id is distinct from old.workflow_task_id and not linking then raise exception 'Task link cannot change; discard the pending form to choose another task';end if;
  if old.status='submitted' and not linking then
   if new.deleted_at is distinct from old.deleted_at and exists(select 1 from public.workflow_tasks where id=old.workflow_task_id and status in ('in_review','approved')) then raise exception 'A submission linked to an active or approved review cannot be moved to Trash';end if;
   return new;
  end if;
 end if;
 if new.workflow_task_id is null then raise exception 'Choose the matching task before submission';end if;
 select * into t from public.workflow_tasks where id=new.workflow_task_id for update;
 if not found then raise exception 'Unknown workflow task';end if;
 if t.stage='Questions & Flashcards' and new.form_id in ('qf-review','qf-comprehensive-audit','qf-final-outputs') then return new;end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_user_can_submit(t.id,new.owner_id) then raise exception 'Submission owner is not a task executor or responsible course manager' using errcode='42501';end if;
 if auth.uid() is distinct from new.owner_id and not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'You cannot submit work for this account' using errcode='42501';end if;
 if new.course_id is distinct from w.course_id then raise exception 'Course does not match task';end if;
 if new.chapter_id is distinct from w.chapter_id then raise exception 'Chapter does not match task';end if;
 if new.category_id is distinct from (select category_id from public.content_subjects where id=w.course_id) then raise exception 'Category does not match task course';end if;
 if new.template_id is distinct from t.template_id then raise exception 'Form/template does not match task';end if;
 if t.expected_version is not null and new.version_label is distinct from t.expected_version then raise exception 'Version does not match task: expected %',t.expected_version;end if;
 if t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task is not open for submission: %',t.status;end if;
 if exists(select 1 from unnest(t.depends_on) d where not exists(select 1 from public.workflow_tasks prev where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then raise exception 'Approve prerequisite tasks before uploading or submitting';end if;
 new.workflow_stage:=t.stage;
 if new.status='submitted' then
  if t.template_id='scientific-draft-text' then
   select user_id into author from public.workflow_chapter_roles where workflow_id=w.id and role='scientific_author';
   if exists(select 1 from public.workflow_role_assignments r where r.workflow_id=w.id and r.role='scientific_author') then
    if new.answers->>'writer' is distinct from new.owner_id::text then raise exception 'Writer must match the submitting central account';end if;
   elsif author is not null and new.answers->>'writer' is distinct from author::text then raise exception 'Writer does not match the chapter Scientific Draft Author';end if;
  end if;
  if nullif(new.answers->>'writer','') is not null and not exists(select 1 from public.profiles where id::text=new.answers->>'writer') then raise exception 'Select the writer from central user records';end if;
  select configuration into cfg from public.submission_form_configs where id=new.form_id and template_id=t.template_id and active;
  if cfg is null then raise exception 'Submission form is unavailable';end if;
  for field in select f from jsonb_array_elements(cfg->'sections') sec cross join lateral jsonb_array_elements(sec->'fields') f loop
   shown:=field->'showWhen' is null or new.answers->>(field#>>'{showWhen,field}')=field#>>'{showWhen,equals}';
   if not coalesce(shown,false) or field->>'type'='info' then continue;end if;
   if field->>'type'='file' then
    if coalesce((field->>'required')::boolean,false) and not exists(select 1 from jsonb_array_elements(new.files) x where x->>'fieldId'=field->>'id') then raise exception 'Required output missing: %',field->>'label';end if;
   elsif coalesce((field->>'required')::boolean,false) and (nullif(new.answers->>(field->>'id'),'') is null or (field->>'type'='checkbox' and new.answers->>(field->>'id')<>'true')) then raise exception 'Required field missing: %',field->>'label';end if;
  end loop;
  for entry in select value from jsonb_array_elements(new.files) loop
   if coalesce(entry->>'path','') not like new.owner_id::text||'/'||new.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='teryaq-submissions' and name=entry->>'path') then raise exception 'Uploaded file is missing or belongs to a different submission';end if;
  end loop;
 end if;
 return new;
end $$;

notify pgrst,'reload schema';

-- 041_security_review.sql
-- v3.0.6: tighten existing RPC, account validation and rich resource boundaries.
create or replace function public.account_is_active(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select p_user is not null and exists(select 1 from public.profiles where id=p_user and role in ('user','admin'))$$;
revoke all on function public.account_is_active(uuid) from public,anon;
grant execute on function public.account_is_active(uuid) to authenticated,service_role;
revoke create on schema public from public,anon,authenticated;
-- Client access requires a central profile with an approved role.
do $$declare r record;begin
for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
 execute format('drop policy if exists v306_active_account on public.%I',r.relname);
 execute format('create policy v306_active_account on public.%I as restrictive for all to authenticated using(public.account_is_active()) with check(public.account_is_active())',r.relname);
end loop;end$$;
drop policy if exists v306_active_account on storage.objects;
create policy v306_active_account on storage.objects as restrictive for all to authenticated using(public.account_is_active()) with check(public.account_is_active());
create or replace function public.workflow_add_comment(p_task uuid,p_body text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare newid uuid;begin
 if auth.uid() is null or not public.account_is_active() or not public.workflow_can_view_task(p_task) then raise exception 'Task access required' using errcode='42501';end if;
 if length(btrim(coalesce(p_body,''))) not between 1 and 10000 then raise exception 'Comment must contain 1 to 10000 characters';end if;
 insert into public.workflow_task_comments(task_id,author_id,body) values(p_task,auth.uid(),btrim(p_body)) returning id into newid;return newid;end$$;
create or replace function public.workflow_toggle_check(p_instruction uuid,p_item text,p_checked boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare tid uuid;begin
 select task_id into tid from public.workflow_task_instructions where id=p_instruction and kind='checklist';
 if not public.account_is_active() or tid is null or not public.workflow_task_is_executor(tid,auth.uid()) then raise exception 'Task executor access required' using errcode='42501';end if;
 if not exists(select 1 from public.workflow_task_instructions i cross join jsonb_array_elements(coalesce(i.content->'items','[]'::jsonb)) x where i.id=p_instruction and x->>'id'=p_item) then raise exception 'Checklist item not found';end if;
 insert into public.workflow_task_check_state(instruction_id,item_id,checked_by,checked,updated_at) values(p_instruction,p_item,auth.uid(),p_checked,now()) on conflict(instruction_id,item_id,checked_by) do update set checked=excluded.checked,updated_at=now();end$$;
create or replace function public.workflow_validate_resource_url() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.url is not null and new.url !~* '^https?://[^[:space:]]+$' then raise exception 'Resource links must use http or https';end if;return new;end$$;
drop trigger if exists v306_resource_url on public.workflow_task_resources;
create trigger v306_resource_url before insert or update of url on public.workflow_task_resources for each row execute function public.workflow_validate_resource_url();
drop trigger if exists v306_resource_url on public.workflow_chapter_resources;
create trigger v306_resource_url before insert or update of url on public.workflow_chapter_resources for each row execute function public.workflow_validate_resource_url();
CREATE OR REPLACE FUNCTION public.workflow_can_view_cycle(p_workflow uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select public.account_is_active(auth.uid()) and (auth.uid() is not null and (public.is_admin() or exists(
 select 1 from public.course_workflows w where w.id=p_workflow and (
 exists(select 1 from public.course_management_roles r where r.course_id=w.course_id and r.user_id=auth.uid())
 or exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and public.workflow_task_is_executor(t.id,auth.uid()))))))
$function$
;
CREATE OR REPLACE FUNCTION public.workflow_can_manage_stage(p_course uuid, p_stage text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select public.account_is_active(auth.uid()) and (public.is_admin() or exists(
   select 1 from public.course_management_roles r
   where r.course_id=p_course and r.user_id=auth.uid()
     and (r.role='course_lead' or r.role=public.workflow_role_for_stage(p_stage))
 ))
$function$
;
CREATE OR REPLACE FUNCTION public.workflow_task_is_executor(p_task uuid, p_user uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select public.account_is_active(p_user) and (exists(select 1 from public.workflow_task_executors e where e.task_id=p_task and e.user_id=p_user)
 or exists(
   select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id
   where t.id=p_task and t.assignment_mode='course_team' and (
     exists(select 1 from public.course_management_roles r where r.course_id=w.course_id and r.user_id=p_user)
     or exists(select 1 from public.workflow_chapter_roles cr join public.course_workflows cw on cw.id=cr.workflow_id where cw.course_id=w.course_id and cr.user_id=p_user)
     or exists(select 1 from public.workflow_task_executors e2 join public.workflow_tasks t2 on t2.id=e2.task_id join public.course_workflows w2 on w2.id=t2.workflow_id where w2.course_id=w.course_id and e2.user_id=p_user)
   )
 ))
$function$
;
CREATE OR REPLACE FUNCTION public.workflow_is_ai_lead(p_course uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select public.account_is_active(auth.uid()) and (auth.uid() is not null and exists(select 1 from public.course_management_roles where course_id=p_course and user_id=auth.uid() and role='ai_lead'))
$function$
;
create or replace function public.workflow_set_chapter_role(p_workflow uuid,p_role text,p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare w public.course_workflows%rowtype; tid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into w from public.course_workflows where id=p_workflow;
 if not found or not public.workflow_can_manage_stage(w.course_id,'Scientific Draft') then raise exception 'Scientific workflow management access required' using errcode='42501'; end if;
 if p_role<>'scientific_author' then raise exception 'Unknown chapter role'; end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Unknown user'; end if;
 insert into public.workflow_chapter_roles(workflow_id,role,user_id,assigned_by)
 values(p_workflow,p_role,p_user,auth.uid())
 on conflict(workflow_id,role) do update set user_id=excluded.user_id,assigned_by=excluded.assigned_by,assigned_at=now();
 -- One assignment at chapter level automatically follows the scientific drafting/update tasks.
 for tid in select id from public.workflow_tasks where workflow_id=p_workflow and task_key in ('draft-v1','draft-v2','draft-v3','draft-v4','draft-v5') and status not in ('approved','in_review') loop
   insert into public.workflow_task_executors(task_id,user_id,assigned_by) values(tid,p_user,auth.uid()) on conflict do nothing;
   update public.workflow_tasks set owner_id=p_user,author_id=p_user where id=tid and assignment_mode='users';
 end loop;
end $$;

do $$declare r record;was_authenticated boolean;begin
for r in select p.oid,p.oid::regprocedure sig,p.prorettype,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
 was_authenticated:=has_function_privilege('authenticated',r.oid,'EXECUTE');
 execute format('alter function %s set search_path to public,pg_temp',r.sig);
 execute format('revoke all on function %s from public,anon',r.sig);
 if r.prorettype='pg_catalog.trigger'::regtype then execute format('revoke all on function %s from authenticated',r.sig);
 elsif was_authenticated then execute format('grant execute on function %s to authenticated',r.sig);end if;
end loop;end$$;
grant execute on function public.submit_account_request(text,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';

commit;
