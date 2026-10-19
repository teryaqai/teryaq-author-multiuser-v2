# TERYAQ Work v3.0.8

Read INSTALL_v3.0.8.html first. This updates v3.0.7 (migrations through 042). Run UPDATE_SUPABASE_v3.0.8.sql first, then replace static files. SQL 043 is safe to rerun. Fresh installation: migrations 001–043 in order. Existing data, local storage keys and Render connection variables are retained. No data reset or external deployment was performed.

Changes: compact chapter accordions; contained account buttons; editable local-today submission end dates; caller-bound editor authorization; resume linked local/cloud documents and prevent per-page double-click duplication; password recovery; sync diagnostics/retry; plain menu glyph; unframed logo; one search border.

Cloudflare Access works according to the user's latest confirmation. No DNS or Access policies change. The previous sync failure was not diagnosed against the live account. Use sync details and retry after installation. Password recovery was tested with mocked Auth APIs; actual email delivery requires a production check.

The installer keeps the previous review, current-release checks, notes, HTML export and the development register. Validation sources are in VALIDATION_SOURCE.zip; extract into validation/ to rerun. Dependencies are not included. Historical standalone upgrades are omitted from the deployment archive; numbered installation migrations remain included.
