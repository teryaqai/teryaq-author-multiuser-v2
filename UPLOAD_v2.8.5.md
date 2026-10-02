# TERYAQ Master Tool v2.8.5

1. No new Supabase migration is required for this release. Keep migrations through 022 applied.
2. Deploy the full v2.8.5 package to GitHub/Render.
3. Hard refresh the browser or reload the installed PWA so the v2.8.5 service-worker cache replaces the prior version.

## v2.8.5 fixes
- Scientific Draft & Design task numbering now follows the approved workflow exactly, including legacy task keys: 1–4, 5, 6.1, 6.2, 6.3, 7, 8, 9, 10, 11, 12, 13.1, 13.2, 14.1, 14.2.
- Scientific Draft task rows are ordered by the approved workflow sequence rather than legacy database sort numbers.
- Recent Submissions now spans the full available width on desktop with responsive table columns and no unnecessary horizontal scrollbar.
