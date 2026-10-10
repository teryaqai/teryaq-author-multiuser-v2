-- TERYAQ Master Tool v2.9.2
-- Exact workflow numbering + Required Files folders/course propagation.
-- Apply after 024_ai_handoff.sql.

-- ---------------------------------------------------------------------------
-- 1) Required Files / Inputs: folders, nesting, ordering, and course-wide scope.
-- ---------------------------------------------------------------------------
alter table public.workflow_task_resources add column if not exists parent_resource_id uuid references public.workflow_task_resources(id) on delete cascade;
alter table public.workflow_task_resources add column if not exists sort_order integer not null default 0;
alter table public.workflow_task_resources add column if not exists scope text not null default 'task' check(scope in ('task','course_task'));
alter table public.workflow_task_resources add column if not exists description text;
alter table public.workflow_task_resources add column if not exists icon_key text;
alter table public.workflow_task_resources add column if not exists sync_group uuid not null default gen_random_uuid();

alter table public.workflow_task_resources drop constraint if exists workflow_task_resources_kind_check;
alter table public.workflow_task_resources add constraint workflow_task_resources_kind_check check(kind in ('file','image','link','text','folder'));

create or replace function public.workflow_add_task_resource_v2(
  p_task uuid,p_label text,p_kind text,p_path text default null,p_url text default null,p_value text default null,
  p_required boolean default true,p_parent uuid default null,p_scope text default 'task',p_description text default null,p_icon text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; rid uuid; g uuid:=gen_random_uuid(); target record; parent_group uuid; target_parent uuid; ord integer;
begin
  select * into t from public.workflow_tasks where id=p_task; if not found then raise exception 'Unknown task'; end if;
  select * into w from public.course_workflows where id=t.workflow_id;
  if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required' using errcode='42501'; end if;
  if p_kind not in ('file','image','link','text','folder') then raise exception 'Unknown resource type'; end if;
  if p_scope not in ('task','course_task') then p_scope:='task'; end if;
  if p_parent is not null then select sync_group into parent_group from public.workflow_task_resources where id=p_parent and task_id=p_task; end if;
  select coalesce(max(sort_order),0)+1 into ord from public.workflow_task_resources where task_id=p_task and parent_resource_id is not distinct from p_parent;
  insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by,parent_resource_id,sort_order,scope,description,icon_key,sync_group)
  values(p_task,p_label,p_kind,p_path,p_url,p_value,p_required,auth.uid(),p_parent,ord,p_scope,p_description,p_icon,g) returning id into rid;

  if p_scope='course_task' then
    for target in
      select tt.id task_id
      from public.workflow_tasks tt join public.course_workflows ww on ww.id=tt.workflow_id
      where ww.course_id=w.course_id and tt.task_key=t.task_key and tt.id<>p_task
    loop
      target_parent:=null;
      if parent_group is not null then
        select r.id into target_parent from public.workflow_task_resources r where r.task_id=target.task_id and r.sync_group=parent_group limit 1;
      end if;
      select coalesce(max(sort_order),0)+1 into ord from public.workflow_task_resources where task_id=target.task_id and parent_resource_id is not distinct from target_parent;
      insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by,parent_resource_id,sort_order,scope,description,icon_key,sync_group)
      values(target.task_id,p_label,p_kind,p_path,p_url,p_value,p_required,auth.uid(),target_parent,ord,'course_task',p_description,p_icon,g)
      on conflict do nothing;
    end loop;
  end if;
  return rid;
end $$;
revoke all on function public.workflow_add_task_resource_v2(uuid,text,text,text,text,text,boolean,uuid,text,text,text) from public;
grant execute on function public.workflow_add_task_resource_v2(uuid,text,text,text,text,text,boolean,uuid,text,text,text) to authenticated;

create or replace function public.workflow_task_resource_tree(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.workflow_can_view_required_inputs(p_task) then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'label',r.label,'kind',r.kind,'storage_path',r.storage_path,'url',r.url,'value',r.value,'required',r.required,
    'parent_resource_id',r.parent_resource_id,'sort_order',r.sort_order,'scope',r.scope,'description',r.description,'icon_key',r.icon_key,'sync_group',r.sync_group,
    'available',case when r.kind='folder' then true else coalesce(nullif(r.storage_path,''),nullif(r.url,''),nullif(r.value,'')) is not null end
  ) order by r.sort_order,r.created_at) from public.workflow_task_resources r where r.task_id=p_task),'[]'::jsonb);
end $$;
revoke all on function public.workflow_task_resource_tree(uuid) from public;
grant execute on function public.workflow_task_resource_tree(uuid) to authenticated;

create or replace function public.workflow_propagate_task_resource(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.workflow_task_resources%rowtype; t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; target record; parent_group uuid; target_parent uuid; ord integer;
begin
 select * into r from public.workflow_task_resources where id=p_id; if not found then return; end if;
 select * into t from public.workflow_tasks where id=r.task_id; select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required'; end if;
 update public.workflow_task_resources set scope='course_task' where sync_group=r.sync_group;
 if r.parent_resource_id is not null then select sync_group into parent_group from public.workflow_task_resources where id=r.parent_resource_id; end if;
 for target in select tt.id task_id from public.workflow_tasks tt join public.course_workflows ww on ww.id=tt.workflow_id where ww.course_id=w.course_id and tt.task_key=t.task_key and tt.id<>r.task_id loop
   if exists(select 1 from public.workflow_task_resources x where x.task_id=target.task_id and x.sync_group=r.sync_group) then continue; end if;
   target_parent:=null;if parent_group is not null then select id into target_parent from public.workflow_task_resources where task_id=target.task_id and sync_group=parent_group limit 1; end if;
   select coalesce(max(sort_order),0)+1 into ord from public.workflow_task_resources where task_id=target.task_id and parent_resource_id is not distinct from target_parent;
   insert into public.workflow_task_resources(task_id,label,kind,storage_path,url,value,required,uploaded_by,parent_resource_id,sort_order,scope,description,icon_key,sync_group)
   values(target.task_id,r.label,r.kind,r.storage_path,r.url,r.value,r.required,auth.uid(),target_parent,ord,'course_task',r.description,r.icon_key,r.sync_group);
 end loop;
end $$;
revoke all on function public.workflow_propagate_task_resource(uuid) from public; grant execute on function public.workflow_propagate_task_resource(uuid) to authenticated;

create or replace function public.workflow_update_task_resource(p_id uuid,p_label text,p_description text default null,p_all boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r public.workflow_task_resources%rowtype; t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 select * into r from public.workflow_task_resources where id=p_id; if not found then return; end if; select * into t from public.workflow_tasks where id=r.task_id; select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required'; end if;
 if p_all then update public.workflow_task_resources set label=p_label,description=p_description where sync_group=r.sync_group; else update public.workflow_task_resources set label=p_label,description=p_description where id=p_id; end if;
end $$;
revoke all on function public.workflow_update_task_resource(uuid,text,text,boolean) from public; grant execute on function public.workflow_update_task_resource(uuid,text,text,boolean) to authenticated;

create or replace function public.workflow_delete_task_resource(p_id uuid,p_all boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r public.workflow_task_resources%rowtype; t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 select * into r from public.workflow_task_resources where id=p_id; if not found then return; end if; select * into t from public.workflow_tasks where id=r.task_id; select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required'; end if;
 if p_all then delete from public.workflow_task_resources where sync_group=r.sync_group; else delete from public.workflow_task_resources where id=p_id; end if;
end $$;
revoke all on function public.workflow_delete_task_resource(uuid,boolean) from public; grant execute on function public.workflow_delete_task_resource(uuid,boolean) to authenticated;

create or replace function public.workflow_move_task_resource(p_id uuid,p_direction text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.workflow_task_resources%rowtype; other public.workflow_task_resources%rowtype; t public.workflow_tasks%rowtype; w public.course_workflows%rowtype;
begin
 select * into r from public.workflow_task_resources where id=p_id; if not found then return; end if; select * into t from public.workflow_tasks where id=r.task_id; select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_manage_stage(w.course_id,t.stage) then raise exception 'Course management access required'; end if;
 if p_direction='up' then select * into other from public.workflow_task_resources where task_id=r.task_id and parent_resource_id is not distinct from r.parent_resource_id and sort_order<r.sort_order order by sort_order desc limit 1;
 elsif p_direction='down' then select * into other from public.workflow_task_resources where task_id=r.task_id and parent_resource_id is not distinct from r.parent_resource_id and sort_order>r.sort_order order by sort_order asc limit 1; else return; end if;
 if other.id is not null then update public.workflow_task_resources set sort_order=case when id=r.id then other.sort_order when id=other.id then r.sort_order else sort_order end where id in(r.id,other.id); end if;
end $$;
revoke all on function public.workflow_move_task_resource(uuid,text) from public; grant execute on function public.workflow_move_task_resource(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Exact current workflow. Display numbers are strings and are never inferred.
-- ---------------------------------------------------------------------------
update public.workflow_templates set title='TERYAQ chapter work areas — exact numbering',updated_at=now(),steps='[
 {"key":"scope","number":"1","title":"تحديد المنهج","stage":"Scientific Draft","depends":[],"required":true},
 {"key":"sources","number":"2","title":"تحديد المصادر","stage":"Scientific Draft","depends":["scope"],"required":true},
 {"key":"timeline","number":"3","title":"وضع جدول زمني وتحديد المكافأة","stage":"Scientific Draft","depends":["sources"],"required":true},
 {"key":"roles","number":"4","title":"توزيع المهام والأدوار","stage":"Scientific Draft","depends":["timeline"],"required":true},
 {"key":"draft-v1","number":"5","title":"كتابة المسودة العلمية","stage":"Scientific Draft","depends":["roles"],"template":"scientific-draft-text","version":"1","required":true},
 {"key":"first-report","number":"6.1","title":"تقرير أول للمسودة العلمية","stage":"Scientific Draft","depends":["draft-v1"],"template":"scientific-draft-v1-review","version":"1","required":true},
 {"key":"simplified-audit","number":"6.2","title":"تدقيق مبسط","stage":"Scientific Draft","depends":["draft-v1"],"required":true},
 {"key":"figures","number":"6.3","title":"إعادة صنع الصور والأشكال والمخططات","stage":"Scientific Draft","depends":["draft-v1"],"required":true},
 {"key":"draft-v2","number":"7","title":"التحديث الأول للمسودة العلمية","stage":"Scientific Draft","depends":["first-report","simplified-audit","figures"],"template":"scientific-draft-text","version":"2","required":true},
 {"key":"responsible-review","number":"8","title":"عرض المسودة العلمية (نسخة 2) على مسؤول المسودة العلمية للمساق","stage":"Scientific Draft","depends":["draft-v2"],"required":true},
 {"key":"draft-v3","number":"9","title":"التحديث الثاني للمسودة العلمية","stage":"Scientific Draft","depends":["responsible-review"],"template":"scientific-draft-text","version":"3","required":true},
 {"key":"comprehensive-audit-1","number":"10","title":"تدقيق شامل 1","stage":"Scientific Draft","depends":["draft-v3"],"template":"comprehensive-scientific-audit","version":"1","required":true},
 {"key":"draft-v4","number":"11","title":"التحديث الثالث للمسودة العلمية","stage":"Scientific Draft","depends":["comprehensive-audit-1"],"template":"scientific-draft-text","version":"4","required":true},
 {"key":"draft-v4-close","number":"12","title":"إغلاق المسودة العلمية — نسخة 4","stage":"Scientific Draft","depends":["draft-v4"],"required":true},
 {"key":"design-v1","number":"13","title":"تصميم المسودة العلمية — نسخة 4","stage":"Scientific Draft","depends":["draft-v4-close"],"template":"designed-scientific-draft","version":"1","required":true},
 {"key":"comprehensive-audit-2","number":"14.1","title":"تدقيق شامل 2","stage":"Scientific Draft","depends":["design-v1"],"template":"comprehensive-scientific-audit","version":"2","required":true},
 {"key":"author-review","number":"14.2","title":"عرض الملف المصمم على كاتب المسودة العلمية ومسؤول المسودة العلمية للمساق وأخذ ملاحظاتهم","stage":"Scientific Draft","depends":["design-v1"],"required":true},
 {"key":"design-v2","number":"15.1","title":"اعتماد الملف المصمم","stage":"Scientific Draft","depends":["comprehensive-audit-2","author-review"],"template":"designed-scientific-draft","version":"2","required":true},
 {"key":"draft-v5","number":"15.2","title":"إغلاق واعتماد المسودة العلمية النهائية — النسخة 5","stage":"Scientific Draft","depends":["comprehensive-audit-2","author-review"],"template":"scientific-draft-text","version":"5","required":true},

 {"key":"script-read","number":"1","title":"قراءة وفهم واستيعاب الملف المصمم","stage":"Shooting Script","depends":["design-v2","draft-v5"],"required":true},
 {"key":"script-v1","number":"2","title":"كتابة سكريبت التصوير — نسخة 1","stage":"Shooting Script","depends":["script-read"],"template":"shooting-script","version":"1","required":true},
 {"key":"script-scientific-review","number":"3","title":"عرض السكريبت على كاتب السكريبت، كاتب المسودة العلمية، مسؤول المسودة العلمية للمساق ومسؤول السكريبت","stage":"Shooting Script","depends":["script-v1"],"required":true},
 {"key":"script-update-1","number":"4","title":"تعديل السكريبت بناءً على توصيات كاتب المسودة العلمية","stage":"Shooting Script","depends":["script-scientific-review"],"template":"shooting-script","version":"2","required":true},
 {"key":"script-lead-review","number":"5","title":"عرض السكريبت (نسخة 2) على مسؤول السكريبت للمساق","stage":"Shooting Script","depends":["script-update-1"],"required":true},
 {"key":"script-update-2","number":"6","title":"تعديل السكريبت بناءً على توصيات مسؤول كاتب السكريبت","stage":"Shooting Script","depends":["script-lead-review"],"template":"shooting-script","version":"3","required":true},
 {"key":"presenter-revision","number":"7","title":"تعديل السكريبت من قبل المقدم","stage":"Shooting Script","depends":["script-update-2"],"template":"shooting-script","version":"4","required":true},
 {"key":"script-voice-version","number":"8","title":"نسخة السكريبت الصوتية","stage":"Shooting Script","depends":["presenter-revision"],"required":true},
 {"key":"montage-prep","number":"9","title":"تجهيز سكريبت المونتاج","stage":"Shooting Script","depends":["script-voice-version"],"required":true},
 {"key":"montage-script","number":"9.1","title":"كتابة سكريبت المونتاج","stage":"Shooting Script","depends":["montage-prep"],"required":true},
 {"key":"montage-images","number":"9.2","title":"تجهيز الصور","stage":"Shooting Script","depends":["montage-prep"],"required":true},
 {"key":"script-final-audit","number":"10","title":"التدقيق الأخير","stage":"Shooting Script","depends":["montage-script","montage-images"],"required":true},
 {"key":"script-files-approval","number":"10","title":"اعتماد الملفان","stage":"Shooting Script","depends":["script-final-audit"],"required":true},

 {"key":"video-shoot","number":"1","title":"تصوير الفيديو","stage":"Editing","depends":["script-files-approval"],"required":true},
 {"key":"video-cleanup","number":"2","title":"تنقيح الفيديوهات","stage":"Editing","depends":["video-shoot"],"required":true},
 {"key":"montage-review-cut","number":"3S","title":"معاينة وقص الفيديوهات","stage":"Editing","depends":["video-cleanup"],"required":true},
 {"key":"montage-script-edit","number":"4S","title":"كتابة سكريبت المونتاج","stage":"Editing","depends":["montage-review-cut"],"required":true},
 {"key":"montage-image-prep","number":"5S","title":"تجهيز الصور","stage":"Editing","depends":["montage-script-edit"],"required":true},
 {"key":"montage-image-ai","number":"6S","title":"تعديل الصور","stage":"Editing","depends":["montage-image-prep"],"required":true},
 {"key":"montage-script-output","number":"7S","title":"تسليم مخرجات سكريبت المونتاج","stage":"Editing","depends":["montage-image-ai"],"required":true},
 {"key":"video-compose","number":"3V","title":"دمج المقاطع، تعديل الألوان، وإزالة الكروما","stage":"Editing","depends":["video-cleanup"],"required":true},
 {"key":"video-cut","number":"4V","title":"قص الفيديوهات","stage":"Editing","depends":["video-compose"],"required":true},
 {"key":"video-templates","number":"5V","title":"تطبيق قوالب المونتاج","stage":"Editing","depends":["video-cut"],"required":true},
 {"key":"video-template-adjust","number":"6V","title":"تعديل قوالب المونتاج بصريًا","stage":"Editing","depends":["video-templates"],"required":true},
 {"key":"video-first-render","number":"7V","title":"عمل تصدير أولي للفيديو","stage":"Editing","depends":["video-template-adjust","montage-script-output"],"required":true},
 {"key":"video-revision","number":"8V","title":"تعديل الفيديو","stage":"Editing","depends":["video-first-render"],"required":true},
 {"key":"video-final-render","number":"9V","title":"التصدير النهائي للفيديو","stage":"Editing","depends":["video-revision"],"required":true}
]'::jsonb where id='standard-v1';

-- Existing Scientific Draft cycles: exact current numbers and separate first four tasks.
update public.workflow_tasks set display_number='1',sort_order=1 where stage='Scientific Draft' and task_key='scope';
update public.workflow_tasks set display_number='2',sort_order=2 where stage='Scientific Draft' and task_key='sources';
update public.workflow_tasks set display_number='3',sort_order=3 where stage='Scientific Draft' and task_key='timeline';
update public.workflow_tasks set display_number='4',sort_order=4 where stage='Scientific Draft' and task_key='roles';
update public.workflow_tasks set display_number='5',sort_order=5 where stage='Scientific Draft' and task_key='draft-v1';

-- Convert the old combined V1 review into task 6.1 and add 6.2 / 6.3 separately.
update public.workflow_tasks set task_key='first-report',title='تقرير أول للمسودة العلمية',display_number='6.1',sort_order=6,depends_on=array['draft-v1'] where stage='Scientific Draft' and task_key='draft-v1-review';
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,status)
select w.id,'simplified-audit','تدقيق مبسط','Scientific Draft',7,'6.2',array['draft-v1'],true,'planned' from public.course_workflows w
where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='first-report') on conflict(workflow_id,task_key) do nothing;
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,status)
select w.id,'figures','إعادة صنع الصور والأشكال والمخططات','Scientific Draft',8,'6.3',array['draft-v1'],true,'planned' from public.course_workflows w
where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='first-report') on conflict(workflow_id,task_key) do nothing;
update public.workflow_tasks set display_number='7',sort_order=9,depends_on=array['first-report','simplified-audit','figures'] where task_key='draft-v2';
update public.workflow_tasks set display_number='8',sort_order=10 where task_key='responsible-review';
update public.workflow_tasks set display_number='9',sort_order=11 where task_key='draft-v3';
update public.workflow_tasks set display_number='10',sort_order=12 where task_key='comprehensive-audit-1';
update public.workflow_tasks set display_number='11',sort_order=13 where task_key='draft-v4';
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,status)
select w.id,'draft-v4-close','إغلاق المسودة العلمية — نسخة 4','Scientific Draft',14,'12',array['draft-v4'],true,'planned' from public.course_workflows w
where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='draft-v4') on conflict(workflow_id,task_key) do nothing;
update public.workflow_tasks set display_number='13',sort_order=15,depends_on=array['draft-v4-close'],title='تصميم المسودة العلمية — نسخة 4' where task_key='design-v1';
update public.workflow_tasks set display_number='14.1',sort_order=16,depends_on=array['design-v1'],title='تدقيق شامل 2' where task_key='comprehensive-audit-2';
update public.workflow_tasks set task_key='author-review',display_number='14.2',sort_order=17,depends_on=array['design-v1'],title='عرض الملف المصمم على كاتب المسودة العلمية ومسؤول المسودة العلمية للمساق وأخذ ملاحظاتهم',ai_handoff_enabled=false where task_key='accuracy-review';
update public.workflow_tasks set display_number='15.1',sort_order=18,depends_on=array['comprehensive-audit-2','author-review'],title='اعتماد الملف المصمم' where task_key='design-v2';
update public.workflow_tasks set display_number='15.2',sort_order=19,depends_on=array['comprehensive-audit-2','author-review'],title='إغلاق واعتماد المسودة العلمية النهائية — النسخة 5' where task_key='draft-v5';

-- Insert/update the complete Script & Presenting workflow for existing chapter cycles.
-- Existing task 1 and 2 are retained, then the exact numbered tasks are added.
update public.workflow_tasks set display_number='1',sort_order=20,title='قراءة وفهم واستيعاب الملف المصمم' where task_key='script-read';
update public.workflow_tasks set display_number='2',sort_order=21,title='كتابة سكريبت التصوير — نسخة 1',ai_handoff_enabled=true where task_key='script-v1';
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,status)
select w.id,x.key,x.title,'Shooting Script',x.ord,x.num,x.dep,true,'planned'
from public.course_workflows w cross join (values
 ('script-scientific-review','عرض السكريبت على كاتب السكريبت، كاتب المسودة العلمية، مسؤول المسودة العلمية للمساق ومسؤول السكريبت',22,'3',array['script-v1']::text[]),
 ('script-update-1','تعديل السكريبت بناءً على توصيات كاتب المسودة العلمية',23,'4',array['script-scientific-review']::text[]),
 ('script-lead-review','عرض السكريبت (نسخة 2) على مسؤول السكريبت للمساق',24,'5',array['script-update-1']::text[]),
 ('script-update-2','تعديل السكريبت بناءً على توصيات مسؤول كاتب السكريبت',25,'6',array['script-lead-review']::text[]),
 ('presenter-revision','تعديل السكريبت من قبل المقدم',26,'7',array['script-update-2']::text[]),
 ('script-voice-version','نسخة السكريبت الصوتية',27,'8',array['presenter-revision']::text[]),
 ('montage-prep','تجهيز سكريبت المونتاج',28,'9',array['script-voice-version']::text[]),
 ('montage-script','كتابة سكريبت المونتاج',29,'9.1',array['montage-prep']::text[]),
 ('montage-images','تجهيز الصور',30,'9.2',array['montage-prep']::text[]),
 ('script-final-audit','التدقيق الأخير',31,'10',array['montage-script','montage-images']::text[]),
 ('script-files-approval','اعتماد الملفان',32,'10',array['script-final-audit']::text[])
) as x(key,title,ord,num,dep)
where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='script-v1')
on conflict(workflow_id,task_key) do update set title=excluded.title,sort_order=excluded.sort_order,display_number=excluded.display_number,depends_on=excluded.depends_on;
update public.workflow_tasks set template_id='shooting-script',expected_version='2' where task_key='script-update-1';
update public.workflow_tasks set template_id='shooting-script',expected_version='3' where task_key='script-update-2';
update public.workflow_tasks set template_id='shooting-script',expected_version='4' where task_key='presenter-revision';

-- Insert/update Montage / Video Editing exact branch numbers.
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,status)
select w.id,x.key,x.title,'Editing',x.ord,x.num,x.dep,true,'planned'
from public.course_workflows w cross join (values
 ('video-shoot','تصوير الفيديو',40,'1',array['script-files-approval']::text[]),('video-cleanup','تنقيح الفيديوهات',41,'2',array['video-shoot']::text[]),
 ('montage-review-cut','معاينة وقص الفيديوهات',42,'3S',array['video-cleanup']::text[]),('montage-script-edit','كتابة سكريبت المونتاج',43,'4S',array['montage-review-cut']::text[]),
 ('montage-image-prep','تجهيز الصور',44,'5S',array['montage-script-edit']::text[]),('montage-image-ai','تعديل الصور',45,'6S',array['montage-image-prep']::text[]),('montage-script-output','تسليم مخرجات سكريبت المونتاج',46,'7S',array['montage-image-ai']::text[]),
 ('video-compose','دمج المقاطع، تعديل الألوان، وإزالة الكروما',47,'3V',array['video-cleanup']::text[]),('video-cut','قص الفيديوهات',48,'4V',array['video-compose']::text[]),('video-templates','تطبيق قوالب المونتاج',49,'5V',array['video-cut']::text[]),('video-template-adjust','تعديل قوالب المونتاج بصريًا',50,'6V',array['video-templates']::text[]),('video-first-render','عمل تصدير أولي للفيديو',51,'7V',array['video-template-adjust','montage-script-output']::text[]),('video-revision','تعديل الفيديو',52,'8V',array['video-first-render']::text[]),('video-final-render','التصدير النهائي للفيديو',53,'9V',array['video-revision']::text[])
) as x(key,title,ord,num,dep)
where exists(select 1 from public.workflow_tasks t where t.workflow_id=w.id and t.task_key='script-files-approval')
on conflict(workflow_id,task_key) do update set title=excluded.title,sort_order=excluded.sort_order,display_number=excluded.display_number,depends_on=excluded.depends_on;

-- AI execution package defaults for the two newly relevant AI-assisted tasks.
update public.workflow_tasks set ai_handoff_enabled=true,
 ai_prompt=coalesce(ai_prompt,'Audit Shooting Script Version 1 using only the supplied approved scientific draft and current script. Identify clear scientific, wording, pronunciation, and presentation issues according to the task instructions. Return the required AI review report without rewriting unsupported content.'),
 ai_expected_output=coalesce(ai_expected_output,'AI script review report for Shooting Script Version 1.')
where task_key='script-v1';
update public.workflow_tasks set ai_handoff_enabled=true,
 ai_prompt=coalesce(ai_prompt,'Review the supplied image package and make only the image adjustments requested by the montage workflow. Preserve scientific accuracy, labels, proportions, and approved visual requirements.'),
 ai_expected_output=coalesce(ai_expected_output,'Updated image files ready for the montage script output package.')
where task_key='montage-image-ai';

notify pgrst,'reload schema';

-- Required-input auto-linking updated for the separated 6.1 / 6.2 / 6.3 tasks and current 14.2 key.
create or replace function public.workflow_required_inputs(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t public.workflow_tasks%rowtype; w public.course_workflows%rowtype; result jsonb:='[]'::jsonb;
  src uuid; sub public.content_submissions%rowtype;
begin
 select * into t from public.workflow_tasks where id=p_task; if not found then return result; end if;
 select * into w from public.course_workflows where id=t.workflow_id;
 if not public.workflow_can_view_required_inputs(p_task) then return null; end if;

 result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',r.label,'kind',r.kind,'storage_path',r.storage_path,'url',r.url,'value',r.value,'available',case when r.kind='folder' then true else coalesce(nullif(r.storage_path,''),nullif(r.url,''),nullif(r.value,'')) is not null end,'required',r.required,'source','Added by course management') order by r.sort_order,r.created_at) from public.workflow_task_resources r where r.task_id=p_task),'[]'::jsonb);

 if t.task_key='draft-v1' then
   return result||coalesce((select jsonb_agg(jsonb_build_object('label',label,'kind',kind,'url',url,'storage_path',storage_path,'value',value,'available',coalesce(nullif(url,''),nullif(storage_path,''),nullif(value,'')) is not null,'required',true,'source','Preparation & Rules') order by resource_key)
     from public.workflow_chapter_resources where workflow_id=t.workflow_id and resource_key in ('curriculum_outlines','source_links','timeline','roles_distribution')),'[]'::jsonb);
 end if;

 if t.task_key in ('first-report','simplified-audit','figures') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v1');
 elsif t.task_key='draft-v2' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='first-report');
 elsif t.task_key in ('responsible-review','draft-v3') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v2');
 elsif t.task_key='comprehensive-audit-1' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v3');
 elsif t.task_key='draft-v4' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-1');
 elsif t.task_key='design-v1' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v4');
 elsif t.task_key in ('comprehensive-audit-2','author-review') then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='design-v1');
 elsif t.task_key='design-v2' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-2');
 elsif t.task_key='draft-v5' then src:=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='comprehensive-audit-2');
 end if;

 if src is not null then select * into sub from public.content_submissions where workflow_task_id=src and status='submitted' and deleted_at is null order by submitted_at desc limit 1; end if;

 if t.task_key='first-report' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V1 — Text HTML'));
 elsif t.task_key='simplified-audit' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V1 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V1 — With Images HTML'));
 elsif t.task_key='figures' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V1 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'),public.workflow_pick_submission_file(sub.files,'drawio','Draw.io (if used)',false),public.workflow_pick_submission_file(sub.files,'originalImages','Original Images ZIP'));
 elsif t.task_key='draft-v2' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'firstReport','First Scientific Draft Report'),public.workflow_pick_submission_file(sub.files,'simplifiedAudit','Simplified Audit'),public.workflow_pick_submission_file(sub.files,'figuresRecreation','Figures, Shapes & Diagrams Recreation'));
 elsif t.task_key in ('responsible-review','draft-v3') then
   if sub.id is not null then result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(x->>'label',x->>'fieldId'),'kind','file','storage_path',x->>'path','available',true,'source','Scientific Draft Version 2')) from jsonb_array_elements(sub.files) x),'[]'::jsonb); end if;
 elsif t.task_key='comprehensive-audit-1' then
   if sub.id is not null then result:=result||coalesce((select jsonb_agg(jsonb_build_object('label',coalesce(x->>'label',x->>'fieldId'),'kind','file','storage_path',x->>'path','available',true,'source','Scientific Draft Version 3')) from jsonb_array_elements(sub.files) x),'[]'::jsonb); end if;
   select * into sub from public.content_submissions s where s.workflow_task_id=(select id from public.workflow_tasks where workflow_id=t.workflow_id and task_key='draft-v2') and s.version_label='2' and s.status='submitted' and s.deleted_at is null order by submitted_at desc limit 1;
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedSimplifiedAudit','Completed Simplified Audit'),public.workflow_pick_submission_file(sub.files,'completedFirstReport','Completed First Scientific Draft Report'));
 elsif t.task_key='draft-v4' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'auditReport','Comprehensive Scientific Audit V1 Report'));
 elsif t.task_key='design-v1' then
   result:=result||jsonb_build_array(public.workflow_pick_submission_file(sub.files,'completedComprehensiveAudit1','Completed Comprehensive Scientific Audit V1'),public.workflow_pick_submission_file(sub.files,'textHtml','Scientific Draft V4 — Text HTML'),public.workflow_pick_submission_file(sub.files,'figuresHtml','Scientific Draft V4 — With Images HTML'),public.workflow_pick_submission_file(sub.files,'figuresOnlyPdf','Figures-only PDF'),public.workflow_pick_submission_file(sub.files,'drawio','Draw.io (if used)',false),public.workflow_pick_submission_file(sub.files,'originalImages','Original Images ZIP'));
   if nullif(sub.answers->>'designNotes','') is not null then result:=result||jsonb_build_array(jsonb_build_object('label','Notes for Designer','kind','text','value',sub.answers->>'designNotes','available',true,'source','Scientific Draft V4 Submission')); end if;
 elsif t.task_key in ('comprehensive-audit-2','author-review') then
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

notify pgrst,'reload schema';
