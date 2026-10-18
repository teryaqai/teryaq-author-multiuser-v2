# v3.0.6 local validation — 2026-10-18

- SQL migrations 001–041 apply to a clean isolated PostgreSQL/PGlite database.
- Existing scope/native submission/manager review/downstream Storage/legacy linking regression scenarios pass.
- New immutable codes, role-team assignment, locked-task retention, separate AI teams, checklist-state retention, comment scope, profile edit protection, unknown-account and anon rejection scenarios pass.
- Exact atomic upgrade reapplied in test databases, preserving task codes, task numbers, statuses and file references.
- Chromium: 25 existing regression checks plus 29 new UI/security checks and 4 sidebar configurations pass; no page errors.
- Installer: 19 checkboxes persist across reload; embedded SQL equals the standalone SQL bytes. Installer and UI exercised under actual CSP response headers.
- Google Sheets Test: 15 mocked integration checks pass.
- Syntax checks for all first-party JavaScript and ZIP integrity check pass.
- Desktop and mobile screenshots inspected locally; screenshots are not included in the deliverable.

Tests use synthetic users and mock Auth/Storage/provider APIs. No live Supabase SQL was executed, no GitHub content was changed, no deployment was made, and no user data was reset. See SECURITY_REVIEW_v3.0.6.md for full audit limits.
