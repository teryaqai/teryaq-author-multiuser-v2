-- TERYAQ v3.0.2: persistent, admin-controlled submission form positions.
-- Apply after migrations 001–030. No form definitions or submissions are removed.
begin;
alter table public.submission_form_configs
  add column if not exists sort_order integer not null default 0;

-- Match the previous title order on first installation. Unpositioned new forms
-- subsequently appear at the end until the admin moves them.
with existing as (
 select id,row_number() over(order by title,id)::integer as position
 from public.submission_form_configs
)
update public.submission_form_configs f set sort_order=e.position
from existing e where f.id=e.id and f.sort_order=0;

create or replace function public.submission_form_set_position(p_form_id text,p_position integer)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare ordered_ids text[];remaining_ids text[];form_count integer;
begin
 if auth.uid() is null or not coalesce(public.is_admin(),false) then
  raise exception 'Admin access required.' using errcode='42501';
 end if;
 -- Serialize changes so two admins cannot partially reorder the same directory.
 lock table public.submission_form_configs in share row exclusive mode;
 select array_agg(id order by case when sort_order>0 then sort_order else 2147483647 end,title,id)
 into ordered_ids from public.submission_form_configs;
 form_count:=coalesce(cardinality(ordered_ids),0);
 if p_form_id is null or not coalesce(p_form_id=any(ordered_ids),false) then
  raise exception 'Submission form not found.';
 end if;
 if p_position is null or p_position<1 or p_position>form_count then
  raise exception 'Choose a position from 1 to %.',form_count;
 end if;
 remaining_ids:=array_remove(ordered_ids,p_form_id);
 ordered_ids:=coalesce(remaining_ids[1:p_position-1],'{}'::text[])
   ||array[p_form_id]||coalesce(remaining_ids[p_position:form_count],'{}'::text[]);
 update public.submission_form_configs f
 set sort_order=r.position::integer,updated_at=now()
 from unnest(ordered_ids) with ordinality as r(id,position)
 where f.id=r.id and f.sort_order is distinct from r.position::integer;
 return jsonb_build_object('form_id',p_form_id,'position',p_position,'ordered_ids',to_jsonb(ordered_ids));
end;
$$;
revoke all on function public.submission_form_set_position(text,integer) from public,anon;
grant execute on function public.submission_form_set_position(text,integer) to authenticated;
commit;
