# TERYAQ Master Tool v2.5.6 — deployment and review

## Deploy

1. Replace the repository files with the contents of this release folder, including `icons/ui/`, all three `*.v2.5.6.*` assets, and `supabase/migrations/012_service_role_profiles_select.sql`.
2. Commit and deploy to Render. The versioned assets and service worker cache are updated to v2.5.6 to avoid stale CSS and icons. Open the app online once on each device and verify the displayed version.
3. If the previous service-role invitation repair was already run in Supabase, no SQL or Edge Function redeployment is needed. The migration and function source in this package record that applied repair for future installations. A fresh installation should apply migrations 001–012 in order and deploy both Edge Functions following `EDGE_FUNCTIONS_SETUP.md`.

## Review

- Open a text document: one compact card contains the title/actions, File, Styles, Text Formatting, Insert, Table (enabled upon selecting a table cell), and View. File contains Export, Import, History / Versions, Validate, and Settings & Sync. All tabs open their controls without repeated titles.
- Open Text Formatting: click the icon-only Aa control to select a size; B and I have icon-only buttons. The three bullet levels and Numbering measure exactly 105 × 35 px each and the label/icons share one type scale.
- Click Export on desktop and a narrow window: its menu sits directly below its button. Import uses a downward arrow; Export uses an upward arrow.
- Open Admin Center → Cloud Operations on a slow connection: the green pulse and accessible loading label remain visible until cloud data is ready. The animation stops when the section loads; reduced-motion settings show a static indicator.
- In Admin Center → Trash Management, select files using the row checkboxes or Select all. Delete permanently becomes available for a selection only when all selected files are at least 30 days old. The existing server-side retention rule stays in force; confirmation requires typing `PURGE N`, where N is the number selected.

The loading motion takes inspiration from [cosnametv's Dynamic Pulse Loader on Uiverse](https://uiverse.io/cosnametv/spotty-starfish-76). The markup and CSS here were independently written to match the TERYAQ palette; no video or network asset is loaded at runtime.
