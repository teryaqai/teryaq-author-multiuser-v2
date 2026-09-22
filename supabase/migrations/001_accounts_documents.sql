-- Teryaq Author v2 — accounts, documents, immutable version history
-- Run through Supabase migrations. Never paste a service-role key into the client app.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do update set email=excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id,email)
select id,email from auth.users
on conflict (id) do update set email=excluded.email;

create or replace function public.is_admin(check_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=check_uid and role='admin')
$$;

create table if not exists public.documents (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Untitled',
  template_id text not null,
  template_version text not null default '1.0.0',
  document_schema_version text not null default '2.0.0',
  document_json jsonb,
  current_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists documents_owner_updated_idx on public.documents(owner_id,updated_at desc);

create table if not exists public.document_versions (
  id bigint generated always as identity primary key,
  document_id text not null references public.documents(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  version bigint not null,
  document_json jsonb,
  is_deleted boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(document_id,version)
);
create index if not exists document_versions_document_idx on public.document_versions(document_id,version desc);

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
using (owner_id=auth.uid() or public.is_admin());

drop policy if exists versions_select on public.document_versions;
create policy versions_select on public.document_versions for select to authenticated
using (owner_id=auth.uid() or public.is_admin());

-- Writes are deliberately performed through push_document() so version checking cannot be bypassed.
create or replace function public.push_document(
  p_document_id text,
  p_base_version bigint,
  p_document jsonb,
  p_deleted boolean default false
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  existing public.documents%rowtype;
  new_version bigint;
  doc_title text;
  template_id_v text;
  template_version_v text;
  schema_version_v text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into existing from public.documents where id=p_document_id for update;

  if found then
    if existing.owner_id<>uid then raise exception 'Document ownership mismatch'; end if;
    if existing.current_version<>coalesce(p_base_version,0) then
      return jsonb_build_object(
        'status','conflict',
        'current_version',existing.current_version,
        'server_document',existing.document_json,
        'deleted_at',existing.deleted_at
      );
    end if;

    new_version:=existing.current_version+1;
    if p_deleted then
      update public.documents set current_version=new_version,updated_at=now(),deleted_at=now()
      where id=p_document_id;
      insert into public.document_versions(document_id,owner_id,version,document_json,is_deleted,created_by)
      values(p_document_id,uid,new_version,existing.document_json,true,uid);
    else
      doc_title:=coalesce(p_document->>'title',existing.title,'Untitled');
      template_id_v:=coalesce(p_document->>'templateId',existing.template_id);
      template_version_v:=coalesce(p_document->>'templateVersion',existing.template_version,'1.0.0');
      schema_version_v:=coalesce(p_document->>'schemaVersion',existing.document_schema_version,'2.0.0');
      update public.documents set title=doc_title,template_id=template_id_v,template_version=template_version_v,
        document_schema_version=schema_version_v,document_json=p_document,current_version=new_version,
        updated_at=now(),deleted_at=null where id=p_document_id;
      insert into public.document_versions(document_id,owner_id,version,document_json,is_deleted,created_by)
      values(p_document_id,uid,new_version,p_document,false,uid);
    end if;
  else
    if p_deleted then
      return jsonb_build_object('status','ok','current_version',0);
    end if;
    doc_title:=coalesce(p_document->>'title','Untitled');
    template_id_v:=coalesce(p_document->>'templateId','unknown');
    template_version_v:=coalesce(p_document->>'templateVersion','1.0.0');
    schema_version_v:=coalesce(p_document->>'schemaVersion','2.0.0');
    new_version:=1;
    insert into public.documents(id,owner_id,title,template_id,template_version,document_schema_version,document_json,current_version)
    values(p_document_id,uid,doc_title,template_id_v,template_version_v,schema_version_v,p_document,new_version);
    insert into public.document_versions(document_id,owner_id,version,document_json,is_deleted,created_by)
    values(p_document_id,uid,new_version,p_document,false,uid);
  end if;

  return jsonb_build_object('status','ok','current_version',new_version);
end $$;

revoke all on function public.push_document(text,bigint,jsonb,boolean) from public;
grant execute on function public.push_document(text,bigint,jsonb,boolean) to authenticated;
