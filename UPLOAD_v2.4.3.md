# Upload TERYAQ Master Tool v2.4.3

1. Upload the complete v2.4.3 package to the existing GitHub repository, preserving `vendor/`, `fonts/`, `icons/`, and `supabase/`.
2. Confirm Render deploys the new commit successfully. No new Supabase migration is required.
3. Open the HTTPS site online and confirm the Dashboard and sidebar show `v2.4.3`.
4. Fully close and reopen installed laptop/mobile PWAs online once so the v2.4.3 service worker replaces the previous cache.
5. In browser developer tools, confirm the page loads `app.v2.4.3.js`, `platform.v2.4.3.js`, `styles.v2.4.3.css`, and `vendor/jszip.min.js`.
6. Open a text document and confirm one **Export** dropdown replaces the previous Export, Save as Template, and Print/PDF buttons.
7. Test all four menu items: Draft `.teryaq`, PDF, Template, and standalone `.html`.
8. Use **Import DOCX Table** with a simple multi-table DOCX and confirm selection, metadata, insertion, editing, local save, and sync.
9. Repeat with a merged-cell DOCX and confirm **Needs review** appears and the imported flat grid remains editable.
10. Relaunch the installed PWA offline and confirm the editor and DOCX reader load. DOCX import itself is local and requires no connection.
11. Run the v2.4.3 sections in `TEST_CHECKLIST.md`, then the v2.4.2, v2.3.4, and v2.3.3 regression sections.

If an installed PWA still shows an older version after step 4, reopen the HTTPS site online, wait several seconds, close every TERYAQ window, and launch it again.
