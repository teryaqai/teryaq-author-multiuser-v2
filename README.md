# TERYAQ Master Tool — Multi-user Offline-First v2.3.1

This package provides an **account-separated, local-first workspace** with a persistent navigation portal, guided template creation, username profiles, recoverable Trash, bilingual help, Supabase synchronization, device registration, server-side version history, document-level conflict handling, workspace backups, and an admin dashboard with version downloads and synchronized Trash visibility.

## v2.3.1 save/sync hotfix

- **Sync** now performs a serialized local save first, waits for it to finish, and only then sends the queued document to Supabase.
- Save, Sync, Back, and Settings controls are temporarily locked while the current document is being committed, with visible `Saving…`, `Saved locally ✓`, and cloud-version feedback.
- Every edit also keeps an emergency draft in device storage. A newer emergency draft is recovered automatically after the next authenticated launch.
- `pagehide`, app backgrounding, and exit attempts trigger an immediate local flush; the browser also warns when unsaved work is still pending.
- Successful editor sync displays the accepted Supabase document version.

This hotfix changes no database schema and requires no new Supabase migration.

## What works locally/offline

After an account has successfully authenticated at least once on a device, the cached account may use **Continue Offline**. The editor, templates, autosave, snapshots, validation, PDF/print, `.teryaq` import/export, and local workspace all work without internet.

The app writes to IndexedDB first. Cloud synchronization is secondary. A loss of connectivity never blocks editing.

Version 2.3.1 caches both `/` and `/index.html`, the bundled Tajawal fonts, and the complete application shell so an installed iPad, Safari, Chrome, or Edge app can relaunch while offline.

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

Do not combine future schema changes into these files after production use begins. Add `005_...sql`, `006_...sql`, etc.

### Create users

Create allowed users from Supabase Authentication. Public signup is intentionally not exposed by the app.

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

Open the app while online. On the login screen expand **First-time cloud setup on this device** and enter:

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

**Auto Sync** is enabled by default. While online, the app:

- synchronizes shortly after each locally saved change;
- synchronizes immediately when connectivity returns or the app becomes visible;
- checks every 30 seconds for changes made by other devices;
- leaves offline changes safely queued until the connection returns.

Users can turn Auto Sync on or off from **Settings & Sync** and can always press **Sync Now**.

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
