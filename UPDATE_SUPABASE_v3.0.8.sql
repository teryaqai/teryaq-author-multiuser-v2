-- v3.0.8: caller-bound editor authorization; private workflow helper stays private.
-- Requires migrations through 042 (v3.0.7). Safe to run more than once.
begin;
create or replace function public.workflow_can_open_editor(p_task uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active(auth.uid()) and exists (
  select 1 from public.workflow_tasks t where t.id=p_task
  and t.status in ('ready','in_progress','changes_requested')
  and cardinality(public.workflow_editor_templates(t.template_id,t.task_key))>0
  and public.workflow_user_can_submit(t.id,auth.uid())
 )
$$;
revoke all on function public.workflow_can_open_editor(uuid) from public,anon;
grant execute on function public.workflow_can_open_editor(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
