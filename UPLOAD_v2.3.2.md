# Upload TERYAQ Master Tool v2.3.2

1. Keep the existing `icons/` folder in GitHub. The deployment ZIP intentionally does not replace the production icons.
2. Upload every file and folder from the ZIP into the repository root. The canonical and versioned JS/CSS files are both required.
3. Commit the changes to `main` and wait for Render, or choose **Manual Deploy → Deploy latest commit**.
4. Open the normal HTTPS website while online and confirm the Dashboard shows `v2.3.2`.
5. On every installed laptop/iPad/mobile PWA, close every TERYAQ window, reopen it online, and confirm `v2.3.2` before testing.
6. Test the affected account on its original device: type a unique sentence, Save, Sync, wait for a cloud version number, close, reopen, and verify the sentence.
7. On a second device, confirm `v2.3.2`, Sync Now, and verify the same sentence arrives.
8. Run the multi-device conflict test in `TEST_CHECKLIST.md` with disposable content before normal work resumes.

Do not clear browser/site data on an affected device before exporting important `.teryaq` files or confirming cloud version numbers.

No new Supabase migration is required for v2.3.2. This release changes client-side conflict protection, local-save verification, ownership-ID recovery, cache updating, and interface feedback.
