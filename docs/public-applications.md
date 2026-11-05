# Public application URL

The canonical application page is https://turnlypros.com/apply.html in the TurnlyLLC/TurnlyPros.com repository. Its form, JavaScript, stylesheet and logo live in that repository. Update that source for future form changes.

This portal retains the applicants API and hiring workflow. The public website proxies `/api/applicants` to this portal's API. Applicant validation, resume upload, application records, thank-you email and ambassador enrollment are unchanged.

The portal's `/apply.html` and `/apply` routes redirect through `api/apply-redirect.js`, preserving query parameters such as `role=cleaner`, `role=brand_ambassador` and source tracking. `apply.html` is a fallback redirect, not a second copy of the application form.
