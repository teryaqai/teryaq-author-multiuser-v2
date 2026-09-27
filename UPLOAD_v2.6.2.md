# TERYAQ Master Tool v2.6.2 — release instructions

## Deploy in this order

1. Apply `supabase/migrations/014_submission_uploads_history.sql` in Supabase SQL Editor after migration 013. New installations must apply migrations 001–014 in numerical order.
2. Redeploy the updated `supabase/functions/admin-governance/index.ts` Edge Function. It enforces the existing 30-day retention before deleting a submission and its files.
3. Upload the complete v2.6.2 package to the existing app host. Keep `index.html`, `sw.js`, `VERSION.json`, the four v2.6.2 CSS/JS files, icons, and fonts together.
4. Open the app online once per installed device. Verify Dashboard displays v2.6.2; reload once if an old offline cache still appears.

## Verify

- Selecting a submission file starts its upload and shows name, size, progress, and transfer speed. Section 3 displays a quality checklist with progress; its answers remain editable by administrators. Submitted forms appear under Submission Forms → delivery history, with details on expansion.
- Admin → Content Setup has five full-width tabs. Admin → Archive shows English navigation, one file per form row, a Google Drive checkbox, and Move to Trash. Admin → Trash Management separates Documents and Submissions; restore is immediate and permanent deletion becomes available after 30 days.
- In the Scientific Draft, open Document Outline and use Copy Outline: a sample of three Heading 2 entries under the first Heading 1 copies as 1.1, 1.2, 1.3, then 2.1 under the second Heading 1.
- Before exporting a Scientific Draft text or figures file, confirm its version or change it in the prompt. Export a version 2 `.ترياق`, HTML, and PDF. Select version 1 in the scientific submission form and attach one of these files: the mismatch must display an error and block submission. Select version 2 and retry: verification should pass. Files exported before version metadata was added must be exported again.
- In Shooting Script, drag a block by its six-dot handle from the left side. Insert a Figure or Table reference, supply `2.1`, and confirm only the short inline reference is highlighted; continue typing normal text. References and review notes stay hidden in Teleprompter. Presenter guidance remains visible there, and the montage PDF omits it.

Existing submitted packages keep their stored answers and files. The app does not upload submissions while offline.
