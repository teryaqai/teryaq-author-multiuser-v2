# Upload v3.0.6

1. Back up the existing deployment and database through your normal provider tools.
2. Apply UPDATE_SUPABASE_v3.0.6.sql in Supabase SQL Editor. Requires completed 001–036.
3. Upload the app contents through your normal deployment process; preserve Supabase environment values.
4. Apply Render headers from render.yaml (Blueprint sync or manual Headers settings).
5. Open INSTALL_v3.0.6.html and use its checklist to review changes.

No Edge Function source change is required relative to v3.0.5. Do not run reset. Nothing was deployed automatically.
