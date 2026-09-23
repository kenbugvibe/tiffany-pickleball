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

Apply the numbered SQL files in `supabase/migrations/` in order. Phase 8 enables
Supabase Cron and runs `public.expire_payment_holds()` every minute so unpaid
holds stop blocking courts after they expire. It also keeps seven days of cron
run history for troubleshooting.

After applying Phase 8, verify it in the Supabase SQL Editor:

```sql
select jobname, schedule, active
from cron.job
where jobname in (
  'tiffany-expire-payment-holds',
  'tiffany-prune-cron-history'
)
order by jobname;
```

Both rows should return with `active = true`.

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
   refund marking, Money filters, and CSV export.
8. Promote the verified preview to production and inspect runtime logs.

Do not store API keys, SMTP passwords, database passwords, or owner passwords in
Git. `.env.local` and other local environment files are ignored.

## Production dashboard checklist

- Supabase Auth email confirmation is enabled.
- Supabase custom SMTP sends to addresses outside the project team.
- Supabase Storage bucket and receipt policies are applied.
- Phase 8 Supabase Cron jobs are active and recent runs succeed.
- Vercel Production has all required environment variables.
- `SITE_URL` and Supabase Auth URL settings use the same HTTPS origin.
- The owner account is confirmed and present in `public.admin_users`.
- A real customer flow has been tested on the preview deployment.
