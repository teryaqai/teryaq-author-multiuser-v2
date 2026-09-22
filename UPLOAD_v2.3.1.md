# Upload TERYAQ Master Tool v2.3.1 Hotfix

1. Keep the existing `icons/` folder in GitHub. The deployment ZIP intentionally does not replace it because the production icons were updated separately.
2. Upload all files and folders from the ZIP into the repository root, including `fonts/` and `supabase/`.
3. Commit the changes to `main`.
4. In Render, wait for the automatic deploy or choose **Manual Deploy → Deploy latest commit**.
5. Open the live app online and refresh once so service worker cache `teryaq-master-tool-v2.3.1` is installed.
6. On each installed laptop/iPad/mobile PWA, fully close and reopen once while online so the new service worker takes control.
7. Test with the affected user: type a unique sentence, press **Sync**, wait for `cloud version N ✓`, close/reopen, and confirm the sentence remains.
8. Sign into a second device, press **Sync Now**, and confirm the same sentence arrives there.

If an installed PWA still shows the old version, open the normal browser URL online, refresh twice, close every TERYAQ window, and reopen the installed app.

No new Supabase SQL migration is required for v2.3.1. The hotfix changes only client-side save ordering, lifecycle persistence, emergency recovery, and sync feedback.
