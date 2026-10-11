-- TERYAQ v3.0.0. Run after 029. Edit item wording without losing completion records.
begin;
create or replace function public.workflow_edit_checklist_item(p_instruction uuid,p_item text,p_label text)
returns void language plpgsql security definer set search_path=public as $$
declare source public.workflow_task_instructions%rowtype; task public.workflow_tasks%rowtype;
 course uuid; target record; revised jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into source from public.workflow_task_instructions where id=p_instruction and kind='checklist' for update;
 if not found then raise exception 'Checklist not found';end if;
 select * into task from public.workflow_tasks where id=source.task_id;
 select course_id into course from public.course_workflows where id=task.workflow_id;
 if not public.workflow_can_manage_stage(course,task.stage) then raise exception 'Course management access required' using errcode='42501';end if;
 if nullif(btrim(coalesce(p_label,'')),'') is null or length(p_label)>1000 then raise exception 'Enter a checklist label between 1 and 1000 characters';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(source.content->'items','[]'::jsonb)) x where x->>'id'=p_item) then raise exception 'Checklist item not found';end if;
 for target in
  select i.id,i.content from public.workflow_task_instructions i
  join public.workflow_tasks t on t.id=i.task_id join public.course_workflows w on w.id=t.workflow_id
  where i.id=source.id or (source.scope='similar_tasks' and source.scope_group is not null and i.scope_group=source.scope_group and i.kind='checklist' and w.course_id=course and t.task_key=task.task_key)
  order by i.id for update of i
 loop
  select jsonb_agg(case when x.value->>'id'=p_item then x.value||jsonb_build_object('label',btrim(p_label)) else x.value end order by x.ordinality)
   into revised from jsonb_array_elements(coalesce(target.content->'items','[]'::jsonb)) with ordinality x(value,ordinality);
  update public.workflow_task_instructions set content=jsonb_set(target.content,'{items}',coalesce(revised,'[]'::jsonb),true) where id=target.id;
 end loop;
 -- Item IDs, instruction IDs and workflow_task_check_state are intentionally untouched.
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(task.id,task.workflow_id,auth.uid(),'checklist_item_updated',jsonb_build_object('instruction_id',source.id,'item_id',p_item,'label',btrim(p_label),'scope',source.scope));
end $$;
revoke all on function public.workflow_edit_checklist_item(uuid,text,text) from public;
grant execute on function public.workflow_edit_checklist_item(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
