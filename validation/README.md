# Local validation

Requires Node.js 22+ and development dependencies @electric-sql/pglite, playwright, @sparticuz/chromium@131.0.1.
No real accounts, cloud credentials or user data are used. Supabase Auth, Storage and APIs are mocked; SQL runs on PGlite and UI runs in Chromium.

- node validation/scenarios.cjs: scope, native submissions, approval, downstream files, legacy linking and repeat atomic upgrade.
- node validation/new-release.cjs: unique immutable codes, bulk role teams, locks, per-area AI, checklist state, RLS/RPC rejection and repeat upgrade.
- node validation/browser.cjs: existing editor/refresh/form regression, new dashboard/team/filter/checklist/ZIP/XSS/direction checks, 4 sidebar configurations, installer persistence and exact SQL under CSP.
- node google-sheets-test/sheets-sync.test.cjs: 15 mocked integration checks.

Browser test mutates HTTP script responses to expose test hooks; production files are not modified. Screenshots are temporary QA files only.
