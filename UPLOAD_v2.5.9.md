# TERYAQ Master Tool v2.5.9 — deployment and review

## Deploy

1. Replace the repository files with the complete contents of this release folder.
2. Commit and deploy to Render; open the app online once on each installed device and confirm the Dashboard shows v2.5.9. The new service-worker cache refreshes the CSS, JavaScript, and View icons.
3. No new SQL migration or Edge Function change is required. Fresh installations still require migrations 001–012 and both Edge Functions as described in `EDGE_FUNCTIONS_SETUP.md`.

## Review

- In a text draft, the chapter/title row and File/Styles/Text Formatting/Insert/Table/View tab row are the same light mint green with dark text. The tools row stays white. Back, Save, and Sync remain dark green.
- Open View: View only shows the supplied eye-on-document icon and Outline shows the supplied list icon. Toggle View only on and off to confirm its icon remains visible; the button indicates the active state.
- The existing One page and Two pages icons and behaviors remain available.
