# TERYAQ Master Tool v2.7.3

Upload the **contents of this ZIP** together, replacing the previous release. Do not mix asset files from different versions. Reload the website or installed PWA until the dashboard shows **v2.7.3**.

## Supabase

No new migration or Edge Function deployment is needed for this update. Existing migrations **001–017** are still required.

## Check after upload

1. Start filling a Submission Form, navigate to Documents, return, and confirm the answers and section remain. Reload on the same device and use **متابعة التعبئة**. Completed uploaded files should still appear; a file whose upload was interrupted must be reattached.
2. Open the preparation step before section 1 and verify the required files and their formats. In Admin → Submission Forms, edit its title, description, and enabled setting; Preview should show the same step without requiring answers or uploading files.
3. Check the compact sidebar and a one-line paragraph in both Scientific Draft Text and Shooting Script: the smaller drag and selection buttons are side by side and the paragraph should not gain an empty second line.
4. Check the sign-in logo, TERYAQ Master Tool heading, and description are centered on desktop and mobile widths.
5. Test a real submission, including a previously uploaded file restored from a draft, and confirm the completed submission appears in the Archive and its local draft is removed.

The package passed static validation and JavaScript syntax checks. Authenticated device and Supabase integration checks still require the deployed project.
