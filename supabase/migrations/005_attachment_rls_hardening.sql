-- Teryaq Author v2 — attachment ownership and function privilege hardening

-- Attachment metadata must point to a live document owned by the caller,
-- and its storage path must follow: <user_uuid>/<document_id>/...
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
for insert to authenticated
with check (
  owner_id = auth.uid()
  and split_part(storage_path, '/', 1) = auth.uid()::text
  and split_part(storage_path, '/', 2) = document_id
  and exists (
    select 1
    from public.documents d
    where d.id = attachments.document_id
      and d.owner_id = auth.uid()
      and d.deleted_at is null
  )
);

-- Only authenticated clients need the admin-check helper used by RLS.
-- Trigger functions should not be directly executable by API roles.
revoke all on function public.handle_new_user() from public;
revoke all on function public.protect_profile_role() from public;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
