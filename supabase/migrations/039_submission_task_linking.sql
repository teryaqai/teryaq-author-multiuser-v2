-- v3.0.5: native forms and Course Progress share the same task binding.
-- Installation does not submit/approve old work. Existing packages are linked explicitly in the UI.
begin;
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
commit;
