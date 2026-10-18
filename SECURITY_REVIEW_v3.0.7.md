# v3.0.7 targeted authorization review

This release builds on the local v3.0.6 review. It is not a new full production penetration test or GitHub history scan. No repository visibility, live account or provider configuration was changed.

- Task-bound editor choices and server-side document scope guard cover course/chapter/template/version and immutable linked metadata. Text and figures variants are explicitly mapped; closed tasks are read-only to non-admins. Existing unlinked documents are editable only with a matching authorized task.
- Chapter-wide scientific author updates require Scientific Lead/Course Lead/admin authorization. AI assignments stay per stage; approved/in-review task attribution is retained.
- Analytics SECURITY DEFINER returns stage-scoped data to managers; ordinary users receive no team data; anonymous execute is revoked.
- Account deletion uses the existing server-only admin-governance function. A service-only SQL preflight checks actor, self-deletion and last admin, marks the profile inactive and removes open assignments. Existing JWT database/storage access stops immediately. Auth identity deletion removes login/refresh access. The profile is deliberately retained as historical attribution, with its Auth FK detached. Failed Auth deletion remains inactive and can be retried from Users. This is operational account deletion, not historical data erasure.
- Archived profiles cannot be reactivated through direct profile edits or assigned to new tasks.
- Dynamic labels are escaped; Excel exports use inline text cells, avoiding formula execution.
- noindex is discovery guidance, not an access control. Cloudflare Access is a documented future proposal; public Render-origin bypass must be addressed before relying on the gate.

Local validation: migrations, RLS/definer scenarios, document tampering, account tombstone retention, role boundaries, browser interaction, RTL/LTR and responsive containment. Supabase Auth admin.deleteUser is implemented through its existing SDK and requires deployment; the live provider request was not executed.
