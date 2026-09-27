# TERYAQ Master Tool v2.6.3 — release instructions

## Deploy in this order

1. Confirm migrations 001–014 were applied to this Supabase project. Apply `supabase/migrations/015_cloud_version_retention.sql` in the Supabase SQL Editor. This adds administrator-only functions; it does **not** clean up any versions by itself.
2. Upload the complete v2.6.3 package to the existing Render app. Keep the versioned JavaScript/CSS assets, `index.html`, `sw.js`, `VERSION.json`, the new `icons/ui/drag.png`, and the existing assets together. The Edge Functions are unchanged from v2.6.2.
3. Open the app online and verify the Dashboard shows v2.6.3. Reload installed devices once if their previous offline shell persists.

## Verify

- Admin → Cloud Operations → Versions shows actual database/table sizes and estimated snapshot payloads per document. `Clean eligible` is disabled until `Backup all` downloads that document's entire history. Keep that file before confirming cleanup. A cleanup is available only if versions are older than 90 days **and** outside the newest 10; the current document version is protected. If the document or eligible set changed during backup, the server refuses the cleanup and requires a fresh backup. Check Audit Log for `version.history_pruned`.
- Admin → Submission Forms → select a form → Preview form. Change a question without saving and confirm the preview reflects it. Jump among sections with empty required fields and select a conditional Yes/No choice. Upload inputs remain disabled, and there is no Submit control or draft submission created.
- Figures and Shooting Script both have a Version field in their information cards. Export script HTML, PDF, JSON, and montage PDF: each asks to confirm the version, and HTML/PDF show the chosen version. Figures PDF, HTML, JSON, and figures-only PDF retain their existing version prompt. The script's drag icons use the supplied file, align on the left, and start at the top of each block.
- Create a document, edit and sync from two devices to check that document saving and conflict handling still use the existing logic. No pruning occurs automatically or from normal sync.

If migration 015 is not installed yet, the previous read-only Versions browser remains accessible; the new storage and cleanup controls require the migration.
