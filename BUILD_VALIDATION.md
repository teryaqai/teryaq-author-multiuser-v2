# v3.0.3 validation

- All application JavaScript passes node --check.
- admin-governance TypeScript transpiles without diagnostics.
- Chromium behavior tests pass: read-only profile; password option; profile mutation guard; manager Start and review eligibility; required-form gating; missing task_key in RPC rows; v2 filenames; automatic creator selection; protected person field; reset clears work and media queues while preserving templates/settings; admin Other explanation; targeted Discard; 14px controls with centered SVG.
- PostgreSQL (PGlite) applies migrations 001–033 against Supabase auth/storage scaffold. Tests pass for admin-only profile RPC and RLS, Other validation, unassigned admin status transitions, executor change rejection, reset inventory excluding avatars, reset waiting for storage cleanup, document/version deletion, account/course/avatar preservation, stale-generation rejection, new-generation document creation.
- Storage service and Auth email-update behavior were not exercised against the live Supabase project. No live reset or deployment performed.
