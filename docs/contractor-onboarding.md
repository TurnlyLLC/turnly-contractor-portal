# Contractor PWA onboarding

The PWA uses the native Rork onboarding service for the published checklist, validation, signed PDFs, uploads, review status and Supabase document mirrors. It never approves contractors or substitutes a separate checklist. The API authenticates the Supabase user and persisted contractor role before forwarding that user's token to the fixed native origin.

Unsubmitted PWA drafts live in `contractor_onboarding_drafts`. Only the service role can access this table/function. AES-256-GCM encrypts drafts and authenticates the contractor ID plus item ID. A revision comparison rejects conflicting edits from other tabs. No form values are stored in browser storage or service-worker caches. Drafts are removed after successful signing; submitted documents remain in the native service.

The draft encryption secret is `CONTRACTOR_DRAFT_KEY`, falling back to the project's service-role secret. **Before rotating the active secret, migrate existing ciphertext to the new key, or retain the previous key as CONTRACTOR_DRAFT_KEY.** Changing the secret without migration makes existing drafts unreadable; the API fails closed rather than overwriting them. Signed documents use the native service's separate encryption keys.

PWA drafts currently resume across PWA sessions/devices; native app drafts are independent. Submitted records and review statuses are shared with the app. PWA uploads support PDF/JPG/PNG up to 3 MB due to the serverless request limit. Files await the same review rules as native submissions. No real agreement, tax form, or banking authorization should be signed during automated testing.

## Individual admin requirements

Directory → Review center → All contractors → Review account exposes each native document with upload/submission, review, and completion states. The Required switch creates an audited native admin waiver for one contractor/item; it does not sign a document or automatically approve the portal account. A previous submitted-file reference is retained so its copy can still be opened. Restoring a waived requirement first pauses portal job access through the existing audited account-review RPC, then asks the native service for a new submission. The contractor must be reviewed and reapproved afterwards. No global template is changed. The native backend records the reviewing admin and time.

## Applicant-paid background checks

The existing native `background` requirement is the source of checklist completion. Admin Directory > contractor > Onboarding adds manual invitation/screening/review stages. Verified First sends the invitation and collects payment; Turnly staff review the provider report, record its reference and explicitly approve. No API integration or automatic invitations are implemented.

Tracking and append-only review history are service-only. Each save uses an expected revision, pauses account approval before remote changes, and requires native checklist read-back before finalizing. Failed synchronization blocks claims and may be retried after two minutes. Background approval does not approve the whole account; remaining documents/training and separate account approval still apply. Existing untracked completions/waivers are preserved. Do not put report findings, SSNs, or payment details in the contractor-visible message.
