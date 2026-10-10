-- TERYAQ Master Tool v2.9.2
-- Canonical workflow cleanup: preserve exact visible numbering, restore missing tasks,
-- and retire legacy/aggregate rows without deleting historical submissions.
-- Apply after 025_workflow_exact_numbering_required_folders.sql.

-- ---------------------------------------------------------------------------
-- 1) Canonical template. display numbers are strings and are never derived.
-- ---------------------------------------------------------------------------
update public.workflow_templates
set title='TERYAQ chapter work areas', updated_at=now(), steps='[
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
]'::jsonb
where id in ('standard-course','standard-v1');

-- ---------------------------------------------------------------------------
-- 2) Retire obsolete aggregate / legacy rows without deleting history.
-- They remain in the database for old submissions/events, but are not required
-- and the v2.9.2 UI only renders canonical keys.
-- ---------------------------------------------------------------------------
update public.workflow_tasks t
set required=false
where t.stage in ('Scientific Draft','Shooting Script','Editing')
and not (
 (t.stage='Scientific Draft' and t.task_key = any(array[
  'scope','sources','timeline','roles','draft-v1','first-report','simplified-audit','figures','draft-v2','responsible-review','draft-v3','comprehensive-audit-1','draft-v4','draft-v4-close','design-v1','comprehensive-audit-2','author-review','design-v2','draft-v5'
 ]))
 or (t.stage='Shooting Script' and t.task_key = any(array[
  'script-read','script-v1','script-scientific-review','script-update-1','script-lead-review','script-update-2','presenter-revision','script-voice-version','montage-prep','montage-script','montage-images','script-final-audit','script-files-approval'
 ]))
 or (t.stage='Editing' and t.task_key = any(array[
  'video-shoot','video-cleanup','montage-review-cut','montage-script-edit','montage-image-prep','montage-image-ai','montage-script-output','video-compose','video-cut','video-templates','video-template-adjust','video-first-render','video-revision','video-final-render'
 ]))
);

-- ---------------------------------------------------------------------------
-- 3) Restore/upsert every canonical task for every existing chapter workflow.
-- Internal sort_order is separate from the visible display_number string.
-- ---------------------------------------------------------------------------
with canonical(task_key,title,stage,sort_order,display_number,depends_on,template_id,expected_version) as (values
 ('scope','تحديد المنهج','Scientific Draft',1,'1',array[]::text[],null,null),
 ('sources','تحديد المصادر','Scientific Draft',2,'2',array['scope']::text[],null,null),
 ('timeline','وضع جدول زمني وتحديد المكافأة','Scientific Draft',3,'3',array['sources']::text[],null,null),
 ('roles','توزيع المهام والأدوار','Scientific Draft',4,'4',array['timeline']::text[],null,null),
 ('draft-v1','كتابة المسودة العلمية','Scientific Draft',5,'5',array['roles']::text[],'scientific-draft-text','1'),
 ('first-report','تقرير أول للمسودة العلمية','Scientific Draft',6,'6.1',array['draft-v1']::text[],'scientific-draft-v1-review','1'),
 ('simplified-audit','تدقيق مبسط','Scientific Draft',7,'6.2',array['draft-v1']::text[],null,null),
 ('figures','إعادة صنع الصور والأشكال والمخططات','Scientific Draft',8,'6.3',array['draft-v1']::text[],null,null),
 ('draft-v2','التحديث الأول للمسودة العلمية','Scientific Draft',9,'7',array['first-report','simplified-audit','figures']::text[],'scientific-draft-text','2'),
 ('responsible-review','عرض المسودة العلمية (نسخة 2) على مسؤول المسودة العلمية للمساق','Scientific Draft',10,'8',array['draft-v2']::text[],null,null),
 ('draft-v3','التحديث الثاني للمسودة العلمية','Scientific Draft',11,'9',array['responsible-review']::text[],'scientific-draft-text','3'),
 ('comprehensive-audit-1','تدقيق شامل 1','Scientific Draft',12,'10',array['draft-v3']::text[],'comprehensive-scientific-audit','1'),
 ('draft-v4','التحديث الثالث للمسودة العلمية','Scientific Draft',13,'11',array['comprehensive-audit-1']::text[],'scientific-draft-text','4'),
 ('draft-v4-close','إغلاق المسودة العلمية — نسخة 4','Scientific Draft',14,'12',array['draft-v4']::text[],null,null),
 ('design-v1','تصميم المسودة العلمية — نسخة 4','Scientific Draft',15,'13',array['draft-v4-close']::text[],'designed-scientific-draft','1'),
 ('comprehensive-audit-2','تدقيق شامل 2','Scientific Draft',16,'14.1',array['design-v1']::text[],'comprehensive-scientific-audit','2'),
 ('author-review','عرض الملف المصمم على كاتب المسودة العلمية ومسؤول المسودة العلمية للمساق وأخذ ملاحظاتهم','Scientific Draft',17,'14.2',array['design-v1']::text[],null,null),
 ('design-v2','اعتماد الملف المصمم','Scientific Draft',18,'15.1',array['comprehensive-audit-2','author-review']::text[],'designed-scientific-draft','2'),
 ('draft-v5','إغلاق واعتماد المسودة العلمية النهائية — النسخة 5','Scientific Draft',19,'15.2',array['comprehensive-audit-2','author-review']::text[],'scientific-draft-text','5'),

 ('script-read','قراءة وفهم واستيعاب الملف المصمم','Shooting Script',20,'1',array['design-v2','draft-v5']::text[],null,null),
 ('script-v1','كتابة سكريبت التصوير — نسخة 1','Shooting Script',21,'2',array['script-read']::text[],'shooting-script','1'),
 ('script-scientific-review','عرض السكريبت على كاتب السكريبت، كاتب المسودة العلمية، مسؤول المسودة العلمية للمساق ومسؤول السكريبت','Shooting Script',22,'3',array['script-v1']::text[],null,null),
 ('script-update-1','تعديل السكريبت بناءً على توصيات كاتب المسودة العلمية','Shooting Script',23,'4',array['script-scientific-review']::text[],'shooting-script','2'),
 ('script-lead-review','عرض السكريبت (نسخة 2) على مسؤول السكريبت للمساق','Shooting Script',24,'5',array['script-update-1']::text[],null,null),
 ('script-update-2','تعديل السكريبت بناءً على توصيات مسؤول كاتب السكريبت','Shooting Script',25,'6',array['script-lead-review']::text[],'shooting-script','3'),
 ('presenter-revision','تعديل السكريبت من قبل المقدم','Shooting Script',26,'7',array['script-update-2']::text[],'shooting-script','4'),
 ('script-voice-version','نسخة السكريبت الصوتية','Shooting Script',27,'8',array['presenter-revision']::text[],null,null),
 ('montage-prep','تجهيز سكريبت المونتاج','Shooting Script',28,'9',array['script-voice-version']::text[],null,null),
 ('montage-script','كتابة سكريبت المونتاج','Shooting Script',29,'9.1',array['montage-prep']::text[],null,null),
 ('montage-images','تجهيز الصور','Shooting Script',30,'9.2',array['montage-prep']::text[],null,null),
 ('script-final-audit','التدقيق الأخير','Shooting Script',31,'10',array['montage-script','montage-images']::text[],null,null),
 ('script-files-approval','اعتماد الملفان','Shooting Script',32,'10',array['script-final-audit']::text[],null,null),

 ('video-shoot','تصوير الفيديو','Editing',40,'1',array['script-files-approval']::text[],null,null),
 ('video-cleanup','تنقيح الفيديوهات','Editing',41,'2',array['video-shoot']::text[],null,null),
 ('montage-review-cut','معاينة وقص الفيديوهات','Editing',42,'3S',array['video-cleanup']::text[],null,null),
 ('montage-script-edit','كتابة سكريبت المونتاج','Editing',43,'4S',array['montage-review-cut']::text[],null,null),
 ('montage-image-prep','تجهيز الصور','Editing',44,'5S',array['montage-script-edit']::text[],null,null),
 ('montage-image-ai','تعديل الصور','Editing',45,'6S',array['montage-image-prep']::text[],null,null),
 ('montage-script-output','تسليم مخرجات سكريبت المونتاج','Editing',46,'7S',array['montage-image-ai']::text[],null,null),
 ('video-compose','دمج المقاطع، تعديل الألوان، وإزالة الكروما','Editing',47,'3V',array['video-cleanup']::text[],null,null),
 ('video-cut','قص الفيديوهات','Editing',48,'4V',array['video-compose']::text[],null,null),
 ('video-templates','تطبيق قوالب المونتاج','Editing',49,'5V',array['video-cut']::text[],null,null),
 ('video-template-adjust','تعديل قوالب المونتاج بصريًا','Editing',50,'6V',array['video-templates']::text[],null,null),
 ('video-first-render','عمل تصدير أولي للفيديو','Editing',51,'7V',array['video-template-adjust','montage-script-output']::text[],null,null),
 ('video-revision','تعديل الفيديو','Editing',52,'8V',array['video-first-render']::text[],null,null),
 ('video-final-render','التصدير النهائي للفيديو','Editing',53,'9V',array['video-revision']::text[],null,null)
)
insert into public.workflow_tasks(workflow_id,task_key,title,stage,sort_order,display_number,depends_on,required,template_id,expected_version,status)
select w.id,c.task_key,c.title,c.stage,c.sort_order,c.display_number,c.depends_on,true,c.template_id,c.expected_version,
 case when cardinality(c.depends_on)=0 then 'ready' else 'planned' end
from public.course_workflows w cross join canonical c
on conflict(workflow_id,task_key) do update set
 title=excluded.title,
 stage=excluded.stage,
 sort_order=excluded.sort_order,
 display_number=excluded.display_number,
 depends_on=excluded.depends_on,
 required=true,
 template_id=excluded.template_id,
 expected_version=excluded.expected_version;

-- Keep the two intended AI execution packages enabled.
update public.workflow_tasks set ai_handoff_enabled=true where task_key in ('script-v1','montage-image-ai');

notify pgrst,'reload schema';


-- ---------------------------------------------------------------------------
-- 4) New chapter cycles must use the canonical template that actually exists.
-- Earlier migrations temporarily referenced standard-v1; standard-course is the
-- persistent template id created by the workflow system.
-- ---------------------------------------------------------------------------
create or replace function public.workflow_create(p_course uuid,p_chapter uuid,p_new_cycle boolean default false,p_reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare w uuid; tmpl public.workflow_templates%rowtype; cycle_no integer; step jsonb; old_cycle integer; ord integer:=0;
begin
 if auth.uid() is null or not public.workflow_is_lead(p_course) then raise exception 'Course management access required' using errcode='42501'; end if;
 if not exists(select 1 from public.content_chapters where id=p_chapter and subject_id=p_course) then raise exception 'Chapter does not belong to course'; end if;
 select * into tmpl from public.workflow_templates where id='standard-course';
 if not found then raise exception 'Canonical workflow template is missing'; end if;
 select max(cycle) into old_cycle from public.course_workflows where chapter_id=p_chapter;
 if old_cycle is not null and not p_new_cycle then return (select id from public.course_workflows where chapter_id=p_chapter and cycle=old_cycle); end if;
 cycle_no:=coalesce(old_cycle,0)+1;
 if old_cycle is not null and btrim(coalesce(p_reason,''))='' then raise exception 'New cycle reason required'; end if;
 insert into public.course_workflows(course_id,chapter_id,cycle,template_snapshot,created_by) values(p_course,p_chapter,cycle_no,tmpl.steps,auth.uid()) returning id into w;
 for step in select value from jsonb_array_elements(tmpl.steps) loop
   ord:=ord+1;
   insert into public.workflow_tasks(workflow_id,task_key,title,description,stage,sort_order,display_number,depends_on,required,template_id,expected_version,status)
   values(w,step->>'key',step->>'title',step->>'description',step->>'stage',ord,
     step->>'number',
     array(select jsonb_array_elements_text(coalesce(step->'depends','[]'::jsonb))),coalesce((step->>'required')::boolean,true),step->>'template',step->>'version',
     case when jsonb_array_length(coalesce(step->'depends','[]'::jsonb))=0 then 'ready' else 'planned' end);
 end loop;
 return w;
end $$;
revoke all on function public.workflow_create(uuid,uuid,boolean,text) from public;
grant execute on function public.workflow_create(uuid,uuid,boolean,text) to authenticated;

notify pgrst,'reload schema';
