# TERYAQ Master Tool v2.8.1

## Upgrade from v2.8.0

1. Confirm migration `020_scientific_workflow_automation.sql` is already applied.
2. In Supabase SQL Editor, run `supabase/migrations/021_task_ui_resources_instruction_scope.sql` **once**.
3. Upload/deploy the full v2.8.1 package to Render/GitHub.
4. Hard refresh the browser / reload the installed PWA so the v2.8.1 service-worker cache replaces v2.8.0.
5. Test first as Admin/Course Lead, then as a normal Task Executor.

## v2.8.1 test checklist

- Task detail page uses the new card-based layout: Task Information, Status & Progress, Assignment & Schedule, Required Files / Inputs, Instructions, Checklist, Comments, Submission History, and Activity.
- Task Executors use a searchable dropdown instead of an always-expanded user list; multiple users and Course Team assignment still work.
- Team & Task Executors has an **Executor** filter that limits the task table to one person (or Course Team).
- Add Text Instruction, Add Checklist, and Add Required Input open centered in-app popup windows instead of browser prompts or fixed side panels.
- Text instructions and text required inputs include basic formatting controls (bold, italic, underline, bullets, numbering, links).
- Instruction scope supports **This task only** or **All similar tasks across chapters**. Shared instructions are copied to matching task keys within the same course.
- Required Input popup supports Text, Link(s), multiple Files, and multiple Images in the same operation.
- Preparation & Rules uses the same rich in-app resource experience and supports multiple text/link/file/image items in each resource group.
- Existing Required Files visibility rules remain unchanged: Task Executors and authorized management only; Course Lead can see all required inputs in the course; Preparation & Rules remains visible to everyone in the course.
- Comments, Review Requests, submission history, Scientific Draft V1–V5 dependencies, and the four approved submission-form families remain intact.

If migration 021 is not applied, reusable instruction scope and multi-resource/image additions will not work correctly.
