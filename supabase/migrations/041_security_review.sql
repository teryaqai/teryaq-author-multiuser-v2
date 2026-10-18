-- v3.0.6: tighten existing RPC, account validation and rich resource boundaries.
begin;
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
