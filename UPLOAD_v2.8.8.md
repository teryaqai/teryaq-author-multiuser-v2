# Upload v2.8.8

1. In Supabase SQL Editor, run `supabase/migrations/023_icon_manager.sql`.
2. Deploy the repository contents.
3. Hard-refresh the PWA once after deployment.
4. Open **Admin → Icons** and test one icon override.
5. Refresh another signed-in account/device and confirm the override appears.

No destructive database changes are included.

Icon Manager note: v2.8.8 expands the catalog/placement coverage only; migration 023 remains the latest required migration.
