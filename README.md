# TERYAQ Master Tool v2.8.7

Current baseline package for the TERYAQ Master Tool.

## Release highlights
- Restored Admin as a normal single sidebar entry (no collapsible Admin submenu).
- Removed Course Progress from inside Admin; the existing Courses workspace remains the course/chapter progress location.
- Added **Admin → Icons** with searchable categories, changed-only filtering, per-icon preview, PNG/SVG upload, built-in icon reuse, reset per icon, and reset all.
- Icon overrides are stored in Supabase and apply to all signed-in users after refresh.
- Existing v2.8.5/v2.8.6 Scientific Draft workflow, task UI, submissions, archive, and numbering fixes are preserved.

## Deployment
Run `supabase/migrations/023_icon_manager.sql`, then deploy the app.
