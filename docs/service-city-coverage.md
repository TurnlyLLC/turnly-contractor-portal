# Service-city coverage

Prepared for Raleigh, Durham, Asheville and Greensboro, NC. Radius is 25 statute miles measured as straight-line distance from the city-center coordinates in `service_cities`. A contractor sees jobs within their assigned city's radius; overlapping city radii may include the same job. Existing atomic claim logic still allows only one contractor to claim it.

## Activation pending

Do not apply the service-city coverage migration or release the dependent application change until the owner approves address-only geocoding through NC OneMap. Automatic approval review rejected sending existing private job addresses to that endpoint. Names, emails, phone numbers, notes and payment data are not included in the lookup.

The HTTP extension was enabled separately; no existing customer addresses have been sent to the geocoder by this update. Tests used public civic addresses or synthetic local fixtures.

After approval:

1. Apply the coverage migration before deploying application code. It verifies distinct existing job addresses and records any failures in `service_private.address_review`. Failed addresses are not exposed to contractors; an administrator must correct them.
2. Inspect the review table and compare verified jobs with current open jobs.
3. Assign missing contractor locations under Contractor Directory → Edit → Service state / Service city, or Contractor File → Job Access. Existing exact city markets are carried over; ambiguous or empty markets remain unassigned.
4. Publish the application, verify a permitted and an out-of-area quote, and check authenticated contractor visibility and claiming.
5. Run database advisors and review only findings introduced by this migration.

## Enforcement

Database triggers validate new or changed service addresses on assignment blocks, residential bookings, residential inquiries, properties, portal properties and sales/commercial leads. Contact-only prospects can remain without an address until a service address is entered. Support inquiries without a service address remain available. Existing record updates that do not change the address preserve notes and workflow history.

The NC state address-point geocoder must return an unambiguous point address with a match score of at least 98. Verification errors stop submission with a correction/retry message. Requests have a 4.5-second timeout; verified coordinates are cached privately for 180 days. Coverage is recalculated against currently active cities. No client-supplied coordinates or city claims are trusted.

Restrictive database policies apply the contractor city boundary even to directly assigned jobs. A trigger also protects security-definer claim/update functions. Only administrators can change a contractor's service city. Existing optional property/region restrictions further narrow access and never expand the city boundary.

Tests cover out-of-area rejection, ambiguous/unverified addresses, 24.999/25.001-mile boundaries, missing contractor locations, overlapping Raleigh/Durham coverage, forged location updates, cross-city access/claims, and preserved admin access.
