# Staff account recovery and registration

## Available flows

- `account.html?mode=forgot`: request a password reset, verify the email callback with Supabase Auth, choose a new password, sign out existing sessions.
- `account.html?mode=create`: create an Auth account, request email verification, and submit a check-in/admin access application. This does not grant a role.
- `account.html?mode=request`: request access for an existing account.
- `account.html?mode=resend`: request another signup verification email.
- `?portal=staff&tab=access`: owner-only request review. Approve a role after verifying the applicant. A verified account can activate immediately; otherwise wait for verification and choose Activate approved access.

Existing users must use password recovery, not recreate their accounts. No existing passwords, roles, participant records, volunteer records or attendance are changed by this release.

## Email setup required before production acceptance

1. In this project's Supabase Authentication email settings, configure a trusted SMTP sender. Enter SMTP credentials only in Supabase, never in repository files, screenshots, or chat.
2. Keep email confirmation enabled and email/password signup enabled. Do not disable verification to work around mail problems.
3. In Authentication URL Configuration, keep the existing site URL and redirect allowlist, and add the exact callback `https://joyyang010-ai.github.io/ehe-checkin/account.html`.
4. Keep the signup and password-reset email templates' standard ConfirmationURL link, with the correct redirect destination. Disable sender link tracking for Auth links.
5. Test with an authorized test mailbox: signup -> verification email -> owner approval -> sign-in. Then request reset -> email link -> new password -> new sign-in. Confirm old password fails. Do not use participant accounts or expose tokens in logs.
6. Only after email delivery and real-user acceptance pass, set `accountEmailReady:true` in public config. This flag controls a setup notice, not authorization.

Supabase's default email sender is restricted to project-team addresses and is not a production mail-delivery solution. No invitation email was sent by this release. The account creation link can be shared; granting roles is always a separate owner decision.

## Security and tests

- Public browser uses the publishable key only; passwords go directly to Supabase Auth over HTTPS, not to application tables.
- Reset credentials are held in page memory, checked by Auth and stripped from the visible URL. They are not copied to local storage or the portal session.
- A verified login is distinct from authorization. User metadata never grants admin privileges. Owner actions use existing `ehe-access` authentication, live-session checks and audit trail.
- Existing access applications are idempotent per active email request. Failed account/application steps are shown separately; success is not shown before an acknowledged API response.
- Synthetic browser tests mock all account mutations. Read-only deployment tests do not send emails, create users, or reset real passwords.

Documentation reviewed: https://supabase.com/docs/guides/auth/passwords and https://supabase.com/docs/guides/auth/auth-smtp
