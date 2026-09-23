# TERYAQ Master Tool v2.4.6 — Deployment

## 1. Back up first

1. Export a Workspace Backup from devices that may contain pending work.
2. Confirm important documents reach `Synced ✓` where possible.
3. Create a Supabase database backup.

## 2. Run the repair migration

In the Supabase SQL Editor, run:

`supabase/migrations/009_content_options_repair_course_hierarchy.sql`

This migration is safe whether migration 008 succeeded, partially succeeded, or was skipped. It repairs the option tables, RLS policies and grants, and adds the administrator-only option save function.

## 3. Deploy the application

Upload the contents of `TERYAQ_Master_Tool_Render_Deploy_v2.4.6.zip` to the repository root, commit, and allow Render to deploy.

## 4. Refresh every device

Open the online application once on Android and laptop devices. Confirm the Dashboard displays `v2.4.6`. Close and reopen an installed PWA if an older cached version remains visible.

## 5. Configure the hierarchy

Open **Admin → Content Options**:

1. Add Authors.
2. Add Courses.
3. Under **Chapters by Course**, choose one Course.
4. Add the chapters that belong to that Course.
5. Switch Courses and confirm each one has an independent chapter list.

## 6. Production smoke test

1. Create a document and select a Course.
2. Confirm only that Course's Chapters appear.
3. Select one Chapter and confirm its number and title appear in the document and exports.
4. Save on Android Chrome, wait for `Synced ✓`, and confirm the laptop receives the same document.
