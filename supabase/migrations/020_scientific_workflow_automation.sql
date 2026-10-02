-- TERYAQ Master Tool v2.8.0
-- Scientific Draft & Design workflow automation, multi-executors, task collaboration,
-- review inbox, required-input visibility, chapter author assignment and four submission forms.
-- Apply after 019_chapter_work_areas_course_roles.sql.

-- ---------------------------------------------------------------------------
-- 1) Course management roles: one overall Course Lead + 3 specialized leads.
-- Keep legacy rows readable, but the current UI only creates these four roles.
-- ---------------------------------------------------------------------------
alter table public.course_management_roles drop constraint if exists course_management_roles_role_check;
delete from public.course_management_roles where role in ('production_lead','post_production_lead');
alter table public.course_management_roles add constraint course_management_roles_role_check
  check(role in ('course_lead','scientific_lead','script_lead','ai_lead'));

-- Existing v2.7.6 course managers were expanded to many scoped roles. Preserve access by
-- promoting one current manager per course to overall Course Lead when none exists.
insert into public.course_management_roles(course_id,user_id,role,assigned_by)
select distinct on (r.course_id) r.course_id,r.user_id,'course_lead',r.assigned_by
from public.course_management_roles r
where not exists(select 1 from public.course_management_roles x where x.course_id=r.course_id and x.role='course_lead')
order by r.course_id,r.assigned_at
on conflict do nothing;

create or replace function public.workflow_role_for_stage(p_stage text) returns text
language sql immutable as $$
 select case p_stage
  when 'Scientific Draft' then 'scientific_lead'
  when 'Shooting Script' then 'script_lead'
  when 'Questions' then 'ai_lead'
  when 'Flashcards' then 'ai_lead'
  else null
 end
$$;

create or replace function public.workflow_is_course_lead(p_course uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(
   select 1 from public.course_management_roles r
   where r.course_id=p_course and r.user_id=auth.uid() and r.role='course_lead'
 )
$$;
revoke all on function public.workflow_is_course_lead(uuid) from public;
grant execute on function public.workflow_is_course_lead(uuid) to authenticated;

create or replace function public.workflow_is_lead(p_course uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(
   select 1 from public.course_management_roles r where r.course_id=p_course and r.user_id=auth.uid()
 )
$$;

create or replace function public.workflow_can_manage_stage(p_course uuid,p_stage text) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(
   select 1 from public.course_management_roles r
   where r.course_id=p_course and r.user_id=auth.uid()
     and (r.role='course_lead' or r.role=public.workflow_role_for_stage(p_stage))
 )
$$;

create or replace function public.workflow_set_course_role(p_course uuid,p_user uuid,p_role text,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_role not in ('course_lead','scientific_lead','script_lead','ai_lead') then raise exception 'Unknown course role'; end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Unknown user'; end if;
 if p_enabled then
   insert into public.course_management_roles(course_id,user_id,role,assigned_by)
   values(p_course,p_user,p_role,auth.uid()) on conflict(course_id,user_id,role) do nothing;
 else
   delete from public.course_management_roles where course_id=p_course and user_id=p_user and role=p_role;
 end if;
 perform public.record_admin_event('workflow.course_role_changed','course',p_course::text,p_user,
   jsonb_build_object('role',p_role,'enabled',p_enabled));
end $$;
revoke all on function public.workflow_set_course_role(uuid,uuid,text,boolean) from public;
grant execute on function public.workflow_set_course_role(uuid,uuid,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Task numbering + assignment model.
-- ---------------------------------------------------------------------------
alter table public.workflow_tasks add column if not exists display_number text;
alter table public.workflow_tasks add column if not exists assignment_mode text not null default 'users'
  check(assignment_mode in ('users','course_team'));

create table if not exists public.workflow_task_executors (
 task_id uuid not null references public.workflow_tasks(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 assigned_by uuid references public.profiles(id),
 assigned_at timestamptz not null default now(),
 primary key(task_id,user_id)
);
create index if not exists workflow_task_executors_user_idx on public.workflow_task_executors(user_id,task_id);
alter table public.workflow_task_executors enable row level security;
drop policy if exists workflow_task_executors_read on public.workflow_task_executors;
create policy workflow_task_executors_read on public.workflow_task_executors for select to authenticated using(true);
revoke all on public.workflow_task_executors from anon,authenticated;
grant select on public.workflow_task_executors to authenticated;

-- Migrate current single owner into executor table (non-destructive; owner_id remains for compatibility).
insert into public.workflow_task_executors(task_id,user_id,assigned_by)
select id,owner_id,owner_id from public.workflow_tasks where owner_id is not null
on conflict do nothing;

create table if not exists public.workflow_chapter_roles (
 workflow_id uuid not null references public.course_workflows(id) on delete cascade,
 role text not null check(role in ('scientific_author')),
 user_id uuid not null references public.profiles(id) on delete cascade,
 assigned_by uuid not null references public.profiles(id),
 assigned_at timestamptz not null default now(),
 primary key(workflow_id,role)
);
alter table public.workflow_chapter_roles enable row level security;
drop policy if exists workflow_chapter_roles_read on public.workflow_chapter_roles;
create policy workflow_chapter_roles_read on public.workflow_chapter_roles for select to authenticated using(true);
revoke all on public.workflow_chapter_roles from anon,authenticated;
grant select on public.workflow_chapter_roles to authenticated;

create or replace function public.workflow_task_is_executor(p_task uuid,p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.workflow_task_executors e where e.task_id=p_task and e.user_id=p_user)
 or exists(
   select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id
   where t.id=p_task and t.assignment_mode='course_team' and (
     exists(select 1 from public.course_management_roles r where r.course_id=w.course_id and r.user_id=p_user)
     or exists(select 1 from public.workflow_chapter_roles cr join public.course_workflows cw on cw.id=cr.workflow_id where cw.course_id=w.course_id and cr.user_id=p_user)
     or exists(select 1 from public.workflow_task_executors e2 join public.workflow_tasks t2 on t2.id=e2.task_id join public.course_workflows w2 on w2.id=t2.workflow_id where w2.course_id=w.course_id and e2.user_id=p_user)
   )
 )
$$;
revoke all on function public.workflow_task_is_executor(uuid,uuid) from public;
grant execute on function public.workflow_task_is_executor(uuid,uuid) to authenticated;

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
   owner_id=case when p_course_team then null else (select min(user_id) from public.workflow_task_executors where task_id=p_task) end
 where id=p_task;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,auth.uid(),'assign_executors',jsonb_build_object('users',coalesce(p_users,'{}'::uuid[]),'course_team',p_course_team));
end $$;
revoke all on function public.workflow_set_task_executors(uuid,uuid[],boolean) from public;
grant execute on function public.workflow_set_task_executors(uuid,uuid[],boolean) to authenticated;

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
 for tid in select id from public.workflow_tasks where workflow_id=p_workflow and task_key in ('draft-v1','draft-v2','draft-v3','draft-v4','draft-v5') loop
   insert into public.workflow_task_executors(task_id,user_id,assigned_by) values(tid,p_user,auth.uid()) on conflict do nothing;
   update public.workflow_tasks set owner_id=p_user,author_id=p_user where id=tid and assignment_mode='users';
 end loop;
end $$;
revoke all on function public.workflow_set_chapter_role(uuid,text,uuid) from public;
grant execute on function public.workflow_set_chapter_role(uuid,text,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Task instructions, checklist progress, comments, manual resources.
-- ---------------------------------------------------------------------------
create table if not exists public.workflow_task_instructions (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.workflow_tasks(id) on delete cascade,
 kind text not null check(kind in ('text','checklist')), title text not null default '', content jsonb not null default '{}'::jsonb,
 sort_order integer not null default 0, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.workflow_task_check_state (
 instruction_id uuid not null references public.workflow_task_instructions(id) on delete cascade,
 item_id text not null, checked_by uuid not null references public.profiles(id), checked boolean not null default false, updated_at timestamptz not null default now(),
 primary key(instruction_id,item_id,checked_by)
);
create table if not exists public.workflow_task_comments (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.workflow_tasks(id) on delete cascade,
 author_id uuid not null references public.profiles(id), body text not null check(length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(), edited_at timestamptz
);
create table if not exists public.workflow_chapter_resources (
 id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.course_workflows(id) on delete cascade,
 resource_key text not null, label text not null, kind text not null check(kind in ('file','link','text')),
 storage_path text, url text, value text, uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workflow_id,resource_key)
);
create table if not exists public.workflow_task_resources (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.workflow_tasks(id) on delete cascade,
 label text not null, kind text not null check(kind in ('file','link','text')), storage_path text, url text, value text,
 required boolean not null default true, uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.workflow_task_instructions enable row level security;
alter table public.workflow_task_check_state enable row level security;
alter table public.workflow_task_comments enable row level security;
alter table public.workflow_chapter_resources enable row level security;
alter table public.workflow_task_resources enable row level security;

drop policy if exists workflow_task_instructions_read on public.workflow_task_instructions;
create policy workflow_task_instructions_read on public.workflow_task_instructions for select to authenticated using(true);
drop policy if exists workflow_task_comments_read on public.workflow_task_comments;
create policy workflow_task_comments_read on public.workflow_task_comments for select to authenticated using(true);
drop policy if exists workflow_check_state_read on public.workflow_task_check_state;
create policy workflow_check_state_read on public.workflow_task_check_state for select to authenticated using(true);
drop policy if exists workflow_chapter_resources_read on public.workflow_chapter_resources;
create policy workflow_chapter_resources_read on public.workflow_chapter_resources for select to authenticated using(true);
revoke all on public.workflow_task_instructions,public.workflow_task_check_state,public.workflow_task_comments,public.workflow_chapter_resources from anon,authenticated;
grant select on public.workflow_task_instructions,public.workflow_task_check_state,public.workflow_task_comments,public.workflow_chapter_resources to authenticated;
revoke all on public.workflow_task_resources from anon,authenticated;
-- Task resources are exposed only through security-definer RPCs; no direct SELECT grant.

create or replace function public.workflow_add_instruction(p_task uuid,p_kind text,p_title text,p_content jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; newid uuid;
begin
 select * into t from public.workflow_tasks where id=p_task; if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required' using errcode='42501'; end if;
 if p_kind not in ('text','checklist') then raise exception 'Unknown instruction type'; end if;
 insert into public.workflow_task_instructions(task_id,kind,title,content,sort_order,created_by)
 values(p_task,p_kind,coalesce(p_title,''),coalesce(p_content,'{}'::jsonb),coalesce((select max(sort_order)+1 from public.workflow_task_instructions where task_id=p_task),0),auth.uid()) returning id into newid;
 return newid;
end $$;
grant execute on function public.workflow_add_instruction(uuid,text,text,jsonb) to authenticated;

create or replace function public.workflow_delete_instruction(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 select wt.* into t from public.workflow_task_instructions i join public.workflow_tasks wt on wt.id=i.task_id where i.id=p_id;
 if not found then return; end if; select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required' using errcode='42501'; end if;
 delete from public.workflow_task_instructions where id=p_id;
end $$;
grant execute on function public.workflow_delete_instruction(uuid) to authenticated;

create or replace function public.workflow_toggle_check(p_instruction uuid,p_item text,p_checked boolean) returns void
language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 select task_id into tid from public.workflow_task_instructions where id=p_instruction and kind='checklist';
 if tid is null or not public.workflow_task_is_executor(tid,auth.uid()) then raise exception 'Task executor access required' using errcode='42501'; end if;
 insert into public.workflow_task_check_state(instruction_id,item_id,checked_by,checked,updated_at)
 values(p_instruction,p_item,auth.uid(),p_checked,now()) on conflict(instruction_id,item_id,checked_by) do update set checked=excluded.checked,updated_at=now();
end $$;
grant execute on function public.workflow_toggle_check(uuid,text,boolean) to authenticated;

create or replace function public.workflow_add_comment(p_task uuid,p_body text) returns uuid
language plpgsql security definer set search_path=public as $$
declare newid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if btrim(coalesce(p_body,''))='' then raise exception 'Comment is empty'; end if;
 insert into public.workflow_task_comments(task_id,author_id,body) values(p_task,auth.uid(),btrim(p_body)) returning id into newid;
 return newid;
end $$;
grant execute on function public.workflow_add_comment(uuid,text) to authenticated;

-- Workflow resource bucket for admin/lead supplied PDFs, images and other task references.
insert into storage.buckets(id,name,public) values('teryaq-workflow','teryaq-workflow',false) on conflict(id) do update set public=false;
drop policy if exists workflow_resource_manager_upload on storage.objects;
create policy workflow_resource_manager_upload on storage.objects for insert to authenticated
with check(bucket_id='teryaq-workflow' and exists(
 select 1 from public.course_workflows w where w.id::text=(storage.foldername(name))[1] and public.workflow_is_lead(w.course_id)
));
drop policy if exists workflow_resource_manager_update on storage.objects;
create policy workflow_resource_manager_update on storage.objects for update to authenticated
using(bucket_id='teryaq-workflow' and exists(select 1 from public.course_workflows w where w.id::text=(storage.foldername(name))[1] and public.workflow_is_lead(w.course_id)))
with check(bucket_id='teryaq-workflow');
drop policy if exists workflow_resource_read on storage.objects;
create policy workflow_resource_read on storage.objects for select to authenticated using(bucket_id='teryaq-workflow');

create or replace function public.workflow_save_chapter_resource(p_workflow uuid,p_key text,p_label text,p_kind text,p_path text default null,p_url text default null,p_value text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare w public.course_workflows%rowtype; rid uuid;
begin
 select * into w from public.course_workflows where id=p_workflow;
 if not found or not public.workflow_is_lead(w.course_id) then raise exception 'Course management access required' using errcode='42501'; end if;
 if p_kind not in ('file','link','text') then raise exception 'Unknown resource type'; end if;
 insert into public.workflow_chapter_resources(workflow_id,resource_key,label,kind,storage_path,url,value,uploaded_by)
 values(p_workflow,p_key,p_label,p_kind,p_path,p_url,p_value,auth.uid())
 on conflict(workflow_id,resource_key) do update set label=excluded.label,kind=excluded.kind,storage_path=excluded.storage_path,url=excluded.url,value=excluded.value,uploaded_by=excluded.uploaded_by,updated_at=now()
 returning id into rid; return rid;
end $$;
grant execute on function public.workflow_save_chapter_resource(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.workflow_add_task_resource(p_task uuid,p_label text,p_kind text,p_path text default null,p_url text default null,p_value text default null,p_required boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; rid uuid;
begin
 select * into t from public.workflow_tasks where id=p_task; if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required' using errcode='42501'; end if;
 if p_kind not in ('file','link','text') then raise exception 'Unknown resource type'; end if;
 insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by)
 values(p_task,p_label,p_kind,p_path,p_url,p_value,p_required,auth.uid()) returning id into rid;
 return rid;
end $$;
grant execute on function public.workflow_add_task_resource(uuid,text,text,text,text,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Scientific Draft exact numbering and task definitions.
-- ---------------------------------------------------------------------------
update public.workflow_templates set title='TERYAQ chapter work areas',updated_at=now(),steps='[
 {"key":"scope","number":"1","title":"تحديد المنهج","description":"قراءة وفهم المنهج وتحديد نطاق العمل لهذا الكورس.","stage":"Scientific Draft","depends":[],"required":true},
 {"key":"sources","number":"2","title":"تحديد المصادر","description":"توفير المصادر المطلوبة وروابطها.","stage":"Scientific Draft","depends":["scope"],"required":true},
 {"key":"timeline","number":"3","title":"وضع جدول زمني وتحديد المكافأة","description":"تحديد الجدول الزمني وتقدير الوقت والمكافأة.","stage":"Scientific Draft","depends":["sources"],"required":true},
 {"key":"roles","number":"4","title":"توزيع المهام والأدوار","description":"تحديد أعضاء الفريق وتوزيع المهام والمسؤوليات.","stage":"Scientific Draft","depends":["timeline"],"required":true},
 {"key":"draft-v1","number":"5","title":"كتابة المسودة العلمية — Version 1","description":"كتابة النسخة الأولى للمسودة العلمية.","stage":"Scientific Draft","depends":["roles"],"template":"scientific-draft-text","version":"1","required":true},
 {"key":"draft-v1-review","number":"6","title":"Scientific Draft V1 Review","description":"6.1 First Scientific Draft Report · 6.2 Simplified Audit · 6.3 Figures, Shapes & Diagrams Recreation.","stage":"Scientific Draft","depends":["draft-v1"],"template":"scientific-draft-v1-review","version":"1","required":true},
 {"key":"draft-v2","number":"7","title":"التحديث الأول للمسودة العلمية — Version 2","description":"تحديث المسودة باستخدام مخرجات Scientific Draft V1 Review.","stage":"Scientific Draft","depends":["draft-v1-review"],"template":"scientific-draft-text","version":"2","required":true},
 {"key":"responsible-review","number":"8","title":"عرض المسودة العلمية على مسؤول المسودة العلمية","description":"عرض Version 2 بكل مرفقاتها على المسؤول العلمي.","stage":"Scientific Draft","depends":["draft-v2"],"required":true},
 {"key":"draft-v3","number":"9","title":"التحديث الثاني للمسودة العلمية — Version 3","description":"تحديث المسودة بناءً على مراجعة المسؤول العلمي.","stage":"Scientific Draft","depends":["responsible-review"],"template":"scientific-draft-text","version":"3","required":true},
 {"key":"comprehensive-audit-1","number":"10","title":"Comprehensive Scientific Audit 1","description":"التدقيق الشامل الأول بواسطة فريق AI.","stage":"Scientific Draft","depends":["draft-v3"],"template":"comprehensive-scientific-audit","version":"1","required":true},
 {"key":"draft-v4","number":"11","title":"التحديث الثالث للمسودة العلمية — Version 4","description":"تطبيق تقرير التدقيق الشامل الأول.","stage":"Scientific Draft","depends":["comprehensive-audit-1"],"template":"scientific-draft-text","version":"4","required":true},
 {"key":"design-v1","number":"12","title":"تصميم المسودة العلمية — Design Version 1","description":"تصميم Scientific Draft Version 4 وفق هوية ترياق.","stage":"Scientific Draft","depends":["draft-v4"],"template":"designed-scientific-draft","version":"1","required":true},
 {"key":"comprehensive-audit-2","number":"13.1","title":"Comprehensive Scientific Audit 2","description":"التدقيق الشامل الثاني للملف المصمم.","stage":"Scientific Draft","depends":["design-v1"],"template":"comprehensive-scientific-audit","version":"2","required":true},
 {"key":"accuracy-review","number":"13.2","title":"100% Accuracy Review","description":"مراجعة الدقة النهائية وإضافة الملاحظات النصية مع تقرير التدقيق الشامل 2.","stage":"Scientific Draft","depends":["design-v1"],"required":true},
 {"key":"design-v2","number":"14.1","title":"تعديل الملف المصمم — Design Version 2","description":"تعديل التصميم الأول بناءً على Comprehensive Scientific Audit 2.","stage":"Scientific Draft","depends":["comprehensive-audit-2","accuracy-review"],"template":"designed-scientific-draft","version":"2","required":true},
 {"key":"draft-v5","number":"14.2","title":"Scientific Draft — Version 5","description":"تحديث النص بناءً على Comprehensive Scientific Audit 2.","stage":"Scientific Draft","depends":["comprehensive-audit-2","accuracy-review"],"template":"scientific-draft-text","version":"5","required":true},

 {"key":"script-read","number":"1","title":"قراءة وفهم واستيعاب الملف المصمم","description":"فهم الملف المصمم بالكامل قبل كتابة السكريبت.","stage":"Shooting Script","depends":["design-v2","draft-v5"],"required":true},
 {"key":"script-v1","number":"2","title":"كتابة سكريبت التصوير – النسخة الأولى","description":"كتابة النسخة الأولى ثم إجراء تدقيق AI عليها.","stage":"Shooting Script","depends":["script-read"],"template":"shooting-script","version":"1","required":true}
]'::jsonb where id='standard-v1';

-- Number and rename compatible existing v2.7.6 scientific tasks when possible.
update public.workflow_tasks set display_number=case task_key
 when 'scope' then '1' when 'sources' then '2' when 'timeline' then '3' when 'roles' then '4'
 when 'draft-v1' then '5' when 'draft-attachments' then '6' when 'draft-update-1' then '7'
 when 'responsible-review' then '8' when 'draft-update-2' then '9' when 'comprehensive-audit-1' then '10'
 when 'draft-update-3' then '11' when 'design-draft' then '12' when 'design-review' then '13' when 'draft-final' then '14'
 else display_number end
where stage='Scientific Draft';


-- Upgrade existing v2.7.6 chapter cycles in place so the test does not require recreating chapters.
update public.workflow_tasks set task_key='draft-v1-review',title='Scientific Draft V1 Review',description='6.1 First Scientific Draft Report · 6.2 Simplified Audit · 6.3 Figures, Shapes & Diagrams Recreation.',display_number='6',template_id='scientific-draft-v1-review',expected_version='1' where task_key='draft-attachments';
update public.workflow_tasks set task_key='draft-v2',title='التحديث الأول للمسودة العلمية — Version 2',display_number='7',expected_version='2' where task_key='draft-update-1';
update public.workflow_tasks set display_number='8',title='عرض المسودة العلمية على مسؤول المسودة العلمية' where task_key='responsible-review';
update public.workflow_tasks set task_key='draft-v3',title='التحديث الثاني للمسودة العلمية — Version 3',display_number='9',expected_version='3' where task_key='draft-update-2';
update public.workflow_tasks set display_number='10',title='Comprehensive Scientific Audit 1',template_id='comprehensive-scientific-audit',expected_version='1' where task_key='comprehensive-audit-1';
update public.workflow_tasks set task_key='draft-v4',title='التحديث الثالث للمسودة العلمية — Version 4',display_number='11',expected_version='4' where task_key='draft-update-3';
update public.workflow_tasks set task_key='design-v1',title='تصميم المسودة العلمية — Design Version 1',display_number='12',template_id='designed-scientific-draft',expected_version='1',sort_order=12 where task_key='design-draft';
update public.workflow_tasks set task_key='comprehensive-audit-2',title='Comprehensive Scientific Audit 2',display_number='13.1',template_id='comprehensive-scientific-audit',expected_version='2',sort_order=13 where task_key='design-review';
update public.workflow_tasks set task_key='design-v2',title='تعديل الملف المصمم — Design Version 2',display_number='14.1',template_id='designed-scientific-draft',expected_version='2',sort_order=15 where task_key='draft-final';

insert into public.workflow_tasks(workflow_id,task_key,title,description,stage,sort_order,display_number,depends_on,required,status)
select w.id,'accuracy-review','100% Accuracy Review','مراجعة الدقة النهائية وإضافة الملاحظات النصية مع تقرير التدقيق الشامل 2.','Scientific Draft',14,'13.2',array['design-v1'],true,'planned'
from public.course_workflows w where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='comprehensive-audit-2')
on conflict(workflow_id,task_key) do nothing;
insert into public.workflow_tasks(workflow_id,task_key,title,description,stage,sort_order,display_number,depends_on,required,template_id,expected_version,status)
select w.id,'draft-v5','Scientific Draft — Version 5','تحديث النص بناءً على Comprehensive Scientific Audit 2.','Scientific Draft',16,'14.2',array['comprehensive-audit-2','accuracy-review'],true,'scientific-draft-text','5','planned'
from public.course_workflows w where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='design-v2')
on conflict(workflow_id,task_key) do nothing;
update public.workflow_tasks set depends_on=array['draft-v1-review'] where task_key='draft-v2';
update public.workflow_tasks set depends_on=array['draft-v2'] where task_key='responsible-review';
update public.workflow_tasks set depends_on=array['responsible-review'] where task_key='draft-v3';
update public.workflow_tasks set depends_on=array['draft-v3'] where task_key='comprehensive-audit-1';
update public.workflow_tasks set depends_on=array['comprehensive-audit-1'] where task_key='draft-v4';
update public.workflow_tasks set depends_on=array['draft-v4'] where task_key='design-v1';
update public.workflow_tasks set depends_on=array['design-v1'] where task_key in ('comprehensive-audit-2','accuracy-review');
update public.workflow_tasks set depends_on=array['comprehensive-audit-2','accuracy-review'] where task_key in ('design-v2','draft-v5');

-- Future workflows get the exact display number from the template snapshot.
create or replace function public.workflow_create(p_course uuid,p_chapter uuid,p_new_cycle boolean default false,p_reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare w uuid; tmpl public.workflow_templates%rowtype; cycle_no integer; step jsonb; old_cycle integer;
begin
 if auth.uid() is null or not public.workflow_is_lead(p_course) then raise exception 'Course management access required' using errcode='42501'; end if;
 if not exists(select 1 from public.content_chapters where id=p_chapter and subject_id=p_course) then raise exception 'Chapter does not belong to course'; end if;
 select * into tmpl from public.workflow_templates where id='standard-v1';
 select max(cycle) into old_cycle from public.course_workflows where chapter_id=p_chapter;
 if old_cycle is not null and not p_new_cycle then return (select id from public.course_workflows where chapter_id=p_chapter and cycle=old_cycle); end if;
 cycle_no:=coalesce(old_cycle,0)+1;
 if old_cycle is not null and btrim(coalesce(p_reason,''))='' then raise exception 'New cycle reason required'; end if;
 insert into public.course_workflows(course_id,chapter_id,cycle,template_snapshot,created_by) values(p_course,p_chapter,cycle_no,tmpl.steps,auth.uid()) returning id into w;
 for step in select value from jsonb_array_elements(tmpl.steps) loop
   insert into public.workflow_tasks(workflow_id,task_key,title,description,stage,sort_order,display_number,depends_on,required,template_id,expected_version,status)
   values(w,step->>'key',step->>'title',step->>'description',step->>'stage',(select count(*) from public.workflow_tasks where workflow_id=w)+1,
     coalesce(step->>'number',((select count(*) from public.workflow_tasks where workflow_id=w)+1)::text),
     array(select jsonb_array_elements_text(coalesce(step->'depends','[]'::jsonb))),coalesce((step->>'required')::boolean,true),step->>'template',step->>'version',
     case when jsonb_array_length(coalesce(step->'depends','[]'::jsonb))=0 then 'ready' else 'planned' end);
 end loop;
 return w;
end $$;
revoke all on function public.workflow_create(uuid,uuid,boolean,text) from public;
grant execute on function public.workflow_create(uuid,uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Submission forms and versions.
-- ---------------------------------------------------------------------------
insert into public.content_template_versions(template_id,version_label,sort_order) values
 ('scientific-draft-text','5',5),('scientific-draft-figures','5',5),('designed-scientific-draft','1',1),('designed-scientific-draft','2',2),
 ('scientific-draft-v1-review','1',1),('comprehensive-scientific-audit','1',1),('comprehensive-scientific-audit','2',2)
on conflict do nothing;

-- Scientific Draft form: preserve the established base package; add version-specific completed reports.
insert into public.submission_form_configs(id,title,description,template_id,active,configuration,updated_at) values
('scientific-draft','نموذج تسليم المسودة العلمية - Scientific Draft Submission form','تسليم ملفات المسودة العلمية ومراجعة جودة المخرجات','scientific-draft-text',true,
jsonb_build_object('requirements',jsonb_build_object('enabled',true,'title','جهّز ملفات التسليم قبل البدء','description','الملفات الإضافية تظهر تلقائيًا حسب النسخة.'),'sections',jsonb_build_array(
 jsonb_build_object('id','information','title','القسم 1 — معلومات أساسية','fields',jsonb_build_array(
  jsonb_build_object('id','writer','label','اسم كاتب المسودة العلمية','type','author','required',true),
  jsonb_build_object('id','category','label','التصنيف','type','category','required',true),
  jsonb_build_object('id','course','label','المساق','type','course','required',true),
  jsonb_build_object('id','chapter','label','الشابتر','type','chapter','required',true),
  jsonb_build_object('id','version','label','نسخة المسودة العلمية','type','version','required',true),
  jsonb_build_object('id','startDate','label','تاريخ بدء الكتابة','type','date','required',true),
  jsonb_build_object('id','endDate','label','تاريخ الانتهاء','type','date','required',true),
  jsonb_build_object('id','estimatedHours','label','الساعات المقدّرة','type','number','required',true))),
 jsonb_build_object('id','deliverables','title','القسم 2 — المخرجات والملفات','fields',jsonb_build_array(
  jsonb_build_object('id','textHtml','label','المسودة العلمية النصية — HTML','type','file','accept','.html,.htm','required',true),
  jsonb_build_object('id','textTeryaq','label','المسودة العلمية النصية — ملف .ترياق (JSON)','type','file','accept','.ترياق,.teryaq','required',true),
  jsonb_build_object('id','figuresHtml','label','المسودة العلمية مع الصور — HTML','type','file','accept','.html,.htm','required',true),
  jsonb_build_object('id','figuresPdf','label','المسودة العلمية مع الصور — PDF','type','file','accept','.pdf','required',true),
  jsonb_build_object('id','figuresOnlyPdf','label','الصور فقط مع Figure أسفل كل صورة — PDF','type','file','accept','.pdf','required',true),
  jsonb_build_object('id','drawio','label','ملف Draw.io، عند استخدامه','type','file','accept','.drawio,.xml','required',false),
  jsonb_build_object('id','originalImages','label','الصور الأصلية — ملف مضغوط','type','file','accept','.zip','required',true),
  jsonb_build_object('id','completedSimplifiedAudit','label','Completed Simplified Audit — HTML','type','file','accept','.html,.htm','required',true,'showWhen',jsonb_build_object('field','version','equals','2')),
  jsonb_build_object('id','completedFirstReport','label','Completed First Scientific Draft Report — HTML','type','file','accept','.html,.htm','required',true,'showWhen',jsonb_build_object('field','version','equals','2')),
  jsonb_build_object('id','completedComprehensiveAudit1','label','Completed Comprehensive Scientific Audit 1 — HTML','type','file','accept','.html,.htm','required',true,'showWhen',jsonb_build_object('field','version','equals','4')),
  jsonb_build_object('id','completedComprehensiveAudit2','label','Completed Comprehensive Scientific Audit 2 — HTML','type','file','accept','.html,.htm','required',true,'showWhen',jsonb_build_object('field','version','equals','5')))),
 jsonb_build_object('id','notes','title','القسم 3 — الملاحظات','fields',jsonb_build_array(
  jsonb_build_object('id','designNotes','label','ملاحظات للمصمم','type','textarea','required',false),
  jsonb_build_object('id','scriptNotes','label','ملاحظات لكاتب السكريبت','type','textarea','required',false),
  jsonb_build_object('id','obstacles','label','ملاحظات أو عقبات عامة','type','textarea','required',false))),
 jsonb_build_object('id','declaration','title','القسم 4 — الإقرار','fields',jsonb_build_array(
  jsonb_build_object('id','agree','label','أقرّ بأن الملفات تمثل النسخة الحالية الصحيحة للمسودة العلمية.','type','yesno','required',true)))
)),now())
on conflict(id) do update set title=excluded.title,description=excluded.description,template_id=excluded.template_id,active=true,configuration=excluded.configuration,updated_at=now();

insert into public.submission_form_configs(id,title,description,template_id,active,configuration,updated_at) values
('scientific-draft-v1-review','Scientific Draft V1 Review Submission Form','تسليم المخرجات الثلاثة لمراجعة Scientific Draft V1','scientific-draft-v1-review',true,
jsonb_build_object('requirements',jsonb_build_object('enabled',true),'sections',jsonb_build_array(
 jsonb_build_object('id','information','title','Submission Information','fields',jsonb_build_array(
  jsonb_build_object('id','writer','label','Task Executor','type','author','required',true),jsonb_build_object('id','category','label','Classification','type','category','required',true),jsonb_build_object('id','course','label','Course','type','course','required',true),jsonb_build_object('id','chapter','label','Chapter','type','chapter','required',true),jsonb_build_object('id','version','label','Review Version','type','version','required',true),jsonb_build_object('id','estimatedHours','label','Estimated Hours Spent','type','number','required',true))),
 jsonb_build_object('id','outputs','title','Review Outputs','fields',jsonb_build_array(
  jsonb_build_object('id','firstReport','label','First Scientific Draft Report — HTML','type','file','accept','.html,.htm','required',true),
  jsonb_build_object('id','simplifiedAudit','label','Simplified Audit — HTML','type','file','accept','.html,.htm','required',true),
  jsonb_build_object('id','figuresRecreation','label','Figures, Shapes & Diagrams Recreation — ZIP','type','file','accept','.zip','required',true))),
 jsonb_build_object('id','notes','title','Notes','fields',jsonb_build_array(jsonb_build_object('id','submissionNotes','label','Submission Notes','type','textarea','required',false)))
)),now()) on conflict(id) do update set configuration=excluded.configuration,title=excluded.title,description=excluded.description,template_id=excluded.template_id,active=true,updated_at=now();

insert into public.submission_form_configs(id,title,description,template_id,active,configuration,updated_at) values
('comprehensive-scientific-audit','Comprehensive Scientific Audit Submission Form','تسليم تقرير التدقيق الشامل — Version 1 أو Version 2','comprehensive-scientific-audit',true,
jsonb_build_object('requirements',jsonb_build_object('enabled',true),'sections',jsonb_build_array(
 jsonb_build_object('id','information','title','Submission Information','fields',jsonb_build_array(
  jsonb_build_object('id','writer','label','Task Executor','type','author','required',true),jsonb_build_object('id','category','label','Classification','type','category','required',true),jsonb_build_object('id','course','label','Course','type','course','required',true),jsonb_build_object('id','chapter','label','Chapter','type','chapter','required',true),jsonb_build_object('id','version','label','Audit Version','type','version','required',true),jsonb_build_object('id','estimatedHours','label','Estimated Hours Spent','type','number','required',true))),
 jsonb_build_object('id','report','title','Audit Report','fields',jsonb_build_array(
  jsonb_build_object('id','auditReport','label','Comprehensive Scientific Audit Report — HTML','type','file','accept','.html,.htm','required',true),
  jsonb_build_object('id','auditSummary','label','Audit Summary','type','textarea','required',false),
  jsonb_build_object('id','accuracyNotes','label','100% Accuracy Review Notes','type','textarea','required',true,'showWhen',jsonb_build_object('field','version','equals','2')))),
 jsonb_build_object('id','outcome','title','Audit Outcome','fields',jsonb_build_array(
  jsonb_build_object('id','outcome','label','Overall result','type','select','required',true,'options','Passed\nPassed with minor changes\nChanges required'),
  jsonb_build_object('id','majorIssues','label','Number of major issues','type','number','required',true),jsonb_build_object('id','minorIssues','label','Number of minor issues','type','number','required',true),jsonb_build_object('id','nextTaskNotes','label','Notes for the next task','type','textarea','required',false))),
 jsonb_build_object('id','confirmation','title','Confirmation','fields',jsonb_build_array(jsonb_build_object('id','agree','label','I confirm that the comprehensive scientific audit has been completed and the submitted report represents the final audit output.','type','checkbox','required',true)))
)),now()) on conflict(id) do update set configuration=excluded.configuration,title=excluded.title,description=excluded.description,template_id=excluded.template_id,active=true,updated_at=now();

insert into public.submission_form_configs(id,title,description,template_id,active,configuration,updated_at) values
('designed-scientific-draft','Designed Scientific Draft Submission Form','تسليم الملف المصمم — Design Version 1 أو 2','designed-scientific-draft',true,
jsonb_build_object('requirements',jsonb_build_object('enabled',true),'sections',jsonb_build_array(
 jsonb_build_object('id','information','title','Submission Information','fields',jsonb_build_array(
  jsonb_build_object('id','writer','label','Task Executor','type','author','required',true),jsonb_build_object('id','category','label','Classification','type','category','required',true),jsonb_build_object('id','course','label','Course','type','course','required',true),jsonb_build_object('id','chapter','label','Chapter','type','chapter','required',true),jsonb_build_object('id','version','label','Design Version','type','version','required',true),jsonb_build_object('id','estimatedHours','label','Estimated Hours Spent','type','number','required',true))),
 jsonb_build_object('id','design','title','Designed Scientific Draft','fields',jsonb_build_array(
  jsonb_build_object('id','designPdf','label','Designed Scientific Draft — PDF','type','file','accept','.pdf','required',true),
  jsonb_build_object('id','designHtml','label','Designed Scientific Draft — HTML','type','file','accept','.html,.htm','required',true),
  jsonb_build_object('id','submissionNotes','label','Submission Notes','type','textarea','required',false))),
 jsonb_build_object('id','confirmation','title','Confirmation','fields',jsonb_build_array(jsonb_build_object('id','agree','label','The submitted PDF and HTML represent the same current complete designed draft.','type','checkbox','required',true)))
)),now()) on conflict(id) do update set configuration=excluded.configuration,title=excluded.title,description=excluded.description,template_id=excluded.template_id,active=true,updated_at=now();

create or replace function public.workflow_people(p_course uuid) returns table(id uuid,display_name text)
language sql stable security definer set search_path=public as $$
 select distinct p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')
 from public.profiles p where
   exists(select 1 from public.course_management_roles r where r.course_id=p_course and r.user_id=p.id)
   or exists(select 1 from public.workflow_chapter_roles cr join public.course_workflows w on w.id=cr.workflow_id where w.course_id=p_course and cr.user_id=p.id)
   or exists(select 1 from public.workflow_task_executors e join public.workflow_tasks t on t.id=e.task_id join public.course_workflows w on w.id=t.workflow_id where w.course_id=p_course and e.user_id=p.id)
 order by 2
$$;
revoke all on function public.workflow_people(uuid) from public;
grant execute on function public.workflow_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Required inputs resolver. Returns only what the current user is allowed to see.
-- Preparation & Rules resources are public to authenticated course users; task Required Files
-- are limited to executors + stage managers + overall Course Lead + Admin.
-- ---------------------------------------------------------------------------
create or replace function public.workflow_pick_submission_file(p_files jsonb,p_field text,p_label text,p_required boolean default true) returns jsonb
language sql immutable as $$
 select coalesce((select jsonb_build_object('label',p_label,'kind','file','storage_path',x->>'path','name',x->>'name','available',true,'required',p_required,'source','Auto-linked submission') from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) x where x->>'fieldId'=p_field limit 1),
   jsonb_build_object('label',p_label,'kind','file','available',false,'required',p_required,'source','Waiting for submission'))
$$;
revoke all on function public.workflow_pick_submission_file(jsonb,text,text,boolean) from public;
grant execute on function public.workflow_pick_submission_file(jsonb,text,text,boolean) to authenticated;


create or replace function public.workflow_can_view_required_inputs(p_task uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(
   select 1 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id
   where t.id=p_task and (
     public.workflow_task_is_executor(t.id,auth.uid()) or public.workflow_can_manage_stage(w.course_id,t.stage) or public.workflow_is_course_lead(w.course_id)
   )
 )
$$;
grant execute on function public.workflow_can_view_required_inputs(uuid) to authenticated;

create or replace function public.workflow_required_inputs(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; result jsonb:='[]'::jsonb;
  src uuid; sub public.content_submissions%rowtype; f jsonb; key text;
begin
 select * into t from public.workflow_tasks where id=p_task; if not found then return result; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_view_required_inputs(p_task) then return null; end if;

 result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',r.label,'kind',r.kind,'storage_path',r.storage_path,'url',r.url,'value',r.value,'available',coalesce(nullif(r.storage_path,''),nullif(r.url,''),nullif(r.value,'')) is not null,'required',r.required,'source','Added by course management') order by r.created_at) from public.workflow_task_resources r where r.task_id=p_task),'[]'::jsonb);

 -- Helper-style inline cases. Every returned file includes storage path from the original submission.
 if t.task_key='draft-v1' then
   return result||coalesce((select jsonb_agg(jsonb_build_object('label',label,'kind',kind,'url',url,'storage_path',storage_path,'value',value,'available',coalesce(nullif(url,''),nullif(storage_path,''),nullif(value,'')) is not null,'required',true,'source','Preparation & Rules') order by resource_key)
     from public.workflow_chapter_resources where workflow_id=t.workflow_id and resource_key in ('curriculum_outlines','source_links','timeline','roles_distribution')),'[]'::jsonb);
 end if;

 if t.task_key='draft-v1-review' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v1');
 elsif t.task_key='draft-v2' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v1-review');
 elsif t.task_key in ('responsible-review','draft-v3') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v2');
 elsif t.task_key='comprehensive-audit-1' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v3');
 elsif t.task_key='draft-v4' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-1');
 elsif t.task_key='design-v1' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4');
 elsif t.task_key in ('comprehensive-audit-2','accuracy-review') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='design-v1');
 elsif t.task_key='design-v2' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-2');
 elsif t.task_key='draft-v5' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-2');
 end if;

 if src is not null then select * into sub from public.content_submissions where workflow_task_id=src and status='submitted' and deleted_at is null order by submitted_at desc limit 1; end if;

 if t.task_key='draft-v1-review' then
   result:=result||jsonb_build_array(
    jsonb_build_object('group','6.1','label','First Scientific Draft Report inputs','items',jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V1 — Text HTML'))),
    jsonb_build_object('group','6.2','label','Simplified Audit inputs','items',jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V1 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V1 — With Images HTML'))),
    jsonb_build_object('group','6.3','label','Figures, Shapes & Diagrams Recreation inputs','items',jsonb_build_array(public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V1 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'),public.workflow_pick_submission_file(sub.files,'drawio','Draw.io (if used)',false),public.workflow_pick_submission_file(sub.files,'originalImages','Original Images ZIP')))
   );
 elsif t.task_key='draft-v2' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'firstReport','First Scientific Draft Report'),public.workflow_pick_submission_file(sub.files,'simplifiedAudit','Simplified Audit'),public.workflow_pick_submission_file(sub.files,'figuresRecreation','Figures, Shapes & Diagrams Recreation'));
 elsif t.task_key in ('responsible-review','draft-v3') then
   if sub.id is not null then result:=coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(x->>'label',x->>'fieldId'),'kind','file','storage_path',x->>'path','available',true,'source','Scientific Draft Version 2')) from jsonb_array_elements(sub.files) x),'[]'::jsonb); end if;
 elsif t.task_key='comprehensive-audit-1' then
   if sub.id is not null then result:=coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(x->>'label',x->>'fieldId'),'kind','file','storage_path',x->>'path','available',true,'source','Scientific Draft Version 3')) from jsonb_array_elements(sub.files) x),'[]'::jsonb); end if;
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v2') and s.version_label='2' and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedSimplifiedAudit','Completed Simplified Audit'),public.workflow_pick_submission_file(sub.files,'completedFirstReport','Completed First Scientific Draft Report'));
 elsif t.task_key='draft-v4' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit V1 Report'));
 elsif t.task_key='design-v1' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedComprehensiveAudit1','Completed Comprehensive Scientific Audit V1'),public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V4 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'),public.workflow_pick_submission_file(sub.files,'drawio','Draw.io (if used)',false),public.workflow_pick_submission_file(sub.files,'originalImages','Original Images ZIP'));
   if nullif(sub.answers->>'designNotes','') is not null then result:=result||jsonb_build_array(jsonb_build_object('label','Notes for Designer','kind','text','value',sub.answers->>'designNotes','available',true,'source','Scientific Draft V4 Submission')); end if;
 elsif t.task_key in ('comprehensive-audit-2','accuracy-review') then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'designPdf','Designed Scientific Draft — PDF'),public.workflow_pick_submission_file(sub.files,'designHtml','Designed Scientific Draft — HTML'));
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4') and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedComprehensiveAudit1','Completed Comprehensive Scientific Audit V1'),public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V4 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'));
 elsif t.task_key='design-v2' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit 2 Report'));
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='design-v1') and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'designPdf','First Design — PDF'),public.workflow_pick_submission_file(sub.files,'designHtml','First Design — HTML'));
 elsif t.task_key='draft-v5' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit 2 Report'));
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4') and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'));
 end if;
 return result;
end $$;

-- Small helper used above. Defined after references are parsed by PostgreSQL at runtime.
-- PostgreSQL resolves function bodies at execution time, but force-refresh RPC exposure.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 7) Workflow actions with multi-executors and manager review (no fixed reviewer required).
-- ---------------------------------------------------------------------------
create or replace function public.workflow_action(p_task uuid,p_action text,p_owner uuid default null,p_reviewer uuid default null,p_author uuid default null,p_note text default null,p_document_id text default null)
returns void language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; actor uuid:=auth.uid(); admin boolean:=public.is_admin(); manager boolean; recipient uuid;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into t from public.workflow_tasks where id=p_task for update; if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 manager:=public.workflow_can_manage_stage(w.course_id,t.stage);
 if p_action='assign' then
   if not manager then raise exception 'Course management access required' using errcode='42501'; end if;
   -- Compatibility path for older clients; new clients use workflow_set_task_executors.
   perform public.workflow_set_task_executors(p_task,case when p_owner is null then '{}'::uuid[] else array[p_owner] end,false);
 elsif p_action='start' then
   if (not public.workflow_task_is_executor(p_task,actor) and not manager) or t.status not in ('ready','changes_requested') then raise exception 'Task is not ready for this executor' using errcode='42501'; end if;
   update public.workflow_tasks set status='in_progress' where id=p_task;
 elsif p_action='request_review' then
   if (not public.workflow_task_is_executor(p_task,actor) and not manager) or t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task is not open for review submission' using errcode='42501'; end if;
   if t.template_id is not null and t.submitted_id is null and exists(select 1 from public.submission_form_configs where template_id=t.template_id and active) then raise exception 'Submit the assigned form first'; end if;
   if t.submitted_id is null and btrim(coalesce(p_note,''))='' then raise exception 'Describe the completed work for review'; end if;
   if t.submitted_id is null then insert into public.workflow_evidence(task_id,note,submitted_by) values(p_task,p_note,actor); end if;
   update public.workflow_tasks set status='in_review' where id=p_task;
   for recipient in select r.user_id from public.course_management_roles r where r.course_id=w.course_id and (r.role='course_lead' or r.role=public.workflow_role_for_stage(t.stage)) loop
     insert into public.workflow_notifications(recipient_id,task_id,title,body) values(recipient,p_task,'Review requested',t.title);
   end loop;
 elsif p_action in ('approve','changes') then
   if not manager or t.status<>'in_review' then raise exception 'Course manager review access required' using errcode='42501'; end if;
   if p_action='changes' and btrim(coalesce(p_note,''))='' then raise exception 'Request changes requires a note'; end if;
   if p_action='approve' then
     update public.workflow_tasks set status='approved',approved_at=now(),approved_by=actor,approved_id=submitted_id where id=p_task;
     perform public.workflow_open_ready(t.workflow_id);
   else
     update public.workflow_tasks set status='changes_requested',submitted_id=null where id=p_task;
   end if;
   for recipient in select e.user_id from public.workflow_task_executors e where e.task_id=p_task loop
     insert into public.workflow_notifications(recipient_id,task_id,title,body)
     values(recipient,p_task,case when p_action='approve' then 'Task approved' else 'Changes requested' end,coalesce(nullif(p_note,''),t.title));
   end loop;
 elsif p_action='block' then
   if not manager or btrim(coalesce(p_note,''))='' or t.status in ('approved','in_review','planned') then raise exception 'Manager must provide a reason to block an active task'; end if;
   update public.workflow_tasks set status='blocked',blocked_reason=p_note where id=p_task;
 elsif p_action='unblock' then
   if not manager or t.status<>'blocked' then raise exception 'Course management access required'; end if;
   update public.workflow_tasks set status='ready',blocked_reason=null where id=p_task;
 else raise exception 'Unknown workflow action'; end if;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,actor,p_action,jsonb_build_object('note',p_note,'admin_override',admin));
end $$;
revoke all on function public.workflow_action(uuid,text,uuid,uuid,uuid,text,text) from public;
grant execute on function public.workflow_action(uuid,text,uuid,uuid,uuid,text,text) to authenticated;

-- Submission finish automatically creates an in-review request visible to Admin/Course Lead/specialized lead.
create or replace function public.workflow_submission_finished() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; recipient uuid;
begin
 if new.workflow_task_id is null or new.status<>'submitted' or old.status='submitted' then return new; end if;
 select * into t from public.workflow_tasks where id=new.workflow_task_id for update; if not found then return new; end if;
 if not public.workflow_task_is_executor(t.id,new.owner_id) and not public.is_admin(new.owner_id) then raise exception 'Only a task executor may submit this task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 update public.workflow_tasks set submitted_id=new.id,status='in_review' where id=t.id;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details) values(t.id,t.workflow_id,new.owner_id,'submission',jsonb_build_object('submission_id',new.id,'version',new.version_label));
 for recipient in select r.user_id from public.course_management_roles r where r.course_id=w.course_id and (r.role='course_lead' or r.role=public.workflow_role_for_stage(t.stage)) loop
   insert into public.workflow_notifications(recipient_id,task_id,title,body) values(recipient,t.id,'Review requested',t.title);
 end loop;
 return new;
end $$;

-- Review inbox RPC.
create or replace function public.workflow_review_requests(p_course uuid default null)
returns table(task_id uuid,workflow_id uuid,course_id uuid,chapter_id uuid,display_number text,title text,stage text,status text,submitted_id uuid,submitted_at timestamptz,submitted_by uuid)
language sql stable security definer set search_path=public as $$
 select t.id,t.workflow_id,w.course_id,w.chapter_id,t.display_number,t.title,t.stage,t.status,t.submitted_id,s.submitted_at,s.owner_id
 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id left join public.content_submissions s on s.id=t.submitted_id
 where t.status='in_review' and (p_course is null or w.course_id=p_course) and public.workflow_can_manage_stage(w.course_id,t.stage)
 order by s.submitted_at desc nulls last,t.sort_order
$$;
revoke all on function public.workflow_review_requests(uuid) from public;
grant execute on function public.workflow_review_requests(uuid) to authenticated;

-- All assignments visible to signed-in users in the course; no Required Files are exposed by this RPC.
create or replace function public.workflow_team_tasks(p_course uuid)
returns table(task_id uuid,workflow_id uuid,chapter_id uuid,display_number text,title text,stage text,status text,start_date date,due_date date,assignment_mode text,user_id uuid,display_name text)
language sql stable security definer set search_path=public as $$
 select t.id,t.workflow_id,w.chapter_id,t.display_number,t.title,t.stage,t.status,t.start_date,t.due_date,t.assignment_mode,e.user_id,
   coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')
 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id
 left join public.workflow_task_executors e on e.task_id=t.id left join public.profiles p on p.id=e.user_id
 where w.course_id=p_course
 order by w.chapter_id,t.sort_order,display_name
$$;
revoke all on function public.workflow_team_tasks(uuid) from public;
grant execute on function public.workflow_team_tasks(uuid) to authenticated;

-- My Tasks across courses.
create or replace function public.workflow_my_tasks(p_course uuid default null)
returns table(task_id uuid,workflow_id uuid,course_id uuid,chapter_id uuid,display_number text,title text,stage text,status text,start_date date,due_date date,assignment_mode text)
language sql stable security definer set search_path=public as $$
 select distinct t.id,t.workflow_id,w.course_id,w.chapter_id,t.display_number,t.title,t.stage,t.status,t.start_date,t.due_date,t.assignment_mode
 from public.workflow_tasks t join public.course_workflows w on w.id=t.workflow_id
 where (p_course is null or w.course_id=p_course) and public.workflow_task_is_executor(t.id,auth.uid())
 order by due_date nulls last,start_date nulls last
$$;
revoke all on function public.workflow_my_tasks(uuid) from public;
grant execute on function public.workflow_my_tasks(uuid) to authenticated;

-- Task detail collaboration snapshot.
create or replace function public.workflow_task_collaboration(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare out jsonb;
begin
 select jsonb_build_object(
  'executors',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')) order by 2)
    from public.workflow_task_executors e join public.profiles p on p.id=e.user_id where e.task_id=p_task),'[]'::jsonb),
  'instructions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'kind',i.kind,'title',i.title,'content',i.content,'sort_order',i.sort_order) order by i.sort_order,i.created_at)
    from public.workflow_task_instructions i where i.task_id=p_task),'[]'::jsonb),
  'checkState',coalesce((select jsonb_object_agg(s.instruction_id::text||':'||s.item_id,s.checked) from public.workflow_task_check_state s where s.checked_by=auth.uid() and s.instruction_id in (select id from public.workflow_task_instructions where task_id=p_task)),'{}'::jsonb),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'author_id',c.author_id,'author_name',coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User'),'body',c.body,'created_at',c.created_at,'edited_at',c.edited_at) order by c.created_at)
    from public.workflow_task_comments c join public.profiles p on p.id=c.author_id where c.task_id=p_task),'[]'::jsonb)
 ) into out;
 return out;
end $$;
revoke all on function public.workflow_task_collaboration(uuid) from public;
grant execute on function public.workflow_task_collaboration(uuid) to authenticated;

-- Latest submission history for a task, preserving every resubmission.
create or replace function public.workflow_task_submission_history(p_task uuid)
returns table(id uuid,owner_id uuid,version_label text,answers jsonb,files jsonb,submitted_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if not (public.workflow_task_is_executor(p_task,auth.uid()) or public.workflow_can_view_required_inputs(p_task)) then raise exception 'Task access required' using errcode='42501'; end if;
 return query select s.id,s.owner_id,s.version_label,s.answers,s.files,s.submitted_at from public.content_submissions s where s.workflow_task_id=p_task and s.status='submitted' and s.deleted_at is null order by s.submitted_at desc;
end $$;
revoke all on function public.workflow_task_submission_history(uuid) from public;
grant execute on function public.workflow_task_submission_history(uuid) to authenticated;

-- Submission storage privacy for workflow participants.
create or replace function public.workflow_submission_visible_to_user(p_submission uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare s public.content_submissions%rowtype; source public.workflow_tasks%rowtype; w public.course_workflows%rowtype; target_key text;
begin
 if public.is_admin() then return true; end if;
 select * into s from public.content_submissions where id=p_submission and status='submitted' and deleted_at is null; if not found or s.workflow_task_id is null then return false; end if;
 select * into source from public.workflow_tasks where id=s.workflow_task_id; select * into w from public.course_workflows where id=source.workflow_id;
 if public.workflow_task_is_executor(source.id,auth.uid()) or public.workflow_can_manage_stage(w.course_id,source.stage) or public.workflow_is_course_lead(w.course_id) then return true; end if;
 for target_key in select t.task_key from public.workflow_tasks t where t.workflow_id=source.workflow_id and public.workflow_task_is_executor(t.id,auth.uid()) loop
  if (source.task_key='draft-v1' and target_key='draft-v1-review')
   or (source.task_key='draft-v1-review' and target_key='draft-v2')
   or (source.task_key='draft-v2' and target_key in ('responsible-review','draft-v3','comprehensive-audit-1'))
   or (source.task_key='draft-v3' and target_key='comprehensive-audit-1')
   or (source.task_key='comprehensive-audit-1' and target_key in ('draft-v4','design-v1','comprehensive-audit-2','accuracy-review'))
   or (source.task_key='draft-v4' and target_key in ('design-v1','comprehensive-audit-2','accuracy-review','draft-v5'))
   or (source.task_key='design-v1' and target_key in ('comprehensive-audit-2','accuracy-review','design-v2'))
   or (source.task_key='comprehensive-audit-2' and target_key in ('design-v2','draft-v5')) then return true; end if;
 end loop;
 return false;
end $$;
revoke all on function public.workflow_submission_visible_to_user(uuid) from public;
grant execute on function public.workflow_submission_visible_to_user(uuid) to authenticated;

drop policy if exists workflow_storage_required_read on storage.objects;
create policy workflow_storage_required_read on storage.objects for select to authenticated using(
 bucket_id='teryaq-submissions' and array_length(storage.foldername(name),1)>=2 and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
 and public.workflow_submission_visible_to_user(((storage.foldername(name))[2])::uuid)
);

notify pgrst, 'reload schema';
