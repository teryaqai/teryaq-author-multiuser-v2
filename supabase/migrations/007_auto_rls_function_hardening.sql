-- Teryaq Author v2 — keep the automatic-RLS event trigger internal

-- Supabase created this SECURITY DEFINER function for the automatic-RLS
-- event trigger. API roles do not need to invoke it directly.
revoke all on function public.rls_auto_enable() from public;
