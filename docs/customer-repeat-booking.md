# Customer repeat booking

The customer portal uses the same calendar rules, gift ledger and pricing rates as website booking. Customers review saved dimensions, pets, parking, access and notes. New addresses go to the standard verified booking form. Gift-card purchases begin inside the portal and use the existing Stripe gift checkout and delivery flow.

Returning standard cleans use the maintenance price for monthly, biweekly or weekly plans. The form compares that amount with the same home's one-time standard price. No existing visit is converted or charged automatically by opening the form: the customer chooses the first plan date and explicitly authorizes the displayed price and cadence.

`customer_portal_book_v2` creates the visit, reserves an optional gift card and enrolls the plan in one transaction. The original cleaner is saved as the preference, falling back to the latest completed clean at the same home when needed. Plans and booking RPCs are server-only. Account ownership and idempotency are checked again in PostgreSQL. Only one active/review-needed portal plan per account and address is allowed.

The five-minute residential job cron creates one next visit after the preceding checklist is submitted or the assignment completed. Weekly/biweekly dates advance 7/14 days; monthly dates preserve the original day, clamping short months without permanent drift. Plan pricing stays fixed, and gift credit is not copied to future visits. Each visit enters ordinary admin approval with recurring metadata and preferred-contractor fields. Assignment-level auto-renewal is off to prevent duplicate generation by another scheduler.

If the next date is unavailable or overdue, or the latest visit is cancelled, the plan becomes `needs_review`. Its reason appears in the customer plan and admin booking detail. Turnly should agree on a new next date with the customer before reactivating it. Stopping future plan scheduling does not cancel an already-created visit; customers can manage that visit separately under My cleans.

Validation covers transactional gift rollback, owner isolation, duplicate requests/plans, recurring date calculations, calendar rejection, edited details, original-cleaner preference, fixed future prices and desktop/mobile navigation. Tests use isolated data and mocked checkout; no real customer booking or charge is created by tests.
