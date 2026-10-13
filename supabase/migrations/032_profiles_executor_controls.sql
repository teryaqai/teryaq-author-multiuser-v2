-- v3.0.3. Install after 031. This migration deletes no user data.
begin;
-- Legacy check rejected unassigned tasks because NULL IS DISTINCT FROM NULL is false.
alter table public.workflow_tasks drop constraint if exists workflow_tasks_check;
alter table public.workflow_tasks add constraint workflow_tasks_check check(owner_id is null or reviewer_id is null or owner_id is distinct from reviewer_id);
alter table public.profiles
 add column if not exists member_code text,
 add column if not exists education_level text,
 add column if not exists education_other text,
 add column if not exists country text,
 add column if not exists institution text,
 add column if not exists specialty text;
create unique index if not exists profiles_member_code_unique on public.profiles(lower(member_code)) where nullif(btrim(member_code),'') is not null;
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin(auth.uid()) and coalesce(auth.role(),'')<>'service_role' and auth.uid() is not null then
  raise exception 'Only admin may edit profile details' using errcode='42501';
 end if;
 if new.education_level is not null and new.education_level not in ('1','2','3','4','5','6','internship','graduate','other') then raise exception 'Invalid education level'; end if;
 if new.education_level='other' and nullif(btrim(new.education_other),'') is null then raise exception 'Explain the Other education level'; end if;
 new.updated_at=now();return new;
end $$;
drop trigger if exists protect_profile_details on public.profiles;
create trigger protect_profile_details before update on public.profiles for each row execute function public.protect_profile_role();
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create or replace function public.admin_update_profile(p_user uuid,p_values jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_admin(auth.uid()),false) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_values->>'display_name',''))) not between 2 and 80 then raise exception 'Name must be 2–80 characters'; end if;
 if coalesce(p_values->>'role','user') not in ('user','admin') then raise exception 'Invalid role'; end if;
 if auth.role()<>'service_role' and exists(select 1 from public.profiles where id=p_user and email is distinct from (p_values->>'email')) then raise exception 'Use admin-governance to change the account email'; end if;
 update public.profiles set display_name=btrim(p_values->>'display_name'),email=p_values->>'email',role=p_values->>'role',member_code=nullif(btrim(p_values->>'member_code'),''),education_level=nullif(p_values->>'education_level',''),education_other=p_values->>'education_other',country=p_values->>'country',institution=p_values->>'institution',specialty=p_values->>'specialty',avatar_path=nullif(p_values->>'avatar_path','') where id=p_user;
 if not found then raise exception 'Unknown account'; end if;
end $$;
revoke all on function public.admin_update_profile(uuid,jsonb) from public,anon;
grant execute on function public.admin_update_profile(uuid,jsonb) to authenticated,service_role;
-- Restrictive policies apply alongside all existing permissive storage policies.
drop policy if exists profile_avatar_insert_guard on storage.objects;
create policy profile_avatar_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin());
drop policy if exists profile_avatar_update_guard on storage.objects;
create policy profile_avatar_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin()) with check(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin());
drop policy if exists profile_avatar_delete_guard on storage.objects;
create policy profile_avatar_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'teryaq-author' or (storage.foldername(name))[2] is distinct from 'profile' or public.is_admin());
drop policy if exists admin_profile_avatar_write on storage.objects;
create policy admin_profile_avatar_write on storage.objects for all to authenticated using(bucket_id='teryaq-author' and public.is_admin() and (storage.foldername(name))[2]='profile') with check(bucket_id='teryaq-author' and public.is_admin() and (storage.foldername(name))[2]='profile');
create or replace function public.guard_document_executor() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.document_json is null or coalesce(public.is_admin(auth.uid()),false) or auth.uid() is null then return new; end if;
 if tg_op='INSERT' then
  if nullif(new.document_json#>>'{metadata,taskExecutorId}','') is not null and new.document_json#>>'{metadata,taskExecutorId}'<>new.owner_id::text then raise exception 'File executor must match its creator' using errcode='42501'; end if;
 elsif (new.document_json#>'{metadata,taskExecutorId}') is distinct from (old.document_json#>'{metadata,taskExecutorId}') and old.document_json#>>'{metadata,taskExecutorId}' is not null then
  raise exception 'Only admin may change the file executor' using errcode='42501';
 end if;
 if tg_op='UPDATE' and new.document_json is not null and old.document_json is not null and ((new.document_json#>'{metadata,authorIds}') is distinct from (old.document_json#>'{metadata,authorIds}') or (new.document_json#>'{metadata,name}') is distinct from (old.document_json#>'{metadata,name}')) then raise exception 'Only admin may change the file author / executor' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists document_executor_guard on public.documents;
create trigger document_executor_guard before insert or update of document_json on public.documents for each row execute function public.guard_document_executor();
create or replace function public.workflow_accounts() returns table(id uuid,name text,active boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 return query select p.id,coalesce(nullif(p.display_name,''),split_part(coalesce(p.email,''),'@',1),'User')||case when nullif(p.member_code,'') is null then '' else ' · '||p.member_code end,true from public.profiles p order by 2;
end $$;
notify pgrst,'reload schema';
commit;
