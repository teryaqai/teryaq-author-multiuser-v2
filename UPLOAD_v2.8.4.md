# TERYAQ Master Tool v2.8.4

1. In Supabase SQL Editor, apply `supabase/migrations/022_task_ui_submission_history_avatar.sql` after migration 021.
2. Deploy the full v2.8.4 package to GitHub/Render.
3. Hard refresh the browser or reload the installed PWA so the v2.8.4 service-worker cache replaces the prior version.

## Main changes
- Fixed Add Required Input / Add Text / Add Checklist pop-up modals.
- Task Information is now a row-based card with one Edit modal for executors and schedule.
- Searchable Scientific Draft Author assignment modal replaces the browser prompt.
- Profile avatars appear for workflow users when available, with initials fallback.
- Scientific workflow numbering is normalized and Preparation & Roles is displayed as 1–4.
- Status & Progress now uses arrows, dark green completed steps, blue current step, gray future steps, and hover explanations.
- Submission Forms page redesigned with form cards and a recent-submissions table.
- Admin → Archive now includes a Submission History tab for all users.
