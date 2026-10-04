# TERYAQ Master Tool v2.8.6

1. No new Supabase migration is required for this release. Keep migrations through 022 applied.
2. Deploy the full v2.8.6 package to GitHub/Render.
3. Hard refresh the browser or reload the installed PWA so the v2.8.6 service-worker cache replaces the prior version.

## v2.8.6 updates
- Admin in the main sidebar is now a collapsible submenu instead of a single flat entry.
- The Admin submenu links directly to Overview, Content Setup, Account Requests, Course Progress, Submission Forms, Archive, Cloud Operations, Analytics, Audit Log, Trash Management, and Updates.
- The Admin submenu remembers whether it was open or closed.
- Added Admin → Course Progress, with a course selector so progress is reviewed one course at a time.
- Course Progress shows overall course completion plus per-chapter progress and per-work-area percentages for Scientific Draft, Script, Questions, Flashcards, Shooting, and Editing.
- No database schema changes were required.
