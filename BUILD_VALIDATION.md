# v3.0.8 local validation

Synthetic data, isolated PGlite and Chromium with mocked provider APIs. No production credentials or database were used.

- First-party JavaScript syntax checks passed.
- Migrations 001–043 apply to an isolated Supabase-like schema; repeat 043 retains data/task codes.
- Task-document/account/analytics: 33 checks. Client access to the private helper is explicitly revoked to reproduce the error. The new RPC allows an assigned member/stage lead and denies unrelated users, closed tasks, deleted accounts and anonymous callers.
- Database regression scenarios pass: scoped tasks, native submissions, second executors, manager approval, downstream files, QF rounds, retained archive links and repeat upgrade.
- Responsive release UI: 43 checks, no uncaught errors.
- Targeted v3.0.8 browser suite: 41 checks covering recovery request/token use, password mismatch, keyboard accordion, dates/preserved drafts, document reuse, account button containment, plain icons, search, retained queue, report SQL/persistence/export.
- Screenshots inspected for desktop chapters/collapsed sidebar and mobile admin. Screenshots are temporary and not shipped.

Actual publication, SQL execution, email delivery, PWA refresh and the old queued sync operation require verification after installation. The production queue is not claimed fixed.
