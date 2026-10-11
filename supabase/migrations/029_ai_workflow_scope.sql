-- TERYAQ v3.0.0. Run after 028. Yellow AI tasks from the three approved diagrams.
-- Preserves existing task IDs, numeric labels, assignments, statuses and custom prompts.
-- Adds four unnumbered AI branches; does not change existing task prerequisites.
begin;

create or replace function public.workflow_ai_task_spec(p_key text,p_stage text) returns jsonb language sql immutable set search_path=public as $fn$
 select case when data->p_key->>'stage'=p_stage then data->p_key else null end from (select $catalog${"exam-preparation-ai": {"stage": "Scientific Draft", "title": "تحضير الاختبارات", "prompt": "Prepare university-specific examinations from the supplied course curriculum, past examinations and approved sources. Keep each university separate. Follow the supplied TERYAQ question rules. Flag missing sources or rules before producing questions.", "output": "Separate examination package for each university, in the required question format."}, "first-report": {"stage": "Scientific Draft", "title": "تقرير أول للمسودة العلمية", "prompt": "Review Scientific Draft Version 1 against the supplied requirements and sources. Produce the first scientific draft report; identify verifiable scientific, coverage and organization issues with precise locations.", "output": "First Scientific Draft Report — HTML."}, "simplified-audit": {"stage": "Scientific Draft", "title": "تدقيق مبسط", "prompt": "Perform the simplified audit of Scientific Draft Version 1, using the supplied text and illustrated drafts. Follow the provided audit checklist and record supported findings.", "output": "Simplified Audit — HTML."}, "figures": {"stage": "Scientific Draft", "title": "إعادة صنع الصور والأشكال والمخططات", "prompt": "Recreate the requested figures, shapes and diagrams using the supplied figure references and TERYAQ visual requirements. Preserve scientific accuracy, labels and figure codes. Flag missing source images.", "output": "Figures, Shapes & Diagrams recreation package — ZIP or RAR, following the submission requirements."}, "comprehensive-audit-1": {"stage": "Scientific Draft", "title": "تدقيق شامل 1", "prompt": "Perform Comprehensive Scientific Audit 1 of Scientific Draft Version 3 using all supplied inputs and completed earlier audit reports. Follow the provided TERYAQ audit rules, cite each finding precisely and flag unverified claims.", "output": "Comprehensive Scientific Audit 1 — HTML report."}, "draft-v4-close": {"stage": "Scientific Draft", "title": "إغلاق المسودة العلمية — نسخة 4", "prompt": "Check Scientific Draft Version 4 against the completed Comprehensive Audit 1 and the supplied closing checklist. Identify unresolved issues and report closure readiness. Leave final approval to the authorized human reviewer.", "output": "Version 4 closing review, unresolved issues and readiness report."}, "comprehensive-audit-2": {"stage": "Scientific Draft", "title": "تدقيق شامل 2", "prompt": "Perform Comprehensive Scientific Audit 2 of the designed file. Compare it with Scientific Draft Version 4 and the completed first audit, following the supplied audit rules. Include the human reviewers' notes only when provided.", "output": "Comprehensive Scientific Audit 2 — HTML report."}, "script-ai-audit": {"stage": "Shooting Script", "title": "تدقيق السكريبت من قبل فريق AI", "prompt": "Audit Shooting Script Version 1 against the supplied approved scientific draft and script rules. Report scientific, wording, pronunciation and presentation issues without inventing unsupported corrections.", "output": "AI script review report for Shooting Script Version 1."}, "script-change-summary-ai": {"stage": "Shooting Script", "title": "عمل ملخص التعديلات الصوتية", "prompt": "Compare the supplied voice version with the current written shooting script. Summarize the presenter's spoken changes with clear locations and terminology. Flag missing or unintelligible audio rather than guessing.", "output": "Summary of spoken script changes for the presenter and script team."}, "script-image-ai": {"stage": "Shooting Script", "title": "تعديل الصور للسكريبت", "prompt": "Modify only the requested images using the submitted image package and its instructions. Preserve scientific meaning and figure codes, and return the edited images with a change list.", "output": "Updated script image package and change list."}, "montage-image-ai": {"stage": "Editing", "title": "تعديل الصور", "prompt": "Modify the supplied montage images according to the image package and editor's instructions. Preserve scientific accuracy, image identifiers and the requested output dimensions.", "output": "Updated montage image package and change list."}}$catalog$::jsonb as data) c;
$fn$;
revoke all on function public.workflow_ai_task_spec(text,text) from public;
grant execute on function public.workflow_ai_task_spec(text,text) to authenticated;

create or replace function public.workflow_apply_ai_handoff_defaults()
returns trigger language plpgsql set search_path=public as $$
declare spec jsonb;
begin
 spec:=public.workflow_ai_task_spec(new.task_key,new.stage);
 if spec is null then new.ai_handoff_enabled:=false;return new;end if;
 if nullif(btrim(coalesce(new.ai_prompt,'')),'') is null then new.ai_prompt:=spec->>'prompt';end if;
 if nullif(btrim(coalesce(new.ai_expected_output,'')),'') is null then new.ai_expected_output:=spec->>'output';end if;
 if nullif(btrim(coalesce(new.ai_handoff_notes,'')),'') is null then new.ai_handoff_notes:=$notes$Follow the supplied task instructions and TERYAQ rules. List missing required inputs before proceeding; do not fabricate sources, files or results. Human approval remains required.$notes$;end if;
 if tg_op='INSERT' then new.ai_handoff_enabled:=true;end if;
 return new;
end $$;
drop trigger if exists workflow_ai_handoff_defaults on public.workflow_tasks;
create trigger workflow_ai_handoff_defaults before insert or update of task_key,stage,ai_handoff_enabled,ai_prompt,ai_expected_output,ai_handoff_notes on public.workflow_tasks for each row execute function public.workflow_apply_ai_handoff_defaults();

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

-- Insert unnumbered AI branches after their existing anchors in the template.
do $$
declare template record; step jsonb; branch jsonb; result jsonb; branches jsonb:=$branches$[{"key": "exam-preparation-ai", "after": "roles", "stage": "Scientific Draft", "depends": ["roles"], "title": "تحضير الاختبارات", "number": "AI", "required": true}, {"key": "script-ai-audit", "after": "script-v1", "stage": "Shooting Script", "depends": ["script-v1"], "title": "تدقيق السكريبت من قبل فريق AI", "number": "AI", "required": true}, {"key": "script-change-summary-ai", "after": "script-voice-version", "stage": "Shooting Script", "depends": ["script-voice-version"], "title": "عمل ملخص التعديلات الصوتية", "number": "AI", "required": true}, {"key": "script-image-ai", "after": "montage-images", "stage": "Shooting Script", "depends": ["montage-images"], "title": "تعديل الصور للسكريبت", "number": "AI", "required": true}]$branches$::jsonb;
begin
 for template in select id,steps from public.workflow_templates where id in ('standard-course','standard-v1') loop
  result:='[]'::jsonb;
  for step in select value from jsonb_array_elements(template.steps) loop
   if exists(select 1 from jsonb_array_elements(branches) b where b->>'key'=step->>'key') then continue;end if;
   result:=result||jsonb_build_array(step);
   for branch in select value from jsonb_array_elements(branches) where value->>'after'=step->>'key' loop
    result:=result||jsonb_build_array(branch-'after');
   end loop;
  end loop;
  update public.workflow_templates set steps=result,updated_at=now() where id=template.id;
 end loop;
end $$;

-- Only missing branch rows are inserted in existing chapter workflows.
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,status)
select w.id,s.value->>'key',s.value->>'title',s.value->>'stage',s.ordinality::integer,s.value->>'number',
 array(select jsonb_array_elements_text(s.value->'depends')),true,
 case when not exists(select 1 from jsonb_array_elements_text(s.value->'depends') d where not exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key=d.value and t.status='approved')) then 'ready' else 'planned' end
from public.course_workflows w cross join public.workflow_templates template
cross join lateral jsonb_array_elements(template.steps) with ordinality s(value,ordinality)
where template.id='standard-course' and s.value->>'key' in ('exam-preparation-ai','script-ai-audit','script-change-summary-ai','script-image-ai')
on conflict(workflow_id,task_key) do nothing;

update public.workflow_tasks t set sort_order=s.ordinality::integer
from public.workflow_templates template cross join lateral jsonb_array_elements(template.steps) with ordinality s(value,ordinality)
where template.id='standard-course' and t.task_key=s.value->>'key' and t.stage=s.value->>'stage';
update public.workflow_tasks set ai_handoff_enabled=(public.workflow_ai_task_spec(task_key,stage) is not null);

create or replace function public.workflow_required_inputs(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; result jsonb:='[]'::jsonb;
  src uuid; sub public.content_submissions%rowtype;
begin
 select * into t from public.workflow_tasks where id=p_task; if not found then return result; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_view_required_inputs(p_task) then return null; end if;

 result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',r.label,'kind',r.kind,'storage_path',r.storage_path,'url',r.url,'value',r.value,'available',case when r.kind='folder' then true else coalesce(nullif(r.storage_path,''),nullif(r.url,''),nullif(r.value,'')) is not null end,'required',r.required,'source','Added by course management') order by r.sort_order,r.created_at) from public.workflow_task_resources r where r.task_id=p_task),'[]'::jsonb);

 if t.task_key in ('draft-v1','exam-preparation-ai') then
   return result||coalesce((select jsonb_agg(jsonb_build_object('label',label,'kind',kind,'url',url,'storage_path',storage_path,'value',value,'available',coalesce(nullif(url,''),nullif(storage_path,''),nullif(value,'')) is not null,'required',true,'source','Preparation & Rules') order by resource_key)
     from public.workflow_chapter_resources where workflow_id=t.workflow_id and resource_key in ('curriculum_outlines','source_links','timeline','roles_distribution')),'[]'::jsonb);
 end if;

 if t.task_key in ('script-ai-audit','script-change-summary-ai','script-image-ai','montage-image-ai','draft-v4-close') then
   select id into src from public.workflow_tasks where workflow_id=t.workflow_id and task_key=case t.task_key when 'script-ai-audit' then 'script-v1' when 'script-change-summary-ai' then 'script-voice-version' when 'script-image-ai' then 'montage-images' when 'montage-image-ai' then 'montage-image-prep' else 'draft-v4' end;
   select * into sub from public.content_submissions where workflow_task_id=src and status='submitted' and deleted_at is null order by submitted_at desc limit 1;
   result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(f->>'label',f->>'fieldId'),'name',f->>'name','kind','file','storage_path',f->>'path','available',true,'required',true,'source','Upstream task submission','bucket','submission')) from jsonb_array_elements(coalesce(sub.files,'[]'::jsonb)) f),'[]'::jsonb);
   result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',r.label,'kind',r.kind,'storage_path',r.storage_path,'url',r.url,'value',r.value,'available',r.kind='folder' or coalesce(nullif(r.storage_path,''),nullif(r.url,''),nullif(r.value,'')) is not null,'required',r.required,'source','Upstream task resource','bucket','workflow')) from public.workflow_task_resources r where r.task_id=src),'[]'::jsonb);
   if jsonb_array_length(result)=0 then result:=jsonb_build_array(jsonb_build_object('label','Required upstream files have not been supplied yet','kind','file','available',false,'required',true,'source','Waiting for task inputs'));end if;
   return result;
 end if;

 if t.task_key in ('first-report','simplified-audit','figures') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v1');
 elsif t.task_key='draft-v2' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='first-report');
 elsif t.task_key in ('responsible-review','draft-v3') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v2');
 elsif t.task_key='comprehensive-audit-1' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v3');
 elsif t.task_key='draft-v4' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-1');
 elsif t.task_key='design-v1' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4');
 elsif t.task_key in ('comprehensive-audit-2','author-review') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='design-v1');
 elsif t.task_key='design-v2' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-2');
 elsif t.task_key='draft-v5' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-2');
 end if;

 if src is not null then select * into sub from public.content_submissions where workflow_task_id=src and status='submitted' and deleted_at is null order by submitted_at desc limit 1; end if;

 if t.task_key='first-report' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V1 — Text HTML'));
 elsif t.task_key='simplified-audit' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V1 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V1 — With Images HTML'));
 elsif t.task_key='figures' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V1 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'),public.workflow_pick_submission_file(sub.files,'drawio','Draw.io (if used)',false),public.workflow_pick_submission_file(sub.files,'originalImages','Original Images ZIP / RAR'));
 elsif t.task_key='draft-v2' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'firstReport','First Scientific Draft Report'),public.workflow_pick_submission_file(sub.files,'simplifiedAudit','Simplified Audit'),public.workflow_pick_submission_file(sub.files,'figuresRecreation','Figures, Shapes & Diagrams Recreation'));
 elsif t.task_key in ('responsible-review','draft-v3') then
   if sub.id is not null then result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(x->>'label',x->>'fieldId'),'kind','file','storage_path',x->>'path','available',true,'source','Scientific Draft Version 2')) from jsonb_array_elements(sub.files) x),'[]'::jsonb); end if;
 elsif t.task_key='comprehensive-audit-1' then
   if sub.id is not null then result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(x->>'label',x->>'fieldId'),'kind','file','storage_path',x->>'path','available',true,'source','Scientific Draft Version 3')) from jsonb_array_elements(sub.files) x),'[]'::jsonb); end if;
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v2') and s.version_label='2' and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedSimplifiedAudit','Completed Simplified Audit'),public.workflow_pick_submission_file(sub.files,'completedFirstReport','Completed First Scientific Draft Report'));
 elsif t.task_key='draft-v4' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit V1 Report'));
 elsif t.task_key='design-v1' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedComprehensiveAudit1','Completed Comprehensive Scientific Audit V1'),public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V4 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'),public.workflow_pick_submission_file(sub.files,'drawio','Draw.io (if used)',false),public.workflow_pick_submission_file(sub.files,'originalImages','Original Images ZIP / RAR'));
   if nullif(sub.answers->>'designNotes','') is not null then result:=result||jsonb_build_array(jsonb_build_object('label','Notes for Designer','kind','text','value',sub.answers->>'designNotes','available',true,'source','Scientific Draft V4 Submission')); end if;
 elsif t.task_key in ('comprehensive-audit-2','author-review') then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'designPdf','Designed Scientific Draft — PDF'),public.workflow_pick_submission_file(sub.files,'designHtml','Designed Scientific Draft — HTML'));
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4') and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedComprehensiveAudit1','Completed Comprehensive Scientific Audit V1'),public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V4 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'));
 elsif t.task_key='design-v2' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit 2 Report'));
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='design-v1') and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'designPdf','First Design — PDF'),public.workflow_pick_submission_file(sub.files,'designHtml','First Design — HTML'));
 elsif t.task_key='draft-v5' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit 2 Report'));
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4') and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'));
 end if;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
