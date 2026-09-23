# TERYAQ Master Tool v2.4.5 — Independent AI Review Brief

## What to upload

Upload the complete `TERYAQ_Master_Tool_AI_Review_v2.4.5.zip`. It contains the application source, bundled JSZip with its license, Supabase migrations, release metadata, test checklists, and this brief. You may also attach a redacted `.teryaq` export that contains no confidential scientific material.

Never upload passwords, Supabase service-role keys, browser storage exports, access/refresh tokens, or real confidential documents. The application package intentionally contains no configured project URL or keys.

## Copy/paste prompt for the reviewing AI

> Act as a senior offline-first PWA and Supabase/PostgreSQL security reviewer. Review the attached TERYAQ Master Tool v2.4.5 source without rewriting the product or weakening its account isolation, RLS, immutable version history, or local-first behavior.
>
> The reported production symptoms were: (1) a laptop displayed `Synced` but its newest text did not arrive on the phone; (2) false conflicts appeared while using one device; (3) earlier versions could lose or replace local text; (4) `Document ownership mismatch` appeared on a document believed to be locally created; and (5) v2.3.2 autosave dropped editor focus. The v2.3.3 focus fix must remain unchanged.
>
> The v2.3.4 proposal adds revision-aware reconciliation: after `push_document()` responds, the client atomically re-reads the latest IndexedDB document and compares `localSaveToken` with the sent revision. If they match, it marks the document synced and removes its queue entry. If a newer local revision exists, it preserves that entire revision, advances only `baseServerVersion`, keeps status/queue pending, and sends it next. `Synced` is allowed only when both queue and conflicts are empty. Remote pulls are applied only when the remote version is newer and local status is explicitly synced. Keep local and Save both read the newest IndexedDB copy at click time.
>
> v2.4.0–v2.4.4 retained that sync implementation while adding the compact tabbed editor, DOCX table import, unified export, overlay Outline, and viewport-level document menus. v2.4.5 adds Delete Table, numeric/dot-only table and figure codes, administrator-managed Author/Subject/Chapter options through migration 008, fixed-dimension multi-page A4 View Only rendering, always-on automatic sync, foreground/online retries, 15-second cross-device polling, timeout handling, and visible sync diagnostics. Verify that these changes do not alter STYLE_CONTRACT, paragraph/inline-mark behavior, autosave focus, authentication/account isolation, document identity, queue reconciliation, or backward compatibility.
>
> Trace these exact flows: a delayed push while another autosave commits; repeated edits during automatic sync; Android save/background/resume followed by laptop pull; an equal-version pull while the editor is focused; a newer remote pull into a clean open editor; a real two-device version conflict; Keep local after post-conflict editing; delete and restore of a conflicted document; uninterrupted Arabic/English typing; emergency recovery; ownership repair; offline relaunch; Delete Table plus Undo; numeric code sanitization in every entry path; admin content-option CRUD and non-admin RLS denial; dependent Subject/Chapter selections; simple and complex DOCX table imports; every Export option; one/two-page A4 View Only at laptop/mobile widths; Outline navigation in preview; first/last-row Documents overflow menus; and service-worker upgrade to v2.4.5.
>
> Report only evidence-backed findings. For each finding provide Severity (P0–P3), exact file/function, reproducible event sequence, why existing protection fails, minimal safe fix, and regression test. Explicitly distinguish confirmed defects from hypotheses. Check SQL RLS/RPC security separately from client reliability. Do not recommend disabling RLS, sharing accounts, using the service-role key in the client, or overwriting local conflict data automatically.
>
> End with: (A) whether v2.4.5 preserves v2.3.4 cross-device sync correctness while reliably draining Android queues, (B) whether migration 008 and Content Options enforce authenticated-read/admin-write boundaries, (C) whether A4 preview is non-mutating and dimensionally faithful, (D) whether DOCX/standalone HTML remain bounded and safe, (E) whether the exact style contract, Continue writing, and v2.3.3 focus behavior remain preserved, and (F) a prioritized pre-production test list.

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
- `supabase/migrations/004_security_hardening.sql` through `008_dynamic_content_options.sql`: hardening, grants, and dynamic-option RLS.
