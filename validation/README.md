# Local validation
Run in an isolated development directory, not against a live Supabase project.

Dependencies: Node 24+, @electric-sql/pglite, playwright, @sparticuz/chromium 131.0.1.
Install them as development dependencies outside the deployed static site, then expose their node_modules through NODE_PATH if necessary.

- node validation/scenarios.cjs — applies migrations 001–039 in an isolated PGlite database with mock Supabase auth/storage; tests scoped table and RPC access, roles, actual storage row permissions, native submission linkage, old-package linking, approval, downstream inputs and repeated atomic upgrade.
- node validation/browser.cjs — launches Chromium and serves local files with test-only closure hooks; production source files are not modified. Tests refresh, comment preservation, role-specific UI, native form linkage, standalone .teryaq documents, Arabic/English direction and icon centering. Local screenshots remain in /tmp.
- node google-sheets-test/sheets-sync.test.cjs — existing mocked Sheets integration and service worker regression tests.

No credentials or live data are needed. Test identities and storage records are synthetic. The browser server injects hooks only into its HTTP responses and disables normal application boot only for the test.
