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

Retry successful actions with their original idempotency keys. If a request's
outcome is uncertain, first inspect the contractor's documents. Failed actions
are blocked from blind replay by the platform; after confirming no record was
attached and correcting the failure, a new completion request may be submitted.
A lost/expired upload ticket can be replaced by starting again with the same file
checksum. Storage `Already Exists` can be followed by completion, which verifies
the bytes before attaching them. Interrupted transfers do not create document rows.
