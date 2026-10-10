# TERYAQ Master Tool v2.9.2

## Required database migration
Apply after migration 025:

`supabase/migrations/026_workflow_canonical_cleanup.sql`

## What this release fixes
- Scientific Draft tasks 1, 2, 3 and 4 are separate rows.
- No synthetic `2.1` task is created.
- Scientific Draft numbering is fixed to: `1, 2, 3, 4, 5, 6.1, 6.2, 6.3, 7, 8, 9, 10, 11, 12, 13, 14.1, 14.2, 15.1, 15.2`.
- Script & Presenting is fixed to: `1, 2, 3, 4, 5, 6, 7, 8, 9, 9.1, 9.2, 10, 10`.
- Montage / Video Editing is fixed to: `1, 2`, then `3S–7S` and `3V–9V`.
- Legacy aggregate rows remain in the database only for history, but are retired and hidden from current workflow/progress views.
- New chapter cycles use the canonical `standard-course` template.

After deployment, do one hard refresh so the new service-worker cache is used.
