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

Keep JWT verification enabled. Both functions also verify the signed-in user's `profiles.role` before allowing an administrative action.

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

If the app says the approval service is not reachable, confirm that the function name is exactly `admin-account-request` and that its deployment is active in the same Supabase project used by the app.
