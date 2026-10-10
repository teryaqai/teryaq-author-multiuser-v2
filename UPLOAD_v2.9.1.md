# TERYAQ Master Tool v2.9.2

1. Upload the project files.
2. Apply `supabase/migrations/025_workflow_exact_numbering_required_folders.sql` after migration 024.
3. Keep the working Render build command that generates `runtime-config.js` from `TERYAQ_SUPABASE_URL` and `TERYAQ_SUPABASE_ANON_KEY`.
4. Deploy with cache cleared once so the v2.9.2 service-worker cache is used.

## Main changes
- Exact latest workflow numbering.
- Complete Script & Presenting and Montage / Video Editing task sets.
- Required-input folders and apply-across-chapters support.
- Responsive full-width status bar.
- Checklist and comments UI fixes.
