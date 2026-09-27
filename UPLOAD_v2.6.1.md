# TERYAQ Master Tool v2.6.1 — release instructions

## Deployment

1. If the database has not been upgraded for v2.6.0, apply `supabase/migrations/013_submission_forms_library.sql` after migrations 001–012. An installation already running v2.6.0 needs no new migration.
2. Upload the complete release package to the existing app host. Keep `index.html`, `sw.js`, `VERSION.json`, and all four `v2.6.1` CSS/JS assets together. Do not remove the bundled icons.
3. Open the app online once on each installed device; confirm the Dashboard version reads **v2.6.1**. Reload once if an installed service worker still shows the old release.

## Acceptance checks

- Admin → Content Setup displays one template's editorial versions at a time. Admin → Submission Forms opens the form builder in its own tab; expanding a section and changing its fields keeps the section open. Admin → Archive shows submitted files. The main sidebar Submission Forms and admin Archive use the supplied icons.
- In Shooting Script, insert **انترو** and **فاصل خفيف** and confirm they appear in the script and the standard PDF, while neither appears in Teleprompter. Mark a selected visual reference and insert `[ملاحظة للمراجعة: …]`; both remain in the script and stay out of Teleprompter. Insert `(للمقدم: …)` and confirm it appears while reading.
- File → Export → **نسخة المونتاج (PDF)** opens a separate print/PDF view. It excludes presenter guidance and review notes while preserving spoken text and figure/table references. Use the browser's **Save as PDF** destination. The standard PDF still includes the annotations.
- Move a spoken line, cue, or heading with its up/down controls. Edit the spoken text in Teleprompter and confirm visual references and review notes remain attached to the saved script.

Existing documents and previously inserted instruction cues remain readable. The new cue buttons affect new content; no document schema or cloud migration is added in this release.
