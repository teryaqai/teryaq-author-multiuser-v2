# TERYAQ Master Tool v2.3.2 — Independent AI Review Brief

## What to upload

Upload the complete `TERYAQ_Master_Tool_AI_Review_v2.3.2.zip`. It contains the application source, Supabase migrations, release metadata, test checklists, and this brief. You may also attach screenshots of the exact error and a redacted `.teryaq` export that contains no confidential scientific material.

Never upload passwords, Supabase service-role keys, browser storage exports, access/refresh tokens, or real confidential documents. The application package intentionally contains no configured project URL or keys.

## Copy/paste prompt for the reviewing AI

> Act as a senior offline-first PWA and Supabase/PostgreSQL security reviewer. Review the attached TERYAQ Master Tool v2.3.2 source without rewriting the product or weakening its account isolation, RLS, immutable version history, or local-first behavior.
>
> The reported production symptom was account/device specific: a user edited on multiple devices, pressed Save/Sync, exited, and later found some local text replaced or missing. Another user could not reproduce it. A separate error was `Document ownership mismatch` even though the human user believed they created the document.
>
> The v2.3.2 proposed fixes are: (1) serialized Save → verified IndexedDB read-back → queue → Sync; (2) emergency LocalStorage draft plus pagehide/background flush; (3) cloud pull may overwrite only an explicitly `synced` local document; (4) pending, local-only, conflict, ownership-error, remote-delete-conflict, and unknown local states must never be silently overwritten; (5) an ownership mismatch must back up and re-key the local document under the authenticated account without modifying or claiming the other cloud row; (6) versioned JS/CSS assets must update older installed PWAs; and (7) no service-role key may appear in the browser.
>
> Trace these exact flows: text input → in-memory model → emergency draft → IndexedDB → syncQueue → `push_document()` → cloud version → reopen/pull; two devices editing the same base version; remote deletion while local work is unsynced; import/restore with an existing foreign document ID; session refresh; offline launch; iPad/Safari lifecycle termination; old service-worker cache upgrading to v2.3.2.
>
> Report only evidence-backed findings. For each finding provide Severity (P0–P3), exact file/function, reproducible event sequence, why existing protection fails, minimal safe fix, and regression test. Explicitly distinguish confirmed defects from hypotheses. Check SQL RLS/RPC security separately from client reliability. Do not recommend disabling RLS, sharing accounts, using the service-role key in the client, or overwriting local conflict data automatically.
>
> End with: (A) whether v2.3.2 prevents the reported data-loss sequence, (B) remaining scenarios that can still lose unsynced work, (C) whether the ownership repair can affect another user's cloud record, and (D) a prioritized pre-production test list.

## Architecture summary

- Static dependency-free PWA hosted on Render.
- Supabase Auth plus PostgreSQL tables/RLS and the `push_document()` RPC.
- IndexedDB is the primary local store; cloud synchronization is secondary.
- One sync queue entry per account/document.
- Cloud updates create immutable versions.
- Conflicts require explicit user resolution.
- Emergency drafts are device-local and scoped by account/document.

## Files that deserve the closest review

- `app.js`: `markDirty`, `saveCurrent`, `saveAndSyncCurrent`, emergency recovery, lifecycle handlers.
- `platform.js`: `pushQueueItem`, `repairDocumentIdentity`, `pullRemote`, `syncNow`, session restoration.
- `sw.js` and `index.html`: update and offline-cache behavior.
- `supabase/migrations/001_accounts_documents.sql`: ownership validation, version comparison, RLS foundation.
- `supabase/migrations/004_security_hardening.sql` through `007_auto_rls_function_hardening.sql`: hardening and grants.
