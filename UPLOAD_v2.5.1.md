# TERYAQ Master Tool v2.5.1 — Safe Deployment

## 1. Back up before changing production

1. On every device that may contain pending work, open **Settings & Sync → Export Workspace Backup**.
2. Confirm important documents show **Synced ✓** where possible.
3. Create a Supabase database backup.
4. Keep the verified v2.5.0 Render package unchanged as the application rollback package.

## 2. Apply the additive database migration

Confirm migrations 001–010 already exist, then run `supabase/migrations/011_v2_5_1_profiles_updates.sql` once in the Supabase SQL Editor.

The migration adds `profiles.avatar_path`, `app_updates`, and `app_update_reads`, with RLS that lets every authenticated user read announcements and their own read receipts while only administrators may publish or delete announcements. It finishes by notifying PostgREST to reload its schema cache.

Migration 011 is additive. It does not alter the document JSON schema, style contract, `push_document()` synchronization algorithm, or conflict rules. The browser IndexedDB version increases to 4 only to add a separate media queue and offline cache.

Do not edit or rerun migrations 001–010 as a replacement for migration 011.

## 3. Deploy the protected account-approval function

For click-by-click Dashboard instructions, open `EDGE_FUNCTIONS_SETUP.md`.

With the Supabase CLI linked to the correct project:

```bash
supabase secrets set TERYAQ_SITE_URL=https://teryaq-author-multiuser-v2.onrender.com --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-account-request --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-governance --project-ref YOUR_PROJECT_REF
```

Use the exact production HTTPS address for `TERYAQ_SITE_URL`. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function environment. Never place the service-role key in Render, GitHub source, `index.html`, browser settings, or the publishable-key field. `admin-governance` is required because Supabase Storage files must be permanently removed through the Storage API rather than by deleting `storage.objects` rows in SQL.

In **Supabase → Authentication → URL Configuration**, set the same Render HTTPS address as **Site URL** and add it to **Redirect URLs**. Otherwise Supabase can ignore the invitation redirect and the user will not reach the TERYAQ password-creation screen.

## 4. Deploy the static application

Upload the v2.5.1 deploy package contents to the repository root, commit, and wait for Render to report a successful deployment.

Open the site online once on every installed device. Confirm the Dashboard and sidebar display **v2.5.1**. If an installed PWA still displays an older version, close it completely and reopen it online so the new service worker and versioned assets can install.

## 5. Production smoke test

1. Existing user: sign in, type continuously for at least 30 seconds, save, sync, and confirm the exact text appears on a second device.
2. Offline: disconnect, edit, close/reopen the PWA, confirm the local draft remains, reconnect, and confirm automatic synchronization.
3. Versions: sync several changes, open **History / Versions → Cloud versions & compare**, and compare two versions without changing the live document.
4. Request: submit an account request from sign-in. In **Admin Center → Users & Access → Account requests**, approve it, open the invitation link, create an 8+ character password, and confirm the approved user enters only their own workspace.
5. Conflicts: create one genuine two-device conflict and confirm **Admin Center → Cloud Operations → Conflicts** displays metadata while the owner still resolves the content on their device.
6. Trash: delete and sync a test document. As admin, restore it and confirm it returns to the owner's device after synchronization.
7. Retention: confirm permanent deletion remains disabled until the configured retention period expires. Do not shorten production retention merely to test it.
8. Audit: confirm the actions appear in **Admin → Audit Log**, export CSV, and open it safely.
9. Regression: verify Content Options, DOCX table import, unified Export, PDF/A4 view, Arabic lists, exact styles, Outline, autosave focus, and the existing conflict-resolution choices.
10. Profile: upload a photo offline, reconnect, sync, and verify it appears on a second device. Remove it offline and verify the default avatar returns after reconnect.
11. Updates: publish and delete an update as admin; verify Dashboard/bell parity, unread count, per-user read state, and offline cached display.
12. Figure media: select a large image offline, reconnect, observe percentage/bytes/speed/ETA, interrupt the connection, and verify the resumable upload completes without changing text autosave or producing a false Synced status.
13. Figures export: leave each mandatory field empty in turn and confirm export is blocked, the missing field is highlighted, and Caption/Details/Notes remain optional.
14. Admin performance: switch among all eight Admin Center sections, verify only the active section loads, search is debounced, pagination works, and typing is not lost during background sync.

## 6. Application rollback

If the static UI fails, redeploy the preserved v2.5.0 package. Migration 011 is additive, so its new columns and tables may remain while the v2.5.0 client is temporarily restored. Do not delete production tables or reverse migrations during an incident without a database backup and a reviewed rollback plan.
