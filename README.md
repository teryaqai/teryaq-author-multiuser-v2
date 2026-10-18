# TERYAQ Master Tool v3.0.6

Install using INSTALL_v3.0.6.html. It includes the exact SQL upgrade and a persistent user review checklist.
The atomic UPDATE_SUPABASE_v3.0.6.sql requires completed migrations 001–036 and installs 037–041. Fresh databases use migrations 001–041 in order.
No workspace reset, live deployment, GitHub mutation or automatic approval is performed by this release.
Task numbers, existing records and Google Sheets Test integration are retained. Three obsolete work-area cards are removed from navigation without deleting their data.
See SECURITY_REVIEW_v3.0.6.md for audit scope and limitations, and BUILD_VALIDATION.md for actual local tests.

## Role assignment behavior

Assignments for this role replaces executors on matching open tasks only. Approved and in-review assignments remain locked.
Scientific Draft authors are assigned once in Scientific Draft; their review tasks in Script and QF follow the chapter assignment. AI teams remain separate per work area.
Scientific shared roles cover scope, sources, timeline and responsibilities. Required-role classification follows canonical task keys; it does not grant management roles.

## Task Code

TSK-000001, globally unique per database task, allocated by a protected sequence, immutable once assigned. The display number and existing task UUID/key remain intact. Codes may have sequence gaps after rolled-back transactions.

## Hosting

Render configuration includes CSP, nosniff, framing and referrer headers. Existing manually configured Render services must apply these header changes in service settings or sync their Blueprint; uploading static assets alone may not update hosting settings.
Public clients must use only the Supabase publishable/anon key. Service role keys remain server environment variables.
