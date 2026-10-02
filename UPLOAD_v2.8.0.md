# TERYAQ Master Tool v2.8.0

## Upgrade from v2.7.6

1. In Supabase SQL Editor, run `supabase/migrations/020_scientific_workflow_automation.sql` **once** after migration 019.
2. Upload/deploy the full v2.8.0 package to Render/GitHub.
3. Hard refresh the browser / reload the installed PWA so the v2.8.0 service worker cache replaces v2.7.6.
4. Test with an Admin account first, then a normal Task Executor account.

## v2.8.0 test checklist

- Course structure is Chapter-first; each chapter switches between Scientific Draft, Script, Questions, Flashcards, Shooting and Montage.
- Scientific Draft task numbering matches the approved workflow exactly: 1–5, 6, 7–12, 13.1, 13.2, 14.1, 14.2.
- Task 6 is named **Scientific Draft V1 Review** and represents 6.1 / 6.2 / 6.3.
- Task assignment supports multiple Task Executors or the whole Course Team.
- Scientific Draft Author is assigned once per chapter and propagates to drafting/update tasks.
- Team & Task Executors is visible to course users; My Tasks only lists the current user’s assignments.
- Course roles are Course Lead, Scientific Lead, Script Lead and AI Lead.
- Course Lead can view Required Files across the entire course. Specialized leads manage their areas.
- Task Instructions support text and checklist blocks. Any signed-in user viewing a task can comment.
- Task status flow is shown with hover explanations.
- Review Requests gives Admin / authorized leads Approve and Request Changes actions.
- Required Files auto-link from prior submissions according to the Scientific Draft workflow; manual required inputs can also be attached by management.
- Preparation & Rules resources are shared with everyone in the course.
- Submission history keeps resubmissions; downstream tasks use the latest current submission.
- Scientific Draft form supports V1–V5 with conditional required reports.
- Scientific Draft V1 Review form: First Report HTML + Simplified Audit HTML + Figures/Shapes/Diagrams ZIP.
- Comprehensive Scientific Audit form supports V1/V2; V2 adds 100% Accuracy Review Notes.
- Designed Scientific Draft form supports Design V1/V2 and requires PDF + HTML.
- Navigation state is preserved when leaving and returning to the course workspace.

If migration 020 is not applied, the v2.8.0 workflow UI will show an explicit migration error rather than silently falling back.
