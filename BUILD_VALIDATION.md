# TERYAQ Work v3.0.7 — local validation

- First-party JavaScript syntax checked: 10 files.
- Migrations 001–042 applied on an isolated PGlite Supabase-like schema; standalone 037–042 upgrade reapplied with codes/numbering/data retained.
- Previous DB scenarios passed: scope, RLS, native form linkage, second-executor and manager submissions, approval, downstream files, QF rounds and archived links.
- Role/checklist/security regression passed: unique immutable codes, bulk author teams, locked task preservation, per-path AI, retained checklist state, comment/profile scope, anonymous and unknown-account denials.
- New task-document/account/analytics suite: 26 checks passed, including editor variants, tampered scope, immutable closed tasks, scoped manager analytics, client deletion RPC denial, self-delete denial, Auth/profile separation, retained documents and approved attribution, and deleted JWT denial.
- Chromium regression: 25 existing + 29 prior-release UI checks and 4 sidebar configurations passed.
- New release UI: 43 interaction/layout checks passed, including all main mobile surfaces at 390px, desktop layouts, Arabic Guide/Analytics, multiselect dismissal and edge placement, whole-card backup style, task panels, XLSX construction, keyboard undo/redo before and after autosave, locked fields, Submit work placement and verified offline editing. No uncaught browser errors.
- Installer: 26 persistent checkboxes, notes persistence, exported HTML review, Cloudflare future proposal, exact SQL and enforced CSP passed.
- Account deletion function: real handler tested with mocked Auth SDK; admin/auth checks, prepare→delete→finish order, provider failure retry and no secret exposure passed.
- Google Sheets regression: 15 mocked integration checks passed.

Validation used synthetic data and mocked provider APIs; no production database, Auth account, GitHub repository, DNS record or deployment was changed. Real Render/Supabase deployment and device/PWA verification remain the user's installation steps. Screenshots were inspected for local QA and are not shipped.
