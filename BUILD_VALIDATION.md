# v3.0.4 checks

- All application JavaScript passes node --check; admin-governance TypeScript transpiles.
- Browser checks pass for baseline profile/password/permissions/task buttons/My Tasks/export/Discard/control centering; QF shared round selection, readonly central identities, dates, multi-file uploads and individual removal, submission metadata/destination, logo 72×72 with contain, and visible local-today template Start Date.
- PostgreSQL (PGlite with Supabase auth/storage scaffold) applies migrations 001–036 and verifies exactly three new forms and ten tasks with numbers 1–10; unchanged scientific numbering/statuses; automatic review author assignment; correct Round 1 -> V2 -> audit -> Round 2 -> V3 -> final QC -> upload routing; dates and conditional updated-source requirement; all eight final outputs and confirmations; native task-output attachments; access across separate audit/review executors; denied access for unrelated users; immutable submitted scopes; idempotent upgrades.
- Reset tests preserve accounts/course setup/avatars and remove work/versions/audit records, reject stale-generation saves and accept new-generation documents.
- Edge handler tests cover plain-object PostgREST error messages, error phase/code, safe preflight and actual Storage API call sequencing against a mock client.
- Live Supabase/Render deployment and reset were not performed. External audit tool integration must register structured data through the provided RPC; no automatic HTML audit extraction is claimed.
