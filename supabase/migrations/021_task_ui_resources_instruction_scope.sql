-- TERYAQ Master Tool v2.8.1
-- Task detail UX support: reusable instructions, multi-resource Preparation & Rules,
-- richer task inputs, and image resources.
-- Apply after 020_scientific_workflow_automation.sql.

-- ---------------------------------------------------------------------------
-- 1) Reusable task instructions across matching tasks in the same course.
-- ---------------------------------------------------------------------------
alter table public.workflow_task_instructions
  add column if not exists scope text not null default 'task'
    check (scope in ('task','similar_tasks')),
  add column if not exists scope_group uuid;

create index if not exists workflow_task_instructions_scope_group_idx
  on public.workflow_task_instructions(scope_group)
  where scope_group is not null;

-- New scoped signature. p_scope='similar_tasks' clones the instruction to every
-- task with the same task_key in every chapter/cycle of the same course.
create or replace function public.workflow_add_instruction(
  p_task uuid,
  p_kind text,
  p_title text,
  p_content jsonb,
  p_scope text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  t public.workflow_tasks%rowtype;
  w public.course_workflows%rowtype;
  target record;
  newid uuid;
  rootid uuid;
  grp uuid := gen_random_uuid();
  normalized_scope text := coalesce(nullif(p_scope,''),'task');
begin
  select * into t from public.workflow_tasks where id=p_task;
  if not found then raise exception 'Unknown task'; end if;
  select * into w from public.course_workflows where id=t.workflow_id;
  if not public.workflow_can_manage_stage(w.course_id,t.stage) then
    raise exception 'Course management access required' using errcode='42501';
  end if;
  if p_kind not in ('text','checklist') then raise exception 'Unknown instruction type'; end if;
  if normalized_scope not in ('task','similar_tasks') then raise exception 'Unknown instruction scope'; end if;

  if normalized_scope='similar_tasks' then
    for target in
      select wt.id
      from public.workflow_tasks wt
      join public.course_workflows cw on cw.id=wt.workflow_id
      where cw.course_id=w.course_id and wt.task_key=t.task_key
        and cw.cycle=(select max(cw2.cycle) from public.course_workflows cw2 where cw2.chapter_id=cw.chapter_id)
    loop
      insert into public.workflow_task_instructions(task_id,kind,title,content,sort_order,created_by,scope,scope_group)
      values(target.id,p_kind,coalesce(p_title,''),coalesce(p_content,'{}'::jsonb),
        coalesce((select max(sort_order)+1 from public.workflow_task_instructions where task_id=target.id),0),
        auth.uid(),'similar_tasks',grp)
      returning id into newid;
      if target.id=p_task then rootid:=newid; end if;
    end loop;
    return rootid;
  else
    insert into public.workflow_task_instructions(task_id,kind,title,content,sort_order,created_by,scope,scope_group)
    values(p_task,p_kind,coalesce(p_title,''),coalesce(p_content,'{}'::jsonb),
      coalesce((select max(sort_order)+1 from public.workflow_task_instructions where task_id=p_task),0),
      auth.uid(),'task',null)
    returning id into newid;
    return newid;
  end if;

  return newid;
end $$;
revoke all on function public.workflow_add_instruction(uuid,text,text,jsonb,text) from public;
grant execute on function public.workflow_add_instruction(uuid,text,text,jsonb,text) to authenticated;

-- Keep the old four-argument RPC usable by older cached clients.
create or replace function public.workflow_add_instruction(
  p_task uuid,p_kind text,p_title text,p_content jsonb
) returns uuid
language sql security definer set search_path=public as $$
  select public.workflow_add_instruction(p_task,p_kind,p_title,p_content,'task')
$$;
revoke all on function public.workflow_add_instruction(uuid,text,text,jsonb) from public;
grant execute on function public.workflow_add_instruction(uuid,text,text,jsonb) to authenticated;

-- Future chapter cycles inherit reusable instructions for their matching task key.
create or replace function public.workflow_inherit_shared_instructions() returns trigger
language plpgsql security definer set search_path=public as $$
declare src record; target_course uuid;
begin
  select course_id into target_course from public.course_workflows where id=new.workflow_id;
  for src in
    select distinct on (i.scope_group) i.kind,i.title,i.content,i.scope_group,i.created_by
    from public.workflow_task_instructions i
    join public.workflow_tasks wt on wt.id=i.task_id
    join public.course_workflows cw on cw.id=wt.workflow_id
    where i.scope='similar_tasks' and i.scope_group is not null
      and cw.course_id=target_course and wt.task_key=new.task_key
    order by i.scope_group,i.created_at
  loop
    insert into public.workflow_task_instructions(task_id,kind,title,content,sort_order,created_by,scope,scope_group)
    values(new.id,src.kind,src.title,src.content,coalesce((select max(sort_order)+1 from public.workflow_task_instructions where task_id=new.id),0),src.created_by,'similar_tasks',src.scope_group);
  end loop;
  return new;
end $$;
drop trigger if exists workflow_task_inherit_shared_instructions on public.workflow_tasks;
create trigger workflow_task_inherit_shared_instructions
after insert on public.workflow_tasks
for each row execute function public.workflow_inherit_shared_instructions();

create or replace function public.workflow_delete_instruction(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  t public.workflow_tasks%rowtype;
  w public.course_workflows%rowtype;
  grp uuid;
  sc text;
begin
  select wt.* into t
  from public.workflow_task_instructions i
  join public.workflow_tasks wt on wt.id=i.task_id
  where i.id=p_id;
  if not found then return; end if;
  select scope_group,scope into grp,sc from public.workflow_task_instructions where id=p_id;
  select * into w from public.course_workflows where id=t.workflow_id;
  if not public.workflow_can_manage_stage(w.course_id,t.stage) then
    raise exception 'Course management access required' using errcode='42501';
  end if;
  if sc='similar_tasks' and grp is not null then
    delete from public.workflow_task_instructions where scope_group=grp;
  else
    delete from public.workflow_task_instructions where id=p_id;
  end if;
end $$;
revoke all on function public.workflow_delete_instruction(uuid) from public;
grant execute on function public.workflow_delete_instruction(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Preparation & Rules can hold multiple text/link/file/image items per slot.
-- ---------------------------------------------------------------------------
alter table public.workflow_chapter_resources
  drop constraint if exists workflow_chapter_resources_workflow_id_resource_key_key;
alter table public.workflow_chapter_resources
  drop constraint if exists workflow_chapter_resources_kind_check;
alter table public.workflow_chapter_resources
  add constraint workflow_chapter_resources_kind_check
  check(kind in ('file','image','link','text'));

create index if not exists workflow_chapter_resources_group_idx
  on public.workflow_chapter_resources(workflow_id,resource_key,created_at);

create or replace function public.workflow_add_chapter_resource(
  p_workflow uuid,
  p_key text,
  p_label text,
  p_kind text,
  p_path text default null,
  p_url text default null,
  p_value text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare w public.course_workflows%rowtype; rid uuid;
begin
  select * into w from public.course_workflows where id=p_workflow;
  if not found or not public.workflow_is_lead(w.course_id) then
    raise exception 'Course management access required' using errcode='42501';
  end if;
  if p_kind not in ('file','image','link','text') then raise exception 'Unknown resource type'; end if;
  insert into public.workflow_chapter_resources(workflow_id,resource_key,label,kind,storage_path,url,value,uploaded_by)
  values(p_workflow,p_key,p_label,p_kind,p_path,p_url,p_value,auth.uid()) returning id into rid;
  return rid;
end $$;
revoke all on function public.workflow_add_chapter_resource(uuid,text,text,text,text,text,text) from public;
grant execute on function public.workflow_add_chapter_resource(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.workflow_delete_chapter_resource(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare w public.course_workflows%rowtype;
begin
  select cw.* into w
  from public.workflow_chapter_resources r
  join public.course_workflows cw on cw.id=r.workflow_id
  where r.id=p_id;
  if not found then return; end if;
  if not public.workflow_is_lead(w.course_id) then
    raise exception 'Course management access required' using errcode='42501';
  end if;
  delete from public.workflow_chapter_resources where id=p_id;
end $$;
revoke all on function public.workflow_delete_chapter_resource(uuid) from public;
grant execute on function public.workflow_delete_chapter_resource(uuid) to authenticated;

-- Keep legacy save RPC, but append instead of replacing now that each slot is a collection.
create or replace function public.workflow_save_chapter_resource(p_workflow uuid,p_key text,p_label text,p_kind text,p_path text default null,p_url text default null,p_value text default null) returns uuid
language sql security definer set search_path=public as $$
  select public.workflow_add_chapter_resource(p_workflow,p_key,p_label,p_kind,p_path,p_url,p_value)
$$;

-- ---------------------------------------------------------------------------
-- 3) Task required inputs accept image resources as a first-class kind.
-- ---------------------------------------------------------------------------
alter table public.workflow_task_resources
  drop constraint if exists workflow_task_resources_kind_check;
alter table public.workflow_task_resources
  add constraint workflow_task_resources_kind_check
  check(kind in ('file','image','link','text'));

create or replace function public.workflow_add_task_resource(p_task uuid,p_label text,p_kind text,p_path text default null,p_url text default null,p_value text default null,p_required boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; rid uuid;
begin
  select * into t from public.workflow_tasks where id=p_task; if not found then raise exception 'Unknown task'; end if;
  select * into w from public.course_workflows where id=t.workflow_id;
  if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required' using errcode='42501'; end if;
  if p_kind not in ('file','image','link','text') then raise exception 'Unknown resource type'; end if;
  insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by)
  values(p_task,p_label,p_kind,p_path,p_url,p_value,p_required,auth.uid()) returning id into rid;
  return rid;
end $$;
revoke all on function public.workflow_add_task_resource(uuid,text,text,text,text,text,boolean) from public;
grant execute on function public.workflow_add_task_resource(uuid,text,text,text,text,text,boolean) to authenticated;

-- Collaboration payload now exposes instruction scope for badges in the UI.
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
revoke all on function public.workflow_task_collaboration(uuid) from public;
grant execute on function public.workflow_task_collaboration(uuid) to authenticated;
