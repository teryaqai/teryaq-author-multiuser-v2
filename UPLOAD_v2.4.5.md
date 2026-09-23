# TERYAQ Master Tool v2.4.5 — Deployment

## 1. Back up before updating

1. From the current application, run **Settings & Sync → Export Workspace Backup** on devices that may contain pending local work.
2. Confirm important documents show `Synced ✓` where possible.
3. Create a Supabase database backup before applying the migration.

## 2. Apply the one new Supabase migration

Run this file in Supabase after migrations 001–007:

`supabase/migrations/008_dynamic_content_options.sql`

It creates administrator-managed Authors, Subjects, and Chapters. Authenticated users can read active choices; only accounts whose profile role is `admin` can add or update them.

## 3. Upload the Render package

Upload the contents of `TERYAQ_Master_Tool_Render_Deploy_v2.4.5.zip` to the repository root, commit, and allow Render to deploy.

Do not upload a Supabase service-role key or a configured local cloud connection.

## 4. Refresh installed devices

Open the online app once on every laptop/Android/iPad device and confirm the Dashboard shows `v2.4.5`. Close and reopen an installed PWA if an older cached version is still visible.

## 5. Initial admin setup

Open **Admin → Content Options** and add:

1. Authors
2. Subjects
3. Chapters linked to their subjects

After saving, the choices become available to connected users automatically. Future option changes do not require GitHub or Render deployment.

## 6. Required production smoke test

1. Create a document using the new selectors.
2. Add and delete a table, then Undo.
3. Test View Only → One Page and Two Pages against Export as PDF.
4. Edit on Android Chrome and wait for `Synced ✓`.
5. Open the same account/document on the laptop and confirm the Android edit arrives.
