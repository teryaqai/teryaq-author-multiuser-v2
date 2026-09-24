# TERYAQ Master Tool v2.5.0 — Safe Deployment

## 1. Back up before changing production

1. On every device that may contain pending work, open **Settings & Sync → Export Workspace Backup**.
2. Confirm important documents show **Synced ✓** where possible.
3. Create a Supabase database backup.
4. Keep the verified v2.4.7 Render package unchanged as the application rollback package.

## 2. Apply the additive database migration

Run `supabase/migrations/010_governance_admin_tools.sql` once in the Supabase SQL Editor after migrations 001–009.

The migration finishes by notifying PostgREST to reload its schema cache. If the SQL Editor reports success but the application still says that `audit_log`, `account_requests`, `sync_conflicts`, or `admin_analytics` is missing, run `NOTIFY pgrst, 'reload schema';` once in a separate SQL Editor query and reload the application.

The migration adds account requests, audit events, cloud conflict metadata, a 30-day Trash retention setting, administrator restore/purge RPCs, and analytics. It does not alter the document JSON schema, local IndexedDB schema, style contract, or the existing `push_document()` synchronization algorithm.

Do not edit or rerun migrations 001–009 as a replacement for migration 010.

## 3. Deploy the protected account-approval function

With the Supabase CLI linked to the correct project:

```bash
supabase secrets set TERYAQ_SITE_URL=https://teryaq-author-multiuser-v2.onrender.com --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-account-request --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-governance --project-ref YOUR_PROJECT_REF
```

Use the exact production HTTPS address for `TERYAQ_SITE_URL`. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function environment. Never place the service-role key in Render, GitHub source, `index.html`, browser settings, or the publishable-key field. `admin-governance` is required because Supabase Storage files must be permanently removed through the Storage API rather than by deleting `storage.objects` rows in SQL.

In **Supabase → Authentication → URL Configuration**, set the same Render HTTPS address as **Site URL** and add it to **Redirect URLs**. Otherwise Supabase can ignore the invitation redirect and the user will not reach the TERYAQ password-creation screen.

## 4. Deploy the static application

Upload the v2.5.0 deploy package contents to the repository root, commit, and wait for Render to report a successful deployment.

Open the site online once on every installed device. Confirm the Dashboard and sidebar display **v2.5.0**. If an installed PWA still displays an older version, close it completely and reopen it online so the new service worker and versioned assets can install.

## 5. Production smoke test

1. Existing user: sign in, type continuously for at least 30 seconds, save, sync, and confirm the exact text appears on a second device.
2. Offline: disconnect, edit, close/reopen the PWA, confirm the local draft remains, reconnect, and confirm automatic synchronization.
3. Versions: sync several changes, open **History / Versions → Cloud versions & compare**, and compare two versions without changing the live document.
4. Request: submit an account request from sign-in. In **Admin → Account Requests**, approve it, open the invitation link, create an 8+ character password, and confirm the approved user enters only their own workspace.
5. Conflicts: create one genuine two-device conflict and confirm **Admin → Cloud Conflicts** displays metadata while the owner still resolves the content on their device.
6. Trash: delete and sync a test document. As admin, restore it and confirm it returns to the owner's device after synchronization.
7. Retention: confirm permanent deletion remains disabled until the configured retention period expires. Do not shorten production retention merely to test it.
8. Audit: confirm the actions appear in **Admin → Audit Log**, export CSV, and open it safely.
9. Regression: verify Content Options, DOCX table import, unified Export, PDF/A4 view, Arabic lists, exact styles, Outline, autosave focus, and the existing conflict-resolution choices.

## 6. Application rollback

If the static UI fails before migration 010 is used, redeploy the preserved v2.4.7 package. Migration 010 is additive, so its new tables and functions may remain while the v2.4.7 client is temporarily restored. Do not delete production tables or reverse migrations during an incident without a database backup and a reviewed rollback plan.
