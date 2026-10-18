-- v3.0.7 — task-bound documents, consistent role teams, team analytics and retained account history.
begin;
alter table public.profiles add column if not exists deleted_at timestamptz, add column if not exists auth_deleted_at timestamptz;
create or replace function public.guard_archived_profile() returns trigger language plpgsql set search_path=public,pg_temp as $$begin if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then raise exception 'Archived account identity cannot be reactivated';end if;if new.deleted_at is distinct from old.deleted_at and coalesce(auth.role(),'')<>'service_role' and auth.uid() is not null then raise exception 'Use the account deletion action';end if;return new;end$$;
drop trigger if exists archived_profile_guard on public.profiles;
create trigger archived_profile_guard before update on public.profiles for each row execute function public.guard_archived_profile();
-- Auth identity may be removed while its profile remains as historical attribution.
alter table public.profiles drop constraint if exists profiles_id_fkey;
create or replace function public.account_is_active(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select p_user is not null and exists(select 1 from public.profiles where id=p_user and deleted_at is null and role in ('user','admin'))$$;
create or replace function public.is_admin(check_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.profiles where id=check_uid and role='admin' and deleted_at is null)$$;

create or replace function public.workflow_editor_templates(p_template text,p_key text) returns text[] language sql immutable set search_path=public,pg_temp as $$select case when p_template='scientific-draft-text' then array['scientific-draft-text','scientific-draft-figures'] when p_template='scientific-draft-v1-review' and p_key='figures' then array['scientific-draft-figures'] when p_template in ('scientific-draft-figures','shooting-script') then array[p_template] else '{}'::text[] end$$;
revoke all on function public.workflow_editor_templates(text,text) from public,anon;
create or replace function public.workflow_document_choices() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('task',public.workflow_task_payload(t),'workflow',to_jsonb(w),'editor_template',editor_template) order by w.course_id,w.chapter_id,t.sort_order),'[]'::jsonb)
 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id cross join lateral unnest(public.workflow_editor_templates(t.template_id,t.task_key)) editor_template
 where public.account_is_active()
 and public.workflow_user_can_submit(t.id,auth.uid())
 and t.status in ('ready','in_progress','changes_requested')
 and not exists(select 1 from public.course_workflows later where later.chapter_id=w.chapter_id and later.course_id=w.course_id and later.cycle>w.cycle)
$$;
create or replace function public.workflow_document_access(p_document jsonb) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t public.workflow_tasks%rowtype;w public.course_workflows%rowtype;m jsonb:=p_document->'metadata';tid uuid;
begin
 if not public.account_is_active() then return false;end if;
 if public.is_admin() then return true;end if;
 if nullif(m->>'workflowTaskId','') is not null then
 begin tid:=(m->>'workflowTaskId')::uuid;exception when invalid_text_representation then return false;end;
 select * into t from public.workflow_tasks where id=tid;select * into w from public.course_workflows where id=t.workflow_id;
 return coalesce(t.id is not null and public.workflow_user_can_submit(t.id,auth.uid()) and t.status in ('ready','in_progress','changes_requested') and p_document->>'templateId'=any(public.workflow_editor_templates(t.template_id,t.task_key)) and w.course_id::text=coalesce(m->>'courseId',m->>'subjectId') and w.chapter_id::text=m->>'chapterId' and (t.expected_version is null or t.expected_version=m->>'editorialVersion'),false);
 end if;
 -- Existing unlinked documents may be edited only when their owner has a matching task.
 return exists(select 1 from public.workflow_tasks x join public.course_workflows cw on cw.id=x.workflow_id
 where cw.course_id::text=coalesce(m->>'courseId',m->>'subjectId') and cw.chapter_id::text=m->>'chapterId' and p_document->>'templateId'=any(public.workflow_editor_templates(x.template_id,x.task_key)) and (x.expected_version is null or x.expected_version=m->>'editorialVersion') and x.status in ('ready','in_progress','changes_requested') and public.workflow_user_can_submit(x.id,auth.uid()));
end$$;
create or replace function public.guard_task_document_scope() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null and coalesce(auth.role(),'')='service_role' then return new;end if;
 if auth.uid() is null then return new;end if; -- trusted database migration / maintenance
 if not public.account_is_active() then raise exception 'Active account required' using errcode='42501';end if;
 if tg_op='UPDATE' and old.document_json is not distinct from new.document_json then return new;end if;
 if not public.is_admin() then
  if tg_op='INSERT' and nullif(new.document_json#>>'{metadata,workflowTaskId}','') is null then raise exception 'Choose an assigned task before creating a document' using errcode='42501';end if;
  if not public.workflow_document_access(new.document_json) then raise exception 'This course, chapter, template or version is not assigned to you, or the task is closed' using errcode='42501';end if;
  if tg_op='UPDATE' and nullif(old.document_json#>>'{metadata,workflowTaskId}','') is not null and jsonb_build_array(new.document_json#>'{metadata,workflowTaskId}',new.document_json#>'{metadata,courseId}',new.document_json#>'{metadata,subjectId}',new.document_json#>'{metadata,chapterId}',new.document_json#>'{metadata,editorialVersion}') is distinct from jsonb_build_array(old.document_json#>'{metadata,workflowTaskId}',old.document_json#>'{metadata,courseId}',old.document_json#>'{metadata,subjectId}',old.document_json#>'{metadata,chapterId}',old.document_json#>'{metadata,editorialVersion}') then raise exception 'Task document identity is locked' using errcode='42501';end if;
  if tg_op='INSERT' then new.document_json:=jsonb_set(jsonb_set(new.document_json,'{metadata,authorIds}',jsonb_build_array(new.owner_id)), '{metadata,name}',to_jsonb((select coalesce(display_name,'')||case when nullif(member_code,'') is null then '' else ' — '||member_code end from public.profiles where id=new.owner_id)));end if;
  if nullif(new.document_json#>>'{metadata,workflowTaskId}','') is not null then new.document_json:=jsonb_set(new.document_json,'{metadata,workflowTaskCode}',to_jsonb((select task_code from public.workflow_tasks where id=(new.document_json#>>'{metadata,workflowTaskId}')::uuid)));end if;
 end if;return new;
end$$;
drop trigger if exists task_document_scope_guard on public.documents;
create trigger task_document_scope_guard before insert or update of document_json on public.documents for each row execute function public.guard_task_document_scope();
create or replace function public.workflow_set_role_team(p_workflow uuid,p_stage text,p_role text,p_users uuid[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare w public.course_workflows%rowtype;t public.workflow_tasks%rowtype;uid uuid;target_ids uuid[];changed integer:=0;locked integer:=0;
begin
 select * into w from public.course_workflows where id=p_workflow for update;
 if auth.uid() is null or w.id is null or not (public.workflow_can_manage_stage(w.course_id,p_stage) or p_role='scientific_author' and public.workflow_can_manage_stage(w.course_id,'Scientific Draft')) then raise exception 'Responsible course management access required' using errcode='42501';end if;
 if p_role='scientific_author' and not public.workflow_can_manage_stage(w.course_id,'Scientific Draft') then raise exception 'Scientific Lead or Course Lead access required for chapter-wide scientific authors' using errcode='42501';end if;
 if p_role not in ('scientific_author','script_writer','ai_team','shared_team','designer','presenter','montage_team') then raise exception 'Unsupported assignment role';end if;
 -- A scientific lead cannot assign other stages through the author shortcut.
 select array_agg(id) into target_ids from public.workflow_tasks where workflow_id=w.id and (stage=p_stage or p_role not in ('ai_team','shared_team')) and public.workflow_required_role(task_key,stage)=p_role;
 if coalesce(cardinality(target_ids),0)=0 then raise exception 'No tasks match this role in this work area';end if;
 if coalesce(cardinality(p_users),0)>200 then raise exception 'Too many executors';end if;
 if exists(select 1 from unnest(coalesce(p_users,'{}'::uuid[])) x where not exists(select 1 from public.profiles where id=x and deleted_at is null)) then raise exception 'Choose approved central user accounts';end if;
 delete from public.workflow_role_assignments where workflow_id=w.id and role=p_role and (stage=p_stage or p_role not in ('ai_team','shared_team'));
 if p_role='scientific_author' then delete from public.workflow_chapter_roles where workflow_id=w.id and role='scientific_author';end if;
 foreach uid in array coalesce(p_users,'{}'::uuid[]) loop
 insert into public.workflow_role_assignments(workflow_id,stage,role,user_id,assigned_by) select w.id,s.stage,p_role,uid,auth.uid() from (select distinct stage from public.workflow_tasks where id=any(target_ids)) s on conflict do nothing;end loop;
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


-- Reconcile previously saved chapter authors once; replay is stable and closed tasks retain attribution.
do $$declare w record; ids uuid[]; assigner uuid; st text; t record;uid uuid;begin
 for w in select distinct workflow_id from public.workflow_role_assignments where role='scientific_author'
 union select workflow_id from public.workflow_chapter_roles where role='scientific_author' loop
  select array_agg(distinct user_id) into ids from public.workflow_role_assignments where workflow_id=w.workflow_id and role='scientific_author' and stage=case when exists(select 1 from public.workflow_role_assignments where workflow_id=w.workflow_id and role='scientific_author' and stage='Scientific Draft') then 'Scientific Draft' else (select stage from public.workflow_role_assignments where workflow_id=w.workflow_id and role='scientific_author' order by assigned_at desc limit 1) end;
  select assigned_by into assigner from public.workflow_role_assignments where workflow_id=w.workflow_id and role='scientific_author' order by assigned_at desc limit 1;
  if ids is null then select array_agg(user_id),min(assigned_by::text)::uuid into ids,assigner from public.workflow_chapter_roles where workflow_id=w.workflow_id and role='scientific_author';end if;
  ids:=array(select x from unnest(ids) x where public.account_is_active(x));
  delete from public.workflow_role_assignments where workflow_id=w.workflow_id and role='scientific_author';
  delete from public.workflow_chapter_roles where workflow_id=w.workflow_id and role='scientific_author';
  for st in select distinct stage from public.workflow_tasks where workflow_id=w.workflow_id and public.workflow_required_role(task_key,stage)='scientific_author' loop
   foreach uid in array coalesce(ids,'{}'::uuid[]) loop insert into public.workflow_role_assignments(workflow_id,stage,role,user_id,assigned_by) values(w.workflow_id,st,'scientific_author',uid,assigner) on conflict do nothing;end loop;
  end loop;
  for t in select id from public.workflow_tasks where workflow_id=w.workflow_id and public.workflow_required_role(task_key,stage)='scientific_author' and status not in ('approved','in_review') loop
   delete from public.workflow_task_executors where task_id=t.id;
   foreach uid in array coalesce(ids,'{}'::uuid[]) loop insert into public.workflow_task_executors(task_id,user_id,assigned_by) values(t.id,uid,assigner) on conflict do nothing;end loop;
   update public.workflow_tasks set owner_id=ids[1],assignment_mode='users' where id=t.id;
  end loop;
 end loop;
end$$;


-- Scoped manager analytics; no unscoped profile, task or submission leakage.
create or replace function public.team_analytics_data() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare allowed uuid[];begin
 if not public.account_is_active() then raise exception 'Active account required' using errcode='42501';end if;
 select array_agg(id) into allowed from public.course_workflows w where public.workflow_can_manage_stage(w.course_id,null) or public.is_admin() or exists(select 1 from public.course_management_roles r where r.course_id=w.course_id and r.user_id=auth.uid());
 return jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(public.workflow_task_payload(t)||jsonb_build_object('required_role',public.workflow_required_role(t.task_key,t.stage))) from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id where t.workflow_id=any(allowed) and public.workflow_can_manage_stage(w.course_id,t.stage)),'[]'::jsonb),
 'workflows',coalesce((select jsonb_agg(to_jsonb(w)) from public.course_workflows w where w.id=any(allowed)),'[]'::jsonb),
 'executors',coalesce((select jsonb_agg(jsonb_build_object('task_id',t.id,'user_id',p.id)) from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id cross join public.profiles p where t.workflow_id=any(allowed) and public.workflow_can_manage_stage(w.course_id,t.stage) and (public.workflow_task_is_executor(t.id,p.id) or exists(select 1 from public.workflow_task_executors e where e.task_id=t.id and e.user_id=p.id))),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'member_code',p.member_code,'deleted',p.deleted_at is not null)) from public.profiles p where public.is_admin() or exists(select 1 from public.workflow_task_executors e join public.workflow_tasks t on t.id=e.task_id join public.course_workflows w on w.id=t.workflow_id where t.workflow_id=any(allowed) and e.user_id=p.id and public.workflow_can_manage_stage(w.course_id,t.stage))),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'task_id',s.workflow_task_id,'owner_id',s.owner_id,'submitted_at',s.submitted_at,'version',s.version_label,'form_id',s.form_id)) from public.content_submissions s join public.workflow_tasks t on t.id=s.workflow_task_id join public.course_workflows w on w.id=t.workflow_id where s.status='submitted' and s.deleted_at is null and t.workflow_id=any(allowed) and public.workflow_can_manage_stage(w.course_id,t.stage)),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.workflow_events e left join public.workflow_tasks t on t.id=e.task_id join public.course_workflows w on w.id=e.workflow_id where e.workflow_id=any(allowed) and (public.is_admin() or public.workflow_can_manage_stage(w.course_id,t.stage))),'[]'::jsonb));
end$$;

create or replace function public.admin_prepare_account_deletion(p_user uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; affected integer;begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(730307);
 if not public.is_admin(p_actor) then raise exception 'Admin access required';end if;
 if p_user=p_actor then raise exception 'Cannot delete your current account';end if;
 select * into p from public.profiles where id=p_user for update;if p.id is null then raise exception 'Account not found';end if;
 if p.role='admin' and (select count(*) from public.profiles where role='admin' and deleted_at is null)<=1 then raise exception 'Cannot delete the last admin';end if;
 select count(*) into affected from public.workflow_task_executors e join public.workflow_tasks t on t.id=e.task_id where e.user_id=p_user and t.status not in ('approved','in_review');
 update public.profiles set deleted_at=coalesce(deleted_at,now()) where id=p_user;
 delete from public.course_management_roles where user_id=p_user;
 delete from public.workflow_chapter_roles where user_id=p_user;
 delete from public.workflow_role_assignments where user_id=p_user;
 delete from public.workflow_task_executors e using public.workflow_tasks t where t.id=e.task_id and e.user_id=p_user and t.status not in ('approved','in_review');
 update public.workflow_tasks set owner_id=null where owner_id=p_user and status not in ('approved','in_review');
 insert into public.audit_log(actor_id,event_type,entity_type,entity_id,owner_id,metadata) values(p_actor,'account.deletion_prepared','account',p_user::text,p_user,jsonb_build_object('reassignment_count',affected));
 return jsonb_build_object('reassignment_count',affected,'name',p.display_name);
end$$;
revoke all on function public.admin_prepare_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_prepare_account_deletion(uuid,uuid) to service_role;
create or replace function public.workflow_people(p_course uuid)
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path=public as $$
 select distinct p.id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' — '||p.member_code end,
   p.avatar_path
 from public.profiles p where public.account_is_active() and p.deleted_at is null and (
   exists(select 1 from public.course_management_roles r where r.course_id=p_course and r.user_id=p.id)
   or exists(select 1 from public.workflow_chapter_roles cr join public.course_workflows w on w.id=cr.workflow_id where w.course_id=p_course and cr.user_id=p.id)
   or exists(select 1 from public.workflow_task_executors e join public.workflow_tasks t on t.id=e.task_id join public.course_workflows w on w.id=t.workflow_id where w.course_id=p_course and e.user_id=p.id)
 ) order by 2
$$;;
create or replace function public.workflow_directory(p_course uuid)
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path=public as $$
 select p.id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' — '||p.member_code end,
   p.avatar_path
 from public.profiles p
 where p.deleted_at is null and public.account_is_active()
 order by 2
$$;;
create or replace function public.workflow_accounts() returns table(id uuid,name text,active boolean) language plpgsql stable security definer set search_path=public as $$begin if not public.account_is_active() then raise exception 'Sign in required';end if;return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' — '||p.member_code end,true from public.profiles p where p.deleted_at is null order by 2;end$$;;
revoke all on function public.workflow_document_choices(),public.workflow_document_access(jsonb),public.team_analytics_data() from public,anon;
grant execute on function public.workflow_document_choices(),public.workflow_document_access(jsonb),public.team_analytics_data() to authenticated;
revoke all on function public.guard_task_document_scope() from public,anon,authenticated;
create or replace function public.guard_active_assignment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if not public.account_is_active(new.user_id) then raise exception 'Choose an active member account';end if;return new;end$$;
do $$declare t text;begin foreach t in array array['workflow_task_executors','workflow_chapter_roles','workflow_role_assignments','course_management_roles'] loop execute format('drop trigger if exists active_assignment_guard on public.%I',t);execute format('create trigger active_assignment_guard before insert or update of user_id on public.%I for each row execute function public.guard_active_assignment()',t);end loop;end$$;
revoke all on function public.guard_active_assignment(),public.guard_archived_profile() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
