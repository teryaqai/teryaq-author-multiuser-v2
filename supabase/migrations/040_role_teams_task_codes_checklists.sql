-- v3.0.7: stable codes, chapter role teams and full checklist editing.
begin;
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
commit;
