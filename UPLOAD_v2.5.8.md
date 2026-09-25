# TERYAQ Master Tool v2.5.8 — deployment and review

## Deploy

1. Replace the repository files with the complete contents of this release folder.
2. Commit and deploy to Render; open the app online once on each installed device and check that Dashboard shows v2.5.8. The updated service worker refreshes the editor assets.
3. This release adds no SQL migration or Edge Function changes. Fresh installations still require migrations 001–012 and both Edge Functions as described in `EDGE_FUNCTIONS_SETUP.md`.

## Review

- The chapter title and the tab bar share the same medium green; the tools row is white. Back is dark green with a white left arrow. Save and Sync match in color and height.
- Text Formatting shows text Aa, B and italic I in Tajawal, matching the size of the Level labels; the existing font-size options still open on Aa.
- View uses the supplied blank-page and two-document icons; the active page button shows a white icon.
- Draft information has no Headings 1 register. Creating or editing a heading still updates Document Outline.
- The Table tab opens without selecting a cell. Table Outline lists every table, and editing code/title/caption updates the table as before. Row/column actions become available when a cell is selected; their arrows share one artwork rotated by direction.
- One clicked update becomes read in both Dashboard and Notifications, including when clicked offline.
