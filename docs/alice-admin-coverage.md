# A.L.I.C.E. admin capability audit — November 17, 2026

Inventory: current `admin-navigation.mjs` pages and their loaded admin-suite variants; `admin-sales-portal.js`, `admin-assignment-management.js`, `schedule-live.js`, `schedule-add-assignment.js`, `admin-regions.js`, directory/review modules, residential, finance, payouts, gifts, referral agents, resident feedback/QR, QA library, and native onboarding admin routes. Checked explicit field allowlists against the live database schema. Backend operations—not visual UI controls such as scrolling, navigation, printing or window layout—are the parity boundary.

| Admin area/control | Supported connection |
| --- | --- |
| Dashboard, counts, activity, business maps and demand | Exact count, assignment calendar, sales overview/productivity, finance summary, maps and demand actions; current operational resources |
| Commercial leads and walkthrough fields | `portal_properties` read/create/update; distinct from Sales CRM leads |
| CRM leads: qualification, ownership, notes, tasks/status, import | `leads` read/update, duplicate-safe `create_leads`; `records.batch_update` preserves omitted fields and checks every revision |
| CRM walkthroughs, quotes, contracts, tasks | `sales.save_workflow` atomically updates the child and lead; individual resources available for explicitly scoped record-only edits |
| Sales walkthrough availability | `walkthrough_slots` create/update/read |
| Contractor / sales / BA accounts | Existing access and team actions, profile edits/deactivation, separate create/reset actions, current onboarding/training and rating reviews |
| Contractor job locations and regions | Contractor allowed regions/property IDs; `regions`, `region_properties`, `manager_regions`, `manager_properties`, `managers`; deactivate links without deleting |
| Hiring, review, archives, resumes and welcome previews | Applicant actions; real hire preserves its welcome email workflow |
| Background checks and checklist reconciliation | Existing upload, review and atomic background approval; onboarding and academy snapshots |
| COI and other document review / correction | Portal and native review adapters, correction emails, signed file links; owner instruction suffices for background approval |
| Native onboarding form/document/video definitions | `onboarding.templates`, save/reorder, PDF link/version replacement; revision check; preserve previous documents and signatures |
| Commercial / residential assignment calendars | Existing combined calendar and resource reads with precise ID/date search |
| Assignments: worker, job status, pay, dates, notes | Dedicated reassign/set_status/set_pay/reschedule/edit_details; payment and completion protections retained |
| Assignment preferences, priority, unit/property, recurrence, materials and checklist plan | `assignments.configure`; these do not rewrite completed-work answers |
| Manual residential/commercial calendar entries | `assignments.create_manual`; matches manual schedule editor and does not create checkout or charge customer |
| Multiple recurring commercial jobs | `assignments.create_series`: explicit date windows, atomic pending creation; authorize release separately |
| Residential bookings and calendar settings | Existing complete/cancel/approve/reconcile, reschedule, notes and calendar configuration; customer/client/inquiry reads |
| Client Directory, contracts, contacts, units, projections | Explicit read/create/update resources, including revenue and account-manager fields |
| Cleaning checklist templates / modules and property/unit application | Structured template/module resources; template IDs, expanded checklist items and module counts on target property/units |
| QA reviews, video library and evidence | Existing approval/revision; video read/link/edit/upload with checksum, assignment and QA-job association |
| Portal conversations | Read/create/reply/mark-read; no conversation deletion |
| Resident feedback / contractor feedback | Read/link resident feedback; feedback status/admin notes; contractor rating decisions |
| Resident feedback QR cards | Batch list/create/home details; distinct from BA referral QR codes |
| Finance / expenses / invoices | Existing summary and explicit expenses; invoice-sent marker; QuickBooks status/invoice reads and invoice/payment sync |
| Contractor, sales, BA and Global Payouts | Existing separate earning, approval, already-paid and transfer workflows; actual transfer requires the intended recipient/amount |
| Gift cards | Search, detail, history, zone, refund and retry delivery |
| Referral agents: records, import, flyers, outreach and ledger | `agents.*` operations, existing sending/consent safeguards and per-channel request deduplication |
| Portal code changes | Existing `coding.submit` / `coding.status`; report queued vs tested/published accurately |

## Enforced boundaries

- No deleting records, files, QR batches, users or conversations; status-based soft deletion is blocked too. Non-destructive deactivation/archiving remains available.
- No arbitrary SQL, table name, HTTP endpoint, service credential or caller-supplied admin identity. Existing full-access connection and active admin owner are rechecked.
- Provider account setup, MFA, banking credentials and personal login/recovery changes remain provider-interface tasks. Alice cannot create an unrestricted alternative key to bypass her deletion restriction.
- No fabricated signatures, lesson completion or video inspection. A waiver is identified as a waiver. Files must be supplied to a connected client; a phone conversation alone does not upload a local file.
- Direct native template PDFs have a 2.5 MB payload limit; QA uploads use private signed URLs up to 100 MB; contractor documents retain their existing upload limits.
- Paid/pending-payout assignments require reconciliation before protected changes; customer scope/address repricing is not treated as a raw assignment update.

## Validation

- 40 targeted regression tests passed across integration permissions, documents, onboarding, background approval, assignments/calendars, counts, referral delivery and new admin workflows.
- New tests check actual catalog columns, structured field validation, no-deletion bypasses, atomic quote/lead changes, stale edits, bulk rollback, recurring creation, and API body parsing without a browser.
- Live rollback-only tests confirmed quote pipeline synchronization, preservation of notes/owner, stale-write rejection, region soft-delete blocking, assignment configuration, manual residential creation at 36% pay, recurring commercial creation, QA-job linkage and duplicate-safe QA attachment. No test customers, messages, payments or uploads were retained.
- Found and fixed shared sales revision timestamps using transaction time; each write now receives a distinct clock timestamp.
- All 39 resource reads and seven additional read workflows passed against production (46 checks). Alice voice/SMS configuration verification follows deployment. A real end-to-end phone conversation is not covered by server tests.

## Remaining-control closure (November17)

Added business communication settings/actual usage and call history; regional/selected lead allocation and bounded unassignment; parsed expense imports and checksum-matched imported resumes; connection/webhook administration with one-time authenticated secret retrieval and inherited deletion restrictions; free-form customer email/SMS previews, send deduplication and provider receipts; atomic booking address/scope repricing with gift reservation, scheduled charge and contractor/assignment synchronization. Saved review IDs work across calls and texts.

Sixty-eight regression tests passed, including provider-timeout and cross-session message tests. Live rollback tests confirmed data preservation, inherited deletion blocking, one-time credential retrieval, protected-table permissions and atomic repricing. Test sends use mocked providers; no customer was contacted or charged during these tests. Operational provider settings and protected paid history still enforce their existing constraints.

Recurring visits retain maintenance pricing. Amending the latest visit of an active plan pauses automatic renewal for review, avoiding unintended changes to the next generated visit. Provider diagnostic sessions are charged to the same $25 ledger and settled from reported USD costs.
