# TERYAQ Master Tool — Multi-user Offline-First v2.5.0

## v2.5.0 governance and administration

- Compares any two immutable cloud versions from **History / Versions** without editing or restoring either copy.
- Adds administrator analytics for users, active/deleted documents, versions, conflicts, account requests, and recent audit activity.
- Adds an administrator cloud-conflict dashboard containing synchronization metadata only; private local-only edits are never uploaded to it.
- Introduces a 30-day Trash retention policy. Administrators may restore another user's synchronized deleted document; irreversible purge is admin-only and blocked by the database until retention expires.
- Adds a cloud Audit Log with formula-injection-safe CSV export.
- Adds **Request an account** to sign-in. Requests remain pending until an administrator approves them; invitations are sent by a protected Supabase Edge Function.
- Adds migration `010_governance_admin_tools.sql` plus protected Edge Functions `admin-account-request` and `admin-governance`. The service-role key remains server-side and never appears in the PWA.
- Preserves the v2.3.4 race-safe synchronization, v2.3.3 uninterrupted autosave, account RLS isolation, offline editing, exact document style contract, DOCX tables, exports, Content Options, and existing version history.

## v2.4.7 stable Admin editing and clear ordering

- Prevents the 15-second automatic sync check from rebuilding **Admin → Content Options** while an administrator is typing.
- Preserves the active Admin tab, focused field, and unsaved text during background sync checks.
- Replaces the unexplained numeric fields with visible **Display order** labels and an explanation: smaller numbers appear first.
- Adds visible labels for Author/Course name, Chapter number, Chapter title, and Display order on desktop and mobile.
- Requires no new Supabase migration; migration 009 from v2.4.6 remains the latest database migration.

## v2.4.6 working Content Options and Course → Chapter hierarchy

- Renames the user-facing **Subject** option to **Course** while retaining backward compatibility with existing documents and database rows.
- Replaces the separate Chapter number/title selectors with one Chapter selector that displays `number — title`.
- Filters the Chapter selector strictly by the chosen Course, so identically named chapters in different courses remain distinct.
- Reorganizes **Admin → Content Options** into Authors, Courses, and **Chapters by Course**.
- Adds a visible persistent success/error message for every add/save operation instead of losing feedback during rerendering.
- Adds migration `009_content_options_repair_course_hierarchy.sql`, which safely repairs missing v2.4.5 tables, policies, grants, and creates an administrator-only save RPC.
- Detects an unapplied database migration and displays the exact required migration instead of silently showing empty lists.
- Preserves legacy `subject` / `subjectId` metadata alongside the new `course` / `courseId` values so existing synced documents continue to open normally.

## v2.4.5 dynamic metadata, print-faithful view, and cross-device sync

- Adds **Delete Table** to the Table tab with confirmation and session Undo support.
- Restricts Table, Figure, and Margin Figure codes to numbers and dots, including typed, prompted, and DOCX-imported values.
- Replaces free typing for Author, Subject, Chapter number, and Chapter title with administrator-managed cloud choices. Multiple authors are supported.
- Adds **Admin → Content Options** for adding, editing, sorting, activating, and deactivating authors, subjects, and chapters without a GitHub/Render deployment.
- Adds migration `008_dynamic_content_options.sql` with authenticated read access and administrator-only writes.
- Replaces the old zoom-only One Page / Two Pages controls with fixed 210 × 297 mm A4 preview pages built from the same structured document and print style contract.
- Keeps mobile preview as one scaled A4 page without changing internal typography, wrapping rules, table widths, or document data.
- Makes cloud synchronization always active while online, retries queued Android/background changes automatically, refreshes when the app becomes visible or focused, checks other devices every 15 seconds, and exposes the latest attempt/error in Settings & Sync.
- Preserves local-first saving, the persistent queue, server version checks, explicit conflict resolution, and the v2.3.4 race-safe push reconciliation.

## v2.4.4 tabbed editor and Outline access

- Reorganizes the existing editor controls into Home, Insert, Table, and View tabs without changing any document style definition.
- Removes the permanent side Outline tab; Outline now opens only from View and overlays the workspace without changing A4 width.
- Adds a read-only viewing mode and display-only zoom while keeping the underlying 210 × 297 mm page and print styles unchanged.
- Moves Documents `•••` actions to a viewport-level menu so actions are never clipped by the table container.
- Omits unnamed legacy tables from the Table information summary while keeping those table blocks in the document.

## v2.4.3 DOCX tables and unified export

- Imports one or more tables from a `.docx` file entirely on-device; the source file is never uploaded.
- Provides table selection, preview, required code/title metadata, optional caption, and a first-row header toggle before insertion.
- Preserves plain text plus bold/italic runs and converts imported tables into native editable TERYAQ table blocks.
- Flags merged and nested Word tables as **Needs review** and safely flattens unsupported cell structures.
- Replaces the separate Draft, Template, and Print buttons with one accessible **Export** menu.
- Adds a standalone `.html` export with embedded Tajawal fonts and no scripts, credentials, or Supabase configuration.
- Preserves the v2.4.2 table continuation behavior, exact style contract, and the v2.3.4 save/sync implementation. No Supabase migration is required.

## v2.4.2 continue writing after tables

- Ensures every newly inserted table has an editable Body paragraph immediately after it.
- Adds a visible `+ Continue writing` control beneath every table, including tables created in older documents.
- The control focuses the following editable block or safely creates a new Body paragraph when none exists.
- The control is editor-only and is excluded from Print / PDF output.
- Separates sign-in from first-time Supabase setup so connection fields cannot be clipped on short laptop screens.
- Shows Cloud setup as a desktop side card and a scrollable mobile bottom sheet.
- Identifies the cached account before **Continue Offline** opens its isolated local workspace.
- Preserves all v2.4.1 library/account fixes, the exact document style contract, and the v2.3.4 save/sync implementation.

## v2.4.1 document library and account usability

- Shows the TERYAQ logo in the application sidebar and login identity area.
- Adds accessible show/hide-password icons to sign-in and both Account password fields.
- Limits Chapter number entry to digits and dots in the creation wizard and both editors, including normalization of Arabic/Persian digits.
- Adds row checkboxes, select-all, clear selection, and safe batch Move to Trash in Documents.
- Removes a trashed document from the active conflict count while preserving the unresolved conflict inside its trash record; restoring that document restores its conflict state.
- Retries an explicit cloud deletion against the newest server version instead of leaving a deleted item as an active conflict.
- Explains backup, restore, device ID, role, sign-out, and local-data removal directly inside Settings & Sync.
- Preserves the v2.4.0 editor layout, exact style contract, and the v2.3.4 race-safe save/sync implementation.

## v2.4.0 compact document workspace

- Keeps the document action bar and formatting ribbon visible while scrolling.
- Moves the existing formatting controls into a compact Word-like ribbon without changing any style definition or inline-mark behavior.
- Adds a collapsible icon-first navigation sidebar and a closed-by-default document outline drawer.
- Displays the true A4 page at up to 145% workspace zoom while preserving its internal typography and A4 dimensions.
- Keeps Draft information separate from the paper and adds a linked three-column Table information card for table code, title, and optional caption.
- Preserves the v2.3.4 race-safe save, sync, recovery, ownership, and conflict behavior.

This package provides an **account-separated, local-first workspace** with a persistent navigation portal, guided template creation, username profiles, recoverable Trash, bilingual help, Supabase synchronization, device registration, server-side version history, document-level conflict handling, workspace backups, and an admin dashboard with version downloads and synchronized Trash visibility.

## v2.3.4 race-safe cross-device synchronization

- A cloud response can no longer write an older document snapshot over text saved while that request was in flight.
- Every successful push re-reads the latest IndexedDB revision atomically and compares its `localSaveToken` with the revision actually sent.
- If newer local text exists, only `baseServerVersion` is advanced; the newest document remains `pending` and stays in the queue for the next push.
- `Synced ✓` appears only when both the account queue and conflict store are empty. Remaining work is reported as pending instead of being presented as synchronized.
- Remote documents replace a device copy only when the cloud version is newer and the local document is explicitly synchronized.
- A newer remote version refreshes an open, clean editor without overwriting unsaved work. Equal-version pulls do not re-render the editor, preserving the v2.3.3 focus fix.
- False single-device conflicts are prevented by atomically preserving the newest cloud base version during local saves.
- Conflict resolution now reads the newest IndexedDB copy at click time, so edits made after the conflict appeared are not replaced by an older conflict snapshot.

This is a client-side synchronization fix. It requires no new Supabase migration and does not change the editor, the 250 ms autosave timing, emergency drafts, or local content serialization.

## v2.3.3 non-blocking autosave hotfix

- Background autosave no longer changes `contenteditable`, `readonly`, or form-control state while the user is typing.
- The caret and keyboard focus remain inside the current Arabic/English paragraph, table cell, metadata field, or figure field while autosave commits to IndexedDB.
- Only explicit blocking actions such as manual Save, Sync, or navigation temporarily lock the top action buttons. The editable document surface itself is never disabled.
- This is a client-only fix. It does not change the database schema or weaken the verified local-save and cloud-sync sequence introduced in v2.3.2.

## v2.3.2 multi-device reliability release

- Cloud pull now overwrites a local document only when its local state is explicitly `synced`. Pending, local-only, conflicting, errored, and unknown local states are preserved.
- A remote deletion can no longer remove an unsynced local draft; it creates a recoverable conflict instead.
- `Document ownership mismatch` is repaired without claiming or editing the other cloud record: the app backs up the local document, assigns a new globally unique document ID to the current account, preserves local History links, and retries synchronization.
- Every local save is read back from IndexedDB and verified with a unique save token before the UI reports success.
- The app requests persistent browser storage when supported.
- The Dashboard and sidebar show the running app version so different devices can be compared.
- Versioned JavaScript/CSS filenames force older installed PWAs to fetch the new release instead of reusing stale cached application code.
- The main navigation sidebar remains available in the editor on desktop and as a drawer on smaller screens.

The principal v2.3.2 data-loss fix addresses a multi-device race in v2.3.1 and earlier: after a stale device correctly created a conflict, the subsequent cloud pull could replace that local conflict because only `pending` was protected. v2.3.2 treats every non-`synced` local state as authoritative until the user resolves it.

## v2.3.1 save/sync hotfix

- **Sync** now performs a serialized local save first, waits for it to finish, and only then sends the queued document to Supabase.
- During an explicit manual Save/Sync/navigation action, the top action controls are temporarily locked against duplicate actions, with visible `Saving…`, `Saved locally ✓`, and cloud-version feedback. Background autosave never locks the editor.
- Every edit also keeps an emergency draft in device storage. A newer emergency draft is recovered automatically after the next authenticated launch.
- `pagehide`, app backgrounding, and exit attempts trigger an immediate local flush; the browser also warns when unsaved work is still pending.
- Successful editor sync displays the accepted Supabase document version.

This hotfix changes no database schema and requires no new Supabase migration.

## What works locally/offline

After an account has successfully authenticated at least once on a device, the cached account may use **Continue Offline**. The editor, templates, autosave, snapshots, validation, PDF/print, `.teryaq` import/export, and local workspace all work without internet.

The app writes to IndexedDB first. Cloud synchronization is secondary. A loss of connectivity never blocks editing.

Version 2.4.5 caches both `/` and `/index.html`, the bundled Tajawal fonts, the local JSZip DOCX reader, and the complete application shell so an installed iPad, Safari, Chrome, or Edge app can relaunch while offline.

## What requires internet

- First authentication on a new device
- Synchronization
- Loading documents onto a brand-new device from the cloud
- Admin dashboard across all users
- Cloud account/session refresh

## Files

- `index.html` — application shell
- `styles.css` — responsive UI
- `app.js` — templates/editors/document library
- `platform.js` — account isolation, offline login cache, sync, conflicts, backups, admin dashboard and migrations
- `sw.js` — offline PWA cache
- `supabase/migrations/*.sql` — production cloud schema and security
- `serve_local.py` — simple local web server for desktop testing

## 1. Create/configure Supabase

Use a Supabase project dedicated to TERYAQ Master Tool or an existing Teryaq Supabase project.

Apply the SQL migrations **in numerical order**:

1. `001_accounts_documents.sql`
2. `002_devices.sql`
3. `003_attachments_system.sql`
4. `004_security_hardening.sql`
5. `005_attachment_rls_hardening.sql`
6. `006_data_api_grants.sql`
7. `007_auto_rls_function_hardening.sql`
8. `008_dynamic_content_options.sql`
9. `009_content_options_repair_course_hierarchy.sql`
10. `010_governance_admin_tools.sql`

Do not combine future schema changes into these files after production use begins. Add `005_...sql`, `006_...sql`, etc.

### Create users

Users may submit an access request from the sign-in page, but the request does not create an account. An administrator must approve it before the server-side invitation is sent. Existing administrators can still create users directly in Supabase Authentication.

### Deploy the account-approval function

Deploy `supabase/functions/admin-account-request/index.ts` as `admin-account-request` and `supabase/functions/admin-governance/index.ts` as `admin-governance`. Set `TERYAQ_SITE_URL` to the production HTTPS URL used after an invitation is accepted. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain protected Edge Function environment values; never copy the service-role key into `index.html`, JavaScript, Render, or a user's device. The governance function removes attachments through the Storage API before completing an authorized permanent purge.

In **Supabase → Authentication → URL Configuration**, set the production Render HTTPS address as the Site URL and add it to Redirect URLs. An approved user follows the invitation link back to TERYAQ, chooses a password in the protected invitation screen, and then enters the account's isolated workspace.

### Make your admin account

There is no built-in or shared admin password. Create the intended administrator in **Supabase → Authentication → Users**, then run the following in the Supabase SQL editor. The trigger is disabled only inside this owner-controlled transaction and is immediately re-enabled:

```sql
begin;

alter table public.profiles
disable trigger protect_profile_role_trigger;

update public.profiles
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL';

alter table public.profiles
enable trigger protect_profile_role_trigger;

commit;

select email, role
from public.profiles
where email = 'YOUR_ADMIN_EMAIL';
```

Replace `YOUR_ADMIN_EMAIL` with the exact account email. The final query must return `admin`. Sign out and sign in again so the app refreshes the role and reveals the **Admin** button. The client app never contains the service-role key.

## 2. Configure each device

Open the app while online. On the login screen press **Cloud setup**. It opens as a side card on desktop and as a scrollable bottom sheet on mobile. Enter:

- Supabase Project URL
- Supabase **anon/public key**

Press **Save connection**, then sign in. The Sign in action also saves the current connection values as a fallback.

The URL/key are stored locally on that device. Never enter a service-role key.

## 3. First login on a new device

1. Install/open TERYAQ Master Tool.
2. Enter cloud configuration if this device has not seen it before.
3. Sign in.
4. Click **Sync Now** if the automatic sync has not finished yet.
5. Synced documents for that account are downloaded into the device's local workspace.
6. The user may now disconnect from the internet and continue working.

The old device remains unchanged.

## 4. Existing v1 local files

v2 uses the **same IndexedDB database name** and upgrades it in place. The upgrade adds new object stores/indexes without deleting the old `documents`, `templates`, `snapshots`, or settings.

When the first account signs in and unowned legacy files exist:

1. A complete pre-migration backup is written into `migrationBackups`.
2. The app asks whether those legacy files belong to the signed-in account.
3. If approved, they receive that account's owner ID and are migrated to document schema v2.
4. They enter the sync queue.

If a shared browser/device contained legacy data from several people, **do not claim everything**. Export backups first and migrate deliberately.

## 5. Local data ownership

Every v2 document contains:

- `ownerId`
- `schemaVersion`
- `templateVersion`
- `createdWithAppVersion`
- `lastEditedWithAppVersion`
- local `sync` metadata

The library only displays documents whose `ownerId` equals the currently signed-in account.

## 6. Sync behavior

Editing always saves locally first.

A modified document becomes:

`pending` → `syncing` → `synced`

If offline it remains safely local as `pending`.

**Automatic Sync** is always enabled while online. The app:

- synchronizes shortly after each locally saved change;
- synchronizes immediately when connectivity returns or the app becomes visible;
- checks every 15 seconds for changes made by other devices;
- leaves offline changes safely queued until the connection returns.
- retries temporary Android, network, timeout, and background-resume failures without removing the queued change;
- shows the last successful sync, latest attempt, and latest error in **Settings & Sync**.

Users can always press **Sync Now** for an immediate check.

## 6A. Change an account password

While online and signed in, open **Account**, enter and confirm a new password of at least 8 characters, then press **Change Password**. The new password applies to the same Supabase account on every device. The same page lets the user set the username shown in greetings.

The server increments `current_version` for every accepted change and stores immutable rows in `document_versions`.

## 7. Conflicts

The app never silently overwrites a server document that changed after the local device last synchronized.

If two devices edit the same document independently, the local document becomes `conflict` and the user can choose:

- **Keep local** — create a new server version using the local copy
- **Use server** — discard the conflicting local copy and accept the server version
- **Save both** — preserve the local draft as a new document and accept the server version for the original ID

This deliberately favors scientific-content safety over automatic merging.

## 8. Admin dashboard

Accounts whose `profiles.role = 'admin'` see an **Admin** button.

The dashboard can read all **synced** documents and users, including document owner, template, server version and updated time. It can inspect version history.

It cannot see edits that still exist only on an offline device. Admin editing is intentionally not implemented in v2 to avoid creating a second conflict path.

## 8A. Username and Trash

Users can set a display name from **Account**. That name replaces the email in greetings and account labels; the sign-in email remains unchanged.

Deleting a document moves a complete local copy into **Trash** and queues a soft-delete for synchronization. The owner can restore or download that copy. Restoring returns the document to the active library and queues the recovery for the cloud. Administrators can view and download synchronized deleted documents from all accounts in **Admin → All Trash**. Permanent deletion is intentionally not included until a retention policy is approved.

## 9. Sign out

**Sign out** removes the active authentication session but preserves that account's local offline workspace.

**Sign out & Remove Local Data** removes that account's local documents/templates/snapshots/queues/backups from that device only. It does not delete synced cloud data.

## 10. Workspace backup

Settings & Sync → **Export Workspace Backup** creates a `.teryaqbackup` containing the current account's local documents, Trash, snapshots, templates and conflicts.

Before restoring a workspace, the app creates another local pre-restore backup. Restoration can overwrite matching IDs or import them as separate copies.

**Export Pre-Upgrade Backups** downloads the local backups created before schema migrations/restores.

## 11. App updates and data safety

Never clear IndexedDB during an application update.

An update should replace app code only. Local IndexedDB persists separately.

When `DB_VERSION` changes, `onupgradeneeded` must only add/change database structure. Any document-content migration must:

1. create a pre-migration backup,
2. migrate sequentially,
3. preserve template version,
4. validate the migrated document,
5. never delete the prior backup automatically.

See `UPDATE_AND_MIGRATION_POLICY.md`.

## 12. Template updates

Template version and document schema version are independent.

An old document keeps the template version with which it was created. Installing a newer template must not silently rewrite old documents. Future template migration should be an explicit user/admin action.

## 13. Old app versus newer server

`system_config` contains `min_supported_app_version` and `current_document_schema`.

Before synchronizing, the client checks server compatibility. If the server requires a newer TERYAQ Master Tool version, sync stops instead of attempting a destructive downgrade.

## 14. Running locally

From the package directory:

```bash
python serve_local.py
```

Then open the displayed local URL. Service workers/PWA installation do not work correctly from `file://`; use localhost or HTTPS.

## 15. Installing as a PWA

Host the folder over HTTPS. Install from the browser. After the application shell has been cached and the user has authenticated once, the editor can operate offline.

### Deploy on Render

1. Upload the package contents to a GitHub repository with `index.html` at the repository root.
2. In Render choose **New → Static Site** and connect the repository.
3. Use `echo "No build required"` as the build command and `.` as the publish directory.
4. Deploy, then copy the generated `https://...onrender.com` URL.
5. In Supabase set that URL under **Authentication → URL Configuration → Site URL** and add it to **Redirect URLs**.

The included `render.yaml` contains the same static-site settings.

### Install on iPad

1. Open the HTTPS deployment in Safari.
2. Sign in once while online and allow the first sync to finish.
3. Tap **Share → Add to Home Screen**.
4. Launch TERYAQ Master Tool from its Home Screen icon. Offline editing works after the application shell and account have been cached; queued edits synchronize automatically when the iPad reconnects.

Native Android/iOS/desktop wrappers can use this same app and data protocol. Their local repository should use SQLite while keeping the server schema and sync protocol unchanged.

## Security rules

- Never ship a Supabase service-role key in the application.
- User access is enforced with Row Level Security, not hidden buttons.
- `push_document()` checks ownership and base server version atomically.
- Normal users cannot promote their own `role` to admin.
- Admin visibility applies only to synchronized server data.
