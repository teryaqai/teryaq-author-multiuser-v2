# TERYAQ Master Tool v2.5.1 — Independent AI Review Brief

## What to upload

Upload the complete `TERYAQ_Master_Tool_v2.5.1.zip`. It contains the application source, bundled JSZip with its license, Supabase migrations, the protected account-approval and governance Edge Functions, release metadata, test checklists, and this brief. You may also attach a redacted `.teryaq` export that contains no confidential scientific material.

Never upload passwords, Supabase service-role keys, browser storage exports, access/refresh tokens, or real confidential documents. The application package intentionally contains no configured project URL or keys.

## Copy/paste prompt for the reviewing AI

> Act as a senior offline-first PWA and Supabase/PostgreSQL security reviewer. Review the attached TERYAQ Master Tool v2.5.1 source without rewriting the product or weakening its account isolation, RLS, immutable version history, local-first behavior, or v2.3.3/v2.3.4 save-and-sync protections.
>
> The reported production symptoms were: (1) a laptop displayed `Synced` but its newest text did not arrive on the phone; (2) false conflicts appeared while using one device; (3) earlier versions could lose or replace local text; (4) `Document ownership mismatch` appeared on a document believed to be locally created; and (5) v2.3.2 autosave dropped editor focus. The v2.3.3 focus fix must remain unchanged.
>
> The v2.3.4 proposal adds revision-aware reconciliation: after `push_document()` responds, the client atomically re-reads the latest IndexedDB document and compares `localSaveToken` with the sent revision. If they match, it marks the document synced and removes its queue entry. If a newer local revision exists, it preserves that entire revision, advances only `baseServerVersion`, keeps status/queue pending, and sends it next. `Synced` is allowed only when both queue and conflicts are empty. Remote pulls are applied only when the remote version is newer and local status is explicitly synced. Keep local and Save both read the newest IndexedDB copy at click time.
>
> v2.4.0–v2.4.5 retained that sync implementation while adding the compact tabbed editor, DOCX table import, unified export, overlay Outline, viewport-level document menus, fixed A4 View Only, Delete Table, numeric/dot-only codes, always-on sync, and dynamic content options. v2.4.6 repaired the content-option write path, added migration 009 with an administrator-only save RPC, renamed Subject to Course in the UI, and enforced Course → Chapter selection and administration while preserving legacy metadata. v2.4.7 prevents background sync completion events from rebuilding the Admin page while a user is typing and gives every ordering control a visible Display order label. Verify that Admin form state survives repeated 15-second sync checks and that these changes do not alter STYLE_CONTRACT, paragraph/inline-mark behavior, autosave focus, authentication/account isolation, document identity, queue reconciliation, or backward compatibility.
>
> v2.5.1 keeps the v2.5.0 governance model and adds migration 011, profile avatars, announcements/read receipts, lazy Admin sections, checkbox author pickers, and a separate resumable figure-image upload queue. Verify that image upload failures never overwrite document JSON, text autosave remains focus-safe, remote documents contain Storage paths rather than base64 images, private Storage RLS prevents cross-account access, and only admins can publish or delete announcements.
>
> Also trace: offline avatar selection/removal; offline announcement read state; upload interruption midway through a figure image; upload retry after PWA restart; second-device image retrieval; export validation for every mandatory Figure field; and service-worker upgrade to v2.5.1.
>
> Report only evidence-backed findings. For each finding provide Severity (P0–P3), exact file/function, reproducible event sequence, why existing protection fails, minimal safe fix, and regression test. Explicitly distinguish confirmed defects from hypotheses. Check SQL RLS/RPC security separately from client reliability. Do not recommend disabling RLS, sharing accounts, using the service-role key in the client, or overwriting local conflict data automatically.
>
> End with: (A) whether v2.5.1 preserves v2.3.4 cross-device sync correctness, (B) whether migrations 008–011 and Storage RLS enforce the intended boundaries, (C) whether media upload is isolated from autosave/conflict logic, (D) whether Admin lazy loading and announcement permissions are safe, (E) whether the exact style contract remains unchanged, and (F) a prioritized pre-production test list.

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
- `supabase/migrations/004_security_hardening.sql` through `011_v2_5_1_profiles_updates.sql`: hardening, grants, dynamic-option RLS, governance, avatars, announcements, and read receipts.
- `supabase/functions/admin-account-request/index.ts`: administrator verification, server-side invitations, and service-role isolation.
- `supabase/functions/admin-governance/index.ts`: retention verification, Storage API cleanup, and protected permanent purge orchestration.
