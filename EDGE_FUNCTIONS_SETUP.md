# Supabase Edge Functions — one-time setup

The static TERYAQ site runs on Render, but **Approve & Invite** and permanent storage cleanup run securely inside Supabase. Uploading the website ZIP to GitHub or Render does not deploy those Supabase functions.

## Deploy from the Supabase Dashboard

1. Open the correct Supabase project.
2. Open **Edge Functions** in the left sidebar.
3. Choose **Deploy a new function → Via Editor**.
4. Name the first function exactly `admin-account-request`.
5. Replace the editor contents with the complete contents of:
   `supabase/functions/admin-account-request/index.ts`
6. Click **Deploy function**.
7. Repeat the same process with the exact name `admin-governance` and the file:
   `supabase/functions/admin-governance/index.ts`

> **Important:** the function endpoint itself must end with
> `/functions/v1/admin-account-request`. Renaming the code file inside a function
> that was created with another name (for example `bright-action`) does not rename
> the deployed endpoint. If the URL still ends in another name, create a new
> function named exactly `admin-account-request`, deploy this code there, verify it,
> then remove the incorrectly named function.

Open the function's **Settings**, turn **Verify JWT with legacy secret** off,
and save the change. The function performs current session validation itself and
also verifies the signed-in user's `profiles.role` before allowing an
administrative action. Disabling the legacy gateway check prevents newer session
tokens from being rejected before this authorization code runs.

## Add the TERYAQ site address

1. In Supabase open **Edge Functions → Secrets**.
2. Add this secret:
   - Key: `TERYAQ_SITE_URL`
   - Value: `https://teryaq-author-multiuser-v2.onrender.com`
3. Save it. Do not paste a service-role or secret key into the website, GitHub, Render, or this custom secret.

Supabase injects its own project URL and privileged server key into the Edge Function runtime. Those values must never be copied into browser code.

## Configure invitation redirects

In **Authentication → URL Configuration**:

1. Set **Site URL** to `https://teryaq-author-multiuser-v2.onrender.com`.
2. Add the same address to **Redirect URLs**.

## Verify

1. Sign in as an administrator.
2. Open **Admin Center → Users & Access → Account requests**.
3. Approve a test request.
4. Confirm that the request changes to **Invited** and the recipient receives the Supabase invitation email.
5. Open the invitation link and confirm that TERYAQ shows **Create your password**.

## If the function says `Admin access required`

The signed-in account exists, but its row in `public.profiles` is not marked as
an administrator. Run migration `011_v2_5_1_profiles_updates.sql` again, then
promote only the approved administrator email from the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where lower(email) = lower('approved-admin@example.com');
```

Sign out and back in after the update so the app reloads the current profile.

If the app says the approval service is not reachable, confirm that the function name is exactly `admin-account-request` and that its deployment is active in the same Supabase project used by the app.
