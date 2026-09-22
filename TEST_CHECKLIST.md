# TERYAQ Master Tool — Editor Acceptance Checklist

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
