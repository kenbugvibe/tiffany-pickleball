# Tiffany's Pickleball Court

Booking and owner-operations website for Tiffany's Pickleball Court. The app
uses Next.js, Supabase Auth/Postgres/Storage, Resend, and Vercel.

## Local development

Requirements:

- Node.js 24
- npm 11
- A Supabase project with the migrations in `supabase/migrations/` applied

Create `.env.local` from `.env.example` and supply the local values. Never add
the Supabase service-role key to this project; the app is designed to use the
publishable key plus Row Level Security.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verification

Run these checks before merging or deploying:

```powershell
npm run typecheck
npm run lint
npm run build
```

GitHub Actions runs the same checks for pull requests and pushes to `main`.

## Database migrations

Apply the numbered SQL files in `supabase/migrations/` in order. The latest
migrations remove timed payment holds from court bookings, Open Play, and
Sunday Unli. They also remove the two cron jobs that previously expired holds
and pruned their run history.

Migration `202610070020_receipt_rejected_notification.sql` changes
`review_payment` to return JSON and queue a customer email when Tiffany rejects
a receipt. Apply it before deploying the matching app code, then run
`supabase/tests/receipt_rejected_verification.sql` to confirm it.

Migration `202610070021_reschedule_instead_of_refund.sql` removes refunds. Court
blocks refuse paid bookings until they are rescheduled, cancelled events mark
payments `reschedule_due`, and Money gains a Mark rescheduled action. Existing
`refund_pending` payments become `reschedule_due`. Apply it before deploying
the matching app code, then run
`supabase/tests/reschedule_instead_of_refund_verification.sql`.

Migration `202610070022_security_hardening.sql` limits each customer to 2
unpaid court bookings, 60 days ahead, and 8 paddles. It also blocks direct
payment inserts, adds text length limits, and gives Tiffany a Cancel unpaid
action in the calendar day view. Apply it, then run
`supabase/tests/security_hardening_verification.sql`.

Migration `202610070023_query_performance.sql` speeds up availability, My
Bookings, and Today's revenue, and adds signup indexes. The app depends on its
new functions, so apply it before deploying, then run
`supabase/tests/query_performance_verification.sql`.

Migration `202610080024_customer_cancel_unpaid.sql` lets customers cancel their
own unpaid court bookings from My Bookings. Apply it, then run
`supabase/tests/customer_cancel_unpaid_verification.sql`.

After applying the hold-removal migrations, this query should return no rows:

```sql
select jobname, schedule, active
from cron.job
where jobname in (
  'tiffany-expire-payment-holds',
  'tiffany-prune-cron-history'
)
order by jobname;
```

## Production deployment

1. Import the GitHub repository into Vercel and keep the project root at the
   repository root.
2. Add every variable from `.env.example` to Vercel Production. Use the final
   HTTPS origin for `SITE_URL`, for example `https://book.example.com`.
3. Set the Supabase Auth Site URL to the same production origin.
4. Add the exact production callback URL to Supabase Auth Redirect URLs:
   `https://book.example.com/auth/confirm`.
5. Keep `http://localhost:3000/**` as an additional redirect for local testing.
   If preview auth is required, add the Vercel preview wildcard documented by
   Supabase for the account or team slug.
6. Configure Supabase custom SMTP with a verified sending domain. Confirm SPF,
   DKIM, and DMARC, then test signup confirmation and password reset.
7. Deploy a Vercel preview first. Test customer signup, court booking, Open Play,
   Sunday Unli, receipt upload, owner approval, My Bookings, court blocking,
   marking rescheduled payments, Money filters, and CSV export.
8. Promote the verified preview to production and inspect runtime logs.

### Google and Facebook sign-in

Social provider credentials belong in Supabase Auth, not in Vercel environment
variables or this repository.

For Google, create a Web OAuth client in Google Auth Platform, add the website
origin under Authorized JavaScript origins, and add the Supabase provider
callback shown under Supabase **Authentication > Sign In / Providers > Google**
as an Authorized redirect URI. Add the Google client ID and secret to that
Supabase provider and enable it.

For Facebook, create a Meta developer app with Facebook Login, enable the email
permission, and add the Supabase provider callback shown under Supabase
**Authentication > Sign In / Providers > Facebook** as a Valid OAuth Redirect
URI. Add the Facebook App ID and secret to Supabase and enable the provider.

Both providers use the Supabase callback URL, which has this shape:
`https://<project-ref>.supabase.co/auth/v1/callback`. The app then returns users
to `/auth/confirm`, exchanges the PKCE code, and asks first-time social users for
the Philippine mobile number required for bookings.

Use a dedicated email address for the owner account. Supabase automatically
links OAuth identities that share a verified email, so an owner email must not
also be used for a customer social login. Enable **Manual Linking** in Supabase
Auth settings so the callback can safely detach an accidentally linked Google
or Facebook identity before signing that browser session out.

Do not store API keys, SMTP passwords, database passwords, or owner passwords in
Git. `.env.local` and other local environment files are ignored.

## Production dashboard checklist

- Supabase Auth email confirmation is enabled.
- Supabase custom SMTP sends to addresses outside the project team.
- Supabase Storage bucket and receipt policies are applied.
- The payment-hold cron jobs are gone (the migrations query above returns no rows).
- Vercel Production has all required environment variables.
- `SITE_URL` and Supabase Auth URL settings use the same HTTPS origin.
- The owner account is confirmed and present in `public.admin_users`.
- A real customer flow has been tested on the preview deployment.
