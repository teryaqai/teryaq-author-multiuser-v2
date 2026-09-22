# TERYAQ Master Tool v2.4.3 — Independent AI Review Brief

## What to upload

Upload the complete `TERYAQ_Master_Tool_AI_Review_v2.4.3.zip`. It contains the application source, bundled JSZip with its license, Supabase migrations, release metadata, test checklists, prior error evidence, and this brief. You may also attach a redacted `.teryaq` export that contains no confidential scientific material.

Never upload passwords, Supabase service-role keys, browser storage exports, access/refresh tokens, or real confidential documents. The application package intentionally contains no configured project URL or keys.

## Copy/paste prompt for the reviewing AI

> Act as a senior offline-first PWA and Supabase/PostgreSQL security reviewer. Review the attached TERYAQ Master Tool v2.4.3 source without rewriting the product or weakening its account isolation, RLS, immutable version history, or local-first behavior.
>
> The reported production symptoms were: (1) a laptop displayed `Synced` but its newest text did not arrive on the phone; (2) false conflicts appeared while using one device; (3) earlier versions could lose or replace local text; (4) `Document ownership mismatch` appeared on a document believed to be locally created; and (5) v2.3.2 autosave dropped editor focus. The v2.3.3 focus fix must remain unchanged.
>
> The v2.3.4 proposal adds revision-aware reconciliation: after `push_document()` responds, the client atomically re-reads the latest IndexedDB document and compares `localSaveToken` with the sent revision. If they match, it marks the document synced and removes its queue entry. If a newer local revision exists, it preserves that entire revision, advances only `baseServerVersion`, keeps status/queue pending, and sends it next. `Synced` is allowed only when both queue and conflicts are empty. Remote pulls are applied only when the remote version is newer and local status is explicitly synced. Keep local and Save both read the newest IndexedDB copy at click time.
>
> v2.4.0 retained that sync implementation and changed the document workspace layout. v2.4.1 added document multi-selection, Chapter-number sanitization, password visibility controls, TERYAQ logo rendering, clearer backup descriptions, and conflict-aware Trash behavior. v2.4.2 ensures an editable paragraph follows every table and separates Supabase setup from the responsive sign-in card. v2.4.3 adds local DOCX table parsing through bundled JSZip, native editable imported tables, a unified Export menu, and script-free standalone HTML with embedded Tajawal fonts. Verify that these changes do not alter STYLE_CONTRACT, paragraph/inline-mark behavior, autosave focus, authentication/account isolation, document identity, queue reconciliation, or backward compatibility.
>
> Trace these exact flows: a delayed push while another autosave commits; repeated edits during Auto Sync; laptop push followed by phone pull; an equal-version pull while the editor is focused; a newer remote pull into a clean open editor; a real two-device version conflict; Keep local after post-conflict editing; delete and restore of a conflicted document; uninterrupted Arabic/English typing; emergency recovery; ownership repair; offline relaunch; simple and complex DOCX table imports; first-row header on/off; one-step undo of multiple imported tables; every Export option; and service-worker upgrade to v2.4.3.
>
> Report only evidence-backed findings. For each finding provide Severity (P0–P3), exact file/function, reproducible event sequence, why existing protection fails, minimal safe fix, and regression test. Explicitly distinguish confirmed defects from hypotheses. Check SQL RLS/RPC security separately from client reliability. Do not recommend disabling RLS, sharing accounts, using the service-role key in the client, or overwriting local conflict data automatically.
>
> End with: (A) whether v2.4.3 preserves v2.3.4 cross-device sync correctness, (B) whether DOCX parsing is local, bounded, and safe against malformed input, (C) whether standalone HTML can leak configuration or execute document content, (D) whether the exact style contract, Continue writing, and v2.3.3 focus behavior remain preserved, and (E) a prioritized pre-production test list.

## Architecture summary

- Static PWA hosted on Render; JSZip 3.10.1 is bundled locally only for DOCX archive reading.
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
