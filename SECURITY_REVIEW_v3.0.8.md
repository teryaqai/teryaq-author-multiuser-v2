# v3.0.8 targeted authorization review

The update retains v3.0.7 RLS, server document guards and assignment rules. No live penetration test or provider changes.

- workflow_can_open_editor(uuid) checks the active auth.uid(), task status, editor template and existing authorization. PUBLIC/anonymous execution is revoked; authenticated execution is explicit. There is no user-id argument and no new grant on the private helper.
- Server guards still reject forged course/chapter/template/version and closed-task changes. UI checks are not the database boundary.
- Resume queries filter the current owner, exact task and editor under existing RLS; reconciliation preserves unsynced local revisions/conflicts.
- Recovery uses configured Supabase Auth and current-origin redirect. Updates use the recovery token; mismatches are not submitted. URL tokens are removed after successful completion. Real delivery/allowlisting require live verification.
- Sync diagnostics preserve queued work and do not modify permissions or clear browser data.
- Cloudflare works according to the user. Access policies, DNS and disabled Render URL remain unchanged. noindex is indexing guidance rather than authorization.

Tests: BUILD_VALIDATION.md; sources: VALIDATION_SOURCE.zip.
