# Upload TERYAQ Master Tool v2.4.2

1. Upload the complete v2.4.2 package to the existing GitHub repository, preserving its folders.
2. Confirm Render deploys the newest commit successfully.
3. Open the HTTPS site online and confirm the Dashboard and sidebar show `v2.4.2`.
4. Fully close and reopen installed laptop/mobile PWAs online once so the v2.4.2 service worker replaces the previous cache.
5. Insert a table at the end of a document and confirm a Body paragraph exists after it.
6. Press `+ Continue writing` beneath both a new table and an older table; the caret must move to an editable paragraph after the table.
7. Confirm `+ Continue writing` does not appear in Print / PDF.
8. Test the login page at a short laptop height: open Cloud setup, scroll its independent panel, save the connection, and confirm no field is clipped.
9. Test a narrow phone/tablet viewport: Cloud setup must open as a scrollable bottom sheet and close without clearing its fields.
10. Confirm Continue Offline identifies the last cached account before opening that account's isolated local workspace.
11. Run the v2.4.2 regression sections in `TEST_CHECKLIST.md`, then the v2.4.1 library and v2.3.4 sync-race checks.

No Supabase migration is required. The document schema remains `2.0.0` and the local database version remains `3`.
