-- Prevent a normal user from promoting their own profile to admin.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role is distinct from old.role and not public.is_admin(auth.uid()) then
    raise exception 'Only an administrator may change account roles';
  end if;
  new.updated_at=now();
  return new;
end $$;

drop trigger if exists protect_profile_role_trigger on public.profiles;
create trigger protect_profile_role_trigger before update on public.profiles
for each row execute function public.protect_profile_role();
