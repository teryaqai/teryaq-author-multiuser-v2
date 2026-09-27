# TERYAQ Master Tool v2.6.0 — release instructions

## Deployment

1. Apply `supabase/migrations/013_submission_forms_library.sql` in the existing project's Supabase SQL Editor, after migrations 001–012. It creates the shared category/course/chapter hierarchy, editorial version lists, editable submission forms, private file bucket, and administrator submission library.
2. Deploy this release folder to the existing app host. Keep the bundled `submissions.v2.6.0.js`, versioned CSS/JS assets, `sw.js`, and `VERSION.json` together.
3. Open the app online once on each installed device and check that Dashboard displays **v2.6.0**. Reload once if a previously installed service worker still shows an older release.
4. In Admin → Content Setup, review the seeded **Basic Stage** and **Clinical Stage** categories, assign courses, chapters, writers, and editorial versions, and edit the new form's title, cover, questions, required fields, and conditional fields as needed.

## Acceptance checks

- A signed-in user sees **Submission Forms** beside Documents and Templates. The Scientific Draft Submission Form has five sections and a sticky title. Category filters course, and course filters chapter.
- Selecting **version 1** does not show Simplified Audit in Section 2. Selecting **version 2** shows **Simplified Audit المُعبّأ — HTML**, requires an `.html` or `.htm` upload by default, and rejects another extension.
- Submit version 2 and verify Admin → Submission Library → category → course → chapter → Scientific Draft → version 2 contains the submission answers and a downloadable **Simplified Audit** HTML file. A regular user cannot browse submitted files or the administrator library.
- The Scientific Draft Text export creates a JSON `.ترياق` document; old `.teryaq` documents remain importable. Figures Guide Draft can print a PDF containing just figures and their Figure codes; choose “Save as PDF” in the browser print dialog.
- New documents in Scientific Draft Text, Figures Guide Draft, and Shooting Script offer category, course, chapter, and editorial version selections. The editor File tab includes Copy Outline for Scientific Draft Text.

The submission and admin library require an internet connection. Automatic AI review after delivery is outside this release; the supplied audit HTML is stored with the delivery for an administrator to inspect.
