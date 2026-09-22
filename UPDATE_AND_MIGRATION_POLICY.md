# TERYAQ Master Tool — Update & Migration Policy

## Three independent versions

Every document/update process must distinguish:

1. **App version** — executable/UI code, e.g. `2.0.0`.
2. **Document schema version** — saved structured-data format, e.g. `2.0.0`.
3. **Template version** — the template definition the document was created from, e.g. `scientific-draft-text 1.0.0`.

Changing one never implies changing the others.

## Device app update

A normal update replaces only application assets. It must not delete IndexedDB/SQLite.

Safe startup sequence:

1. Open existing local database.
2. Run the database structural migration.
3. Detect owned documents needing content migration.
4. Store a complete pre-migration copy in `migrationBackups`.
5. Run content migrations sequentially.
6. Validate output.
7. Start the workspace.
8. Sync only after the local migration succeeds.

## Sequential migrations

Never jump directly with one irreversible transformation.

Example:

- `migrateDocumentV1ToV2()`
- `migrateDocumentV2ToV3()`
- `migrateDocumentV3ToV4()`

A document starting at v1 and opened by app v4 runs all three in order.

## Server migrations

Do not modify production schema manually once deployed. Add numbered Supabase migration files and apply them in order.

Before major production migrations, create a Supabase database backup and verify rollback instructions.

## New device

A new device does not "move" files from the old device:

1. install,
2. authenticate online,
3. register a new device ID,
4. pull synchronized workspace,
5. retain an independent offline copy.

The old device remains registered until explicitly removed later.

## Compatibility guard

A client must not sync a document/server schema it cannot understand. The server's `min_supported_app_version` may block older clients with a clear update-required message.

## Template updates

New documents use the latest template. Existing documents retain their original `templateVersion` until an explicit template migration is designed and accepted.

## Never do these

- Never use "clear site data" as an update step.
- Never change a document's template version silently.
- Never overwrite a server conflict automatically.
- Never remove the pre-migration backup before validation.
- Never downgrade an unknown newer document schema.
