# TERYAQ Master Tool v2.9.0

Upload the full package to the deployment branch.

## Database
Run `supabase/migrations/024_ai_handoff.sql` once after migration 023.

## Render
Keep:
- `TERYAQ_SUPABASE_URL`
- `TERYAQ_SUPABASE_ANON_KEY`

Build command:
```bash
printf 'window.__TERYAQ_CLOUD_CONFIG__ = { projectUrl: "%s", anonKey: "%s" };\n' "$TERYAQ_SUPABASE_URL" "$TERYAQ_SUPABASE_ANON_KEY" > runtime-config.js
```
