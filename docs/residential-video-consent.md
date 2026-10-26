# Residential walkthrough videos

Standard and Deep residential templates require before- and after-clean walkthrough videos. New assignments inherit both requirements. The migration adds them to untouched, unstarted assignments linked to those templates; it does not rewrite work already in progress or completed.

In the checklist, **Customer declines video — collect signature** opens a customer-facing signature pad. The customer or an authorized adult enters their name, draws a signature, and affirmatively declines both recordings for this visit. Contractors must not sign for customers. If the customer is unavailable, the contractor should contact Turnly rather than bypass a requirement.

`assignment_video_consents` holds one immutable, timestamped record per assignment, including the consent wording/version, signature strokes, customer name, collecting contractor and assignment snapshot. Creation requires an active, assigned contractor and an eligible job, checked again under a database lock. Only the server endpoint can create records; repeat submissions return the existing record. Portal roles cannot change or delete a signed record.

The customer can see their own signed record under **My Cleans → View details**. Admins see it in the assignment checklist editor. Customer access uses the existing booking-ownership check before loading any signature. Contractor reads require assignment ownership; admin reads require an active admin account.

One signed record automatically satisfies both residential walkthrough video tasks. Database validation blocks QA/completion unless each required video has an assignment-linked QA record and a stored upload, or the assignment has a signed consent record. Commercial video tasks cannot be waived by this feature.

A collected signature is an audit record of the choice presented onsite, not independent identity verification of the person signing. No real customer signatures are created during testing.
