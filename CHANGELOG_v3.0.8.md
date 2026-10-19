# v3.0.8 — chapter overview and editor access repair

- Chapters are stacked, collapsed details sections. Summary shows code/title, approved percentage and approved/required count. Existing details remain available on expansion.
- Account actions have a dedicated width and deletion labels wrap inside the cell; wide tables scroll within their frame.
- New submissions initialize endDate to the local calendar date. It remains editable despite legacy readonly config. Resumed draft dates remain intact.
- App editor opening calls workflow_can_open_editor(p_task), bound to auth.uid(). The browser no longer invokes the private workflow_user_can_submit(p_task,p_user) helper. Migration 043 is required.
- Opening a task resumes matching owned local/cloud work before creation. Concurrent opens within a page share the operation. This is not a cross-device uniqueness constraint.
- Added Forgot password, current-domain redirect and recovery-password form using the recovery token. Normal invitation handling remains supported.
- Click sync status to inspect stored error/queued document titles and retry. Local work remains. The previous production failure's cause is unverified.
- Plain menu glyph without background/border/circle; transparent logo containers preserve proportions; search uses one visible border.
- Installer retains prior review and updates the development register and Cloudflare status. No external deployment.
