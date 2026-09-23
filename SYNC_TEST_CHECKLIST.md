# TERYAQ Master Tool — Multi-user / Sync Acceptance Checklist

## v2.3 profile and Trash
- [ ] Saving a username updates the dashboard greeting and sidebar without changing the login email.
- [ ] Deleting an online document moves it to the user's Trash and creates a synchronized deleted state.
- [ ] Deleting offline keeps a complete recoverable local copy and queues the cloud delete.
- [ ] Restoring online or offline returns the document to Documents and queues an upsert.
- [ ] A normal user sees only their own Trash.
- [ ] An admin sees synchronized deleted documents from all accounts under Admin → All Trash.
- [ ] Arabic-first bullets and numbers place their markers on the right; English-first items keep markers on the left.

## Authentication
- [ ] First login requires internet.
- [ ] Invalid credentials do not create a local account.
- [ ] A previously authenticated account can use Continue Offline.
- [ ] Account A never sees Account B local documents on the same device.
- [ ] Sign out preserves local account data.
- [ ] Sign out & Remove Local Data removes only the selected account's local data.

## Legacy migration
- [ ] Open v1 data in v2 without clearing browser storage.
- [ ] Pre-migration backup appears before legacy ownership is assigned.
- [ ] Declining legacy ownership leaves those files untouched.
- [ ] Accepting ownership preserves content/styles/templates/snapshots.

## New device
- [ ] Create/sync document on Device A.
- [ ] Sign in to Device B.
- [ ] Sync and verify document appears on B.
- [ ] Device A still retains its copy.

## Offline
- [ ] Disconnect network after successful login.
- [ ] Open documents and edit normally.
- [ ] Close/reopen the installed app and Continue Offline.
- [ ] Pending status is visible.
- [ ] PDF/print and `.teryaq` export work offline.

## Sync
- [ ] Automatic Sync is always enabled for new and upgraded installations, including devices where the old toggle was off.
- [ ] A saved online edit synchronizes without pressing Sync Now.
- [ ] Reconnect and verify the pending queue synchronizes automatically.
- [ ] A remote change is pulled by the 15-second online check.
- [ ] Returning to the visible app triggers a sync check.
- [ ] Automatic Sync runs after save, online, foreground, focus/pageshow, and the 15-second periodic check.
- [ ] Sync Now forces an immediate attempt without creating a duplicate queue item.
- [ ] A temporary timeout leaves the item queued, records the error, and retries automatically.
- [ ] Android Chrome background/resume drains its queue and a laptop signed into the same account pulls the accepted cloud version.
- [ ] Pending becomes Synced.
- [ ] Server `current_version` increments.
- [ ] `document_versions` receives immutable versions.

## Conflict safety
- [ ] Sync document to A and B.
- [ ] Take both offline.
- [ ] Edit same document differently.
- [ ] Sync A, then B.
- [ ] B becomes Conflict rather than overwriting A.
- [ ] Keep Local preserves A in version history and creates a newer local-based version.
- [ ] Use Server restores server state.
- [ ] Save Both preserves both drafts as separate documents.

## Admin
- [ ] Normal user does not see Admin button.
- [ ] Normal user cannot query other owners through REST/RLS.
- [ ] Admin sees all synced users/documents.
- [ ] Admin cannot see changes that have never left an offline device.
- [ ] Normal user cannot change own profile role to admin.

## Backup/update
- [ ] Export Workspace Backup.
- [ ] Restore as copies.
- [ ] Restore with matching IDs after making a pre-restore backup.
- [ ] Export Pre-Upgrade Backups.
- [ ] Increment app/database version in a test copy and verify old IndexedDB data survives.
- [ ] Old client is blocked when server `min_supported_app_version` is newer.
