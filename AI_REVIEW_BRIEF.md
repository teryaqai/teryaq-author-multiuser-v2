# TERYAQ Master Tool v2.5.0 — Independent AI Review Brief

## What to upload

Upload the complete `TERYAQ_Master_Tool_AI_Review_v2.5.0.zip`. It contains the application source, bundled JSZip with its license, Supabase migrations, the protected account-approval and governance Edge Functions, release metadata, test checklists, and this brief. You may also attach a redacted `.teryaq` export that contains no confidential scientific material.

Never upload passwords, Supabase service-role keys, browser storage exports, access/refresh tokens, or real confidential documents. The application package intentionally contains no configured project URL or keys.

## Copy/paste prompt for the reviewing AI

> Act as a senior offline-first PWA and Supabase/PostgreSQL security reviewer. Review the attached TERYAQ Master Tool v2.5.0 source without rewriting the product or weakening its account isolation, RLS, immutable version history, local-first behavior, or v2.3.3/v2.3.4 save-and-sync protections.
>
> The reported production symptoms were: (1) a laptop displayed `Synced` but its newest text did not arrive on the phone; (2) false conflicts appeared while using one device; (3) earlier versions could lose or replace local text; (4) `Document ownership mismatch` appeared on a document believed to be locally created; and (5) v2.3.2 autosave dropped editor focus. The v2.3.3 focus fix must remain unchanged.
>
> The v2.3.4 proposal adds revision-aware reconciliation: after `push_document()` responds, the client atomically re-reads the latest IndexedDB document and compares `localSaveToken` with the sent revision. If they match, it marks the document synced and removes its queue entry. If a newer local revision exists, it preserves that entire revision, advances only `baseServerVersion`, keeps status/queue pending, and sends it next. `Synced` is allowed only when both queue and conflicts are empty. Remote pulls are applied only when the remote version is newer and local status is explicitly synced. Keep local and Save both read the newest IndexedDB copy at click time.
>
> v2.4.0–v2.4.5 retained that sync implementation while adding the compact tabbed editor, DOCX table import, unified export, overlay Outline, viewport-level document menus, fixed A4 View Only, Delete Table, numeric/dot-only codes, always-on sync, and dynamic content options. v2.4.6 repaired the content-option write path, added migration 009 with an administrator-only save RPC, renamed Subject to Course in the UI, and enforced Course → Chapter selection and administration while preserving legacy metadata. v2.4.7 prevents background sync completion events from rebuilding the Admin page while a user is typing and gives every ordering control a visible Display order label. Verify that Admin form state survives repeated 15-second sync checks and that these changes do not alter STYLE_CONTRACT, paragraph/inline-mark behavior, autosave focus, authentication/account isolation, document identity, queue reconciliation, or backward compatibility.
>
> v2.5.0 adds migration 010 and protected Edge Functions for version comparison, admin analytics, cloud conflict metadata, a 30-day Trash retention policy, admin restore and retention-gated purge, Audit Log/CSV, and account requests requiring admin approval. Verify that the browser never receives a service-role key, anon callers cannot enumerate accounts, normal users cannot access admin tables/RPCs or promote their own profile role, permanent purge cannot bypass retention, restored documents reconcile to owners as a higher cloud version, and the conflict dashboard never uploads local document content.
>
> Trace these exact flows: a delayed push while another autosave commits; repeated edits during automatic sync; Android save/background/resume followed by laptop pull; an equal-version pull while the editor is focused; a newer remote pull into a clean open editor; a real two-device version conflict; Keep local after post-conflict editing; delete and restore of a conflicted document; uninterrupted Arabic/English typing; emergency recovery; ownership repair; offline relaunch; Delete Table plus Undo; numeric code sanitization in every entry path; Admin form typing across two 15-second automatic sync intervals; admin content-option CRUD and non-admin RPC denial; Course → Chapter filtering with duplicate chapter titles across courses; legacy Subject metadata compatibility; simple and complex DOCX table imports; every Export option; one/two-page A4 View Only at laptop/mobile widths; Outline navigation in preview; first/last-row Documents overflow menus; comparing two owner/admin cloud versions; request approval/rejection/invitation; admin analytics; cloud conflict reporting and resolution metadata; admin restore; early purge rejection and eligible purge; audit CSV formula neutralization; and service-worker upgrade to v2.5.0.
>
> Report only evidence-backed findings. For each finding provide Severity (P0–P3), exact file/function, reproducible event sequence, why existing protection fails, minimal safe fix, and regression test. Explicitly distinguish confirmed defects from hypotheses. Check SQL RLS/RPC security separately from client reliability. Do not recommend disabling RLS, sharing accounts, using the service-role key in the client, or overwriting local conflict data automatically.
>
> End with: (A) whether v2.5.0 preserves v2.3.4 cross-device sync correctness while reliably draining Android queues, (B) whether migrations 008–010, RLS, RPCs, and the Edge Function enforce the intended user/admin boundaries, (C) whether account requests avoid enumeration and keep the service-role key server-side, (D) whether restore/purge/retention and conflict metadata are safe, (E) whether version comparison is read-only and complete enough, (F) whether Course → Chapter, A4 preview, DOCX/HTML, the exact style contract, Continue writing, and v2.3.3 focus behavior remain preserved, and (G) a prioritized pre-production test list.

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
- `supabase/migrations/004_security_hardening.sql` through `010_governance_admin_tools.sql`: hardening, grants, dynamic-option RLS, governance tables/RPCs, retention, audit, and analytics.
- `supabase/functions/admin-account-request/index.ts`: administrator verification, server-side invitations, and service-role isolation.
- `supabase/functions/admin-governance/index.ts`: retention verification, Storage API cleanup, and protected permanent purge orchestration.
