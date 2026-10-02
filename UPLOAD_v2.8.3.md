# TERYAQ Master Tool v2.8.3

## Deploy
1. Keep all Supabase migrations through `021_task_ui_resources_instruction_scope.sql` applied.
2. No new database migration is required for v2.8.3.
3. Deploy the full v2.8.3 package to GitHub/Render.
4. Hard refresh the browser or reload the installed PWA so the v2.8.3 service-worker cache replaces the prior version.

## Quick test checklist
- Open a task and confirm the first row is 50/50: Task Information + Status & Progress.
- Confirm Task Information contains Task ID, Work Area, Chapter, Version, Description, Executors, Start Date, and Due Date.
- Confirm there is no separate Quick Details or Assignment & Schedule card.
- Confirm Required Files / Inputs is full width.
- Confirm Task Instructions and Task Checklist are side-by-side on desktop.
- Confirm Comments and Activity are side-by-side on desktop.
- Confirm executor selection remains a searchable dropdown.
- Confirm Add Text, Add Checklist, and Add Required Input still open in-site modal popups.
