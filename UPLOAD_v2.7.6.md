# TERYAQ Master Tool v2.7.6

## Required before deployment
1. In Supabase SQL Editor, run `supabase/migrations/019_chapter_work_areas_course_roles.sql` after migration 018.
2. Upload the full contents of this package to GitHub/Render, replacing the v2.7.5 static bundle.
3. Hard refresh/reload the installed PWA so the v2.7.6 service worker cache replaces v2.7.5.

## What changed
- Chapter is now the primary production unit.
- Every chapter has separate work-area pages/tabs: Scientific Draft & Design, Script & Presenting, Questions, Flashcards, Shooting / Production, and Montage (Video Editing).
- Scientific Draft and Script tasks are expanded into detailed normal task lists; deliverables are not shown as separate workflow nodes.
- Task list includes Status, Task Executor, Start Date, Due Date, and Actions.
- Assignment now shows Task Executor only; legacy Author/Reviewer columns are preserved in the database but are no longer edited from Assignment.
- Course Lead is replaced by Course Management Team roles: Scientific Lead, Script Lead, AI Lead, Production Lead, and Post-Production Lead.
- A person can hold multiple roles in the same course.
- Review/approval/assignment permissions are scoped to the manager role for that work area. Admin retains full access.
- Existing legacy Course Leads are migrated to all five roles initially so no access is lost; Admin can remove unneeded roles from Manage Course Team.

## Non-destructive compatibility
Migration 019 does not delete legacy `author_id`, `reviewer_id`, or `course_leads` data. They remain available for historical compatibility.
