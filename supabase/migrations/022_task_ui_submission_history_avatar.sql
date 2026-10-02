-- TERYAQ Master Tool v2.8.4
-- Avatar-aware workflow people/directory and display-number normalization.

begin;

drop function if exists public.workflow_people(uuid);
create function public.workflow_people(p_course uuid)
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path=public as $$
 select distinct p.id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User'),
   p.avatar_path
 from public.profiles p where
   exists(select 1 from public.course_management_roles r where r.course_id=p_course and r.user_id=p.id)
   or exists(select 1 from public.workflow_chapter_roles cr join public.course_workflows w on w.id=cr.workflow_id where w.course_id=p_course and cr.user_id=p.id)
   or exists(select 1 from public.workflow_task_executors e join public.workflow_tasks t on t.id=e.task_id join public.course_workflows w on w.id=t.workflow_id where w.course_id=p_course and e.user_id=p.id)
 order by 2
$$;
revoke all on function public.workflow_people(uuid) from public;
grant execute on function public.workflow_people(uuid) to authenticated;

drop function if exists public.workflow_directory(uuid);
create function public.workflow_directory(p_course uuid)
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path=public as $$
 select p.id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User'),
   p.avatar_path
 from public.profiles p
 where p.role <> 'disabled'
 order by 2
$$;
revoke all on function public.workflow_directory(uuid) from public;
grant execute on function public.workflow_directory(uuid) to authenticated;

-- Normalize scientific workflow numbering for existing rows.
update public.workflow_tasks set display_number=case task_key
 when 'scope' then '1–4'
 when 'sources' then '1–4'
 when 'timeline' then '1–4'
 when 'roles' then '1–4'
 when 'draft-v1' then '5'
 when 'draft-v1-review' then '6.1–6.3'
 when 'draft-v2' then '7'
 when 'responsible-review' then '8'
 when 'draft-v3' then '9'
 when 'comprehensive-audit-1' then '10'
 when 'draft-v4' then '11'
 when 'design-v1' then '12'
 when 'comprehensive-audit-2' then '13.1'
 when 'accuracy-review' then '13.2'
 when 'design-v2' then '14.1'
 when 'draft-v5' then '14.2'
 else display_number end
where stage='Scientific Draft';

commit;
