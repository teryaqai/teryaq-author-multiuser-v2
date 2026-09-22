# Upload TERYAQ Master Tool v2.4.1

1. Upload the complete v2.4.1 package to the existing GitHub repository, preserving its folders.
2. Confirm Render deploys the newest commit successfully.
3. Open the HTTPS site online and confirm the Dashboard and sidebar show `v2.4.1` and the TERYAQ logo.
4. Fully close and reopen installed laptop/mobile PWAs online once so the v2.4.1 service worker replaces the previous cache.
5. Confirm the password eye works on Sign in and Account, and Chapter number accepts only digits/dots.
6. In Documents, test one row checkbox, select-all, clear selection, and batch Move selected to Trash.
7. Delete a conflict document: its active conflict counter must disappear. Restore it: the conflict must return.
8. Run the v2.4.1 section in `TEST_CHECKLIST.md`, then the existing v2.4.0 editor and v2.3.4 sync-race checks.

No Supabase migration is required. The document schema remains `2.0.0` and the local database version remains `3`.
