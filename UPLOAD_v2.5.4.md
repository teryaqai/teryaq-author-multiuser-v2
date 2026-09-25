# TERYAQ Master Tool v2.5.4 — deployment and review

Built from the supplied v2.5.3 `last edition.zip`. This package applies complete text styles and maps the supplied 25 interface icons, including the separately supplied Level 3 rhomboid and the final five figure/import/export/sync/notification icons. The Back icon is reflected to point left.

The latest database migration remains 011. No SQL changes are required for this release.

## Deploy

1. Keep your running package as a rollback copy.
2. Upload the contents of this package to the existing Render repository root, preserving the `icons/ui` folder.
3. Commit and deploy. Open the app online once on each device and confirm the displayed version is v2.5.4.

## Review

- Apply each paragraph style to text that previously had a manual font size, Bold, Italic, or inline colored style. Check the result in Edit, A4 View, PDF print, and standalone HTML.
- Apply the Side Note, Note to Delete, High-Yield, and Clinical Correlation styles to selected text with existing manual formatting. Confirm each style sets its complete appearance.
- Check the sidebar, editor actions, admin navigation, dashboard cards, template cards, date labels, and three bullet levels. Confirm Back points left.
- Verify Save, Sync, and offline reopening on a document before deploying to all devices.

For rollback, restore the saved prior static package. No database rollback is involved.
