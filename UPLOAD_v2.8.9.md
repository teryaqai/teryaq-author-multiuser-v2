# TERYAQ Master Tool v2.8.9

## Required Render environment variables
Set these once in the Render service before deploying:

- `TERYAQ_SUPABASE_URL` = your Supabase project URL
- `TERYAQ_SUPABASE_ANON_KEY` = your public publishable/anon key

Do **not** use a service-role key.

Render generates `runtime-config.js` during the build. The sign-in screen no longer exposes Cloud Setup, and Settings only shows connection status. Existing device-cached public config remains a fallback so current users are not abruptly disconnected.

## Icon Manager
The icon audit now includes authentication icons and previously hard-coded editor icons (password visibility, cloud, drag/reorder, view modes, outline, RTL/LTR, and table movement) in addition to navigation, workflows, tasks, submissions, admin, and shared controls.
