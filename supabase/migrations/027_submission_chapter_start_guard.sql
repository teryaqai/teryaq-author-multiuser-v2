-- TERYAQ v3.0.0. Run after migration 026.
-- A chapter is started when an authorized course manager creates its workflow.
-- Gate new upload records, scope changes and finalization, including direct API calls.
-- Existing completed submissions and their archive/backup management remain intact.
begin;

create or replace function public.submission_require_started_chapter()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
   if new.course_id is not distinct from old.course_id
      and new.chapter_id is not distinct from old.chapter_id
      and not (new.status='submitted' and old.status is distinct from 'submitted') then
     return new;
   end if;
 end if;
 if new.course_id is null or new.chapter_id is null then
   raise exception 'اختر المساق والشابتر قبل رفع الملفات أو التسليم.' using errcode='23514';
 end if;
 if not exists(
   select 1 from public.course_workflows w
   join public.content_chapters c on c.id=w.chapter_id and c.subject_id=w.course_id
   where w.course_id=new.course_id and w.chapter_id=new.chapter_id
 ) then
   raise exception 'لا يمكن التسليم لهذا الشابتر: لم يبدأه الأدمن بعد. يجب بدء الشابتر من صفحة الكورسات أولًا.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.submission_require_started_chapter() from public,anon,authenticated;

drop trigger if exists submission_require_started_chapter_trigger on public.content_submissions;
create trigger submission_require_started_chapter_trigger
 before insert or update on public.content_submissions
 for each row execute function public.submission_require_started_chapter();

notify pgrst,'reload schema';
commit;
