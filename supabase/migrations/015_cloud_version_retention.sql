-- v2.6.3: administrator-only inspection and deliberate cleanup of old snapshots.
-- Sync, current documents, their monotonic version counters, and trash retention
-- are unchanged. Run after 014_submission_uploads_history.sql.
begin;

create or replace function public.admin_version_storage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;

  with ranked as (
    select v.document_id, v.version, v.created_at,
      coalesce(pg_column_size(v.document_json), 0)::bigint as payload_bytes,
      d.current_version,
      row_number() over (partition by v.document_id order by v.version desc) as newest_rank
    from public.document_versions v
    join public.documents d on d.id = v.document_id
  ), counts as (
    select document_id, count(*) as version_count,
      sum(payload_bytes) as payload_bytes,
      count(*) filter (where newest_rank > 10 and created_at < now() - interval '90 days'
        and version <> current_version) as eligible_count,
      coalesce(sum(payload_bytes) filter (where newest_rank > 10
        and created_at < now() - interval '90 days' and version <> current_version), 0) as eligible_bytes
    from ranked group by document_id
  )
  select jsonb_build_object(
    'version_table_bytes', pg_total_relation_size('public.document_versions'::regclass),
    'database_bytes', pg_database_size(current_database()),
    'keep_latest', 10, 'keep_days', 90,
    'documents', coalesce(jsonb_agg(jsonb_build_object(
      'document_id', d.id, 'title', d.title, 'owner_id', d.owner_id,
      'current_version', d.current_version, 'deleted', d.deleted_at is not null,
      'version_count', coalesce(c.version_count, 0),
      'payload_bytes', coalesce(c.payload_bytes, 0),
      'eligible_count', coalesce(c.eligible_count, 0),
      'eligible_bytes', coalesce(c.eligible_bytes, 0)
    ) order by d.updated_at desc), '[]'::jsonb)
  ) into result
  from public.documents d left join counts c on c.document_id = d.id;

  return result;
end $$;

revoke all on function public.admin_version_storage() from public;
grant execute on function public.admin_version_storage() to authenticated;

create or replace function public.admin_prune_document_versions(
  p_document_id text, p_expected_current_version bigint, p_expected_eligible integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  doc public.documents%rowtype;
  eligible_count integer;
  eligible_bytes bigint;
  removed_count integer;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;
  if p_document_id is null or p_expected_current_version is null
    or p_expected_eligible is null or p_expected_eligible < 1 then
    raise exception 'A reviewed cleanup preview is required';
  end if;

  -- push_document and admin_restore_document also lock this row. New writes
  -- cannot change the protected current version during this transaction.
  select * into doc from public.documents where id = p_document_id for update;
  if not found then raise exception 'Document no longer exists'; end if;
  if doc.current_version <> p_expected_current_version then
    raise exception 'Document changed since the backup. Refresh and download a new backup.';
  end if;

  with ranked as (
    select v.id, v.version, v.created_at,
      coalesce(pg_column_size(v.document_json), 0)::bigint as payload_bytes,
      row_number() over (order by v.version desc) as newest_rank
    from public.document_versions v where v.document_id = p_document_id
  ), eligible as (
    select * from ranked where newest_rank > 10
      and created_at < now() - interval '90 days' and version <> doc.current_version
  )
  select count(*)::integer, coalesce(sum(payload_bytes), 0)
    into eligible_count, eligible_bytes from eligible;
  if eligible_count <> p_expected_eligible then
    raise exception 'Eligible versions changed since the backup. Refresh and download a new backup.';
  end if;

  with ranked as (
    select v.id, v.version, v.created_at,
      row_number() over (order by v.version desc) as newest_rank
    from public.document_versions v where v.document_id = p_document_id
  ), removed as (
    delete from public.document_versions v using ranked r
    where v.id = r.id and r.newest_rank > 10
      and r.created_at < now() - interval '90 days' and r.version <> doc.current_version
    returning v.id
  )
  select count(*)::integer into removed_count from removed;
  if removed_count <> eligible_count then
    raise exception 'Version cleanup did not match the preview. No changes were saved.';
  end if;

  insert into public.audit_log(actor_id, event_type, entity_type, entity_id, owner_id, metadata)
  values (auth.uid(), 'version.history_pruned', 'document', doc.id, doc.owner_id,
    jsonb_build_object('removed_count', removed_count, 'snapshot_payload_bytes', eligible_bytes,
      'kept_latest', 10, 'kept_days', 90, 'current_version', doc.current_version));

  return jsonb_build_object('removed_count', removed_count, 'snapshot_payload_bytes', eligible_bytes);
end $$;

revoke all on function public.admin_prune_document_versions(text,bigint,integer) from public;
grant execute on function public.admin_prune_document_versions(text,bigint,integer) to authenticated;

commit;
notify pgrst, 'reload schema';
