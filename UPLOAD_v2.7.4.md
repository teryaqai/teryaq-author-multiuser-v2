# TERYAQ Master Tool v2.7.4

This deployment ZIP contains fewer than 100 files. Upload its **contents** together, replacing the previous release. The removed files are duplicate source aliases and old setup notes; the app uses the included versioned assets. Do not mix files from older releases. Reload the website or installed PWA until the dashboard displays **v2.7.4**.

## Supabase update

In the Supabase SQL Editor, run `supabase/migrations/018_submission_upload_removal.sql` once, after migrations 001–017. This grants the author permission to delete their own uploaded file only while its submission is unfinished. Existing submitted files remain protected.

The `Invalid key` upload repair works without the SQL change. Run migration 018 before using **إزالة الملف** or replacing a file that has completed upload.

No Edge Function change is needed for this release. The app still requires the earlier Supabase migrations and functions documented in the README.

## Check after deployment

1. Select a `.ترياق` file with Arabic characters in its filename. Confirm the form shows its original name, the upload completes, and submission succeeds.
2. Remove one finished upload and confirm the field is empty; attach it again and confirm upload succeeds.
3. Check the accepted file formats align under their heading in the preparation step.

The bundled checks validate source and packaging. A live Supabase upload and deletion check must be performed in the connected project.
