-- TERYAQ Master Tool v2.9.0
-- AI HAND OFF configuration for workflow tasks.

alter table public.workflow_tasks add column if not exists ai_handoff_enabled boolean not null default false;
alter table public.workflow_tasks add column if not exists ai_prompt text;
alter table public.workflow_tasks add column if not exists ai_expected_output text;
alter table public.workflow_tasks add column if not exists ai_handoff_notes text;

create or replace function public.workflow_apply_ai_handoff_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.task_key='comprehensive-audit-1' and coalesce(new.ai_prompt,'')='' then
    new.ai_handoff_enabled:=true;
    new.ai_prompt:='Perform Comprehensive Scientific Audit 1 for this chapter using the attached required files. Follow the TERYAQ comprehensive scientific audit rules and the task instructions exactly. Treat the supplied draft and supplied supporting files as the authoritative task package. Do not invent missing facts. Produce only the required audit output in the requested structure.';
    new.ai_expected_output:='Comprehensive Scientific Audit Version 1 report in the format required by the task submission form.';
    new.ai_handoff_notes:='Use the latest auto-linked required files. Preserve task terminology and version context. If an item cannot be verified from the supplied package, flag it instead of guessing.';
  elsif new.task_key='comprehensive-audit-2' and coalesce(new.ai_prompt,'')='' then
    new.ai_handoff_enabled:=true;
    new.ai_prompt:='Perform Comprehensive Scientific Audit 2 using all files supplied in this AI HAND OFF package. Compare the designed draft and Scientific Draft Version 4 against the completed first comprehensive audit and the current task requirements. Do not introduce unsupported corrections or content. Return the required second comprehensive audit report.';
    new.ai_expected_output:='Comprehensive Scientific Audit Version 2 report in the format required by the task submission form.';
    new.ai_handoff_notes:='Use only the supplied current versions. Preserve traceability to the exact location of each issue.';
  elsif new.task_key='accuracy-review' and coalesce(new.ai_prompt,'')='' then
    new.ai_handoff_enabled:=true;
    new.ai_prompt:='Perform the 100% Accuracy Review for this chapter using the supplied design and Scientific Draft Version 4 files. Identify only defensible accuracy issues that must be carried into Comprehensive Scientific Audit Version 2. Do not rewrite the chapter and do not add unsupported content.';
    new.ai_expected_output:='100% Accuracy Review Notes as concise text ready to be included with Comprehensive Scientific Audit Version 2.';
    new.ai_handoff_notes:='Report each note with enough location context for the next task executor to act on it.';
  end if;
  return new;
end
$$;

drop trigger if exists workflow_ai_handoff_defaults on public.workflow_tasks;
create trigger workflow_ai_handoff_defaults
before insert or update of task_key on public.workflow_tasks
for each row execute function public.workflow_apply_ai_handoff_defaults();

-- Apply defaults to existing scientific workflow tasks.
update public.workflow_tasks
set task_key=task_key
where task_key in ('comprehensive-audit-1','comprehensive-audit-2','accuracy-review');

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
  select * into w from public.course_workflows where id=t.workflow_id;
  if not (public.is_admin() or public.workflow_can_manage_stage(w.course_id,t.stage) or public.workflow_is_course_lead(w.course_id)) then
    raise exception 'Not authorized to configure AI Hand Off';
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
