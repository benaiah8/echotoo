# Supabase Email Setup Guide

If verification emails (sign-up confirmation, password reset) are not being received, follow these steps in your Supabase project dashboard.

## 1. Set Up Custom SMTP (Recommended for Production)

The built-in Supabase email service has **rate limits** and is not meant for production. Emails may not be delivered reliably.

**Path:** Authentication → Email → SMTP Settings (or Notifications → Email → SMTP Settings)

**Steps:**

1. Click **"Set up custom SMTP"**
2. Use a transactional email provider such as:
   - **Resend** (resend.com) – simple, good free tier
   - **SendGrid** (sendgrid.com)
   - **AWS SES** (Amazon Simple Email Service)
   - **Postmark**
3. Enter your SMTP credentials (host, port, username, password) from your provider
4. Save changes

## 2. Enable and Configure Email Templates

**Path:** Authentication → Email (or Notifications → Email) → Templates

**Check:**

- **Confirm sign up** – Must be enabled for sign-up verification emails
- **Reset password** – Must be enabled for forgot-password emails
- **Magic link** – Optional, for passwordless login

Click each template to edit its subject and body. Ensure:

- The confirmation/reset link variable is present (Supabase inserts it automatically in the default templates)
- `{{ .ConfirmationURL }}` or `{{ .Token }}` is used where required

## 3. Verify URL Configuration

**Path:** Authentication → URL Configuration

**Confirm:**

- **Site URL** – Your app’s base URL, e.g. `https://experience-frontend-ten.vercel.app`
- **Redirect URLs** – Include:
  - `https://experience-frontend-ten.vercel.app/auth/callback`
  - `http://localhost:5173/auth/callback` (for local dev)
  - `com.echotoo.app://auth/callback` (for the Capacitor app)

Verification and reset links redirect to these URLs. If they’re missing or wrong, links may fail or not open correctly.

## 4. Check Spam and Promotion Folders

Built-in emails can land in spam or promotion tabs. Ask testers to:

1. Check spam/junk
2. Check promotions (Gmail)
3. Add Supabase’s sender to contacts if possible
4. Mark the email as “Not spam” so future ones go to the inbox

## 5. Confirm Email Provider Settings (Sign In / Providers)

**Path:** Authentication → Providers → Email

Ensure:

- **Enable Email provider** – ON
- **Confirm email** – ON (required for verification flow)

## 6. Test After Changes

1. Sign up with a new email
2. Wait a few minutes
3. Check inbox and spam
4. If using custom SMTP, check your provider’s logs/dashboard for delivery status

## Common Issues

| Issue                    | Possible cause                                              |
| ------------------------ | ----------------------------------------------------------- |
| No email received        | Built-in SMTP rate limit, spam filter, or wrong SMTP config |
| "Invalid redirect URL"   | Redirect URL not in Supabase allowlist                      |
| Email delayed            | Rate limits or slow provider                                |
| Link doesn’t work in app | Deep link (`com.echotoo.app://`) not in Redirect URLs       |

## Quick Checklist

- [ ] Custom SMTP configured (or aware of built-in limits)
- [ ] Confirm sign up template enabled
- [ ] Reset password template enabled (if using forgot password)
- [ ] Site URL and Redirect URLs correct
- [ ] Email provider enabled with “Confirm email” ON
