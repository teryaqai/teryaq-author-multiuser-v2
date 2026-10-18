-- v3.0.5: scope Course Progress by assignment/leadership; AI Handoff only for AI Leads.
begin;
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
commit;
