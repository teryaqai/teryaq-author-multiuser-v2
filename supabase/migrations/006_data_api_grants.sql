-- Teryaq Author v2 — explicit least-privilege Data API grants

grant usage on schema public to authenticated;

-- Keep anonymous clients completely outside application data.
revoke all on table public.profiles from anon;
revoke all on table public.documents from anon;
revoke all on table public.document_versions from anon;
revoke all on table public.devices from anon;
revoke all on table public.attachments from anon;
revoke all on table public.system_config from anon;

-- Reset authenticated table privileges, then grant only what the app uses.
revoke all on table public.profiles from authenticated;
revoke all on table public.documents from authenticated;
revoke all on table public.document_versions from authenticated;
revoke all on table public.devices from authenticated;
revoke all on table public.attachments from authenticated;
revoke all on table public.system_config from authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.documents to authenticated;
grant select on table public.document_versions to authenticated;

grant select, insert, update on table public.devices to authenticated;

grant select, insert, delete on table public.attachments to authenticated;

grant select on table public.system_config to authenticated;
