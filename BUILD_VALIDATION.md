# v3.0.5 validation — 2026-10-18

Passed locally:
- PostgreSQL engine via PGlite: all 39 migrations apply against mock Supabase auth/storage schemas.
- Eight synthetic accounts: admin, two executors, same-chapter colleague, Scientific Lead, Course Lead, AI Lead and unrelated user. Scoped course/chapter/task RLS and direct RPC denials pass.
- Configurable AI Handoff data is withheld from non-AI Leads, including admin/course-lead accounts without the AI Lead role. Direct AI column reads and legacy implementation RPC calls are denied. AI Lead can configure handoff and access its resolved inputs.
- A second executor can submit despite a different legacy owner and null author/reviewer. Required outputs and actual mock storage-object records are checked; invalid paths and incomplete packages are rejected.
- Directory submission links to the native task, creates In review, appears in task history, and after lead approval supplies downstream inputs.
- Actual storage SELECT tests distinguish the downstream executor's permitted input from unrelated files and an unrelated account.
- Historical archive package links once without re-upload, retaining the original files and submitted_at. Stage lead can submit without being assigned as executor.
- Shared QF Round 1 retains central author/code, files, stage routing, approval and downstream delivery.
- Atomic UPDATE_SUPABASE_v3.0.5.sql can be reapplied twice without changing numbering, approvals or existing submission files.
- Chromium: 25 checks cover local task refresh and errors, unsaved comment preservation, stale actions, native task binding and scope locks, standalone .teryaq input, rejection of a document linked to another task, Arabic named styles, English and leading digits.
- Four sidebar configurations: native/custom icons with expanded/collapsed sidebar; icon centers are within one pixel of the button center.
- Google Sheets: all 15 existing mocked integration checks pass. Its setup guide remains excluded from the PWA app-shell navigation cache.
- First-party JavaScript syntax and ZIP integrity checked.

Limits: Supabase Auth/Storage and Sheets endpoints are mocked. No real upload, deployment, work reset or live database modification was performed. Previous v3.0.4 features and workflow numbering are retained; scope is the seven requested changes plus their necessary file-permission and compatibility fixes.
