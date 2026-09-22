# TERYAQ Master Tool — Editor Acceptance Checklist

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
