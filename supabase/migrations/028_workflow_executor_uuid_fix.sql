-- TERYAQ v3.0.0: fix function min(uuid) does not exist when assigning executors.
-- Run after 027 (or as a standalone hotfix on an existing 2.9.2 database).
-- All existing permission checks, assignment modes and event logging are retained.
begin;

create or replace function public.workflow_set_task_executors(p_task uuid,p_users uuid[],p_course_team boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; uid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into t from public.workflow_tasks where id=p_task for update;
 if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required' using errcode='42501'; end if;
 if t.status in ('approved','in_review') then raise exception 'Cannot reassign while in review or approved'; end if;
 delete from public.workflow_task_executors where task_id=p_task;
 if not p_course_team then
   foreach uid in array coalesce(p_users,'{}'::uuid[]) loop
     if not exists(select 1 from public.profiles where id=uid) then raise exception 'Unknown task executor'; end if;
     insert into public.workflow_task_executors(task_id,user_id,assigned_by) values(p_task,uid,auth.uid()) on conflict do nothing;
   end loop;
 end if;
 update public.workflow_tasks set assignment_mode=case when p_course_team then 'course_team' else 'users' end,
   owner_id=case when p_course_team then null else (select user_id from public.workflow_task_executors where task_id=p_task order by user_id limit 1) end
 where id=p_task;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,auth.uid(),'assign_executors',jsonb_build_object('users',coalesce(p_users,'{}'::uuid[]),'course_team',p_course_team));
end $$;
revoke all on function public.workflow_set_task_executors(uuid,uuid[],boolean) from public;
grant execute on function public.workflow_set_task_executors(uuid,uuid[],boolean) to authenticated;

notify pgrst,'reload schema';
commit;
