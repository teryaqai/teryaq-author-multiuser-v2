-- v3.0.4 shared Questions & Flashcards workflow. Exact display numbers 1–10.
begin;
create or replace function public.qf_workflow_steps() returns jsonb language sql immutable as $$select $steps$[{"key": "qf-source", "number": "1", "title": "استلام المسودة العلمية النسخة 5، والملف المصمم", "stage": "Questions & Flashcards", "depends": ["draft-v5", "design-v2"], "required": true, "description": ""}, {"key": "qf-blueprint", "number": "2", "title": "مخطط التقييم والاسترجاع", "stage": "Questions & Flashcards", "depends": ["qf-source"], "required": true, "description": ""}, {"key": "qf-generate-v1", "number": "3", "title": "توليد الأسئلة والفلاش كاردز — نسخة 1", "stage": "Questions & Flashcards", "depends": ["qf-blueprint"], "required": true, "version": "1", "description": ""}, {"key": "qf-review-r1", "number": "4", "title": "مراجعة كاتب المسودة العلمية — الجولة الأولى", "stage": "Questions & Flashcards", "depends": ["qf-generate-v1"], "required": true, "template": "qf-review", "description": ""}, {"key": "qf-generate-v2", "number": "5", "title": "تعديل وتوليد الأسئلة والفلاش كاردز — نسخة 2", "stage": "Questions & Flashcards", "depends": ["qf-review-r1"], "required": true, "version": "2", "description": "يتضمن إنشاء وتعديل الصور وعرضها على كاتب المسودة"}, {"key": "qf-audit", "number": "6", "title": "تدقيق شامل", "stage": "Questions & Flashcards", "depends": ["qf-generate-v2"], "required": true, "template": "qf-comprehensive-audit", "description": ""}, {"key": "qf-review-r2", "number": "7", "title": "مراجعة كاتب المسودة العلمية — الجولة الثانية", "stage": "Questions & Flashcards", "depends": ["qf-audit"], "required": true, "template": "qf-review", "description": ""}, {"key": "qf-generate-v3", "number": "8", "title": "تعديل الأسئلة والفلاش كاردز — نسخة 3", "stage": "Questions & Flashcards", "depends": ["qf-review-r2"], "required": true, "version": "3", "description": "يتضمن إنشاء وتعديل الصور وعرضها على كاتب المسودة"}, {"key": "qf-final-qc", "number": "9", "title": "التدقيق النهائي للجودة والمعرفات والبيانات الوصفية", "stage": "Questions & Flashcards", "depends": ["qf-generate-v3"], "required": true, "template": "qf-final-outputs", "description": ""}, {"key": "qf-publish", "number": "10", "title": "رفع الصور وملفات (JSON) إلى الموقع", "stage": "Questions & Flashcards", "depends": ["qf-final-qc"], "required": true, "description": ""}]$steps$::jsonb$$;
update public.workflow_templates wt set steps=coalesce((select jsonb_agg(x) from jsonb_array_elements(wt.steps) x where x->>'stage'<>'Questions & Flashcards'),'[]'::jsonb)||public.qf_workflow_steps(),updated_at=now() where id in ('standard-course','standard-v1');
update public.course_workflows w set template_snapshot=coalesce((select jsonb_agg(x) from jsonb_array_elements(w.template_snapshot) x where x->>'stage'<>'Questions & Flashcards'),'[]'::jsonb)||public.qf_workflow_steps();
insert into public.workflow_tasks(workflow_id,task_key,title,description,stage,sort_order,display_number,depends_on,required,template_id,expected_version)
select w.id,s->>'key',s->>'title',s->>'description',s->>'stage',100+n::integer,s->>'number',array(select jsonb_array_elements_text(s->'depends')),true,s->>'template',s->>'version' from public.course_workflows w cross join jsonb_array_elements(public.qf_workflow_steps()) with ordinality x(s,n) on conflict(workflow_id,task_key) do nothing;
create or replace function public.workflow_role_for_stage(p_stage text) returns text language sql immutable as $$select case p_stage when 'Scientific Draft' then 'scientific_lead' when 'Shooting Script' then 'script_lead' when 'Questions' then 'ai_lead' when 'Flashcards' then 'ai_lead' when 'Questions & Flashcards' then 'ai_lead' when 'Shooting' then 'production_lead' when 'Editing' then 'post_production_lead' else null end$$;
-- The fixed scientific author also executes both scientific review rounds.
create or replace function public.qf_assign_review_author() returns trigger language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 if new.role<>'scientific_author' then return new;end if;
 for tid in select id from public.workflow_tasks where workflow_id=new.workflow_id and task_key in ('qf-review-r1','qf-review-r2') and status not in ('approved','in_review') loop
  delete from public.workflow_task_executors where task_id=tid;
  insert into public.workflow_task_executors(task_id,user_id,assigned_by) values(tid,new.user_id,new.assigned_by);
  update public.workflow_tasks set owner_id=new.user_id,author_id=new.user_id,assignment_mode='users' where id=tid;
 end loop;return new;
end $$;
drop trigger if exists qf_review_author on public.workflow_chapter_roles;
create trigger qf_review_author after insert or update on public.workflow_chapter_roles for each row execute function public.qf_assign_review_author();
update public.workflow_chapter_roles set user_id=user_id where role='scientific_author';
alter table public.content_submissions add column if not exists workflow_stage text,add column if not exists review_round text,add column if not exists destination_task_key text;
grant insert(workflow_stage,review_round,destination_task_key),update(workflow_stage,review_round,destination_task_key) on public.content_submissions to authenticated;
create table if not exists public.qf_audit_data(task_id uuid not null references public.workflow_tasks(id) on delete cascade,component text not null check(component in ('questions','flashcards')),input_version text not null default '2',structured_data jsonb not null,updated_by uuid references public.profiles(id),updated_at timestamptz not null default now(),primary key(task_id,component));
alter table public.qf_audit_data enable row level security;
drop policy if exists qf_audit_read on public.qf_audit_data;
create policy qf_audit_read on public.qf_audit_data for select to authenticated using(public.workflow_can_view_required_inputs(task_id));
grant select on public.qf_audit_data to authenticated;
grant all on public.qf_audit_data to service_role;
create or replace function public.qf_register_audit_data(p_task uuid,p_component text,p_data jsonb) returns void language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 select * into t from public.workflow_tasks where id=p_task;select * into w from public.course_workflows where id=t.workflow_id;
 if t.task_key is distinct from 'qf-audit' or not coalesce(public.workflow_task_is_executor(p_task,auth.uid()) or public.workflow_can_manage_stage(w.course_id,t.stage),false) then raise exception 'Audit task access required' using errcode='42501';end if;
 if t.status not in ('ready','in_progress','changes_requested') then raise exception 'Audit task is not open';end if;
 if p_component not in ('questions','flashcards') or jsonb_typeof(p_data) not in ('object','array') then raise exception 'Invalid structured audit data';end if;
 insert into public.qf_audit_data(task_id,component,structured_data,updated_by) values(p_task,p_component,p_data,auth.uid()) on conflict(task_id,component) do update set structured_data=excluded.structured_data,updated_by=excluded.updated_by,updated_at=now();
end $$;
revoke all on function public.qf_register_audit_data(uuid,text,jsonb) from public,anon;grant execute on function public.qf_register_audit_data(uuid,text,jsonb) to authenticated;
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
 return jsonb_build_object('task',to_jsonb(t),'workflow',to_jsonb(w),'person',jsonb_build_object('id',person.id,'name',person.display_name,'memberCode',coalesce(person.member_code,''),'label',coalesce(person.display_name,'')||case when nullif(person.member_code,'') is null then '' else ' — '||person.member_code end),'round',p_round,'stage',stage_label,'destination',dest,'destinationLabel',(select title from public.workflow_tasks where workflow_id=w.id and task_key=dest));
end $$;
revoke all on function public.qf_submission_context(uuid,uuid,text,text) from public,anon;grant execute on function public.qf_submission_context(uuid,uuid,text,text) to authenticated;
-- Server-enforced task/round/form association, permissions, required files and checklist.
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
 if not(public.workflow_task_is_executor(t.id,new.owner_id) or public.is_admin(new.owner_id)) then raise exception 'Only a task executor or admin may submit this task' using errcode='42501';end if;
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
drop trigger if exists qf_submission_guard on public.content_submissions;
create trigger qf_submission_guard before insert or update on public.content_submissions for each row execute function public.qf_guard_submission();
-- Original resolvers remain intact for every other work area.
do $$begin if to_regprocedure('public.workflow_required_inputs_v3_0_3(uuid)') is null then alter function public.workflow_required_inputs(uuid) rename to workflow_required_inputs_v3_0_3;end if;end$$;
create or replace function public.workflow_required_inputs(p_task uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;w public.course_workflows%rowtype;result jsonb:='[]';source record;sub public.content_submissions%rowtype;entry jsonb;note record;
begin
 select * into t from public.workflow_tasks where id=p_task;
 if t.stage is distinct from 'Questions & Flashcards' then return public.workflow_required_inputs_v3_0_3(p_task);end if;
 if not public.workflow_can_view_required_inputs(p_task) then return null;end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 for source in select task_key,approved_id,submitted_id,title from public.workflow_tasks where workflow_id=w.id and (task_key in ('draft-v5','design-v2') or task_key=any(t.depends_on) or (task_key in ('qf-review-r1','qf-review-r2') and approved_id is not null and sort_order<t.sort_order) or (task_key='qf-audit' and t.task_key in ('qf-review-r2','qf-generate-v3','qf-final-qc','qf-publish'))) loop
  select * into sub from public.content_submissions where id=coalesce(source.approved_id,source.submitted_id) and deleted_at is null;
  if sub.id is not null then
   for entry in select value from jsonb_array_elements(sub.files) loop
    if source.task_key in ('qf-review-r1','qf-review-r2') and source.task_key<>all(t.depends_on) and entry->>'fieldId'<>'updatedScientificSource' then continue;end if;
    result:=result||jsonb_build_array(jsonb_build_object('label',source.title||' — '||coalesce(entry->>'label',entry->>'name'),'kind','file','storage_path',entry->>'path','name',entry->>'name','available',true,'source','Auto-linked submission','source_task_key',source.task_key,'submission_id',sub.id,'round',sub.review_round));
   end loop;
  elsif source.task_key in ('draft-v5','design-v2') then result:=result||jsonb_build_array(jsonb_build_object('label',source.title,'kind','file','available',false,'source','Waiting for submission'));
  end if;
 end loop;
 for note in select e.note from public.workflow_evidence e join public.workflow_tasks predecessor on predecessor.id=e.task_id where predecessor.workflow_id=w.id and predecessor.task_key=any(t.depends_on) and e.note is not null loop result:=result||jsonb_build_array(jsonb_build_object('label','Previous task evidence','kind','text','available',true,'value',note.note));end loop;
 for source in select r.* from public.workflow_task_resources r join public.workflow_tasks prev on prev.id=r.task_id where prev.workflow_id=w.id and prev.task_key=any(t.depends_on) loop
 result:=result||jsonb_build_array(jsonb_build_object('label',source.label,'kind',source.kind,'storage_path',source.storage_path,'url',source.url,'value',source.value,'available',true,'name',case when source.storage_path is null then null else regexp_replace(source.storage_path,'^.*/','') end,'bucket','workflow','source','Previous Task Outputs'));end loop;
 return result;
end $$;
grant execute on function public.workflow_required_inputs(uuid) to authenticated;
create or replace function public.qf_review_input_data(p_task uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;sub public.content_submissions%rowtype;out jsonb;
begin
 select * into t from public.workflow_tasks where id=p_task;
 if t.task_key is distinct from 'qf-review-r2' or not public.workflow_can_view_required_inputs(p_task) then raise exception 'Round 2 input access required' using errcode='42501';end if;
 select s.* into sub from public.workflow_tasks a join public.content_submissions s on s.id=coalesce(a.approved_id,a.submitted_id) where a.workflow_id=t.workflow_id and a.task_key='qf-audit' and s.deleted_at is null;
 return jsonb_build_object('courseId',(select course_id from public.course_workflows where id=t.workflow_id),'chapterId',(select chapter_id from public.course_workflows where id=t.workflow_id),'auditSubmissionId',sub.id,'files',coalesce(sub.files,'[]'),'structuredAudit',coalesce((select jsonb_object_agg(d.component,d.structured_data) from public.qf_audit_data d join public.workflow_tasks a on a.id=d.task_id where a.workflow_id=t.workflow_id and a.task_key='qf-audit'),'{}'::jsonb));
end $$;
revoke all on function public.qf_review_input_data(uuid) from public,anon;grant execute on function public.qf_review_input_data(uuid) to authenticated;
do $$begin if to_regprocedure('public.workflow_ai_task_spec_v3_0_3(text,text)') is null then alter function public.workflow_ai_task_spec(text,text) rename to workflow_ai_task_spec_v3_0_3;end if;end$$;
create or replace function public.workflow_ai_task_spec(p_key text,p_stage text) returns jsonb language sql immutable as $$select case when p_stage='Questions & Flashcards' then (select value from jsonb_array_elements(public.qf_workflow_steps()) where value->>'key'=p_key and p_key in ('qf-blueprint','qf-generate-v1','qf-generate-v2','qf-audit','qf-generate-v3','qf-final-qc'))||jsonb_build_object('prompt','Complete the named Questions & Flashcards task using approved scientific sources, prior outputs and review findings. Preserve IDs and metadata. For versions 2 and 3, create or revise visuals and show them to the Scientific Draft Author.','output','Task outputs and evidence following the native submission form, when assigned.') else public.workflow_ai_task_spec_v3_0_3(p_key,p_stage) end$$;
update public.workflow_tasks set ai_handoff_enabled=true where stage='Questions & Flashcards' and task_key in ('qf-blueprint','qf-generate-v1','qf-generate-v2','qf-audit','qf-generate-v3','qf-final-qc');
create or replace function public.workflow_people(p_course uuid)
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path=public as $$
 select distinct p.id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' — '||p.member_code end,
   p.avatar_path
 from public.profiles p where
   exists(select 1 from public.course_management_roles r where r.course_id=p_course and r.user_id=p.id)
   or exists(select 1 from public.workflow_chapter_roles cr join public.course_workflows w on w.id=cr.workflow_id where w.course_id=p_course and cr.user_id=p.id)
   or exists(select 1 from public.workflow_task_executors e join public.workflow_tasks t on t.id=e.task_id join public.course_workflows w on w.id=t.workflow_id where w.course_id=p_course and e.user_id=p.id)
 order by 2
$$;
create or replace function public.workflow_directory(p_course uuid)
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path=public as $$
 select p.id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' — '||p.member_code end,
   p.avatar_path
 from public.profiles p
 where p.role <> 'disabled'
 order by 2
$$;
create or replace function public.workflow_task_collaboration(p_task uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select jsonb_build_object(
    'executors',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),p.email)))
      from public.workflow_task_executors e join public.profiles p on p.id=e.user_id where e.task_id=p_task),'[]'::jsonb),
    'instructions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'title',i.title,'content',i.content,'sort_order',i.sort_order,'scope',i.scope) order by i.sort_order,i.created_at)
      from public.workflow_task_instructions i where i.task_id=p_task),'[]'::jsonb),
    'checkState',coalesce((select jsonb_object_agg(s.instruction_id::text||':'||s.item_id,s.checked)
      from public.workflow_task_check_state s where s.checked_by=auth.uid() and exists(select 1 from public.workflow_task_instructions i where i.id=s.instruction_id and i.task_id=p_task)),'{}'::jsonb),
    'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'author_id',c.author_id,'author_name',coalesce(nullif(p.display_name,''),p.email),'body',c.body,'created_at',c.created_at,'edited_at',c.edited_at) order by c.created_at desc)
      from public.workflow_task_comments c join public.profiles p on p.id=c.author_id where c.task_id=p_task),'[]'::jsonb)
  ) into result;
  return result;
end $$;
create or replace function public.workflow_accounts() returns table(id uuid,name text,active boolean) language plpgsql stable security definer set search_path=public as $$begin if auth.uid() is null then raise exception 'Sign in required';end if;return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' — '||p.member_code end,true from public.profiles p order by 2;end$$;
create or replace function public.workflow_add_task_resource_v2(
  p_task uuid,p_label text,p_kind text,p_path text default null,p_url text default null,p_value text default null,
  p_required boolean default true,p_parent uuid default null,p_scope text default 'task',p_description text default null,p_icon text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; rid uuid; g uuid:=gen_random_uuid(); target record; parent_group uuid; target_parent uuid; ord integer;
begin
  select * into t from public.workflow_tasks where id=p_task; if not found then raise exception 'Unknown task'; end if;
  select * into w from public.course_workflows where id=t.workflow_id;
  if not public.workflow_can_manage_stage(w.course_id,t.stage) and not (t.stage='Questions & Flashcards' and t.task_key in ('qf-blueprint','qf-generate-v1','qf-generate-v2','qf-generate-v3') and public.workflow_task_is_executor(t.id,auth.uid()) and t.status in ('ready','in_progress','changes_requested') and p_scope='task' and p_parent is null) then raise exception 'Course management access required' using errcode='42501'; end if;
  if not public.workflow_can_manage_stage(w.course_id,t.stage) and (p_kind not in ('file','image','text','link') or (p_path is not null and (p_path not like w.id::text||'/tasks/'||t.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='teryaq-workflow' and name=p_path)))) then raise exception 'Output must belong to this task';end if;
  if p_kind not in ('file','image','link','text','folder') then raise exception 'Unknown resource type'; end if;
  if p_scope not in ('task','course_task') then p_scope:='task'; end if;
  if p_parent is not null then select sync_group into parent_group from public.workflow_task_resources where id=p_parent and task_id=p_task; end if;
  select coalesce(max(sort_order),0)+1 into ord from public.workflow_task_resources where task_id=p_task and parent_resource_id is not distinct from p_parent;
  insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by,parent_resource_id,sort_order,scope,description,icon_key,sync_group)
  values(p_task,p_label,p_kind,p_path,p_url,p_value,p_required,auth.uid(),p_parent,ord,p_scope,p_description,p_icon,g) returning id into rid;

  if p_scope='course_task' then
    for target in
      select tt.id task_id
      from public.workflow_tasks tt join public.course_workflows ww on ww.id=tt.workflow_id
      where ww.course_id=w.course_id and tt.task_key=t.task_key and tt.id<>p_task
    loop
      target_parent:=null;
      if parent_group is not null then
        select r.id into target_parent from public.workflow_task_resources r where r.task_id=target.task_id and r.sync_group=parent_group limit 1;
      end if;
      select coalesce(max(sort_order),0)+1 into ord from public.workflow_task_resources where task_id=target.task_id and parent_resource_id is not distinct from target_parent;
      insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by,parent_resource_id,sort_order,scope,description,icon_key,sync_group)
      values(target.task_id,p_label,p_kind,p_path,p_url,p_value,p_required,auth.uid(),target_parent,ord,'course_task',p_description,p_icon,g)
      on conflict do nothing;
    end loop;
  end if;
  return rid;
end $$;
-- Reuse native task file attachments for AI generation outputs; no extra Forms.
drop policy if exists qf_output_upload on storage.objects;
create policy qf_output_upload on storage.objects for insert to authenticated with check(bucket_id='teryaq-workflow' and exists(select 1 from public.workflow_tasks t where t.workflow_id::text=(storage.foldername(name))[1] and t.id::text=(storage.foldername(name))[3] and t.stage='Questions & Flashcards' and t.task_key in ('qf-blueprint','qf-generate-v1','qf-generate-v2','qf-generate-v3') and t.status in ('ready','in_progress','changes_requested') and public.workflow_task_is_executor(t.id,auth.uid())));
drop policy if exists qf_output_update on storage.objects;
create policy qf_output_update on storage.objects for update to authenticated using(bucket_id='teryaq-workflow' and owner_id=auth.uid()::text and exists(select 1 from public.workflow_tasks t where t.id::text=(storage.foldername(name))[3] and t.stage='Questions & Flashcards' and t.status in ('ready','in_progress','changes_requested') and public.workflow_task_is_executor(t.id,auth.uid()))) with check(bucket_id='teryaq-workflow' and owner_id=auth.uid()::text and exists(select 1 from public.workflow_tasks t where t.id::text=(storage.foldername(name))[3] and t.stage='Questions & Flashcards' and t.status in ('ready','in_progress','changes_requested') and public.workflow_task_is_executor(t.id,auth.uid())));

create or replace function public.workflow_submission_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 if tg_op='UPDATE' and new.workflow_task_id is distinct from old.workflow_task_id then raise exception 'Task link cannot change'; end if;
 if new.workflow_task_id is null then return new; end if;
 select * into t from public.workflow_tasks where id=new.workflow_task_id for update;
 if not found then raise exception 'Unknown workflow task'; end if;
 if t.stage='Questions & Flashcards' and new.form_id in ('qf-review','qf-comprehensive-audit','qf-final-outputs') then return new;end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if tg_op='UPDATE' and new.deleted_at is distinct from old.deleted_at and t.status in ('in_review','approved') then
   raise exception 'A submission linked to an active or approved review cannot be moved to Trash'; end if;
 if t.author_id is null or t.owner_id is distinct from new.owner_id or t.template_id is distinct from new.template_id or w.course_id is distinct from new.course_id
    or w.chapter_id is distinct from new.chapter_id or (t.expected_version is not null and t.expected_version is distinct from new.version_label)
    or new.category_id is distinct from (select category_id from public.content_subjects where id=w.course_id)
    or (new.status='submitted' and nullif(new.answers->>'writer','') is distinct from t.author_id::text) then
   raise exception 'Submission owner, category, course, chapter, template or version does not match assigned task';
 end if;
 if new.status='submitted' and (tg_op='INSERT' or old.status<>'submitted') then
   if t.reviewer_id is null or t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task needs a reviewer and an open state'; end if;
 end if;
 return new;
end $$;
-- Downstream executors can actually download their auto-linked files across owners.
do $$begin if to_regprocedure('public.workflow_submission_visible_to_user_v3_0_3(uuid)') is null then alter function public.workflow_submission_visible_to_user(uuid) rename to workflow_submission_visible_to_user_v3_0_3;end if;end$$;
create or replace function public.workflow_submission_visible_to_user(p_submission uuid) returns boolean language plpgsql stable security definer set search_path=public as $$
declare s public.content_submissions%rowtype; source_task public.workflow_tasks%rowtype;
begin
 if public.workflow_submission_visible_to_user_v3_0_3(p_submission) then return true;end if;
 select * into s from public.content_submissions where id=p_submission and status='submitted' and deleted_at is null;
 if s.workflow_task_id is null then return false;end if;
 select * into source_task from public.workflow_tasks where id=s.workflow_task_id;
 return exists(select 1 from public.workflow_tasks target where target.workflow_id=source_task.workflow_id and target.stage='Questions & Flashcards' and public.workflow_can_view_required_inputs(target.id) and (
 source_task.task_key in ('draft-v5','design-v2') or source_task.task_key=any(target.depends_on)
 or (source_task.task_key in ('qf-review-r1','qf-review-r2') and target.sort_order>source_task.sort_order)
 or (source_task.task_key='qf-audit' and target.task_key in ('qf-review-r2','qf-generate-v3','qf-final-qc','qf-publish'))));
end $$;
revoke all on function public.workflow_submission_visible_to_user(uuid) from public,anon;
grant execute on function public.workflow_submission_visible_to_user(uuid) to authenticated;
drop policy if exists workflow_storage_required_read on storage.objects;
create policy workflow_storage_required_read on storage.objects for select to authenticated using(bucket_id='teryaq-submissions' and array_length(storage.foldername(name),1)>=2 and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$' and public.workflow_submission_visible_to_user(((storage.foldername(name))[2])::uuid));

-- Apply the existing executor/lead model to new QF task output files only.
create or replace function public.qf_workflow_file_visible(p_path text) returns boolean language plpgsql stable security definer set search_path=public as $$
declare source_task public.workflow_tasks%rowtype;
begin
 select * into source_task from public.workflow_tasks where id::text=(storage.foldername(p_path))[3] and workflow_id::text=(storage.foldername(p_path))[1] and stage='Questions & Flashcards';
 if source_task.id is null then return true;end if;
 return public.workflow_can_view_required_inputs(source_task.id) or exists(select 1 from public.workflow_tasks target where target.workflow_id=source_task.workflow_id and target.stage='Questions & Flashcards' and target.sort_order>source_task.sort_order and public.workflow_can_view_required_inputs(target.id));
end $$;
revoke all on function public.qf_workflow_file_visible(text) from public,anon;
grant execute on function public.qf_workflow_file_visible(text) to authenticated;
drop policy if exists qf_workflow_output_read_guard on storage.objects;
create policy qf_workflow_output_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'teryaq-workflow' or public.qf_workflow_file_visible(name));

notify pgrst,'reload schema';
commit;
