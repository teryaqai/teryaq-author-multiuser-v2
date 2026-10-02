-- TERYAQ v2.7.6: chapter-first work areas, scoped course management roles, task schedule.
-- Apply after migration 018.

alter table public.workflow_tasks add column if not exists description text;
alter table public.workflow_tasks add column if not exists start_date date;
alter table public.workflow_tasks add column if not exists due_date date;

create table if not exists public.course_management_roles (
  course_id uuid not null references public.content_subjects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('scientific_lead','script_lead','ai_lead','production_lead','post_production_lead')),
  permissions jsonb not null default '{}'::jsonb,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key(course_id,user_id,role)
);
alter table public.course_management_roles enable row level security;
drop policy if exists course_management_roles_read on public.course_management_roles;
create policy course_management_roles_read on public.course_management_roles for select to authenticated using(true);
grant select on public.course_management_roles to authenticated;

-- Preserve previous Course Lead access during the transition by giving every existing lead
-- all scoped roles. Admin can then trim roles from the new Course Management Team UI.
insert into public.course_management_roles(course_id,user_id,role,assigned_by)
select l.course_id,l.user_id,r.role,l.assigned_by
from public.course_leads l
cross join (values ('scientific_lead'),('script_lead'),('ai_lead'),('production_lead'),('post_production_lead')) r(role)
on conflict do nothing;

create or replace function public.workflow_role_for_stage(p_stage text) returns text
language sql immutable as $$
 select case p_stage
  when 'Scientific Draft' then 'scientific_lead'
  when 'Shooting Script' then 'script_lead'
  when 'Questions' then 'ai_lead'
  when 'Flashcards' then 'ai_lead'
  when 'Shooting' then 'production_lead'
  when 'Editing' then 'post_production_lead'
  else null
 end
$$;

create or replace function public.workflow_is_lead(p_course uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(
   select 1 from public.course_management_roles r where r.course_id=p_course and r.user_id=auth.uid()
 );
$$;
revoke all on function public.workflow_is_lead(uuid) from public;
grant execute on function public.workflow_is_lead(uuid) to authenticated;

create or replace function public.workflow_can_manage_stage(p_course uuid,p_stage text) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or exists(
   select 1 from public.course_management_roles r
   where r.course_id=p_course and r.user_id=auth.uid() and r.role=public.workflow_role_for_stage(p_stage)
 );
$$;
revoke all on function public.workflow_can_manage_stage(uuid,text) from public;
grant execute on function public.workflow_can_manage_stage(uuid,text) to authenticated;

create or replace function public.workflow_set_course_role(p_course uuid,p_user uuid,p_role text,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_role not in ('scientific_lead','script_lead','ai_lead','production_lead','post_production_lead') then raise exception 'Unknown course role'; end if;
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

-- Keep directory access for any scoped manager/admin.
create or replace function public.workflow_directory(p_course uuid) returns table(id uuid,display_name text)
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.workflow_is_lead(p_course) then raise exception 'Course management access required' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(p.display_name,''),p.email,p.id::text) from public.profiles p order by 2;
end $$;

-- Detailed chapter tasks for future workflow cycles. Deliverables are descriptions/outputs, not standalone tasks.
update public.workflow_templates set title='TERYAQ chapter work areas',updated_at=now(),steps='[
 {"key":"scope","title":"تحديد المنهج","description":"قراءة وفهم المنهج وتحديد نطاق العمل لهذا الكورس.","stage":"Scientific Draft","depends":[],"required":true},
 {"key":"sources","title":"تحديد المصادر","description":"توفير المصادر المطلوبة من كتب ومراجع ومصادر إلكترونية ومصادر مساندة.","stage":"Scientific Draft","depends":["scope"],"required":true},
 {"key":"timeline","title":"وضع جدول زمني وتحديد المكافأة","description":"تحديد الجدول الزمني وتقدير الوقت والمكافأة.","stage":"Scientific Draft","depends":["sources"],"required":true},
 {"key":"roles","title":"توزيع المهام والأدوار","description":"تحديد أعضاء الفريق وتوزيع المهام والمسؤوليات.","stage":"Scientific Draft","depends":["timeline"],"required":true},
 {"key":"draft-v1","title":"كتابة المسودة العلمية","description":"كتابة النسخة الأولية للمسودة العلمية.","stage":"Scientific Draft","depends":["roles"],"template":"scientific-draft-text","version":"1","required":true},
 {"key":"draft-attachments","title":"تجهيز مرفقات المسودة العلمية","description":"إعادة صنع الصور والأشكال والمخططات، إجراء التدقيق المبسط، وإعداد التقرير الأول للمسودة العلمية.","stage":"Scientific Draft","depends":["draft-v1"],"required":true},
 {"key":"draft-update-1","title":"التحديث الأول للمسودة العلمية","description":"تحديث المسودة بناءً على التقرير الأول والملاحظات والمرفقات الجديدة.","stage":"Scientific Draft","depends":["draft-attachments"],"template":"scientific-draft-text","version":"2","required":true},
 {"key":"responsible-review","title":"عرض المسودة العلمية على مسؤول المسودة","description":"عرض النسخة المحدثة على مسؤول المسودة العلمية للمراجعة.","stage":"Scientific Draft","depends":["draft-update-1"],"required":true},
 {"key":"draft-update-2","title":"التحديث الثاني للمسودة العلمية","description":"تعديل المسودة بناءً على ملاحظات مسؤول المسودة العلمية.","stage":"Scientific Draft","depends":["responsible-review"],"template":"scientific-draft-text","version":"3","required":true},
 {"key":"comprehensive-audit-1","title":"التدقيق الشامل 1","description":"إجراء تدقيق علمي شامل للمسودة العلمية.","stage":"Scientific Draft","depends":["draft-update-2"],"required":true},
 {"key":"draft-update-3","title":"التحديث الثالث للمسودة العلمية","description":"تعديل المسودة بناءً على تقرير التدقيق الشامل الأول.","stage":"Scientific Draft","depends":["comprehensive-audit-1"],"template":"scientific-draft-text","version":"4","required":true},
 {"key":"design-draft","title":"تصميم المسودة العلمية","description":"تصميم الملف العلمي وفق هوية ترياق.","stage":"Scientific Draft","depends":["draft-update-3"],"required":true},
 {"key":"design-review","title":"مراجعة التصميم","description":"التدقيق الشامل 2 وعرض الملف المصمم على كاتب المسودة ومسؤول المسودة العلمية.","stage":"Scientific Draft","depends":["design-draft"],"required":true},
 {"key":"draft-final","title":"اعتماد المسودة العلمية والتصميم","description":"الاعتماد النهائي للملف العلمي والتصميم.","stage":"Scientific Draft","depends":["design-review"],"required":true},

 {"key":"script-read","title":"قراءة وفهم واستيعاب الملف المصمم","description":"فهم الملف المصمم بالكامل قبل كتابة السكريبت.","stage":"Shooting Script","depends":["draft-final"],"required":true},
 {"key":"script-v1","title":"كتابة سكريبت التصوير – النسخة الأولى","description":"كتابة النسخة الأولى ثم إجراء تدقيق AI عليها.","stage":"Shooting Script","depends":["script-read"],"template":"shooting-script","version":"1","required":true},
 {"key":"script-scientific-review","title":"عرض السكريبت على مسؤول المسودة العلمية","description":"مراجعة السكريبت علميًا ومقارنته بالمسودة المعتمدة.","stage":"Shooting Script","depends":["script-v1"],"required":true},
 {"key":"script-update-1","title":"تعديل السكريبت بناءً على التوصيات العلمية","description":"تطبيق توصيات كاتب/مسؤول المسودة العلمية.","stage":"Shooting Script","depends":["script-scientific-review"],"template":"shooting-script","version":"2","required":true},
 {"key":"script-lead-review","title":"عرض النسخة الثانية على مسؤول السكريبت","description":"مراجعة السكريبت من قبل مسؤول السكريبت.","stage":"Shooting Script","depends":["script-update-1"],"required":true},
 {"key":"script-update-2","title":"تعديل السكريبت بناءً على توصيات مسؤول السكريبت","description":"تطبيق ملاحظات مسؤول السكريبت وإعداد النسخة الثالثة.","stage":"Shooting Script","depends":["script-lead-review"],"template":"shooting-script","version":"3","required":true},
 {"key":"presenter-trial","title":"تعديل السكريبت من قبل المقدم","description":"تجربة السكريبت ومراجعة النطق والسلاسة بما يناسب التقديم.","stage":"Shooting Script","depends":["script-update-2"],"required":true},
 {"key":"script-final-version","title":"النسخة النهائية للسكريبت","description":"تثبيت التعديلات النهائية بعد تجربة المقدم.","stage":"Shooting Script","depends":["presenter-trial"],"template":"shooting-script","version":"4","required":true},
 {"key":"montage-prep","title":"تجهيز سكريبت المونتاج","description":"كتابة سكريبت المونتاج وتجهيز الصور والأصول المطلوبة للمونتاج.","stage":"Shooting Script","depends":["script-final-version"],"required":true},
 {"key":"script-final","title":"التدقيق الأخير واعتماد الملفات","description":"عرض آخر للسكريبت وملفات المونتاج على أعضاء الفريق ثم اعتمادها.","stage":"Shooting Script","depends":["montage-prep"],"required":true},

 {"key":"questions","title":"Questions","description":"إنتاج ومراجعة واعتماد أسئلة الشابتر وفق نظام TERYAQ Questions.","stage":"Questions","depends":["draft-final"],"required":true},
 {"key":"flashcards","title":"Flashcards","description":"إنتاج ومراجعة واعتماد فلاش كاردز الشابتر وفق نظام TERYAQ Flashcards.","stage":"Flashcards","depends":["draft-final"],"required":true},
 {"key":"shooting","title":"Shooting / Production","description":"تنفيذ تصوير الشابتر وفق السكريبت المعتمد.","stage":"Shooting","depends":["script-final"],"required":true},
 {"key":"editing","title":"Montage (Video Editing)","description":"مونتاج الفيديو وتجهيز النسخة النهائية للشابتر.","stage":"Editing","depends":["shooting"],"required":true},
 {"key":"social","title":"Social media","description":"إعداد مخرجات التواصل الاجتماعي الخاصة بالشابتر.","stage":"Social Media","depends":["editing"],"required":true},
 {"key":"publication","title":"Platform publication approval","description":"الاعتماد النهائي للنشر على المنصة.","stage":"Platform","depends":["editing","questions","flashcards","social"],"required":true}
]'::jsonb where id='standard-course';

-- Ensure future cycles copy descriptions from the frozen template.
create or replace function public.workflow_create(p_course uuid,p_chapter uuid,p_new_cycle boolean default false,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid; cycle_no integer; v_steps jsonb; s jsonb; n integer:=0; current_cycle integer;
begin
 if auth.uid() is null or not public.workflow_is_lead(p_course) then raise exception 'Course management access required' using errcode='42501'; end if;
 if not exists(select 1 from public.content_chapters where id=p_chapter and subject_id=p_course) then raise exception 'Chapter is not in this course'; end if;
 select max(cycle) into current_cycle from public.course_workflows where chapter_id=p_chapter;
 if current_cycle is not null and not p_new_cycle then return (select id from public.course_workflows where chapter_id=p_chapter and cycle=current_cycle); end if;
 if p_new_cycle and not public.is_admin() then raise exception 'Admin access required for a new release cycle' using errcode='42501'; end if;
 if p_new_cycle and btrim(coalesce(p_reason,''))='' then raise exception 'New cycle reason required'; end if;
 cycle_no:=coalesce(current_cycle,0)+1;
 select wt.steps into v_steps from public.workflow_templates wt where wt.id='standard-course';
 insert into public.course_workflows(course_id,chapter_id,cycle,template_snapshot,created_by)
 values(p_course,p_chapter,cycle_no,v_steps,auth.uid()) returning id into w;
 for s in select value from jsonb_array_elements(v_steps) loop
   n:=n+1;
   insert into public.workflow_tasks(workflow_id,task_key,title,description,stage,sort_order,depends_on,required,template_id,expected_version)
   values(w,s->>'key',s->>'title',nullif(s->>'description',''),s->>'stage',n,array(select jsonb_array_elements_text(coalesce(s->'depends','[]'::jsonb))),coalesce((s->>'required')::boolean,true),nullif(s->>'template',''),nullif(s->>'version',''));
 end loop;
 if cycle_no>1 then
   update public.workflow_tasks fresh set owner_id=old.owner_id,start_date=old.start_date,due_date=old.due_date
   from public.workflow_tasks old join public.course_workflows prior on prior.id=old.workflow_id
   where fresh.workflow_id=w and prior.chapter_id=p_chapter and prior.cycle=cycle_no-1 and fresh.task_key=old.task_key;
 end if;
 perform public.workflow_open_ready(w);
 insert into public.workflow_events(workflow_id,actor_id,action,details) values(w,auth.uid(),'cycle.created',jsonb_build_object('cycle',cycle_no));
 return w;
end $$;
revoke all on function public.workflow_create(uuid,uuid,boolean,text) from public;
grant execute on function public.workflow_create(uuid,uuid,boolean,text) to authenticated;

-- Assignment now means Task Executor only. Reviewer/author columns remain for legacy compatibility but are not edited here.
create or replace function public.workflow_action(p_task uuid,p_action text,p_owner uuid default null,p_reviewer uuid default null,p_author uuid default null,p_note text default null,p_document_id text default null)
returns void language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; d public.documents%rowtype; actor uuid:=auth.uid(); admin boolean:=public.is_admin(); manager boolean;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into t from public.workflow_tasks where id=p_task for update; if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 manager:=public.workflow_can_manage_stage(w.course_id,t.stage);
 if p_action='assign' then
   if not manager then raise exception 'Workflow lead access required' using errcode='42501'; end if;
   if p_owner is not null and not exists(select 1 from public.profiles where id=p_owner) then raise exception 'Unknown Task Executor'; end if;
   if t.status in ('approved','in_review') then raise exception 'Cannot reassign while in review or approved'; end if;
   update public.workflow_tasks set owner_id=p_owner where id=p_task;
   if t.status in ('ready','changes_requested') and p_owner is not null and p_owner is distinct from t.owner_id then
     insert into public.workflow_notifications(recipient_id,task_id,title,body) values(p_owner,p_task,'Task assigned',t.title);
   end if;
 elsif p_action='start' then
   if (actor is distinct from t.owner_id and not admin) or t.status not in ('ready','changes_requested') then raise exception 'Task is not ready for this executor' using errcode='42501'; end if;
   update public.workflow_tasks set status='in_progress' where id=p_task;
 elsif p_action='request_review' then
   if (actor is distinct from t.owner_id and not admin) or t.status not in ('ready','in_progress','changes_requested') then raise exception 'Task Executor access required'; end if;
   if t.template_id is not null and t.submitted_id is null and exists(select 1 from public.submission_form_configs where template_id=t.template_id and active)
     then raise exception 'Submit the assigned template and version first'; end if;
   if t.submitted_id is null and t.template_id is not null then
     select * into d from public.documents where id=p_document_id and owner_id=t.owner_id and deleted_at is null;
     if not found or d.document_json is null or d.document_json->>'templateId' is distinct from t.template_id
       or d.document_json->'metadata'->>'workflowTaskId' is distinct from t.id::text
       or d.document_json->'metadata'->>'courseId' is distinct from w.course_id::text
       or d.document_json->'metadata'->>'chapterId' is distinct from w.chapter_id::text
       or (t.expected_version is not null and d.document_json->'metadata'->>'editorialVersion' is distinct from t.expected_version)
       then raise exception 'Sync the assigned document with matching course, chapter and version before review'; end if;
     insert into public.workflow_evidence(task_id,document_id,document_version,document_snapshot,note,submitted_by)
       values(p_task,d.id,d.current_version,d.document_json,p_note,actor);
   elsif t.submitted_id is null then
     if btrim(coalesce(p_note,''))='' then raise exception 'Describe the completed work for review'; end if;
     insert into public.workflow_evidence(task_id,note,submitted_by) values(p_task,p_note,actor);
   end if;
   update public.workflow_tasks set status='in_review' where id=p_task;
   insert into public.workflow_notifications(recipient_id,task_id,title,body)
   select r.user_id,p_task,'Review requested',t.title from public.course_management_roles r
   where r.course_id=w.course_id and r.role=public.workflow_role_for_stage(t.stage) and r.user_id is distinct from actor;
 elsif p_action in ('approve','changes') then
   if not manager or t.status<>'in_review' then raise exception 'Workflow lead access required for an in-review task' using errcode='42501'; end if;
   if p_action='changes' and btrim(coalesce(p_note,''))='' then raise exception 'Request changes requires a note'; end if;
   if p_action='approve' then
     update public.workflow_tasks set status='approved',approved_at=now(),approved_by=actor,approved_id=submitted_id where id=p_task;
     perform public.workflow_open_ready(t.workflow_id);
   else update public.workflow_tasks set status='changes_requested',submitted_id=null where id=p_task; end if;
   if t.owner_id is not null then insert into public.workflow_notifications(recipient_id,task_id,title,body)
     values(t.owner_id,p_task,case when p_action='approve' then 'Task approved' else 'Changes requested' end,coalesce(nullif(p_note,''),t.title)); end if;
 elsif p_action='block' then
   if not manager or btrim(coalesce(p_note,''))='' or t.status in ('approved','in_review','planned') then raise exception 'Workflow lead must provide a reason to block an active task'; end if;
   update public.workflow_tasks set status='blocked',blocked_reason=p_note where id=p_task;
 elsif p_action='unblock' then
   if not manager or t.status<>'blocked' then raise exception 'Workflow lead access required'; end if;
   update public.workflow_tasks set status='ready',blocked_reason=null where id=p_task;
 else raise exception 'Unknown workflow action'; end if;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,actor,p_action,jsonb_build_object('note',p_note,'task_executor',p_owner));
end $$;
revoke all on function public.workflow_action(uuid,text,uuid,uuid,uuid,text,text) from public;
grant execute on function public.workflow_action(uuid,text,uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.workflow_update_schedule(p_task uuid,p_start date,p_due date) returns void
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into t from public.workflow_tasks where id=p_task for update; if not found then raise exception 'Unknown task'; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Workflow lead access required' using errcode='42501'; end if;
 if p_start is not null and p_due is not null and p_due<p_start then raise exception 'Due Date cannot be before Start Date'; end if;
 update public.workflow_tasks set start_date=p_start,due_date=p_due where id=p_task;
 insert into public.workflow_events(task_id,workflow_id,actor_id,action,details)
 values(p_task,t.workflow_id,auth.uid(),'schedule.updated',jsonb_build_object('start_date',p_start,'due_date',p_due));
end $$;
revoke all on function public.workflow_update_schedule(uuid,date,date) from public;
grant execute on function public.workflow_update_schedule(uuid,date,date) to authenticated;

-- Existing rows keep their data; add descriptions where recognizable without deleting legacy author/reviewer data.
update public.workflow_tasks set description=case task_key
 when 'draft-v1' then 'كتابة النسخة الأولية للمسودة العلمية.'
 when 'simplified-audit' then 'إجراء التدقيق المبسط على المسودة العلمية.'
 when 'figures' then 'إعادة صنع الصور والأشكال والمخططات المطلوبة للمسودة.'
 when 'comprehensive-audit' then 'إجراء التدقيق العلمي الشامل الأول.'
 when 'design-draft' then 'تصميم الملف العلمي وفق هوية ترياق.'
 when 'script-read' then 'قراءة وفهم واستيعاب الملف المصمم قبل كتابة السكريبت.'
 when 'script-v1' then 'كتابة سكريبت التصوير – النسخة الأولى مع تدقيق AI.'
 when 'presenter-trial' then 'تجربة السكريبت ومراجعة النطق والسلاسة من قبل المقدم.'
 when 'montage-script' then 'كتابة سكريبت المونتاج داخل الملف المعتمد.'
 when 'script-images' then 'تجهيز الصور والأصول اللازمة للمونتاج.'
 else description end
where description is null;
