# 樂享健康食 · EHE check-in

EHE participant and volunteer check-in portal. Traditional Chinese and English. Frontend release 1.0.1.

## Deployment status

The complete static frontend is in `docs/`. It connects to the existing `ehe-checkin` Supabase project. There are no embedded participant records, staff passwords, service-role keys or demo shifts in the frontend.

**Uploading code is not the same as publishing GitHub Pages.** As checked on 2026-10-13, Pages has not been enabled. Actual browser authentication, outbound email and two-device acceptance testing are still pending. Do not announce the portal as ready for service before those checks pass.

## Enable the website

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source: Deploy from a branch**.
3. Choose **Branch: main** and **Folder: /docs**. Click **Save**.
4. Wait for the Pages build to succeed, then open the address shown by GitHub.

Expected address after publication: `https://joyyang010-ai.github.io/ehe-checkin/`.

Staff entrance: use the **工作人員 / Staff** button, or append `?portal=staff`.

Do not upload spreadsheets, private import JSON, completed surveys, passwords or private keys here. Do not run a database reset: an existing Supabase schema and imported participant records must be preserved.

## Staff access

The website's staff account is separate from the owner's Supabase dashboard login. In the **ehe-checkin project → Authentication → Users**, create the account with the email already on the staff allowlist. Choose the password directly in the Supabase dashboard, and ensure the account's email is confirmed. Never commit or share the password.

The API verifies the signed-in user, a live Supabase session and the staff allowlist before returning private data. Merely changing a page parameter or frontend state does not authorize a request.

Volunteer browsing, shift signup and on-site submissions do not require a password. Name/email are record-matching inputs, not proof of identity; unexpected or duplicate submissions are held for staff review. They cannot be used to read the full roster.

## Email and private booking management

`docs/assets/config.js` intentionally has `emailEnabled: false`. Configure custom SMTP and exact Auth redirect URLs, verify delivery and account access, then enable this flag. Until then, volunteers contact staff for cancellation or profile changes. No email delivery is simulated.

## Existing data and publishing shifts

The existing database was checked without re-importing: 75 participant master records, 3 unpublished course events and 36 session registrations. These are not 36 attendance records. Volunteer profiles from the external Google Sheet have not been imported.

Review event details and publish real shifts with dates, duties and capacity from the staff interface. An empty public shift list is expected until real shifts are published. Do not turn demo dates, names or capacities into real records.

## Checks performed in this release

- JavaScript syntax and local desktop/mobile interface checks.
- Mocked API tests: missing/invalid identity denied, revoked session denied, choices and request validation, request limits, retry-safe staff routing.
- Live PostgreSQL transaction tests with fictional data, rolled back: signup, capacity/waitlist, retry handling, spoken-language arrays, check-in/out and separate feedback, historical attendance without an invented time, independent diary receipts.
- Read-only checks: row-level security enabled, anonymous table reads denied, invalid session rejected. Real records preserved.

These are not an end-to-end production security certification. Remaining acceptance: published asset loading, staff login, a clearly identified test shift, signup → check-in → checkout, another device confirming persistence, denied unauthorized reads, then remove or archive the test records before launch.

## Operational boundaries

Attendance is separate from registration and diary collection. Course diary boxes record receipt only, not health measurements or file uploads. Unknown historical arrival time remains blank. Corrections retain an audit trail.

The Supabase project is on the previously selected plan; this release did not enable any paid upgrade. Review availability, backup and email settings before sustained production use.

## Reference documentation

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
