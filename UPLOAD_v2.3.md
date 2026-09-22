# Upload TERYAQ Master Tool v2.3

1. Keep the existing `icons/` folder in GitHub. The deployment ZIP intentionally does not replace it because the production icons were updated separately.
2. Upload all files and folders from the ZIP into the repository root, including the new `fonts/` folder.
3. Commit the changes to `main`.
4. In Render, wait for the automatic deploy or choose **Manual Deploy → Deploy latest commit**.
5. Open the live app online and refresh once so service worker cache `teryaq-master-tool-v2.3.0` is installed.
6. Sign in, set a username under **Account**, press **Sync Now**, and test delete/restore with a disposable document.
7. On an installed laptop/iPad PWA, reopen once while online before testing offline mode.

No new Supabase SQL migration is required for v2.3. The existing `profiles.display_name`, soft-delete fields, document versions, grants, and RLS policies are reused.
