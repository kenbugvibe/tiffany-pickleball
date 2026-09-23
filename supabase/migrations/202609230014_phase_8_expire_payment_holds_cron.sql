-- Phase 8 - release unpaid booking holds automatically.
-- Supabase Cron runs inside Postgres, so the web app does not need a
-- service-role key or a frequently scheduled Vercel Function.

begin;

create extension if not exists pg_cron;

select cron.schedule(
  'tiffany-expire-payment-holds',
  '* * * * *',
  $job$select public.expire_payment_holds();$job$
);

-- pg_cron does not prune its run history automatically. Keep a short window
-- that is still long enough to diagnose recent failures in Supabase Cron.
select cron.schedule(
  'tiffany-prune-cron-history',
  '17 0 * * *',
  $job$
    delete from cron.job_run_details
    where end_time < pg_catalog.now() - interval '7 days';
  $job$
);

commit;
