# TERYAQ Master Tool v2.7.0

This is the complete self-contained release. Upload its contents together; do not mix JavaScript, CSS, service worker, or manifest files from another version. The dashboard must show **v2.7.0** after deployment.

## Supabase

No new migration was added for v2.7.0. The project still requires migrations **001–017** included in `supabase/migrations`. If 016 or 017 has not been applied, run the missing migration(s) in order on a test project first, then on the live project after checking the backup and role flows. Do not rerun an already applied migration just to install this release. The account-name requirement uses the existing `profiles.display_name` field.

## What changed

- The Master Tool interface uses the approved TERYAQ purple palette, with the supplied high-resolution square logo in sign-in, navigation, and installed-app icons. Document content styles and status meanings remain intact.
- Guide is a task-first Help Center with search, topic navigation, English/Arabic switching, and admin-only sections. Its content covers Submission Forms, Archive, Course Progress, templates, Teleprompter, sync, and recovery.
- A user without an account name is sent to Profile and cannot create, duplicate, or import a document until a name of 2–80 characters has been saved. Backup import also checks for a name.
- Settings has a download-folder preference on browsers that support selecting a local directory. Otherwise the browser's normal download location is used. Browser Print / Save as PDF still uses the browser dialog.
- iPad top-bar layout, Archive backup locations, Course Progress icon, and generated document names include the draft refinements requested after v2.6.9.

## Check after upload

1. Open the site online and reload an installed app if it still displays an older cached version. Confirm v2.7.0 and the purple logo.
2. Test Guide language, search, task cards, and an admin account's Admin section.
3. Test one new document, local Save, cloud Sync, and another device. Confirm the same version on both devices.
4. In Settings, choose a download folder on a compatible desktop browser and try an export; verify normal downloads on iPad or an unsupported browser.
5. If Course Progress reports missing database functions, confirm migration 017 is present in the live Supabase project before using that page.

Static checks pass for the release package. Live Supabase migrations, authorization, sync, and device-specific browser behavior have not been executed against your project here.
