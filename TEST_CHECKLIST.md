# TERYAQ Master Tool — Editor Acceptance Checklist

## v2.4.3 DOCX table import

- [ ] Import a DOCX containing one simple table; preview dimensions and cell text are correct.
- [ ] Import a DOCX containing multiple tables; only checked tables are inserted.
- [ ] Code and title are required, caption is optional, and all three values populate Table information.
- [ ] Header-row on/off changes the first row between header and normal cells in editor, PDF, and HTML.
- [ ] Bold and italic cell content survives import; several Word paragraphs in one cell remain separated by line breaks.
- [ ] Merged or nested Word tables show **Needs review** and import as a safe flat grid.
- [ ] A table over 50 columns or 5,000 cells is not selectable.
- [ ] Imported tables remain editable, autosave, sync, reopen on another device, support Undo/Redo, and have a writable Body paragraph after them.
- [ ] Import works after an offline PWA relaunch because JSZip is cached locally.

## v2.4.3 unified Export menu

- [ ] One Export button replaces the previous three editor buttons and closes with outside click or Escape.
- [ ] Export Draft saves first and downloads a valid, re-importable `.teryaq` file.
- [ ] Export as PDF opens the existing A4 print dialog without changing document styles.
- [ ] Save as Template creates the same reusable local template as before.
- [ ] Export as HTML downloads one standalone file with embedded Tajawal fonts, no scripts, and no Supabase URL/key/token.
- [ ] HTML preserves Arabic/English direction, lists, headings, figures, tables, captions, and screen/print layout.
- [ ] The Export menu remains fully reachable as a mobile bottom sheet on narrow screens.
- [ ] v2.3.3 uninterrupted typing and v2.3.4 cross-device sync checks still pass.

## v2.4.2 continue-after-table regression

- [ ] Insert a table at the end of a document; a normal editable paragraph exists immediately after it.
- [ ] Press `+ Continue writing` under a new table; the caret moves to the paragraph after the table.
- [ ] Open an older document whose final block is a table; the same button creates and focuses a new Body paragraph.
- [ ] When an editable paragraph already follows a table, the button focuses it without creating a duplicate paragraph.
- [ ] If a figure or another table follows, the button inserts a Body paragraph between the two blocks.
- [ ] The button does not appear in Print / PDF output.
- [ ] Table code, title, caption, cell editing, row/column controls, save, sync, Undo/Redo, and styles remain unchanged.

## v2.4.2 responsive login and cloud setup

- [ ] On a short laptop viewport, the complete sign-in card remains reachable and no field is hidden behind the taskbar.
- [ ] When Supabase is not configured, Cloud setup opens automatically as a separate desktop side card.
- [ ] After saving the connection, the login card reports `Connection saved on this device` and sign-in still works.
- [ ] On a phone or narrow tablet, Cloud setup opens as a bottom sheet with independent scrolling and a close button.
- [ ] Escape, the close button, and the mobile scrim close Cloud setup without clearing its fields.
- [ ] Continue Offline appears only when a cached account exists and identifies that account before opening it.
- [ ] Continue Offline opens only that account's local documents and queued changes.

## v2.4.1 document-library and account regression

- [ ] Login and sidebar display the TERYAQ logo, including when the sidebar is collapsed.
- [ ] The eye icon shows and hides the login password without changing the entered value.
- [ ] Account eye icons independently show and hide New password and Confirm password.
- [ ] Chapter number strips letters and symbols but accepts digits and dots in the wizard, text editor, and figure editor.
- [ ] Arabic/Persian digits entered in Chapter number are normalized to Western digits.
- [ ] Documents has per-row checkboxes, select-all, clear selection, and batch Move selected to Trash.
- [ ] A normal deleted document leaves Documents, appears in Trash, and restores as pending.
- [ ] A conflicted deleted document disappears from the active conflict count while in Trash.
- [ ] Restoring that conflicted document restores the conflict badge and conflict-resolution choices.
- [ ] A delete version mismatch retries against the latest cloud version without creating a visible active conflict.
- [ ] Settings & Sync explains Workspace Backup, Restore, Pre-Upgrade Backups, Device ID, Role, and both sign-out choices.
- [ ] Manual Save, Sync, Auto Sync, cross-device pull, and uninterrupted typing still pass the v2.3.4/v2.3.3 checks below.

## v2.4.0 document workspace regression

- [ ] Dashboard and sidebar show `v2.4.0`; the sidebar expands and collapses without changing the active page.
- [ ] Open a Scientific Draft - Text Content document and confirm the action bar and full formatting ribbon remain sticky while scrolling.
- [ ] Confirm Draft information and Table information are separate cards with the same displayed width as the A4 writing page.
- [ ] Confirm the A4 page is visually enlarged on desktop, while Body, H1-H4, Side Q/A, Table Caption, Side Note, Note to Delete, High-Yield, and Clinical Correlation retain their v2.3.4 style definitions and behavior.
- [ ] Confirm Side Note, Note to Delete, High-Yield, and Clinical Correlation still require a text selection and do not convert the whole paragraph.
- [ ] Insert a table; code and title are required and caption is optional. Confirm all three values appear in the Table information card.
- [ ] Edit code, title, and caption in the card and confirm the caption beneath the matching table updates without moving focus from the field.
- [ ] Create two tables and confirm each has its own linked metadata row.
- [ ] Open/close the right Outline drawer and navigate to an H1/H2 without reserving permanent document space.
- [ ] Repeat on laptop, iPad/mobile width, offline mode, and after PWA relaunch.
- [ ] Save, close, reopen, sync, and open on a second device; confirm content and table metadata persist.

## v2.3.4 cross-device sync race regression

- [ ] Confirm the Dashboard and sidebar display `v2.3.4` on both devices.
- [ ] On Device A, type while an intentionally delayed Sync request is in flight. Confirm the newest text remains in IndexedDB and its queue entry remains `pending` after the older request returns.
- [ ] Stop typing and press Sync. Confirm `Synced ✓` appears only after the queue and conflicts are both empty and a cloud version number is shown.
- [ ] On Device B, press Sync and confirm the exact newest Device A sentence appears without reopening the installed app.
- [ ] Keep typing through several Autosave/Auto Sync cycles and confirm no false single-device conflict is created.
- [ ] Confirm an equal-version background pull does not re-render the editor or remove keyboard focus.
- [ ] Create a real simultaneous edit on Devices A and B and confirm a genuine conflict is still created.
- [ ] Continue editing after the genuine conflict appears, then choose Keep local. Confirm the newest IndexedDB text, not the older conflict snapshot, is synchronized.
- [ ] Repeat the continuous Arabic/English typing tests from v2.3.3 to confirm the focus fix remains intact.
- [ ] Deploy over v2.3.3, reopen both installed PWAs online, and verify `app.v2.3.4.js`, `platform.v2.3.4.js`, and `styles.v2.3.4.css` are loaded.

## v2.3.3 continuous-typing regression

- [ ] Confirm the Dashboard and sidebar both display `v2.3.3` on every test device.
- [ ] Type continuously in an English paragraph for at least 15 seconds; confirm multiple autosaves occur without losing focus, moving the caret, or requiring another click.
- [ ] Repeat with Arabic text, including an RTL bullet and a numbered item; confirm uninterrupted typing and correct direction.
- [ ] Pause longer than 250 ms in the middle of a word, then continue; confirm autosave does not interrupt the field.
- [ ] Repeat in Draft information, a table cell, and every Figures form field.
- [ ] Press manual Save, then Sync; confirm the top action buttons prevent duplicate actions while the editable surface never changes to `readonly` or `contenteditable=false`.
- [ ] Deploy over v2.3.2, reopen each installed PWA online, and confirm it loads `app.v2.3.3.js`, `platform.v2.3.3.js`, and `styles.v2.3.3.css`.

## v2.3.2 multi-device data-loss regression

- [ ] Confirm the Dashboard and sidebar both display `v2.3.2` on every test device.
- [ ] Edit and sync a document on Device A. Open the older version on Device B, edit and sync it, and confirm Device B keeps its local text and shows a Conflict rather than reverting to Device A's text.
- [ ] Resolve the conflict with Save both; confirm both documents remain available and synchronize.
- [ ] While a document has a non-synced local state, simulate a remote deletion and confirm the local draft remains with a remote-delete conflict.
- [ ] Trigger an ownership mismatch using a copied/imported document ID. Confirm the app creates a local migration backup, assigns a new document ID, syncs it as cloud version 1, and never modifies the other owner's cloud row.
- [ ] After Save, confirm IndexedDB read-back succeeds and the status becomes `Saved locally ✓` only afterward.
- [ ] Deploy over v2.3.1, open an already-installed PWA online, and confirm it loads versioned `app.v2.3.2.js`, `platform.v2.3.2.js`, and `styles.v2.3.2.css`.
- [ ] Confirm the navigation sidebar remains visible in the desktop editor and opens as a drawer on mobile.

## v2.3.1 save/sync hotfix

- [ ] Type into a document and immediately press **Sync**. Confirm the order is `Saving…` → `Sending to cloud…` → `cloud version N ✓`.
- [ ] After explicitly pressing Save, confirm Save, Sync, Back, and Settings are briefly disabled; during background autosave, confirm typing remains enabled.
- [ ] Type, immediately background/close the installed app, then reopen it. Confirm the newest text is present or automatically recovered as an emergency draft.
- [ ] Make a change, press Back immediately, and confirm the document list opens only after local save completes.
- [ ] Work offline, close/reopen, and confirm the draft remains available with `Saved locally ✓ · offline`.
- [ ] Reconnect and sync; confirm the displayed cloud version increases and the same text appears on a second device.

## Storage / recovery
- [ ] New document appears in My Documents.
- [ ] Autosave survives page reload.
- [ ] Manual Save works.
- [ ] History snapshot can be restored.
- [ ] `.teryaq` export is non-empty.
- [ ] `.teryaq` import reconstructs document.

## Text editor
- [ ] H1 numbering updates after insert/delete.
- [ ] H2 numbering resets under each H1.
- [ ] Outline matches H1/H2 structure.
- [ ] Paste into H1 preserves H1.
- [ ] Paste into H2 preserves H2.
- [ ] H1 → H2 → Body switching works repeatedly.
- [ ] Backspace/delete works in headings.
- [ ] English block types LTR.
- [ ] Arabic block types RTL.
- [ ] Bold and Italic work.
- [ ] Side Note works.
- [ ] Note to Delete works without trapping later paragraph-style selection.
- [ ] High-Yield works.
- [ ] Clinical Correlation works.
- [ ] Bullet levels are consistent globally.

## Figures / tables
- [ ] Main figure placeholder is full width and centered.
- [ ] Margin figure placeholder is full width and centered.
- [ ] Placeholder background is #FFED29.
- [ ] Tables can add/delete rows/columns.
- [ ] Selected column width can change.
- [ ] Equal Columns works.

## Responsive UI
- [ ] Laptop: controls left, outline right, no overlap.
- [ ] iPad/tablet: scaled A4 and side panels do not overlap.
- [ ] Phone: persistent Editing Controls header.
- [ ] Phone: control subgroups are collapsible.
- [ ] Phone: floating Undo/Redo remains visible.

## Print / PDF
- [ ] Editing UI is absent from print.
- [ ] Draft Information prints correctly.
- [ ] Heading register prints correctly.
- [ ] Writing begins on new A4 page.
- [ ] Tables remain within page width.
- [ ] Figure placeholder yellow background prints when background graphics are enabled.
