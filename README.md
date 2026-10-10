# TERYAQ Master Tool v2.9.1

## v2.9.1
- Exact workflow numbering from the latest Scientific Draft & Design, Script & Presenting, and Montage / Video Editing workflow diagrams.
- Scientific Draft tasks 1, 2, 3, and 4 are separate tasks; no standalone 2.1 task is created.
- Required Files & Inputs now supports Text, Link, Files, Images, and nested Folders.
- Required inputs can be applied to the same task across all chapters in the current course.
- Status & Progress is a full-width responsive strip; mobile uses horizontal scrolling without clipping.
- Checklist items persist their checked state and show strikethrough when completed.
- Comment composer is smaller, rounded, responsive, and auto-grows.
- Migration 025 is required after 024.

# TERYAQ Master Tool v2.9.0

Current baseline package for the TERYAQ Master Tool.

## Release highlights
- Restored Admin as a normal single sidebar entry (no collapsible Admin submenu).
- Removed Course Progress from inside Admin; the existing Courses workspace remains the course/chapter progress location.
- Added **Admin → Icons** with searchable categories, changed-only filtering, per-icon preview, PNG/SVG upload, built-in icon reuse, reset per icon, and reset all.
- Icon overrides are stored in Supabase and apply to all signed-in users after refresh.
- Existing v2.9.0/v2.9.0 Scientific Draft workflow, task UI, submissions, archive, and numbering fixes are preserved.

## Deployment
Run `supabase/migrations/023_icon_manager.sql`, then deploy the app.

## v2.9.0
- Full icon-placement audit across navigation, chapter/workflow pages, task cards, Submission Forms, Admin, Editor, and shared controls.
- Submission Form card icons now have independent Icon Manager keys.
- Workflow area and task-card icons now have independent Icon Manager keys.
- No new Supabase migration beyond 023_icon_manager.sql.


## v2.9.0 deployment note
Cloud connection is deployment-managed. Configure `TERYAQ_SUPABASE_URL` and `TERYAQ_SUPABASE_ANON_KEY` in Render. Never expose a service-role key.


## v2.9.0
- White application background.
- AI Hand Off package for configured AI tasks: copy prompt, download required files as ZIP, expected output, notes.
- Rich chapter/work-area progress summaries (Approved / In Review / Changes Requested / Blocked / In Progress).
- Final icon consolidation: built-in UI icon assets embedded into the application bundle; uploaded icon overrides remain Supabase-backed.
