# Upload TERYAQ Master Tool v2.3.4

1. Keep the existing `icons/` folder in GitHub. The deployment ZIP intentionally does not replace the production icons.
2. Upload every file and folder from the deployment ZIP into the repository root.
3. Commit to `main` and wait for Render, or select **Manual Deploy → Deploy latest commit**.
4. Open the HTTPS site online and confirm the Dashboard shows `v2.3.4`.
5. On both laptop and phone, fully close every TERYAQ window, reopen online, and confirm `v2.3.4` before testing.
6. On the laptop, type a unique sentence, wait for `Saved locally ✓`, press Sync, and accept success only when a cloud version number is displayed and no pending/conflict count remains.
7. On the phone, press Sync and confirm the exact unique sentence appears. If the document was already open and clean, the newer cloud version should refresh automatically.
8. Repeat while typing during Auto Sync and confirm the editor never loses focus and the latest text is not replaced.
9. Complete the v2.3.4, v2.3.3, and v2.3.2 sections in `TEST_CHECKLIST.md` before routine use.

Do not clear browser/site data before exporting important `.teryaq` documents and confirming the cloud version.

No Supabase migration is required. v2.3.4 changes only client-side synchronization reconciliation, status reporting, remote refresh, and conflict-resolution freshness.
