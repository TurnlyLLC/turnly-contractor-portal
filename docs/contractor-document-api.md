# Contractor document uploads from Codex / ChatGPT

Existing Full access API keys and OAuth connections include `documents:upload`.
Restricted connections must explicitly receive that scope. `documents:read` alone
does not authorize uploads. No portal session, password, or Supabase key is needed.

1. Read contractors and match the actual profile ID. Check existing documents using
   `turnly_read_documents` with `filters: {profile_id: "UUID"}`; follow pagination.
   Match the report to the person; ask when identity is ambiguous. Unzip batches
   locally and upload individual reports, not the ZIP archive.
2. Calculate the local file's byte size and SHA-256. Call
   `turnly_documents_upload_start` with `confirm: true`, a unique
   `idempotency_key`, and `input` containing `profile_id`, `file_name`,
   `content_type`, `file_size`, `sha256`, `document_type: "background_check"`.
   Optional fields: `title`, `notes`, `expiration_date` (YYYY-MM-DD).
3. If `duplicate: true`, the file is already attached: no transfer is needed.
   Otherwise PUT the raw file bytes to `upload_url` using the returned headers.
   This private, non-overwriting, single-path URL lasts two hours. Do not display
   it, paste it in user-facing chat, or log it. No Authorization header is needed.
4. Call `turnly_documents_upload_complete` with the returned `upload_ticket`,
   `confirm: true`, and a different unique `idempotency_key`. Keep the ticket
   private too. Success returns the document ID and saved status. Verify it with
   `turnly_read_documents` by ID. Never claim an upload succeeded from the PUT alone.

The same actions are available at POST `/api/integration-v2?action=documents.upload_start`
and `documents.upload_complete`, with a saved bearer API key, `Idempotency-Key`
header, and JSON `{ "input": {...}, "confirm": true }`.

PDF, JPEG, PNG and WebP are supported up to 20 MB each. The server verifies byte
size, file signature and SHA-256 before inserting the normal contractor file record.
Identical API uploads to the same contractor use a deterministic document ID,
including across connections and simultaneous requests. Existing documents from
older portal uploads still need the initial record check because they lack checksums.
Existing files, review statuses and onboarding items are never overwritten.

Uploading does not approve a report, declare a background check completed, or
attest that someone reviewed it. The normal admin review workflow remains in place.

## Approving a background check without a portal login

Full access includes `documents:approve`; upload-only and read-only connections
cannot approve. This records the user's review decision, not an automated screening
or hiring decision. The user must explicitly confirm they reviewed and approved
the identified report before the agent sends `reviewed_and_approved: true`.

1. Call `turnly_background_checks_review` with `input.document_id` from the filed
   report. It returns the current document timestamp, background review version,
   and checklist submission ID (which may be null).
2. Call `turnly_background_checks_approve` with `confirm: true`, a unique
   `idempotency_key`, and input containing `document_id`, `expected_updated_at`,
   `background_version`, `expected_submission_id`, `reference`, and
   `reviewed_and_approved: true`. Copy version values exactly from the read.
3. Confirm the returned document status is `approved`, background sync state is
   `synced`, and checklist state is `done`. These changes commit together in one
   database transaction, using the existing background review/history and document
   review functions and the owned app checklist's admin submission format.

The approval requires an existing unexpired background report in private storage,
an active contractor, an active admin-owned connection, and current versions.
Overall contractor approval and unrelated checklist items remain unchanged.
The action records the reviewer and report reference in the existing audit trail.
If another review changes the record, read again rather than overwriting it.
HTTP clients use POST `/api/integration-v2?action=background_checks.approve` with
the same input and idempotency requirements. No Supabase session is issued.

Retry successful actions with their original idempotency keys. If a request's
outcome is uncertain, first inspect the contractor's documents. Failed actions
are blocked from blind replay by the platform; after confirming no record was
attached and correcting the failure, a new completion request may be submitted.
A lost/expired upload ticket can be replaced by starting again with the same file
checksum. Storage `Already Exists` can be followed by completion, which verifies
the bytes before attaching them. Interrupted transfers do not create document rows.
