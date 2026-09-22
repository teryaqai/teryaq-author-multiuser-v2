-- Attachment metadata + system compatibility settings. Storage is private.
create table if not exists public.attachments (
  id text primary key,
  document_id text not null references public.documents(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  filename text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists attachments_document_idx on public.attachments(document_id);
alter table public.attachments enable row level security;
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated using(owner_id=auth.uid() or public.is_admin());
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated with check(owner_id=auth.uid());
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated using(owner_id=auth.uid() or public.is_admin());

create table if not exists public.system_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.system_config enable row level security;
drop policy if exists system_config_read on public.system_config;
create policy system_config_read on public.system_config for select to authenticated using(true);
insert into public.system_config(key,value) values
  ('min_supported_app_version','"2.0.0"'::jsonb),
  ('current_document_schema','"2.0.0"'::jsonb)
on conflict(key) do nothing;

insert into storage.buckets(id,name,public)
values('teryaq-author','teryaq-author',false)
on conflict(id) do nothing;

-- Object path convention: <user_uuid>/<document_id>/<attachment_id>/<filename>
drop policy if exists teryaq_storage_read on storage.objects;
create policy teryaq_storage_read on storage.objects for select to authenticated
using(bucket_id='teryaq-author' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists teryaq_storage_insert on storage.objects;
create policy teryaq_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='teryaq-author' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists teryaq_storage_update on storage.objects;
create policy teryaq_storage_update on storage.objects for update to authenticated
using(bucket_id='teryaq-author' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='teryaq-author' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists teryaq_storage_delete on storage.objects;
create policy teryaq_storage_delete on storage.objects for delete to authenticated
using(bucket_id='teryaq-author' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
