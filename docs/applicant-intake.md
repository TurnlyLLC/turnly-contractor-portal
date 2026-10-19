# Applicant intake

Public entry: `/apply.html`. Admin queue: `/applicants.html`, linked under Contractors.

Cleaners provide contact information, preferred North Carolina service area, experience, service interests, availability, equipment/transport/insurance readiness, and acknowledgments of required onboarding, training, safe work, privacy, and quality procedures. Based on Turnly Academy module 1 (independent contractor responsibilities), safety, QA, and certification modules plus existing contractor document review. No invented minimum experience, insurance coverage amount, pay promise, or automatic eligibility decision.

Brand ambassadors use a separate interest registration. Duties, compensation, eligibility, and later onboarding are deliberately pending the owner’s details.

Applications are private service-role storage behind a rate-limited API; admin requests validate the authenticated user against the stored profile. Consent is versioned. A stable UUID makes retries idempotent without exposing an email lookup. Database triggers record each submission/review transaction. Version checks prevent one administrator overwriting another’s review. No access to applications is granted to anonymous or normal authenticated database clients.

Review stages: New, Reviewing, Contacted, Interview, Selected / onboarding, Waitlist, Not selected, Withdrawn. Internal notes and history are retained. Selecting onboarding does not create an account or approve job access. Admin opens Directory to create/locate the contractor account, then reviews its onboarding and training through existing workflows. Email/call buttons launch the administrator’s own applications; no automatic messages are sent.

Deploy database migration 20261019162553 before publishing the portal and public website links. Uses existing SUPABASE_SERVICE_ROLE_KEY and allow_referral_request rate limiter; no new secrets. Public form stores no applicant draft in browser storage. Existing Academy, job approval, and service coverage systems are unchanged.

Validation: Node tests exercise both role paths, required acknowledgments, privilege-field exclusion, stored-role authorization, real Postgres-compatible permissions/audit triggers, idempotency primary key, and concurrent edits. Browser form verification uses synthetic details only.


## Full ambassador application (2026-10-19)

The ambassador application now collects legal and preferred name, contact/location/ZIP, age-18 acknowledgment, optional experience/languages/profile, primary marketing channels and a required first-five-paying-customers strategy. Required acknowledgments cover commission-only pay, intended independent contractor arrangement, lawful marketing and electronic application/onboarding communications. Compensation acknowledgment is versioned and explicitly records the owner-confirmed rule: $25 at first confirmed booking and $25 at first completion. The supplied document’s full-payment milestone is superseded by that explicit instruction.

Admin queues are separate: `/applicants.html?role=cleaner` and `/applicants.html?role=brand_ambassador`. The API defaults to cleaners and rejects unknown roles; it never returns a mixed applicant list. Separate global counts are admin-only. Existing interest applications remain readable and are marked as legacy registrations requiring the full application. Existing cleaner validation and application audit history are preserved.

The initial application does not sign the supplied draft agreement, collect tax IDs or payment details, activate accounts, or adopt the draft’s proposed 14/30/90-day terms. Approved applicants proceed to separately arranged secure onboarding.
