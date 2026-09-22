# Upload TERYAQ Master Tool v2.4.0

1. Upload the complete v2.4.0 package to the existing GitHub repository, preserving its folders.
2. Confirm Render deploys the newest commit successfully.
3. Open the HTTPS site online and confirm the Dashboard and sidebar show `v2.4.0`.
4. Fully close and reopen installed laptop/mobile PWAs online once so the v2.4.0 service worker replaces the previous cache.
5. Open a text document and confirm the action bar and formatting ribbon remain visible while scrolling.
6. Confirm the sidebar expands/collapses, the Outline drawer opens/closes, and Draft information remains separate from the A4 page.
7. Insert a table and provide Table code, Table title, and an optional caption. Confirm the linked Table information card updates the caption beneath the table when edited.
8. Run the v2.4.0 regression section in `TEST_CHECKLIST.md`, followed by the existing v2.3.4 sync-race checks.

No Supabase migration is required. The optional table-caption property is backward-compatible with existing document JSON, and the document schema remains `2.0.0`.
