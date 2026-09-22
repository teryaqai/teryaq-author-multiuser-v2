# Upload TERYAQ Master Tool v2.3.3

1. Keep the existing `icons/` folder in GitHub. The deployment ZIP intentionally does not replace the production icons.
2. Upload every file and folder from the ZIP into the repository root. The canonical and versioned JS/CSS files are both required.
3. Commit the changes to `main` and wait for Render, or choose **Manual Deploy → Deploy latest commit**.
4. Open the normal HTTPS website while online and confirm the Dashboard shows `v2.3.3`.
5. On every installed laptop/iPad/mobile PWA, close every TERYAQ window, reopen it online, and confirm `v2.3.3` before testing.
6. Open a disposable document and type continuously for at least 15 seconds in Arabic and English. Confirm the caret never disappears and typing never requires a second click while `Saving…` appears.
7. Test the affected account: type a unique sentence, Save, Sync, wait for a cloud version number, close, reopen, and verify the sentence.
8. On a second device, confirm `v2.3.3`, Sync Now, and verify the same sentence arrives.
9. Complete the v2.3.3 and v2.3.2 sections in `TEST_CHECKLIST.md` before normal work resumes.

Do not clear browser/site data on an affected device before exporting important `.teryaq` files or confirming cloud version numbers.

No new Supabase migration is required for v2.3.3. This release is a client-side hotfix that prevents background autosave from taking keyboard focus while preserving verified local saves, conflict protection, ownership-ID recovery, and cache updating.
