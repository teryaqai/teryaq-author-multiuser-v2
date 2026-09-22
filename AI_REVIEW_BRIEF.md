# TERYAQ Master Tool v2.4.1 — Independent AI Review Brief

## What to upload

Upload the complete `TERYAQ_Master_Tool_AI_Review_v2.4.1.zip`. It contains the application source, Supabase migrations, release metadata, test checklists, prior error evidence, and this brief. You may also attach a redacted `.teryaq` export that contains no confidential scientific material.

Never upload passwords, Supabase service-role keys, browser storage exports, access/refresh tokens, or real confidential documents. The application package intentionally contains no configured project URL or keys.

## Copy/paste prompt for the reviewing AI

> Act as a senior offline-first PWA and Supabase/PostgreSQL security reviewer. Review the attached TERYAQ Master Tool v2.4.1 source without rewriting the product or weakening its account isolation, RLS, immutable version history, or local-first behavior.
>
> The reported production symptoms were: (1) a laptop displayed `Synced` but its newest text did not arrive on the phone; (2) false conflicts appeared while using one device; (3) earlier versions could lose or replace local text; (4) `Document ownership mismatch` appeared on a document believed to be locally created; and (5) v2.3.2 autosave dropped editor focus. The v2.3.3 focus fix must remain unchanged.
>
> The v2.3.4 proposal adds revision-aware reconciliation: after `push_document()` responds, the client atomically re-reads the latest IndexedDB document and compares `localSaveToken` with the sent revision. If they match, it marks the document synced and removes its queue entry. If a newer local revision exists, it preserves that entire revision, advances only `baseServerVersion`, keeps status/queue pending, and sends it next. `Synced` is allowed only when both queue and conflicts are empty. Remote pulls are applied only when the remote version is newer and local status is explicitly synced. Keep local and Save both read the newest IndexedDB copy at click time.
>
> v2.4.0 retained that sync implementation and changed the document workspace layout. v2.4.1 adds document multi-selection, Chapter-number sanitization, password visibility controls, TERYAQ logo rendering, clearer backup descriptions, and conflict-aware Trash behavior. A deleted conflict must disappear from the active conflict store but be preserved in the Trash record; restoring it must recreate a valid conflict. Verify that these changes do not alter STYLE_CONTRACT, paragraph/inline-mark behavior, autosave focus, document identity, queue reconciliation, or backward compatibility.
>
> Trace these exact flows: a delayed push while another autosave commits; repeated edits during Auto Sync; laptop push followed by phone pull; an equal-version pull while the editor is focused; a newer remote pull into a clean open editor; a real two-device version conflict; Keep local after post-conflict editing; delete and restore of a conflicted document both before and after its cloud delete; batch deletion; uninterrupted Arabic/English typing; emergency recovery; ownership repair; offline relaunch; table insertion and linked metadata editing; and service-worker upgrade to v2.4.1.
>
> Report only evidence-backed findings. For each finding provide Severity (P0–P3), exact file/function, reproducible event sequence, why existing protection fails, minimal safe fix, and regression test. Explicitly distinguish confirmed defects from hypotheses. Check SQL RLS/RPC security separately from client reliability. Do not recommend disabling RLS, sharing accounts, using the service-role key in the client, or overwriting local conflict data automatically.
>
> End with: (A) whether v2.4.1 preserves v2.3.4 cross-device sync correctness, (B) whether a stale network response can overwrite a newer local save, (C) whether conflict deletion/restoration is logically safe and cannot leave stale active conflicts, (D) whether v2.3.3 focus behavior and the exact style contract are preserved, and (E) a prioritized pre-production test list.

## Architecture summary

- Static dependency-free PWA hosted on Render.
- Supabase Auth plus PostgreSQL tables/RLS and the `push_document()` RPC.
- IndexedDB is the primary local store; cloud synchronization is secondary.
- One sync queue entry per account/document.
- Cloud updates create immutable versions.
- Conflicts require explicit user resolution.
- Emergency drafts are device-local and scoped by account/document.

## Files that deserve the closest review

- `app.js`: `idbPutDocumentPreservingSync`, `saveCurrent`, `saveAndSyncCurrent`, sync-metadata and remote-document event handlers.
- `platform.js`: `pushQueueItem`, `reconcileSuccessfulPush`, `recordEditConflict`, `reconcileRemoteDocument`, `pullRemote`, and `syncNow`.
- `sw.js` and `index.html`: update and offline-cache behavior.
- `supabase/migrations/001_accounts_documents.sql`: ownership validation, version comparison, RLS foundation.
- `supabase/migrations/004_security_hardening.sql` through `007_auto_rls_function_hardening.sql`: hardening and grants.
