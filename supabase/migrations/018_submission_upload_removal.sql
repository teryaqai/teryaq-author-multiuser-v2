-- v2.7.4: permit the author to remove a file only while their own submission
-- is still being prepared. Submitted archive objects remain admin-only.
drop policy if exists submissions_storage_author_pending_read on storage.objects;
create policy submissions_storage_author_pending_read on storage.objects for select to authenticated
using (
  bucket_id='teryaq-submissions'
  and owner_id=auth.uid()::text
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.content_submissions s
    where s.id::text=(storage.foldername(name))[2]
      and s.owner_id=auth.uid() and s.status='uploading'
  )
);

drop policy if exists submissions_storage_author_pending_delete on storage.objects;
create policy submissions_storage_author_pending_delete on storage.objects for delete to authenticated
using (
  bucket_id='teryaq-submissions'
  and owner_id=auth.uid()::text
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.content_submissions s
    where s.id::text=(storage.foldername(name))[2]
      and s.owner_id=auth.uid() and s.status='uploading'
  )
);
