# TERYAQ Master Tool v2.6.4 — release instructions

1. If you have not yet applied migration 015, run `supabase/migrations/015_cloud_version_retention.sql` in your Supabase SQL Editor after migration 014. This enables the admin cloud version tools from v2.6.3. The figures menu fix itself needs no database migration.
2. Upload the complete v2.6.4 package to the existing Render host. Keep `index.html`, the four `v2.6.4` JavaScript/CSS files, `sw.js`, `VERSION.json`, icons, fonts, and vendor assets together.
3. Open a Scientific Draft – Figures. Under File, check that Export, Import, History / Versions, Submission Forms, Validate, and Settings & Sync appear. Open Export and confirm it shows Editable `.ترياق`, PDF, Figures only (PDF), Save as Template, and HTML. Choose the Figures only PDF option: it should request confirmation of the editorial version and print each image with its Figure code.
4. Open a text draft and a Shooting Script: their usual tabs and export choices should still be present. Reload once on each installed device if its old offline version persists.

The installed app should display v2.6.4. See `UPLOAD_v2.6.3.md` for the previous release's version cleanup and form preview verification.
