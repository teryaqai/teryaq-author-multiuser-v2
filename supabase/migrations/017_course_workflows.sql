-- TERYAQ course workflows. Apply after 016. All transitions go through audited RPCs.
create table if not exists public.workflow_templates (
  id text primary key, title text not null, steps jsonb not null,
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
insert into public.workflow_templates(id,title,steps) values
('standard-course','Standard course workflow',
 '[
 {"key":"prepare","title":"Preparation and roles","stage":"Scientific Draft","depends":[],"required":true},
 {"key":"draft-v1","title":"Scientific draft · V1","stage":"Scientific Draft","depends":["prepare"],"template":"scientific-draft-text","version":"1","required":true},
 {"key":"first-report","title":"First review report","stage":"Scientific Draft","depends":["draft-v1"],"required":true},
 {"key":"simplified-audit","title":"Simplified audit","stage":"Scientific Draft","depends":["draft-v1"],"required":true},
 {"key":"figures","title":"Figures and diagrams","stage":"Scientific Draft","depends":["draft-v1"],"template":"scientific-draft-figures","version":"1","required":true},
 {"key":"draft-v2","title":"Scientific draft · V2","stage":"Scientific Draft","depends":["first-report","simplified-audit","figures"],"template":"scientific-draft-text","version":"2","required":true},
 {"key":"responsible-review","title":"Responsible review","stage":"Scientific Draft","depends":["draft-v2"],"required":true},
 {"key":"draft-v3","title":"Scientific draft · V3","stage":"Scientific Draft","depends":["responsible-review"],"template":"scientific-draft-text","version":"3","required":true},
 {"key":"comprehensive-audit","title":"Comprehensive scientific audit","stage":"Scientific Draft","depends":["draft-v3"],"required":true},
 {"key":"draft-v4","title":"Scientific draft · V4","stage":"Scientific Draft","depends":["comprehensive-audit"],"template":"scientific-draft-text","version":"4","required":true},
 {"key":"design-draft","title":"Designed draft","stage":"Scientific Draft","depends":["draft-v4"],"required":true},
 {"key":"second-audit","title":"Second audit","stage":"Scientific Draft","depends":["design-draft"],"required":true},
 {"key":"author-review","title":"Author review","stage":"Scientific Draft","depends":["design-draft"],"required":true},
 {"key":"draft-v5","title":"Scientific draft · V5","stage":"Scientific Draft","depends":["second-audit","author-review"],"template":"scientific-draft-text","version":"5","required":true},
 {"key":"draft-final","title":"Final designed draft approval","stage":"Scientific Draft","depends":["draft-v5"],"required":true},
 {"key":"script-read","title":"Read approved draft","stage":"Shooting Script","depends":["draft-final"],"required":true},
 {"key":"script-v1","title":"Script V1 and AI review","stage":"Shooting Script","depends":["script-read"],"template":"shooting-script","version":"1","required":true},
 {"key":"script-author","title":"Scientific author review","stage":"Shooting Script","depends":["script-v1"],"required":true},
 {"key":"script-v2","title":"Script V2","stage":"Shooting Script","depends":["script-author"],"template":"shooting-script","version":"2","required":true},
 {"key":"script-lead","title":"Script lead review","stage":"Shooting Script","depends":["script-v2"],"required":true},
 {"key":"script-v3","title":"Script V3","stage":"Shooting Script","depends":["script-lead"],"template":"shooting-script","version":"3","required":true},
 {"key":"presenter-trial","title":"Presenter trial and pronunciation review","stage":"Shooting Script","depends":["script-v3"],"required":true},
 {"key":"script-v4","title":"Script V4","stage":"Shooting Script","depends":["presenter-trial"],"template":"shooting-script","version":"4","required":true},
 {"key":"montage-script","title":"Montage script","stage":"Shooting Script","depends":["script-v4"],"required":true},
 {"key":"script-images","title":"Script images","stage":"Shooting Script","depends":["script-v4"],"required":true},
 {"key":"script-final","title":"Final script approval","stage":"Shooting Script","depends":["montage-script","script-images"],"required":true},
 {"key":"shooting","title":"Shooting","stage":"Shooting","depends":["script-final"],"required":true},
 {"key":"editing","title":"Editing","stage":"Editing","depends":["shooting"],"required":true},
 {"key":"questions","title":"Questions","stage":"Questions","depends":["draft-final"],"required":true},
 {"key":"flashcards","title":"Flashcards","stage":"Flashcards","depends":["draft-final"],"required":true},
 {"key":"social","title":"Social media","stage":"Social Media","depends":["editing"],"required":true},
 {"key":"publication","title":"Platform publication approval","stage":"Platform","depends":["editing","questions","flashcards","social"],"required":true}
 ]'::jsonb)
on conflict(id) do nothing;
insert into public.content_template_versions(template_id,version_label,sort_order) values
 ('shooting-script','3',3),('shooting-script','4',4),
 ('scientific-draft-text','5',5),('scientific-draft-figures','5',5)
on conflict do nothing;

create table if not exists public.course_workflows (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.content_subjects(id),
 chapter_id uuid not null references public.content_chapters(id), cycle integer not null default 1,
 template_snapshot jsonb not null, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), unique(chapter_id,cycle)
);
create table if not exists public.course_leads (
 course_id uuid not null references public.content_subjects(id), user_id uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id), primary key(course_id,user_id)
);
create table if not exists public.workflow_tasks (
 id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.course_workflows(id) on delete cascade,
 task_key text not null, title text not null, stage text not null, sort_order integer not null,
 depends_on text[] not null default '{}', required boolean not null default true,
 template_id text, expected_version text, owner_id uuid references public.profiles(id),
 author_id uuid references public.profiles(id),
 reviewer_id uuid references public.profiles(id), status text not null default 'planned'
 check(status in ('planned','ready','in_progress','in_review','changes_requested','approved','blocked')),
 submitted_id uuid, approved_id uuid, blocked_reason text,
 opened_at timestamptz, approved_at timestamptz, approved_by uuid references public.profiles(id), impact_alerted_at timestamptz,
 unique(workflow_id,task_key), check(owner_id is distinct from reviewer_id)
);
alter table public.content_submissions add column if not exists workflow_task_id uuid references public.workflow_tasks(id);
alter table public.workflow_tasks add constraint workflow_submitted_fk foreign key(submitted_id) references public.content_submissions(id);
alter table public.workflow_tasks add constraint workflow_approved_fk foreign key(approved_id) references public.content_submissions(id);
create index if not exists workflow_tasks_owner_idx on public.workflow_tasks(owner_id,status);
create index if not exists workflow_tasks_reviewer_idx on public.workflow_tasks(reviewer_id,status);
create index if not exists workflow_submissions_task_idx on public.content_submissions(workflow_task_id,submitted_at desc);
create table if not exists public.workflow_events (
 id bigint generated always as identity primary key, task_id uuid references public.workflow_tasks(id),
 workflow_id uuid not null references public.course_workflows(id), actor_id uuid not null references public.profiles(id),
 action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.workflow_evidence (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.workflow_tasks(id),
 document_id text, document_version bigint, document_snapshot jsonb,
 note text, submitted_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.workflow_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id),
 task_id uuid references public.workflow_tasks(id), title text not null, body text not null default '',
 created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists workflow_notifications_user_idx on public.workflow_notifications(recipient_id,created_at desc);

alter table public.workflow_templates enable row level security;
alter table public.course_workflows enable row level security;
alter table public.course_leads enable row level security;
alter table public.workflow_tasks enable row level security;
alter table public.workflow_events enable row level security;
alter table public.workflow_evidence enable row level security;
alter table public.workflow_notifications enable row level security;
create policy workflow_template_read on public.workflow_templates for select to authenticated using(true);
create policy workflow_progress_read on public.course_workflows for select to authenticated using(true);
create policy workflow_leads_read on public.course_leads for select to authenticated using(true);
create policy workflow_task_read on public.workflow_tasks for select to authenticated using(true);
create policy workflow_event_read on public.workflow_events for select to authenticated using(
  public.is_admin() or actor_id=auth.uid() or exists(select 1 from public.workflow_tasks t
   join public.course_workflows w on w.id=t.workflow_id where t.id=task_id
   and (t.owner_id=auth.uid() or t.reviewer_id=auth.uid() or exists(
     select 1 from public.course_leads l where l.course_id=w.course_id and l.user_id=auth.uid()))));
create policy workflow_notification_read on public.workflow_notifications for select to authenticated using(recipient_id=auth.uid());
create policy workflow_evidence_read on public.workflow_evidence for select to authenticated using(
 public.is_admin() or exists(select 1 from public.workflow_tasks t where t.id=task_id and (t.owner_id=auth.uid() or t.reviewer_id=auth.uid())));
revoke all on public.workflow_templates,public.course_workflows,public.course_leads,public.workflow_tasks,public.workflow_events,public.workflow_evidence,public.workflow_notifications from anon,authenticated;
grant select on public.workflow_templates,public.course_workflows,public.course_leads,public.workflow_tasks,public.workflow_events,public.workflow_evidence,public.workflow_notifications to authenticated;
grant update(read_at) on public.workflow_notifications to authenticated;
create policy workflow_notification_mark_read on public.workflow_notifications for update to authenticated
 using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());

create or replace function public.workflow_is_lead(p_course uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(select 1 from public.course_leads where course_id=p_course and user_id=auth.uid())
$$;
revoke all on function public.workflow_is_lead(uuid) from public;
grant execute on function public.workflow_is_lead(uuid) to authenticated;

create or replace function public.workflow_directory(p_course uuid) returns table(id uuid,display_name text)
 language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.workflow_is_lead(p_course) then raise exception 'Course Lead access required' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User') from public.profiles p order by 2;
end $$;
revoke all on function public.workflow_directory(uuid) from public;
grant execute on function public.workflow_directory(uuid) to authenticated;

create or replace function public.workflow_people(p_course uuid) returns table(id uuid,display_name text)
 language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')
 from public.profiles p where exists(select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id
   where w.course_id=p_course and (t.owner_id=p.id or t.reviewer_id=p.id)) order by 2;
end $$;
revoke all on function public.workflow_people(uuid) from public;
grant execute on function public.workflow_people(uuid) to authenticated;

create or replace function public.workflow_accounts() returns table(id uuid,name text,active boolean)
 language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User'),true
 from public.profiles p order by 2;
end $$;
revoke all on function public.workflow_accounts() from public;
grant execute on function public.workflow_accounts() to authenticated;

create or replace function public.workflow_set_lead(p_course uuid,p_user uuid,p_enabled boolean) returns void
 language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from public.content_subjects where id=p_course) or not exists(select 1 from public.profiles where id=p_user) then raise exception 'Unknown course or user'; end if;
 if p_enabled then insert into public.course_leads values(p_course,p_user,auth.uid()) on conflict do nothing;
 else delete from public.course_leads where course_id=p_course and user_id=p_user; end if;
 perform public.record_admin_event(case when p_enabled then 'workflow.lead_assigned' else 'workflow.lead_removed' end,
   'course',p_course::text,p_user,'{}'::jsonb);
end $$;
revoke all on function public.workflow_set_lead(uuid,uuid,boolean) from public;
grant execute on function public.workflow_set_lead(uuid,uuid,boolean) to authenticated;

create or replace function public.workflow_save_template(p_steps jsonb,p_title text) returns void
 language plpgsql security definer set search_path=public as $$
declare s jsonb; k text; seen text[]:='{}';
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if btrim(coalesce(p_title,''))='' then raise exception 'Workflow title is required'; end if;
 if jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps)<1 or jsonb_array_length(p_steps)>100 then raise exception 'Expected 1 to 100 steps'; end if;
 for s in select value from jsonb_array_elements(p_steps) loop
   k:=s->>'key';
   if k is null or k !~ '^[a-z0-9-]{2,60}$' or k=any(seen) or btrim(coalesce(s->>'title',''))='' or btrim(coalesce(s->>'stage',''))='' then raise exception 'Invalid or duplicate workflow step'; end if;
   if jsonb_typeof(coalesce(s->'depends','[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements_text(coalesce(s->'depends','[]'::jsonb)) d where d.value<>all(seen)) then raise exception 'Dependencies must point to earlier steps'; end if;
   if nullif(s->>'template','') is not null and nullif(s->>'version','') is not null and not exists(
     select 1 from public.content_template_versions v where v.template_id=s->>'template' and v.version_label=s->>'version' and v.active)
     then raise exception 'Workflow step % uses an unavailable template version',k; end if;
   seen:=array_append(seen,k);
 end loop;
 update public.workflow_templates set title=btrim(p_title),steps=p_steps,updated_at=now(),updated_by=auth.uid() where id='standard-course';
 perform public.record_admin_event('workflow.template_updated','workflow_template','standard-course',null,
   jsonb_build_object('step_count',jsonb_array_length(p_steps)));
end $$;
revoke all on function public.workflow_save_template(jsonb,text) from public;
grant execute on function public.workflow_save_template(jsonb,text) to authenticated;

create or replace function public.workflow_open_ready(p_workflow uuid) returns void
 language plpgsql security definer set search_path=public as $$
declare t record;
begin
 for t in select * from public.workflow_tasks where workflow_id=p_workflow and status='planned' order by sort_order for update loop
   if not exists(select 1 from unnest(t.depends_on) dep where not exists(
     select 1 from public.workflow_tasks prev where prev.workflow_id=p_workflow and prev.task_key=dep and prev.status='approved')) then
     update public.workflow_tasks set status='ready',opened_at=now() where id=t.id;
     if t.owner_id is not null then insert into public.workflow_notifications(recipient_id,task_id,title,body)
       values(t.owner_id,t.id,'Task ready',t.title); end if;
   end if;
 end loop;
end $$;
revoke all on function public.workflow_open_ready(uuid) from public,anon,authenticated;

create or replace function public.workflow_create(p_course uuid,p_chapter uuid,p_new_cycle boolean default false,p_reason text default null) returns uuid
 language plpgsql security definer set search_path=public as $$
declare w uuid; cycle_no integer; v_steps jsonb; s jsonb; n integer:=0;
begin
 if auth.uid() is null or not public.workflow_is_lead(p_course) then raise exception 'Course Lead access required' using errcode='42501'; end if;
 if not exists(select 1 from public.content_chapters where id=p_chapter and subject_id=p_course) then raise exception 'Chapter does not belong to course'; end if;
 perform pg_advisory_xact_lock(hashtext(p_chapter::text));
 select id into w from public.course_workflows where chapter_id=p_chapter order by cycle desc limit 1;
 if w is not null and not p_new_cycle then return w; end if;
 if p_new_cycle and not public.is_admin() then raise exception 'Only admin can start a new release cycle' using errcode='42501'; end if;
 if p_new_cycle and btrim(coalesce(p_reason,''))='' then raise exception 'New cycle reason required'; end if;
 select coalesce(max(cycle),0)+1 into cycle_no from public.course_workflows where chapter_id=p_chapter;
 select wt.steps into v_steps from public.workflow_templates wt where wt.id='standard-course';
 insert into public.course_workflows(course_id,chapter_id,cycle,template_snapshot,created_by)
 values(p_course,p_chapter,cycle_no,v_steps,auth.uid()) returning id into w;
 for s in select value from jsonb_array_elements(v_steps) loop
   n:=n+1;
   insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,depends_on,required,template_id,expected_version)
   values(w,s->>'key',s->>'title',s->>'stage',n,array(select jsonb_array_elements_text(coalesce(s->'depends','[]'::jsonb))),coalesce((s->>'required')::boolean,true),nullif(s->>'template',''),nullif(s->>'version',''));
 end loop;
 if cycle_no>1 then
   update public.workflow_tasks fresh set owner_id=old.owner_id,reviewer_id=old.reviewer_id,author_id=old.author_id
   from public.workflow_tasks old join public.course_workflows prior on prior.id=old.workflow_id
   where fresh.workflow_id=w and prior.chapter_id=p_chapter and prior.cycle=cycle_no-1 and fresh.task_key=old.task_key;
 end if;
 perform public.workflow_open_ready(w);
 insert into public.workflow_events(workflow_id,actor_id,action,details) values(w,auth.uid(),'cycle.created',jsonb_build_object('cycle',cycle_no));
 if p_new_cycle then
   perform public.record_admin_event('workflow.cycle_created','chapter',p_chapter::text,null,
     jsonb_build_object('cycle',cycle_no,'reason',p_reason));
   insert into public.workflow_events(workflow_id,actor_id,action,details)
   values(w,auth.uid(),'impact.review',jsonb_build_object('reason',p_reason,'cycle',cycle_no));
   insert into public.workflow_notifications(recipient_id,title,body)
   select distinct p.user_id,'New release cycle',p_reason from (
     select owner_id as user_id from public.workflow_tasks t join public.course_workflows older on older.id=t.workflow_id
       where older.chapter_id=p_chapter and older.cycle=cycle_no-1 and t.status='approved'
     union select reviewer_id from public.workflow_tasks t join public.course_workflows older on older.id=t.workflow_id
       where older.chapter_id=p_chapter and older.cycle=cycle_no-1 and t.status='approved'
   ) p where p.user_id is not null;
 end if;
 return w;
end $$;
revoke all on function public.workflow_create(uuid,uuid,boolean,text) from public;
grant execute on function public.workflow_create(uuid,uuid,boolean,text) to authenticated;

create or replace function public.workflow_action(p_task uuid,p_action text,p_owner uuid default null,p_reviewer uuid default null,p_author uuid default null,p_note text default null,p_document_id text default null)
 returns void language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; d public.documents%rowtype; actor uuid:=auth.uid(); admin boolean:=public.is_admin();
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into t from public.workflow_tasks where id=p_task for update;
 if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if p_action='assign' then
   if not public.workflow_is_lead(w.course_id) then raise exception 'Course Lead access required' using errcode='42501'; end if;
   if p_owner is not null and not exists(select 1 from public.profiles where id=p_owner) then raise exception 'Unknown owner'; end if;
   if p_reviewer is not null and not exists(select 1 from public.profiles where id=p_reviewer) then raise exception 'Unknown reviewer'; end if;
   if p_author is not null and not exists(select 1 from public.profiles where id=p_author) then raise exception 'Unknown author account'; end if;
   if p_author is not null and p_owner is null then raise exception 'Assign an owner before choosing an author account'; end if;
   if p_author is not null and p_author is distinct from p_owner and btrim(coalesce(p_note,''))='' then raise exception 'Explain why the author account differs from the task owner'; end if;
   if p_owner is not distinct from p_reviewer and p_owner is not null then raise exception 'Owner and reviewer must differ'; end if;
   if t.status in ('approved','in_review') then raise exception 'Cannot reassign while in review or approved'; end if;
   update public.workflow_tasks set owner_id=p_owner,reviewer_id=p_reviewer,author_id=p_author where id=p_task;
   if t.status in ('ready','changes_requested') and p_owner is not null and p_owner is distinct from t.owner_id then
     insert into public.workflow_notifications(recipient_id,task_id,title,body) values(p_owner,p_task,'Task assigned',t.title); end if;
 elsif p_action='start' then
   if (actor is distinct from t.owner_id and not admin) or t.status not in ('ready','changes_requested') then raise exception 'Task is not ready for this owner' using errcode='42501'; end if;
   update public.workflow_tasks set status='in_progress' where id=p_task;
 elsif p_action='request_review' then
   if (actor is distinct from t.owner_id and not admin) or t.status not in ('ready','in_progress','changes_requested') or t.reviewer_id is null then raise exception 'Owner and reviewer are required'; end if;
   if t.template_id is not null and t.submitted_id is null and exists(select 1 from public.submission_form_configs where template_id=t.template_id and active)
     then raise exception 'Submit the assigned template and version first'; end if;
   if t.submitted_id is null and t.template_id is not null then
     select * into d from public.documents where id=p_document_id and owner_id=t.owner_id and deleted_at is null;
     if not found or d.document_json is null or d.document_json->>'templateId' is distinct from t.template_id
       or d.document_json->'metadata'->>'workflowTaskId' is distinct from t.id::text
       or d.document_json->'metadata'->>'courseId' is distinct from w.course_id::text
       or d.document_json->'metadata'->>'chapterId' is distinct from w.chapter_id::text
       or (t.expected_version is not null and d.document_json->'metadata'->>'editorialVersion' is distinct from t.expected_version)
       or (t.author_id is not null and not coalesce(d.document_json->'metadata'->'authorIds' ? t.author_id::text,false))
       then raise exception 'Sync the assigned document with matching course, chapter, author and version before review'; end if;
     insert into public.workflow_evidence(task_id,document_id,document_version,document_snapshot,note,submitted_by)
       values(p_task,d.id,d.current_version,d.document_json,p_note,actor);
   elsif t.submitted_id is null then
     if btrim(coalesce(p_note,''))='' then raise exception 'Describe the completed work for review'; end if;
     insert into public.workflow_evidence(task_id,note,submitted_by) values(p_task,p_note,actor);
   end if;
   update public.workflow_tasks set status='in_review' where id=p_task;
   insert into public.workflow_notifications(recipient_id,task_id,title,body) values(t.reviewer_id,p_task,'Review requested',t.title);
 elsif p_action in ('approve','changes') then
   if (actor is distinct from t.reviewer_id and not admin) or t.status<>'in_review' then raise exception 'Only the assigned reviewer may decide an in-review task' using errcode='42501'; end if;
   if admin and actor is distinct from t.reviewer_id and btrim(coalesce(p_note,''))='' then raise exception 'Admin override reason required'; end if;
   if p_action='changes' and btrim(coalesce(p_note,''))='' then raise exception 'Request changes requires a note'; end if;
   if p_action='approve' then
     update public.workflow_tasks set status='approved',approved_at=now(),approved_by=actor,approved_id=submitted_id where id=p_task;
     perform public.workflow_open_ready(t.workflow_id);
   else update public.workflow_tasks set status='changes_requested',submitted_id=null where id=p_task; end if;
   if t.owner_id is not null then insert into public.workflow_notifications(recipient_id,task_id,title,body)
     values(t.owner_id,p_task,case when p_action='approve' then 'Task approved' else 'Changes requested' end,coalesce(nullif(p_note,''),t.title)); end if;
 elsif p_action='block' then
   if not public.workflow_is_lead(w.course_id) or btrim(coalesce(p_note,''))='' or t.status in ('approved','in_review','planned') then raise exception 'Course Lead must provide a reason to block an active task'; end if;
   update public.workflow_tasks set status='blocked',blocked_reason=p_note where id=p_task;
 elsif p_action='unblock' then
   if not public.workflow_is_lead(w.course_id) or t.status<>'blocked' then raise exception 'Course Lead access required'; end if;
   update public.workflow_tasks set status='ready',blocked_reason=null where id=p_task;
   if t.owner_id is not null then insert into public.workflow_notifications(recipient_id,task_id,title,body) values(t.owner_id,p_task,'Task reopened',t.title); end if;
 else raise exception 'Unknown workflow action'; end if;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,actor,p_action,jsonb_build_object('note',p_note,'owner',p_owner,'reviewer',p_reviewer,'author',p_author,'admin_override',admin and actor is distinct from t.reviewer_id and p_action in ('approve','changes')));
 if admin and actor is distinct from t.reviewer_id and p_action in ('approve','changes') then
   perform public.record_admin_event('workflow.review_override','task',p_task::text,t.owner_id,
     jsonb_build_object('action',p_action,'reason',p_note)); end if;
end $$;
revoke all on function public.workflow_action(uuid,text,uuid,uuid,uuid,text,text) from public;
grant execute on function public.workflow_action(uuid,text,uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.workflow_admin_edit_task(p_task uuid,p_patch jsonb,p_reason text) returns void
 language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; deps text[]; v_version_label text:=nullif(p_patch->>'expected_version',''); v_template_name text:=nullif(p_patch->>'template_id','');
begin
 if auth.uid() is null or not public.is_admin() or btrim(coalesce(p_reason,''))='' then raise exception 'Admin reason required' using errcode='42501'; end if;
 select * into t from public.workflow_tasks where id=p_task for update;
 if not found or t.status in ('in_review','approved') then raise exception 'Reviewed tasks are immutable; start a new cycle'; end if;
 if btrim(coalesce(p_patch->>'title',''))='' or btrim(coalesce(p_patch->>'stage',''))='' then raise exception 'Title and stage are required'; end if;
 if jsonb_typeof(coalesce(p_patch->'depends_on','[]'::jsonb))<>'array' then raise exception 'Dependencies must be a list'; end if;
 deps:=array(select jsonb_array_elements_text(coalesce(p_patch->'depends_on','[]'::jsonb)));
 if t.status='in_progress' and deps is distinct from t.depends_on then raise exception 'Finish the active task before changing prerequisites'; end if;
 if exists(select 1 from unnest(deps) d where not exists(select 1 from public.workflow_tasks prev
   where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.sort_order<t.sort_order)) then raise exception 'Dependencies must refer to earlier tasks'; end if;
 if v_template_name is not null and v_version_label is not null and not exists(select 1 from public.content_template_versions v
   where v.template_id=v_template_name and v.version_label=v_version_label and v.active) then raise exception 'Template version is unavailable'; end if;
 update public.workflow_tasks set title=btrim(p_patch->>'title'),stage=btrim(p_patch->>'stage'),required=coalesce((p_patch->>'required')::boolean,true),
   template_id=v_template_name,expected_version=v_version_label,depends_on=deps where id=p_task;
 if t.status='ready' and exists(select 1 from unnest(deps) d where not exists(select 1 from public.workflow_tasks prev
    where prev.workflow_id=t.workflow_id and prev.task_key=d and prev.status='approved')) then
   update public.workflow_tasks set status='planned',opened_at=null where id=p_task;
 elsif t.status='planned' then perform public.workflow_open_ready(t.workflow_id); end if;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,auth.uid(),'admin.task_edited',jsonb_build_object('reason',p_reason,'before',to_jsonb(t),'after',p_patch));
 perform public.record_admin_event('workflow.task_edited','task',p_task::text,t.owner_id,
   jsonb_build_object('reason',p_reason,'patch',p_patch));
end $$;
revoke all on function public.workflow_admin_edit_task(uuid,jsonb,text) from public;
grant execute on function public.workflow_admin_edit_task(uuid,jsonb,text) to authenticated;

-- Early upload metadata is editable, but the task link is immutable. Finalization validates
-- the complete package and changes task state atomically in the same transaction.
create or replace function public.workflow_submission_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 if tg_op='UPDATE' and new.workflow_task_id is distinct from old.workflow_task_id then raise exception 'Task link cannot change'; end if;
 if new.workflow_task_id is null then return new; end if;
 select * into t from public.workflow_tasks where id=new.workflow_task_id for update;
 if not found then raise exception 'Unknown workflow task'; end if;
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
create trigger workflow_submission_guard_trigger before insert or update on public.content_submissions
 for each row execute function public.workflow_submission_guard();

create or replace function public.workflow_submission_finished() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;
begin
 if new.workflow_task_id is null or new.status<>'submitted' or old.status='submitted' then return new; end if;
 update public.workflow_tasks set submitted_id=new.id,status='in_review' where id=new.workflow_task_id;
 select * into t from public.workflow_tasks where id=new.workflow_task_id;
 insert into public.workflow_notifications(recipient_id,task_id,title,body) values(t.reviewer_id,t.id,'Review requested',t.title);
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(t.id,t.workflow_id,new.owner_id,'submission.received',jsonb_build_object('submission_id',new.id,'version',new.version_label));
 return new;
end $$;
create trigger workflow_submission_finished_trigger after update on public.content_submissions
 for each row execute function public.workflow_submission_finished();

create or replace function public.workflow_account_author_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.form_id='scientific-draft' and new.status='submitted' and (tg_op='INSERT' or old.status='uploading') and not exists(
   select 1 from public.profiles p where p.id::text=new.answers->>'writer') then
   raise exception 'Select the draft author from user accounts';
 end if;
 return new;
end $$;
create trigger workflow_account_author_guard_trigger before insert or update on public.content_submissions
 for each row execute function public.workflow_account_author_guard();

-- A reviewer can read the immutable submitted package for their assigned task.
create policy workflow_submission_reviewer_read on public.content_submissions for select to authenticated using(
 status='submitted' and deleted_at is null and exists(select 1 from public.workflow_tasks t
 where t.id=workflow_task_id and t.reviewer_id=auth.uid()));
create policy workflow_storage_reviewer_read on storage.objects for select to authenticated using(
 bucket_id='teryaq-submissions' and exists(select 1 from public.content_submissions s
 join public.workflow_tasks t on t.id=s.workflow_task_id
 where s.id::text=(storage.foldername(name))[2] and s.owner_id::text=(storage.foldername(name))[1]
 and s.status='submitted' and s.deleted_at is null and t.reviewer_id=auth.uid()
 and exists(select 1 from jsonb_array_elements(s.files) f where f->>'path'=name)));
-- Existing owner INSERT permits the link, but UPDATE does not grant workflow_task_id.

create or replace function public.workflow_approved_source_changed() returns trigger
 language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype;
begin
 if new.current_version<=old.current_version or (
   new.document_json->'content' is not distinct from old.document_json->'content'
   and new.document_json->'metadata' is not distinct from old.document_json->'metadata') then return new; end if;
 select * into t from public.workflow_tasks where id::text=old.document_json->'metadata'->>'workflowTaskId'
   and owner_id=new.owner_id and status='approved' and impact_alerted_at is null for update;
 if not found then return new; end if;
 update public.workflow_tasks set impact_alerted_at=now() where id=t.id;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(t.id,t.workflow_id,new.owner_id,'impact.source_changed',jsonb_build_object('document_id',new.id,'cloud_version',new.current_version));
 insert into public.workflow_notifications(recipient_id,task_id,title,body)
 select distinct affected.person,t.id,'Approved source changed',t.title||' changed after approval. Review downstream impact.'
 from (select later.owner_id as person from public.workflow_tasks later
       where later.workflow_id=t.workflow_id and later.sort_order>t.sort_order and later.status in ('in_progress','in_review','approved')
       union select later.reviewer_id from public.workflow_tasks later
       where later.workflow_id=t.workflow_id and later.sort_order>t.sort_order and later.status in ('in_progress','in_review','approved')
       union select l.user_id from public.course_leads l join public.course_workflows w on w.course_id=l.course_id where w.id=t.workflow_id) affected
 where affected.person is not null;
 return new;
end $$;
create trigger workflow_approved_source_changed_trigger after update of document_json,current_version on public.documents
 for each row execute function public.workflow_approved_source_changed();


notify pgrst, 'reload schema';
