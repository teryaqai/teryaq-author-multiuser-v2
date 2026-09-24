# TERYAQ Master Tool v2.5.3 — Safe Deployment

## Scope

v2.5.3 is a presentation-only release. It aligns Dashboard pages with the floating top bar and gives the two editor bars the same width, border, radius, shadow, and responsive sidebar behavior.

It also includes the approved custom vector icons for Documents, successful Save/Sync, Conflicts, Sync, Updates, and Guide. The included `admin-account-request` Edge Function now reports the exact signed-in identity/role when an admin-profile check fails; redeploy that function separately in Supabase because Render cannot deploy Edge Functions.

It does not change IndexedDB, Supabase tables, migrations, authentication, autosave, synchronization, conflicts, document styles, exports, or A4 dimensions. Migration 011 remains the latest cloud migration; do not rerun or replace earlier migrations for this release.

## Deploy

1. Preserve the current production package as a rollback copy.
2. Upload the contents of `TERYAQ_Master_Tool_Render_Deploy_v2.5.3.zip` to the repository root.
3. Commit the files and wait for Render to report a successful deployment.
4. Open the site online once on every installed device.
5. Confirm the Dashboard and sidebar display **v2.5.3**. If an installed PWA still shows an older version, close every TERYAQ window and reopen it online once.

## Smoke test

1. Collapse and expand the sidebar; confirm the top bar and Dashboard page resize together and share the same left/right edges.
2. Open a text document; confirm the title/action bar and Home/Insert/Table/View ribbon are equal in width and stacked with matching rounded floating-card styling.
3. Type continuously, Save, Sync, close, and reopen the document. Confirm the text remains and appears on a second device.
4. Confirm the exact paragraph, heading, mark, list, table, Figure, A4 View, Outline, export, and conflict behaviors are unchanged.
5. Test desktop, tablet, and phone widths.

## Rollback

If the static interface fails, redeploy the preserved v2.5.1 package. No database rollback is required because v2.5.3 adds no migration.
